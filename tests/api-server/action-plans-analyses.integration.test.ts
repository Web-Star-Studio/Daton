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

function createPlan(context: TestOrgContext, body: object) {
  return request(app)
    .post(`/api/organizations/${context.organizationId}/action-plans`)
    .set(authHeader(context))
    .send({
      sourceModule: "manual",
      sourceRef: {},
      title: "Plano de teste",
      ...body,
    });
}

describe("tratativas no plano", () => {
  it("POST persiste as tratativas", async () => {
    const context = await createTestContext({ seed: "plan-analyses-post" });
    contexts.push(context);

    const res = await createPlan(context, {
      analyses: [{ key: "ishikawa", data: { causes: [], whys: ["porque sim"] } }],
    });

    expect(res.status).toBe(201);
    expect(res.body.analyses).toEqual([
      { key: "ishikawa", data: { causes: [], whys: ["porque sim"] } },
    ]);
  });

  it("POST rejeita tratativa duplicada", async () => {
    const context = await createTestContext({ seed: "plan-analyses-dup" });
    contexts.push(context);

    const res = await createPlan(context, {
      analyses: [
        { key: "a3", data: {} },
        { key: "a3", data: {} },
      ],
    });

    expect(res.status).toBe(400);
  });

  it("PATCH parcial NÃO apaga a tratativa que não foi enviada", async () => {
    const context = await createTestContext({ seed: "plan-analyses-partial-patch" });
    contexts.push(context);

    const created = await createPlan(context, {
      analyses: [{ key: "fmea", data: { rows: [{ id: "r1", failureMode: "Falha" }] } }],
    }).expect(201);

    const res = await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${created.body.id}`)
      .set(authHeader(context))
      .send({ title: "Outro título" });

    expect(res.status).toBe(200);
    expect(res.body.analyses).toHaveLength(1);
    expect(res.body.analyses[0].key).toBe("fmea");
  });

  it("PATCH { analyses: null } limpa as tratativas SEM arrastar a causa raiz junto", async () => {
    const context = await createTestContext({ seed: "plan-analyses-clear" });
    contexts.push(context);

    const created = await createPlan(context, {
      analyses: [{ key: "five_whys", data: { whys: ["a"] } }],
      rootCause: "Causa raiz",
    }).expect(201);

    const res = await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${created.body.id}`)
      .set(authHeader(context))
      .send({ analyses: null });

    expect(res.status).toBe(200);
    expect(res.body.analyses).toBeNull();
    // A limpeza das tratativas não pode zerar a causa raiz (campos independentes do bloco).
    expect(res.body.rootCause).toBe("Causa raiz");
  });

  it("aceita tratativa cuja chave está INATIVA no catálogo (plano antigo tem de continuar salvável)", async () => {
    const context = await createTestContext({ seed: "plan-analyses-inactive-key" });
    contexts.push(context);

    // desativa `a3` no catálogo
    const listRes = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plan-analysis-methods`)
      .set(authHeader(context));
    const a3 = (listRes.body as { id: number; key: string }[]).find((m) => m.key === "a3");
    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plan-analysis-methods/${a3!.id}`)
      .set(authHeader(context))
      .send({ active: false })
      .expect(200);

    const res = await createPlan(context, {
      analyses: [{ key: "a3", data: { goal: "meta" } }],
    });

    expect(res.status).toBe(201);
  });

  it("o activity log grava a versão do planejamento com as tratativas", async () => {
    const context = await createTestContext({ seed: "plan-analyses-activity-log" });
    contexts.push(context);

    const created = await createPlan(context, {
      analyses: [{ key: "five_whys", data: { whys: ["a"] } }],
    }).expect(201);

    const res = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${created.body.id}/activity`)
      .set(authHeader(context));

    const entries = res.body as { changes?: { fields?: { planning?: unknown } } }[];
    const planning = entries.find((e) => e.changes?.fields?.planning) as
      | { changes: { fields: { planning: { to: { analyses: unknown } } } } }
      | undefined;

    expect(planning?.changes.fields.planning.to.analyses).toEqual([
      { key: "five_whys", data: { whys: ["a"] } },
    ]);
  });
});
