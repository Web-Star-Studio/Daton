import request from "supertest";
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

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function seedPlan(ctx: TestOrgContext, pontoFocal: number | null): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: "Plano",
      responsibleUserId: pontoFocal,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

const planUrl = (ctx: TestOrgContext, planId: number) =>
  `/api/organizations/${ctx.organizationId}/action-plans/${planId}`;
const actionsUrl = (ctx: TestOrgContext, planId: number, actionId?: number) =>
  `${planUrl(ctx, planId)}/actions${actionId != null ? `/${actionId}` : ""}`;

const coIds = (body: { coResponsibles: { userId: number }[] }) =>
  body.coResponsibles.map((r) => r.userId);

/**
 * Desde o "Como" com dono por passo, co-responsável é DERIVADO: quem responde por uma
 * ação ou recebe um passo entra no espelho do plano (pendências/escalonamento/acesso),
 * mas com acesso ESTREITO — abre a ficha e mexe só no que é dele, não conduz o plano.
 */
describe("dono de passo do Como → espelho de co-responsáveis + acesso estreito", () => {
  it("atribuir um passo torna a pessoa co-responsável e dá acesso (só leitura) à ficha", async () => {
    const ctx = await createTestContext({ seed: "ht-mirror", role: "org_admin" });
    contexts.push(ctx);
    const exec = await createTestUser(ctx, { suffix: "exec", role: "operator" });
    const planId = await seedPlan(ctx, ctx.userId); // ponto focal = admin

    const created = await request(app)
      .post(actionsUrl(ctx, planId))
      .set(authHeader(ctx))
      .send({
        what: "Fazer",
        howTasks: [{ id: "t1", text: "Passo do exec", done: false, assigneeUserId: exec.id }],
      })
      .expect(201);
    // O nome do dono é composto na leitura (não vem do cliente).
    expect(created.body.howTasks[0].assigneeUserId).toBe(exec.id);
    expect(created.body.howTasks[0].assigneeUserName).toBeTruthy();

    // Entrou no espelho derivado.
    const asAdmin = await request(app).get(planUrl(ctx, planId)).set(authHeader(ctx)).expect(200);
    expect(coIds(asAdmin.body)).toContain(exec.id);

    // Alcança a ficha e as ações mesmo SEM o módulo actionPlans.
    expect((await request(app).get(planUrl(ctx, planId)).set(authHeader(exec))).status).toBe(200);
    expect((await request(app).get(actionsUrl(ctx, planId)).set(authHeader(exec))).status).toBe(200);
  });

  it("o dono do passo marca só o SEU passo — não muda texto, não marca o de outro, não edita o plano", async () => {
    const ctx = await createTestContext({ seed: "ht-narrow", role: "org_admin" });
    contexts.push(ctx);
    const exec = await createTestUser(ctx, { suffix: "exec", role: "operator" });
    const outro = await createTestUser(ctx, { suffix: "outro", role: "operator" });
    const planId = await seedPlan(ctx, ctx.userId);

    const created = await request(app)
      .post(actionsUrl(ctx, planId))
      .set(authHeader(ctx))
      .send({
        what: "Original",
        howTasks: [
          { id: "t1", text: "Passo do exec", done: false, assigneeUserId: exec.id },
          { id: "t2", text: "Passo do outro", done: false, assigneeUserId: outro.id },
        ],
      })
      .expect(201);
    const actionId = created.body.id as number;

    // exec tenta abusar: renomear o seu, reatribuir, marcar o do outro e mudar o `what`.
    const patched = await request(app)
      .patch(actionsUrl(ctx, planId, actionId))
      .set(authHeader(exec))
      .send({
        what: "INVADIDO",
        howTasks: [
          { id: "t1", text: "RENOMEADO", done: true, assigneeUserId: 999999 },
          { id: "t2", text: "Passo do outro", done: true, assigneeUserId: outro.id },
        ],
      })
      .expect(200);

    const t1 = patched.body.howTasks.find((t: { id: string }) => t.id === "t1");
    const t2 = patched.body.howTasks.find((t: { id: string }) => t.id === "t2");
    expect(t1.done).toBe(true);
    expect(t1.doneByUserId).toBe(exec.id); // carimbo do servidor
    expect(t1.text).toBe("Passo do exec"); // texto NÃO mudou
    expect(t1.assigneeUserId).toBe(exec.id); // reatribuição ignorada
    expect(t2.done).toBe(false); // não marcou o passo de outro
    expect(patched.body.what).toBe("Original"); // demais campos intocados

    // Não conduz o plano.
    expect(
      (await request(app).patch(planUrl(ctx, planId)).set(authHeader(exec)).send({ title: "x" })).status,
    ).toBe(403);
    expect((await request(app).delete(planUrl(ctx, planId)).set(authHeader(exec))).status).toBe(403);
  });

  it("o responsável de uma AÇÃO também entra no espelho", async () => {
    const ctx = await createTestContext({ seed: "ht-action-resp", role: "org_admin" });
    contexts.push(ctx);
    const exec = await createTestUser(ctx, { suffix: "exec", role: "operator" });
    const planId = await seedPlan(ctx, ctx.userId);

    await request(app)
      .post(actionsUrl(ctx, planId))
      .set(authHeader(ctx))
      .send({ what: "X", responsibleUserId: exec.id })
      .expect(201);

    const plan = await request(app).get(planUrl(ctx, planId)).set(authHeader(ctx)).expect(200);
    expect(coIds(plan.body)).toContain(exec.id);
  });

  it("remover a ação tira a pessoa do espelho", async () => {
    const ctx = await createTestContext({ seed: "ht-remove", role: "org_admin" });
    contexts.push(ctx);
    const exec = await createTestUser(ctx, { suffix: "exec", role: "operator" });
    const planId = await seedPlan(ctx, ctx.userId);

    const created = await request(app)
      .post(actionsUrl(ctx, planId))
      .set(authHeader(ctx))
      .send({ what: "X", responsibleUserId: exec.id })
      .expect(201);

    let plan = await request(app).get(planUrl(ctx, planId)).set(authHeader(ctx)).expect(200);
    expect(coIds(plan.body)).toContain(exec.id);

    await request(app)
      .delete(actionsUrl(ctx, planId, created.body.id))
      .set(authHeader(ctx))
      .expect(204);

    plan = await request(app).get(planUrl(ctx, planId)).set(authHeader(ctx)).expect(200);
    expect(coIds(plan.body)).not.toContain(exec.id);
  });

  it("passo atribuído ao PRÓPRIO ponto focal não o duplica no espelho", async () => {
    const ctx = await createTestContext({ seed: "ht-focal-dup", role: "org_admin" });
    contexts.push(ctx);
    const planId = await seedPlan(ctx, ctx.userId); // ponto focal = admin

    await request(app)
      .post(actionsUrl(ctx, planId))
      .set(authHeader(ctx))
      .send({ what: "X", howTasks: [{ id: "t1", text: "meu", done: false, assigneeUserId: ctx.userId }] })
      .expect(201);

    const plan = await request(app).get(planUrl(ctx, planId)).set(authHeader(ctx)).expect(200);
    expect(coIds(plan.body)).not.toContain(ctx.userId);
  });

  it("rejeita atribuir um passo a usuário de outra organização", async () => {
    const ctx = await createTestContext({ seed: "ht-org-a", role: "org_admin" });
    const alheio = await createTestContext({ seed: "ht-org-b", role: "org_admin" });
    contexts.push(ctx, alheio);
    const planId = await seedPlan(ctx, ctx.userId);

    const res = await request(app)
      .post(actionsUrl(ctx, planId))
      .set(authHeader(ctx))
      .send({
        what: "X",
        howTasks: [{ id: "t1", text: "Passo", done: false, assigneeUserId: alheio.userId }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("organização");
  });
});
