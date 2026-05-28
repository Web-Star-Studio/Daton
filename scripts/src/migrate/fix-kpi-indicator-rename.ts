/**
 * One-shot: conserta os 5 indicadores em prod (Transportes Gabardo) cujos
 * `inputs` ficaram com chaves órfãs depois de edições históricas de
 * fórmula que renomearam variáveis sem migrar os lançamentos antigos.
 *
 * Pra cada indicador:
 *  1. Aplica o mapeamento hardcoded (oldKey → newKey) em `inputs` de todos
 *     os lançamentos do indicador.
 *  2. Reavalia a fórmula atual com os inputs migrados.
 *  3. Atualiza `value` e `inputs` em transação.
 *
 * Reusa a mesma política do helper `formula-rename`:
 *  - só renomeia se `from` existe e `to` ainda não existe (proteção contra
 *    colisão);
 *  - se a fórmula nova retornar null mesmo com inputs migrados, preserva
 *    o valor antigo (guard de NULL).
 *
 * Dry-run por padrão. --apply pra gravar. Dump JSON em /tmp pra rollback.
 *
 * Uso:
 *   pnpm --filter @workspace/scripts fix-kpi-indicator-rename
 *   pnpm --filter @workspace/scripts fix-kpi-indicator-rename -- --apply
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  db,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiYearConfigsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

// ─── Mini evaluator (espelha artifacts/api-server/src/lib/formula-evaluator) ─
type Token =
  | { type: "num"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" };
const OP_PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (c === "(") { tokens.push({ type: "lparen" }); i++; continue; }
    if (c === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ type: "op", value: c }); i++; continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < expr.length && ((expr[j] >= "0" && expr[j] <= "9") || expr[j] === "." || expr[j] === ",")) j++;
      const raw = expr.slice(i, j).replace(",", ".");
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`Número inválido: "${raw}"`);
      tokens.push({ type: "num", value: n });
      i = j; continue;
    }
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
      let j = i;
      while (
        j < expr.length &&
        ((expr[j] >= "a" && expr[j] <= "z") ||
          (expr[j] >= "A" && expr[j] <= "Z") ||
          (expr[j] >= "0" && expr[j] <= "9") ||
          expr[j] === "_")
      ) j++;
      tokens.push({ type: "id", value: expr.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    throw new Error(`Caractere inválido: "${c}"`);
  }
  return tokens;
}
function toRpn(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const ops: Token[] = [];
  for (const t of tokens) {
    if (t.type === "num" || t.type === "id") out.push(t);
    else if (t.type === "op") {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.type === "op" && OP_PRECEDENCE[top.value] >= OP_PRECEDENCE[t.value]) out.push(ops.pop()!);
        else break;
      }
      ops.push(t);
    } else if (t.type === "lparen") ops.push(t);
    else if (t.type === "rparen") {
      while (ops.length > 0 && ops[ops.length - 1].type !== "lparen") out.push(ops.pop()!);
      if (ops.length === 0) throw new Error("Parêntese fechado sem abertura");
      ops.pop();
    }
  }
  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === "lparen") throw new Error("Parêntese aberto sem fechamento");
    out.push(top);
  }
  return out;
}
function evalRpn(rpn: Token[], inputs: Record<string, number | null>): number | null {
  const stack: (number | null)[] = [];
  for (const t of rpn) {
    if (t.type === "num") stack.push(t.value);
    else if (t.type === "id") {
      const v = inputs[t.value];
      stack.push(v === undefined ? null : v);
    } else if (t.type === "op") {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Expressão malformada");
      if (a === null || b === null) { stack.push(null); continue; }
      if (t.value === "+") stack.push(a + b);
      else if (t.value === "-") stack.push(a - b);
      else if (t.value === "*") stack.push(a * b);
      else if (t.value === "/") stack.push(b === 0 ? null : a / b);
    }
  }
  if (stack.length !== 1) throw new Error("Expressão malformada");
  return stack[0]!;
}
function evaluateFormula(expression: string, inputs: Record<string, number | null>): number | null {
  const trimmed = expression.trim();
  if (!trimmed) return null;
  try {
    const rpn = toRpn(tokenize(trimmed));
    const normalized: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(inputs)) normalized[k.toLowerCase()] = v;
    const result = evalRpn(rpn, normalized);
    if (result === null) return null;
    if (!Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

// ─── Mapeamento dos 5 indicadores (Transportes Gabardo, org=2) ─────────────
// Determinado por inspeção do estado atual do banco em 2026-05-28.
// Cada entrada: id do indicador → todos os renames já realizados na história
// daquele indicador, ordenados do mais recente pro mais antigo. Inputs antigos
// podem refletir qualquer geração; o migrador percorre todos os pares e
// migra o `from` que existir no JSON.
const INDICATOR_RENAMES: Record<number, Array<{ from: string; to: string }>> = {
  // Orgânico: 1 geração → volume_gerado_mensalmente
  91: [{ from: "volume_gerado", to: "volume_gerado_mensalmente" }],

  // Material Reciclável: 2 gerações → atual = volume_gerado_mensalmente
  77: [
    { from: "volume_gerado", to: "volume_gerado_mensalmente" },
    { from: "valor_reciclavel", to: "volume_gerado_mensalmente" },
  ],

  // Material contaminado: 2 gerações → atual = volume_gerado_mensalmente
  84: [
    { from: "volume_gerado", to: "volume_gerado_mensalmente" },
    { from: "volume", to: "volume_gerado_mensalmente" },
  ],

  // Óleo Usado: 2 gerações → atual = volume_gerado_mensalmente
  98: [
    { from: "volume_gerado", to: "volume_gerado_mensalmente" },
    { from: "volume", to: "volume_gerado_mensalmente" },
  ],

  // Taxa de Acidentes de Trabalho - Anápolis: 2 vars renomeadas
  52: [
    { from: "acidentes_trabalho", to: "numero_de_acidentes_de_trabalho" },
    {
      from: "funcionarios_ativos",
      to: "funcionarios_ativos_no_cadastro_da_matriz_no_mes",
    },
  ],
};

function migrateInputs(
  inputs: Record<string, number | null>,
  renames: Array<{ from: string; to: string }>,
): { migrated: Record<string, number | null>; changed: boolean } {
  if (renames.length === 0) return { migrated: inputs, changed: false };
  const migrated: Record<string, number | null> = { ...inputs };
  let changed = false;
  for (const { from, to } of renames) {
    if (from in migrated && !(to in migrated)) {
      migrated[to] = migrated[from];
      delete migrated[from];
      changed = true;
    }
  }
  return { migrated, changed };
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");

type Plan = {
  indicatorId: number;
  indicatorName: string;
  monthlyValueId: number;
  year: number;
  month: number;
  oldInputs: Record<string, number | null>;
  newInputs: Record<string, number | null>;
  oldValue: number | null;
  newValue: number | null;
  valuePreserved: boolean;
};

async function main() {
  const plans: Plan[] = [];

  for (const [idStr, renames] of Object.entries(INDICATOR_RENAMES)) {
    const indicatorId = Number(idStr);
    const [ind] = await db
      .select()
      .from(kpiIndicatorsTable)
      .where(eq(kpiIndicatorsTable.id, indicatorId));
    if (!ind) {
      console.warn(`! Indicador #${indicatorId} não encontrado, pulando`);
      continue;
    }

    const ycs = await db
      .select({ id: kpiYearConfigsTable.id, year: kpiYearConfigsTable.year })
      .from(kpiYearConfigsTable)
      .where(and(
        eq(kpiYearConfigsTable.organizationId, ind.organizationId),
        eq(kpiYearConfigsTable.indicatorId, ind.id),
      ));
    if (ycs.length === 0) continue;
    const yearByConfig = new Map(ycs.map((y) => [y.id, y.year]));

    const mvs = await db
      .select()
      .from(kpiMonthlyValuesTable)
      .where(inArray(kpiMonthlyValuesTable.yearConfigId, ycs.map((y) => y.id)));

    for (const mv of mvs) {
      const oldInputs = (mv.inputs ?? {}) as Record<string, number | null>;
      if (Object.keys(oldInputs).length === 0) continue;
      const { migrated, changed } = migrateInputs(oldInputs, renames);
      if (!changed) continue; // nada a fazer (chaves já estão certas, raro)

      const recomputed = evaluateFormula(ind.formulaExpression, migrated);
      const newValue =
        recomputed !== null && Number.isFinite(recomputed) ? recomputed : null;
      const oldValue = mv.value !== null ? parseFloat(mv.value) : null;
      // Guard: se a fórmula atual ainda retorna null (mesmo migrado), preserva
      // o valor antigo. Não deveria acontecer pros 5 mapeados, mas é a regra.
      const valuePreserved = newValue === null && oldValue !== null;

      plans.push({
        indicatorId: ind.id,
        indicatorName: ind.name,
        monthlyValueId: mv.id,
        year: yearByConfig.get(mv.yearConfigId) ?? 0,
        month: mv.month,
        oldInputs,
        newInputs: migrated,
        oldValue,
        newValue,
        valuePreserved,
      });
    }
  }

  console.log(`Lançamentos com renames a aplicar: ${plans.length}`);
  if (plans.length === 0) {
    console.log("Nada a fazer. ✅");
    return;
  }

  const byIndicator = new Map<number, Plan[]>();
  for (const p of plans) {
    if (!byIndicator.has(p.indicatorId)) byIndicator.set(p.indicatorId, []);
    byIndicator.get(p.indicatorId)!.push(p);
  }
  for (const [indId, list] of byIndicator) {
    const sample = list[0];
    console.log(`\n  #${indId} "${sample.indicatorName}" → ${list.length} célula(s)`);
    for (const p of list.slice(0, 6)) {
      const tag = p.valuePreserved ? " [value preservado]" : "";
      console.log(
        `    ${p.year}/${String(p.month).padStart(2, "0")}: value ${p.oldValue ?? "—"} → ${p.newValue ?? "—"}${tag}`,
      );
      console.log(`      inputs: ${JSON.stringify(p.oldInputs)} → ${JSON.stringify(p.newInputs)}`);
    }
    if (list.length > 6) console.log(`    ... +${list.length - 6} mais`);
  }

  const dumpPath = join(
    tmpdir(),
    `kpi-rename-fix-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    dumpPath,
    JSON.stringify({ plans, scannedAt: new Date().toISOString() }, null, 2),
  );
  console.log(`\nDump salvo em: ${dumpPath}`);

  if (!apply) {
    console.log("Dry-run. Use --apply pra gravar.");
    return;
  }

  console.log("\nAplicando...");
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const p of plans) {
      const newValueStr =
        !p.valuePreserved && p.newValue !== null ? String(p.newValue) : null;
      const setPayload: {
        value?: string | null;
        inputs: Record<string, number | null>;
        updatedAt: Date;
      } = { inputs: p.newInputs, updatedAt: now };
      if (!p.valuePreserved) setPayload.value = newValueStr;
      await tx
        .update(kpiMonthlyValuesTable)
        .set(setPayload)
        .where(eq(kpiMonthlyValuesTable.id, p.monthlyValueId));
    }
  });
  console.log(`✅ ${plans.length} célula(s) atualizada(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
