import {
  and,
  asc,
  count,
  desc,
  eq,
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
 * módulo KPI para o ano pedido.
 */
async function resolveTargets(
  orgId: number,
  year: number,
  database: Database,
): Promise<LearningSummaryTarget[]> {
  const configured = await database
    .select({
      metric: kpiIndicatorsTable.computedMetric,
      goal: kpiYearConfigsTable.goal,
      tolerance: kpiYearConfigsTable.tolerance,
      direction: kpiIndicatorsTable.direction,
    })
    .from(kpiIndicatorsTable)
    .innerJoin(
      kpiYearConfigsTable,
      and(
        eq(kpiYearConfigsTable.indicatorId, kpiIndicatorsTable.id),
        eq(kpiYearConfigsTable.year, year),
      ),
    )
    .where(
      and(
        eq(kpiIndicatorsTable.organizationId, orgId),
        eq(kpiIndicatorsTable.computedSource, "lms"),
      ),
    );

  const byMetric = new Map(configured.map((r) => [r.metric, r]));

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
  const today = now.toISOString().slice(0, 10);

  // ─── CARDS ─────────────────────────────────────────────────────────────────
  // Seguem o mesmo recorte do resto da tela (ano + filial). Antes eram fixos em
  // "corporativo, mês corrente" e ignoravam ambos os filtros — o que fazia o
  // topo da tela contradizer a tabela logo abaixo quando se filtrava por filial.
  // Para um ano passado o acumulado é o ano inteiro (mês 12); para o ano
  // corrente, o mês atual.
  const cardsMonth = year === currentYear ? currentMonth : 12;
  const metricArgs = { orgId, year, month: cardsMonth, unitId, database };

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
  const effConditions = [eq(employeesTable.organizationId, orgId)];
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
  const expiredConditions = [
    eq(employeesTable.organizationId, orgId),
    isNotNull(employeeTrainingsTable.expirationDate),
    lte(employeeTrainingsTable.expirationDate, today),
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
  // Treinamentos concluídos sem nenhuma review de eficácia.
  const pendingConditions = [
    eq(employeesTable.organizationId, orgId),
    eq(employeeTrainingsTable.status, "concluido"),
    notExists(
      database
        .select({ id: trainingEffectivenessReviewsTable.id })
        .from(trainingEffectivenessReviewsTable)
        .where(
          eq(
            trainingEffectivenessReviewsTable.trainingId,
            employeeTrainingsTable.id,
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
