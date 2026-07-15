import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { actionPlansTable, db } from "@workspace/db";
import type { ActionPlanSourceModule } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const MS_PER_DAY = 86_400_000;
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * MS_PER_DAY);
}

async function seedPlan(
  orgId: number,
  fields: Partial<typeof actionPlansTable.$inferInsert> & { title: string },
): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: orgId,
      sourceModule: "improvement" as ActionPlanSourceModule,
      sourceRef: {},
      ...fields,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

async function listTitles(ctx: TestOrgContext, query: Record<string, string>): Promise<string[]> {
  const res = await request(app)
    .get(`/api/organizations/${ctx.organizationId}/action-plans`)
    .query(query)
    .set(authHeader(ctx));
  expect(res.status).toBe(200);
  return res.body.map((p: { title: string }) => p.title).sort();
}

describe("filtros da listagem de planos de ação", () => {
  it("filtra por actionType", async () => {
    const ctx = await createTestContext({ seed: "filtro-tipo" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Corr", actionType: "corrective" });
    await seedPlan(ctx.organizationId, { title: "Prev", actionType: "preventive" });

    expect(await listTitles(ctx, { actionType: "preventive" })).toEqual(["Prev"]);
  });

  it("effectiveness=pending devolve concluídas sem veredito e exclui as com veredito", async () => {
    const ctx = await createTestContext({ seed: "filtro-efic-pending" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Aguardando", status: "completed", effectivenessResult: null });
    await seedPlan(ctx.organizationId, { title: "JaAvaliada", status: "completed", effectivenessResult: "effective" });
    await seedPlan(ctx.organizationId, { title: "Aberta", status: "open", effectivenessResult: null });

    expect(await listTitles(ctx, { effectiveness: "pending" })).toEqual(["Aguardando"]);
  });

  it("effectiveness=effective devolve só as eficazes", async () => {
    const ctx = await createTestContext({ seed: "filtro-efic-eff" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Eficaz", status: "completed", effectivenessResult: "effective" });
    await seedPlan(ctx.organizationId, { title: "NaoEficaz", status: "completed", effectivenessResult: "ineffective" });

    expect(await listTitles(ctx, { effectiveness: "effective" })).toEqual(["Eficaz"]);
  });

  it("dueWindow=overdue devolve abertas vencidas e exclui concluídas/canceladas com prazo passado", async () => {
    const ctx = await createTestContext({ seed: "filtro-overdue" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Vencida", status: "in_progress", dueDate: daysFromNow(-3) });
    await seedPlan(ctx.organizationId, { title: "ConcluidaVencida", status: "completed", dueDate: daysFromNow(-3) });
    await seedPlan(ctx.organizationId, { title: "CanceladaVencida", status: "cancelled", dueDate: daysFromNow(-3) });
    await seedPlan(ctx.organizationId, { title: "Futura", status: "open", dueDate: daysFromNow(3) });

    expect(await listTitles(ctx, { dueWindow: "overdue" })).toEqual(["Vencida"]);
  });

  it("dueWindow=due_soon devolve abertas vencendo em ≤7 dias e exclui as já vencidas", async () => {
    const ctx = await createTestContext({ seed: "filtro-due-soon" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Vencendo", status: "open", dueDate: daysFromNow(3) });
    await seedPlan(ctx.organizationId, { title: "Vencida", status: "open", dueDate: daysFromNow(-1) });
    await seedPlan(ctx.organizationId, { title: "Longe", status: "open", dueDate: daysFromNow(30) });

    expect(await listTitles(ctx, { dueWindow: "due_soon" })).toEqual(["Vencendo"]);
  });

  it("combina dois filtros com AND", async () => {
    const ctx = await createTestContext({ seed: "filtro-and" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Alvo", actionType: "corrective", priority: "high" });
    await seedPlan(ctx.organizationId, { title: "SoTipo", actionType: "corrective", priority: "low" });
    await seedPlan(ctx.organizationId, { title: "SoPrio", actionType: "preventive", priority: "high" });

    expect(await listTitles(ctx, { actionType: "corrective", priority: "high" })).toEqual(["Alvo"]);
  });
});
