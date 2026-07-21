import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { actionPlanActionsTable, actionPlansTable, db } from "@workspace/db";
import type { ActionPlanSourceModule } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../tests/support/backend";
import { setPlanCoResponsibles } from "../../src/services/action-plans/responsibles";

const contexts: TestOrgContext[] = [];

async function createPlan(
  organizationId: number,
  options: {
    sourceModule: ActionPlanSourceModule;
    responsibleUserId?: number | null;
    effectivenessEvaluatorUserId?: number | null;
  },
): Promise<number> {
  const [plan] = await db
    .insert(actionPlansTable)
    .values({
      organizationId,
      sourceModule: options.sourceModule,
      sourceRef: {},
      title: `Plano ${options.sourceModule}`,
      responsibleUserId: options.responsibleUserId ?? null,
      effectivenessEvaluatorUserId: options.effectivenessEvaluatorUserId ?? null,
    })
    .returning({ id: actionPlansTable.id });
  return plan.id;
}

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

/**
 * The hub (`/planos-acao`) is gated by the `actionPlans` module, but the
 * "Ações vinculadas" widget embedded in KPI/SWOT/governança/... screens reads the
 * same list endpoint scoped by `sourceModule`. Access there follows the ORIGIN
 * module, so granting `kpi` alone keeps the RAC flow intact.
 */
describe("action plans module access", () => {
  it("denies the hub listing to a non-admin without the actionPlans module", async () => {
    const context = await createTestContext({
      seed: "ap-hub-denied",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Sem acesso");
  });

  it("denies the hub summary to a non-admin without the actionPlans module", async () => {
    const context = await createTestContext({
      seed: "ap-summary-denied",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/summary`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
  });

  it("denies the external-actions bridge to a non-admin without the actionPlans module", async () => {
    const context = await createTestContext({
      seed: "ap-external-denied",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/action-plans/external-actions`,
      )
      .set(authHeader(context));

    expect(response.status).toBe(403);
  });

  it("allows the embedded widget to read plans scoped to a module the user owns", async () => {
    const context = await createTestContext({
      seed: "ap-embed-kpi",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .query({ sourceModule: "rac" })
      .set(authHeader(context));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("denies a scoped read when the user lacks the origin module", async () => {
    const context = await createTestContext({
      seed: "ap-embed-foreign",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .query({ sourceModule: "swot" })
      .set(authHeader(context));

    expect(response.status).toBe(403);
  });

  it("allows the full hub to a non-admin holding the actionPlans module", async () => {
    const context = await createTestContext({
      seed: "ap-hub-granted",
      role: "operator",
      modules: ["actionPlans"],
    });
    contexts.push(context);

    const listing = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .set(authHeader(context));
    expect(listing.status).toBe(200);

    const summary = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/summary`)
      .set(authHeader(context));
    expect(summary.status).toBe(200);
  });

  it("keeps the hub open to org admins without explicit module rows", async () => {
    const context = await createTestContext({
      seed: "ap-hub-admin",
      role: "org_admin",
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
  });
});

/**
 * The hub gate would be trivially bypassable if any authenticated member of the
 * org could read a plan by guessing its id. A plan is reachable by whoever holds
 * the hub module, the module that owns its origin, or is personally assigned to
 * it (responsible / effectiveness evaluator — how "Suas Pendências" links here).
 */
describe("action plan detail access", () => {
  it("denies a plan whose origin module the user does not hold", async () => {
    const context = await createTestContext({
      seed: "ap-detail-foreign",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);
    const planId = await createPlan(context.organizationId, { sourceModule: "swot" });

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
  });

  it("allows a plan spawned from an origin module the user holds", async () => {
    const context = await createTestContext({
      seed: "ap-detail-origin",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);
    const planId = await createPlan(context.organizationId, { sourceModule: "rac" });

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
  });

  it("allows the responsible user even with no module at all", async () => {
    const context = await createTestContext({
      seed: "ap-detail-responsible",
      role: "operator",
    });
    contexts.push(context);
    const planId = await createPlan(context.organizationId, {
      sourceModule: "manual",
      responsibleUserId: context.userId,
    });

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
  });

  it("allows the effectiveness evaluator even with no module at all", async () => {
    const context = await createTestContext({
      seed: "ap-detail-evaluator",
      role: "operator",
    });
    contexts.push(context);
    const planId = await createPlan(context.organizationId, {
      sourceModule: "manual",
      effectivenessEvaluatorUserId: context.userId,
    });

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
  });

  it("guards the plan's comments and activity the same way", async () => {
    const context = await createTestContext({
      seed: "ap-detail-subresources",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);
    const planId = await createPlan(context.organizationId, { sourceModule: "swot" });

    const comments = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}/comments`)
      .set(authHeader(context));
    expect(comments.status).toBe(403);

    const activity = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}/activity`)
      .set(authHeader(context));
    expect(activity.status).toBe(403);
  });

  it("blocks editing and deleting a plan the user may not reach", async () => {
    const context = await createTestContext({
      seed: "ap-detail-write",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);
    const planId = await createPlan(context.organizationId, { sourceModule: "swot" });

    const patch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context))
      .send({ title: "Invadido" });
    expect(patch.status).toBe(403);

    const remove = await request(app)
      .delete(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));
    expect(remove.status).toBe(403);
  });

  it("still answers 404 for a plan that does not exist", async () => {
    const context = await createTestContext({
      seed: "ap-detail-missing",
      role: "operator",
      modules: ["actionPlans"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/99999999`)
      .set(authHeader(context));

    expect(response.status).toBe(404);
  });

  it("allows a CO-RESPONSIBLE user even with no module at all", async () => {
    const context = await createTestContext({
      seed: "ap-detail-coresponsible",
      role: "operator",
    });
    contexts.push(context);
    const outro = await createTestUser(context, { suffix: "focal", role: "operator" });
    // o ponto focal é OUTRA pessoa; o usuário do contexto é só co-responsável
    const planId = await createPlan(context.organizationId, {
      sourceModule: "manual",
      responsibleUserId: outro.id,
    });
    await setPlanCoResponsibles(context.organizationId, planId, [context.userId]);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
  });

  // Regressão: quem executa uma AÇÃO do plano (sem ser ponto focal, co-responsável
  // nem ter módulo) recebe a ação em "Suas Pendências" com link para a ficha. Sem
  // este acesso, a pendência viraria um beco: 403 ao abrir o plano e as ações.
  it("allows the responsible of an ACTION-ITEM even with no module at all", async () => {
    const context = await createTestContext({
      seed: "ap-detail-action-assignee",
      role: "operator",
    });
    contexts.push(context);
    const outro = await createTestUser(context, { suffix: "focal", role: "operator" });
    const planId = await createPlan(context.organizationId, {
      sourceModule: "manual",
      responsibleUserId: outro.id, // ponto focal é OUTRA pessoa
    });
    await db.insert(actionPlanActionsTable).values({
      organizationId: context.organizationId,
      actionPlanId: planId,
      what: "Executar",
      responsibleUserId: context.userId, // o usuário do contexto só executa a ação
    });

    const detail = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));
    expect(detail.status).toBe(200);

    const actions = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}/actions`)
      .set(authHeader(context));
    expect(actions.status).toBe(200);
  });
});
