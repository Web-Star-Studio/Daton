import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => cleanupTestContext(context)));
});

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
    expect(finishedAction.body.status).toBe("awaiting_effectiveness");

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
});
