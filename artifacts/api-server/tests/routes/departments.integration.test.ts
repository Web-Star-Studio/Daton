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
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

describe("departments routes", () => {
  it("creates, updates, lists and deletes a department with unit links", async () => {
    const context = await createTestContext({ seed: "departments-crud" });
    contexts.push(context);
    const unitA = await createUnit(context, `Unidade A ${context.prefix}`);
    const unitB = await createUnit(context, `Unidade B ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/departments`)
      .set(authHeader(context))
      .send({
        name: `Qualidade ${context.prefix}`,
        description: "Departamento principal",
        unitIds: [unitA.id],
      });

    expect(created.status).toBe(201);
    expect(created.body.unitIds).toEqual([unitA.id]);

    const updated = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/departments/${created.body.id}`,
      )
      .set(authHeader(context))
      .send({
        name: `Qualidade Corporativa ${context.prefix}`,
        description: "Atualizado",
        unitIds: [unitA.id, unitB.id],
      });

    expect(updated.status).toBe(200);
    expect(updated.body.unitIds).toEqual([unitA.id, unitB.id]);

    const listed = await request(app)
      .get(`/api/organizations/${context.organizationId}/departments`)
      .set(authHeader(context));

    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      id: created.body.id,
      name: `Qualidade Corporativa ${context.prefix}`,
      unitIds: [unitA.id, unitB.id],
    });

    const deleted = await request(app)
      .delete(
        `/api/organizations/${context.organizationId}/departments/${created.body.id}`,
      )
      .set(authHeader(context));

    expect(deleted.status).toBe(204);

    const afterDelete = await request(app)
      .get(`/api/organizations/${context.organizationId}/departments`)
      .set(authHeader(context));

    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body).toEqual([]);
  });

  it("rejects unit ids from another organization", async () => {
    const context = await createTestContext({
      seed: "departments-invalid-unit",
    });
    const foreignContext = await createTestContext({
      seed: "departments-foreign-org",
    });
    contexts.push(context, foreignContext);

    const foreignUnit = await createUnit(
      foreignContext,
      `Unidade Externa ${foreignContext.prefix}`,
    );

    const response = await request(app)
      .post(`/api/organizations/${context.organizationId}/departments`)
      .set(authHeader(context))
      .send({
        name: `Operações ${context.prefix}`,
        unitIds: [foreignUnit.id],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("unidades");
  });

  it("requires department module access for non-admin users", async () => {
    const context = await createTestContext({
      seed: "departments-module-access",
      role: "analyst",
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/departments`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Sem acesso");
  });
});
