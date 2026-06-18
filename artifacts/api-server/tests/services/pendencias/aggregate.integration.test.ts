import { afterEach, describe, expect, it } from "vitest";
import { db, actionPlansTable, regulatoryDocumentsTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { aggregatePendencias } from "../../../src/services/pendencias/aggregate";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const NOW = new Date(2026, 5, 15);

describe("aggregatePendencias", () => {
  it("merges providers, sorts by priority, enriches name, and counts", async () => {
    const ctx = await createTestContext({ seed: "pend-agg" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);

    // action plan overdue (p1)
    await db.insert(actionPlansTable).values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: "Plano atrasado",
      status: "open",
      responsibleUserId: ctx.userId,
      dueDate: new Date(2026, 5, 1),
    });
    // regulatory a_vencer (p2 / due_soon)
    await db.insert(regulatoryDocumentsTable).values({
      organizationId: ctx.organizationId,
      unitId: unit.id,
      identifierType: "alvara",
      issuingBody: "Prefeitura",
      responsibleUserId: ctx.userId,
      expirationDate: "2026-07-01",
      status: "a_vencer",
    });

    const { items, counts } = await aggregatePendencias({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items.length).toBeGreaterThanOrEqual(2);
    // p1 (overdue action plan) sorts before p2 (due_soon regulatory)
    expect(items[0].urgency).toBe("overdue");
    expect(items[0].responsibleName).toBeTruthy(); // enriched from usersTable
    expect(counts.overdue).toBe(1);
    expect(counts.bySource.action_plan).toBe(1);
    expect(counts.bySource.regulatory_document).toBe(1);
  });
});
