import { and, eq, gte, inArray, lt, or, type SQL } from "drizzle-orm";
import { db, actionPlanResponsiblesTable, actionPlansTable } from "@workspace/db";
import {
  classifyUrgency,
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

/** Janela [início do dia de `now`, início do dia seguinte) para filtrar "hoje". */
export function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
};

type PlanRow = {
  id: number;
  code: string | null;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  closedAt: Date | null;
  responsibleUserId: number | null;
};

/**
 * Planos com AO MENOS UM responsável (ponto focal ou co-responsável) dentro do
 * escopo, já com TODOS os responsáveis de cada um.
 *
 * Duas consultas de propósito: a primeira decide quais planos entram (pertinência
 * ao escopo), a segunda descreve quem responde por eles. Um JOIN só traria apenas
 * os responsáveis do escopo, e a UI mostraria um time incompleto.
 */
async function loadScopedPlans(
  ctx: PendenciaProviderContext,
  statuses: ("open" | "in_progress" | "completed" | "cancelled")[],
  extraConditions: SQL[] = [],
): Promise<{ plans: PlanRow[]; coByPlan: Map<number, number[]> }> {
  const scopeMatch = or(
    inArray(actionPlansTable.responsibleUserId, ctx.responsibleUserIds),
    inArray(actionPlansTable.id,
      db
        .select({ id: actionPlanResponsiblesTable.actionPlanId })
        .from(actionPlanResponsiblesTable)
        .where(inArray(actionPlanResponsiblesTable.userId, ctx.responsibleUserIds)),
    ),
  )!;

  const plans = await db
    .select({
      id: actionPlansTable.id,
      code: actionPlansTable.code,
      title: actionPlansTable.title,
      status: actionPlansTable.status,
      priority: actionPlansTable.priority,
      dueDate: actionPlansTable.dueDate,
      closedAt: actionPlansTable.closedAt,
      responsibleUserId: actionPlansTable.responsibleUserId,
    })
    .from(actionPlansTable)
    .where(
      and(
        eq(actionPlansTable.organizationId, ctx.orgId),
        inArray(actionPlansTable.status, statuses),
        scopeMatch,
        ...extraConditions,
      ),
    );

  if (plans.length === 0) return { plans: [], coByPlan: new Map() };

  const coRows = await db
    .select({
      planId: actionPlanResponsiblesTable.actionPlanId,
      userId: actionPlanResponsiblesTable.userId,
    })
    .from(actionPlanResponsiblesTable)
    .where(inArray(actionPlanResponsiblesTable.actionPlanId, plans.map((p) => p.id)));

  const coByPlan = new Map<number, number[]>();
  for (const r of coRows) {
    const bucket = coByPlan.get(r.planId) ?? [];
    bucket.push(r.userId);
    coByPlan.set(r.planId, bucket);
  }

  return { plans, coByPlan };
}

/** Todos os responsáveis do plano: ponto focal + co-responsáveis, deduplicados e ordenados. */
function allResponsibles(plan: PlanRow, coByPlan: Map<number, number[]>): number[] {
  return [
    ...new Set([
      ...(plan.responsibleUserId != null ? [plan.responsibleUserId] : []),
      ...(coByPlan.get(plan.id) ?? []),
    ]),
  ].sort((a, b) => a - b);
}

/** O responsável que EXPLICA a linha estar na lista do solicitante: o menor id
 *  entre os que casam com o escopo. Determinístico. */
function matchedResponsible(all: number[], scope: number[]): number {
  const inScope = all.filter((id) => scope.includes(id));
  return (inScope.length > 0 ? inScope : all)[0];
}

export const actionPlanPendenciaProvider: PendenciaProvider = {
  source: "action_plan",

  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { plans, coByPlan } = await loadScopedPlans(ctx, ["open", "in_progress"]);

    return plans.map((p): Pendencia => {
      const all = allResponsibles(p, coByPlan);
      const dueIso = p.dueDate ? p.dueDate.toISOString() : null;
      return {
        id: `action_plan:${p.id}`,
        source: "action_plan",
        sourceLabel: SOURCE_LABELS.action_plan,
        title: p.title,
        subtitle: p.code ?? undefined,
        statusLabel: STATUS_LABELS[p.status] ?? p.status,
        dueDate: dueIso,
        urgency: classifyUrgency(dueIso, ctx.now, ctx.dueSoonDays),
        responsibleUserId: matchedResponsible(all, ctx.responsibleUserIds),
        responsibleUserIds: all,
        link: { route: `/planos-acao/${p.id}`, ctaLabel: "Ver plano" },
        meta: { code: p.code, priority: p.priority, status: p.status },
      };
    });
  },

  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);
    const { plans, coByPlan } = await loadScopedPlans(
      ctx,
      ["completed", "cancelled"],
      [gte(actionPlansTable.closedAt, start), lt(actionPlansTable.closedAt, end)],
    );

    return plans.map((p): Pendencia => {
      const all = allResponsibles(p, coByPlan);
      return {
        id: `action_plan:${p.id}`,
        source: "action_plan",
        sourceLabel: SOURCE_LABELS.action_plan,
        title: p.title,
        subtitle: p.code ?? undefined,
        statusLabel: "Encerrado hoje",
        dueDate: p.closedAt ? p.closedAt.toISOString() : null,
        urgency: "no_due",
        responsibleUserId: matchedResponsible(all, ctx.responsibleUserIds),
        responsibleUserIds: all,
        link: { route: `/planos-acao/${p.id}`, ctaLabel: "Ver plano" },
        meta: { code: p.code, status: p.status, completed: true },
      };
    });
  },
};
