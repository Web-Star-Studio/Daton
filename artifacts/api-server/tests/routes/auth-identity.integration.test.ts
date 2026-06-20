import bcrypt from "bcryptjs";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("auth identity (F1)", () => {
  it("records lastLoginAt on successful login", async () => {
    const context = await createTestContext({ seed: "auth-lastlogin" });
    contexts.push(context);

    const password = "Secret123!";
    const passwordHash = await bcrypt.hash(password, 10);
    const email = `${context.prefix}-login@e2e.daton.example`;
    const [created] = await db
      .insert(usersTable)
      .values({
        name: `E2E ${context.prefix} Login`,
        email,
        passwordHash,
        organizationId: context.organizationId,
        role: "operator",
      })
      .returning({ id: usersTable.id });

    const before = await db
      .select({ lastLoginAt: usersTable.lastLoginAt })
      .from(usersTable)
      .where(eq(usersTable.id, created.id));
    expect(before[0].lastLoginAt).toBeNull();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password });
    expect(res.status).toBe(200);

    const after = await db
      .select({ lastLoginAt: usersTable.lastLoginAt })
      .from(usersTable)
      .where(eq(usersTable.id, created.id));
    expect(after[0].lastLoginAt).not.toBeNull();
  });

  it("returns lastLoginAt, unitId and resolved filial from /auth/me", async () => {
    const context = await createTestContext({ seed: "auth-me-identity" });
    contexts.push(context);
    const unit = await createUnit(context, `Filial POA ${context.prefix}`);

    await db
      .update(usersTable)
      .set({ unitId: unit.id, lastLoginAt: new Date() })
      .where(eq(usersTable.id, context.userId));

    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(context));

    expect(res.status).toBe(200);
    expect(res.body.user.unitId).toBe(unit.id);
    expect(typeof res.body.user.lastLoginAt).toBe("string");
    expect(res.body.filial).toMatchObject({ id: unit.id });
    expect(res.body.filial.name).toContain("Filial POA");
  });

  it("does not leak a filial from another organization via /auth/me", async () => {
    const context = await createTestContext({ seed: "auth-me-xorg" });
    const other = await createTestContext({ seed: "auth-me-xorg-other" });
    contexts.push(context, other);
    const foreignUnit = await createUnit(other, `Filial Externa ${other.prefix}`);

    // Simula dado cross-tenant: aponta a filial do usuário para uma unit de OUTRA org.
    // O lookup do /auth/me é escopado por organização, então a filial não pode vazar.
    await db
      .update(usersTable)
      .set({ unitId: foreignUnit.id, lastLoginAt: new Date() })
      .where(eq(usersTable.id, context.userId));

    const res = await request(app)
      .get("/api/auth/me")
      .set(authHeader(context));

    expect(res.status).toBe(200);
    expect(res.body.user.unitId).toBe(foreignUnit.id);
    expect(res.body.filial).toBeNull();
  });
});
