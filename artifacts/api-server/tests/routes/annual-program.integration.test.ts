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

async function createCatalogItem(context: TestOrgContext, title: string) {
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/training-catalog`)
    .set(authHeader(context))
    .send({ title });
  return res.body.id as number;
}

describe("annual-program routes", () => {
  it("CRUD do item do PAT + filtro por ano + vínculo de turma", async () => {
    const context = await createTestContext({ seed: "pat-crud" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/annual-program`;
    const catalogItemId = await createCatalogItem(context, `Treino ${context.prefix}`);

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        year: 2026,
        catalogItemId,
        plannedMonth: 6,
        plannedQuantity: 24,
        responsible: "Ana",
        status: "planejada",
      });
    expect(created.status).toBe(201);
    expect(created.body.year).toBe(2026);
    expect(created.body.status).toBe("planejada");

    // outro ano para testar filtro
    await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ year: 2025, catalogItemId });

    const listed2026 = await request(app)
      .get(`${base}?year=2026`)
      .set(authHeader(context));
    expect(listed2026.status).toBe(200);
    expect(
      listed2026.body.data.every((i: { year: number }) => i.year === 2026),
    ).toBe(true);
    expect(listed2026.body.data.some((i: { id: number }) => i.id === created.body.id)).toBe(true);

    // vincular turma real + status
    const turma = await request(app)
      .post(`/api/organizations/${context.organizationId}/training-classes`)
      .set(authHeader(context))
      .send({ catalogItemId, startDate: "2026-06-15" });
    expect(turma.status).toBe(201);
    const patched = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ classId: turma.body.id, status: "em_andamento" });
    expect(patched.status).toBe(200);
    expect(patched.body.classId).toBe(turma.body.id);
    expect(patched.body.status).toBe("em_andamento");

    const removed = await request(app)
      .delete(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(removed.status).toBe(204);
  });

  it("bloqueia item do PAT com catálogo de outra organização", async () => {
    const orgA = await createTestContext({ seed: "pat-tenant-a" });
    const orgB = await createTestContext({ seed: "pat-tenant-b" });
    contexts.push(orgA, orgB);
    const catalogB = await createCatalogItem(orgB, `Treino ${orgB.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${orgA.organizationId}/annual-program`)
      .set(authHeader(orgA))
      .send({ year: 2026, catalogItemId: catalogB });
    expect(created.status).toBe(400);
  });
});
