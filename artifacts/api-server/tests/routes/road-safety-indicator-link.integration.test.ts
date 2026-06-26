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

async function createIndicator(context: TestOrgContext, name: string) {
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/kpi/indicators`)
    .set(authHeader(context))
    .send({
      name,
      measurement: "x",
      formulaVariables: [{ key: "x", label: "X" }],
      formulaExpression: "x",
      unit: "Corporativo",
      measureUnit: "un",
      direction: "down",
      periodicity: "monthly",
      norms: [],
      goal: 10,
    });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("Road safety: vínculo com indicador (KPI)", () => {
  it("cria fator vinculado e força monitoringForm=indicator", async () => {
    const context = await createTestContext({ seed: "rs-link-create" });
    contexts.push(context);
    const indId = await createIndicator(context, `Idade veículos ${context.prefix}`);

    const res = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
      .set(authHeader(context))
      .send({ type: "intermediate", name: "Idade dos veículos", kpiIndicatorId: indId });

    expect(res.status).toBe(201);
    expect(res.body.kpiIndicatorId).toBe(indId);
    expect(res.body.monitoringForm).toBe("indicator");
  });

  it("rejeita vínculo a indicador de outra organização", async () => {
    const context = await createTestContext({ seed: "rs-link-org-a" });
    contexts.push(context);
    const other = await createTestContext({ seed: "rs-link-org-b" });
    contexts.push(other);
    const foreignInd = await createIndicator(other, `Estranho ${other.prefix}`);

    const res = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
      .set(authHeader(context))
      .send({ type: "intermediate", name: "X", kpiIndicatorId: foreignInd });

    expect(res.status).toBe(400);
  });

  it("PATCH vincula e desvincula", async () => {
    const context = await createTestContext({ seed: "rs-link-patch" });
    contexts.push(context);
    const indId = await createIndicator(context, `Ind ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
      .set(authHeader(context))
      .send({ type: "intermediate", name: "Y" });
    const factorId = created.body.id as number;

    const linked = await request(app)
      .patch(`/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`)
      .set(authHeader(context))
      .send({ kpiIndicatorId: indId });
    expect(linked.status).toBe(200);
    expect(linked.body.kpiIndicatorId).toBe(indId);
    expect(linked.body.monitoringForm).toBe("indicator");

    const unlinked = await request(app)
      .patch(`/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`)
      .set(authHeader(context))
      .send({ kpiIndicatorId: null });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.kpiIndicatorId).toBeNull();
  });

  it("bloqueia lançamento manual em fator vinculado (409)", async () => {
    const context = await createTestContext({ seed: "rs-link-block" });
    contexts.push(context);
    const indId = await createIndicator(context, `Ind ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
      .set(authHeader(context))
      .send({ type: "intermediate", name: "Z", kpiIndicatorId: indId });
    const factorId = created.body.id as number;

    const res = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/measurements`)
      .set(authHeader(context))
      .send({ value: 5, referenceDate: "2026-01-31" });
    expect(res.status).toBe(409);
  });
});
