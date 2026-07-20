import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { actionPlansTable, db, usersTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";
import { setPlanCoResponsibles } from "../../src/services/action-plans/responsibles";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

/** Insere um plano direto no banco (sem passar pela derivação da rota POST) para
 *  testar a condição de visibilidade da listagem com filial/responsável fixos. */
async function seedPlan(
  ctx: Pick<TestOrgContext, "organizationId">,
  fields: {
    unitId: number | null;
    responsibleUserId: number | null;
    effectivenessEvaluatorUserId?: number | null;
  },
): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: {},
      title: "Plano de teste",
      status: "open",
      unitId: fields.unitId,
      responsibleUserId: fields.responsibleUserId,
      effectivenessEvaluatorUserId: fields.effectivenessEvaluatorUserId ?? null,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("visibilidade por papel — filial derivada na criação do plano", () => {
  it("POST manual grava unit_id = filial do ponto focal", async () => {
    const ctx = await createTestContext({ seed: "post-unit", role: "org_admin" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "POA");
    const focal = await createTestUser(ctx, { suffix: "focal", role: "operator" });
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, focal.id));

    const res = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({ sourceModule: "manual", sourceRef: { manualContext: "x" }, title: "T", responsibleUserId: focal.id });
    expect(res.status).toBe(201);

    const [row] = await db
      .select({ unitId: actionPlansTable.unitId })
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, res.body.id));
    expect(row.unitId).toBe(unit.id);
  });
});

describe("visibilidade por papel — filtro da listagem", () => {
  it("operador vê só os planos dele na listagem", async () => {
    const ctx = await createTestContext({ seed: "list-op", role: "org_admin" });
    contexts.push(ctx);
    const unitA = await createUnit(ctx, "A");
    const unitB = await createUnit(ctx, "B");
    const op = await createTestUser(ctx, { suffix: "op", role: "operator", modules: ["actionPlans"] });
    await db.update(usersTable).set({ unitId: unitA.id }).where(eq(usersTable.id, op.id));
    const meu = await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: op.id });
    await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId }); // mesma filial, não é dele
    await seedPlan(ctx, { unitId: unitB.id, responsibleUserId: ctx.userId });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader({ token: op.token }));
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id)).toEqual([meu]);
  });

  it("operador vê plano onde é só CO-responsável (EXISTS na junção)", async () => {
    const ctx = await createTestContext({ seed: "list-op-co", role: "org_admin" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "A");
    const op = await createTestUser(ctx, { suffix: "op", role: "operator", modules: ["actionPlans"] });
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, op.id));
    // ponto focal é outra pessoa (ctx.userId); op só entra como co-responsável
    const coPlano = await seedPlan(ctx, { unitId: unit.id, responsibleUserId: ctx.userId });
    await setPlanCoResponsibles(ctx.organizationId, coPlano, [op.id]);
    await seedPlan(ctx, { unitId: unit.id, responsibleUserId: ctx.userId }); // sem vínculo com op

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader({ token: op.token }));
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id)).toEqual([coPlano]);
  });

  it("gestor vê a filial dele + corporativo, não a filial alheia", async () => {
    const ctx = await createTestContext({ seed: "list-mgr", role: "org_admin" });
    contexts.push(ctx);
    const unitA = await createUnit(ctx, "A");
    const unitB = await createUnit(ctx, "B");
    const mgr = await createTestUser(ctx, { suffix: "mgr", role: "manager", modules: ["actionPlans"] });
    await db.update(usersTable).set({ unitId: unitA.id }).where(eq(usersTable.id, mgr.id));
    const naMinha = await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId });
    const corporativo = await seedPlan(ctx, { unitId: null, responsibleUserId: ctx.userId });
    await seedPlan(ctx, { unitId: unitB.id, responsibleUserId: ctx.userId }); // filial alheia

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader({ token: mgr.token }));
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id).sort()).toEqual([naMinha, corporativo].sort());
  });

  it("admin continua vendo todos os planos, de qualquer filial", async () => {
    const ctx = await createTestContext({ seed: "list-admin", role: "org_admin" });
    contexts.push(ctx);
    const unitA = await createUnit(ctx, "A");
    const unitB = await createUnit(ctx, "B");
    const op = await createTestUser(ctx, { suffix: "op", role: "operator" });
    const p1 = await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: op.id });
    const p2 = await seedPlan(ctx, { unitId: unitB.id, responsibleUserId: null });
    const p3 = await seedPlan(ctx, { unitId: null, responsibleUserId: null });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id).sort((a: number, b: number) => a - b)).toEqual(
      [p1, p2, p3].sort((a, b) => a - b),
    );
  });

  it("analista vê todos os planos na listagem, de qualquer filial", async () => {
    const ctx = await createTestContext({ seed: "list-analyst", role: "org_admin" });
    contexts.push(ctx);
    const unitA = await createUnit(ctx, "A");
    const unitB = await createUnit(ctx, "B");
    // Diferente do admin, analista NÃO é bypass automático de módulo — precisa
    // do registro explícito para passar do gate da listagem (userHasModuleAccess).
    const analyst = await createTestUser(ctx, { suffix: "an", role: "analyst", modules: ["actionPlans"] });
    const p1 = await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId });
    const p2 = await seedPlan(ctx, { unitId: unitB.id, responsibleUserId: null });
    const p3 = await seedPlan(ctx, { unitId: null, responsibleUserId: null });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader({ token: analyst.token }));
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id).sort((a: number, b: number) => a - b)).toEqual(
      [p1, p2, p3].sort((a, b) => a - b),
    );
  });

  it("gestor com unit_id NULO não vê planos de filial nenhuma (só corporativo + o pessoal dele)", async () => {
    const ctx = await createTestContext({ seed: "list-mgr-null", role: "org_admin" });
    contexts.push(ctx);
    const unitA = await createUnit(ctx, "A");
    // Gestor "solto": users.unit_id nunca foi setado (fica NULL).
    const mgr = await createTestUser(ctx, { suffix: "mgr", role: "manager", modules: ["actionPlans"] });
    const corporativo = await seedPlan(ctx, { unitId: null, responsibleUserId: ctx.userId });
    const pessoal = await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: mgr.id });
    await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId }); // filial alheia, sem vínculo pessoal

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader({ token: mgr.token }));
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id).sort()).toEqual([corporativo, pessoal].sort());
  });

  it("avaliador de eficácia vê o plano na listagem mesmo sem ser responsável nem da filial", async () => {
    const ctx = await createTestContext({ seed: "list-op-eval", role: "org_admin" });
    contexts.push(ctx);
    const unitA = await createUnit(ctx, "A");
    const unitB = await createUnit(ctx, "B");
    const op = await createTestUser(ctx, { suffix: "op", role: "operator", modules: ["actionPlans"] });
    await db.update(usersTable).set({ unitId: unitB.id }).where(eq(usersTable.id, op.id));
    const avaliado = await seedPlan(ctx, {
      unitId: unitA.id,
      responsibleUserId: ctx.userId,
      effectivenessEvaluatorUserId: op.id,
    });
    await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId }); // sem vínculo com op

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader({ token: op.token }));
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id)).toEqual([avaliado]);
  });
});

describe("visibilidade por papel — acesso direto por id (URL)", () => {
  it("operador recebe 403 ao abrir por id um plano de outra filial em que não está vinculado", async () => {
    const ctx = await createTestContext({ seed: "acc-op", role: "org_admin" });
    contexts.push(ctx);
    const unitB = await createUnit(ctx, "B");
    const op = await createTestUser(ctx, { suffix: "op", role: "operator", modules: ["actionPlans"] });
    const alheio = await seedPlan(ctx, { unitId: unitB.id, responsibleUserId: ctx.userId });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${alheio}`)
      .set(authHeader({ token: op.token }));
    expect(res.status).toBe(403);
  });

  it("gestor abre um plano da filial dele", async () => {
    const ctx = await createTestContext({ seed: "acc-mgr", role: "org_admin" });
    contexts.push(ctx);
    const unitA = await createUnit(ctx, "A");
    const mgr = await createTestUser(ctx, { suffix: "mgr", role: "manager", modules: ["actionPlans"] });
    await db.update(usersTable).set({ unitId: unitA.id }).where(eq(usersTable.id, mgr.id));
    const naFilial = await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${naFilial}`)
      .set(authHeader({ token: mgr.token }));
    expect(res.status).toBe(200);
  });
});

describe("visibilidade por papel — summary/dashboards", () => {
  it("summary do operador conta só os planos dele", async () => {
    const ctx = await createTestContext({ seed: "sum-op", role: "org_admin" });
    contexts.push(ctx);
    const op = await createTestUser(ctx, { suffix: "op", role: "operator", modules: ["actionPlans"] });
    await seedPlan(ctx, { unitId: null, responsibleUserId: op.id }); // dele
    await seedPlan(ctx, { unitId: null, responsibleUserId: ctx.userId }); // de outro
    await seedPlan(ctx, { unitId: null, responsibleUserId: ctx.userId }); // de outro

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/summary`)
      .set(authHeader({ token: op.token }));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it("summary do gestor conta a filial dele + corporativo, não a filial alheia", async () => {
    const ctx = await createTestContext({ seed: "sum-mgr", role: "org_admin" });
    contexts.push(ctx);
    const unitA = await createUnit(ctx, "A");
    const unitB = await createUnit(ctx, "B");
    const mgr = await createTestUser(ctx, { suffix: "mgr", role: "manager", modules: ["actionPlans"] });
    await db.update(usersTable).set({ unitId: unitA.id }).where(eq(usersTable.id, mgr.id));
    await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId }); // na filial dele
    await seedPlan(ctx, { unitId: null, responsibleUserId: ctx.userId }); // corporativo
    await seedPlan(ctx, { unitId: unitB.id, responsibleUserId: ctx.userId }); // filial alheia

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/summary`)
      .set(authHeader({ token: mgr.token }));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("summary do admin continua contando a organização inteira", async () => {
    const ctx = await createTestContext({ seed: "sum-admin", role: "org_admin" });
    contexts.push(ctx);
    const unitA = await createUnit(ctx, "A");
    const op = await createTestUser(ctx, { suffix: "op", role: "operator" });
    await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: op.id });
    await seedPlan(ctx, { unitId: null, responsibleUserId: ctx.userId });
    await seedPlan(ctx, { unitId: null, responsibleUserId: null });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/summary`)
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });
});
