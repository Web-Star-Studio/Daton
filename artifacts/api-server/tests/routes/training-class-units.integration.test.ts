import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function createCatalogItem(context: TestOrgContext, title: string) {
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/training-catalog`)
    .set(authHeader(context))
    .send({ title });
  return res.body.id as number;
}

describe("turma com múltiplas filiais", () => {
  it("cria turma abrangendo N filiais, com responsável por filial", async () => {
    const context = await createTestContext({ seed: "class-units-create" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(
      context,
      `Treino ${context.prefix}`,
    );
    const poa = await createUnit(context, `POA ${context.prefix}`);
    const cariacica = await createUnit(context, `CARIACICA ${context.prefix}`);
    const responsavel = await createTestUser(context, { suffix: "resp" });

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        catalogItemId,
        startDate: "2026-08-10",
        units: [
          { unitId: poa.id, responsibleUserId: responsavel.id },
          { unitId: cariacica.id },
        ],
      });
    expect(created.status).toBe(201);
    expect(created.body.units).toHaveLength(2);

    const poaLink = created.body.units.find(
      (u: { unitId: number }) => u.unitId === poa.id,
    );
    expect(poaLink.responsibleUserId).toBe(responsavel.id);
    expect(poaLink.responsibleUserName).toBeTruthy();
    expect(poaLink.unitName).toContain("POA");
    const cariacicaLink = created.body.units.find(
      (u: { unitId: number }) => u.unitId === cariacica.id,
    );
    expect(cariacicaLink.responsibleUserId).toBeNull();

    // Detalhe e listagem devolvem a mesma lista de filiais.
    const detail = await request(app)
      .get(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(detail.status).toBe(200);
    expect(detail.body.units).toHaveLength(2);

    const list = await request(app).get(base).set(authHeader(context));
    expect(list.status).toBe(200);
    expect(list.body.data[0].units).toHaveLength(2);
  });

  it("filtro por filial casa turma que INCLUI a filial, não só a primeira", async () => {
    const context = await createTestContext({ seed: "class-units-filter" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(
      context,
      `Treino ${context.prefix}`,
    );
    const poa = await createUnit(context, `POA ${context.prefix}`);
    const cariacica = await createUnit(context, `CARIACICA ${context.prefix}`);
    const outra = await createUnit(context, `OUTRA ${context.prefix}`);

    const multi = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        catalogItemId,
        startDate: "2026-08-10",
        // Cariacica é a SEGUNDA da lista — com a coluna única antiga ela não
        // apareceria neste filtro.
        units: [{ unitId: poa.id }, { unitId: cariacica.id }],
      });
    expect(multi.status).toBe(201);

    const soOutra = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ catalogItemId, startDate: "2026-08-11", units: [{ unitId: outra.id }] });
    expect(soOutra.status).toBe(201);

    const filtered = await request(app)
      .get(`${base}?unitId=${cariacica.id}`)
      .set(authHeader(context));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.map((c: { id: number }) => c.id)).toEqual([
      multi.body.id,
    ]);
  });

  it("PATCH com units substitui a lista inteira; omitir mantém", async () => {
    const context = await createTestContext({ seed: "class-units-patch" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(
      context,
      `Treino ${context.prefix}`,
    );
    const poa = await createUnit(context, `POA ${context.prefix}`);
    const cariacica = await createUnit(context, `CARIACICA ${context.prefix}`);

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        catalogItemId,
        startDate: "2026-08-10",
        units: [{ unitId: poa.id }, { unitId: cariacica.id }],
      });
    const classId = created.body.id as number;

    // Alterar outro campo NÃO pode mexer nas filiais.
    const renamed = await request(app)
      .patch(`${base}/${classId}`)
      .set(authHeader(context))
      .send({ code: "T99" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.code).toBe("T99");
    expect(renamed.body.units).toHaveLength(2);

    // Replace-all.
    const replaced = await request(app)
      .patch(`${base}/${classId}`)
      .set(authHeader(context))
      .send({ units: [{ unitId: cariacica.id }] });
    expect(replaced.status).toBe(200);
    expect(replaced.body.units).toHaveLength(1);
    expect(replaced.body.units[0].unitId).toBe(cariacica.id);

    // Lista vazia remove todas.
    const cleared = await request(app)
      .patch(`${base}/${classId}`)
      .set(authHeader(context))
      .send({ units: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.units).toHaveLength(0);
    expect(cleared.body.unitId).toBeNull();
  });

  it("aceita o unitId legado e o espelha na lista", async () => {
    const context = await createTestContext({ seed: "class-units-legacy" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(
      context,
      `Treino ${context.prefix}`,
    );
    const poa = await createUnit(context, `POA ${context.prefix}`);

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ catalogItemId, startDate: "2026-08-10", unitId: poa.id });
    expect(created.status).toBe(201);
    expect(created.body.units).toHaveLength(1);
    expect(created.body.units[0].unitId).toBe(poa.id);
    // O espelho legado continua preenchido para quem ainda lê o campo antigo.
    expect(created.body.unitId).toBe(poa.id);

    const filtered = await request(app)
      .get(`${base}?unitId=${poa.id}`)
      .set(authHeader(context));
    expect(filtered.body.data).toHaveLength(1);
  });

  it("rejeita filial e responsável de outra organização", async () => {
    const context = await createTestContext({ seed: "class-units-tenant" });
    const outra = await createTestContext({ seed: "class-units-alheia" });
    contexts.push(context, outra);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(
      context,
      `Treino ${context.prefix}`,
    );
    const unidadeAlheia = await createUnit(outra, `ALHEIA ${outra.prefix}`);
    const usuarioAlheio = await createTestUser(outra, { suffix: "alheio" });
    const minha = await createUnit(context, `MINHA ${context.prefix}`);

    const comUnidadeAlheia = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        catalogItemId,
        startDate: "2026-08-10",
        units: [{ unitId: unidadeAlheia.id }],
      });
    expect(comUnidadeAlheia.status).toBe(400);

    const comRespAlheio = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        catalogItemId,
        startDate: "2026-08-10",
        units: [{ unitId: minha.id, responsibleUserId: usuarioAlheio.id }],
      });
    expect(comRespAlheio.status).toBe(400);
  });

  it("filial repetida no corpo não estoura o índice único", async () => {
    const context = await createTestContext({ seed: "class-units-dup" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(
      context,
      `Treino ${context.prefix}`,
    );
    const poa = await createUnit(context, `POA ${context.prefix}`);

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        catalogItemId,
        startDate: "2026-08-10",
        units: [{ unitId: poa.id }, { unitId: poa.id }],
      });
    expect(created.status).toBe(201);
    expect(created.body.units).toHaveLength(1);
  });
});
