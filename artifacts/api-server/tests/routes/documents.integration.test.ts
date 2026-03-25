import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  db,
  documentCriticalAnalysisTable,
  documentsTable,
  notificationsTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const { createCompletionMock } = vi.hoisted(() => ({
  createCompletionMock: vi.fn(),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: createCompletionMock,
      },
    },
  },
}));

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
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

async function createDocumentForTest(
  context: TestOrgContext,
  options?: {
    criticalReviewerIds?: number[];
    approverIds?: number[];
    recipientIds?: number[];
    type?: "manual" | "politica";
    normativeRequirements?: string[];
    referenceIds?: number[];
  },
) {
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
      type: options?.type ?? "manual",
      validityDate: "2030-01-01",
      elaboratorIds: [employee.id],
      criticalReviewerIds: options?.criticalReviewerIds ?? [
        criticalReviewer!.id,
      ],
      approverIds: options?.approverIds ?? [approver!.id],
      recipientIds: options?.recipientIds ?? [recipient!.id],
      normativeRequirements: options?.normativeRequirements,
      referenceIds: options?.referenceIds,
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
  beforeEach(() => {
    createCompletionMock.mockReset();
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '{"suggestions":[]}' } }],
    });
  });

  it("rejects critical reviewers from another organization", async () => {
    const context = await createTestContext({
      seed: "documents-critical-reviewer-validation",
    });
    const foreignContext = await createTestContext({
      seed: "documents-critical-reviewer-foreign",
    });
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
    const context = await createTestContext({
      seed: "documents-critical-analysis-submit",
    });
    contexts.push(context);

    const { document, criticalReviewer } = await createDocumentForTest(context);

    const submitBeforeCompletion = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/submit`,
      )
      .set(authHeader(context))
      .send({ changeDescription: "Versão inicial" });

    expect(submitBeforeCompletion.status).toBe(400);
    expect(submitBeforeCompletion.body.error).toContain("análise crítica");

    const completeResponse = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`,
      )
      .set({ Authorization: `Bearer ${criticalReviewer!.token}` })
      .send({});

    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.criticalReviewers[0].status).toBe("completed");

    const submitAfterCompletion = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/submit`,
      )
      .set(authHeader(context))
      .send({ changeDescription: "Versão inicial" });

    expect(submitAfterCompletion.status).toBe(200);
    expect(submitAfterCompletion.body.status).toBe("in_review");
  });

  it("forbids non-designated users from completing the critical analysis", async () => {
    const context = await createTestContext({
      seed: "documents-critical-analysis-auth",
    });
    contexts.push(context);

    const outsider = await createTestUser(context, {
      role: "analyst",
      suffix: "outsider",
      modules: ["documents"],
    });
    const { document } = await createDocumentForTest(context);

    const response = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`,
      )
      .set({ Authorization: `Bearer ${outsider.token}` })
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("responsável ativo");
  });

  it("returns the document to draft and recreates the critical analysis cycle after rejection", async () => {
    const context = await createTestContext({
      seed: "documents-critical-analysis-rework",
    });
    contexts.push(context);

    const { document, criticalReviewer, approver } =
      await createDocumentForTest(context);

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`,
      )
      .set({ Authorization: `Bearer ${criticalReviewer!.token}` })
      .send({})
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/submit`,
      )
      .set(authHeader(context))
      .send({ changeDescription: "Versão inicial" })
      .expect(200);

    const rejectResponse = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/reject`,
      )
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
    const context = await createTestContext({
      seed: "documents-draft-update-notifications",
    });
    contexts.push(context);

    const { document, approver } = await createDocumentForTest(context);

    const updateResponse = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/documents/${document.id}`,
      )
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
      approverNotifications.some(
        (notification) => notification.type === "document_updated",
      ),
    ).toBe(false);
    expect(
      approverNotifications.some(
        (notification) => notification.type === "document_review",
      ),
    ).toBe(false);
  });

  it("creates documents with normalized normative requirements and returns them on detail", async () => {
    const context = await createTestContext({
      seed: "documents-normative-requirements-create",
    });
    contexts.push(context);

    const { document } = await createDocumentForTest(context, {
      normativeRequirements: [
        " ISO 9001:2015 7.5 ",
        "iso 9001:2015 7.5",
        "",
        "ISO 14001:2015 6.1.3",
      ],
    });

    const detail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/documents/${document.id}`,
      )
      .set(authHeader(context));

    expect(detail.status).toBe(200);
    expect(detail.body.normativeRequirements).toEqual([
      "ISO 9001:2015 7.5",
      "ISO 14001:2015 6.1.3",
    ]);
  });

  it("updates document normative requirements", async () => {
    const context = await createTestContext({
      seed: "documents-normative-requirements-update",
    });
    contexts.push(context);

    const { document } = await createDocumentForTest(context, {
      normativeRequirements: ["ISO 9001:2015 7.5"],
    });

    const updateResponse = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/documents/${document.id}`,
      )
      .set(authHeader(context))
      .send({
        normativeRequirements: [
          " ISO 9001:2015 4.4 ",
          "ISO 9001:2015 4.4",
          "ISO 9001:2015 6.2",
        ],
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.normativeRequirements).toEqual([
      "ISO 9001:2015 4.4",
      "ISO 9001:2015 6.2",
    ]);

    const clearResponse = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/documents/${document.id}`,
      )
      .set(authHeader(context))
      .send({
        normativeRequirements: [],
      });

    expect(clearResponse.status).toBe(200);
    expect(clearResponse.body.normativeRequirements).toEqual([]);
  });

  it("rejects foreign reference ids on normative requirement suggestions", async () => {
    const context = await createTestContext({
      seed: "documents-normative-requirements-suggestions-local",
    });
    const foreignContext = await createTestContext({
      seed: "documents-normative-requirements-suggestions-foreign",
    });
    contexts.push(context, foreignContext);

    const { document: foreignDocument } =
      await createDocumentForTest(foreignContext);

    const response = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/normative-requirements/suggestions`,
      )
      .set(authHeader(context))
      .send({
        title: "Procedimento de controle documental",
        type: "procedimento",
        referenceIds: [foreignDocument.id],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("não pertencem a esta organização");
  });

  it("normalizes suggestion responses and excludes current requirements", async () => {
    const context = await createTestContext({
      seed: "documents-normative-requirements-suggestions",
    });
    contexts.push(context);

    const { document: referenceDocument } =
      await createDocumentForTest(context);

    createCompletionMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                " ISO 9001:2015 7.5 ",
                "iso 9001:2015 7.5",
                "ISO 9001:2015 4.4",
                "ISO 14001:2015 6.1.3",
              ],
            }),
          },
        },
      ],
    });

    const response = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/normative-requirements/suggestions`,
      )
      .set(authHeader(context))
      .send({
        title: "Procedimento de controle documental",
        type: "procedimento",
        referenceIds: [referenceDocument.id],
        currentRequirements: ["ISO 9001:2015 7.5"],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      suggestions: ["ISO 9001:2015 4.4", "ISO 14001:2015 6.1.3"],
    });
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
  });

  it("allows SGQ communication plans only for policy documents and exposes them on detail", async () => {
    const context = await createTestContext({
      seed: "documents-communication-plans",
    });
    contexts.push(context);

    const { document: manualDocument } = await createDocumentForTest(context);

    const manualResponse = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${manualDocument.id}/communication-plans`,
      )
      .set(authHeader(context))
      .send({
        channel: "email",
        audience: "Todos os colaboradores",
        periodicity: "mensal",
        requiresAcknowledgment: true,
        notes: "Enviar no início do mês",
      });

    expect(manualResponse.status).toBe(400);
    expect(manualResponse.body.error).toContain("Apenas políticas");

    const { document: policyDocument } = await createDocumentForTest(context, {
      type: "politica",
    });

    const createdPlan = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${policyDocument.id}/communication-plans`,
      )
      .set(authHeader(context))
      .send({
        channel: "reunião geral",
        audience: "Lideranças",
        periodicity: "trimestral",
        requiresAcknowledgment: false,
        notes: "Apresentar os indicadores na abertura",
      });

    expect(createdPlan.status).toBe(201);
    expect(createdPlan.body).toHaveLength(1);
    expect(createdPlan.body[0].channel).toBe("reunião geral");

    const detail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/documents/${policyDocument.id}`,
      )
      .set(authHeader(context));

    expect(detail.status).toBe(200);
    expect(detail.body.communicationPlans).toHaveLength(1);
    expect(detail.body.communicationPlans[0].audience).toBe("Lideranças");
  });

  it("updates policy communication plans when the document is distributed", async () => {
    const context = await createTestContext({
      seed: "documents-communication-distribution",
    });
    contexts.push(context);

    const { document, criticalReviewer, approver } =
      await createDocumentForTest(context, {
        type: "politica",
        recipientIds: [],
      });

    const createdPlan = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/communication-plans`,
      )
      .set(authHeader(context))
      .send({
        channel: "email",
        audience: "Equipe operacional",
        periodicity: "mensal",
        requiresAcknowledgment: true,
        notes: "Enviar o PDF aprovado",
      });

    expect(createdPlan.status).toBe(201);
    expect(createdPlan.body[0].lastDistributedAt).toBeNull();

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`,
      )
      .set({ Authorization: `Bearer ${criticalReviewer!.token}` })
      .send({})
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/submit`,
      )
      .set(authHeader(context))
      .send({ changeDescription: "Publicação inicial da política" })
      .expect(200);

    const approved = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/approve`,
      )
      .set({ Authorization: `Bearer ${approver!.token}` })
      .send({});

    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");

    const distributeResponse = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/distribute`,
      )
      .set(authHeader(context))
      .send({});

    expect(distributeResponse.status).toBe(200);
    expect(distributeResponse.body.status).toBe("distributed");

    const plans = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/documents/${document.id}/communication-plans`,
      )
      .set(authHeader(context));

    expect(plans.status).toBe(200);
    expect(plans.body).toHaveLength(1);
    expect(plans.body[0].lastDistributedAt).not.toBeNull();
  });
});
