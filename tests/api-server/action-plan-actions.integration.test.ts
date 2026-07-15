import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../artifacts/api-server/src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
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

describe("ações do plano", () => {
  it("cria uma ação vazia (a linha nasce em branco no `+ Incluir ação`)", async () => {
    const context = await createTestContext({ seed: "action-empty" });
    contexts.push(context);
    const plan = await createPlan(context).expect(201);

    const res = await request(app)
      .post(actionsUrl(context, plan.body.id))
      .set(authHeader(context))
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
    expect(res.body.what).toBeNull();
  });

  it("PATCH grava completedAt ao concluir e o limpa ao reabrir", async () => {
    const context = await createTestContext({ seed: "action-complete" });
    contexts.push(context);
    const plan = await createPlan(context).expect(201);

    const created = await request(app)
      .post(actionsUrl(context, plan.body.id))
      .set(authHeader(context))
      .send({ what: "Treinar motoristas" })
      .expect(201);

    const done = await request(app)
      .patch(actionsUrl(context, plan.body.id, created.body.id))
      .set(authHeader(context))
      .send({ status: "completed" });
    expect(done.status).toBe(200);
    expect(done.body.completedAt).not.toBeNull();

    const reopened = await request(app)
      .patch(actionsUrl(context, plan.body.id, created.body.id))
      .set(authHeader(context))
      .send({ status: "in_progress" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.completedAt).toBeNull();
  });

  it("concluir uma ação SEM `what` é 400 — ação sem enunciado não pode ser dada como feita", async () => {
    const context = await createTestContext({ seed: "action-no-what" });
    contexts.push(context);
    const plan = await createPlan(context).expect(201);

    const created = await request(app)
      .post(actionsUrl(context, plan.body.id))
      .set(authHeader(context))
      .send({})
      .expect(201);

    const res = await request(app)
      .patch(actionsUrl(context, plan.body.id, created.body.id))
      .set(authHeader(context))
      .send({ status: "completed" });

    expect(res.status).toBe(400);
  });

  it("rejeita responsável de outra organização", async () => {
    const context = await createTestContext({ seed: "action-cross-org" });
    contexts.push(context);
    const other = await createTestContext({ seed: "action-cross-org-other" });
    contexts.push(other);
    const plan = await createPlan(context).expect(201);

    const res = await request(app)
      .post(actionsUrl(context, plan.body.id))
      .set(authHeader(context))
      .send({ what: "x", responsibleUserId: other.userId });

    expect(res.status).toBe(400);
  });

  it("o plano expõe actionsTotal / actionsDone", async () => {
    const context = await createTestContext({ seed: "action-aggregates" });
    contexts.push(context);
    const plan = await createPlan(context).expect(201);

    for (const what of ["A", "B"]) {
      await request(app)
        .post(actionsUrl(context, plan.body.id))
        .set(authHeader(context))
        .send({ what })
        .expect(201);
    }

    const list = await request(app)
      .get(actionsUrl(context, plan.body.id))
      .set(authHeader(context));
    expect(list.body).toHaveLength(2);

    await request(app)
      .patch(actionsUrl(context, plan.body.id, list.body[0].id))
      .set(authHeader(context))
      .send({ status: "completed" })
      .expect(200);

    const reloaded = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${plan.body.id}`)
      .set(authHeader(context));
    expect(reloaded.body.actionsTotal).toBe(2);
    expect(reloaded.body.actionsDone).toBe(1);

    // A listagem de planos usa o mesmo agregado (um único SELECT agrupado) — não N+1.
    const planList = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .set(authHeader(context));
    const listedPlan = (planList.body as { id: number; actionsTotal: number; actionsDone: number }[]).find(
      (p) => p.id === plan.body.id,
    );
    expect(listedPlan?.actionsTotal).toBe(2);
    expect(listedPlan?.actionsDone).toBe(1);
  });

  it("plano encerrado devolve 409 ao criar ação", async () => {
    const context = await createTestContext({ seed: "action-locked" });
    contexts.push(context);
    const plan = await createPlan(context).expect(201);

    // encerra: completed + veredito de eficácia
    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${plan.body.id}`)
      .set(authHeader(context))
      .send({ status: "completed", effectivenessResult: "effective" })
      .expect(200);

    const res = await request(app)
      .post(actionsUrl(context, plan.body.id))
      .set(authHeader(context))
      .send({ what: "tarde demais" });

    expect(res.status).toBe(409);
  });

  it("DELETE remove e o activity log guarda o `what`", async () => {
    const context = await createTestContext({ seed: "action-delete" });
    contexts.push(context);
    const plan = await createPlan(context).expect(201);

    const created = await request(app)
      .post(actionsUrl(context, plan.body.id))
      .set(authHeader(context))
      .send({ what: "Bloquear no sistema" })
      .expect(201);

    const del = await request(app)
      .delete(actionsUrl(context, plan.body.id, created.body.id))
      .set(authHeader(context));
    expect(del.status).toBe(204);

    const entries = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${plan.body.id}/activity`)
      .set(authHeader(context));

    const removed = (entries.body as { action: string; changes: { what?: string } }[]).find(
      (e) => e.action === "action_removed",
    );
    expect(removed?.changes.what).toBe("Bloquear no sistema");
  });
});
