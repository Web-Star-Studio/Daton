import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { actionPlansTable, db } from "@workspace/db";
import app from "../../artifacts/api-server/src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => cleanupTestContext(context)));
});

function createPlan(context: TestOrgContext, body: object = {}) {
  return request(app)
    .post(`/api/organizations/${context.organizationId}/action-plans`)
    .set(authHeader(context))
    .send({ sourceModule: "manual", sourceRef: {}, title: "Plano", ...body });
}

function actionsUrl(context: TestOrgContext, planId: number, actionId?: number) {
  const base = `/api/organizations/${context.organizationId}/action-plans/${planId}/actions`;
  return actionId ? `${base}/${actionId}` : base;
}

function pendenciasUrl(context: TestOrgContext) {
  return `/api/organizations/${context.organizationId}/pendencias`;
}

describe("pendências das ações do plano", () => {
  it("a ação aparece para o responsável DELA, e o plano continua aparecendo para o responsável do plano", async () => {
    const context = await createTestContext({ seed: "pendencia-action" }); // context.userId = responsável do plano
    contexts.push(context);
    const executor = await createTestUser(context, { role: "operator", suffix: "executor" });

    const plan = await createPlan(context, { responsibleUserId: context.userId }).expect(201);

    await request(app)
      .post(actionsUrl(context, plan.body.id))
      .set(authHeader(context))
      .send({ what: "Treinar motoristas", responsibleUserId: executor.id })
      .expect(201);

    // O executor vê a AÇÃO dele.
    const suas = await request(app)
      .get(pendenciasUrl(context))
      .set({ Authorization: `Bearer ${executor.token}` });
    const sources = (suas.body.items ?? suas.body).map((p: { source: string }) => p.source);
    expect(sources).toContain("action_plan_action");

    // O responsável do plano continua vendo o PLANO.
    const doGestor = await request(app).get(pendenciasUrl(context)).set(authHeader(context));
    const sourcesGestor = (doGestor.body.items ?? doGestor.body).map(
      (p: { source: string }) => p.source,
    );
    expect(sourcesGestor).toContain("action_plan");
  });

  it("ação concluída sai das pendências", async () => {
    const context = await createTestContext({ seed: "pendencia-action-done" });
    contexts.push(context);
    const plan = await createPlan(context).expect(201);
    const action = await request(app)
      .post(actionsUrl(context, plan.body.id))
      .set(authHeader(context))
      .send({ what: "Fazer", responsibleUserId: context.userId })
      .expect(201);

    await request(app)
      .patch(actionsUrl(context, plan.body.id, action.body.id))
      .set(authHeader(context))
      .send({ status: "completed" })
      .expect(200);

    const suas = await request(app).get(pendenciasUrl(context)).set(authHeader(context));
    const ids = (suas.body.items ?? suas.body).map((p: { id: string }) => p.id);
    expect(ids).not.toContain(`action_plan_action:${action.body.id}`);
  });

  it("plano encerrado tira a ação das pendências (senão vira beco: 409 ao concluir)", async () => {
    const context = await createTestContext({ seed: "pendencia-action-locked" });
    contexts.push(context);
    const executor = await createTestUser(context, { role: "operator", suffix: "executor" });

    const plan = await createPlan(context, { responsibleUserId: context.userId }).expect(201);
    const action = await request(app)
      .post(actionsUrl(context, plan.body.id))
      .set(authHeader(context))
      .send({ what: "Treinar motoristas", responsibleUserId: executor.id })
      .expect(201);

    // Com o plano ativo, a ação aparece para o executor.
    const antes = await request(app)
      .get(pendenciasUrl(context))
      .set({ Authorization: `Bearer ${executor.token}` });
    const idsAntes = (antes.body.items ?? antes.body).map((p: { id: string }) => p.id);
    expect(idsAntes).toContain(`action_plan_action:${action.body.id}`);

    // Encerra o plano (cancelado). A ação continua "open", mas editá-la agora dá 409.
    await db
      .update(actionPlansTable)
      .set({ status: "cancelled" })
      .where(eq(actionPlansTable.id, plan.body.id));

    const depois = await request(app)
      .get(pendenciasUrl(context))
      .set({ Authorization: `Bearer ${executor.token}` });
    const idsDepois = (depois.body.items ?? depois.body).map((p: { id: string }) => p.id);
    expect(idsDepois).not.toContain(`action_plan_action:${action.body.id}`);
  });
});
