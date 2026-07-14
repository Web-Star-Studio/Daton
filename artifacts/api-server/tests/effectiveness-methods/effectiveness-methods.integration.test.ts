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
import {
  DEFAULT_EFFECTIVENESS_METHOD_LABELS,
  ensureDefaultEffectivenessMethods,
} from "../../src/services/effectiveness-methods/defaults";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

describe("effectiveness methods API", () => {
  it("creates, lists, and is idempotent (case-insensitive)", async () => {
    const context = await createTestContext({ seed: "efic-create" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ label: "Checklist de campo" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      organizationId: context.organizationId,
      label: "Checklist de campo",
      active: true,
    });

    const duplicate = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ label: "checklist de campo" });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.id).toBe(created.body.id);

    const list = await request(app).get(base).set(authHeader(context));
    expect(list.status).toBe(200);
    expect(
      list.body.filter(
        (m: { label: string }) => m.label === "Checklist de campo",
      ),
    ).toHaveLength(1);
  });

  it("reactivates an inactive method instead of duplicating it", async () => {
    const context = await createTestContext({ seed: "efic-reactivate" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ label: "Reinspeção" });
    await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ active: false })
      .expect(200);

    // GET devolve ativos E inativos — o seletor filtra; a aba de gestão precisa ver.
    const beforeList = await request(app).get(base).set(authHeader(context));
    expect(
      beforeList.body.find((m: { id: number }) => m.id === created.body.id)
        ?.active,
    ).toBe(false);

    const reactivated = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ label: "reinspeção" });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.id).toBe(created.body.id);
    expect(reactivated.body.active).toBe(true);
  });

  it("blocks non-admin from writing (403) but allows reading", async () => {
    const context = await createTestContext({ seed: "efic-gate" });
    contexts.push(context);
    const operator = await createTestUser(context, {
      role: "operator",
      suffix: "operador",
    });
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    const write = await request(app)
      .post(base)
      .set(authHeader(operator))
      .send({ label: "X" });
    expect(write.status).toBe(403);

    const read = await request(app).get(base).set(authHeader(operator));
    expect(read.status).toBe(200);
  });

  it("renames and toggles active via PATCH, rejecting a case-insensitive collision", async () => {
    const context = await createTestContext({ seed: "efic-patch" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    const a = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ label: "Auditoria de processo" });
    const b = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ label: "Ensaio laboratorial" });

    const patch = await request(app)
      .patch(`${base}/${b.body.id}`)
      .set(authHeader(context))
      .send({ label: "Ensaio laboratorial (externo)", active: false });
    expect(patch.status).toBe(200);
    expect(patch.body.label).toBe("Ensaio laboratorial (externo)");
    expect(patch.body.active).toBe(false);

    const collision = await request(app)
      .patch(`${base}/${b.body.id}`)
      .set(authHeader(context))
      .send({ label: "auditoria de processo" });
    expect(collision.status).toBe(409);
    expect(a.status).toBe(201);
  });

  it("seeds the default catalog for an organization, idempotently", async () => {
    const context = await createTestContext({ seed: "efic-defaults" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    await ensureDefaultEffectivenessMethods(context.organizationId);

    const list = await request(app).get(base).set(authHeader(context));
    expect(list.status).toBe(200);
    expect(list.body.map((m: { label: string }) => m.label)).toEqual(
      DEFAULT_EFFECTIVENESS_METHOD_LABELS,
    );

    await ensureDefaultEffectivenessMethods(context.organizationId);
    const listAgain = await request(app).get(base).set(authHeader(context));
    expect(listAgain.body.map((m: { label: string }) => m.label)).toEqual(
      DEFAULT_EFFECTIVENESS_METHOD_LABELS,
    );
  });
});
