import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  nonconformitiesTable,
  sgqProcessRevisionsTable,
  strategicPlansTable,
} from "@workspace/db";
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
  type?: "manual" | "politica";
}) {
  const employee = await createEmployee(context, {
    name: `Elaborador ${context.prefix}`,
  });
  const reviewer = await createTestUser(context, {
    role: "analyst",
    suffix: "critical-reviewer",
    modules: ["documents"],
  });
  const approver = await createTestUser(context, {
    role: "operator",
    suffix: "approver",
    modules: ["documents"],
  });
  const recipient = await createTestUser(context, {
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
      criticalReviewerIds: [reviewer.id],
      approverIds: [approver.id],
      recipientIds: [recipient.id],
    });

  expect(response.status).toBe(201);

  return response.body as { id: number; status: string };
}

async function createStrategicPlanForTest(context: TestOrgContext) {
  const [plan] = await db
    .insert(strategicPlansTable)
    .values({
      organizationId: context.organizationId,
      title: `Plano ${context.prefix}`,
      createdById: context.userId,
      updatedById: context.userId,
    })
    .returning({ id: strategicPlansTable.id });

  return plan;
}

describe("governance system routes", () => {
  it("creates SGQ processes, paginates results and records revisions while blocking invalid interactions", async () => {
    const context = await createTestContext({ seed: "governance-system-processes" });
    contexts.push(context);

    const owner = await createTestUser(context, {
      role: "analyst",
      suffix: "process-owner",
      modules: ["governance"],
    });

    const supportProcess = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/sgq-processes`)
      .set(authHeader(context))
      .send({
        name: `Processo Suporte ${context.prefix}`,
        objective: "Garantir apoio ao sistema de gestão",
        ownerUserId: owner.id,
        inputs: ["Solicitações internas"],
        outputs: ["Atendimento concluído"],
        interactions: [],
        changeSummary: "Cadastro inicial do processo de suporte",
      });

    expect(supportProcess.status).toBe(201);

    const mainProcess = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/sgq-processes`)
      .set(authHeader(context))
      .send({
        name: `Processo Principal ${context.prefix}`,
        objective: "Executar o fluxo principal do SGQ",
        ownerUserId: owner.id,
        inputs: ["Requisitos do cliente"],
        outputs: ["Produto aprovado"],
        interactions: [
          {
            relatedProcessId: supportProcess.body.id,
            direction: "downstream",
            notes: "Depende do suporte administrativo",
          },
        ],
        changeSummary: "Cadastro inicial do processo principal",
      });

    expect(mainProcess.status).toBe(201);
    expect(mainProcess.body.currentRevisionNumber).toBe(1);
    expect(mainProcess.body.interactions).toHaveLength(1);

    const listed = await request(app)
      .get(`/api/organizations/${context.organizationId}/governance/sgq-processes`)
      .query({ page: 1, pageSize: 10, ownerUserId: owner.id, search: "Principal" })
      .set(authHeader(context));

    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.pagination.total).toBe(1);

    const escapedSearch = await request(app)
      .get(`/api/organizations/${context.organizationId}/governance/sgq-processes`)
      .query({ page: 1, pageSize: 10, search: "%_Principal" })
      .set(authHeader(context));

    expect(escapedSearch.status).toBe(200);
    expect(escapedSearch.body.data).toHaveLength(0);

    const selfInteraction = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/sgq-processes/${mainProcess.body.id}`)
      .set(authHeader(context))
      .send({
        interactions: [
          {
            relatedProcessId: mainProcess.body.id,
            direction: "upstream",
          },
        ],
        changeSummary: "Tentativa inválida",
      });

    expect(selfInteraction.status).toBe(400);
    expect(selfInteraction.body.error).toContain("não pode se relacionar com ele mesmo");

    const duplicateInteraction = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/sgq-processes/${mainProcess.body.id}`)
      .set(authHeader(context))
      .send({
        interactions: [
          {
            relatedProcessId: supportProcess.body.id,
            direction: "downstream",
          },
          {
            relatedProcessId: supportProcess.body.id,
            direction: "downstream",
          },
        ],
        changeSummary: "Tentativa duplicada",
      });

    expect(duplicateInteraction.status).toBe(400);
    expect(duplicateInteraction.body.error).toContain("interações duplicadas");

    const updated = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/sgq-processes/${mainProcess.body.id}`)
      .set(authHeader(context))
      .send({
        objective: "Executar o fluxo principal revisado",
        interactions: [
          {
            relatedProcessId: supportProcess.body.id,
            direction: "downstream",
            notes: "Fluxo revisado",
          },
        ],
        changeSummary: "Revisão operacional do processo principal",
      });

    expect(updated.status).toBe(200);
    expect(updated.body.currentRevisionNumber).toBe(2);

    const noOpUpdate = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/sgq-processes/${mainProcess.body.id}`)
      .set(authHeader(context))
      .send({
        objective: "Executar o fluxo principal revisado",
        interactions: [
          {
            relatedProcessId: supportProcess.body.id,
            direction: "downstream",
            notes: "Fluxo revisado",
          },
        ],
        changeSummary: "Sem mudanças materiais",
      });

    expect(noOpUpdate.status).toBe(200);
    expect(noOpUpdate.body.currentRevisionNumber).toBe(2);

    const revisions = await request(app)
      .get(`/api/organizations/${context.organizationId}/governance/sgq-processes/${mainProcess.body.id}/revisions`)
      .set(authHeader(context));

    expect(revisions.status).toBe(200);
    expect(revisions.body).toHaveLength(2);
    expect(revisions.body[0].changeSummary).toContain("Revisão operacional");
  });

  it("prevents completing audits while checklist items remain unevaluated", async () => {
    const context = await createTestContext({ seed: "governance-system-audits" });
    contexts.push(context);

    const auditor = await createTestUser(context, {
      role: "analyst",
      suffix: "auditor",
      modules: ["governance"],
    });

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/internal-audits`)
      .set(authHeader(context))
      .send({
        title: `Auditoria ${context.prefix}`,
        scope: "Processos internos do SGQ",
        criteria: "ISO 9001",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        auditorUserId: auditor.id,
        originType: "internal",
      });

    expect(created.status).toBe(201);

    const rejectedCompletedCreate = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/internal-audits`)
      .set(authHeader(context))
      .send({
        title: `Auditoria concluída ${context.prefix}`,
        scope: "Escopo inválido",
        criteria: "ISO 9001",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        auditorUserId: auditor.id,
        originType: "internal",
        status: "completed",
      });

    expect(rejectedCompletedCreate.status).toBe(400);
    expect(rejectedCompletedCreate.body.error).toContain("não pode ser concluída");

    const blockedWithoutChecklist = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/internal-audits/${created.body.id}`)
      .set(authHeader(context))
      .send({ status: "completed" });

    expect(blockedWithoutChecklist.status).toBe(400);
    expect(blockedWithoutChecklist.body.error).toContain("checklist não avaliados");

    const checklist = await request(app)
      .put(`/api/organizations/${context.organizationId}/governance/internal-audits/${created.body.id}/checklist-items`)
      .set(authHeader(context))
      .send({
        items: [
          {
            label: "Verificar registros obrigatórios",
            requirementRef: "ISO 9001 7.5",
            result: "not_evaluated",
          },
        ],
      });

    expect(checklist.status).toBe(200);
    expect(checklist.body.checklistItems).toHaveLength(1);

    const blockedCompletion = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/internal-audits/${created.body.id}`)
      .set(authHeader(context))
      .send({ status: "completed" });

    expect(blockedCompletion.status).toBe(400);
    expect(blockedCompletion.body.error).toContain("checklist não avaliados");

    const completedChecklist = await request(app)
      .put(`/api/organizations/${context.organizationId}/governance/internal-audits/${created.body.id}/checklist-items`)
      .set(authHeader(context))
      .send({
        items: [
          {
            label: "Verificar registros obrigatórios",
            requirementRef: "ISO 9001 7.5",
            result: "conformity",
            notes: "Todos os registros estavam atualizados",
          },
        ],
      });

    expect(completedChecklist.status).toBe(200);

    const completed = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/internal-audits/${created.body.id}`)
      .set(authHeader(context))
      .send({ status: "completed" });

    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("completed");
  });

  it("enforces NC effectiveness review and corrective action evidence rules", async () => {
    const context = await createTestContext({ seed: "governance-system-nc" });
    contexts.push(context);

    const responsible = await createTestUser(context, {
      role: "analyst",
      suffix: "nc-owner",
      modules: ["governance"],
    });

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/nonconformities`)
      .set(authHeader(context))
      .send({
        originType: "incident",
        title: `NC ${context.prefix}`,
        description: "Desvio identificado na liberação final",
        classification: "major",
        responsibleUserId: responsible.id,
      });

    expect(created.status).toBe(201);

    const prematureClose = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/nonconformities/${created.body.id}`)
      .set(authHeader(context))
      .send({ status: "closed" });

    expect(prematureClose.status).toBe(400);
    expect(prematureClose.body.error).toContain("verificação de eficácia");

    const createdAction = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/nonconformities/${created.body.id}/corrective-actions`)
      .set(authHeader(context))
      .send({
        title: "Ajustar instrução de trabalho",
        description: "Revisar o procedimento e treinar a equipe",
        responsibleUserId: responsible.id,
      });

    expect(createdAction.status).toBe(201);
    expect(createdAction.body.correctiveActions).toHaveLength(1);

    const secondAction = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/nonconformities/${created.body.id}/corrective-actions`)
      .set(authHeader(context))
      .send({
        title: "Validar implementação",
        description: "Confirmar que o ajuste foi absorvido pela operação",
        responsibleUserId: responsible.id,
      });

    expect(secondAction.status).toBe(201);
    expect(secondAction.body.correctiveActions).toHaveLength(2);

    const blockedDone = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/nonconformities/${created.body.id}/corrective-actions/${createdAction.body.correctiveActions[0].id}`)
      .set(authHeader(context))
      .send({
        status: "done",
      });

    expect(blockedDone.status).toBe(400);
    expect(blockedDone.body.error).toContain("exigem evidência ou notas");

    const finishedAction = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/nonconformities/${created.body.id}/corrective-actions/${createdAction.body.correctiveActions[0].id}`)
      .set(authHeader(context))
      .send({
        status: "done",
        executionNotes: "Procedimento revisado e equipe treinada",
      });

    expect(finishedAction.status).toBe(200);
    expect(finishedAction.body.status).toBe("open");

    const blockedEffectiveReview = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/nonconformities/${created.body.id}/effectiveness-review`)
      .set(authHeader(context))
      .send({
        result: "effective",
        comment: "Tentativa prematura",
      });

    expect(blockedEffectiveReview.status).toBe(400);
    expect(blockedEffectiveReview.body.error).toContain("aguardando eficácia");

    const finishedSecondAction = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/nonconformities/${created.body.id}/corrective-actions/${secondAction.body.correctiveActions[0].id}`)
      .set(authHeader(context))
      .send({
        status: "done",
        executionNotes: "Validação operacional concluída",
      });

    expect(finishedSecondAction.status).toBe(200);
    expect(finishedSecondAction.body.status).toBe("awaiting_effectiveness");

    const ineffectiveReview = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/nonconformities/${created.body.id}/effectiveness-review`)
      .set(authHeader(context))
      .send({
        result: "ineffective",
        comment: "O desvio voltou a ocorrer",
      });

    expect(ineffectiveReview.status).toBe(200);
    expect(ineffectiveReview.body.status).toBe("action_in_progress");

    const effectiveReview = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/nonconformities/${created.body.id}/effectiveness-review`)
      .set(authHeader(context))
      .send({
        result: "effective",
        comment: "Sem reincidência após 30 dias",
      });

    expect(effectiveReview.status).toBe(200);
    expect(effectiveReview.body.status).toBe("closed");
    expect(effectiveReview.body.effectivenessResult).toBe("effective");
  });

  it("rejects foreign audit findings on NC patch and enforces unique SGQ revision numbers", async () => {
    const context = await createTestContext({ seed: "governance-system-nc-foreign-finding" });
    const foreignContext = await createTestContext({ seed: "governance-system-nc-foreign-finding-foreign" });
    contexts.push(context, foreignContext);

    const owner = await createTestUser(context, {
      role: "analyst",
      suffix: "process-owner",
      modules: ["governance"],
    });
    const foreignOwner = await createTestUser(foreignContext, {
      role: "analyst",
      suffix: "foreign-process-owner",
      modules: ["governance"],
    });

    const localProcess = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/sgq-processes`)
      .set(authHeader(context))
      .send({
        name: `Processo local ${context.prefix}`,
        objective: "Controle local do SGQ",
        ownerUserId: owner.id,
        inputs: ["Entrada"],
        outputs: ["Saída"],
        changeSummary: "Cadastro inicial",
      });

    expect(localProcess.status).toBe(201);

    const explicitSnapshot = {
      name: `Processo local ${context.prefix}`,
      objective: "Controle local do SGQ",
      ownerUserId: owner.id,
      inputs: ["Entrada"],
      outputs: ["Saída"],
      criteria: null,
      indicators: null,
      status: "active" as const,
      attachments: [],
      interactions: [],
    };

    let duplicateRevisionError: unknown;
    try {
      await db.insert(sgqProcessRevisionsTable).values({
        processId: localProcess.body.id,
        revisionNumber: 1,
        approvedById: context.userId,
        changeSummary: "Duplicada",
        snapshot: explicitSnapshot,
      });
    } catch (error) {
      duplicateRevisionError = error;
    }

    expect(duplicateRevisionError).toBeTruthy();
    const duplicateRevisionMessage =
      duplicateRevisionError instanceof Error
        ? duplicateRevisionError.message
        : String(duplicateRevisionError);
    expect(duplicateRevisionMessage).toContain("sgq_process_revision_number_unique");

    const foreignAudit = await request(app)
      .post(`/api/organizations/${foreignContext.organizationId}/governance/internal-audits`)
      .set(authHeader(foreignContext))
      .send({
        title: `Auditoria externa ${foreignContext.prefix}`,
        scope: "Escopo externo",
        criteria: "ISO 9001",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        auditorUserId: foreignOwner.id,
        originType: "internal",
      });

    expect(foreignAudit.status).toBe(201);

    const foreignFinding = await request(app)
      .post(`/api/organizations/${foreignContext.organizationId}/governance/internal-audits/${foreignAudit.body.id}/findings`)
      .set(authHeader(foreignContext))
      .send({
        classification: "nonconformity",
        description: "Achado externo",
      });

    expect(foreignFinding.status).toBe(201);

    const nc = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/nonconformities`)
      .set(authHeader(context))
      .send({
        originType: "other",
        title: `NC ${context.prefix}`,
        description: "NC local",
      });

    expect(nc.status).toBe(201);

    const patchedNc = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/nonconformities/${nc.body.id}`)
      .set(authHeader(context))
      .send({
        auditFindingId: foreignFinding.body.id,
      });

    expect(patchedNc.status).toBe(400);
    expect(patchedNc.body.error).toContain("Achado de auditoria inválido");

    let compositeFkError: unknown;
    try {
      await db.insert(nonconformitiesTable).values({
        organizationId: context.organizationId,
        originType: "audit_finding",
        title: `NC DB ${context.prefix}`,
        description: "Tentativa de vínculo cross-org direto no banco",
        auditFindingId: foreignFinding.body.id,
        createdById: context.userId,
        updatedById: context.userId,
      });
    } catch (error) {
      compositeFkError = error;
    }

    expect(compositeFkError).toBeTruthy();
    const compositeFkMessage =
      compositeFkError instanceof Error
        ? compositeFkError.message
        : String(compositeFkError);
    expect(compositeFkMessage).toContain("nonconformities_audit_finding_org_fk");
  });

  it("requires inputs and outputs before completing a management review and keeps action outputs open", async () => {
    const context = await createTestContext({ seed: "governance-system-reviews" });
    contexts.push(context);

    const chair = await createTestUser(context, {
      role: "analyst",
      suffix: "review-chair",
      modules: ["governance"],
    });

    const process = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/sgq-processes`)
      .set(authHeader(context))
      .send({
        name: `Processo para análise ${context.prefix}`,
        objective: "Servir de vínculo para a análise crítica",
        ownerUserId: chair.id,
        inputs: ["Dados de desempenho"],
        outputs: ["Plano de ação"],
        changeSummary: "Cadastro inicial",
      });

    expect(process.status).toBe(201);

    const review = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/management-reviews`)
      .set(authHeader(context))
      .send({
        title: `Análise crítica ${context.prefix}`,
        reviewDate: "2026-02-20",
        chairUserId: chair.id,
        status: "completed",
      });

    expect(review.status).toBe(201);
    expect(review.body.status).toBe("draft");

    const blockedCompletion = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}`)
      .set(authHeader(context))
      .send({ status: "completed" });

    expect(blockedCompletion.status).toBe(400);
    expect(blockedCompletion.body.error).toContain("ao menos uma entrada e uma saída");

    const addedInput = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/inputs`)
      .set(authHeader(context))
      .send({
        inputType: "process_performance",
        summary: "Indicadores do processo principal dentro da meta",
        processId: process.body.id,
      });

    expect(addedInput.status).toBe(201);
    expect(addedInput.body.inputs).toHaveLength(1);

    const addedOutput = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/outputs`)
      .set(authHeader(context))
      .send({
        outputType: "action",
        description: "Reforçar monitoramento trimestral",
        responsibleUserId: chair.id,
        processId: process.body.id,
        status: "done",
      });

    expect(addedOutput.status).toBe(201);
    expect(addedOutput.body.outputs).toHaveLength(1);
    expect(addedOutput.body.outputs[0].status).toBe("open");

    const completed = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}`)
      .set(authHeader(context))
      .send({ status: "completed" });

    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("completed");
  });

  it("rejects foreign references when patching management review inputs and outputs", async () => {
    const context = await createTestContext({
      seed: "governance-system-review-patch-validation",
      modules: ["governance", "documents"],
    });
    const foreignContext = await createTestContext({
      seed: "governance-system-review-patch-validation-foreign",
      modules: ["governance", "documents"],
    });
    contexts.push(context, foreignContext);

    const chair = await createTestUser(context, {
      role: "analyst",
      suffix: "review-chair",
      modules: ["governance"],
    });

    const localProcess = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/sgq-processes`)
      .set(authHeader(context))
      .send({
        name: `Processo local ${context.prefix}`,
        objective: "Base local da análise crítica",
        ownerUserId: chair.id,
        inputs: ["Entrada local"],
        outputs: ["Saída local"],
        changeSummary: "Cadastro inicial",
      });

    expect(localProcess.status).toBe(201);

    const review = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/management-reviews`)
      .set(authHeader(context))
      .send({
        title: `Análise crítica ${context.prefix}`,
        reviewDate: "2026-02-20",
        chairUserId: chair.id,
      });

    expect(review.status).toBe(201);

    const createdInput = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/inputs`)
      .set(authHeader(context))
      .send({
        inputType: "process_performance",
        summary: "Entrada inicial",
        processId: localProcess.body.id,
      });

    expect(createdInput.status).toBe(201);

    const createdOutput = await request(app)
      .post(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/outputs`)
      .set(authHeader(context))
      .send({
        outputType: "action",
        description: "Saída inicial",
        responsibleUserId: chair.id,
        processId: localProcess.body.id,
        status: "open",
      });

    expect(createdOutput.status).toBe(201);

    const foreignDocument = await createDocumentForTest(foreignContext, { type: "politica" });
    const foreignPlan = await createStrategicPlanForTest(foreignContext);

    const foreignAudit = await request(app)
      .post(`/api/organizations/${foreignContext.organizationId}/governance/internal-audits`)
      .set(authHeader(foreignContext))
      .send({
        title: `Auditoria estrangeira ${foreignContext.prefix}`,
        scope: "Escopo externo",
        criteria: "ISO 9001",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        originType: "internal",
      });

    expect(foreignAudit.status).toBe(201);

    const foreignProcess = await request(app)
      .post(`/api/organizations/${foreignContext.organizationId}/governance/sgq-processes`)
      .set(authHeader(foreignContext))
      .send({
        name: `Processo estrangeiro ${foreignContext.prefix}`,
        objective: "Referência externa",
        inputs: ["Entrada externa"],
        outputs: ["Saída externa"],
        changeSummary: "Cadastro inicial",
      });

    expect(foreignProcess.status).toBe(201);

    const foreignNc = await request(app)
      .post(`/api/organizations/${foreignContext.organizationId}/governance/nonconformities`)
      .set(authHeader(foreignContext))
      .send({
        originType: "incident",
        title: `NC estrangeira ${foreignContext.prefix}`,
        description: "Registro externo",
      });

    expect(foreignNc.status).toBe(201);

    const foreignDocumentPatch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/inputs/${createdInput.body.inputs[0].id}`)
      .set(authHeader(context))
      .send({ documentId: foreignDocument.id });

    expect(foreignDocumentPatch.status).toBe(400);
    expect(foreignDocumentPatch.body.error).toContain("Documento inválido");

    const foreignAuditPatch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/inputs/${createdInput.body.inputs[0].id}`)
      .set(authHeader(context))
      .send({ auditId: foreignAudit.body.id });

    expect(foreignAuditPatch.status).toBe(400);
    expect(foreignAuditPatch.body.error).toContain("Auditoria inválida");

    const foreignNcPatch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/inputs/${createdInput.body.inputs[0].id}`)
      .set(authHeader(context))
      .send({ nonconformityId: foreignNc.body.id });

    expect(foreignNcPatch.status).toBe(400);
    expect(foreignNcPatch.body.error).toContain("Não conformidade inválida");

    const foreignPlanPatch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/inputs/${createdInput.body.inputs[0].id}`)
      .set(authHeader(context))
      .send({ strategicPlanId: foreignPlan.id });

    expect(foreignPlanPatch.status).toBe(400);
    expect(foreignPlanPatch.body.error).toContain("Planejamento estratégico inválido");

    const foreignProcessInputPatch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/inputs/${createdInput.body.inputs[0].id}`)
      .set(authHeader(context))
      .send({ processId: foreignProcess.body.id });

    expect(foreignProcessInputPatch.status).toBe(400);
    expect(foreignProcessInputPatch.body.error).toContain("Processo SGQ inválido");

    const foreignProcessOutputPatch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/outputs/${createdOutput.body.outputs[0].id}`)
      .set(authHeader(context))
      .send({ processId: foreignProcess.body.id });

    expect(foreignProcessOutputPatch.status).toBe(400);
    expect(foreignProcessOutputPatch.body.error).toContain("Processo SGQ inválido");

    const foreignNcOutputPatch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/governance/management-reviews/${review.body.id}/outputs/${createdOutput.body.outputs[0].id}`)
      .set(authHeader(context))
      .send({ nonconformityId: foreignNc.body.id });

    expect(foreignNcOutputPatch.status).toBe(400);
    expect(foreignNcOutputPatch.body.error).toContain("Não conformidade inválida");
  });
});
