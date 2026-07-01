import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createPosition,
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

describe("training-requirements routes", () => {
  it("CRUD de obrigatoriedade", async () => {
    const context = await createTestContext({ seed: "training-req-crud" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-requirements`;
    const position = await createPosition(context, { name: `Motorista ${context.prefix}` });
    const catalogItemId = await createCatalogItem(context, `Treino ${context.prefix}`);

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        positionId: position.id,
        catalogItemId,
        deadlineType: "fixo",
        deadlineDays: 30,
        scope: "geral",
        isCritical: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.deadlineType).toBe("fixo");
    expect(created.body.isCritical).toBe(true);

    const listed = await request(app)
      .get(`${base}?positionId=${position.id}`)
      .set(authHeader(context));
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((r: { id: number }) => r.id === created.body.id)).toBe(true);

    const patched = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ deadlineDays: 45 });
    expect(patched.status).toBe(200);
    expect(patched.body.deadlineDays).toBe(45);

    const removed = await request(app)
      .delete(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(removed.status).toBe(204);
  });

  it("rejeita obrigatoriedade duplicada (mesmo cargo+treinamento+escopo)", async () => {
    const context = await createTestContext({ seed: "training-req-dup" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-requirements`;
    const position = await createPosition(context, { name: `Cargo ${context.prefix}` });
    const catalogItemId = await createCatalogItem(context, `Treino ${context.prefix}`);
    const payload = {
      positionId: position.id,
      catalogItemId,
      deadlineType: "fixo",
      deadlineDays: 30,
      scope: "geral",
    };

    const first = await request(app).post(base).set(authHeader(context)).send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post(base).set(authHeader(context)).send(payload);
    expect(second.status).toBe(409);
  });

  it("preview resolve cargo (nome) + filial", async () => {
    const context = await createTestContext({ seed: "training-req-preview" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-requirements`;
    const positionName = `Mecânico ${context.prefix}`;
    const position = await createPosition(context, { name: positionName });
    const catalogItemId = await createCatalogItem(context, `NR-35 ${context.prefix}`);

    await request(app).post(base).set(authHeader(context)).send({
      positionId: position.id,
      catalogItemId,
      deadlineType: "rh",
      scope: "geral",
    });

    const preview = await request(app)
      .get(
        `${base}/preview?position=${encodeURIComponent(positionName)}`,
      )
      .set(authHeader(context));
    expect(preview.status).toBe(200);
    expect(preview.body.requirements.length).toBe(1);
    expect(preview.body.requirements[0].catalogItemId).toBe(catalogItemId);

    // cargo inexistente → vazio
    const empty = await request(app)
      .get(`${base}/preview?position=${encodeURIComponent("Inexistente")}`)
      .set(authHeader(context));
    expect(empty.status).toBe(200);
    expect(empty.body.requirements.length).toBe(0);
  });

  it("bloqueia requisito com cargo ou catálogo de outra organização", async () => {
    const orgA = await createTestContext({ seed: "training-req-tenant-a" });
    const orgB = await createTestContext({ seed: "training-req-tenant-b" });
    contexts.push(orgA, orgB);
    const base = `/api/organizations/${orgA.organizationId}/training-requirements`;
    const positionA = await createPosition(orgA, { name: `Cargo ${orgA.prefix}` });
    const catalogA = await createCatalogItem(orgA, `Treino ${orgA.prefix}`);
    const positionB = await createPosition(orgB, { name: `Cargo ${orgB.prefix}` });
    const catalogB = await createCatalogItem(orgB, `Treino ${orgB.prefix}`);

    // item de catálogo de outra org → 400
    const r1 = await request(app)
      .post(base)
      .set(authHeader(orgA))
      .send({ positionId: positionA.id, catalogItemId: catalogB, deadlineType: "fixo", deadlineDays: 30 });
    expect(r1.status).toBe(400);

    // cargo de outra org → 400
    const r2 = await request(app)
      .post(base)
      .set(authHeader(orgA))
      .send({ positionId: positionB.id, catalogItemId: catalogA, deadlineType: "fixo", deadlineDays: 30 });
    expect(r2.status).toBe(400);
  });
});
