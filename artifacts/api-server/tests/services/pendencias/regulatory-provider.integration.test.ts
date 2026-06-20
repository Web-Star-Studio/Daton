import { afterEach, describe, expect, it } from "vitest";
import { db, regulatoryDocumentsTable, regulatoryDocumentRenewalsTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { regulatoryDocumentPendenciaProvider } from "../../../src/services/pendencias/providers/regulatory-documents";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("regulatoryDocumentPendenciaProvider", () => {
  it("maps vencido→overdue and a_vencer→due_soon; ignores vigente", async () => {
    const ctx = await createTestContext({ seed: "pend-reg" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);

    const seed = async (status: string, expirationDate: string) => {
      const [row] = await db
        .insert(regulatoryDocumentsTable)
        .values({
          organizationId: ctx.organizationId,
          unitId: unit.id,
          identifierType: "alvara",
          issuingBody: "Prefeitura",
          responsibleUserId: ctx.userId,
          expirationDate,
          status,
        })
        .returning({ id: regulatoryDocumentsTable.id });
      return row.id;
    };

    const vencidoId = await seed("vencido", "2026-05-01");
    const aVencerId = await seed("a_vencer", "2026-07-01");
    await seed("vigente", "2027-01-01");

    const items = await regulatoryDocumentPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: new Date(2026, 5, 15),
      dueSoonDays: 7,
    });

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(items).toHaveLength(2);
    expect(byId.get(`regulatory_document:${vencidoId}`)?.urgency).toBe("overdue");
    expect(byId.get(`regulatory_document:${aVencerId}`)?.urgency).toBe("due_soon");
    expect(byId.get(`regulatory_document:${vencidoId}`)?.dueDate).toBe("2026-05-01");
    expect(byId.get(`regulatory_document:${aVencerId}`)?.link.route).toBe("/qualidade/regulatorios");
  });

  it("listCompletedToday returns renewals marked renovado today", async () => {
    const ctx = await createTestContext({ seed: "pend-reg-done" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const [doc] = await db
      .insert(regulatoryDocumentsTable)
      .values({
        organizationId: ctx.organizationId,
        unitId: unit.id,
        identifierType: "alvara",
        issuingBody: "Prefeitura",
        responsibleUserId: ctx.userId,
        expirationDate: "2026-07-01",
        status: "a_vencer",
      })
      .returning({ id: regulatoryDocumentsTable.id });
    await db.insert(regulatoryDocumentRenewalsTable).values({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      status: "renovado",
      updatedAt: new Date(2026, 5, 15, 9, 0, 0),
    });

    const items = await regulatoryDocumentPendenciaProvider.listCompletedToday!({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now,
      dueSoonDays: 7,
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`regulatory_document:${doc.id}`);
    expect(items[0].statusLabel).toBe("Renovado hoje");
  });
});
