import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => cleanupTestContext(context)));
});

describe("planos de ação criados dentro do módulo (origem escolhida)", () => {
  it("cria com origem 'improvement' sem entidade vinculada e devolve o rótulo da origem", async () => {
    const ctx = await createTestContext({ seed: "origem-improvement" });
    contexts.push(ctx);

    const created = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({
        sourceModule: "improvement",
        sourceRef: { manualContext: "Fila no recebimento de mercadorias" },
        title: "Reduzir tempo de recebimento",
        actionType: "improvement",
      });

    expect(created.status).toBe(201);
    expect(created.body.sourceModule).toBe("improvement");

    const detail = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${created.body.id}`)
      .set(authHeader(ctx));

    expect(detail.status).toBe(200);
    expect(detail.body.sourceContext.label).toBe(
      "Melhoria de Processo · Fila no recebimento de mercadorias",
    );
  });

  it("usa só o nome da origem quando não há contexto livre", async () => {
    const ctx = await createTestContext({ seed: "origem-sem-contexto" });
    contexts.push(ctx);

    const created = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({ sourceModule: "norm_requirement", sourceRef: {}, title: "Fechar lacuna da ISO 9001 9.1" });

    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${created.body.id}`)
      .set(authHeader(ctx));

    expect(detail.body.sourceContext.label).toBe("Não atendimento a requisito da norma");
  });

  it("filtra a listagem por origem", async () => {
    const ctx = await createTestContext({ seed: "origem-filtro" });
    contexts.push(ctx);

    for (const [sourceModule, title] of [
      ["improvement", "Melhoria A"],
      ["corrective", "Corretiva B"],
    ] as const) {
      const res = await request(app)
        .post(`/api/organizations/${ctx.organizationId}/action-plans`)
        .set(authHeader(ctx))
        .send({ sourceModule, sourceRef: {}, title });
      expect(res.status).toBe(201);
    }

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .query({ sourceModule: "corrective" })
      .set(authHeader(ctx));

    expect(list.status).toBe(200);
    expect(list.body.map((p: { title: string }) => p.title)).toEqual(["Corretiva B"]);
    expect(list.body[0].sourceContext.label).toBe("Corretiva");
  });
});
