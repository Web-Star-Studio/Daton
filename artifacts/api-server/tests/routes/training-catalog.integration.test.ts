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
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("training-catalog routes", () => {
  it("cria, lista, busca, edita e deleta um item do catálogo", async () => {
    const context = await createTestContext({ seed: "training-catalog" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        title: `Cat ${context.prefix}`,
        category: "Capacitação",
        modality: "Presencial",
        norm: "ISO 39001 §7.2",
        workloadHours: 8,
        validityMonths: 12,
        isMandatory: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeDefined();
    expect(created.body.title).toBe(`Cat ${context.prefix}`);
    expect(created.body.isMandatory).toBe(true);

    const listed = await request(app).get(base).set(authHeader(context));
    expect(listed.status).toBe(200);
    expect(
      listed.body.data.some((i: { id: number }) => i.id === created.body.id),
    ).toBe(true);
    expect(listed.body.pagination.total).toBeGreaterThanOrEqual(1);

    const fetched = await request(app)
      .get(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);

    const patched = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ status: "inativo" });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe("inativo");

    const removed = await request(app)
      .delete(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(removed.status).toBe(204);

    const missing = await request(app)
      .get(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(missing.status).toBe(404);
  });

  it("filtra por status e busca por título", async () => {
    const context = await createTestContext({ seed: "training-catalog-filter" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    await request(app).post(base).set(authHeader(context)).send({
      title: `Ativo ${context.prefix}`,
      status: "ativo",
    });
    await request(app).post(base).set(authHeader(context)).send({
      title: `Rascunho ${context.prefix}`,
      status: "rascunho",
    });

    const onlyActive = await request(app)
      .get(`${base}?status=ativo`)
      .set(authHeader(context));
    expect(onlyActive.status).toBe(200);
    expect(
      onlyActive.body.data.every((i: { status: string }) => i.status === "ativo"),
    ).toBe(true);

    const searched = await request(app)
      .get(`${base}?search=Rascunho`)
      .set(authHeader(context));
    expect(searched.status).toBe(200);
    expect(
      searched.body.data.some((i: { title: string }) =>
        i.title.includes("Rascunho"),
      ),
    ).toBe(true);
  });
});
