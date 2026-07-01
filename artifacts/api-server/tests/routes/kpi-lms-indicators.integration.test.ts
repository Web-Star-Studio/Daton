import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, kpiIndicatorsTable } from "@workspace/db";
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
