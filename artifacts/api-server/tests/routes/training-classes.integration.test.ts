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

async function createCatalogItem(context: TestOrgContext, title: string) {
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/training-catalog`)
    .set(authHeader(context))
    .send({ title });
  return res.body.id as number;
}

describe("training-classes routes", () => {
  it("CRUD de turma + participantes", async () => {
    const context = await createTestContext({ seed: "classes-crud" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(context, `Treino ${context.prefix}`);
    const emp1 = await createEmployee(context, { name: `A ${context.prefix}` });
    const emp2 = await createEmployee(context, { name: `B ${context.prefix}` });

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        catalogItemId,
        code: "T01",
        startDate: "2026-06-15",
        minScore: 7,
        status: "agendada",
      });
    expect(created.status).toBe(201);
    const classId = created.body.id as number;

    // inscrever participantes
    const enrolled = await request(app)
      .post(`${base}/${classId}/participants`)
      .set(authHeader(context))
      .send({ employeeIds: [emp1.id, emp2.id] });
    expect(enrolled.status).toBe(200);
    expect(enrolled.body.participants.length).toBe(2);

    // detalhe traz participantes com nome
    const detail = await request(app)
      .get(`${base}/${classId}`)
      .set(authHeader(context));
    expect(detail.status).toBe(200);
    expect(detail.body.participants.length).toBe(2);
    expect(detail.body.participants[0].employeeName).toBeTruthy();

    // presença + nota → result derivado
    const participantId = detail.body.participants.find(
      (p: { employeeId: number }) => p.employeeId === emp1.id,
    ).id;
    const patched = await request(app)
      .patch(`${base}/${classId}/participants/${participantId}`)
      .set(authHeader(context))
      .send({ attendance: "presente", score: 9 });
    expect(patched.status).toBe(200);
    expect(patched.body.result).toBe("aprovado");

    const reproved = await request(app)
      .patch(`${base}/${classId}/participants/${participantId}`)
      .set(authHeader(context))
      .send({ attendance: "presente", score: 5 });
    expect(reproved.body.result).toBe("reprovado");

    // remover participante
    const removed = await request(app)
      .delete(`${base}/${classId}/participants/${participantId}`)
      .set(authHeader(context));
    expect(removed.status).toBe(204);

    // lista com contagem
    const listed = await request(app).get(base).set(authHeader(context));
    expect(listed.status).toBe(200);
    const found = listed.body.data.find((c: { id: number }) => c.id === classId);
    expect(found.participantCount).toBe(1);

    // deletar turma
    const del = await request(app)
      .delete(`${base}/${classId}`)
      .set(authHeader(context));
    expect(del.status).toBe(204);
  });

  it("bloqueia matrícula de colaborador de outra organização", async () => {
    const orgA = await createTestContext({ seed: "classes-tenant-a" });
    const orgB = await createTestContext({ seed: "classes-tenant-b" });
    contexts.push(orgA, orgB);
    const baseA = `/api/organizations/${orgA.organizationId}/training-classes`;
    const catalogA = await createCatalogItem(orgA, `Treino ${orgA.prefix}`);
    const classA = await request(app)
      .post(baseA)
      .set(authHeader(orgA))
      .send({ catalogItemId: catalogA, startDate: "2026-06-15" });
    expect(classA.status).toBe(201);

    // colaborador pertence à org B
    const empB = await createEmployee(orgB, { name: `B ${orgB.prefix}` });

    // org A tenta matricular colaborador da org B → rejeitado, sem efeito
    const enroll = await request(app)
      .post(`${baseA}/${classA.body.id}/participants`)
      .set(authHeader(orgA))
      .send({ employeeIds: [empB.id] });
    expect(enroll.status).toBe(400);

    const detail = await request(app)
      .get(`${baseA}/${classA.body.id}`)
      .set(authHeader(orgA));
    expect(detail.body.participants.length).toBe(0);
  });

  it("bloqueia criação de turma com item de catálogo de outra organização", async () => {
    const orgA = await createTestContext({ seed: "classes-cat-a" });
    const orgB = await createTestContext({ seed: "classes-cat-b" });
    contexts.push(orgA, orgB);
    const catalogB = await createCatalogItem(orgB, `Treino ${orgB.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${orgA.organizationId}/training-classes`)
      .set(authHeader(orgA))
      .send({ catalogItemId: catalogB, startDate: "2026-06-15" });
    expect(created.status).toBe(400);
  });
});
