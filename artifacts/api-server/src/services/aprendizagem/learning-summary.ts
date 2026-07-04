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
  trainingCatalogTable,
  trainingEffectivenessReviewsTable,
  unitsTable,
} from "@workspace/db";
import { computeCriticalGapCountsByUnit, computeLmsMetric } from "../kpi/lms-metrics";

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
  byUnit: LearningSummaryUnitRow[];
  byNorm: LearningSummaryNormRow[];
  expired: LearningSummaryExpiredRow[];
  pendingEffectiveness: LearningSummaryPendingRow[];
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

  // ─── CARDS (escopo corporativo, mês corrente) ──────────────────────────────
  const [patCompletion, effectiveness, criticalGaps, expiredTrainings] =
    await Promise.all([
      computeLmsMetric({
        orgId,
        metric: "pat_completion",
        year: currentYear,
        month: currentMonth,
        database,
      }),
      computeLmsMetric({
        orgId,
        metric: "effectiveness_overall",
        year: currentYear,
        month: currentMonth,
        database,
      }),
      computeLmsMetric({
        orgId,
        metric: "critical_gaps",
        year: currentYear,
        month: currentMonth,
        database,
      }),
      computeLmsMetric({
        orgId,
        metric: "expired_trainings",
        year: currentYear,
        month: currentMonth,
        database,
      }),
    ]);

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

  const patMap = new Map(
    patByUnit.map((r) => [r.unitId ?? -1, r]),
  );
  const effMap = new Map(
    effectivenessByUnit.map((r) => [r.unitId ?? -1, r]),
  );

  const byUnit: LearningSummaryUnitRow[] = units.map((unit) => {
    const pat = patMap.get(unit.id);
    const eff = effMap.get(unit.id);
    const gaps = unitGapsMap.get(unit.id) ?? 0;

    const completion = pat && Number(pat.total) > 0
      ? pct(Number(pat.realizadas), Number(pat.total))
      : null;
    const unitEff = eff && Number(eff.total) > 0
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
  // Eficácia de reviews agrupada pela norma do item do catálogo vinculado.
  // Treinamentos sem vínculo a catálogo (ou catálogo sem norma) são excluídos.
  const byNormRows = await database
    .select({
      norm: trainingCatalogTable.norm,
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
    .innerJoin(
      trainingCatalogTable,
      eq(employeeTrainingsTable.catalogItemId, trainingCatalogTable.id),
    )
    .where(
      and(
        eq(employeesTable.organizationId, orgId),
        isNotNull(trainingCatalogTable.norm),
        unitId !== undefined ? eq(employeesTable.unitId, unitId) : undefined,
      ),
    )
    .groupBy(trainingCatalogTable.norm);

  const byNorm: LearningSummaryNormRow[] = byNormRows
    .filter((r): r is typeof r & { norm: string } => r.norm !== null)
    .map((r) => ({
      norm: r.norm,
      effectiveness: pct(Number(r.eficazes), Number(r.total)),
    }));

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
    },
    byUnit,
    byNorm,
    expired,
    pendingEffectiveness,
  };
}
