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

  it("PATCH score-only preserva result manual (não clobbers override)", async () => {
    const context = await createTestContext({ seed: "classes-score-only" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(context, `Treino Score ${context.prefix}`);
    const emp = await createEmployee(context, { name: `E ${context.prefix}` });

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ catalogItemId, startDate: "2026-07-01", minScore: 7 });
    const classId = created.body.id as number;

    await request(app)
      .post(`${base}/${classId}/participants`)
      .set(authHeader(context))
      .send({ employeeIds: [emp.id] });

    const detail = await request(app).get(`${base}/${classId}`).set(authHeader(context));
    const participantId = detail.body.participants[0].id as number;

    // Seta result manual explicitamente (sem attendance)
    const manual = await request(app)
      .patch(`${base}/${classId}/participants/${participantId}`)
      .set(authHeader(context))
      .send({ result: "aprovado" });
    expect(manual.status).toBe(200);
    expect(manual.body.result).toBe("aprovado");

    // PATCH só com score (sem attendance, sem result) → NÃO deve sobrescrever o result manual
    const scoreOnly = await request(app)
      .patch(`${base}/${classId}/participants/${participantId}`)
      .set(authHeader(context))
      .send({ score: 3 }); // nota baixa que recomputaria "reprovado" se recalculasse
    expect(scoreOnly.status).toBe(200);
    expect(scoreOnly.body.result).toBe("aprovado"); // preservado
    expect(scoreOnly.body.score).toBe(3); // score atualizado
  });

  it("PATCH aceita nota decimal (score numeric(4,2))", async () => {
    const context = await createTestContext({ seed: "classes-score-decimal" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(context, `Treino Decimal ${context.prefix}`);
    const emp = await createEmployee(context, { name: `E ${context.prefix}` });

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ catalogItemId, startDate: "2026-07-01", minScore: 7 });
    const classId = created.body.id as number;

    await request(app)
      .post(`${base}/${classId}/participants`)
      .set(authHeader(context))
      .send({ employeeIds: [emp.id] });

    const detail = await request(app).get(`${base}/${classId}`).set(authHeader(context));
    const participantId = detail.body.participants[0].id as number;

    // Nota com meio ponto: se a coluna voltasse a ser integer, o node-pg
    // manda o parâmetro como texto ("8.5") e o Postgres rejeita com 22P02
    // (500), em vez de arredondar em silêncio — ver
    // training-effectiveness-score.integration.test.ts para o mesmo caso.
    const patched = await request(app)
      .patch(`${base}/${classId}/participants/${participantId}`)
      .set(authHeader(context))
      .send({ attendance: "presente", score: 8.5 });

    expect(patched.status).toBe(200);
    expect(patched.body.score).toBe(8.5);
  });

  it("PATCH com score fora de 0-10 devolve 400 (não 500 nem 200) — achado 1 da revisão", async () => {
    const context = await createTestContext({ seed: "classes-score-oob" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(context, `Treino OOB ${context.prefix}`);
    const emp = await createEmployee(context, { name: `E ${context.prefix}` });

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ catalogItemId, startDate: "2026-07-01", minScore: 7 });
    const classId = created.body.id as number;

    await request(app)
      .post(`${base}/${classId}/participants`)
      .set(authHeader(context))
      .send({ employeeIds: [emp.id] });

    const detail = await request(app).get(`${base}/${classId}`).set(authHeader(context));
    const participantId = detail.body.participants[0].id as number;

    // numeric(4,2) guarda no máximo 99,99 — mas o bug real era que a API não
    // impunha faixa nenhuma antes deste fix: score:100 respondia 200 quando a
    // coluna era integer e virou 500 (numeric field overflow) depois que a
    // coluna alargou para numeric(4,2), sem NENHUMA validação de contrato
    // avisando o cliente. Com minimum/maximum no OpenAPI, o Zod gerado
    // rejeita antes de chegar no banco: 400, com mensagem.
    const patched = await request(app)
      .patch(`${base}/${classId}/participants/${participantId}`)
      .set(authHeader(context))
      .send({ attendance: "presente", score: 100 });

    expect(patched.status).toBe(400);
    expect(patched.body.error).toBeTruthy();

    // A nota inválida não deve ter sido persistida.
    const after = await request(app).get(`${base}/${classId}`).set(authHeader(context));
    const participantAfter = after.body.participants.find(
      (p: { id: number }) => p.id === participantId,
    );
    expect(participantAfter.score).toBeNull();
  });
});
