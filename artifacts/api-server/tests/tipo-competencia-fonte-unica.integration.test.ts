import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
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

  it("PATCH sem enviar competencyType também realinha ao catálogo", async () => {
    const context = await createTestContext({ seed: "tipo-comp-patch-sem-tipo" });
    contexts.push(context);
    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });

    const competencyName = `Uso de EPI ${context.prefix}`;

    // Nasce sem item de catálogo correspondente: preserva o tipo enviado (legado).
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

    // O catálogo passa a ter um item com o mesmo nome, tipo divergente.
    const catalogItem = await request(app)
      .post(`/api/organizations/${context.organizationId}/competency-catalog`)
      .set(authHeader(context))
      .send({ name: competencyName, competencyType: "atitude" });
    expect(catalogItem.status).toBe(201);

    // PATCH não manda competencyType — só requiredLevel. O brief pede que o
    // realinhamento ao catálogo aconteça mesmo assim (rota sempre resolve via
    // catálogo, nunca só reaproveita o valor já gravado).
    const patched = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements/${created.body.id}`,
      )
      .set(authHeader(context))
      .send({ requiredLevel: 3 });

    expect(patched.status).toBe(200);
    expect(patched.body.requiredLevel).toBe(3);
    expect(patched.body.competencyType).toBe("atitude");
  });

  it("casa com o catálogo insensível a caixa e espaços", async () => {
    const context = await createTestContext({ seed: "tipo-comp-case-trim" });
    contexts.push(context);
    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });

    const catalogItem = await request(app)
      .post(`/api/organizations/${context.organizationId}/competency-catalog`)
      .set(authHeader(context))
      .send({ name: `Auditor ISO ${context.prefix}`, competencyType: "habilidade" });
    expect(catalogItem.status).toBe(201);

    const created = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({
        // mesmo nome do catálogo, mas em minúsculas e com espaços nas pontas
        competencyName: `  auditor iso ${context.prefix.toLowerCase()}  `,
        competencyType: "conhecimento", // divergente; catálogo deve prevalecer
        requiredLevel: 3,
      });

    expect(created.status).toBe(201);
    expect(created.body.competencyType).toBe("habilidade");
  });

  it("não usa competência de mesmo nome em OUTRA organização como fonte", async () => {
    const contextA = await createTestContext({ seed: "tipo-comp-org-a" });
    contexts.push(contextA);
    const contextB = await createTestContext({ seed: "tipo-comp-org-b" });
    contexts.push(contextB);

    const competencyName = "Direção defensiva compartilhada";

    // Org A tem um item de catálogo com esse nome.
    const catalogItemA = await request(app)
      .post(`/api/organizations/${contextA.organizationId}/competency-catalog`)
      .set(authHeader(contextA))
      .send({ name: competencyName, competencyType: "atitude" });
    expect(catalogItemA.status).toBe(201);

    // Org B NÃO tem item de catálogo com esse nome — deve preservar o tipo
    // enviado (comportamento "sem catálogo"), nunca herdar o tipo da Org A.
    const positionB = await createPosition(contextB, {
      name: `Cargo ${contextB.prefix}`,
    });
    const createdB = await request(app)
      .post(
        `/api/organizations/${contextB.organizationId}/employees/positions/${positionB.id}/competency-requirements`,
      )
      .set(authHeader(contextB))
      .send({
        competencyName,
        competencyType: "conhecimento",
        requiredLevel: 3,
      });

    expect(createdB.status).toBe(201);
    expect(createdB.body.competencyType).toBe("conhecimento");
  });

  it("competência do colaborador sem `type` no corpo grava CHA, nunca o default legado do banco", async () => {
    const context = await createTestContext({ seed: "tipo-comp-emp-sem-type" });
    contexts.push(context);
    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
    });

    const created = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/competencies`,
      )
      .set(authHeader(context))
      .send({
        name: `Competência sem tipo ${context.prefix}`,
        // `type` deliberadamente omitido: a coluna no Neon de produção ainda
        // tem DEFAULT 'formacao' (a DDL do schema local, que já é
        // 'conhecimento', não foi aplicada lá). Sem fallback na aplicação,
        // essa linha nasceria com um valor fora do contrato CHA.
      });

    expect(created.status).toBe(201);
    expect(created.body.type).toBe("conhecimento");
    expect(["conhecimento", "habilidade", "atitude"]).toContain(
      created.body.type,
    );
  });
});
