import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../tests/support/backend";
import { DEFAULT_NORM_LABELS, ensureDefaultNorms } from "../../src/services/norms/defaults";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => cleanupTestContext(context)));
});

describe("regulatory norms API", () => {
  it("creates, lists, and is idempotent (case-insensitive)", async () => {
    const context = await createTestContext({ seed: "norms-create" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/norms`;

    const created = await request(app).post(base).set(authHeader(context)).send({ label: "ISO 9001" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      organizationId: context.organizationId,
      label: "ISO 9001",
      active: true,
    });

    // Idempotent by lower(label): same norm, different casing -> 200 + same id, no duplicate row.
    const duplicate = await request(app).post(base).set(authHeader(context)).send({ label: "iso 9001" });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.id).toBe(created.body.id);

    const list = await request(app).get(base).set(authHeader(context));
    expect(list.status).toBe(200);
    expect(list.body.filter((n: { label: string }) => n.label === "ISO 9001")).toHaveLength(1);
  });

  it("reactivates an inactive norm instead of duplicating it", async () => {
    const context = await createTestContext({ seed: "norms-reactivate" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/norms`;

    const created = await request(app).post(base).set(authHeader(context)).send({ label: "ISO 45001" });
    await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ active: false })
      .expect(200);

    // GET returns ALL rows (active and inactive) — the frontend filters active ones.
    const beforeList = await request(app).get(base).set(authHeader(context));
    expect(beforeList.body.find((n: { id: number }) => n.id === created.body.id)?.active).toBe(false);

    const reactivated = await request(app).post(base).set(authHeader(context)).send({ label: "iso 45001" });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.id).toBe(created.body.id);
    expect(reactivated.body.active).toBe(true);
  });

  it("blocks non-admin from writing (403) but allows reading", async () => {
    const context = await createTestContext({ seed: "norms-gate" });
    contexts.push(context);
    const operator = await createTestUser(context, { role: "operator", suffix: "operador" });
    const base = `/api/organizations/${context.organizationId}/norms`;

    const write = await request(app).post(base).set(authHeader(operator)).send({ label: "X" });
    expect(write.status).toBe(403);

    const read = await request(app).get(base).set(authHeader(operator));
    expect(read.status).toBe(200);
  });

  it("renames and toggles active via PATCH, rejecting a case-insensitive collision", async () => {
    const context = await createTestContext({ seed: "norms-patch" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/norms`;

    const a = await request(app).post(base).set(authHeader(context)).send({ label: "ISO 14001" });
    const b = await request(app).post(base).set(authHeader(context)).send({ label: "ISO 45001" });

    const patch = await request(app)
      .patch(`${base}/${b.body.id}`)
      .set(authHeader(context))
      .send({ label: "ISO 45001:2018", active: false });
    expect(patch.status).toBe(200);
    expect(patch.body.label).toBe("ISO 45001:2018");
    expect(patch.body.active).toBe(false);

    const collision = await request(app)
      .patch(`${base}/${b.body.id}`)
      .set(authHeader(context))
      .send({ label: "iso 14001" });
    expect(collision.status).toBe(409);
    expect(a.status).toBe(201);
  });

  it("seeds the default norm catalog for a new organization, idempotently", async () => {
    const context = await createTestContext({ seed: "norms-defaults" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/norms`;

    await ensureDefaultNorms(context.organizationId);

    const list = await request(app).get(base).set(authHeader(context));
    expect(list.status).toBe(200);
    expect(list.body.map((n: { label: string }) => n.label)).toEqual(DEFAULT_NORM_LABELS);
    expect(DEFAULT_NORM_LABELS).toEqual([
      "ISO 9001 · cl. 9.1",
      "ISO 14001 · cl. 9.1",
      "ISO 39001 · cl. 9.1",
      "PR 2030",
    ]);

    // Idempotent: calling again (e.g. re-running the register wiring) does not duplicate rows.
    await ensureDefaultNorms(context.organizationId);
    const listAgain = await request(app).get(base).set(authHeader(context));
    expect(listAgain.status).toBe(200);
    expect(listAgain.body.map((n: { label: string }) => n.label)).toEqual(DEFAULT_NORM_LABELS);
  });
});
