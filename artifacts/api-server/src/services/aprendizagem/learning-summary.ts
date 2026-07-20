import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lte,
  notExists,
  sql,
} from "drizzle-orm";
import {
  annualTrainingProgramTable,
  db,
  employeesTable,
  employeeTrainingsTable,
  kpiIndicatorsTable,
  kpiYearConfigsTable,
  regulatoryNormsTable,
  trainingCatalogTable,
  trainingEffectivenessReviewsTable,
  unitsTable,
} from "@workspace/db";
import {
  computeCriticalGapCountsByUnit,
  computeLmsMetric,
  LMS_INDICATOR_DEFS,
  type LmsMetricKey,
} from "../kpi/lms-metrics";

type Database = Pick<typeof db, "select">;

/**
 * Só avaliação FINALIZADA conta como avaliação.
 *
 * O rascunho (#176) é preenchimento em andamento — o próprio schema diz que
 * "NÃO conta como avaliação concluída em nenhuma coluna do board", e o #178
 * aplicou isso no board. Aqui faltava: rascunho entrava na eficácia por norma
 * e por filial e, pior, satisfazia o `notExists` das pendências, fazendo o
 * treinamento sumir da lista de "concluídos sem avaliação" sem que ninguém
 * tivesse concluído a avaliação.
 */
const FINAL_REVIEW = eq(trainingEffectivenessReviewsTable.status, "final");

function pct(numer: number, denom: number): number | null {
  if (denom === 0) return null;
  return Math.round((numer / denom) * 1000) / 10; // 1 casa decimal
}

type UnitStatus = "ok" | "atencao" | "critico" | "sem-dados";

function deriveStatus(
  completion: number | null,
  effectiveness: number | null,
): UnitStatus {
  if (completion === null && effectiveness === null) return "sem-dados";
  const c = completion ?? 100; // se não há PAT, não penaliza
  const e = effectiveness ?? 100; // se não há reviews, não penaliza
  if (c >= 80 && e >= 80) return "ok";
  if (c < 50 || e < 50) return "critico";
  return "atencao";
}

export interface LearningSummaryCards {
  patCompletion: number | null;
  effectiveness: number | null;
  criticalGaps: number | null;
  expiredTrainings: number | null;
  /** % de obrigatoriedades concluídas (ISO 9001 §7.2). */
  mandatoryCoverage: number | null;
  /** Horas de treinamento ÷ colaboradores ativos (ISO 10015 §4.3). */
  hoursPerEmployee: number | null;
}

/**
 * Meta e direção de cada métrica, para a tela desenhar semáforo/progresso sem
 * duplicar constantes do backend. A meta preferida é a que a organização
 * configurou no módulo KPI (`kpi_year_configs`); só caímos no padrão de
 * `LMS_INDICATOR_DEFS` quando os indicadores ainda não foram ativados — assim
 * um org que editou a própria meta não vê um "Meta 80%" fantasma na tela.
 */
export interface LearningSummaryTarget {
  metric: LmsMetricKey;
  goal: number;
  tolerance: number;
  direction: "up" | "down";
}

export interface LearningSummaryUnitRow {
  unitId: number;
  unitName: string;
  completion: number | null;
  effectiveness: number | null;
  gaps: number;
  status: UnitStatus;
}

export interface LearningSummaryNormRow {
  norm: string;
  effectiveness: number | null;
}

export interface LearningSummaryExpiredRow {
  employeeName: string;
  unitName: string | null;
  title: string;
  expirationDate: string;
}

export interface LearningSummaryPendingRow {
  employeeName: string;
  title: string;
}

export interface LearningSummary {
  cards: LearningSummaryCards;
  targets: LearningSummaryTarget[];
  byUnit: LearningSummaryUnitRow[];
  byNorm: LearningSummaryNormRow[];
  expired: LearningSummaryExpiredRow[];
  pendingEffectiveness: LearningSummaryPendingRow[];
}

/**
 * Resolve meta/tolerância por métrica: parte dos padrões de
 * `LMS_INDICATOR_DEFS` e sobrescreve com o que a organização configurou no
 * módulo KPI.
 *
 * Usa **carry-forward**, não o ano exato: vale a config do ano mais recente
 * que seja `<= year`. É a mesma regra que o módulo KPI aplica na leitura
 * (`GET /kpi/years/:year` monta uma config sintética a partir do ano anterior
 * mais recente quando o ano pedido ainda não foi aberto). Com o join exato, um
 * org que definiu a meta em 2025 e ainda não abriu 2026 veria aqui o padrão do
 * sistema e no módulo KPI a meta dele — dois semáforos diferentes para o mesmo
 * indicador.
 */
async function resolveTargets(
  orgId: number,
  year: number,
  database: Database,
): Promise<LearningSummaryTarget[]> {
  const configured = await database
    .select({
      metric: kpiIndicatorsTable.computedMetric,
      year: kpiYearConfigsTable.year,
      goal: kpiYearConfigsTable.goal,
      tolerance: kpiYearConfigsTable.tolerance,
      direction: kpiIndicatorsTable.direction,
    })
    .from(kpiIndicatorsTable)
    .innerJoin(
      kpiYearConfigsTable,
      and(
        eq(kpiYearConfigsTable.indicatorId, kpiIndicatorsTable.id),
        lte(kpiYearConfigsTable.year, year),
      ),
    )
    .where(
      and(
        eq(kpiIndicatorsTable.organizationId, orgId),
        eq(kpiIndicatorsTable.computedSource, "lms"),
      ),
    )
    .orderBy(desc(kpiYearConfigsTable.year));

  // Já vem do maior ano para o menor: o primeiro de cada métrica é o vigente.
  // São no máximo 6 métricas × poucos anos, então resolver em JS evita SQL
  // cru (e manter `Database` como `Pick<typeof db, "select">`, que é o que os
  // testes injetam).
  const byMetric = new Map<string, (typeof configured)[number]>();
  for (const row of configured) {
    if (row.metric && !byMetric.has(row.metric)) byMetric.set(row.metric, row);
  }

  return LMS_INDICATOR_DEFS.map((def) => {
    const override = byMetric.get(def.metric);
    // `goal`/`tolerance` são numeric → chegam como string; null quando o
    // usuário limpou o campo, caso em que o padrão continua valendo.
    const goal = override?.goal != null ? Number(override.goal) : null;
    const tolerance =
      override?.tolerance != null ? Number(override.tolerance) : null;
    return {
      metric: def.metric,
      goal: goal !== null && Number.isFinite(goal) ? goal : def.goal,
      tolerance:
        tolerance !== null && Number.isFinite(tolerance)
          ? tolerance
          : def.tolerance,
      direction:
        override?.direction === "up" || override?.direction === "down"
          ? override.direction
          : def.direction,
    };
  });
}

export async function computeLearningSummary(args: {
  orgId: number;
  year: number;
  unitId?: number;
  database: Database;
}): Promise<LearningSummary> {
  const { orgId, year, unitId, database } = args;

  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();

  // ─── CARDS ─────────────────────────────────────────────────────────────────
  // Seguem o mesmo recorte do resto da tela (ano + filial). Antes eram fixos em
  // "corporativo, mês corrente" e ignoravam ambos os filtros — o que fazia o
  // topo da tela contradizer a tabela logo abaixo quando se filtrava por filial.
  // Para um ano passado o acumulado é o ano inteiro (mês 12); para o ano
  // corrente, o mês atual.
  const cardsMonth = year === currentYear ? currentMonth : 12;
  // `startMonth: 1` só afeta `effectiveness_overall`, a única métrica de
  // janela: sob um cabeçalho "Exercício X" o card tem que ser o acumulado do
  // ano, não a fatia de um mês (um ano fechado mostraria apenas dezembro).
  // As demais métricas já acumulam até `month` e ignoram este parâmetro.
  const metricArgs = {
    orgId,
    year,
    month: cardsMonth,
    startMonth: 1,
    unitId,
    database,
  };

  // Fronteiras do exercício selecionado. TODA a resposta é "posição ao fim do
  // período", o mesmo recorte dos cards — antes `byNorm` era histórico
  // completo, `expired` cortava em "hoje" e `pendingEffectiveness` não tinha
  // corte nenhum, então o seletor de ano não os afetava e o cabeçalho
  // "Exercício X" prometia um recorte que três painéis ignoravam.
  //
  // Repare que o corte é ACUMULADO (`<= periodEnd`), não "dentro do ano":
  // vencido e eficácia pendente são dívida que não zera na virada do ano —
  // um treinamento concluído em 2024 sem avaliação continua pendente em 2026,
  // e escondê-lo esconderia justamente a pendência mais velha.
  const periodStart = `${year}-01-01`;
  const periodEnd = new Date(Date.UTC(year, cardsMonth, 0))
    .toISOString()
    .slice(0, 10);

  const [
    patCompletion,
    effectiveness,
    criticalGaps,
    expiredTrainings,
    mandatoryCoverage,
    hoursPerEmployee,
  ] = await Promise.all([
    computeLmsMetric({ ...metricArgs, metric: "pat_completion" }),
    computeLmsMetric({ ...metricArgs, metric: "effectiveness_overall" }),
    computeLmsMetric({ ...metricArgs, metric: "critical_gaps" }),
    computeLmsMetric({ ...metricArgs, metric: "expired_trainings" }),
    computeLmsMetric({ ...metricArgs, metric: "mandatory_coverage" }),
    computeLmsMetric({ ...metricArgs, metric: "hours_per_employee" }),
  ]);

  const targets = await resolveTargets(orgId, year, database);

  // ─── BY UNIT ────────────────────────────────────────────────────────────────
  const unitConditions = [eq(unitsTable.organizationId, orgId)];
  if (unitId !== undefined) unitConditions.push(eq(unitsTable.id, unitId));

  const units = await database
    .select({ id: unitsTable.id, name: unitsTable.name })
    .from(unitsTable)
    .where(and(...unitConditions));

  // PAT completion por filial
  const patConditions = [
    eq(annualTrainingProgramTable.organizationId, orgId),
    eq(annualTrainingProgramTable.year, year),
  ];
  if (unitId !== undefined) {
    patConditions.push(eq(annualTrainingProgramTable.unitId, unitId));
  }

  const patByUnit = await database
    .select({
      unitId: annualTrainingProgramTable.unitId,
      total: count(),
      realizadas: sql<number>`count(*) filter (where ${annualTrainingProgramTable.status} = 'realizada')`,
    })
    .from(annualTrainingProgramTable)
    .where(and(...patConditions))
    .groupBy(annualTrainingProgramTable.unitId);

  // Effectiveness por filial (via employee.unitId)
  // Mesma janela do card de eficácia e do `byNorm`. Sem isto a coluna
  // "Eficácia" da tabela por filial ficava sem recorte de data nenhum e
  // mostrava avaliações de outro ano sob o cabeçalho do exercício — a
  // `completion` ao lado já respeitava o ano, então a própria linha se
  // contradizia.
  const effConditions = [
    eq(employeesTable.organizationId, orgId),
    gte(trainingEffectivenessReviewsTable.evaluationDate, periodStart),
    lte(trainingEffectivenessReviewsTable.evaluationDate, periodEnd),
    FINAL_REVIEW,
  ];
  if (unitId !== undefined) {
    effConditions.push(eq(employeesTable.unitId, unitId));
  }

  const effectivenessByUnit = await database
    .select({
      unitId: employeesTable.unitId,
      total: count(),
      eficazes: sql<number>`count(*) filter (where ${trainingEffectivenessReviewsTable.isEffective} = true)`,
    })
    .from(trainingEffectivenessReviewsTable)
    .innerJoin(
      employeeTrainingsTable,
      eq(
        trainingEffectivenessReviewsTable.trainingId,
        employeeTrainingsTable.id,
      ),
    )
    .innerJoin(
      employeesTable,
      eq(employeeTrainingsTable.employeeId, employeesTable.id),
    )
    .where(and(...effConditions))
    .groupBy(employeesTable.unitId);

  // Gaps críticos por filial (via helper compartilhado com lms-metrics)
  const unitGapsMap = await computeCriticalGapCountsByUnit(orgId, database);

  const patMap = new Map(patByUnit.map((r) => [r.unitId ?? -1, r]));
  const effMap = new Map(effectivenessByUnit.map((r) => [r.unitId ?? -1, r]));

  const byUnit: LearningSummaryUnitRow[] = units.map((unit) => {
    const pat = patMap.get(unit.id);
    const eff = effMap.get(unit.id);
    const gaps = unitGapsMap.get(unit.id) ?? 0;

    const completion =
      pat && Number(pat.total) > 0
        ? pct(Number(pat.realizadas), Number(pat.total))
        : null;
    const unitEff =
      eff && Number(eff.total) > 0
        ? pct(Number(eff.eficazes), Number(eff.total))
        : null;

    return {
      unitId: unit.id,
      unitName: unit.name,
      completion,
      effectiveness: unitEff,
      gaps,
      status: deriveStatus(completion, unitEff),
    };
  });

  // ─── BY NORM ────────────────────────────────────────────────────────────────
  // Eficácia de reviews agrupada pela(s) norma(s) do item do catálogo vinculado.
  // A norma passou de texto legado (`norm`) para o catálogo (`norm_ids`, multi).
  // Agregamos em JS porque cada item pode ter N normas — um review conta para
  // cada norma vinculada. Preferimos os rótulos do catálogo; caímos no texto
  // legado apenas para itens ainda não migrados (norm_ids vazio).
  const normLabelRows = await database
    .select({
      id: regulatoryNormsTable.id,
      label: regulatoryNormsTable.label,
    })
    .from(regulatoryNormsTable)
    .where(eq(regulatoryNormsTable.organizationId, orgId));
  const normLabelById = new Map(normLabelRows.map((r) => [r.id, r.label]));

  const reviewNormRows = await database
    .select({
      normIds: trainingCatalogTable.normIds,
      norm: trainingCatalogTable.norm,
      isEffective: trainingEffectivenessReviewsTable.isEffective,
    })
    .from(trainingEffectivenessReviewsTable)
    .innerJoin(
      employeeTrainingsTable,
      eq(
        trainingEffectivenessReviewsTable.trainingId,
        employeeTrainingsTable.id,
      ),
    )
    .innerJoin(
      employeesTable,
      eq(employeeTrainingsTable.employeeId, employeesTable.id),
    )
    .innerJoin(
      trainingCatalogTable,
      eq(employeeTrainingsTable.catalogItemId, trainingCatalogTable.id),
    )
    .where(
      and(
        eq(employeesTable.organizationId, orgId),
        unitId !== undefined ? eq(employeesTable.unitId, unitId) : undefined,
        FINAL_REVIEW,
        // MESMA janela do card "Eficácia geral" (Jan → fim do período). É o
        // detalhamento daquele número: com janelas diferentes, a soma das
        // barras não reconciliaria com o total exibido logo acima.
        gte(trainingEffectivenessReviewsTable.evaluationDate, periodStart),
        lte(trainingEffectivenessReviewsTable.evaluationDate, periodEnd),
      ),
    );

  const byNormAcc = new Map<string, { total: number; eficazes: number }>();
  for (const r of reviewNormRows) {
    const labels =
      Array.isArray(r.normIds) && r.normIds.length > 0
        ? r.normIds
            .map((id) => normLabelById.get(id))
            .filter((l): l is string => Boolean(l))
        : r.norm
          ? [r.norm]
          : [];
    for (const label of labels) {
      const acc = byNormAcc.get(label) ?? { total: 0, eficazes: 0 };
      acc.total += 1;
      if (r.isEffective === true) acc.eficazes += 1;
      byNormAcc.set(label, acc);
    }
  }

  const byNorm: LearningSummaryNormRow[] = [...byNormAcc.entries()].map(
    ([norm, acc]) => ({
      norm,
      effectiveness: pct(acc.eficazes, acc.total),
    }),
  );

  // ─── EXPIRED ────────────────────────────────────────────────────────────────
  // Corte no fim do período, o MESMO de `cards.expiredTrainings`. Antes era
  // "hoje": num exercício fechado a contagem dizia uma coisa e a amostra
  // listava outra (inclusive vencimentos posteriores ao ano consultado).
  const expiredConditions = [
    eq(employeesTable.organizationId, orgId),
    isNotNull(employeeTrainingsTable.expirationDate),
    lte(employeeTrainingsTable.expirationDate, periodEnd),
    sql`${employeeTrainingsTable.status} <> 'concluido'`,
  ];
  if (unitId !== undefined) {
    expiredConditions.push(eq(employeesTable.unitId, unitId));
  }

  const expiredRows = await database
    .select({
      employeeName: employeesTable.name,
      unitName: unitsTable.name,
      title: employeeTrainingsTable.title,
      expirationDate: employeeTrainingsTable.expirationDate,
    })
    .from(employeeTrainingsTable)
    .innerJoin(
      employeesTable,
      eq(employeeTrainingsTable.employeeId, employeesTable.id),
    )
    .leftJoin(unitsTable, eq(employeesTable.unitId, unitsTable.id))
    .where(and(...expiredConditions))
    .orderBy(desc(employeeTrainingsTable.expirationDate))
    .limit(20);

  const expired: LearningSummaryExpiredRow[] = expiredRows.map((r) => ({
    employeeName: r.employeeName,
    unitName: r.unitName ?? null,
    title: r.title,
    expirationDate: r.expirationDate!,
  }));

  // ─── PENDING EFFECTIVENESS ──────────────────────────────────────────────────
  // Treinamentos concluídos sem nenhuma review de eficácia, até o fim do
  // período. Acumulado de propósito: é dívida, não fluxo do ano — concluído em
  // 2024 sem avaliação segue pendente em 2026. `completion_date` nulo entra
  // porque o treinamento já está marcado como concluído.
  const pendingConditions = [
    eq(employeesTable.organizationId, orgId),
    eq(employeeTrainingsTable.status, "concluido"),
    sql`(${employeeTrainingsTable.completionDate} is null or ${employeeTrainingsTable.completionDate} <= ${periodEnd})`,
    // Rascunho NÃO tira o treinamento daqui: "concluído sem avaliação" continua
    // verdade enquanto ninguém finalizou. Sem o filtro, abrir o wizard e sair
    // no meio fazia a pendência desaparecer da tela.
    notExists(
      database
        .select({ id: trainingEffectivenessReviewsTable.id })
        .from(trainingEffectivenessReviewsTable)
        .where(
          and(
            eq(
              trainingEffectivenessReviewsTable.trainingId,
              employeeTrainingsTable.id,
            ),
            FINAL_REVIEW,
          ),
        ),
    ),
  ];
  if (unitId !== undefined) {
    pendingConditions.push(eq(employeesTable.unitId, unitId));
  }

  const pendingRows = await database
    .select({
      employeeName: employeesTable.name,
      title: employeeTrainingsTable.title,
    })
    .from(employeeTrainingsTable)
    .innerJoin(
      employeesTable,
      eq(employeeTrainingsTable.employeeId, employeesTable.id),
    )
    .where(and(...pendingConditions))
    .orderBy(asc(employeesTable.name))
    .limit(20);

  const pendingEffectiveness: LearningSummaryPendingRow[] = pendingRows.map(
    (r) => ({
      employeeName: r.employeeName,
      title: r.title,
    }),
  );

  return {
    cards: {
      patCompletion,
      effectiveness,
      criticalGaps,
      expiredTrainings,
      mandatoryCoverage,
      hoursPerEmployee,
    },
    targets,
    byUnit,
    byNorm,
    expired,
    pendingEffectiveness,
  };
}
