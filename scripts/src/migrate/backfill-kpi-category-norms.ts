/**
 * Backfill de `category` + `norms` dos indicadores KPI de uma organização,
 * derivados do NOME de cada indicador.
 *
 * NÃO destrutivo:
 *  - só preenche indicadores cuja `category` ainda está vazia;
 *  - nunca cria nem remove indicadores;
 *  - nunca altera nome, fórmula, metas ou valores.
 *
 * Uso:
 *   backfill-kpi-category-norms                 → lista as organizações
 *   backfill-kpi-category-norms <orgId>         → dry-run (só mostra o plano)
 *   backfill-kpi-category-norms <orgId> --apply → aplica de verdade
 */
import { db, kpiIndicatorsTable, organizationsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";

type Category =
  | "Qualidade"
  | "Ambiental"
  | "Seg. Viária"
  | "RH"
  | "Frota"
  | "Financeiro";

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Palavras-chave por categoria, testadas nesta ordem de prioridade.
const RULES: { category: Category; keywords: string[] }[] = [
  {
    category: "Ambiental",
    keywords: [
      "agua", "energia", "eletric", "residuo", "reciclav", "contaminad",
      "organic", "oleo", "emissao", "co2", "tco2", "gee", "efluente",
      "opacidade", "ambiental", "despoluir", "ringelmann", "poluente",
    ],
  },
  {
    // Acidente "de trabalho" é SST / pessoas (taxa por nº de funcionários) —
    // precede "Seg. Viária" para não casar apenas com a palavra "acidente".
    category: "RH",
    keywords: [
      "acidente de trabalho", "acidentes de trabalho", "treinamento",
      "turnover", "recrutamento", "selecao", "colaborador", "absenteismo",
      "capacitacao", "funcionario", "admiss",
    ],
  },
  {
    category: "Seg. Viária",
    keywords: [
      "transito", "sinistro", "viagem", "velocidade", "viaria", "viario",
      "acidente", "brigada", "emergencia", "colisao",
    ],
  },
  {
    category: "Frota",
    keywords: [
      "combustivel", "pneu", "manutencao", "frota", "diesel", "idade media",
      "veiculo",
    ],
  },
  {
    category: "Financeiro",
    keywords: [
      "custo", "faturamento", "receita", "financeiro", "despesa", "margem",
      "lucro", "ebitda",
    ],
  },
  {
    category: "Qualidade",
    keywords: [
      "avaria", "prazo", "entrega", "satisfacao", "estoque", "acuracidade",
      "qualidade", "conformidade", "reclamacao", "s.p.u", "spu", "glovis",
    ],
  },
];

function deriveCategory(name: string): { category: Category; matched: boolean } {
  const n = normalize(name);
  for (const rule of RULES) {
    if (rule.keywords.some((k) => n.includes(k))) {
      return { category: rule.category, matched: true };
    }
  }
  return { category: "Qualidade", matched: false }; // padrão quando nada casa
}

function deriveNorms(category: Category): string[] {
  if (category === "Ambiental") return ["14001"];
  if (category === "Seg. Viária") return ["9001", "39001"];
  return ["9001"];
}

async function listOrgs() {
  const orgs = await db.select().from(organizationsTable);
  console.log("Organizações:");
  for (const o of orgs) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(kpiIndicatorsTable)
      .where(eq(kpiIndicatorsTable.organizationId, o.id));
    console.log(`  id=${o.id}  ${o.name}  (${n} indicadores KPI)`);
  }
  console.log("\nUso: backfill-kpi-category-norms <orgId> [--apply]");
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const orgArg = args.find((a) => !a.startsWith("--"));

  if (!orgArg) {
    await listOrgs();
    process.exit(0);
  }

  const orgId = Number(orgArg);
  if (!Number.isInteger(orgId)) throw new Error(`Org id inválido: ${orgArg}`);

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  if (!org) throw new Error(`Organização ${orgId} não encontrada`);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(kpiIndicatorsTable)
    .where(eq(kpiIndicatorsTable.organizationId, orgId));

  // Só indicadores ainda sem categoria — nunca sobrescreve escolha do cliente.
  const pending = await db
    .select()
    .from(kpiIndicatorsTable)
    .where(
      and(
        eq(kpiIndicatorsTable.organizationId, orgId),
        isNull(kpiIndicatorsTable.category),
      ),
    );

  console.log(`Org: ${org.name} (id=${orgId})`);
  console.log(
    `Indicadores KPI: ${total} · sem categoria: ${pending.length} · ${apply ? "MODO: APLICAR" : "MODO: dry-run"}\n`,
  );

  if (pending.length === 0) {
    console.log("Nada a preencher — todos os indicadores já têm categoria.");
    process.exit(0);
  }

  const plan = pending.map((ind) => {
    const { category, matched } = deriveCategory(ind.name);
    return { ind, category, norms: deriveNorms(category), matched };
  });

  const byCat = new Map<Category, typeof plan>();
  for (const p of plan) {
    const list = byCat.get(p.category) ?? [];
    list.push(p);
    byCat.set(p.category, list);
  }
  for (const [cat, items] of byCat) {
    console.log(`■ ${cat}  (${items.length}) — normas: ${deriveNorms(cat).join(", ")}`);
    for (const it of items) {
      console.log(
        `   ${it.matched ? " " : "?"} ${it.ind.name}${it.ind.unit ? `  ·  ${it.ind.unit}` : ""}`,
      );
    }
  }
  const guesses = plan.filter((p) => !p.matched).length;
  console.log(
    `\n${plan.length} indicadores serão categorizados` +
      (guesses > 0
        ? ` — ${guesses} caíram no padrão "Qualidade" (marcados com "?", revise).`
        : "."),
  );

  if (!apply) {
    console.log(
      '\n*** DRY-RUN — nada foi gravado. Rode de novo com --apply para aplicar. ***',
    );
    process.exit(0);
  }

  let updated = 0;
  for (const p of plan) {
    await db
      .update(kpiIndicatorsTable)
      .set({ category: p.category, norms: p.norms })
      .where(
        and(
          eq(kpiIndicatorsTable.id, p.ind.id),
          isNull(kpiIndicatorsTable.category),
        ),
      );
    updated += 1;
  }
  console.log(`\n✓ Aplicado: ${updated} indicadores atualizados (category + norms).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
