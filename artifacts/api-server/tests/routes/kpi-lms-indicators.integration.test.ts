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
