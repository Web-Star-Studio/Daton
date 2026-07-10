import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  actionPlanActivityLogTable,
  actionPlansTable,
  db,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

async function createPlan(organizationId: number): Promise<number> {
  const [plan] = await db
    .insert(actionPlansTable)
    .values({
      organizationId,
      sourceModule: "manual",
      sourceRef: {},
      title: "Plano",
    })
    .returning({ id: actionPlansTable.id });
  return plan.id;
}

async function lastPlanningActivityId(planId: number): Promise<number> {
  const rows = await db
    .select()
    .from(actionPlanActivityLogTable)
    .where(eq(actionPlanActivityLogTable.actionPlanId, planId))
    .orderBy(desc(actionPlanActivityLogTable.id));
  const entry = rows.find((row) => {
    const changes = row.changes as { fields?: Record<string, unknown> } | null;
    return changes?.fields?.planning !== undefined;
  });
  if (!entry) throw new Error("nenhuma entrada de planejamento");
  return entry.id;
}

function restore(context: TestOrgContext, planId: number, activityId: number) {
  return request(app)
    .post(
      `/api/organizations/${context.organizationId}/action-plans/${planId}/planning/restore`,
    )
    .set(authHeader(context))
    .send({ activityId });
}

describe("restore planning version", () => {
  it("puts the block back exactly as the chosen version recorded it", async () => {
    const context = await createTestContext({ seed: "restore-happy" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);
    const patch = (body: object) =>
      request(app)
        .patch(
          `/api/organizations/${context.organizationId}/action-plans/${planId}`,
        )
        .set(authHeader(context))
        .send(body)
        .expect(200);

    await patch({ plan5w2h: { what: "Versão A" }, rootCause: "Causa A" });
    const versionA = await lastPlanningActivityId(planId);
    await patch({ plan5w2h: { what: "Versão B" }, rootCause: "Causa B" });

    const response = await restore(context, planId, versionA).expect(200);
    expect(response.body.plan5w2h).toEqual({ what: "Versão A" });
    expect(response.body.rootCause).toBe("Causa A");

    const [row] = await db
      .select()
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, planId));
    expect(row.plan5w2h).toEqual({ what: "Versão A" });
  });

  it("logs the restore, referencing the version it came from", async () => {
    const context = await createTestContext({ seed: "restore-logs" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);
    const patch = (body: object) =>
      request(app)
        .patch(
          `/api/organizations/${context.organizationId}/action-plans/${planId}`,
        )
        .set(authHeader(context))
        .send(body)
        .expect(200);

    await patch({ plan5w2h: { what: "Versão A" } });
    const versionA = await lastPlanningActivityId(planId);
    await patch({ plan5w2h: { what: "Versão B" } });

    await restore(context, planId, versionA).expect(200);

    const rows = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId))
      .orderBy(desc(actionPlanActivityLogTable.id));
    const changes = rows[0].changes as {
      fields: { planning: { from: unknown; to: unknown } };
      restoredFrom?: { activityId: number };
    };

    expect(changes.restoredFrom?.activityId).toBe(versionA);
    expect(changes.fields.planning.from).toMatchObject({
      plan5w2h: { what: "Versão B" },
    });
    expect(changes.fields.planning.to).toMatchObject({
      plan5w2h: { what: "Versão A" },
    });
  });

  it("is a no-op when the chosen version equals the current content", async () => {
    const context = await createTestContext({ seed: "restore-noop" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${planId}`,
      )
      .set(authHeader(context))
      .send({ plan5w2h: { what: "Única" } })
      .expect(200);
    const version = await lastPlanningActivityId(planId);

    const before = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId));

    await restore(context, planId, version).expect(200);

    const after = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId));
    expect(after.length).toBe(before.length);
  });

  it("404s for an activity id that belongs to another plan", async () => {
    const context = await createTestContext({ seed: "restore-foreign" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);
    const otherPlanId = await createPlan(context.organizationId);

    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${otherPlanId}`,
      )
      .set(authHeader(context))
      .send({ plan5w2h: { what: "De outro plano" } })
      .expect(200);
    const foreign = await lastPlanningActivityId(otherPlanId);

    await restore(context, planId, foreign).expect(404);
  });

  it("404s for an entry that carries no planning block", async () => {
    const context = await createTestContext({ seed: "restore-legacy" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${planId}`,
      )
      .set(authHeader(context))
      .send({ priority: "high" })
      .expect(200);

    const rows = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId))
      .orderBy(desc(actionPlanActivityLogTable.id));

    await restore(context, planId, rows[0].id).expect(404);
  });

  it("409s on a closed plan and 403s for a read-only analyst", async () => {
    const context = await createTestContext({ seed: "restore-guards" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${planId}`,
      )
      .set(authHeader(context))
      .send({ plan5w2h: { what: "Versão A" } })
      .expect(200);
    const version = await lastPlanningActivityId(planId);

    const analyst = await createTestUser(context, {
      role: "analyst",
      suffix: "leitor",
    });
    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/action-plans/${planId}/planning/restore`,
      )
      .set({ Authorization: `Bearer ${analyst.token}` })
      .send({ activityId: version })
      .expect(403);

    await db
      .update(actionPlansTable)
      .set({ status: "completed", effectivenessResult: "effective" })
      .where(eq(actionPlansTable.id, planId));

    await restore(context, planId, version).expect(409);
  });
});
