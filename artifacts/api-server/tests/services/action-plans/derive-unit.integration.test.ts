import { afterEach, describe, expect, it } from "vitest";
import { db, kpiIndicatorsTable, swotFactorsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  cleanupTestContext, createTestContext, createTestUser, createUnit, type TestOrgContext,
} from "../../../../../tests/support/backend";
import { deriveActionPlanUnit } from "../../../src/services/action-plans/derive-unit";

const contexts: TestOrgContext[] = [];
afterEach(async () => { await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c))); });

describe("deriveActionPlanUnit", () => {
  it("manual: herda a filial do ponto focal", async () => {
    const ctx = await createTestContext({ seed: "derive-manual" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "POA");
    const focal = await createTestUser(ctx, { suffix: "focal", role: "operator" });
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, focal.id));

    expect(await deriveActionPlanUnit(ctx.organizationId, "manual", { manualContext: "x" }, focal.id)).toBe(unit.id);
  });

  it("manual sem ponto focal: corporativo (null)", async () => {
    const ctx = await createTestContext({ seed: "derive-manual-nofocal" });
    contexts.push(ctx);
    expect(await deriveActionPlanUnit(ctx.organizationId, "manual", { manualContext: "x" }, null)).toBeNull();
  });

  it("origem swot: herda a filial do fator; fator corporativo → null", async () => {
    const ctx = await createTestContext({ seed: "derive-swot" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "SBC");
    const [comFilial] = await db.insert(swotFactorsTable).values({
      organizationId: ctx.organizationId, type: "weakness", environment: "internal", description: "d", unitId: unit.id,
    }).returning({ id: swotFactorsTable.id });
    const [corp] = await db.insert(swotFactorsTable).values({
      organizationId: ctx.organizationId, type: "threat", environment: "external", description: "d", unitId: null,
    }).returning({ id: swotFactorsTable.id });

    expect(await deriveActionPlanUnit(ctx.organizationId, "swot", { swotFactorId: comFilial.id }, null)).toBe(unit.id);
    expect(await deriveActionPlanUnit(ctx.organizationId, "swot", { swotFactorId: corp.id }, null)).toBeNull();
  });

  it("origem sem entidade de filial (nonconformity): corporativo (null)", async () => {
    const ctx = await createTestContext({ seed: "derive-nc" });
    contexts.push(ctx);
    expect(await deriveActionPlanUnit(ctx.organizationId, "nonconformity", { nonconformityId: 999999 }, null)).toBeNull();
  });
});
