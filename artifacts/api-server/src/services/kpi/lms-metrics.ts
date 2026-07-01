import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import {
  annualTrainingProgramTable,
  db,
  employeesTable,
  employeeTrainingsTable,
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

  return null; // demais métricas nas próximas tasks
}
