import { and, eq, type SQL } from "drizzle-orm";
import { actionPlansTable, db } from "@workspace/db";
import { gutScore } from "./gut";

export type ActionPlanSummary = {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  bySourceModule: Record<string, number>;
  byActionType: Record<string, number>;
  overdue: number;
  dueSoon: number;
  completedThisMonth: number;
  effectivenessRatePct: number | null;
  avgCompletionDays: number | null;
  gutAverage: number | null;
  odsDistribution: { ods: number; count: number }[];
  effectivenessEvolution: { year: number; month: number; ratePct: number | null }[];
};

const MS_PER_DAY = 86_400_000;

function bump(map: Record<string, number>, key: string | null | undefined) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

/** Aggregate the org's action plans into dashboard metrics. Computed in JS over
 * the org-scoped rows (hundreds at most), mirroring how KPI dashboards aggregate
 * from a list response rather than via bespoke SQL.
 *
 * `visibility` (opcional) é a condição de escopo por papel do solicitante — as
 * contagens têm de refletir o MESMO recorte da listagem, senão o operador vê
 * "vencidas: 12" e só 1 plano na lista. undefined = sem restrição (admin/analista).
 */
export async function computeActionPlanSummary(
  orgId: number,
  visibility?: SQL,
): Promise<ActionPlanSummary> {
  const rows = await db
    .select({
      status: actionPlansTable.status,
      priority: actionPlansTable.priority,
      sourceModule: actionPlansTable.sourceModule,
      actionType: actionPlansTable.actionType,
      dueDate: actionPlansTable.dueDate,
      createdAt: actionPlansTable.createdAt,
      completedAt: actionPlansTable.correctiveActionCompletedAt,
      closedAt: actionPlansTable.closedAt,
      effectivenessResult: actionPlansTable.effectivenessResult,
      effectivenessCheckedAt: actionPlansTable.effectivenessCheckedAt,
      gutGravity: actionPlansTable.gutGravity,
      gutUrgency: actionPlansTable.gutUrgency,
      gutTendency: actionPlansTable.gutTendency,
      odsNumbers: actionPlansTable.odsNumbers,
    })
    .from(actionPlansTable)
    .where(visibility ? and(eq(actionPlansTable.organizationId, orgId), visibility) : eq(actionPlansTable.organizationId, orgId));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueSoonLimit = new Date(startOfToday.getTime() + 7 * MS_PER_DAY);
  const curYear = now.getFullYear();
  const curMonth = now.getMonth(); // 0-indexed

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const bySourceModule: Record<string, number> = {};
  const byActionType: Record<string, number> = {};
  const odsCounts = new Map<number, number>();

  let overdue = 0;
  let dueSoon = 0;
  let completedThisMonth = 0;
  let effective = 0;
  let ineffective = 0;
  let completionDaysSum = 0;
  let completionDaysCount = 0;
  let gutSum = 0;
  let gutCount = 0;

  // Last 6 months (oldest→newest), keyed for the evolution series.
  const evoBuckets: { year: number; month: number; effective: number; ineffective: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(curYear, curMonth - i, 1);
    evoBuckets.push({ year: d.getFullYear(), month: d.getMonth() + 1, effective: 0, ineffective: 0 });
  }
  const evoIndex = new Map(evoBuckets.map((b, i) => [`${b.year}-${b.month}`, i]));

  for (const r of rows) {
    bump(byStatus, r.status);
    bump(byPriority, r.priority);
    bump(bySourceModule, r.sourceModule);
    bump(byActionType, r.actionType);

    const isOpen = r.status !== "completed" && r.status !== "cancelled";
    if (isOpen && r.dueDate) {
      if (r.dueDate < startOfToday) overdue++;
      else if (r.dueDate < dueSoonLimit) dueSoon++;
    }

    const completedAt = r.completedAt ?? (r.status === "completed" ? r.closedAt : null);
    if (r.status === "completed" && completedAt) {
      if (completedAt.getFullYear() === curYear && completedAt.getMonth() === curMonth) {
        completedThisMonth++;
      }
      const days = (completedAt.getTime() - r.createdAt.getTime()) / MS_PER_DAY;
      if (days >= 0) {
        completionDaysSum += days;
        completionDaysCount++;
      }
    }

    if (r.effectivenessResult === "effective") effective++;
    else if (r.effectivenessResult === "ineffective") ineffective++;

    if (r.effectivenessCheckedAt && (r.effectivenessResult === "effective" || r.effectivenessResult === "ineffective")) {
      const key = `${r.effectivenessCheckedAt.getFullYear()}-${r.effectivenessCheckedAt.getMonth() + 1}`;
      const idx = evoIndex.get(key);
      if (idx !== undefined) {
        if (r.effectivenessResult === "effective") evoBuckets[idx].effective++;
        else evoBuckets[idx].ineffective++;
      }
    }

    const score = gutScore(r.gutGravity, r.gutUrgency, r.gutTendency);
    if (score !== null) {
      gutSum += score;
      gutCount++;
    }

    for (const ods of r.odsNumbers ?? []) {
      odsCounts.set(ods, (odsCounts.get(ods) ?? 0) + 1);
    }
  }

  const evaluated = effective + ineffective;

  return {
    total: rows.length,
    byStatus,
    byPriority,
    bySourceModule,
    byActionType,
    overdue,
    dueSoon,
    completedThisMonth,
    effectivenessRatePct: evaluated > 0 ? (effective / evaluated) * 100 : null,
    avgCompletionDays: completionDaysCount > 0 ? completionDaysSum / completionDaysCount : null,
    gutAverage: gutCount > 0 ? gutSum / gutCount : null,
    odsDistribution: [...odsCounts.entries()]
      .map(([ods, count]) => ({ ods, count }))
      .sort((a, b) => b.count - a.count || a.ods - b.ods),
    effectivenessEvolution: evoBuckets.map((b) => {
      const n = b.effective + b.ineffective;
      return { year: b.year, month: b.month, ratePct: n > 0 ? (b.effective / n) * 100 : null };
    }),
  };
}
