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
});
