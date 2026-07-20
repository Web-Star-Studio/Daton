import { and, count, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import {
  annualTrainingProgramTable,
  db,
  employeesTable,
  employeeTrainingsTable,
  trainingEffectivenessReviewsTable,
} from "@workspace/db";
import { resolveEmployeeCompetencies } from "../aprendizagem/competency-resolver";

export type LmsMetricKey =
  | "pat_completion"
  | "effectiveness_overall"
  | "mandatory_coverage"
  | "hours_per_employee"
  | "critical_gaps"
  | "expired_trainings";

export const LMS_INDICATOR_DEFS: Array<{
  metric: LmsMetricKey;
  name: string;
  measurement: string;
  direction: "up" | "down";
  category: string;
  norms: string[];
  goal: number;
  tolerance: number;
}> = [
  {
    metric: "pat_completion",
    name: "% Cumprimento do PAT",
    measurement: "% de itens do programa anual realizados",
    direction: "up",
    category: "RH",
    norms: ["9001"],
    goal: 80,
    tolerance: 1,
  },
  {
    metric: "effectiveness_overall",
    name: "% Eficácia geral de treinamentos",
    measurement: "% de avaliações de eficácia com resultado eficaz",
    direction: "up",
    category: "RH",
    norms: ["9001"],
    goal: 80,
    tolerance: 1,
  },
  {
    metric: "mandatory_coverage",
    name: "% Cobertura de treinamentos obrigatórios",
    measurement: "% de obrigatoriedades concluídas",
    direction: "up",
    category: "RH",
    norms: ["9001"],
    goal: 100,
    tolerance: 2,
  },
  {
    metric: "hours_per_employee",
    name: "Horas de treinamento por colaborador",
    measurement: "horas acumuladas ÷ colaboradores ativos",
    direction: "up",
    category: "RH",
    norms: ["9001"],
    goal: 20,
    tolerance: 2,
  },
  {
    metric: "critical_gaps",
    name: "Colaboradores com gap crítico",
    measurement: "nº de colaboradores com competência crítica não atendida",
    direction: "down",
    category: "RH",
    norms: ["9001"],
    goal: 0,
    tolerance: 0,
  },
  {
    metric: "expired_trainings",
    name: "Treinamentos vencidos",
    measurement: "nº de treinamentos vencidos e não renovados",
    direction: "down",
    category: "RH",
    norms: ["9001"],
    goal: 0,
    tolerance: 0,
  },
];

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

/**
 * Computes a Map of unitId → count of employees with at least one critical gap.
 * Employees with null unitId are recorded under key -1.
 * Shared by countCriticalGapEmployees (cards) and learning-summary (byUnit table).
 *
 * A regra de gap vive só no resolvedor (`resolveEmployeeCompetencies`) — este
 * helper apenas agrega os `gapStatus === "critical"` por filial.
 * `indeterminado` NÃO conta como crítico: cargo com requisito sem item de
 * catálogo que o comprove é ausência de dado, não lacuna — contá-lo infla o
 * KPI de lacunas críticas por falta de classificação do catálogo, exatamente
 * o bug que o resolvedor corrige.
 */
export async function computeCriticalGapCountsByUnit(
  orgId: number,
  database: Database,
): Promise<Map<number, number>> {
  const gapsByUnit = new Map<number, number>();

  const employees = await database
    .select({
      id: employeesTable.id,
      position: employeesTable.position,
      unitId: employeesTable.unitId,
    })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, orgId));

  if (employees.length === 0) return gapsByUnit;

  const conformanceByEmployee = await resolveEmployeeCompetencies(
    database,
    orgId,
    employees.map((e) => ({ id: e.id, position: e.position })),
  );

  for (const employee of employees) {
    const conformance = conformanceByEmployee.get(employee.id);
    if (conformance?.gapStatus !== "critical") continue;

    const key = employee.unitId ?? -1;
    gapsByUnit.set(key, (gapsByUnit.get(key) ?? 0) + 1);
  }

  return gapsByUnit;
}

async function countCriticalGapEmployees(
  orgId: number,
  database: Database,
): Promise<number> {
  const map = await computeCriticalGapCountsByUnit(orgId, database);
  let total = 0;
  for (const count of map.values()) total += count;
  return total;
}

/**
 * Calcula uma métrica do LMS. `unitId` opcional restringe o cálculo a uma
 * filial; omitido, o escopo é corporativo (comportamento histórico — o módulo
 * KPI depende dele para computar os indicadores da organização).
 *
 * O recorte por filial usa `employees.unit_id` em todas as métricas que partem
 * de treinamentos/colaboradores, e `annual_training_program.unit_id` no PAT.
 */
export async function computeLmsMetric(args: {
  orgId: number;
  metric: LmsMetricKey;
  year: number;
  month: number;
  unitId?: number;
  database: Database;
}): Promise<number | null> {
  const { orgId, metric, year, month, unitId, database } = args;

  // Recorte por filial na tabela de colaboradores — reaproveitado pelas
  // métricas que passam por `employees`.
  const employeeUnitFilter =
    unitId !== undefined ? eq(employeesTable.unitId, unitId) : undefined;

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
          unitId !== undefined
            ? eq(annualTrainingProgramTable.unitId, unitId)
            : undefined,
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
        eq(
          trainingEffectivenessReviewsTable.trainingId,
          employeeTrainingsTable.id,
        ),
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
          employeeUnitFilter,
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
          employeeUnitFilter,
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
          employeeUnitFilter,
        ),
      );
    const [empRow] = await database
      .select({ n: count() })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, orgId),
          eq(employeesTable.status, "active"),
          employeeUnitFilter,
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
          employeeUnitFilter,
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
    if (unitId !== undefined) {
      const byUnit = await computeCriticalGapCountsByUnit(orgId, database);
      return byUnit.get(unitId) ?? 0;
    }
    return await countCriticalGapEmployees(orgId, database);
  }

  return null;
}
