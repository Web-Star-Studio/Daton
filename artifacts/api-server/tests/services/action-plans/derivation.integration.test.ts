import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, kpiIndicatorsTable, regulatoryNormsTable } from "@workspace/db";

import { deriveCreateDefaults } from "../../../src/services/action-plans/derivation";
import { ensureDefaultNorms } from "../../../src/services/norms/defaults";
import {
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("deriveCreateDefaults — sourceModule 'kpi'", () => {
  it("resolves ind.norms (catalog ids) to normRefs using the org's regulatory_norms label", async () => {
    const ctx = await createTestContext({ seed: "derive-kpi-norms" });
    contexts.push(ctx);

    await ensureDefaultNorms(ctx.organizationId);
    const catalog = await db
      .select({
        id: regulatoryNormsTable.id,
        label: regulatoryNormsTable.label,
      })
      .from(regulatoryNormsTable)
      .where(eq(regulatoryNormsTable.organizationId, ctx.organizationId));
    const iso9001Norm = catalog.find((n) => n.label === "ISO 9001 · cl. 9.1");
    expect(iso9001Norm).toBeDefined();

    const [indicator] = await db
      .insert(kpiIndicatorsTable)
      .values({
        organizationId: ctx.organizationId,
        name: `Indicador ${ctx.prefix}`,
        measurement: "Taxa",
        direction: "up",
        periodicity: "monthly",
        responsibleUserId: ctx.userId,
        norms: [iso9001Norm!.id],
      })
      .returning({ id: kpiIndicatorsTable.id });

    const result = await deriveCreateDefaults(ctx.organizationId, "kpi", {
      kpiIndicatorId: indicator.id,
    });

    // Falsifiable: the old code indexed a string-keyed KPI_NORM_LABELS map with
    // a numeric catalog id (JS coerces the key), which always returned undefined
    // here — normRefs would be missing/empty even though the indicator DOES
    // reference a valid catalog norm.
    expect(result.normRefs).toEqual([{ code: "ISO 9001 · cl. 9.1" }]);
    expect(result.relatedIndicatorIds).toEqual([indicator.id]);
  });
});
