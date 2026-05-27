/**
 * Seed de demo do módulo KPI especificamente para a org datondemo.
 *
 * Propósito: criar uma massa de dados realista que exercite a feature de
 * "Corporativos via clusters" (PR #62). Foco:
 *
 * - 5 filiais (Matriz Curitiba + 4 filiais)
 * - 4 CLUSTERS detectáveis pela heurística, com variáveis intencionalmente
 *   com NOMES DIFERENTES entre filiais (testa o caso edge crítico que a
 *   Ana levantou: "as variáveis podem ter nomes diferentes mas o cálculo é
 *   o mesmo"):
 *
 *   1. Avarias por mil transportados (4 filiais)
 *      vars variam: avarias/ocorrencias_avaria/qtd_avarias/incidentes ×
 *                   transportados/qtd_transportado/total_transp/volume
 *
 *   2. Acidentes por mil km (3 filiais)
 *      vars variam: acidentes/total_acidentes/sinistros ×
 *                   km_rodados/km_totais/distancia_km
 *
 *   3. Pontualidade de entrega % (5 filiais)
 *      vars variam: entregas_no_prazo/entregas_pontuais/ctes_no_prazo/...
 *
 *   4. Tempo médio de entrega minutos (2 filiais)
 *      vars variam: soma_tempos/total_tempo × qtd_pedidos/num_pedidos
 *
 * - 3 indicadores ISOLADOS (sem par) — testa que a heurística NÃO junta
 *   coisas diferentes
 *
 * - 1 Corporativo já configurado (Tempo Médio de Entrega — Corporativo)
 *   agrega o cluster 4 → tab "Já configurados" não vem vazia, e os filhos
 *   somem da seção "Sugestões" (filtro lockedChildIds funcionando)
 *
 * Idempotência: TODOS os indicadores criados aqui têm o sufixo " [DEMO]"
 * no nome. Antes de inserir, remove todos com esse sufixo (e suas cascade
 * dependencies via FK on delete cascade). Cria filiais idempotente por
 * nome.
 *
 * Run:
 *   pnpm --filter @workspace/scripts exec tsx src/seed-datondemo-kpi-demo.ts
 *
 * Target: localiza org pela email do owner. Default: datondemo@gmail.com
 */
import {
  db,
  organizationsTable,
  usersTable,
  unitsTable,
  kpiIndicatorsTable,
  kpiYearConfigsTable,
  kpiMonthlyValuesTable,
  kpiIndicatorRollupsTable,
  type KpiFormulaVariable,
} from "@workspace/db";
import { and, eq, like, sql } from "drizzle-orm";

const TARGET_EMAIL = process.env.SEED_TARGET_EMAIL || "datondemo@gmail.com";
const DEMO_SUFFIX = " [DEMO]";
const YEAR = new Date().getFullYear();

// ─── Filiais ──────────────────────────────────────────────────────────────

const FILIAIS: Array<{ name: string; cnpj?: string }> = [
  { name: "Matriz - Curitiba" },
  { name: "Filial - São Paulo" },
  { name: "Filial - Rio de Janeiro" },
  { name: "Filial - Belo Horizonte" },
  { name: "Filial - Anápolis" },
];

// ─── Definição dos indicadores ────────────────────────────────────────────

interface IndicatorDef {
  name: string;             // será sufixado com " [DEMO]"
  unit: string;             // nome da filial (ou "Corporativo")
  measurement: string;
  measureUnit: string;
  direction: "up" | "down";
  periodicity: string;
  formulaExpression: string;
  formulaVariables: KpiFormulaVariable[];
  goal: number | null;
  /** valores mensais Jan–Dez do ano corrente (null = sem dado) */
  values: (number | null)[];
}

const N = null;

// ─── Cluster 1: Avarias por mil transportados ────────────────────────────
// 4 filiais, nomes de variáveis VARIAM entre membros (objetivo: testar
// que a heurística normaliza forma da fórmula, independente do nome)

const CLUSTER_AVARIAS: IndicatorDef[] = [
  {
    name: "Avarias por mil transportados - Curitiba",
    unit: "Matriz - Curitiba",
    measurement: "(Avarias / Transportados) × 1000",
    measureUnit: "‰",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "avarias / transportados * 1000",
    formulaVariables: [
      { key: "avarias", label: "Avarias" },
      { key: "transportados", label: "Transportados" },
    ],
    goal: 1.5,
    values: [1.2, 1.5, 1.1, 0.9, 1.3, 1.4, N, N, N, N, N, N],
  },
  {
    name: "Avarias por mil veículos - São Paulo",
    unit: "Filial - São Paulo",
    measurement: "(Ocorrências de avaria / Total transportado) × 1000",
    measureUnit: "‰",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "ocorrencias_avaria / qtd_transportado * 1000",
    formulaVariables: [
      { key: "ocorrencias_avaria", label: "Ocorrências de Avaria" },
      { key: "qtd_transportado", label: "Quantidade Transportada" },
    ],
    goal: 1.5,
    values: [1.8, 1.6, 1.4, 2.1, 1.5, 1.7, N, N, N, N, N, N],
  },
  {
    name: "Avarias por mil unidades - Rio de Janeiro",
    unit: "Filial - Rio de Janeiro",
    measurement: "(Qtd. avarias / Total transp.) × 1000",
    measureUnit: "‰",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "qtd_avarias / total_transp * 1000",
    formulaVariables: [
      { key: "qtd_avarias", label: "Qtd. Avarias" },
      { key: "total_transp", label: "Total Transp." },
    ],
    goal: 1.5,
    values: [2.4, 2.1, 1.9, 1.7, 1.8, 1.6, N, N, N, N, N, N],
  },
  {
    name: "Avarias por mil cargas - Belo Horizonte",
    unit: "Filial - Belo Horizonte",
    measurement: "(Incidentes / Volume) × 1000",
    measureUnit: "‰",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "incidentes / volume * 1000",
    formulaVariables: [
      { key: "incidentes", label: "Incidentes" },
      { key: "volume", label: "Volume" },
    ],
    goal: 1.5,
    values: [0.9, 1.1, 0.8, 1.2, 1.0, 1.3, N, N, N, N, N, N],
  },
];

// ─── Cluster 2: Acidentes por mil km ─────────────────────────────────────

const CLUSTER_ACIDENTES: IndicatorDef[] = [
  {
    name: "Acidentes por mil km - Curitiba",
    unit: "Matriz - Curitiba",
    measurement: "(Acidentes / Km rodados) × 1000",
    measureUnit: "‰",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "acidentes / km_rodados * 1000",
    formulaVariables: [
      { key: "acidentes", label: "Acidentes" },
      { key: "km_rodados", label: "Km Rodados" },
    ],
    goal: 0.5,
    values: [0.3, 0.4, 0.2, 0.3, 0.5, 0.4, N, N, N, N, N, N],
  },
  {
    name: "Acidentes por mil km - São Paulo",
    unit: "Filial - São Paulo",
    measurement: "(Total acidentes / Km totais) × 1000",
    measureUnit: "‰",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "total_acidentes / km_totais * 1000",
    formulaVariables: [
      { key: "total_acidentes", label: "Total Acidentes" },
      { key: "km_totais", label: "Km Totais" },
    ],
    goal: 0.5,
    values: [0.6, 0.5, 0.7, 0.4, 0.5, 0.6, N, N, N, N, N, N],
  },
  {
    name: "Acidentes por mil km - Anápolis",
    unit: "Filial - Anápolis",
    measurement: "(Sinistros / Distância km) × 1000",
    measureUnit: "‰",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "sinistros / distancia_km * 1000",
    formulaVariables: [
      { key: "sinistros", label: "Sinistros" },
      { key: "distancia_km", label: "Distância (km)" },
    ],
    goal: 0.5,
    values: [0.2, 0.3, 0.1, 0.4, 0.2, 0.3, N, N, N, N, N, N],
  },
];

// ─── Cluster 3: Pontualidade de entrega % ────────────────────────────────

const CLUSTER_PONTUALIDADE: IndicatorDef[] = [
  {
    name: "Pontualidade de Entrega - Curitiba",
    unit: "Matriz - Curitiba",
    measurement: "(Entregas no prazo / Total entregas) × 100",
    measureUnit: "%",
    direction: "up",
    periodicity: "monthly",
    formulaExpression: "entregas_no_prazo / total_entregas * 100",
    formulaVariables: [
      { key: "entregas_no_prazo", label: "Entregas no Prazo" },
      { key: "total_entregas", label: "Total de Entregas" },
    ],
    goal: 95.0,
    values: [96.5, 97.2, 95.8, 98.1, 96.9, 97.5, N, N, N, N, N, N],
  },
  {
    name: "Pontualidade de Entrega - São Paulo",
    unit: "Filial - São Paulo",
    measurement: "(Entregas pontuais / Qtd. entregas) × 100",
    measureUnit: "%",
    direction: "up",
    periodicity: "monthly",
    formulaExpression: "entregas_pontuais / qtd_entregas * 100",
    formulaVariables: [
      { key: "entregas_pontuais", label: "Entregas Pontuais" },
      { key: "qtd_entregas", label: "Qtd. Entregas" },
    ],
    goal: 95.0,
    values: [94.2, 93.5, 95.1, 94.8, 96.0, 95.3, N, N, N, N, N, N],
  },
  {
    name: "Pontualidade de Entrega - Rio de Janeiro",
    unit: "Filial - Rio de Janeiro",
    measurement: "(CT-es no prazo / Total CT-es) × 100",
    measureUnit: "%",
    direction: "up",
    periodicity: "monthly",
    formulaExpression: "ctes_no_prazo / total_ctes * 100",
    formulaVariables: [
      { key: "ctes_no_prazo", label: "CT-es no Prazo" },
      { key: "total_ctes", label: "Total CT-es" },
    ],
    goal: 95.0,
    values: [92.1, 91.8, 93.4, 94.0, 93.7, 94.5, N, N, N, N, N, N],
  },
  {
    name: "Pontualidade de Entrega - Belo Horizonte",
    unit: "Filial - Belo Horizonte",
    measurement: "(Pedidos no prazo / Total pedidos) × 100",
    measureUnit: "%",
    direction: "up",
    periodicity: "monthly",
    formulaExpression: "pedidos_no_prazo / total_pedidos * 100",
    formulaVariables: [
      { key: "pedidos_no_prazo", label: "Pedidos no Prazo" },
      { key: "total_pedidos", label: "Total Pedidos" },
    ],
    goal: 95.0,
    values: [98.0, 97.5, 98.3, 97.8, 98.5, 98.1, N, N, N, N, N, N],
  },
  {
    name: "Pontualidade de Entrega - Anápolis",
    unit: "Filial - Anápolis",
    measurement: "(Entregas no prazo / Total entregas) × 100",
    measureUnit: "%",
    direction: "up",
    periodicity: "monthly",
    formulaExpression: "entregas_no_prazo / total_entregas * 100",
    formulaVariables: [
      { key: "entregas_no_prazo", label: "Entregas no Prazo" },
      { key: "total_entregas", label: "Total de Entregas" },
    ],
    goal: 95.0,
    values: [95.5, 96.0, 95.8, 96.5, 96.2, 96.8, N, N, N, N, N, N],
  },
];

// ─── Cluster 4: Tempo Médio de Entrega (min) ─────────────────────────────
// Vai ter UM Corporativo pré-configurado agregando este cluster, então
// estes sumirão da seção Sugestões (filtro de lockedChildIds)

const CLUSTER_TME: IndicatorDef[] = [
  {
    name: "Tempo Médio de Entrega - Curitiba",
    unit: "Matriz - Curitiba",
    measurement: "Soma dos tempos / Qtd. pedidos",
    measureUnit: "min",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "soma_tempos / qtd_pedidos",
    formulaVariables: [
      { key: "soma_tempos", label: "Soma dos Tempos" },
      { key: "qtd_pedidos", label: "Qtd. Pedidos" },
    ],
    goal: 45.0,
    values: [42.5, 43.8, 41.2, 44.5, 42.9, 43.1, N, N, N, N, N, N],
  },
  {
    name: "Tempo Médio de Entrega - São Paulo",
    unit: "Filial - São Paulo",
    measurement: "Total tempo / Núm. pedidos",
    measureUnit: "min",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "total_tempo / num_pedidos",
    formulaVariables: [
      { key: "total_tempo", label: "Total Tempo" },
      { key: "num_pedidos", label: "Núm. Pedidos" },
    ],
    goal: 45.0,
    values: [48.2, 47.5, 46.8, 48.5, 47.0, 48.1, N, N, N, N, N, N],
  },
];

// ─── Isolados: NÃO devem virar cluster (validação negativa) ──────────────

const ISOLADOS: IndicatorDef[] = [
  {
    name: "Custo Operacional - Curitiba",
    unit: "Matriz - Curitiba",
    measurement: "Custo total operacional (R$)",
    measureUnit: "R$",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "custo_total",
    formulaVariables: [{ key: "custo_total", label: "Custo Total" }],
    goal: 50000,
    values: [48500, 52100, 49800, 51200, 50500, 50100, N, N, N, N, N, N],
  },
  {
    name: "NPS - Matriz",
    unit: "Matriz - Curitiba",
    measurement: "Net Promoter Score corporativo",
    measureUnit: "pts",
    direction: "up",
    periodicity: "quarterly",
    formulaExpression: "promotores - detratores",
    formulaVariables: [
      { key: "promotores", label: "Promotores" },
      { key: "detratores", label: "Detratores" },
    ],
    goal: 50,
    values: [N, N, 58, N, N, 62, N, N, N, N, N, N],
  },
  {
    name: "Refeições servidas - RH",
    unit: "Matriz - Curitiba",
    measurement: "Total mensal de refeições servidas no refeitório",
    measureUnit: "qtd",
    direction: "up",
    periodicity: "monthly",
    formulaExpression: "refeicoes_servidas",
    formulaVariables: [{ key: "refeicoes_servidas", label: "Refeições Servidas" }],
    goal: 3000,
    values: [2950, 3100, 2880, 3050, 3200, 3150, N, N, N, N, N, N],
  },
];

// Tudo junto na ordem de criação
const ALL_INDICATORS: IndicatorDef[] = [
  ...CLUSTER_AVARIAS,
  ...CLUSTER_ACIDENTES,
  ...CLUSTER_PONTUALIDADE,
  ...CLUSTER_TME,
  ...ISOLADOS,
];

// ─── Corporativo pré-configurado: Tempo Médio de Entrega - Corporativo ───

const PRE_CONFIGURED_CORPORATE: {
  indicator: IndicatorDef;
  childUnits: string[]; // filiais que esse Corp agrega
  strategy: "sum_inputs";
} = {
  indicator: {
    name: "Tempo Médio de Entrega - Corporativo",
    unit: "Corporativo",
    measurement: "Soma dos tempos / Qtd. pedidos (agregado das filiais)",
    measureUnit: "min",
    direction: "down",
    periodicity: "monthly",
    formulaExpression: "soma_tempos / qtd_pedidos",
    formulaVariables: [
      { key: "soma_tempos", label: "Soma dos Tempos" },
      { key: "qtd_pedidos", label: "Qtd. Pedidos" },
    ],
    goal: 45.0,
    values: [N, N, N, N, N, N, N, N, N, N, N, N], // computed on-read
  },
  childUnits: ["Matriz - Curitiba", "Filial - São Paulo"],
  strategy: "sum_inputs",
};

// ─── Inputs synth — pra os filhos do Corporativo terem dados que o ────────
// compose on-read consiga somar e calcular. Pra TME: soma_tempos +
// qtd_pedidos por mês. Os "values" no IndicatorDef são o resultado final
// JÁ calculado; aqui geramos os inputs sintéticos retroativos.

function synthInputsForTME(
  variables: KpiFormulaVariable[],
  finalValue: number | null,
): Record<string, number | null> {
  if (finalValue === null) return {};
  // Para um TME (soma_tempos / qtd_pedidos), assumimos qtd_pedidos típica
  // ~ 1500 pedidos/mês e derivamos soma_tempos = TME × qtd
  const qtd = 1500 + Math.round((Math.random() - 0.5) * 200);
  const soma = Math.round(finalValue * qtd);
  // Mapeia para as keys reais do indicator
  const inputs: Record<string, number> = {};
  if (variables.find((v) => v.key === "soma_tempos")) inputs.soma_tempos = soma;
  if (variables.find((v) => v.key === "total_tempo")) inputs.total_tempo = soma;
  if (variables.find((v) => v.key === "qtd_pedidos")) inputs.qtd_pedidos = qtd;
  if (variables.find((v) => v.key === "num_pedidos")) inputs.num_pedidos = qtd;
  return inputs;
}

function synthGenericInputs(
  variables: KpiFormulaVariable[],
  finalValue: number | null,
  expr: string,
): Record<string, number | null> {
  if (finalValue === null) return {};
  // Para expressões "ratio * scale" (avarias/transportados * 1000,
  // pontualidade * 100), gera denominador típico e numerador derivado
  if (variables.length !== 2) {
    // unary: só preenche a única var com o valor final
    const inputs: Record<string, number> = {};
    if (variables[0]) inputs[variables[0].key] = finalValue;
    return inputs;
  }
  const denom = expr.includes("* 1000")
    ? 2000 + Math.round((Math.random() - 0.5) * 500) // ~2000 unidades
    : expr.includes("* 100")
      ? 800 + Math.round((Math.random() - 0.5) * 200) // ~800 entregas
      : 1000;
  const scale = expr.includes("* 1000") ? 1000 : expr.includes("* 100") ? 100 : 1;
  const num = Math.round((finalValue * denom) / scale);
  const [vNum, vDenom] = variables;
  return { [vNum.key]: num, [vDenom.key]: denom };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  // 1. Localiza org via email do user (TARGET_EMAIL).
  const [user] = await db
    .select({ id: usersTable.id, organizationId: usersTable.organizationId, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, TARGET_EMAIL));
  if (!user) throw new Error(`Nenhum user com email ${TARGET_EMAIL} encontrado`);
  if (!user.organizationId) throw new Error(`User ${TARGET_EMAIL} não tem organizationId`);

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, user.organizationId));
  if (!org) throw new Error(`Org ${user.organizationId} não encontrada`);

  const orgId = org.id;
  const responsibleUserId = user.id;
  console.log(`🎯 Org alvo: ${org.name} (#${orgId}); responsible: ${user.email} (#${user.id})\n`);

  // 2. Idempotência — limpa demos anteriores (cascade via FK).
  //    Pega indicadores com nome terminando em " [DEMO]" e seus filhos.
  const stale = await db
    .select({ id: kpiIndicatorsTable.id, name: kpiIndicatorsTable.name })
    .from(kpiIndicatorsTable)
    .where(and(
      eq(kpiIndicatorsTable.organizationId, orgId),
      like(kpiIndicatorsTable.name, `%${DEMO_SUFFIX}`),
    ));
  if (stale.length > 0) {
    console.log(`🧹 Removendo ${stale.length} indicador(es) [DEMO] preexistentes...`);
    // Como kpi_indicator_rollups referencia indicator IDs, limpa antes.
    const ids = stale.map((s) => s.id);
    await db
      .delete(kpiIndicatorRollupsTable)
      .where(and(
        eq(kpiIndicatorRollupsTable.organizationId, orgId),
        sql`(${kpiIndicatorRollupsTable.parentIndicatorId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) OR ${kpiIndicatorRollupsTable.childIndicatorId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}))`,
      ));
    await db
      .delete(kpiIndicatorsTable)
      .where(and(
        eq(kpiIndicatorsTable.organizationId, orgId),
        like(kpiIndicatorsTable.name, `%${DEMO_SUFFIX}`),
      ));
    // year_configs e monthly_values caem via ON DELETE CASCADE
  }

  // 3. Cria/garante as filiais (idempotente por nome dentro da org).
  console.log(`\n🏢 Filiais:`);
  const unitIdByName = new Map<string, number>();
  for (const f of FILIAIS) {
    const existing = await db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(and(eq(unitsTable.organizationId, orgId), eq(unitsTable.name, f.name)));
    if (existing[0]) {
      unitIdByName.set(f.name, existing[0].id);
      console.log(`  ✓ ${f.name}`);
      continue;
    }
    const [created] = await db
      .insert(unitsTable)
      .values({ organizationId: orgId, name: f.name })
      .returning({ id: unitsTable.id });
    unitIdByName.set(f.name, created.id);
    console.log(`  + ${f.name}`);
  }

  // 4. Cria indicadores (com sufixo [DEMO]).
  console.log(`\n📊 Indicadores filial-level:`);
  const indicatorIdByName = new Map<string, number>();
  for (const ind of ALL_INDICATORS) {
    const finalName = `${ind.name}${DEMO_SUFFIX}`;
    const [created] = await db
      .insert(kpiIndicatorsTable)
      .values({
        organizationId: orgId,
        name: finalName,
        measurement: ind.measurement,
        measureUnit: ind.measureUnit,
        unit: ind.unit,
        responsibleUserId,
        direction: ind.direction,
        periodicity: ind.periodicity,
        formulaExpression: ind.formulaExpression,
        formulaVariables: ind.formulaVariables,
        category: null,
        norms: [],
      })
      .returning({ id: kpiIndicatorsTable.id });
    indicatorIdByName.set(finalName, created.id);
    console.log(`  + #${created.id} [${ind.unit}] ${finalName}`);

    // 4a. Year config
    const [yc] = await db
      .insert(kpiYearConfigsTable)
      .values({
        organizationId: orgId,
        indicatorId: created.id,
        year: YEAR,
        goal: ind.goal != null ? String(ind.goal) : null,
      })
      .returning({ id: kpiYearConfigsTable.id });

    // 4b. Monthly values + inputs sintéticos
    const isUnary = ind.formulaVariables.length === 1;
    for (let m = 1; m <= 12; m++) {
      const v = ind.values[m - 1];
      if (v === null) continue;
      const inputs = isUnary
        ? { [ind.formulaVariables[0].key]: v }
        : ind.formulaExpression.includes("soma_tempos") ||
            ind.formulaExpression.includes("total_tempo")
          ? synthInputsForTME(ind.formulaVariables, v)
          : synthGenericInputs(ind.formulaVariables, v, ind.formulaExpression);
      await db.insert(kpiMonthlyValuesTable).values({
        organizationId: orgId,
        yearConfigId: yc.id,
        month: m,
        value: String(v),
        inputs: inputs as Record<string, number | null>,
        isOverridden: true, // entrada manual real
      });
    }
  }

  // 5. Cria o Corporativo pré-configurado (TME - Corporativo).
  console.log(`\n🏆 Corporativo pré-configurado:`);
  const corpDef = PRE_CONFIGURED_CORPORATE.indicator;
  const corpFinalName = `${corpDef.name}${DEMO_SUFFIX}`;

  const childIndicatorIds: number[] = [];
  for (const childUnit of PRE_CONFIGURED_CORPORATE.childUnits) {
    // Acha o indicator do cluster TME que está naquela unit
    const childName = `Tempo Médio de Entrega - ${childUnit.replace(/^Filial - /, "").replace(/^Matriz - /, "")}${DEMO_SUFFIX}`;
    // os cluster_tme têm nomes ".. - Curitiba" e ".. - São Paulo"
    const variants = [
      `Tempo Médio de Entrega - Curitiba${DEMO_SUFFIX}`,
      `Tempo Médio de Entrega - São Paulo${DEMO_SUFFIX}`,
    ];
    void childName;
    const match = variants.find((v) => v.includes(childUnit.replace(/^(Filial - |Matriz - )/, "")));
    if (!match) continue;
    const id = indicatorIdByName.get(match);
    if (id) childIndicatorIds.push(id);
  }

  if (childIndicatorIds.length === 0) {
    console.log(`  ⚠ Nenhum filho encontrado pro Corporativo TME — pulando.`);
  } else {
    const [corpCreated] = await db
      .insert(kpiIndicatorsTable)
      .values({
        organizationId: orgId,
        name: corpFinalName,
        measurement: corpDef.measurement,
        measureUnit: corpDef.measureUnit,
        unit: corpDef.unit,
        responsibleUserId,
        direction: corpDef.direction,
        periodicity: corpDef.periodicity,
        formulaExpression: corpDef.formulaExpression,
        formulaVariables: corpDef.formulaVariables,
        rollupStrategy: PRE_CONFIGURED_CORPORATE.strategy,
        category: null,
        norms: [],
      })
      .returning({ id: kpiIndicatorsTable.id });

    await db.insert(kpiYearConfigsTable).values({
      organizationId: orgId,
      indicatorId: corpCreated.id,
      year: YEAR,
      goal: corpDef.goal != null ? String(corpDef.goal) : null,
    });

    // Vincula filhos com variable_mapping POR POSIÇÃO da fórmula.
    // Pai: soma_tempos / qtd_pedidos. Pra cada filho:
    //   Curitiba: { soma_tempos: "soma_tempos", qtd_pedidos: "qtd_pedidos" }
    //   SP:       { soma_tempos: "total_tempo",  qtd_pedidos: "num_pedidos" }
    for (const childId of childIndicatorIds) {
      const [child] = await db
        .select({ formulaVariables: kpiIndicatorsTable.formulaVariables, formulaExpression: kpiIndicatorsTable.formulaExpression, name: kpiIndicatorsTable.name })
        .from(kpiIndicatorsTable)
        .where(eq(kpiIndicatorsTable.id, childId));
      if (!child) continue;
      const childVarsInOrder: string[] = [];
      // Pega as vars do filho na ordem de aparição na expressão
      for (const v of child.formulaVariables) {
        const m = new RegExp(`\\b${v.key}\\b`).exec(child.formulaExpression);
        if (m) childVarsInOrder.push(v.key);
      }
      // Ordena pela posição na expr
      childVarsInOrder.sort((a, b) => child.formulaExpression.indexOf(a) - child.formulaExpression.indexOf(b));
      const variableMapping: Record<string, string> = {};
      corpDef.formulaVariables.forEach((parentVar, i) => {
        if (childVarsInOrder[i]) variableMapping[parentVar.key] = childVarsInOrder[i];
      });
      await db.insert(kpiIndicatorRollupsTable).values({
        organizationId: orgId,
        parentIndicatorId: corpCreated.id,
        childIndicatorId: childId,
        variableMapping,
      });
      console.log(`  + Vínculo: ${corpFinalName} ← #${childId} (${child.name}) mapping=${JSON.stringify(variableMapping)}`);
    }
    console.log(`  ✓ Corporativo #${corpCreated.id} criado com ${childIndicatorIds.length} filhos`);
  }

  console.log(`\n✅ Seed concluído.\n`);
  console.log(`Próximo: abra /app/kpi/indicadores e clique na tab "Corporativos".`);
  console.log(`Você verá:`);
  console.log(`  • Já configurados (1): Tempo Médio de Entrega - Corporativo`);
  console.log(`  • Sugestões (3):`);
  console.log(`      - Avarias por mil transportados (4 filiais)`);
  console.log(`      - Acidentes por mil km (3 filiais)`);
  console.log(`      - Pontualidade de Entrega (5 filiais)`);
  console.log(`  • Cluster TME não aparece em Sugestões (filhos já vinculados → filtrados)`);
  console.log(`  • Custo/NPS/Refeições NÃO formam cluster (estruturas diferentes)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Seed falhou:", e);
    process.exit(1);
  });
