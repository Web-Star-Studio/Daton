import { and, eq, gte, inArray, isNotNull, lt, not, or } from "drizzle-orm";
import { db, actionPlanActionsTable, actionPlansTable } from "@workspace/db";
import {
  classifyUrgency,
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";
import { dayBounds } from "./action-plans";

const STATUS_LABELS: Record<string, string> = {
  open: "Pendente",
  in_progress: "Em andamento",
};

/**
 * As AÇÕES do plano, para quem as executa.
 *
 * Distinto do provider de plano, que segue existindo para o responsável do PLANO: conduzir
 * o plano e executar uma ação são coisas diferentes, e quem acumula os dois papéis vê os
 * dois itens.
 */
export const actionPlanActionPendenciaProvider: PendenciaProvider = {
  source: "action_plan_action",

  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const rows = await db
      .select({
        id: actionPlanActionsTable.id,
        what: actionPlanActionsTable.what,
        status: actionPlanActionsTable.status,
        dueDate: actionPlanActionsTable.dueDate,
        responsibleUserId: actionPlanActionsTable.responsibleUserId,
        planId: actionPlansTable.id,
        planCode: actionPlansTable.code,
        planTitle: actionPlansTable.title,
      })
      .from(actionPlanActionsTable)
      .innerJoin(actionPlansTable, eq(actionPlanActionsTable.actionPlanId, actionPlansTable.id))
      .where(
        and(
          eq(actionPlanActionsTable.organizationId, ctx.orgId),
          isNotNull(actionPlanActionsTable.responsibleUserId),
          inArray(actionPlanActionsTable.responsibleUserId, ctx.responsibleUserIds),
          inArray(actionPlanActionsTable.status, ["open", "in_progress"]),
          // Plano encerrado trava a edição da ação (409). Surgir aqui viraria pendência
          // sem saída: o usuário não consegue concluir nem remover. Espelha
          // `isActionPlanEncerrado`: cancelado, ou concluído COM veredito de eficácia.
          not(
            or(
              eq(actionPlansTable.status, "cancelled"),
              and(
                eq(actionPlansTable.status, "completed"),
                inArray(actionPlansTable.effectivenessResult, ["effective", "ineffective"]),
              ),
            )!,
          ),
        ),
      );

    return rows.map((r): Pendencia => {
      const dueIso = r.dueDate ? r.dueDate.toISOString() : null;
      return {
        id: `action_plan_action:${r.id}`,
        source: "action_plan_action",
        sourceLabel: SOURCE_LABELS.action_plan_action,
        title: r.what?.trim() || "Ação sem enunciado",
        subtitle: r.planCode ?? r.planTitle,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        dueDate: dueIso,
        urgency: classifyUrgency(dueIso, ctx.now, ctx.dueSoonDays),
        responsibleUserId: r.responsibleUserId as number,
        link: { route: `/planos-acao/${r.planId}#acao-${r.id}`, ctaLabel: "Ver ação" },
        meta: { planId: r.planId, planCode: r.planCode, status: r.status },
      };
    });
  },

  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);
    const rows = await db
      .select({
        id: actionPlanActionsTable.id,
        what: actionPlanActionsTable.what,
        completedAt: actionPlanActionsTable.completedAt,
        responsibleUserId: actionPlanActionsTable.responsibleUserId,
        planId: actionPlansTable.id,
        planCode: actionPlansTable.code,
      })
      .from(actionPlanActionsTable)
      .innerJoin(actionPlansTable, eq(actionPlanActionsTable.actionPlanId, actionPlansTable.id))
      .where(
        and(
          eq(actionPlanActionsTable.organizationId, ctx.orgId),
          isNotNull(actionPlanActionsTable.responsibleUserId),
          inArray(actionPlanActionsTable.responsibleUserId, ctx.responsibleUserIds),
          eq(actionPlanActionsTable.status, "completed"),
          gte(actionPlanActionsTable.completedAt, start),
          lt(actionPlanActionsTable.completedAt, end),
        ),
      );

    return rows.map(
      (r): Pendencia => ({
        id: `action_plan_action:${r.id}`,
        source: "action_plan_action",
        sourceLabel: SOURCE_LABELS.action_plan_action,
        title: r.what?.trim() || "Ação sem enunciado",
        subtitle: r.planCode ?? undefined,
        statusLabel: "Concluída hoje",
        dueDate: r.completedAt ? r.completedAt.toISOString() : null,
        urgency: "no_due",
        responsibleUserId: r.responsibleUserId as number,
        link: { route: `/planos-acao/${r.planId}#acao-${r.id}`, ctaLabel: "Ver ação" },
        meta: { planId: r.planId, completed: true },
      }),
    );
  },
};
