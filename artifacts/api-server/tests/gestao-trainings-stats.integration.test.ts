import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeTrainingsTable,
  trainingCatalogTable,
  trainingClassesTable,
  trainingClassParticipantsTable,
} from "@workspace/db";
import app from "../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  type TestOrgContext,
} from "../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

/**
 * Semeia um cenário com 1 treino "programado" (pendente ∩ participante de
 * turma ativa) e 1 treino "realizado no mês" (concluído com completionDate
 * no mês corrente) para o mesmo colaborador.
 */
async function seedProgramadoERealizado(ctx: TestOrgContext) {
  const [cat] = await db
    .insert(trainingCatalogTable)
    .values({
      organizationId: ctx.organizationId,
      title: `${ctx.prefix} NR-35`,
      status: "ativo",
    })
    .returning();
  const emp = await createEmployee(ctx, { name: `${ctx.prefix} Fulano` });

  // treino pendente com turma ativa → programado
  await db.insert(employeeTrainingsTable).values({
    employeeId: emp.id,
    title: `${ctx.prefix} NR-35`,
    status: "pendente",
    catalogItemId: cat.id,
  });
  const [cls] = await db
    .insert(trainingClassesTable)
    .values({
      organizationId: ctx.organizationId,
      catalogItemId: cat.id,
      startDate: "2026-07-25",
      status: "agendada",
    })
    .returning();
  await db.insert(trainingClassParticipantsTable).values({
    classId: cls.id,
    employeeId: emp.id,
  });

  // treino concluído neste mês → realizadoMes
  await db.insert(employeeTrainingsTable).values({
    employeeId: emp.id,
    title: `${ctx.prefix} Integração`,
    status: "concluido",
    completionDate: new Date().toISOString().slice(0, 10),
  });
}

describe("GET employees/trainings — stats programado/realizadoMes", () => {
  it("conta stats.realizadoMes; programado é provado via onlyProgramado (caminho rápido)", async () => {
    const ctx = await createTestContext({ seed: "trainings-stats" });
    contexts.push(ctx);
    await seedProgramadoERealizado(ctx);

    const res = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?pageSize=1`,
      )
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    expect(res.body.stats.realizadoMes).toBe(1);
    // `stats.programado` foi removido (EXISTS correlacionado no SELECT list
    // não achata em semi-join — SubPlan por linha, medido ~6,5s/1,15M buffer
    // hits em 50k linhas). Não deve voltar ao statsRow.
    expect(res.body.stats.programado).toBeUndefined();

    // Mesma contagem, pelo caminho rápido: onlyProgramado no WHERE achata em
    // Hash Semi Join (~60ms/~800 buffers).
    const onlyProgramadoRes = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?onlyProgramado=true&pageSize=1`,
      )
      .set(authHeader(ctx));
    expect(onlyProgramadoRes.status).toBe(200);
    expect(onlyProgramadoRes.body.pagination.total).toBe(1);
  });

  it("onlyProgramado filtra a lista para pendentes com turma ativa", async () => {
    const ctx = await createTestContext({ seed: "trainings-only-programado" });
    contexts.push(ctx);
    await seedProgramadoERealizado(ctx);

    const res = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?onlyProgramado=true&pageSize=50`,
      )
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe("pendente");
  });

  it("realizadoInCurrentMonth filtra concluídos do mês", async () => {
    const ctx = await createTestContext({ seed: "trainings-realizado-mes" });
    contexts.push(ctx);
    await seedProgramadoERealizado(ctx);

    const res = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?realizadoInCurrentMonth=true&pageSize=50`,
      )
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe("concluido");
  });

  it("onlyPendenteSemTurma retorna só o pendente sem turma ativa (exclui o programado)", async () => {
    const ctx = await createTestContext({
      seed: "trainings-pendente-sem-turma",
    });
    contexts.push(ctx);
    await seedProgramadoERealizado(ctx);

    // Pendente adicional, sem nenhuma turma vinculada — deve aparecer no filtro.
    const emp2 = await createEmployee(ctx, {
      name: `${ctx.prefix} Beltrano`,
    });
    await db.insert(employeeTrainingsTable).values({
      employeeId: emp2.id,
      title: `${ctx.prefix} NR-10`,
      status: "pendente",
    });

    const res = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?onlyPendenteSemTurma=true&pageSize=50`,
      )
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe(`${ctx.prefix} NR-10`);
    expect(res.body.data[0].status).toBe("pendente");
  });

  it("onlyProgramado=false não filtra a lista (string 'false' não deve virar truthy)", async () => {
    const ctx = await createTestContext({
      seed: "trainings-only-programado-false",
    });
    contexts.push(ctx);
    await seedProgramadoERealizado(ctx);

    const res = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?onlyProgramado=false&pageSize=50`,
      )
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    // Lista completa: o pendente/programado E o concluído do mês, sem filtro aplicado.
    expect(res.body.data.length).toBe(2);
    const statuses = res.body.data.map((t: { status: string }) => t.status);
    expect(statuses).toContain("pendente");
    expect(statuses).toContain("concluido");
  });
});
