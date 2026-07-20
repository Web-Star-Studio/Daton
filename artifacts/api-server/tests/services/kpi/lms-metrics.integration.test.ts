import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
  trainingCatalogTable,
  trainingEffectivenessReviewsTable,
  trainingRequirementsTable,
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
      .send({
        year: 2026,
        catalogItemId: cat,
        plannedMonth: 1,
        status: "realizada",
      });
    await request(app)
      .post(`/api/organizations/${org}/annual-program`)
      .set(authHeader(ctx))
      .send({
        year: 2026,
        catalogItemId: cat,
        plannedMonth: 1,
        status: "planejada",
      });
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
    const emp = await createEmployee(ctx, {
      name: `Colaborador ${ctx.prefix}`,
    });
    // insere 2 trainings para o colaborador
    const [t1, t2] = await db
      .insert(employeeTrainingsTable)
      .values([
        {
          employeeId: emp.id,
          title: `Treinamento A ${ctx.prefix}`,
          status: "concluido",
        },
        {
          employeeId: emp.id,
          title: `Treinamento B ${ctx.prefix}`,
          status: "concluido",
        },
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

  // Regressão: a query de eficácia agregava reviews sem olhar o status do
  // treinamento — marcar como NA um treino que já tinha review continuava
  // contando no numerador/denominador. NA nunca é "realizado" (é alcançável
  // marcar NA depois da avaliação, nada impede), então eficácia não se
  // aplica: com 1 treino eficaz de verdade + 1 NA (que carrega uma review
  // antiga não-eficaz), o esperado é 100% — não 50%.
  it("effectiveness_overall ignora review de treino marcado nao_aplicavel", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-eff-na" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const emp = await createEmployee(ctx, {
      name: `Colaborador ${ctx.prefix}`,
    });
    const [t1, t2] = await db
      .insert(employeeTrainingsTable)
      .values([
        {
          employeeId: emp.id,
          title: `Treinamento Eficaz ${ctx.prefix}`,
          status: "concluido",
        },
        {
          employeeId: emp.id,
          title: `Treinamento NA ${ctx.prefix}`,
          status: "nao_aplicavel",
          notApplicableReason: "Não se aplica ao colaborador",
        },
      ])
      .returning({ id: employeeTrainingsTable.id });
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
    expect(v).toBe(100);
  });

  it("mandatory_coverage = concluídos/total com requirementId (%)", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-cov" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const emp = await createEmployee(ctx, {
      name: `Colaborador ${ctx.prefix}`,
    });
    // Obrigatoriedade real: training_requirements aponta p/ um item do catálogo e
    // um cargo (ambos FK notNull). O docker de teste tem a FK
    // employee_trainings_requirement_fk (como a produção), então semeamos de
    // verdade em vez de um id sentinela. mandatory_coverage conta LINHAS com
    // requirementId != null, então os 2 treinos podem apontar p/ o mesmo requisito.
    const position = await createPosition(ctx, { name: `Cargo ${ctx.prefix}` });
    const [catalogItem] = await db
      .insert(trainingCatalogTable)
      .values({ organizationId: org, title: `Obrigatório ${ctx.prefix}` })
      .returning();
    const [requirement] = await db
      .insert(trainingRequirementsTable)
      .values({
        organizationId: org,
        positionId: position.id,
        catalogItemId: catalogItem.id,
      })
      .returning();
    // 2 trainings com requirementId; 1 concluído em mar/2026, 1 pendente
    await db.insert(employeeTrainingsTable).values([
      {
        employeeId: emp.id,
        title: `Obrigatório A ${ctx.prefix}`,
        status: "concluido",
        requirementId: requirement.id,
        completionDate: "2026-03-10",
      },
      {
        employeeId: emp.id,
        title: `Obrigatório B ${ctx.prefix}`,
        status: "pendente",
        requirementId: requirement.id,
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

  // Regressão: o denominador de mandatory_coverage era `count()` cru sobre
  // `requirementId is not null`, sem excluir nao_aplicavel — o numerador
  // (`status = 'concluido'`) já era seguro, mas a obrigatoriedade dispensada
  // continuava pesando no total. Com 3 concluídas + 1 NA, a cobertura travava
  // em 75% e nunca batia 100%, mesmo com todas as obrigatoriedades aplicáveis
  // cumpridas. NA precisa sair do numerador E do denominador.
  it("mandatory_coverage ignora nao_aplicavel no denominador (3 concluídas + 1 NA = 100%, não 75%)", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-cov-na" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const emp = await createEmployee(ctx, {
      name: `Colaborador ${ctx.prefix}`,
    });
    const position = await createPosition(ctx, { name: `Cargo ${ctx.prefix}` });
    const [catalogItem] = await db
      .insert(trainingCatalogTable)
      .values({ organizationId: org, title: `Obrigatório NA ${ctx.prefix}` })
      .returning();
    const [requirement] = await db
      .insert(trainingRequirementsTable)
      .values({
        organizationId: org,
        positionId: position.id,
        catalogItemId: catalogItem.id,
      })
      .returning();
    await db.insert(employeeTrainingsTable).values([
      {
        employeeId: emp.id,
        title: `Obrigatório A ${ctx.prefix}`,
        status: "concluido",
        requirementId: requirement.id,
        completionDate: "2026-03-10",
      },
      {
        employeeId: emp.id,
        title: `Obrigatório B ${ctx.prefix}`,
        status: "concluido",
        requirementId: requirement.id,
        completionDate: "2026-03-10",
      },
      {
        employeeId: emp.id,
        title: `Obrigatório C ${ctx.prefix}`,
        status: "concluido",
        requirementId: requirement.id,
        completionDate: "2026-03-10",
      },
      {
        employeeId: emp.id,
        title: `Obrigatório D NA ${ctx.prefix}`,
        status: "nao_aplicavel",
        requirementId: requirement.id,
        notApplicableReason: "Não se aplica ao colaborador",
      },
    ]);
    const v = await computeLmsMetric({
      orgId: org,
      metric: "mandatory_coverage",
      year: 2026,
      month: 3,
      database: db,
    });
    expect(v).toBe(100);
  });

  it("hours_per_employee = total horas concluídas / colaboradores ativos", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-hrs" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const emp = await createEmployee(ctx, {
      name: `Colaborador ${ctx.prefix}`,
    });
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
    const emp = await createEmployee(ctx, {
      name: `Colaborador ${ctx.prefix}`,
    });
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
    const position = await createPosition(ctx, {
      name: `Cargo Crítico ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Segurança Viária",
      competencyType: "habilidade",
      requiredLevel: 4,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    // Colaborador com o cargo e atestado manual parcial (abaixo do
    // requisito) → gap real e crítico (requiredLevel >= 4). Sem atestado
    // algum e sem item de catálogo classificado o requisito seria
    // "nao_classificado" (ausência de dado), não crítico — ver o teste
    // "indeterminado ≠ crítico" abaixo.
    const empGap = await createEmployee(ctx, {
      name: `Colaborador Gap ${ctx.prefix}`,
      position: position.name,
    });
    await db.insert(employeeCompetenciesTable).values({
      employeeId: empGap.id,
      name: "Segurança Viária",
      type: "habilidade",
      acquiredLevel: 1,
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

  it("critical_gaps: colaborador sem atestado manual e sem catálogo classificado não conta (indeterminado ≠ crítico)", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-gaps-indet" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    // Cargo com requisito de nível 4 — no motor antigo (duplicado), a mera
    // ausência de registro (acquired=0) já contava como "crítico" por
    // requiredLevel >= 4. O resolvedor único distingue: sem atestado manual
    // e sem item de catálogo classificado que comprove a competência, isto
    // é "nao_classificado" (ausência de dado) e o colaborador fica
    // "indeterminado" — NÃO crítico.
    const position = await createPosition(ctx, {
      name: `Cargo Indeterminado ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Direção defensiva",
      competencyType: "habilidade",
      requiredLevel: 4,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    await createEmployee(ctx, {
      name: `Colaborador Indeterminado ${ctx.prefix}`,
      position: position.name,
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

  it("critical_gaps: colaborador com competência suficiente não conta", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-gaps-ok" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    const position = await createPosition(ctx, {
      name: `Cargo OK ${ctx.prefix}`,
    });
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
    const emp = await createEmployee(ctx, {
      name: `Colaborador ${ctx.prefix}`,
    });
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
