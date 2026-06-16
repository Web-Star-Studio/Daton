import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionMock } = vi.hoisted(() => ({
  createCompletionMock: vi.fn(),
}));

// openai is used by normative-requirements suggestions; mock it to avoid
// real network calls in case any code path touches it during these tests.
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
}, 30000);

/**
 * Helper: create a `procedimento` document with the minimum required relations.
 *
 * - elaborator       : an employee of the org
 * - criticalReviewer : a user with write access to `documents`
 * - approver         : a user with write access to `documents`
 * - recipient        : a user with write access to `documents` (required by the
 *                      API for non-politica types)
 *
 * When `noRecipients` is true the document type is switched to `politica` so
 * the API accepts an empty recipient list, allowing the document to reach
 * the `approved` state (instead of `distributed`) on full approval.
 */
async function createProcedimentoForTest(
  context: TestOrgContext,
  options: {
    /** Pass true to create with no recipients (uses type=politica internally). */
    noRecipients?: boolean;
    code?: string;
  } = {},
) {
  const employee = await createEmployee(context, {
    name: `Elaborador ${context.prefix}`,
  });

  const criticalReviewer = await createTestUser(context, {
    role: "operator",
    suffix: "crit-reviewer",
    modules: ["documents"],
  });

  const approver = await createTestUser(context, {
    role: "operator",
    suffix: "approver",
    modules: ["documents"],
  });

  // Non-politica documents require at least one recipient; create one unless
  // the caller explicitly asks for no recipients (which switches to politica).
  const recipient = options.noRecipients
    ? null
    : await createTestUser(context, {
        role: "operator",
        suffix: "recipient",
        modules: ["documents"],
      });

  const docType = options.noRecipients ? "politica" : "procedimento";
  const recipientIds = recipient ? [recipient.id] : [];

  const createRes = await request(app)
    .post(`/api/organizations/${context.organizationId}/documents`)
    .set(authHeader(context))
    .send({
      title: `Procedimento ${context.prefix}`,
      type: docType,
      code: options.code ?? `PC-${context.prefix}`,
      validityDate: "2030-01-01",
      elaboratorIds: [employee.id],
      criticalReviewerIds: [criticalReviewer.id],
      approverIds: [approver.id],
      recipientIds,
    });

  expect(createRes.status).toBe(201);

  return {
    document: createRes.body as {
      id: number;
      status: string;
      code: string | null;
      contentSections: Array<{
        id: string;
        title: string;
        body: string;
        order: number;
      }>;
    },
    criticalReviewer,
    approver,
  };
}

/**
 * Helper: drive a document through critical-analysis → submit → all-approve.
 * Requires the document to already be in `draft` status.
 */
async function approveDocument(
  context: TestOrgContext,
  docId: number,
  criticalReviewer: { token: string },
  approver: { token: string },
) {
  await request(app)
    .post(
      `/api/organizations/${context.organizationId}/documents/${docId}/critical-analysis/complete`,
    )
    .set({ Authorization: `Bearer ${criticalReviewer.token}` })
    .send({})
    .expect(200);

  await request(app)
    .post(
      `/api/organizations/${context.organizationId}/documents/${docId}/submit`,
    )
    .set(authHeader(context))
    .send({ changeDescription: "Versão inicial" })
    .expect(200);

  const approved = await request(app)
    .post(
      `/api/organizations/${context.organizationId}/documents/${docId}/approve`,
    )
    .set({ Authorization: `Bearer ${approver.token}` })
    .send({});

  expect(approved.status).toBe(200);
  return approved.body as { status: string; currentVersion: number };
}

describe("documents — content flow", () => {
  beforeEach(() => {
    createCompletionMock.mockReset();
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '{"suggestions":[]}' } }],
    });
  });

  // (a) Create a `procedimento` with a code → response `code` matches and
  //     `contentSections` titles equal the template titles.
  it("(a) seeds contentSections from the procedimento template on create", async () => {
    const context = await createTestContext({
      seed: "doc-content-seed-sections",
      modules: ["documents"],
    });
    contexts.push(context);

    const { document } = await createProcedimentoForTest(context, {
      code: "PC-001",
    });

    expect(document.code).toBe("PC-001");
    expect(
      document.contentSections.map((s) => s.title),
    ).toEqual([
      "Objetivo",
      "Aplicação",
      "Definições e Referências",
      "Sequência, Interação, Recursos e Monitoramento",
      "Responsabilidade pelo Processo",
      "Procedimento",
    ]);
    // sections should be ordered 0..n
    expect(document.contentSections.map((s) => s.order)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  // (b) PUT .../content with sections given out of order → response
  //     `contentSections` is reordered (sorted by order, reindexed 0..n) and
  //     title is trimmed.
  it("(b) PUT /content normalizes section order and trims titles", async () => {
    const context = await createTestContext({
      seed: "doc-content-put-normalize",
      modules: ["documents"],
    });
    contexts.push(context);

    const { document } = await createProcedimentoForTest(context);

    // PUT /content REPLACES the entire section set; the ids below are
    // client-authored (not the seeded template ids created on document creation).
    const shuffledSections = [
      { id: "sec-b", title: "  Seção B  ", body: "body B", order: 3 },
      { id: "sec-a", title: "Seção A", body: "body A", order: 1 },
      { id: "sec-c", title: "Seção C", body: "body C", order: 2 },
    ];

    const putRes = await request(app)
      .put(
        `/api/organizations/${context.organizationId}/documents/${document.id}/content`,
      )
      .set(authHeader(context))
      .send({ contentSections: shuffledSections });

    expect(putRes.status).toBe(200);

    const sections = putRes.body.contentSections as Array<{
      id: string;
      title: string;
      order: number;
    }>;

    // Should be sorted by original `order` value (1, 2, 3) and then
    // reindexed starting at 0.
    expect(sections.map((s) => s.id)).toEqual(["sec-a", "sec-c", "sec-b"]);
    expect(sections.map((s) => s.order)).toEqual([0, 1, 2]);
    // Title must be trimmed
    expect(sections.find((s) => s.id === "sec-b")?.title).toBe("Seção B");
  });

  // (c) Editing content when the document is NOT draft/rejected returns 409.
  //     We reach `in_review` by completing critical analysis + submitting.
  it("(c) PUT /content returns 409 when document is not draft or rejected", async () => {
    const context = await createTestContext({
      seed: "doc-content-409-not-editable",
      modules: ["documents"],
    });
    contexts.push(context);

    const { document, criticalReviewer } = await createProcedimentoForTest(context);

    // Advance to `in_review` (submit without approving so it stays non-draft).
    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`,
      )
      .set({ Authorization: `Bearer ${criticalReviewer.token}` })
      .send({})
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/submit`,
      )
      .set(authHeader(context))
      .send({ changeDescription: "Versão inicial" })
      .expect(200);

    // Now the document is `in_review` — PUT /content must return 409.
    const putRes = await request(app)
      .put(
        `/api/organizations/${context.organizationId}/documents/${document.id}/content`,
      )
      .set(authHeader(context))
      .send({
        contentSections: [
          { id: "sec-1", title: "Objetivo", body: "texto", order: 0 },
        ],
      });

    expect(putRes.status).toBe(409);
    expect(putRes.body.error).toBeTruthy();
  });

  // (f) After critical analysis is completed, editing content via PUT .../content
  //     reopens the critical-analysis cycle (re-review required before submit).
  it("(f) PUT /content reopens critical-analysis cycle after it was completed", async () => {
    const context = await createTestContext({
      seed: "doc-content-reopen-cycle",
      modules: ["documents"],
    });
    contexts.push(context);

    const { document, criticalReviewer } = await createProcedimentoForTest(context);

    // Complete the critical analysis so it is no longer pending.
    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`,
      )
      .set({ Authorization: `Bearer ${criticalReviewer.token}` })
      .send({})
      .expect(200);

    // Edit the content — this must restart the critical-analysis cycle.
    const putRes = await request(app)
      .put(
        `/api/organizations/${context.organizationId}/documents/${document.id}/content`,
      )
      .set(authHeader(context))
      .send({
        contentSections: [
          { id: "sec-updated", title: "Objetivo Atualizado", body: "novo conteúdo", order: 0 },
        ],
      });

    expect(putRes.status).toBe(200);

    // Attempt to submit — must fail because critical analysis is pending again.
    const submitRes = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/documents/${document.id}/submit`,
      )
      .set(authHeader(context))
      .send({ changeDescription: "Conteúdo revisado" });

    expect(submitRes.status).toBe(400);
    expect(submitRes.body.error).toMatch(/análise crítica/i);
  });

  // (e) Creating two documents with the same code in the same org returns 409.
  it("(e) POST /documents retorna 409 ao criar documento com código duplicado na mesma organização", async () => {
    const context = await createTestContext({
      seed: "doc-duplicate-code-409",
      modules: ["documents"],
    });
    contexts.push(context);

    const CODE = `DUP-${context.prefix}`;

    // First document: must succeed with 201.
    await createProcedimentoForTest(context, { code: CODE, noRecipients: true });

    // Second document with the same code: must return 409.
    const employee = await createEmployee(context, {
      name: `Elaborador2 ${context.prefix}`,
    });
    const criticalReviewer = await createTestUser(context, {
      role: "operator",
      suffix: "crit-reviewer2",
      modules: ["documents"],
    });
    const approver = await createTestUser(context, {
      role: "operator",
      suffix: "approver2",
      modules: ["documents"],
    });

    const dupRes = await request(app)
      .post(`/api/organizations/${context.organizationId}/documents`)
      .set(authHeader(context))
      .send({
        title: `Documento duplicado ${context.prefix}`,
        type: "politica",
        code: CODE,
        validityDate: "2030-01-01",
        elaboratorIds: [employee.id],
        criticalReviewerIds: [criticalReviewer.id],
        approverIds: [approver.id],
        recipientIds: [],
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error).toMatch(/código/i);
  });

  // (d) Full approval freezes the snapshot: after editing content and approving
  //     (document with no recipients → becomes `approved`), GET .../versions/1
  //     returns the frozen `contentSections` (matching what was authored) and a
  //     `metaSnapshot` with the `code`.
  it("(d) approval freezes contentSections + metaSnapshot in a version record", async () => {
    const context = await createTestContext({
      seed: "doc-content-version-snapshot",
      modules: ["documents"],
    });
    contexts.push(context);

    const CODE = "PC-SNAPSHOT-TEST";

    // noRecipients: true switches the document type to `politica` (the API
    // blocks non-politica documents without recipients). With no recipients in
    // documentRecipientsTable the approval handler sets status → `approved`.
    const { document, criticalReviewer, approver } =
      await createProcedimentoForTest(context, { code: CODE, noRecipients: true });

    // Author the content sections.
    const authoredSections = [
      { id: "s1", title: "Objetivo", body: "Definir o processo X.", order: 0 },
      { id: "s2", title: "Aplicação", body: "Aplica-se a todos.", order: 1 },
      {
        id: "s3",
        title: "Definições e Referências",
        body: "Ver ISO 9001.",
        order: 2,
      },
      {
        id: "s4",
        title: "Sequência, Interação, Recursos e Monitoramento",
        body: "Fluxo detalhado.",
        order: 3,
      },
      {
        id: "s5",
        title: "Responsabilidade pelo Processo",
        body: "Gerente de qualidade.",
        order: 4,
      },
      { id: "s6", title: "Procedimento", body: "Passos 1-5.", order: 5 },
    ];

    const putRes = await request(app)
      .put(
        `/api/organizations/${context.organizationId}/documents/${document.id}/content`,
      )
      .set(authHeader(context))
      .send({ contentSections: authoredSections });

    expect(putRes.status).toBe(200);

    // Approve the document (critical-analysis → submit → approve).
    const afterApproval = await approveDocument(
      context,
      document.id,
      criticalReviewer,
      approver,
    );

    // Document with no recipients must end up as `approved`, not `distributed`.
    expect(afterApproval.status).toBe("approved");
    expect(afterApproval.currentVersion).toBe(1);

    // Fetch the frozen version snapshot.
    const versionRes = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/documents/${document.id}/versions/1`,
      )
      .set(authHeader(context));

    expect(versionRes.status).toBe(200);

    const { versionNumber, contentSections, metaSnapshot } = versionRes.body as {
      versionNumber: number;
      contentSections: Array<{ id: string; title: string; body: string; order: number }>;
      metaSnapshot: { code: string | null; title: string } | null;
      changeDescription: string;
      createdAt: string;
    };

    expect(versionNumber).toBe(1);

    // contentSections must match what was authored (normalized order).
    expect(contentSections).toHaveLength(authoredSections.length);
    expect(contentSections.map((s) => s.id)).toEqual(
      authoredSections.map((s) => s.id),
    );
    expect(contentSections.map((s) => s.title)).toEqual(
      authoredSections.map((s) => s.title),
    );
    expect(contentSections.map((s) => s.body)).toEqual(
      authoredSections.map((s) => s.body),
    );

    // metaSnapshot must capture the code.
    expect(metaSnapshot).not.toBeNull();
    expect(metaSnapshot?.code).toBe(CODE);
    expect(typeof metaSnapshot?.title).toBe("string");
  });
});
