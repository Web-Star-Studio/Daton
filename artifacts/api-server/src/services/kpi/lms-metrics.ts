import { and, count, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  annualTrainingProgramTable,
  db,
  employeeCompetenciesTable,
  employeesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
  positionsTable,
  trainingEffectivenessReviewsTable,
} from "@workspace/db";

export type LmsMetricKey =
  | "pat_completion"
  | "effectiveness_overall"
  | "mandatory_coverage"
  | "hours_per_employee"
  | "critical_gaps"
  | "expired_trainings";

type Database = Pick<typeof db, "select">;

// último dia do mês (ISO YYYY-MM-DD), UTC-safe.
function endOfMonthIso(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)); // month é 1–12; dia 0 do próximo = último deste
  return d.toISOString().slice(0, 10);
}

function pct(numer: number, denom: number): number | null {
  if (denom === 0) return null;
  return Math.round((numer / denom) * 1000) / 10; // 1 casa
}

// NOTE: duplica a regra de gap crítico do endpoint GET /employees/competency-gaps
// (employees.ts ~1583–1804). Uma futura refatoração poderá extrair para um serviço
// compartilhado, mas está fora do escopo desta task para evitar risco na rota existente.
async function countCriticalGapEmployees(
  orgId: number,
  database: Database,
): Promise<number> {
  const employees = await database
    .select({ id: employeesTable.id, position: employeesTable.position })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, orgId));

  if (employees.length === 0) return 0;

  const positionNames = [
    ...new Set(
      employees
        .map((e) => e.position)
        .filter((v): v is string => !!v),
    ),
  ];

  if (positionNames.length === 0) return 0;

  const positions = await database
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.organizationId, orgId),
        inArray(positionsTable.name, positionNames),
      ),
    );

  if (positions.length === 0) return 0;

  const positionByName = new Map(positions.map((p) => [p.name, p]));
  const positionIds = positions.map((p) => p.id);

  const requirements = await database
    .select()
    .from(positionCompetencyRequirementsTable)
    .where(inArray(positionCompetencyRequirementsTable.positionId, positionIds));

  const requirementsByPositionId = new Map<
    number,
    (typeof positionCompetencyRequirementsTable.$inferSelect)[]
  >();
  for (const req of requirements) {
    const items = requirementsByPositionId.get(req.positionId) || [];
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
    const items = competenciesByEmployeeId.get(comp.employeeId) || [];
    items.push(comp);
    competenciesByEmployeeId.set(comp.employeeId, items);
  }

  // Replica buildCompetencyKey de employees.ts:175
  function normalizeText(v: string | null | undefined): string {
    return (v || "").trim().toLocaleLowerCase("pt-BR");
  }
  function competencyKey(
    name: string | null | undefined,
    type: string | null | undefined,
  ): string {
    return `${normalizeText(name)}::${normalizeText(type) || "habilidade"}`;
  }

  const criticalGapEmployeeIds = new Set<number>();

  for (const employee of employees) {
    const position = employee.position
      ? positionByName.get(employee.position)
      : null;
    if (!position) continue;

    const posReqs = requirementsByPositionId.get(position.id) || [];
    const empComps = competenciesByEmployeeId.get(employee.id) || [];

    // MAX acquiredLevel por chave de competência (replica a lógica do endpoint)
    const compByKey = new Map<
      string,
      typeof employeeCompetenciesTable.$inferSelect
    >();
    for (const comp of empComps) {
      const key = competencyKey(comp.name, comp.type);
      const existing = compByKey.get(key);
      if (!existing || comp.acquiredLevel > existing.acquiredLevel) {
        compByKey.set(key, comp);
      }
    }

    for (const req of posReqs) {
      const key = competencyKey(req.competencyName, req.competencyType);
      const acquired = compByKey.get(key)?.acquiredLevel ?? 0;
      const gapLevel = Math.max(req.requiredLevel - acquired, 0);
      const critical = gapLevel >= 2 || req.requiredLevel >= 4;
      if (gapLevel > 0 && critical) {
        criticalGapEmployeeIds.add(employee.id);
        break; // basta 1 gap crítico para contar o colaborador
      }
    }
  }

  return criticalGapEmployeeIds.size;
}

export async function computeLmsMetric(args: {
  orgId: number;
  metric: LmsMetricKey;
  year: number;
  month: number;
  database: Database;
}): Promise<number | null> {
  const { orgId, metric, year, month, database } = args;

  if (metric === "pat_completion") {
    const rows = await database
      .select({
        total: count(),
        realizadas: sql<number>`count(*) filter (where ${annualTrainingProgramTable.status} = 'realizada')`,
      })
      .from(annualTrainingProgramTable)
      .where(
        and(
          eq(annualTrainingProgramTable.organizationId, orgId),
          eq(annualTrainingProgramTable.year, year),
          sql`(${annualTrainingProgramTable.plannedMonth} is null or ${annualTrainingProgramTable.plannedMonth} <= ${month})`,
        ),
      );
    const r = rows[0];
    return pct(Number(r?.realizadas ?? 0), Number(r?.total ?? 0));
  }

  if (metric === "effectiveness_overall") {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = endOfMonthIso(year, month);
    const rows = await database
      .select({
        total: count(),
        eficazes: sql<number>`count(*) filter (where ${trainingEffectivenessReviewsTable.isEffective} = true)`,
      })
      .from(trainingEffectivenessReviewsTable)
      .innerJoin(
        employeeTrainingsTable,
        eq(trainingEffectivenessReviewsTable.trainingId, employeeTrainingsTable.id),
      )
      .innerJoin(
        employeesTable,
        eq(employeeTrainingsTable.employeeId, employeesTable.id),
      )
      .where(
        and(
          eq(employeesTable.organizationId, orgId),
          gte(trainingEffectivenessReviewsTable.evaluationDate, start),
          lte(trainingEffectivenessReviewsTable.evaluationDate, end),
        ),
      );
    const r = rows[0];
    return pct(Number(r?.eficazes ?? 0), Number(r?.total ?? 0));
  }

  if (metric === "mandatory_coverage") {
    const end = endOfMonthIso(year, month);
    const rows = await database
      .select({
        total: count(),
        concluidos: sql<number>`count(*) filter (where ${employeeTrainingsTable.status} = 'concluido' and (${employeeTrainingsTable.completionDate} is null or ${employeeTrainingsTable.completionDate} <= ${end}))`,
      })
      .from(employeeTrainingsTable)
      .innerJoin(
        employeesTable,
        eq(employeeTrainingsTable.employeeId, employeesTable.id),
      )
      .where(
        and(
          eq(employeesTable.organizationId, orgId),
          isNotNull(employeeTrainingsTable.requirementId),
        ),
      );
    const r = rows[0];
    return pct(Number(r?.concluidos ?? 0), Number(r?.total ?? 0));
  }

  if (metric === "hours_per_employee") {
    const end = endOfMonthIso(year, month);
    const [hoursRow] = await database
      .select({
        hours: sql<number>`coalesce(sum(${employeeTrainingsTable.workloadHours}), 0)`,
      })
      .from(employeeTrainingsTable)
      .innerJoin(
        employeesTable,
        eq(employeeTrainingsTable.employeeId, employeesTable.id),
      )
      .where(
        and(
          eq(employeesTable.organizationId, orgId),
          eq(employeeTrainingsTable.status, "concluido"),
          sql`(${employeeTrainingsTable.completionDate} is null or ${employeeTrainingsTable.completionDate} <= ${end})`,
        ),
      );
    const [empRow] = await database
      .select({ n: count() })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, orgId),
          eq(employeesTable.status, "active"),
        ),
      );
    const n = Number(empRow?.n ?? 0);
    if (n === 0) return null;
    return Math.round((Number(hoursRow?.hours ?? 0) / n) * 10) / 10;
  }

  if (metric === "expired_trainings") {
    const end = endOfMonthIso(year, month);
    const [row] = await database
      .select({ n: count() })
      .from(employeeTrainingsTable)
      .innerJoin(
        employeesTable,
        eq(employeeTrainingsTable.employeeId, employeesTable.id),
      )
      .where(
        and(
          eq(employeesTable.organizationId, orgId),
          isNotNull(employeeTrainingsTable.expirationDate),
          lte(employeeTrainingsTable.expirationDate, end),
          sql`${employeeTrainingsTable.status} <> 'concluido'`,
        ),
      );
    return Number(row?.n ?? 0);
  }

  if (metric === "critical_gaps") {
    // snapshot: só o mês corrente (histórico não é reconstruível a partir dos dados atuais)
    const now = new Date();
    const isCurrent =
      year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
    if (!isCurrent) return null;
    return await countCriticalGapEmployees(orgId, database);
  }

  return null;
}
