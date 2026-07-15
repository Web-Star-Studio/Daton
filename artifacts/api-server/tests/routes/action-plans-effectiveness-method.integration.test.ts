import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

/**
 * O método de verificação da eficácia deixou de ser um enum fixo e virou uma
 * referência ao catálogo da organização (`effectiveness_methods`). O plano
 * guarda o id — que precisa ser validado contra a org, senão um tenant poderia
 * apontar para o método de outro.
 */
describe("action plan effectiveness method (catalog id)", () => {
  it("round-trips effectivenessMethodId and rejects a method from another org", async () => {
    const context = await createTestContext({ seed: "ap-efic-method" });
    contexts.push(context);
    const other = await createTestContext({ seed: "ap-efic-other" });
    contexts.push(other);

    const method = await request(app)
      .post(`/api/organizations/${context.organizationId}/effectiveness-methods`)
      .set(authHeader(context))
      .send({ label: "Verificação por indicador" });
    expect(method.status).toBe(201);

    const foreign = await request(app)
      .post(`/api/organizations/${other.organizationId}/effectiveness-methods`)
      .set(authHeader(other))
      .send({ label: "Método da outra org" });
    expect(foreign.status).toBe(201);

    const base = `/api/organizations/${context.organizationId}/action-plans`;
    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        sourceModule: "manual",
        sourceRef: {},
        title: "Ação com método do catálogo",
        effectivenessMethodId: method.body.id,
      });
    expect(created.status).toBe(201);
    expect(created.body.effectivenessMethodId).toBe(method.body.id);

    const fetched = await request(app)
      .get(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(fetched.body.effectivenessMethodId).toBe(method.body.id);

    // Método de outra organização → 400 (não pode vazar entre tenants).
    const crossOrg = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ effectivenessMethodId: foreign.body.id });
    expect(crossOrg.status).toBe(400);

    // Limpar o método (null) é válido.
    const cleared = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ effectivenessMethodId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.effectivenessMethodId).toBeNull();
  });

  it("rejects a method id that does not exist at all", async () => {
    const context = await createTestContext({ seed: "ap-efic-ghost" });
    contexts.push(context);

    const response = await request(app)
      .post(`/api/organizations/${context.organizationId}/action-plans`)
      .set(authHeader(context))
      .send({
        sourceModule: "manual",
        sourceRef: {},
        title: "Ação com método inexistente",
        effectivenessMethodId: 999999,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Método de verificação inválido");
  });
});
