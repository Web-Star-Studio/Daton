import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
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

describe("training snapshot from catalog", () => {
  it("ao lançar treino com catalogItemId, copia template, vincula e calcula validade", async () => {
    const context = await createTestContext({ seed: "training-snapshot" });
    contexts.push(context);
    const employee = await createEmployee(context, {
      name: `Motorista ${context.prefix}`,
    });
    const orgBase = `/api/organizations/${context.organizationId}`;

    const item = await request(app)
      .post(`${orgBase}/training-catalog`)
      .set(authHeader(context))
      .send({
        title: `Direção defensiva ${context.prefix}`,
        objective: "Condução segura e prevenção de acidentes",
        programContent: "Conteúdo programático do treino",
        workloadHours: 8,
        validityMonths: 12,
        targetCompetencyName: "Direção segura",
        targetCompetencyType: "habilidade",
        targetCompetencyLevel: 3,
        defaultInstructor: "Carlos Ribeiro",
      });
    expect(item.status).toBe(201);

    const created = await request(app)
      .post(`${orgBase}/employees/${employee.id}/trainings`)
      .set(authHeader(context))
      .send({
        catalogItemId: item.body.id,
        completionDate: "2026-01-10",
      });
    expect(created.status).toBe(201);
    // snapshot dos campos template
    expect(created.body.title).toBe(`Direção defensiva ${context.prefix}`);
    expect(created.body.objective).toBe(
      "Condução segura e prevenção de acidentes",
    );
    expect(created.body.workloadHours).toBe(8);
    expect(created.body.targetCompetencyName).toBe("Direção segura");
    expect(created.body.targetCompetencyLevel).toBe(3);
    expect(created.body.institution).toBe("Carlos Ribeiro");
    // validade: completionDate + 12 meses
    expect(created.body.expirationDate).toBe("2027-01-10");
    // vínculo
    expect(created.body.catalogItemId).toBe(item.body.id);
  });

  it("campos do body têm precedência sobre o catálogo", async () => {
    const context = await createTestContext({ seed: "training-snapshot-override" });
    contexts.push(context);
    const employee = await createEmployee(context, {
      name: `Colab ${context.prefix}`,
    });
    const orgBase = `/api/organizations/${context.organizationId}`;

    const item = await request(app)
      .post(`${orgBase}/training-catalog`)
      .set(authHeader(context))
      .send({ title: "Título do catálogo", workloadHours: 8 });
    expect(item.status).toBe(201);

    const created = await request(app)
      .post(`${orgBase}/employees/${employee.id}/trainings`)
      .set(authHeader(context))
      .send({
        catalogItemId: item.body.id,
        title: "Título customizado",
        workloadHours: 4,
      });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe("Título customizado");
    expect(created.body.workloadHours).toBe(4);
    expect(created.body.catalogItemId).toBe(item.body.id);
  });
});
