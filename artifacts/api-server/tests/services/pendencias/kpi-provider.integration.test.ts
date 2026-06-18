import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  kpiIndicatorsTable,
  kpiYearConfigsTable,
} from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { kpiPendenciaProvider } from "../../../src/services/pendencias/providers/kpi";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("kpiPendenciaProvider", () => {
  it("emits an overdue pendência for an indicator with no values in a due month", async () => {
    const ctx = await createTestContext({ seed: "pend-kpi" });
    contexts.push(ctx);

    const [indicator] = await db
      .insert(kpiIndicatorsTable)
      .values({
        organizationId: ctx.organizationId,
        name: `Indicador ${ctx.prefix}`,
        measurement: "Taxa",
        direction: "up",
        periodicity: "monthly",
        responsibleUserId: ctx.userId,
      })
      .returning({ id: kpiIndicatorsTable.id });

    await db.insert(kpiYearConfigsTable).values({
      organizationId: ctx.organizationId,
      indicatorId: indicator.id,
      year: 2026,
    });

    // now = mid-2026 → months 1..5 due, none filled → overdue at month 1.
    const items = await kpiPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: new Date(2026, 5, 15),
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "kpi",
      urgency: "overdue",
      responsibleUserId: ctx.userId,
      dueDate: "2026-01-31",
    });
    expect(items[0].id).toBe(`kpi:${indicator.id}:2026:1`);
    expect(items[0].link.route).toBe("/app/kpi/lancamentos");
  });

  it("emits nothing when the indicator belongs to another responsible", async () => {
    const ctx = await createTestContext({ seed: "pend-kpi-other" });
    contexts.push(ctx);

    const [indicator] = await db
      .insert(kpiIndicatorsTable)
      .values({
        organizationId: ctx.organizationId,
        name: `Indicador ${ctx.prefix}`,
        measurement: "Taxa",
        direction: "up",
        periodicity: "monthly",
        responsibleUserId: ctx.userId,
      })
      .returning({ id: kpiIndicatorsTable.id });
    await db.insert(kpiYearConfigsTable).values({
      organizationId: ctx.organizationId,
      indicatorId: indicator.id,
      year: 2026,
    });

    const items = await kpiPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId + 99999], // not the responsible
      now: new Date(2026, 5, 15),
      dueSoonDays: 7,
    });
    expect(items).toHaveLength(0);
  });
});
