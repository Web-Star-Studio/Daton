import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
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

describe("org-users filial (F1)", () => {
  it("creates a user with primaryUnitId, lists it, and updates via PATCH /unit", async () => {
    const context = await createTestContext({ seed: "orguser-filial" });
    contexts.push(context);
    const unitA = await createUnit(context, `Filial A ${context.prefix}`);
    const unitB = await createUnit(context, `Filial B ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/users`)
      .set(authHeader(context))
      .send({
        name: `Novo ${context.prefix}`,
        email: `${context.prefix}-novo@e2e.daton.example`,
        password: "Secret123!",
        role: "operator",
        modules: [],
        primaryUnitId: unitA.id,
      });
    expect(created.status).toBe(201);
    expect(created.body.primaryUnitId).toBe(unitA.id);

    const listed = await request(app)
      .get(`/api/organizations/${context.organizationId}/users`)
      .set(authHeader(context));
    expect(listed.status).toBe(200);
    const row = listed.body.users.find(
      (u: { id: number }) => u.id === created.body.id,
    );
    expect(row.primaryUnitId).toBe(unitA.id);

    const patched = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/users/${created.body.id}/unit`,
      )
      .set(authHeader(context))
      .send({ primaryUnitId: unitB.id });
    expect(patched.status).toBe(200);
    expect(patched.body.primaryUnitId).toBe(unitB.id);

    const cleared = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/users/${created.body.id}/unit`,
      )
      .set(authHeader(context))
      .send({ primaryUnitId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.primaryUnitId).toBeNull();
  });

  it("rejects a primaryUnitId from another organization on PATCH /unit", async () => {
    const context = await createTestContext({ seed: "orguser-filial-xorg" });
    const other = await createTestContext({ seed: "orguser-filial-other" });
    contexts.push(context, other);
    const foreignUnit = await createUnit(other, `Filial Externa ${other.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/users`)
      .set(authHeader(context))
      .send({
        name: `Cross ${context.prefix}`,
        email: `${context.prefix}-cross@e2e.daton.example`,
        password: "Secret123!",
        role: "operator",
        modules: [],
      });
    expect(created.status).toBe(201);
    expect(created.body.primaryUnitId).toBeNull();

    const patched = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/users/${created.body.id}/unit`,
      )
      .set(authHeader(context))
      .send({ primaryUnitId: foreignUnit.id });
    expect(patched.status).toBe(400);
  });
});
