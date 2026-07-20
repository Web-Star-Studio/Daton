import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeTrainingsTable,
  employeeCompetenciesTable,
  trainingEffectivenessReviewsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  const cs = contexts.splice(0);
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

/**
 * Rascunho da avaliação de eficácia (wizard Contexto → Critérios → Resultado).
 *
 * A regra que estes testes protegem: um rascunho guarda o preenchimento parcial
 * SEM concluir a avaliação. Antes desta mudança qualquer linha em
 * training_effectiveness_reviews significava "concluída", então salvar o
 * progresso jogaria o card direto para a coluna Concluídas e concederia a
 * competência ao colaborador sem ninguém ter finalizado nada.
 */
describe("Eficácia — rascunho (status=draft)", () => {
  async function setupTraining(seed: string) {
    const ctx = await createTestContext({ seed });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${seed}`);
    const employee = await createEmployee(ctx, {
      name: "Rita Rascunho",
      unitId: unit.id,
    });
    const [training] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `Treino ${seed}`,
        status: "concluido",
        completionDate: "2025-03-01",
        evaluationMethod: "prova",
        targetCompetencyName: "Trabalho em altura",
        targetCompetencyType: "habilidade",
        targetCompetencyLevel: 3,
      })
      .returning();
    return { ctx, employee, training: training! };
  }

  const draftBody = {
    evaluationDate: "2025-04-01",
    score: 8,
    isEffective: true,
    resultLevel: 4,
    comments: "Parcial",
    criteria: { behavior: 4, result: 4, transfer: 4 },
    status: "draft" as const,
  };

  it("rascunho mantém o treino em em_avaliacao e NÃO concede competência", async () => {
    const { ctx, employee, training } = await setupTraining("eff-draft-a");

    const post = await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${employee.id}/trainings/${training.id}/effectiveness-reviews`,
      )
      .set(authHeader(ctx))
      .send(draftBody);
    expect(post.status).toBe(201);

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings`)
      .set(authHeader(ctx));
    const item = list.body.data.find(
      (t: { id: number }) => t.id === training.id,
    );

    // Card continua em avaliação, com o preenchimento parcial devolvido.
    expect(item.effectivenessStatus).toBe("in_review");
    expect(item.latestEffectivenessReview).toBeNull();
    expect(item.effectivenessDraft).not.toBeNull();
    expect(item.effectivenessDraft.criteria).toEqual({
      behavior: 4,
      result: 4,
      transfer: 4,
    });
    expect(item.effectivenessDraft.comments).toBe("Parcial");

    // isEffective=true no rascunho não pode virar competência adquirida.
    const comps = await db
      .select()
      .from(employeeCompetenciesTable)
      .where(eq(employeeCompetenciesTable.employeeId, employee.id));
    expect(comps).toHaveLength(0);
  });

  it("rascunho é substituído (não acumula linhas) a cada gravação", async () => {
    const { ctx, employee, training } = await setupTraining("eff-draft-b");
    const url = `/api/organizations/${ctx.organizationId}/employees/${employee.id}/trainings/${training.id}/effectiveness-reviews`;

    await request(app).post(url).set(authHeader(ctx)).send(draftBody);
    await request(app)
      .post(url)
      .set(authHeader(ctx))
      .send({
        ...draftBody,
        comments: "Segunda versão",
        criteria: { behavior: 2, result: 2, transfer: 2 },
      });

    const rows = await db
      .select()
      .from(trainingEffectivenessReviewsTable)
      .where(eq(trainingEffectivenessReviewsTable.trainingId, training.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("draft");
    expect(rows[0]!.comments).toBe("Segunda versão");
    expect(rows[0]!.criteria).toEqual({ behavior: 2, result: 2, transfer: 2 });
  });

  it("finalizar apaga o rascunho, conclui o card e concede a competência", async () => {
    const { ctx, employee, training } = await setupTraining("eff-draft-c");
    const url = `/api/organizations/${ctx.organizationId}/employees/${employee.id}/trainings/${training.id}/effectiveness-reviews`;

    await request(app).post(url).set(authHeader(ctx)).send(draftBody);
    const final = await request(app)
      .post(url)
      .set(authHeader(ctx))
      .send({ ...draftBody, status: "final", comments: "Concluída" });
    expect(final.status).toBe(201);

    // Sobra exatamente uma linha, final — o rascunho não sobrevive à avaliação.
    const rows = await db
      .select()
      .from(trainingEffectivenessReviewsTable)
      .where(eq(trainingEffectivenessReviewsTable.trainingId, training.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("final");

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings`)
      .set(authHeader(ctx));
    const item = list.body.data.find(
      (t: { id: number }) => t.id === training.id,
    );
    expect(item.effectivenessStatus).toBe("effective");
    expect(item.effectivenessDraft).toBeNull();
    expect(item.latestEffectivenessReview).not.toBeNull();
    expect(item.latestEffectivenessReview.criteria).toEqual({
      behavior: 4,
      result: 4,
      transfer: 4,
    });

    const comps = await db
      .select()
      .from(employeeCompetenciesTable)
      .where(eq(employeeCompetenciesTable.employeeId, employee.id));
    expect(comps).toHaveLength(1);
  });

  it("board: rascunho conta em em_avaliacao, nunca em concluidas", async () => {
    const { ctx, employee, training } = await setupTraining("eff-draft-d");

    await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${employee.id}/trainings/${training.id}/effectiveness-reviews`,
      )
      .set(authHeader(ctx))
      .send(draftBody);

    const emAvaliacao = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?boardColumn=em_avaliacao&scope=needs_evaluation`,
      )
      .set(authHeader(ctx));
    expect(
      emAvaliacao.body.data.some((t: { id: number }) => t.id === training.id),
    ).toBe(true);

    const concluidas = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?boardColumn=concluidas&scope=needs_evaluation`,
      )
      .set(authHeader(ctx));
    expect(
      concluidas.body.data.some((t: { id: number }) => t.id === training.id),
    ).toBe(false);
  });
});
