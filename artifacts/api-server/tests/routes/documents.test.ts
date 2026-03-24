import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  documentCriticalAnalysisTable,
  documentsTable,
  notificationsTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => cleanupTestContext(context)));
});

async function createDocumentForTest(context: TestOrgContext, options?: {
  criticalReviewerIds?: number[];
  approverIds?: number[];
  recipientIds?: number[];
}) {
  const employee = await createEmployee(context, {
    name: `Elaborador ${context.prefix}`,
  });
  const criticalReviewer =
    options?.criticalReviewerIds?.[0] !== undefined
      ? null
      : await createTestUser(context, {
          role: "analyst",
          suffix: "critical-reviewer",
          modules: ["documents"],
        });
  const approver =
    options?.approverIds?.[0] !== undefined
      ? null
      : await createTestUser(context, {
          role: "operator",
          suffix: "approver",
          modules: ["documents"],
        });
  const recipient =
    options?.recipientIds?.[0] !== undefined
      ? null
      : await createTestUser(context, {
          role: "operator",
          suffix: "recipient",
          modules: ["documents"],
        });

  const response = await request(app)
    .post(`/api/organizations/${context.organizationId}/documents`)
    .set(authHeader(context))
    .send({
      title: `Documento ${context.prefix}`,
      type: "manual",
      validityDate: "2030-01-01",
      elaboratorIds: [employee.id],
      criticalReviewerIds: options?.criticalReviewerIds ?? [criticalReviewer!.id],
      approverIds: options?.approverIds ?? [approver!.id],
      recipientIds: options?.recipientIds ?? [recipient!.id],
    });

  expect(response.status).toBe(201);

  return {
    document: response.body as { id: number; status: string },
    employee,
    criticalReviewer,
    approver,
    recipient,
  };
}

describe("documents routes", () => {
  it("rejects critical reviewers from another organization", async () => {
    const context = await createTestContext({ seed: "documents-critical-reviewer-validation" });
    const foreignContext = await createTestContext({ seed: "documents-critical-reviewer-foreign" });
    contexts.push(context, foreignContext);

    const employee = await createEmployee(context, {
      name: `Elaborador ${context.prefix}`,
    });
    const foreignReviewer = await createTestUser(foreignContext, {
      role: "analyst",
      suffix: "foreign-critical-reviewer",
      modules: ["documents"],
    });
    const approver = await createTestUser(context, {
      role: "operator",
      suffix: "approver",
      modules: ["documents"],
    });

    const response = await request(app)
      .post(`/api/organizations/${context.organizationId}/documents`)
      .set(authHeader(context))
      .send({
        title: `Documento ${context.prefix}`,
        type: "manual",
        validityDate: "2030-01-01",
        elaboratorIds: [employee.id],
        criticalReviewerIds: [foreignReviewer.id],
        approverIds: [approver.id],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("não pertencem a esta organização");
  });

  it("blocks submit until critical analysis is completed and allows designated analysts to complete it", async () => {
    const context = await createTestContext({ seed: "documents-critical-analysis-submit" });
    contexts.push(context);

    const { document, criticalReviewer } = await createDocumentForTest(context);

    const submitBeforeCompletion = await request(app)
      .post(`/api/organizations/${context.organizationId}/documents/${document.id}/submit`)
      .set(authHeader(context))
      .send({ changeDescription: "Versão inicial" });

    expect(submitBeforeCompletion.status).toBe(400);
    expect(submitBeforeCompletion.body.error).toContain("análise crítica");

    const completeResponse = await request(app)
      .post(`/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`)
      .set({ Authorization: `Bearer ${criticalReviewer!.token}` })
      .send({});

    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.criticalReviewers[0].status).toBe("completed");

    const submitAfterCompletion = await request(app)
      .post(`/api/organizations/${context.organizationId}/documents/${document.id}/submit`)
      .set(authHeader(context))
      .send({ changeDescription: "Versão inicial" });

    expect(submitAfterCompletion.status).toBe(200);
    expect(submitAfterCompletion.body.status).toBe("in_review");
  });

  it("forbids non-designated users from completing the critical analysis", async () => {
    const context = await createTestContext({ seed: "documents-critical-analysis-auth" });
    contexts.push(context);

    const outsider = await createTestUser(context, {
      role: "analyst",
      suffix: "outsider",
      modules: ["documents"],
    });
    const { document } = await createDocumentForTest(context);

    const response = await request(app)
      .post(`/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`)
      .set({ Authorization: `Bearer ${outsider.token}` })
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("responsável ativo");
  });

  it("returns the document to draft and recreates the critical analysis cycle after rejection", async () => {
    const context = await createTestContext({ seed: "documents-critical-analysis-rework" });
    contexts.push(context);

    const { document, criticalReviewer, approver } = await createDocumentForTest(context);

    await request(app)
      .post(`/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`)
      .set({ Authorization: `Bearer ${criticalReviewer!.token}` })
      .send({})
      .expect(200);

    await request(app)
      .post(`/api/organizations/${context.organizationId}/documents/${document.id}/submit`)
      .set(authHeader(context))
      .send({ changeDescription: "Versão inicial" })
      .expect(200);

    const rejectResponse = await request(app)
      .post(`/api/organizations/${context.organizationId}/documents/${document.id}/reject`)
      .set({ Authorization: `Bearer ${approver!.token}` })
      .send({ comment: "Precisa ajustar o conteúdo" });

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.status).toBe("draft");
    expect(rejectResponse.body.criticalReviewers[0].status).toBe("pending");

    const [storedDocument] = await db
      .select({ status: documentsTable.status })
      .from(documentsTable)
      .where(eq(documentsTable.id, document.id));
    expect(storedDocument?.status).toBe("draft");

    const cycles = await db
      .select({
        analysisCycle: documentCriticalAnalysisTable.analysisCycle,
        status: documentCriticalAnalysisTable.status,
      })
      .from(documentCriticalAnalysisTable)
      .where(
        and(
          eq(documentCriticalAnalysisTable.documentId, document.id),
          eq(documentCriticalAnalysisTable.userId, criticalReviewer!.id),
        ),
      )
      .orderBy(desc(documentCriticalAnalysisTable.analysisCycle));

    expect(cycles[0]?.analysisCycle).toBeGreaterThanOrEqual(2);
    expect(cycles[0]?.status).toBe("pending");
    expect(cycles.some((cycle) => cycle.status === "completed")).toBe(true);
  });

  it("does not notify approvers before the document is submitted for review", async () => {
    const context = await createTestContext({ seed: "documents-draft-update-notifications" });
    contexts.push(context);

    const { document, approver } = await createDocumentForTest(context);

    const updateResponse = await request(app)
      .patch(`/api/organizations/${context.organizationId}/documents/${document.id}`)
      .set(authHeader(context))
      .send({
        title: `Documento ${context.prefix} atualizado`,
      });

    expect(updateResponse.status).toBe(200);

    const approverNotifications = await db
      .select({
        id: notificationsTable.id,
        type: notificationsTable.type,
      })
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, approver!.id));

    expect(
      approverNotifications.some((notification) => notification.type === "document_updated"),
    ).toBe(false);
    expect(
      approverNotifications.some(
        (notification) => notification.type === "document_review",
      ),
    ).toBe(false);
  });
});
