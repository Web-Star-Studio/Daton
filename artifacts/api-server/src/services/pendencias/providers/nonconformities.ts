import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { db, nonconformitiesTable, correctiveActionsTable } from "@workspace/db";
import {
  classifyUrgency,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

const NC_STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  under_analysis: "Em análise",
  action_in_progress: "Ação em andamento",
  awaiting_effectiveness: "Aguardando eficácia",
};

const NC_ROUTE = "/app/governanca/nao-conformidades";

export const nonconformityPendenciaProvider: PendenciaProvider = {
  source: "nonconformity",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];

    const ncs = await db
      .select({
        id: nonconformitiesTable.id,
        title: nonconformitiesTable.title,
        status: nonconformitiesTable.status,
        responsibleUserId: nonconformitiesTable.responsibleUserId,
      })
      .from(nonconformitiesTable)
      .where(
        and(
          eq(nonconformitiesTable.organizationId, ctx.orgId),
          isNotNull(nonconformitiesTable.responsibleUserId),
          inArray(nonconformitiesTable.responsibleUserId, ctx.responsibleUserIds),
          notInArray(nonconformitiesTable.status, ["closed", "canceled"]),
        ),
      );

    const cas = await db
      .select({
        id: correctiveActionsTable.id,
        title: correctiveActionsTable.title,
        status: correctiveActionsTable.status,
        dueDate: correctiveActionsTable.dueDate,
        responsibleUserId: correctiveActionsTable.responsibleUserId,
        nonconformityId: correctiveActionsTable.nonconformityId,
      })
      .from(correctiveActionsTable)
      .where(
        and(
          eq(correctiveActionsTable.organizationId, ctx.orgId),
          isNotNull(correctiveActionsTable.responsibleUserId),
          inArray(correctiveActionsTable.responsibleUserId, ctx.responsibleUserIds),
          notInArray(correctiveActionsTable.status, ["done", "canceled"]),
        ),
      );

    const items: Pendencia[] = [];

    for (const nc of ncs) {
      if (nc.responsibleUserId === null) continue;
      items.push({
        id: `nonconformity:${nc.id}`,
        source: "nonconformity",
        sourceLabel: "Não conformidade",
        title: nc.title,
        statusLabel: NC_STATUS_LABELS[nc.status] ?? nc.status,
        dueDate: null,
        urgency: "no_due",
        responsibleUserId: nc.responsibleUserId,
        link: { route: NC_ROUTE, ctaLabel: "Tratar" },
        meta: { nonconformityId: nc.id, status: nc.status },
      });
    }

    for (const ca of cas) {
      if (ca.responsibleUserId === null) continue;
      items.push({
        id: `corrective_action:${ca.id}`,
        source: "nonconformity",
        sourceLabel: "Ação corretiva",
        title: ca.title,
        statusLabel: ca.dueDate ? `Prazo ${ca.dueDate}` : "Sem prazo",
        dueDate: ca.dueDate ?? null,
        urgency: classifyUrgency(ca.dueDate ?? null, ctx.now, ctx.dueSoonDays),
        responsibleUserId: ca.responsibleUserId,
        link: { route: NC_ROUTE, ctaLabel: "Responder" },
        meta: { correctiveActionId: ca.id, nonconformityId: ca.nonconformityId, status: ca.status },
      });
    }

    return items;
  },
};
