import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  authHeader,
  cleanupTestContext,
  createPosition,
  createTestContext,
  type TestOrgContext,
} from "../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("tipo de competência do requisito vem do catálogo (fonte única)", () => {
  it("grava o tipo do CATÁLOGO, ignorando o que o cliente enviar", async () => {
    const context = await createTestContext({ seed: "tipo-comp-catalogo" });
    contexts.push(context);
    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });

    const competencyName = `Direção defensiva ${context.prefix}`;
    const catalogItem = await request(app)
      .post(`/api/organizations/${context.organizationId}/competency-catalog`)
      .set(authHeader(context))
      .send({ name: competencyName, competencyType: "conhecimento" });
    expect(catalogItem.status).toBe(201);

    const created = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({
        competencyName,
        competencyType: "habilidade", // cliente tenta enviar um tipo divergente do catálogo
        requiredLevel: 3,
      });

    expect(created.status).toBe(201);
    expect(created.body.competencyType).toBe("conhecimento");
  });

  it("sem item de catálogo, preserva o tipo enviado (legado)", async () => {
    const context = await createTestContext({ seed: "tipo-comp-legado" });
    contexts.push(context);
    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });

    const competencyName = `Competência sem catálogo ${context.prefix}`;
    const created = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({
        competencyName,
        competencyType: "habilidade",
        requiredLevel: 2,
      });

    expect(created.status).toBe(201);
    expect(created.body.competencyType).toBe("habilidade");
  });

  it("PATCH também realinha ao catálogo", async () => {
    const context = await createTestContext({ seed: "tipo-comp-patch" });
    contexts.push(context);
    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });

    const competencyName = `Postura ética ${context.prefix}`;
    const catalogItem = await request(app)
      .post(`/api/organizations/${context.organizationId}/competency-catalog`)
      .set(authHeader(context))
      .send({ name: competencyName, competencyType: "atitude" });
    expect(catalogItem.status).toBe(201);

    const created = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({
        competencyName,
        competencyType: "conhecimento", // já nasce divergente; catálogo deve prevalecer
        requiredLevel: 4,
      });
    expect(created.status).toBe(201);
    expect(created.body.competencyType).toBe("atitude");

    const patched = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements/${created.body.id}`,
      )
      .set(authHeader(context))
      .send({ competencyType: "habilidade" });

    expect(patched.status).toBe(200);
    expect(patched.body.competencyType).toBe("atitude");
    expect(patched.body.competencyName).toBe(competencyName);
  });
});
