import request from "supertest";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { actionPlansTable, db } from "@workspace/db";
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
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function seedPlan(
  ctx: TestOrgContext,
  opts: { title?: string; pontoFocal?: number | null } = {},
): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: opts.title ?? "Plano",
      responsibleUserId: opts.pontoFocal === undefined ? ctx.userId : opts.pontoFocal,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("planos de ação — leitura com co-responsáveis", () => {
  it("GET /:planId devolve os co-responsáveis ordenados por nome, sem o ponto focal", async () => {
    const ctx = await createTestContext({ seed: "ap-co-read", role: "org_admin" });
    contexts.push(ctx);
    const zeca = await createTestUser(ctx, { suffix: "zeca", role: "operator" });
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedPlan(ctx); // ponto focal = ctx.userId
    await setPlanCoResponsibles(ctx.organizationId, planId, [zeca.id, ana.id]);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.responsibleUserId).toBe(ctx.userId); // o ponto focal segue onde estava
    expect(res.body.coResponsibles.map((r: { userId: number }) => r.userId)).toEqual([ana.id, zeca.id]);
  });

  it("GET /:planId devolve [] quando o plano não tem co-responsável", async () => {
    const ctx = await createTestContext({ seed: "ap-co-none", role: "org_admin" });
    contexts.push(ctx);
    const planId = await seedPlan(ctx);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.coResponsibles).toEqual([]);
  });

  it("?responsibleUserId=X acha o plano tanto pelo ponto focal quanto pelo co-responsável", async () => {
    const ctx = await createTestContext({ seed: "ap-co-filter", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const outro = await createTestUser(ctx, { suffix: "outro", role: "operator" });

    const comoFocal = await seedPlan(ctx, { title: "Focal", pontoFocal: co.id });
    const comoCo = await seedPlan(ctx, { title: "Co", pontoFocal: outro.id });
    await setPlanCoResponsibles(ctx.organizationId, comoCo, [co.id]);
    await seedPlan(ctx, { title: "Alheio", pontoFocal: outro.id });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans?responsibleUserId=${co.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: number }) => p.id).sort((a: number, b: number) => a - b);
    expect(ids).toEqual([comoFocal, comoCo].sort((a, b) => a - b));
  });

  it("POST cria com ponto focal + co-responsáveis", async () => {
    const ctx = await createTestContext({ seed: "ap-co-create", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });

    const res = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({
        sourceModule: "manual",
        sourceRef: { manualContext: "t" },
        title: "Ação com time",
        responsibleUserId: ctx.userId,
        coResponsibleUserIds: [ana.id, bruno.id],
      });

    expect(res.status).toBe(201);
    expect(res.body.responsibleUserId).toBe(ctx.userId);
    expect(res.body.coResponsibles).toHaveLength(2);
  });

  it("PATCH substitui o conjunto inteiro de co-responsáveis e aceita conjunto vazio", async () => {
    const ctx = await createTestContext({ seed: "ap-co-patch", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });
    const planId = await seedPlan(ctx);
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id]);

    const trocou = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [bruno.id] });
    expect(trocou.status).toBe(200);
    expect(trocou.body.coResponsibles.map((r: { userId: number }) => r.userId)).toEqual([bruno.id]);

    const esvaziou = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [] });
    expect(esvaziou.status).toBe(200);
    expect(esvaziou.body.coResponsibles).toEqual([]);
  });

  it("rejeita o PONTO FOCAL na lista de co-responsáveis (ninguém é responsável duas vezes)", async () => {
    const ctx = await createTestContext({ seed: "ap-co-dup", role: "org_admin" });
    contexts.push(ctx);
    const planId = await seedPlan(ctx); // ponto focal = ctx.userId

    const res = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [ctx.userId] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ponto focal");
  });

  it("rejeita usuário de outra organização entre os co-responsáveis", async () => {
    const ctx = await createTestContext({ seed: "ap-co-org", role: "org_admin" });
    const alheio = await createTestContext({ seed: "ap-co-org-b", role: "org_admin" });
    contexts.push(ctx, alheio);
    const planId = await seedPlan(ctx);

    const res = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [alheio.userId] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("organização");
  });

  it("o avaliador da eficácia não pode ser o ponto focal NEM um co-responsável", async () => {
    const ctx = await createTestContext({ seed: "ap-co-eval", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const planId = await seedPlan(ctx); // ponto focal = ctx.userId

    // designa o avaliador (admin pode)
    await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ effectivenessEvaluatorUserId: co.id })
      .expect(200);

    // agora tentar torná-lo co-responsável tem de falhar
    const conflito = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [co.id] });

    expect(conflito.status).toBe(400);
    expect(conflito.body.error).toContain("diferente");
  });

  it("registra a troca de co-responsáveis no histórico com NOMES, não ids", async () => {
    const ctx = await createTestContext({ seed: "ap-co-log", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedPlan(ctx);

    await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [ana.id] })
      .expect(200);

    const activity = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${planId}/activity`)
      .set(authHeader(ctx));

    const entry = activity.body.find(
      (e: { changes?: { fields?: Record<string, unknown> } }) => e.changes?.fields?.coResponsibles,
    );
    expect(entry).toBeDefined();
    const { from, to } = entry.changes.fields.coResponsibles as { from: string[]; to: string[] };
    expect(from).toEqual([]);
    expect(to).toHaveLength(1);
    // nome, não id — o histórico é lido por auditor, não por programador
    expect(/^\d+$/.test(to[0])).toBe(false);
  });
});
