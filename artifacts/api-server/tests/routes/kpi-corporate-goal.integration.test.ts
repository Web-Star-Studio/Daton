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

async function createLeaf(
  context: TestOrgContext,
  name: string,
  unit: string,
  goal: number,
) {
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/kpi/indicators`)
    .set(authHeader(context))
    .send({
      name,
      measurement: "x",
      formulaVariables: [{ key: "x", label: "X" }],
      formulaExpression: "x",
      unit,
      measureUnit: "un",
      direction: "down",
      periodicity: "monthly",
      norms: [],
      goal,
    });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("KPI corporativo: meta calculada", () => {
  it("soma as metas das filiais e marca isGoalComputed", async () => {
    const context = await createTestContext({ seed: "kpi-corp-goal-sum" });
    contexts.push(context);
    const year = new Date().getFullYear();

    const a = await createLeaf(context, `Acidentes A ${context.prefix}`, "Piracicaba", 1);
    const b = await createLeaf(context, `Acidentes B ${context.prefix}`, "Porto Alegre", 1);

    const corp = await request(app)
      .post(`/api/organizations/${context.organizationId}/kpi/corporate-indicators`)
      .set(authHeader(context))
      .send({
        name: `Acidentes - Corporativo ${context.prefix}`,
        strategy: "sum_values",
        childIndicatorIds: [a, b],
        year,
        measureUnit: "un",
        direction: "down",
        periodicity: "monthly",
        responsibleUserId: context.userId,
      });
    expect(corp.status).toBe(201);
    const corpId = corp.body.indicatorId as number;

    const yearData = await request(app)
      .get(`/api/organizations/${context.organizationId}/kpi/years/${year}`)
      .set(authHeader(context));
    expect(yearData.status).toBe(200);

    const corpRow = yearData.body.find(
      (r: { indicator: { id: number } }) => r.indicator.id === corpId,
    );
    expect(corpRow).toBeTruthy();
    expect(corpRow.yearConfig.goal).toBe(2);
    expect(corpRow.yearConfig.isGoalComputed).toBe(true);

    const leafRow = yearData.body.find(
      (r: { indicator: { id: number } }) => r.indicator.id === a,
    );
    expect(leafRow.yearConfig.goal).toBe(1);
    expect(leafRow.yearConfig.isGoalComputed).toBe(false);
  });

  it("ignora edição manual da meta de um corporativo", async () => {
    const context = await createTestContext({ seed: "kpi-corp-goal-block" });
    contexts.push(context);
    const year = new Date().getFullYear();

    const a = await createLeaf(context, `Av A ${context.prefix}`, "Anápolis", 2);
    const b = await createLeaf(context, `Av B ${context.prefix}`, "Cariacica", 4);

    const corp = await request(app)
      .post(`/api/organizations/${context.organizationId}/kpi/corporate-indicators`)
      .set(authHeader(context))
      .send({
        name: `Av - Corporativo ${context.prefix}`,
        strategy: "average",
        childIndicatorIds: [a, b],
        year,
        measureUnit: "un",
        direction: "down",
        periodicity: "monthly",
        responsibleUserId: context.userId,
      });
    expect(corp.status).toBe(201);
    const corpId = corp.body.indicatorId as number;

    await request(app)
      .put(`/api/organizations/${context.organizationId}/kpi/indicators/${corpId}/years/${year}`)
      .set(authHeader(context))
      .send({ goal: 999 });

    const yearData = await request(app)
      .get(`/api/organizations/${context.organizationId}/kpi/years/${year}`)
      .set(authHeader(context));
    const corpRow = yearData.body.find(
      (r: { indicator: { id: number } }) => r.indicator.id === corpId,
    );
    expect(corpRow.yearConfig.goal).toBe(3);
    expect(corpRow.yearConfig.isGoalComputed).toBe(true);
  });

  it("usa carry-forward das metas dos filhos num ano não aberto", async () => {
    const context = await createTestContext({ seed: "kpi-corp-goal-carry" });
    contexts.push(context);
    const year = new Date().getFullYear();

    const a = await createLeaf(context, `Cf A ${context.prefix}`, "Piracicaba", 1);
    const b = await createLeaf(context, `Cf B ${context.prefix}`, "Porto Alegre", 1);

    const corp = await request(app)
      .post(`/api/organizations/${context.organizationId}/kpi/corporate-indicators`)
      .set(authHeader(context))
      .send({
        name: `Cf - Corporativo ${context.prefix}`,
        strategy: "sum_values",
        childIndicatorIds: [a, b],
        year,
        measureUnit: "un",
        direction: "down",
        periodicity: "monthly",
        responsibleUserId: context.userId,
      });
    expect(corp.status).toBe(201);
    const corpId = corp.body.indicatorId as number;

    // Ano seguinte: ninguém tem config — os filhos herdam a meta (carry-forward)
    // e o corporativo deve agregar essas metas herdadas (não ficar "—").
    const nextYear = year + 1;
    const yearData = await request(app)
      .get(`/api/organizations/${context.organizationId}/kpi/years/${nextYear}`)
      .set(authHeader(context));
    const corpRow = yearData.body.find(
      (r: { indicator: { id: number } }) => r.indicator.id === corpId,
    );
    expect(corpRow.yearConfig.goal).toBe(2);
    expect(corpRow.yearConfig.isGoalComputed).toBe(true);
  });
});
