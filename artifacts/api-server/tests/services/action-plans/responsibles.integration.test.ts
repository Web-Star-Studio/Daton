import { afterEach, describe, expect, it } from "vitest";
import { actionPlansTable, db } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import {
  isPlanResponsible,
  legacyResponsibleId,
  listResponsibleIds,
  listResponsiblesByPlan,
  setPlanResponsibles,
} from "../../../src/services/action-plans/responsibles";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function seedPlan(ctx: TestOrgContext): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "test" },
      title: "Plano de teste",
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("action plan responsibles service", () => {
  it("substitui o conjunto: insere, remove e é idempotente", async () => {
    const ctx = await createTestContext({ seed: "ap-resp-set" });
    contexts.push(ctx);
    const other = await createTestUser(ctx, { suffix: "outro", role: "operator" });
    const planId = await seedPlan(ctx);

    await setPlanResponsibles(ctx.organizationId, planId, [ctx.userId, other.id]);
    expect(await listResponsibleIds(planId)).toEqual([ctx.userId, other.id].sort((a, b) => a - b));

    // rodar de novo com o MESMO conjunto não duplica nem apaga
    await setPlanResponsibles(ctx.organizationId, planId, [ctx.userId, other.id]);
    expect(await listResponsibleIds(planId)).toHaveLength(2);

    // substituição total: quem não está na lista sai
    await setPlanResponsibles(ctx.organizationId, planId, [other.id]);
    expect(await listResponsibleIds(planId)).toEqual([other.id]);

    // conjunto vazio remove todos (plano sem responsável continua válido)
    await setPlanResponsibles(ctx.organizationId, planId, []);
    expect(await listResponsibleIds(planId)).toEqual([]);
  });

  it("isPlanResponsible reconhece qualquer um do conjunto, não só o primeiro", async () => {
    const ctx = await createTestContext({ seed: "ap-resp-is" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const estranho = await createTestUser(ctx, { suffix: "estranho", role: "operator" });
    const planId = await seedPlan(ctx);

    await setPlanResponsibles(ctx.organizationId, planId, [ctx.userId, co.id]);

    expect(await isPlanResponsible(planId, ctx.userId)).toBe(true);
    expect(await isPlanResponsible(planId, co.id)).toBe(true);
    expect(await isPlanResponsible(planId, estranho.id)).toBe(false);
  });

  it("listResponsiblesByPlan agrupa por plano e ordena por nome", async () => {
    const ctx = await createTestContext({ seed: "ap-resp-group" });
    contexts.push(ctx);
    // createTestUser nomeia como `E2E <prefix> <suffix>` — o sufixo define a ordem alfabética.
    const zeca = await createTestUser(ctx, { suffix: "zeca", role: "operator" });
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planA = await seedPlan(ctx);
    const planB = await seedPlan(ctx);

    await setPlanResponsibles(ctx.organizationId, planA, [zeca.id, ana.id]);
    await setPlanResponsibles(ctx.organizationId, planB, [zeca.id]);

    const byPlan = await listResponsiblesByPlan([planA, planB]);
    expect(byPlan.get(planA)?.map((r) => r.userId)).toEqual([ana.id, zeca.id]);
    expect(byPlan.get(planB)?.map((r) => r.userId)).toEqual([zeca.id]);
    expect(byPlan.get(planA)?.[0].name).toContain("ana");
  });

  it("listResponsiblesByPlan com lista vazia não consulta o banco", async () => {
    expect(await listResponsiblesByPlan([])).toEqual(new Map());
  });

  it("legacyResponsibleId devolve o menor id, ou null quando vazio", () => {
    expect(legacyResponsibleId([9, 3, 7])).toBe(3);
    expect(legacyResponsibleId([])).toBeNull();
  });
});
