import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { annualTrainingProgramTable, db, kpiIndicatorsTable, trainingCatalogTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  const cs = contexts.splice(0);
  for (const c of cs) {
    await db
      .delete(kpiIndicatorsTable)
      .where(eq(kpiIndicatorsTable.organizationId, c.organizationId));
  }
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

describe("POST /organizations/:orgId/kpi/lms-indicators/activate", () => {
  it("ativa 6 indicadores LMS de forma idempotente", async () => {
    const ctx = await createTestContext({ seed: "lms-activate" });
    contexts.push(ctx);
    const url = `/api/organizations/${ctx.organizationId}/kpi/lms-indicators/activate`;

    const first = await request(app)
      .post(url)
      .set(authHeader(ctx))
      .send({ year: 2026 });

    expect(first.status).toBe(200);
    expect(first.body.activated).toBe(6);
    expect(Array.isArray(first.body.indicatorIds)).toBe(true);
    expect(first.body.indicatorIds).toHaveLength(6);

    const second = await request(app)
      .post(url)
      .set(authHeader(ctx))
      .send({ year: 2026 });

    expect(second.status).toBe(200);
    expect(second.body.activated).toBe(0);
    expect(second.body.indicatorIds).toHaveLength(6);
    // All IDs should be the same as the first call
    expect(second.body.indicatorIds.sort()).toEqual(first.body.indicatorIds.sort());
  });

  it("rejeita orgId diferente do token", async () => {
    const ctx = await createTestContext({ seed: "lms-activate-other-org" });
    contexts.push(ctx);
    const url = `/api/organizations/99999/kpi/lms-indicators/activate`;

    const res = await request(app)
      .post(url)
      .set(authHeader(ctx))
      .send({ year: 2026 });

    expect(res.status).toBe(403);
  });
});

describe("Desvio LMS → plano de ação (integração)", () => {
  it("célula materializada do PAT pode ser vinculada a um plano de ação via sourceModule=kpi", async () => {
    const ctx = await createTestContext({ seed: "lms-action-plan" });
    contexts.push(ctx);

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // 1. Activate LMS indicators for the current year
    const activateRes = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/kpi/lms-indicators/activate`)
      .set(authHeader(ctx))
      .send({ year: currentYear });
    expect(activateRes.status).toBe(200);
    const indicatorIds: number[] = activateRes.body.indicatorIds;

    // 2. Create a training catalog item (required FK for PAT entries)
    const [catalog] = await db
      .insert(trainingCatalogTable)
      .values({ organizationId: ctx.organizationId, title: "Treinamento PAT Desvio" })
      .returning({ id: trainingCatalogTable.id });

    // 3. Seed PAT items for the current month: 1 realizada + 1 planejada → 50%
    await db.insert(annualTrainingProgramTable).values([
      { organizationId: ctx.organizationId, year: currentYear, catalogItemId: catalog.id, plannedMonth: currentMonth, status: "realizada" },
      { organizationId: ctx.organizationId, year: currentYear, catalogItemId: catalog.id, plannedMonth: currentMonth, status: "planejada" },
    ]);

    // 4. GET the year KPI data (this materializes the cell via compose-on-read)
    const yearRes = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/years/${currentYear}`)
      .set(authHeader(ctx));
    expect(yearRes.status).toBe(200);

    // 5. Find the pat_completion indicator
    type KpiRow = { indicator: { id: number; name: string }; monthlyValues: Array<{ month: number; value: number | null; monthlyValueId: number | null }> };
    const patEntry = (yearRes.body as KpiRow[]).find((row) => row.indicator.name === "% Cumprimento do PAT");
    expect(patEntry).toBeDefined();

    // 6. Assert current-month cell is materialized (monthlyValueId > 0)
    const monthCell = patEntry!.monthlyValues.find((c) => c.month === currentMonth);
    expect(monthCell).toBeDefined();
    expect(monthCell!.value).toBeCloseTo(50, 0);
    expect(monthCell!.monthlyValueId).not.toBeNull();
    expect(monthCell!.monthlyValueId).toBeGreaterThan(0);

    const cellId = monthCell!.monthlyValueId!;
    const indicatorId = patEntry!.indicator.id;

    // 7. Create a plano de ação referencing the materialized LMS cell
    const createRes = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({
        sourceModule: "kpi",
        sourceRef: {
          kpiMonthlyValueId: cellId,
          kpiIndicatorId: indicatorId,
          kpiYear: currentYear,
          kpiMonth: currentMonth,
        },
        title: "Corrigir desvio PAT — cumprimento abaixo da meta",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeGreaterThan(0);

    // 8. Query back: the plan must appear when filtered by the cell id
    const listRes = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .query({ sourceModule: "kpi", sourceKpiMonthlyValueId: cellId });
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThanOrEqual(1);
    const found = (listRes.body as Array<{ id: number; sourceRef: { kpiMonthlyValueId?: number } }>)
      .find((p) => p.id === createRes.body.id);
    expect(found).toBeDefined();
    expect(found!.sourceRef.kpiMonthlyValueId).toBe(cellId);

    // Ensure the indicator ids set is a superset of what the test used
    expect(indicatorIds).toContain(indicatorId);
  });
});

describe("GET /organizations/:orgId/kpi/years/:year — LMS compose-on-read", () => {
  it("materializa célula de Janeiro com pat_completion=50 quando metade das atividades PAT realizadas", async () => {
    const ctx = await createTestContext({ seed: "lms-onread" });
    contexts.push(ctx);

    // 1. Activate LMS indicators for 2026 (creates indicator + yearConfig)
    const activateRes = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/kpi/lms-indicators/activate`)
      .set(authHeader(ctx))
      .send({ year: 2026 });
    expect(activateRes.status).toBe(200);

    // 2. Create a training catalog item (required FK for PAT entries)
    const [catalog] = await db
      .insert(trainingCatalogTable)
      .values({ organizationId: ctx.organizationId, title: "Treinamento Teste LMS" })
      .returning({ id: trainingCatalogTable.id });

    // 3. Seed 2 PAT items for January 2026: 1 realizada + 1 planejada → 50%
    await db.insert(annualTrainingProgramTable).values([
      { organizationId: ctx.organizationId, year: 2026, catalogItemId: catalog.id, plannedMonth: 1, status: "realizada" },
      { organizationId: ctx.organizationId, year: 2026, catalogItemId: catalog.id, plannedMonth: 1, status: "planejada" },
    ]);

    // 4. GET the year 2026 KPI data
    const yearRes = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/years/2026`)
      .set(authHeader(ctx));
    expect(yearRes.status).toBe(200);

    // 5. Find the pat_completion indicator by name
    const patEntry = (yearRes.body as Array<{ indicator: { name: string }; monthlyValues: Array<{ month: number; value: number | null; monthlyValueId: number | null }> }>)
      .find((row) => row.indicator.name === "% Cumprimento do PAT");
    expect(patEntry).toBeDefined();

    // 6. Assert January cell: value ≈ 50 and monthlyValueId is a real persisted row (not null)
    const janCell = patEntry!.monthlyValues.find((c) => c.month === 1);
    expect(janCell).toBeDefined();
    expect(janCell!.value).toBeCloseTo(50, 0);
    expect(janCell!.monthlyValueId).not.toBeNull();
    expect(janCell!.monthlyValueId).toBeGreaterThan(0);
  });
});
