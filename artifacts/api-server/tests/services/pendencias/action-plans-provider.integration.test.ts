import { afterEach, describe, expect, it } from "vitest";
import { db, actionPlansTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { actionPlanPendenciaProvider } from "../../../src/services/pendencias/providers/action-plans";

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
});
