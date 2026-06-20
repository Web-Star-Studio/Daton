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

// F1 (após convergência com #98): a coluna de filial é `users.unitId` e passou a
// ser permitida para QUALQUER papel (não só "manager") — base p/ identidade e
// escopo das Pendências. Estes testes cobrem a generalização.
describe("org-users filial (F1 — unitId p/ todos os papéis)", () => {
  it("creates a non-manager (operator) with a unitId and returns it", async () => {
    const context = await createTestContext({ seed: "orguser-filial-op" });
    contexts.push(context);
    const unit = await createUnit(context, `Filial ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/users`)
      .set(authHeader(context))
      .send({
        name: `Operador ${context.prefix}`,
        email: `${context.prefix}-op@e2e.daton.example`,
        password: "Secret123!",
        role: "operator",
        modules: [],
        unitId: unit.id,
      });
    expect(created.status).toBe(201);
    expect(created.body.unitId).toBe(unit.id);

    const listed = await request(app)
      .get(`/api/organizations/${context.organizationId}/users`)
      .set(authHeader(context));
    expect(listed.status).toBe(200);
    const row = listed.body.users.find(
      (u: { id: number }) => u.id === created.body.id,
    );
    expect(row.unitId).toBe(unit.id);
  });

  it("rejects a unitId from another organization on create", async () => {
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
        unitId: foreignUnit.id,
      });
    expect(created.status).toBe(400);
  });
});

// PATCH /role: trocar de papel NÃO deve apagar a filial existente. A UI sempre
// reenvia o unitId atual; estes testes cobrem o contrato direto da API, onde
// omitir unitId preserva a filial e enviar `null` zera de propósito.
describe("org-users PATCH role (preserva filial ao omitir unitId)", () => {
  async function createOperatorWithUnit(
    context: TestOrgContext,
    suffix: string,
  ): Promise<{ id: number; unitId: number }> {
    const unit = await createUnit(context, `Filial ${suffix} ${context.prefix}`);
    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/users`)
      .set(authHeader(context))
      .send({
        name: `Op ${suffix} ${context.prefix}`,
        email: `${context.prefix}-${suffix}@e2e.daton.example`,
        password: "Secret123!",
        role: "operator",
        modules: [],
        unitId: unit.id,
      });
    expect(created.status).toBe(201);
    return { id: created.body.id, unitId: unit.id };
  }

  async function findUser(context: TestOrgContext, id: number) {
    const listed = await request(app)
      .get(`/api/organizations/${context.organizationId}/users`)
      .set(authHeader(context));
    expect(listed.status).toBe(200);
    return listed.body.users.find((u: { id: number }) => u.id === id);
  }

  it("keeps the existing unitId when the role update omits unitId", async () => {
    const context = await createTestContext({ seed: "orguser-role-keep" });
    contexts.push(context);
    const { id, unitId } = await createOperatorWithUnit(context, "keep");

    const patched = await request(app)
      .patch(`/api/organizations/${context.organizationId}/users/${id}/role`)
      .set(authHeader(context))
      .send({ role: "analyst" });
    expect(patched.status).toBe(200);

    const row = await findUser(context, id);
    expect(row.unitId).toBe(unitId);
  });

  it("clears the unitId only when unitId: null is sent explicitly", async () => {
    const context = await createTestContext({ seed: "orguser-role-clear" });
    contexts.push(context);
    const { id } = await createOperatorWithUnit(context, "clear");

    const patched = await request(app)
      .patch(`/api/organizations/${context.organizationId}/users/${id}/role`)
      .set(authHeader(context))
      .send({ role: "operator", unitId: null });
    expect(patched.status).toBe(200);

    const row = await findUser(context, id);
    expect(row.unitId).toBeNull();
  });
});
