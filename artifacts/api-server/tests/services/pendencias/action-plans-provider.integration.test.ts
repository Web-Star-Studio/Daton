import { afterEach, describe, expect, it } from "vitest";
import { db, actionPlansTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { actionPlanPendenciaProvider } from "../../../src/services/pendencias/providers/action-plans";
import { setPlanCoResponsibles } from "../../../src/services/action-plans/responsibles";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const NOW = new Date(2026, 5, 15);

async function seedPlan(
  ctx: TestOrgContext,
  overrides: { title: string; status: "open" | "in_progress" | "completed" | "cancelled"; dueDate: Date | null },
) {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "test" },
      title: overrides.title,
      status: overrides.status,
      responsibleUserId: ctx.userId,
      dueDate: overrides.dueDate,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("actionPlanPendenciaProvider", () => {
  it("classifies overdue, due_soon and upcoming open plans; skips completed/cancelled", async () => {
    const ctx = await createTestContext({ seed: "pend-ap" });
    contexts.push(ctx);
    const overdueId = await seedPlan(ctx, { title: "Atrasado", status: "open", dueDate: new Date(2026, 5, 10) });
    const soonId = await seedPlan(ctx, { title: "Em breve", status: "in_progress", dueDate: new Date(2026, 5, 18) });
    const futureId = await seedPlan(ctx, { title: "Futuro", status: "open", dueDate: new Date(2026, 7, 1) });
    await seedPlan(ctx, { title: "Concluído", status: "completed", dueDate: new Date(2026, 5, 10) });
    await seedPlan(ctx, { title: "Cancelado", status: "cancelled", dueDate: new Date(2026, 5, 10) });

    const items = await actionPlanPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(items).toHaveLength(3);
    expect(byId.get(`action_plan:${overdueId}`)?.urgency).toBe("overdue");
    expect(byId.get(`action_plan:${soonId}`)?.urgency).toBe("due_soon");
    expect(byId.get(`action_plan:${futureId}`)?.urgency).toBe("upcoming");
    expect(byId.get(`action_plan:${overdueId}`)?.link.route).toBe(`/planos-acao/${overdueId}`);
    expect(byId.get(`action_plan:${overdueId}`)?.source).toBe("action_plan");
  });

  it("listCompletedToday returns plans closed today", async () => {
    const ctx = await createTestContext({ seed: "pend-ap-done" });
    contexts.push(ctx);
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const [done] = await db
      .insert(actionPlansTable)
      .values({
        organizationId: ctx.organizationId,
        sourceModule: "manual",
        sourceRef: { manualContext: "t" },
        title: "Encerrado hoje",
        status: "completed",
        responsibleUserId: ctx.userId,
        closedAt: new Date(2026, 5, 15, 9, 0, 0),
      })
      .returning({ id: actionPlansTable.id });
    // closed yesterday → excluded
    await db.insert(actionPlansTable).values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: "Encerrado ontem",
      status: "completed",
      responsibleUserId: ctx.userId,
      closedAt: new Date(2026, 5, 14, 9, 0, 0),
    });

    const items = await actionPlanPendenciaProvider.listCompletedToday!({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now,
      dueSoonDays: 7,
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`action_plan:${done.id}`);
    expect(items[0].statusLabel).toBe("Encerrado hoje");
    expect(items[0].urgency).toBe("no_due");
  });

  it("plano com ponto focal + 2 co-responsáveis vira UMA pendência (não três)", async () => {
    const ctx = await createTestContext({ seed: "pend-ap-co" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });
    const planId = await seedPlan(ctx, { title: "Ação do time", status: "open", dueDate: new Date(2026, 5, 10) });
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id, bruno.id]);

    // escopo unit/org: o solicitante enxerga os três
    const items = await actionPlanPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId, ana.id, bruno.id],
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`action_plan:${planId}`);
    expect(items[0].responsibleUserIds).toEqual([ctx.userId, ana.id, bruno.id].sort((a, b) => a - b));
  });

  it("no escopo 'mine', o co-responsável vê a ação mesmo sem ser o ponto focal", async () => {
    const ctx = await createTestContext({ seed: "pend-ap-co-mine" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedPlan(ctx, { title: "Compartilhada", status: "open", dueDate: new Date(2026, 5, 10) });
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id]);

    const items = await actionPlanPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ana.id], // escopo "mine" da co-responsável
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(1);
    expect(items[0].responsibleUserId).toBe(ana.id); // o id que EXPLICA a linha estar aqui
    expect(items[0].responsibleUserIds).toEqual([ctx.userId, ana.id].sort((a, b) => a - b));
  });
});
