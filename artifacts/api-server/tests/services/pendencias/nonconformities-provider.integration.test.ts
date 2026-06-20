import { afterEach, describe, expect, it } from "vitest";
import { db, nonconformitiesTable, correctiveActionsTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { nonconformityPendenciaProvider } from "../../../src/services/pendencias/providers/nonconformities";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const NOW = new Date(2026, 5, 15);

describe("nonconformityPendenciaProvider", () => {
  it("emits a no_due NC and a date-classified corrective action; skips closed/done", async () => {
    const ctx = await createTestContext({ seed: "pend-nc" });
    contexts.push(ctx);

    const [openNc] = await db
      .insert(nonconformitiesTable)
      .values({
        organizationId: ctx.organizationId,
        originType: "process",
        title: `NC aberta ${ctx.prefix}`,
        description: "desc",
        status: "open",
        responsibleUserId: ctx.userId,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      })
      .returning({ id: nonconformitiesTable.id });

    // closed NC → ignored
    await db.insert(nonconformitiesTable).values({
      organizationId: ctx.organizationId,
      originType: "process",
      title: `NC fechada ${ctx.prefix}`,
      description: "desc",
      status: "closed",
      responsibleUserId: ctx.userId,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const [overdueCa] = await db
      .insert(correctiveActionsTable)
      .values({
        organizationId: ctx.organizationId,
        nonconformityId: openNc.id,
        title: `Ação ${ctx.prefix}`,
        description: "desc",
        status: "pending",
        responsibleUserId: ctx.userId,
        dueDate: "2026-06-10",
        createdById: ctx.userId,
        updatedById: ctx.userId,
      })
      .returning({ id: correctiveActionsTable.id });

    // done CA → ignored
    await db.insert(correctiveActionsTable).values({
      organizationId: ctx.organizationId,
      nonconformityId: openNc.id,
      title: `Ação feita ${ctx.prefix}`,
      description: "desc",
      status: "done",
      responsibleUserId: ctx.userId,
      dueDate: "2026-06-10",
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    // canceled NC → ignored
    await db.insert(nonconformitiesTable).values({
      organizationId: ctx.organizationId,
      originType: "process",
      title: `NC cancelada ${ctx.prefix}`,
      description: "desc",
      status: "canceled",
      responsibleUserId: ctx.userId,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    // canceled CA → ignored
    await db.insert(correctiveActionsTable).values({
      organizationId: ctx.organizationId,
      nonconformityId: openNc.id,
      title: `Ação cancelada ${ctx.prefix}`,
      description: "desc",
      status: "canceled",
      responsibleUserId: ctx.userId,
      dueDate: "2026-06-10",
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const items = await nonconformityPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(items).toHaveLength(2);
    expect(byId.get(`nonconformity:${openNc.id}`)?.urgency).toBe("no_due");
    expect(byId.get(`nonconformity:${openNc.id}`)?.source).toBe("nonconformity");
    expect(byId.get(`corrective_action:${overdueCa.id}`)?.urgency).toBe("overdue");
    expect(byId.get(`corrective_action:${overdueCa.id}`)?.source).toBe("nonconformity");
    expect(byId.get(`corrective_action:${overdueCa.id}`)?.dueDate).toBe("2026-06-10");
  });

  it("listCompletedToday returns NCs closed + corrective actions done today", async () => {
    const ctx = await createTestContext({ seed: "pend-nc-done" });
    contexts.push(ctx);
    const now = new Date(2026, 5, 15, 10, 0, 0);

    const [nc] = await db
      .insert(nonconformitiesTable)
      .values({
        organizationId: ctx.organizationId,
        originType: "process",
        title: `NC fechada hoje ${ctx.prefix}`,
        description: "d",
        status: "closed",
        responsibleUserId: ctx.userId,
        createdById: ctx.userId,
        updatedById: ctx.userId,
        closedAt: new Date(2026, 5, 15, 9, 0, 0),
      })
      .returning({ id: nonconformitiesTable.id });

    const [ca] = await db
      .insert(correctiveActionsTable)
      .values({
        organizationId: ctx.organizationId,
        nonconformityId: nc.id,
        title: `Ação feita hoje ${ctx.prefix}`,
        description: "d",
        status: "done",
        responsibleUserId: ctx.userId,
        createdById: ctx.userId,
        updatedById: ctx.userId,
        updatedAt: new Date(2026, 5, 15, 9, 30, 0),
      })
      .returning({ id: correctiveActionsTable.id });

    const items = await nonconformityPendenciaProvider.listCompletedToday!({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now,
      dueSoonDays: 7,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(`nonconformity:${nc.id}`);
    expect(ids).toContain(`corrective_action:${ca.id}`);
  });
});
