import { afterEach, describe, expect, it } from "vitest";
import { actionPlansTable, db } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import {
  isPlanCoResponsible,
  listCoResponsibleIds,
  listCoResponsiblesByPlan,
  setPlanCoResponsibles,
} from "../../../src/services/action-plans/responsibles";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

/** Plano com ponto focal (a coluna) e sem co-responsáveis (a junção). */
async function seedPlan(ctx: TestOrgContext): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "test" },
      title: "Plano de teste",
      responsibleUserId: ctx.userId,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("co-responsáveis do plano de ação", () => {
  it("substitui o conjunto: insere, remove e é idempotente", async () => {
    const ctx = await createTestContext({ seed: "ap-coresp-set" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });
    const planId = await seedPlan(ctx);

    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id, bruno.id]);
    expect(await listCoResponsibleIds(planId)).toEqual([ana.id, bruno.id].sort((a, b) => a - b));

    // rodar de novo com o MESMO conjunto não duplica nem apaga
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id, bruno.id]);
    expect(await listCoResponsibleIds(planId)).toHaveLength(2);

    // substituição total: quem não está na lista sai
    await setPlanCoResponsibles(ctx.organizationId, planId, [bruno.id]);
    expect(await listCoResponsibleIds(planId)).toEqual([bruno.id]);

    // conjunto vazio remove todos — o plano fica só com o ponto focal
    await setPlanCoResponsibles(ctx.organizationId, planId, []);
    expect(await listCoResponsibleIds(planId)).toEqual([]);
  });

  it("o ponto focal NÃO entra na lista de co-responsáveis", async () => {
    const ctx = await createTestContext({ seed: "ap-coresp-focal" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedPlan(ctx); // ponto focal = ctx.userId

    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id]);

    // a junção guarda só o co-responsável; o ponto focal vive na coluna do plano
    expect(await listCoResponsibleIds(planId)).toEqual([ana.id]);
    expect(await isPlanCoResponsible(planId, ctx.userId)).toBe(false);
  });

  it("isPlanCoResponsible reconhece qualquer um do conjunto, não só o primeiro", async () => {
    const ctx = await createTestContext({ seed: "ap-coresp-is" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });
    const estranho = await createTestUser(ctx, { suffix: "estranho", role: "operator" });
    const planId = await seedPlan(ctx);

    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id, bruno.id]);

    expect(await isPlanCoResponsible(planId, ana.id)).toBe(true);
    expect(await isPlanCoResponsible(planId, bruno.id)).toBe(true);
    expect(await isPlanCoResponsible(planId, estranho.id)).toBe(false);
  });

  it("listCoResponsiblesByPlan agrupa por plano e ordena por nome", async () => {
    const ctx = await createTestContext({ seed: "ap-coresp-group" });
    contexts.push(ctx);
    // createTestUser nomeia como `E2E <prefix> <suffix>` — o sufixo define a ordem alfabética.
    const zeca = await createTestUser(ctx, { suffix: "zeca", role: "operator" });
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planA = await seedPlan(ctx);
    const planB = await seedPlan(ctx);

    await setPlanCoResponsibles(ctx.organizationId, planA, [zeca.id, ana.id]);
    await setPlanCoResponsibles(ctx.organizationId, planB, [zeca.id]);

    const byPlan = await listCoResponsiblesByPlan([planA, planB]);
    expect(byPlan.get(planA)?.map((r) => r.userId)).toEqual([ana.id, zeca.id]);
    expect(byPlan.get(planB)?.map((r) => r.userId)).toEqual([zeca.id]);
    expect(byPlan.get(planA)?.[0].name).toContain("ana");
  });

  it("listCoResponsiblesByPlan com lista vazia não consulta o banco", async () => {
    expect(await listCoResponsiblesByPlan([])).toEqual(new Map());
  });
});
