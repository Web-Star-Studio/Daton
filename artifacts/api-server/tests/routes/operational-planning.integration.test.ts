import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  sgqProcessesTable,
  strategicPlanRiskOpportunityItemsTable,
  strategicPlansTable,
} from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  createTestUser,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

async function createDocumentForTest(context: TestOrgContext) {
  const elaborator = await createEmployee(context, {
    name: `Elaborador ${context.prefix}`,
  });
  const reviewer = await createTestUser(context, {
    role: "org_admin",
    suffix: "reviewer",
    modules: ["documents"],
  });
  const approver = await createTestUser(context, {
    role: "org_admin",
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
      title: `Procedimento ${context.prefix}`,
      type: "manual",
      validityDate: "2030-01-01",
      elaboratorIds: [elaborator.id],
      criticalReviewerIds: [reviewer.id],
      approverIds: [approver.id],
      recipientIds: [recipient.id],
    });

  expect(response.status).toBe(201);

  return response.body as { id: number };
}

async function createSgqProcessForTest(context: TestOrgContext) {
  const [process] = await db
    .insert(sgqProcessesTable)
    .values({
      organizationId: context.organizationId,
      name: `Processo Operacional ${context.prefix}`,
      objective: "Executar serviço com controles definidos.",
      inputs: ["Demanda"],
      outputs: ["Entrega"],
      criteria: "Conformidade operacional",
      createdById: context.userId,
      updatedById: context.userId,
    })
    .returning({ id: sgqProcessesTable.id });

  return process;
}

async function createRiskItemForTest(context: TestOrgContext) {
  const [plan] = await db
    .insert(strategicPlansTable)
    .values({
      organizationId: context.organizationId,
      title: `Plano Estratégico ${context.prefix}`,
      createdById: context.userId,
      updatedById: context.userId,
    })
    .returning({ id: strategicPlansTable.id });

  const [risk] = await db
    .insert(strategicPlanRiskOpportunityItemsTable)
    .values({
      organizationId: context.organizationId,
      planId: plan.id,
      type: "risk",
      sourceType: "other",
      title: `Risco Operacional ${context.prefix}`,
      description: "Mudança sem validação pode comprometer conformidade.",
      status: "identified",
      sortOrder: 0,
    })
    .returning({ id: strategicPlanRiskOpportunityItemsTable.id });

  return risk;
}

describe("operational planning routes", () => {
  it("creates a plan, blocks cycle progression until readiness is complete and tracks controlled changes", async () => {
    const context = await createTestContext({
      seed: "operational-planning-flow",
    });
    contexts.push(context);

    const unit = await createUnit(context);
    const responsible = await createEmployee(context, {
      name: `Responsável ${context.prefix}`,
      unitId: unit.id,
    });
    const document = await createDocumentForTest(context);
    const process = await createSgqProcessForTest(context);
    const risk = await createRiskItemForTest(context);

    const createdPlan = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/operational-plans`,
      )
      .set(authHeader(context))
      .send({
        title: `Plano operacional ${context.prefix}`,
        planCode: `OP-${context.prefix}`,
        processId: process.id,
        unitId: unit.id,
        responsibleId: responsible.id,
        serviceType: "Prestação de serviço SGI",
        scope: "Planejar execução para cliente crítico.",
        executionCriteria: "Checklist completo e documentação atualizada.",
        requiredResources: ["Equipe", "Veículo"],
        inputs: ["Pedido"],
        outputs: ["Entrega registrada"],
        esgConsiderations: "Verificar critérios ambientais e segurança operacional.",
        documentIds: [document.id],
        riskOpportunityItemIds: [risk.id],
      });

    expect(createdPlan.status).toBe(201);
    expect(createdPlan.body.documents).toHaveLength(1);
    expect(createdPlan.body.riskLinks).toHaveLength(1);

    const planId = createdPlan.body.id as number;

    const checklistResponse = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/operational-plans/${planId}/checklist-items`,
      )
      .set(authHeader(context))
      .send({
        title: "Documento vigente confirmado",
        instructions: "Validar última revisão documental antes da execução.",
        isCritical: true,
        sortOrder: 1,
      });

    expect(checklistResponse.status).toBe(201);
    expect(checklistResponse.body.checklistItems).toHaveLength(1);

    const cycleResponse = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/operational-plans/${planId}/cycles`,
      )
      .set(authHeader(context))
      .send({
        cycleCode: `CICLO-${context.prefix}`,
        evidenceSummary: "Preparação inicial do ciclo.",
      });

    expect(cycleResponse.status).toBe(201);
    expect(cycleResponse.body.cycles).toHaveLength(1);
    expect(cycleResponse.body.cycles[0].readinessExecutions).toHaveLength(1);

    const cycleId = cycleResponse.body.cycles[0].id as number;
    const checklistItemId =
      cycleResponse.body.cycles[0].readinessExecutions[0].checklistItemId as number;

    const otherPlanResponse = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/operational-plans`,
      )
      .set(authHeader(context))
      .send({
        title: `Plano paralelo ${context.prefix}`,
      });

    expect(otherPlanResponse.status).toBe(201);

    const otherPlanId = otherPlanResponse.body.id as number;

    const otherCycleResponse = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/operational-plans/${otherPlanId}/cycles`,
      )
      .set(authHeader(context))
      .send({
        cycleCode: `CICLO-PARALELO-${context.prefix}`,
      });

    expect(otherCycleResponse.status).toBe(201);

    const foreignCycleId = otherCycleResponse.body.cycles[0].id as number;

    const blockedCycleUpdate = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/governance/operational-plans/${planId}/cycles/${cycleId}`,
      )
      .set(authHeader(context))
      .send({
        status: "ready",
      });

    expect(blockedCycleUpdate.status).toBe(400);
    expect(blockedCycleUpdate.body.error).toContain("itens críticos");

    const readinessUpdate = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/governance/operational-plans/${planId}/cycles/${cycleId}/readiness-items/${checklistItemId}`,
      )
      .set(authHeader(context))
      .send({
        status: "ok",
        executedById: responsible.id,
        evidenceNote: "Documento vigente conferido antes da operação.",
      });

    expect(readinessUpdate.status).toBe(200);
    expect(readinessUpdate.body.cycles[0].readinessExecutions[0].status).toBe("ok");

    const readyCycleUpdate = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/governance/operational-plans/${planId}/cycles/${cycleId}`,
      )
      .set(authHeader(context))
      .send({
        status: "ready",
      });

    expect(readyCycleUpdate.status).toBe(200);
    expect(readyCycleUpdate.body.cycles[0].status).toBe("ready");

    const invalidForeignCycleChange = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/operational-plans/${planId}/changes`,
      )
      .set(authHeader(context))
      .send({
        title: "Mudança vinculada a ciclo de outro plano",
        cycleEvidenceId: foreignCycleId,
        reason: "Tentativa de vincular evidência incorreta.",
      });

    expect(invalidForeignCycleChange.status).toBe(400);
    expect(invalidForeignCycleChange.body.error).toContain("Ciclo operacional inválido");

    const invalidChange = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/operational-plans/${planId}/changes`,
      )
      .set(authHeader(context))
      .send({
        title: "Mudança crítica sem mitigação",
        reason: "Troca de sequência operacional no último minuto.",
        impactLevel: "critical",
        decision: "pending",
      });

    expect(invalidChange.status).toBe(400);
    expect(invalidChange.body.error).toContain("ação mitigatória");

    const validChange = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/operational-plans/${planId}/changes`,
      )
      .set(authHeader(context))
      .send({
        title: "Mudança controlada do fluxo",
        cycleEvidenceId: cycleId,
        reason: "Cliente alterou janela de atendimento.",
        impactLevel: "critical",
        impactDescription: "Requer ajuste de horário e reforço documental.",
        mitigationAction: "Nova validação de prontidão e comunicação ao time.",
        decision: "approved",
        riskOpportunityItemIds: [risk.id],
      });

    expect(validChange.status).toBe(201);
    expect(validChange.body.changes).toHaveLength(1);
    expect(validChange.body.changes[0].decision).toBe("approved");
    expect(validChange.body.changes[0].risks).toHaveLength(1);
  });
});
