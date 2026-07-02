import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  notExists,
  sql,
} from "drizzle-orm";
import {
  annualTrainingProgramTable,
  db,
  employeeCompetenciesTable,
  employeesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
  positionsTable,
  trainingCatalogTable,
  trainingEffectivenessReviewsTable,
  unitsTable,
} from "@workspace/db";
import { computeLmsMetric } from "../kpi/lms-metrics";

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

/**
 * Retorna um Map<unitId, count> de colaboradores com gap crítico por filial.
 * Replica a lógica de countCriticalGapEmployees (lms-metrics.ts) mas agrupa por unitId.
 */
async function computeGapsByUnit(
  orgId: number,
  database: Database,
): Promise<Map<number, number>> {
  const employees = await database
    .select({
      id: employeesTable.id,
      position: employeesTable.position,
      unitId: employeesTable.unitId,
    })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, orgId));

  const gapsByUnit = new Map<number, number>();

  if (employees.length === 0) return gapsByUnit;

  const positionNames = [
    ...new Set(
      employees
        .map((e) => e.position)
        .filter((v): v is string => !!v),
    ),
  ];

  if (positionNames.length === 0) return gapsByUnit;

  const positions = await database
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.organizationId, orgId),
        inArray(positionsTable.name, positionNames),
      ),
    );

  if (positions.length === 0) return gapsByUnit;

  const positionByName = new Map(positions.map((p) => [p.name, p]));
  const positionIds = positions.map((p) => p.id);

  const requirements = await database
    .select()
    .from(positionCompetencyRequirementsTable)
    .where(
      inArray(positionCompetencyRequirementsTable.positionId, positionIds),
    );

  const requirementsByPositionId = new Map<
    number,
    (typeof positionCompetencyRequirementsTable.$inferSelect)[]
  >();
  for (const req of requirements) {
    const items = requirementsByPositionId.get(req.positionId) ?? [];
    items.push(req);
    requirementsByPositionId.set(req.positionId, items);
  }

  const employeeIds = employees.map((e) => e.id);
  const competencies = await database
    .select()
    .from(employeeCompetenciesTable)
    .where(inArray(employeeCompetenciesTable.employeeId, employeeIds));

  const competenciesByEmployeeId = new Map<
    number,
    (typeof employeeCompetenciesTable.$inferSelect)[]
  >();
  for (const comp of competencies) {
    const items = competenciesByEmployeeId.get(comp.employeeId) ?? [];
    items.push(comp);
    competenciesByEmployeeId.set(comp.employeeId, items);
  }

  function normalizeText(v: string | null | undefined): string {
    return (v ?? "").trim().toLocaleLowerCase("pt-BR");
  }
  function competencyKey(
    name: string | null | undefined,
    type: string | null | undefined,
  ): string {
    return `${normalizeText(name)}::${normalizeText(type) || "habilidade"}`;
  }

  for (const employee of employees) {
    const position = employee.position
      ? positionByName.get(employee.position)
      : null;
    if (!position) continue;

    const posReqs = requirementsByPositionId.get(position.id) ?? [];
    if (posReqs.length === 0) continue;

    const empComps = competenciesByEmployeeId.get(employee.id) ?? [];

    const compByKey = new Map<
      string,
      (typeof employeeCompetenciesTable.$inferSelect)
    >();
    for (const comp of empComps) {
      const key = competencyKey(comp.name, comp.type);
      const existing = compByKey.get(key);
      if (!existing || comp.acquiredLevel > existing.acquiredLevel) {
        compByKey.set(key, comp);
      }
    }

    let hasCriticalGap = false;
    for (const req of posReqs) {
      const key = competencyKey(req.competencyName, req.competencyType);
      const acquired = compByKey.get(key)?.acquiredLevel ?? 0;
      const gapLevel = Math.max(req.requiredLevel - acquired, 0);
      const critical = gapLevel >= 2 || req.requiredLevel >= 4;
      if (gapLevel > 0 && critical) {
        hasCriticalGap = true;
        break;
      }
    }

    if (hasCriticalGap && employee.unitId !== null) {
      gapsByUnit.set(
        employee.unitId,
        (gapsByUnit.get(employee.unitId) ?? 0) + 1,
      );
    }
  }

  return gapsByUnit;
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

  // Gaps críticos por filial
  const unitGapsMap = await computeGapsByUnit(orgId, database);

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
