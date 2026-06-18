import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, actionPlansTable } from "@workspace/db";
import {
  classifyUrgency,
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
};

export const actionPlanPendenciaProvider: PendenciaProvider = {
  source: "action_plan",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const rows = await db
      .select({
        id: actionPlansTable.id,
        code: actionPlansTable.code,
        title: actionPlansTable.title,
        status: actionPlansTable.status,
        priority: actionPlansTable.priority,
        dueDate: actionPlansTable.dueDate,
        responsibleUserId: actionPlansTable.responsibleUserId,
      })
      .from(actionPlansTable)
      .where(
        and(
          eq(actionPlansTable.organizationId, ctx.orgId),
          isNotNull(actionPlansTable.responsibleUserId),
          inArray(actionPlansTable.responsibleUserId, ctx.responsibleUserIds),
          inArray(actionPlansTable.status, ["open", "in_progress"]),
        ),
      );

    return rows
      .filter((r) => r.responsibleUserId !== null)
      .map((r): Pendencia => {
        const dueIso = r.dueDate ? r.dueDate.toISOString() : null;
        return {
          id: `action_plan:${r.id}`,
          source: "action_plan",
          sourceLabel: SOURCE_LABELS.action_plan,
          title: r.title,
          subtitle: r.code ?? undefined,
          statusLabel: STATUS_LABELS[r.status] ?? r.status,
          dueDate: dueIso,
          urgency: classifyUrgency(dueIso, ctx.now, ctx.dueSoonDays),
          responsibleUserId: r.responsibleUserId as number,
          link: { route: `/app/planos-acao/${r.id}`, ctaLabel: "Ver plano" },
          meta: { code: r.code, priority: r.priority, status: r.status },
        };
      });
  },
};
