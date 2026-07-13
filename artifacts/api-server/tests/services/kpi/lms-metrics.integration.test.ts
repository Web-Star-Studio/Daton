import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
  trainingEffectivenessReviewsTable,
} from "@workspace/db";
import app from "../../../src/app";
import { computeLmsMetric } from "../../../src/services/kpi/lms-metrics";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("computeLmsMetric", () => {
  it("pat_completion = realizadas/total até o mês (%)", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-pat" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    // catálogo
    const cat = (
      await request(app)
        .post(`/api/organizations/${org}/training-catalog`)
        .set(authHeader(ctx))
        .send({ title: `T ${ctx.prefix}` })
    ).body.id;
    // PAT: 2 itens em jan, 1 realizada
    await request(app)
      .post(`/api/organizations/${org}/annual-program`)
      .set(authHeader(ctx))
      .send({ year: 2026, catalogItemId: cat, plannedMonth: 1, status: "realizada" });
    await request(app)
      .post(`/api/organizations/${org}/annual-program`)
      .set(authHeader(ctx))
      .send({ year: 2026, catalogItemId: cat, plannedMonth: 1, status: "planejada" });
    const v = await computeLmsMetric({
      orgId: org,
      metric: "pat_completion",
      year: 2026,
      month: 1,
      database: db,
    });
    expect(v).toBe(50);
  });

  it("effectiveness_overall = eficazes/total no mês (%)", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-eff" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    // cria 1 colaborador
    const emp = await createEmployee(ctx, { name: `Colaborador ${ctx.prefix}` });
    // insere 2 trainings para o colaborador
    const [t1, t2] = await db
      .insert(employeeTrainingsTable)
      .values([
        { employeeId: emp.id, title: `Treinamento A ${ctx.prefix}`, status: "concluido" },
        { employeeId: emp.id, title: `Treinamento B ${ctx.prefix}`, status: "concluido" },
      ])
      .returning({ id: employeeTrainingsTable.id });
    // insere 2 reviews em jan/2026: 1 eficaz, 1 não eficaz
    await db.insert(trainingEffectivenessReviewsTable).values([
      {
        trainingId: t1.id,
        evaluatorUserId: ctx.userId,
        evaluationDate: "2026-01-15",
        isEffective: true,
      },
      {
        trainingId: t2.id,
        evaluatorUserId: ctx.userId,
        evaluationDate: "2026-01-20",
        isEffective: false,
      },
    ]);
    const v = await computeLmsMetric({
      orgId: org,
      metric: "effectiveness_overall",
      year: 2026,
      month: 1,
      database: db,
    });
    expect(v).toBe(50);
  });

  it("mandatory_coverage = concluídos/total com requirementId (%)", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-cov" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const emp = await createEmployee(ctx, { name: `Colaborador ${ctx.prefix}` });
    // 2 trainings com requirementId; 1 concluído em mar/2026, 1 pendente
    await db.insert(employeeTrainingsTable).values([
      {
        employeeId: emp.id,
        title: `Obrigatório A ${ctx.prefix}`,
        status: "concluido",
        requirementId: 999,
        completionDate: "2026-03-10",
      },
      {
        employeeId: emp.id,
        title: `Obrigatório B ${ctx.prefix}`,
        status: "pendente",
        requirementId: 999,
      },
    ]);
    const v = await computeLmsMetric({
      orgId: org,
      metric: "mandatory_coverage",
      year: 2026,
      month: 3,
      database: db,
    });
    expect(v).toBe(50);
  });

  it("hours_per_employee = total horas concluídas / colaboradores ativos", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-hrs" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const emp = await createEmployee(ctx, { name: `Colaborador ${ctx.prefix}` });
    // 1 treinamento concluído com 10 horas em mar/2026
    await db.insert(employeeTrainingsTable).values({
      employeeId: emp.id,
      title: `Treinamento Horas ${ctx.prefix}`,
      status: "concluido",
      workloadHours: 10,
      completionDate: "2026-03-15",
    });
    const v = await computeLmsMetric({
      orgId: org,
      metric: "hours_per_employee",
      year: 2026,
      month: 3,
      database: db,
    });
    // 10 horas / 1 colaborador ativo = 10
    expect(v).toBe(10);
  });

  it("expired_trainings = count de treinamentos vencidos no mês", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-exp" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const emp = await createEmployee(ctx, { name: `Colaborador ${ctx.prefix}` });
    // 1 treinamento vencido em mar/2026 (status != 'concluido')
    await db.insert(employeeTrainingsTable).values({
      employeeId: emp.id,
      title: `Treinamento Vencido ${ctx.prefix}`,
      status: "vencido",
      expirationDate: "2026-03-20",
    });
    const v = await computeLmsMetric({
      orgId: org,
      metric: "expired_trainings",
      year: 2026,
      month: 3,
      database: db,
    });
    expect(v).toBe(1);
  });

  it("critical_gaps = colaboradores com gap crítico (apenas mês corrente)", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-gaps" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    // Cargo com requisito de nível 4 (crítico por requiredLevel >= 4)
    const position = await createPosition(ctx, { name: `Cargo Crítico ${ctx.prefix}` });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Segurança Viária",
      competencyType: "habilidade",
      requiredLevel: 4,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    // Colaborador com o cargo, sem competência registrada (gap = 4, crítico)
    await createEmployee(ctx, {
      name: `Colaborador Gap ${ctx.prefix}`,
      position: position.name,
    });

    // mês corrente → deve retornar 1
    const vCurrent = await computeLmsMetric({
      orgId: org,
      metric: "critical_gaps",
      year: currentYear,
      month: currentMonth,
      database: db,
    });
    expect(vCurrent).toBe(1);

    // mês passado → deve retornar null (snapshot, sem histórico)
    const vPast = await computeLmsMetric({
      orgId: org,
      metric: "critical_gaps",
      year: 2026,
      month: 3,
      database: db,
    });
    expect(vPast).toBeNull();
  });

  it("critical_gaps: colaborador com competência suficiente não conta", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-gaps-ok" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    const position = await createPosition(ctx, { name: `Cargo OK ${ctx.prefix}` });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Comunicação",
      competencyType: "habilidade",
      requiredLevel: 3,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const emp = await createEmployee(ctx, {
      name: `Colaborador OK ${ctx.prefix}`,
      position: position.name,
    });
    // Competência atendida (acquiredLevel >= requiredLevel)
    await db.insert(employeeCompetenciesTable).values({
      employeeId: emp.id,
      name: "Comunicação",
      type: "habilidade",
      acquiredLevel: 3,
    });

    const v = await computeLmsMetric({
      orgId: org,
      metric: "critical_gaps",
      year: currentYear,
      month: currentMonth,
      database: db,
    });
    expect(v).toBe(0);
  });

  it("soma horas fracionadas sem perder os minutos", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-hrs-frac" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const emp = await createEmployee(ctx, { name: `Colaborador ${ctx.prefix}` });
    // 3 treinos de 20 min = ~1 hora, para 1 colaborador ativo
    for (let i = 0; i < 3; i++) {
      await db.insert(employeeTrainingsTable).values({
        employeeId: emp.id,
        title: `Treino de 20 min ${ctx.prefix} ${i}`,
        status: "concluido",
        completionDate: "2026-03-10",
        workloadHours: 0.33,
      });
    }

    const v = await computeLmsMetric({
      orgId: org,
      metric: "hours_per_employee",
      year: 2026,
      month: 3,
      database: db,
    });

    expect(v).toBe(1); // 0.99h / 1 colaborador, arredondado a 1 casa
  });
});
