import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, regulatoryDocumentsTable } from "@workspace/db";
import {
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
  type PendenciaUrgency,
} from "../types";

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
          link: { route: "/app/qualidade/regulatorios", ctaLabel: "Renovar" },
          meta: { documentId: r.id, status: r.status },
        };
      });
  },
};
