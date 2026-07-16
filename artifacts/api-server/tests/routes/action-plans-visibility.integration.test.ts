import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { actionPlansTable, db, usersTable } from "@workspace/db";
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

describe("visibilidade por papel — filial derivada na criação do plano", () => {
  it("POST manual grava unit_id = filial do ponto focal", async () => {
    const ctx = await createTestContext({ seed: "post-unit", role: "org_admin" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "POA");
    const focal = await createTestUser(ctx, { suffix: "focal", role: "operator" });
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, focal.id));

    const res = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({ sourceModule: "manual", sourceRef: { manualContext: "x" }, title: "T", responsibleUserId: focal.id });
    expect(res.status).toBe(201);

    const [row] = await db
      .select({ unitId: actionPlansTable.unitId })
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, res.body.id));
    expect(row.unitId).toBe(unit.id);
  });
});
