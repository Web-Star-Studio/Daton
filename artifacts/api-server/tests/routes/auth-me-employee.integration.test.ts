import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("GET /auth/me employeeId", () => {
  it("retorna employeeId nulo e depois vinculado", async () => {
    const context = await createTestContext({ seed: "me-employee" });
    contexts.push(context);

    const before = await request(app)
      .get("/api/auth/me")
      .set(authHeader(context));
    expect(before.status).toBe(200);
    expect(before.body.user.employeeId ?? null).toBeNull();

    const emp = await createEmployee(context, { name: `Vinc ${context.prefix}` });
    await db
      .update(usersTable)
      .set({ employeeId: emp.id })
      .where(eq(usersTable.id, context.userId));

    const after = await request(app)
      .get("/api/auth/me")
      .set(authHeader(context));
    expect(after.body.user.employeeId).toBe(emp.id);
  });
});
