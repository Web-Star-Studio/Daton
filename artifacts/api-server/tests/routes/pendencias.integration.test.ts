import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, actionPlansTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function seedOverduePlan(orgId: number, userId: number, title: string) {
  await db.insert(actionPlansTable).values({
    organizationId: orgId,
    sourceModule: "manual",
    sourceRef: { manualContext: "t" },
    title,
    status: "open",
    responsibleUserId: userId,
    dueDate: new Date(Date.now() - 5 * 86_400_000), // 5 days ago → overdue
  });
}

describe("GET /organizations/:orgId/pendencias", () => {
  it("returns the caller's own pendências with user block and counts (scope=mine)", async () => {
    const ctx = await createTestContext({ seed: "pend-ep-mine" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, ctx.userId));
    await seedOverduePlan(ctx.organizationId, ctx.userId, `Meu plano ${ctx.prefix}`);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("mine");
    expect(res.body.user.id).toBe(ctx.userId);
    expect(res.body.user.filial).toMatchObject({ id: unit.id });
    expect(res.body.counts.overdue).toBeGreaterThanOrEqual(1);
    expect(res.body.items.some((i: { source: string }) => i.source === "action_plan")).toBe(true);
    expect(Array.isArray(res.body.completedToday)).toBe(true);
    expect(typeof res.body.counts.completedToday).toBe("number");
  });

  it("lets an org_admin see a filial's pendências (scope=unit)", async () => {
    const ctx = await createTestContext({ seed: "pend-ep-unit", role: "org_admin" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    const member = await createTestUser(ctx, { role: "operator", suffix: "op" });
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, member.id));
    await seedOverduePlan(ctx.organizationId, member.id, `Plano do membro ${ctx.prefix}`);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias?scope=unit&unitId=${unit.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("unit");
    const planItem = res.body.items.find((i: { source: string }) => i.source === "action_plan");
    expect(planItem).toBeTruthy();
    expect(planItem.responsibleName).toBeTruthy();
  });

  it("forbids operator/analyst from non-mine scopes (403)", async () => {
    const ctx = await createTestContext({ seed: "pend-ep-403", role: "operator" });
    contexts.push(ctx);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias?scope=org`)
      .set(authHeader(ctx));

    expect(res.status).toBe(403);
  });
});
