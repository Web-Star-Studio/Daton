import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db, regulatoryDocumentsTable, regulatoryDocumentRenewalsTable } from "@workspace/db";
import {
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
  type PendenciaUrgency,
} from "../types";
import { dayBounds } from "./action-plans";

export const regulatoryDocumentPendenciaProvider: PendenciaProvider = {
  source: "regulatory_document",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const rows = await db
      .select({
        id: regulatoryDocumentsTable.id,
        identifierType: regulatoryDocumentsTable.identifierType,
        documentNumber: regulatoryDocumentsTable.documentNumber,
        status: regulatoryDocumentsTable.status,
        expirationDate: regulatoryDocumentsTable.expirationDate,
        responsibleUserId: regulatoryDocumentsTable.responsibleUserId,
      })
      .from(regulatoryDocumentsTable)
      .where(
        and(
          eq(regulatoryDocumentsTable.organizationId, ctx.orgId),
          isNotNull(regulatoryDocumentsTable.responsibleUserId),
          inArray(regulatoryDocumentsTable.responsibleUserId, ctx.responsibleUserIds),
          inArray(regulatoryDocumentsTable.status, ["a_vencer", "vencido"]),
        ),
      );

    return rows
      .filter((r) => r.responsibleUserId !== null)
      .map((r): Pendencia => {
        const urgency: PendenciaUrgency = r.status === "vencido" ? "overdue" : "due_soon";
        return {
          id: `regulatory_document:${r.id}`,
          source: "regulatory_document",
          sourceLabel: SOURCE_LABELS.regulatory_document,
          title: r.documentNumber
            ? `${r.identifierType} ${r.documentNumber}`
            : r.identifierType,
          statusLabel: r.status === "vencido" ? "Vencido" : "A vencer",
          dueDate: r.expirationDate,
          urgency,
          responsibleUserId: r.responsibleUserId as number,
          link: { route: "/qualidade/regulatorios", ctaLabel: "Renovar" },
          meta: { documentId: r.id, status: r.status },
        };
      });
  },

  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);
    const rows = await db
      .select({
        docId: regulatoryDocumentsTable.id,
        identifierType: regulatoryDocumentsTable.identifierType,
        documentNumber: regulatoryDocumentsTable.documentNumber,
        responsibleUserId: regulatoryDocumentsTable.responsibleUserId,
      })
      .from(regulatoryDocumentRenewalsTable)
      .innerJoin(
        regulatoryDocumentsTable,
        eq(regulatoryDocumentRenewalsTable.documentId, regulatoryDocumentsTable.id),
      )
      .where(
        and(
          eq(regulatoryDocumentRenewalsTable.organizationId, ctx.orgId),
          eq(regulatoryDocumentRenewalsTable.status, "renovado"),
          gte(regulatoryDocumentRenewalsTable.updatedAt, start),
          lt(regulatoryDocumentRenewalsTable.updatedAt, end),
          isNotNull(regulatoryDocumentsTable.responsibleUserId),
          inArray(regulatoryDocumentsTable.responsibleUserId, ctx.responsibleUserIds),
        ),
      );
    return rows
      .filter((r) => r.responsibleUserId !== null)
      .map((r): Pendencia => ({
        id: `regulatory_document:${r.docId}`,
        source: "regulatory_document",
        sourceLabel: SOURCE_LABELS.regulatory_document,
        title: r.documentNumber ? `${r.identifierType} ${r.documentNumber}` : r.identifierType,
        statusLabel: "Renovado hoje",
        dueDate: `${ctx.now.getFullYear()}-${String(ctx.now.getMonth() + 1).padStart(2, "0")}-${String(ctx.now.getDate()).padStart(2, "0")}`,
        urgency: "no_due",
        responsibleUserId: r.responsibleUserId as number,
        link: { route: "/qualidade/regulatorios", ctaLabel: "Ver" },
        meta: { documentId: r.docId, completed: true },
      }));
  },
};
