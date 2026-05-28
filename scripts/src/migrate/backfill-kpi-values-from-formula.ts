/**
 * One-shot: recalcula `value` de todos os `kpi_monthly_values` cujo `inputs`
 * está populado, aplicando a `formulaExpression` atual do indicador. Conserta
 * a base de produção depois de edições históricas de fórmula que não
 * repropagavam pros valores já gravados (sintoma: histórico mostra um número,
 * "Resultado" recalculado na tela de Lançar mostra outro).
 *
 * Não destrutivo:
 *  - só toca células com `inputs` não vazio E indicador com fórmula válida;
 *  - células de entrada direta (sem `inputs`) ficam intocadas;
 *  - rolling-up de pais (rollupStrategy != null) é compute-on-read no runtime,
 *    então não precisa rodar aqui — pulamos esses indicadores;
 *  - dry-run por padrão; --apply pra escrever no banco.
 *
 * Uso:
 *   pnpm --filter @workspace/scripts backfill-kpi-values-from-formula
 *   pnpm --filter @workspace/scripts backfill-kpi-values-from-formula -- --apply
 *   pnpm --filter @workspace/scripts backfill-kpi-values-from-formula -- --org 42
 *   pnpm --filter @workspace/scripts backfill-kpi-values-from-formula -- --org 42 --apply
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
// Cópia local porque `rootDir` do tsconfig isola scripts/ dos outros pacotes.
// Mantém apenas o necessário pra reavaliar expressões já validadas.
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
    if (t.type === "num" || t.type === "id") {
      out.push(t);
    } else if (t.type === "op") {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.type === "op" && OP_PRECEDENCE[top.value] >= OP_PRECEDENCE[t.value]) {
          out.push(ops.pop()!);
        } else break;
      }
      ops.push(t);
    } else if (t.type === "lparen") {
      ops.push(t);
    } else if (t.type === "rparen") {
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

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const orgArgIdx = args.indexOf("--org");
const orgFilter =
  orgArgIdx >= 0 && args[orgArgIdx + 1] ? Number(args[orgArgIdx + 1]) : null;

type Plan = {
  indicatorId: number;
  indicatorName: string;
  organizationId: number;
  monthlyValueId: number;
  year: number;
  month: number;
  oldValue: number | null;
  newValue: number | null;
};

async function main() {
  const indicatorsQuery = orgFilter !== null
    ? db.select().from(kpiIndicatorsTable).where(eq(kpiIndicatorsTable.organizationId, orgFilter))
    : db.select().from(kpiIndicatorsTable);
  const indicators = await indicatorsQuery;

  const candidates = indicators.filter((ind) => {
    if (ind.rollupStrategy) return false; // compute-on-read no runtime
    if (!ind.formulaExpression || !ind.formulaExpression.trim()) return false;
    return true;
  });

  console.log(
    `Indicadores candidatos: ${candidates.length} (de ${indicators.length} totais)`,
  );

  const plans: Plan[] = [];
  const preserved: Plan[] = [];
  let scanned = 0;

  for (const ind of candidates) {
    const yearConfigs = await db
      .select({ id: kpiYearConfigsTable.id, year: kpiYearConfigsTable.year })
      .from(kpiYearConfigsTable)
      .where(and(
        eq(kpiYearConfigsTable.organizationId, ind.organizationId),
        eq(kpiYearConfigsTable.indicatorId, ind.id),
      ));
    if (yearConfigs.length === 0) continue;

    const yearByConfigId = new Map(yearConfigs.map((yc) => [yc.id, yc.year]));
    const yearConfigIds = yearConfigs.map((yc) => yc.id);
    const monthlyRows = await db
      .select()
      .from(kpiMonthlyValuesTable)
      .where(inArray(kpiMonthlyValuesTable.yearConfigId, yearConfigIds));

    for (const mv of monthlyRows) {
      scanned++;
      const inputs = mv.inputs ?? {};
      if (Object.keys(inputs).length === 0) continue;

      const recomputed = evaluateFormula(ind.formulaExpression, inputs);
      const newValue =
        recomputed !== null && Number.isFinite(recomputed) ? recomputed : null;
      const oldValue = mv.value !== null ? parseFloat(mv.value) : null;

      // Compara em ponto-flutuante respeitando o scale do DB (4 casas).
      const same =
        oldValue === null && newValue === null
          ? true
          : oldValue !== null && newValue !== null
            ? Math.abs(oldValue - newValue) < 1e-5
            : false;
      if (same) continue;

      // Guard de NULL: NÃO apaga `value` existente quando a fórmula nova
      // não consegue avaliar a partir dos `inputs` antigos (rename de variável
      // entre saves). Preserva o número que o usuário vê hoje no histórico.
      // O `inputs` original continua intacto pra recuperação manual.
      if (oldValue !== null && newValue === null) {
        preserved.push({
          indicatorId: ind.id,
          indicatorName: ind.name,
          organizationId: ind.organizationId,
          monthlyValueId: mv.id,
          year: yearByConfigId.get(mv.yearConfigId) ?? 0,
          month: mv.month,
          oldValue,
          newValue: null,
        });
        continue;
      }

      plans.push({
        indicatorId: ind.id,
        indicatorName: ind.name,
        organizationId: ind.organizationId,
        monthlyValueId: mv.id,
        year: yearByConfigId.get(mv.yearConfigId) ?? 0,
        month: mv.month,
        oldValue,
        newValue,
      });
    }
  }

  console.log(`Células escaneadas: ${scanned}`);
  console.log(`Divergências a aplicar: ${plans.length}`);
  console.log(
    `Células preservadas (guard de NULL — fórmula nova não bate com inputs antigos): ${preserved.length}`,
  );

  // Relatório dos preservados (sempre, mesmo em dry-run)
  if (preserved.length > 0) {
    const byIndPres = new Map<number, Plan[]>();
    for (const p of preserved) {
      if (!byIndPres.has(p.indicatorId)) byIndPres.set(p.indicatorId, []);
      byIndPres.get(p.indicatorId)!.push(p);
    }
    console.log("\n──── Preservadas (não serão tocadas) ────");
    for (const [indId, list] of byIndPres) {
      const sample = list[0];
      console.log(
        `  org=${sample.organizationId} #${indId} "${sample.indicatorName}" → ${list.length} célula(s) (rename de variável; inputs antigos não batem com a fórmula nova)`,
      );
    }
  }

  if (plans.length === 0) {
    console.log("\nNenhuma divergência aplicável. ✅");
    return;
  }

  // Agrupa por indicador pro relatório
  const byIndicator = new Map<number, Plan[]>();
  for (const p of plans) {
    if (!byIndicator.has(p.indicatorId)) byIndicator.set(p.indicatorId, []);
    byIndicator.get(p.indicatorId)!.push(p);
  }
  console.log("\n──── A aplicar ────");
  for (const [indId, list] of byIndicator) {
    const sample = list[0];
    console.log(
      `\n  org=${sample.organizationId} #${indId} "${sample.indicatorName}" → ${list.length} célula(s)`,
    );
    for (const p of list.slice(0, 5)) {
      console.log(
        `    ${p.year}/${String(p.month).padStart(2, "0")}: ${p.oldValue ?? "—"} → ${p.newValue ?? "—"}`,
      );
    }
    if (list.length > 5) console.log(`    ... +${list.length - 5} mais`);
  }

  // Dump JSON sempre (dry-run e apply) — vira backup manual / referência.
  const dumpPath = join(
    tmpdir(),
    `kpi-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    dumpPath,
    JSON.stringify({ plans, preserved, scannedAt: new Date().toISOString() }, null, 2),
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
      const newValueStr = p.newValue !== null ? String(p.newValue) : null;
      await tx
        .update(kpiMonthlyValuesTable)
        .set({ value: newValueStr, updatedAt: now })
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
