import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createDepartment,
  createPosition,
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

describe("employees routes", () => {
  it("creates, lists and loads an employee detail with nested profile items", async () => {
    const context = await createTestContext({ seed: "employees-crud" });
    contexts.push(context);
    const unit = await createUnit(context, `Matriz ${context.prefix}`);
    await createDepartment(context, { name: "Qualidade" });
    await createPosition(context, { name: "Analista da Qualidade" });

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context))
      .send({
        name: `Maria ${context.prefix}`,
        email: `${context.prefix}.employee@daton.example`,
        unitId: unit.id,
        department: "Qualidade",
        position: "Analista da Qualidade",
        admissionDate: "2024-02-01",
        professionalExperiences: [
          {
            title: "Experiência em inspeção final",
            description: "Atuação em recebimento e liberação",
          },
        ],
      });

    expect(created.status).toBe(201);
    expect(created.body.name).toContain("Maria");

    const listed = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context));

    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].unitName).toBe(`Matriz ${context.prefix}`);

    const detail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${created.body.id}`,
      )
      .set(authHeader(context));

    expect(detail.status).toBe(200);
    expect(detail.body.professionalExperiences).toHaveLength(1);
    expect(detail.body.professionalExperiences[0].title).toContain("inspeção");
  });

  it("rejects missing required fields", async () => {
    const context = await createTestContext({
      seed: "employees-required-fields",
    });
    contexts.push(context);

    const response = await request(app)
      .post(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context))
      .send({
        name: "",
        admissionDate: "",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("\"name\"");
  });

  it("validates department and position ownership and supports nested competency records", async () => {
    const context = await createTestContext({ seed: "employees-references" });
    contexts.push(context);

    const invalidReference = await request(app)
      .post(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context))
      .send({
        name: `João ${context.prefix}`,
        admissionDate: "2024-01-03",
        department: "Compras",
        position: "Inspetor",
      });

    expect(invalidReference.status).toBe(400);
    expect(invalidReference.body.error).toContain("Departamento");

    await createDepartment(context, { name: "Compras" });
    await createPosition(context, { name: "Inspetor" });

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context))
      .send({
        name: `João ${context.prefix}`,
        admissionDate: "2024-01-03",
        department: "Compras",
        position: "Inspetor",
      });

    expect(created.status).toBe(201);

    const competency = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${created.body.id}/competencies`,
      )
      .set(authHeader(context))
      .send({
        name: "Inspeção de recebimento",
        type: "habilidade",
        requiredLevel: 4,
        acquiredLevel: 3,
      });

    expect(competency.status).toBe(201);

    const detail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${created.body.id}`,
      )
      .set(authHeader(context));

    expect(detail.status).toBe(200);
    expect(detail.body.competencies).toHaveLength(1);
    expect(detail.body.competencies[0].name).toBe("Inspeção de recebimento");
  });

  it("requires employee module access for non-admin users", async () => {
    const context = await createTestContext({
      seed: "employees-module-access",
      role: "analyst",
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Sem acesso");
  });
});
