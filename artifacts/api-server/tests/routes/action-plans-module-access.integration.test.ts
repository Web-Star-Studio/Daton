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
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

/**
 * The hub (`/planos-acao`) is gated by the `actionPlans` module, but the
 * "Ações vinculadas" widget embedded in KPI/SWOT/governança/... screens reads the
 * same list endpoint scoped by `sourceModule`. Access there follows the ORIGIN
 * module, so granting `kpi` alone keeps the RAC flow intact.
 */
describe("action plans module access", () => {
  it("denies the hub listing to a non-admin without the actionPlans module", async () => {
    const context = await createTestContext({
      seed: "ap-hub-denied",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Sem acesso");
  });

  it("denies the hub summary to a non-admin without the actionPlans module", async () => {
    const context = await createTestContext({
      seed: "ap-summary-denied",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/summary`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
  });

  it("denies the external-actions bridge to a non-admin without the actionPlans module", async () => {
    const context = await createTestContext({
      seed: "ap-external-denied",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/action-plans/external-actions`,
      )
      .set(authHeader(context));

    expect(response.status).toBe(403);
  });

  it("allows the embedded widget to read plans scoped to a module the user owns", async () => {
    const context = await createTestContext({
      seed: "ap-embed-kpi",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .query({ sourceModule: "rac" })
      .set(authHeader(context));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("denies a scoped read when the user lacks the origin module", async () => {
    const context = await createTestContext({
      seed: "ap-embed-foreign",
      role: "operator",
      modules: ["kpi"],
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .query({ sourceModule: "swot" })
      .set(authHeader(context));

    expect(response.status).toBe(403);
  });

  it("allows the full hub to a non-admin holding the actionPlans module", async () => {
    const context = await createTestContext({
      seed: "ap-hub-granted",
      role: "operator",
      modules: ["actionPlans"],
    });
    contexts.push(context);

    const listing = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .set(authHeader(context));
    expect(listing.status).toBe(200);

    const summary = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/summary`)
      .set(authHeader(context));
    expect(summary.status).toBe(200);
  });

  it("keeps the hub open to org admins without explicit module rows", async () => {
    const context = await createTestContext({
      seed: "ap-hub-admin",
      role: "org_admin",
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
  });
});
