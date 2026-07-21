import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, actionPlanAnalysisMethodsTable } from "@workspace/db";
import app from "../../artifacts/api-server/src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../support/backend";
import { ensureAnalysisMethods } from "../../artifacts/api-server/src/services/action-plans/analysis-methods";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => cleanupTestContext(context)));
});

describe("catálogo de tratativas", () => {
  it("semeia as 8 tratativas, com 5 Porquês como o único padrão", async () => {
    const context = await createTestContext({ seed: "analysis-methods-seed" });
    contexts.push(context);

    await ensureAnalysisMethods(context.organizationId);

    const rows = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(eq(actionPlanAnalysisMethodsTable.organizationId, context.organizationId));

    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.active)).toBe(true);
    const defaults = rows.filter((r) => r.isDefault).map((r) => r.key);
    expect(defaults).toEqual(["five_whys"]);
  });

  it("é idempotente — rodar duas vezes não duplica", async () => {
    const context = await createTestContext({ seed: "analysis-methods-idempotent" });
    contexts.push(context);

    await ensureAnalysisMethods(context.organizationId);
    await ensureAnalysisMethods(context.organizationId);

    const rows = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(eq(actionPlanAnalysisMethodsTable.organizationId, context.organizationId));
    expect(rows).toHaveLength(8);
  });

  it("GET semeia preguiçosamente (org que nunca passou pelo backfill não vê lista vazia)", async () => {
    const context = await createTestContext({ seed: "analysis-methods-lazy-seed" });
    contexts.push(context);

    const res = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plan-analysis-methods`)
      .set(authHeader(context));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
  });

  it("PATCH exige org_admin — operator leva 403", async () => {
    const context = await createTestContext({ seed: "analysis-methods-gate" });
    contexts.push(context);
    await ensureAnalysisMethods(context.organizationId);
    const [method] = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(eq(actionPlanAnalysisMethodsTable.organizationId, context.organizationId));

    const operator = await createTestUser(context, { role: "operator", suffix: "operador" });
    const res = await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plan-analysis-methods/${method.id}`)
      .set(authHeader(operator))
      .send({ active: false });

    expect(res.status).toBe(403);
  });

  it("desativar uma tratativa marcada como padrão desmarca o padrão junto", async () => {
    const context = await createTestContext({ seed: "analysis-methods-unset-default" });
    contexts.push(context);
    await ensureAnalysisMethods(context.organizationId);
    const [fiveWhys] = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(and(
        eq(actionPlanAnalysisMethodsTable.organizationId, context.organizationId),
        eq(actionPlanAnalysisMethodsTable.key, "five_whys"),
      ));

    const res = await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plan-analysis-methods/${fiveWhys.id}`)
      .set(authHeader(context))
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(res.body.isDefault).toBe(false);
  });
});
