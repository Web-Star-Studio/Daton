import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, trainingCatalogOptionsTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

describe("training catalog options API", () => {
  it("seeds the three default lists for a new org", async () => {
    const ctx = await createTestContext({ seed: "tco-defaults" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-catalog-options`;

    const cats = await request(app)
      .get(`${base}?kind=category`)
      .set(authHeader(ctx));
    expect(cats.status).toBe(200);
    expect(cats.body.map((o: { label: string }) => o.label)).toEqual([
      "Integração",
      "Reciclagem",
      "Capacitação",
      "Certificação",
      "Reunião",
    ]);

    const evid = await request(app)
      .get(`${base}?kind=evidence_type`)
      .set(authHeader(ctx));
    expect(
      evid.body.map((o: { code: string; provesCompetency: boolean }) => [
        o.code,
        o.provesCompetency,
      ]),
    ).toEqual([
      ["capacitacao", true],
      ["habilitacao", true],
      ["conscientizacao", false],
    ]);
  });

  it("creates a category, is idempotent, and never gives it a code", async () => {
    const ctx = await createTestContext({ seed: "tco-create" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-catalog-options`;

    const created = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ kind: "category", label: "Onboarding" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: "category", label: "Onboarding" });
    expect(created.body.code).toBeNull();

    const dup = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ kind: "category", label: "onboarding" });
    expect(dup.status).toBe(200);
    expect(dup.body.id).toBe(created.body.id);
  });

  it("allows the same label across different kinds (category vs modality)", async () => {
    const ctx = await createTestContext({ seed: "tco-cross-kind" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-catalog-options`;

    const a = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ kind: "category", label: "Especial" });
    const b = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ kind: "modality", label: "Especial" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).not.toBe(a.body.id);
  });

  it("creates an evidence type with a generated code and semantic flags", async () => {
    const ctx = await createTestContext({ seed: "tco-evidence" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-catalog-options`;

    const created = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({
        kind: "evidence_type",
        label: "Palestra externa",
        provesCompetency: false,
        requiresValidity: false,
      });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe("palestra_externa");
    expect(created.body.provesCompetency).toBe(false);

    // O catálogo aceita este novo código na classificação de um item de treino.
    const catalogBase = `/api/organizations/${ctx.organizationId}/training-catalog`;
    const item = await request(app)
      .post(catalogBase)
      .set(authHeader(ctx))
      .send({ title: "Palestra Q3", evidenceType: "palestra_externa" });
    expect(item.status).toBe(201);
    expect(item.body.evidenceType).toBe("palestra_externa");

    // Um código inexistente continua rejeitado.
    const bad = await request(app)
      .post(catalogBase)
      .set(authHeader(ctx))
      .send({ title: "Qualquer", evidenceType: "nao_existe" });
    expect(bad.status).toBe(400);
  });

  it("toggles the proves-competency flag via PATCH (evidence type only)", async () => {
    const ctx = await createTestContext({ seed: "tco-flag" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-catalog-options`;

    const list = await request(app)
      .get(`${base}?kind=evidence_type`)
      .set(authHeader(ctx));
    const conscient = list.body.find(
      (o: { code: string }) => o.code === "conscientizacao",
    );
    expect(conscient.provesCompetency).toBe(false);

    const patched = await request(app)
      .patch(`${base}/${conscient.id}`)
      .set(authHeader(ctx))
      .send({ provesCompetency: true });
    expect(patched.status).toBe(200);
    expect(patched.body.provesCompetency).toBe(true);
  });

  it("rejects a case-insensitive rename collision within the same kind (409)", async () => {
    const ctx = await createTestContext({ seed: "tco-collision" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-catalog-options`;

    const a = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ kind: "category", label: "Alpha" });
    const b = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ kind: "category", label: "Beta" });

    const collision = await request(app)
      .patch(`${base}/${b.body.id}`)
      .set(authHeader(ctx))
      .send({ label: "alpha" });
    expect(collision.status).toBe(409);
    expect(a.status).toBe(201);
  });

  it("empty evidence catalog falls back to the legacy vocabulary (deploy→backfill window)", async () => {
    const ctx = await createTestContext({ seed: "tco-fallback" });
    contexts.push(ctx);
    // Simula a janela entre o DDL e o backfill: a org NÃO tem tipos de evidência.
    await db
      .delete(trainingCatalogOptionsTable)
      .where(
        and(
          eq(trainingCatalogOptionsTable.organizationId, ctx.organizationId),
          eq(trainingCatalogOptionsTable.kind, "evidence_type"),
        ),
      );
    const catalogBase = `/api/organizations/${ctx.organizationId}/training-catalog`;

    // Código legado continua aceito mesmo sem catálogo.
    const ok = await request(app)
      .post(catalogBase)
      .set(authHeader(ctx))
      .send({ title: "Legado", evidenceType: "capacitacao" });
    expect(ok.status).toBe(201);

    // Lixo continua rejeitado.
    const bad = await request(app)
      .post(catalogBase)
      .set(authHeader(ctx))
      .send({ title: "Lixo", evidenceType: "qualquer_coisa" });
    expect(bad.status).toBe(400);
  });

  it("supports the label-only kinds development_nature/knowledge_area and round-trips them on a training item", async () => {
    const ctx = await createTestContext({ seed: "tco-newkinds" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-catalog-options`;

    // Sobem sem opções: nada semeado para estes kinds.
    const beforeNature = await request(app)
      .get(`${base}?kind=development_nature`)
      .set(authHeader(ctx));
    expect(beforeNature.body).toEqual([]);

    const nature = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ kind: "development_nature", label: "Interno" });
    expect(nature.status).toBe(201);
    expect(nature.body.code).toBeNull(); // label-only, sem código

    const area = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ kind: "knowledge_area", label: "Segurança do trabalho" });
    expect(area.status).toBe(201);

    // Os campos fazem round-trip no item do catálogo (texto livre, sem validação
    // contra o catálogo — diferente de evidence_type).
    const catalogBase = `/api/organizations/${ctx.organizationId}/training-catalog`;
    const created = await request(app)
      .post(catalogBase)
      .set(authHeader(ctx))
      .send({
        title: "NR-35",
        developmentNature: "Interno",
        knowledgeArea: "Segurança do trabalho",
      });
    expect(created.status).toBe(201);
    expect(created.body.developmentNature).toBe("Interno");
    expect(created.body.knowledgeArea).toBe("Segurança do trabalho");
  });

  it("blocks non-admin writes (403) but allows reads", async () => {
    const ctx = await createTestContext({ seed: "tco-gate" });
    contexts.push(ctx);
    const operator = await createTestUser(ctx, {
      role: "operator",
      suffix: "operador",
    });
    const base = `/api/organizations/${ctx.organizationId}/training-catalog-options`;

    const write = await request(app)
      .post(base)
      .set(authHeader(operator))
      .send({ kind: "category", label: "X" });
    expect(write.status).toBe(403);

    const read = await request(app).get(base).set(authHeader(operator));
    expect(read.status).toBe(200);
  });
});
