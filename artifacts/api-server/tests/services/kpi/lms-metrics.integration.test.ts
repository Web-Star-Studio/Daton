import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeTrainingsTable,
  trainingEffectivenessReviewsTable,
} from "@workspace/db";
import app from "../../../src/app";
import { computeLmsMetric } from "../../../src/services/kpi/lms-metrics";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
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
});
