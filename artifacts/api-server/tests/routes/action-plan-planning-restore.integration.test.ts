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

    await patch({
      analyses: [{ key: "five_whys", data: { whys: ["Versão A"] } }],
      rootCause: "Causa A",
    });
    const versionA = await lastPlanningActivityId(planId);
    await patch({
      analyses: [{ key: "five_whys", data: { whys: ["Versão B"] } }],
      rootCause: "Causa B",
    });

    const response = await restore(context, planId, versionA).expect(200);
    expect(response.body.analyses).toEqual([
      { key: "five_whys", data: { whys: ["Versão A"] } },
    ]);
    expect(response.body.rootCause).toBe("Causa A");

    const [row] = await db
      .select()
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, planId));
    expect(row.analyses).toEqual([
      { key: "five_whys", data: { whys: ["Versão A"] } },
    ]);
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

    await patch({ analyses: [{ key: "five_whys", data: { whys: ["Versão A"] } }] });
    const versionA = await lastPlanningActivityId(planId);
    await patch({ analyses: [{ key: "five_whys", data: { whys: ["Versão B"] } }] });

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
      analyses: [{ key: "five_whys", data: { whys: ["Versão B"] } }],
    });
    expect(changes.fields.planning.to).toMatchObject({
      analyses: [{ key: "five_whys", data: { whys: ["Versão A"] } }],
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
      .send({ analyses: [{ key: "five_whys", data: { whys: ["Única"] } }] })
      .expect(200);
    const version = await lastPlanningActivityId(planId);

    const before = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId));
    const [planBefore] = await db
      .select()
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, planId));

    await restore(context, planId, version).expect(200);

    const after = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId));
    expect(after.length).toBe(before.length);

    // The no-op branch (routes/action-plans.ts, restore handler) must return
    // before reaching the `db.update(...)` that stamps `updatedAt: new Date()`.
    // If that early return were ever removed, this row's timestamp would move
    // even though nothing about the plan actually changed.
    const [planAfter] = await db
      .select()
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, planId));
    expect(planAfter.updatedAt).toEqual(planBefore.updatedAt);
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
      .send({ analyses: [{ key: "five_whys", data: { whys: ["De outro plano"] } }] })
      .expect(200);
    const foreign = await lastPlanningActivityId(otherPlanId);

    await restore(context, planId, foreign).expect(404);
  });

  it("404s for an activityId that belongs to another organization's plan, leaving the caller's plan untouched", async () => {
    const contextA = await createTestContext({ seed: "restore-cross-org-a" });
    contexts.push(contextA);
    const contextB = await createTestContext({ seed: "restore-cross-org-b" });
    contexts.push(contextB);

    const planA = await createPlan(contextA.organizationId);
    const planB = await createPlan(contextB.organizationId);

    // Generate a planning entry that lives entirely under organization B.
    await request(app)
      .patch(
        `/api/organizations/${contextB.organizationId}/action-plans/${planB}`,
      )
      .set(authHeader(contextB))
      .send({ analyses: [{ key: "five_whys", data: { whys: ["Plano da organização B"] } }] })
      .expect(200);
    const foreignOrgActivityId = await lastPlanningActivityId(planB);

    const [planABefore] = await db
      .select()
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, planA));

    // Authenticated as organization A, targeting organization A's own plan,
    // but pointing at an activityId that only exists under organization B.
    await restore(contextA, planA, foreignOrgActivityId).expect(404);

    const [planAAfter] = await db
      .select()
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, planA));
    expect(planAAfter.analyses).toBeNull();
    expect(planAAfter.rootCause).toBeNull();
    expect(planAAfter.updatedAt).toEqual(planABefore.updatedAt);
  });

  it("404s for an activityId whose actionPlanId matches but whose organizationId doesn't (defense in depth)", async () => {
    // This isolates the `organizationId` clause of the restore query from the
    // `actionPlanId` clause: it crafts a log row that already points at the
    // caller's own plan (so the actionPlanId match alone would let it through)
    // but is stamped with a foreign organizationId — something the write path
    // never produces today, but the read-side query must still reject on its
    // own, in case that invariant is ever broken by a future change.
    const contextA = await createTestContext({ seed: "restore-cross-org-strict-a" });
    contexts.push(contextA);
    const contextB = await createTestContext({ seed: "restore-cross-org-strict-b" });
    contexts.push(contextB);

    const planA = await createPlan(contextA.organizationId);

    const [mismatchedEntry] = await db
      .insert(actionPlanActivityLogTable)
      .values({
        organizationId: contextB.organizationId,
        actionPlanId: planA,
        action: "updated",
        changes: {
          kind: "diff",
          fields: {
            planning: {
              from: { rootCause: null, analyses: null },
              to: {
                rootCause: "Causa indevida",
                analyses: [{ key: "five_whys", data: { whys: ["Conteúdo indevido"] } }],
              },
            },
          },
        },
      })
      .returning({ id: actionPlanActivityLogTable.id });

    const [planABefore] = await db
      .select()
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, planA));

    await restore(contextA, planA, mismatchedEntry.id).expect(404);

    const [planAAfter] = await db
      .select()
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, planA));
    expect(planAAfter.analyses).toBeNull();
    expect(planAAfter.rootCause).toBeNull();
    expect(planAAfter.updatedAt).toEqual(planABefore.updatedAt);
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

  it("400s (not 500) when the org/plan ids are not integers", async () => {
    // requirePlanAccess() lets non-integer ids fall through on purpose, so the
    // handler itself must reject them before any query — otherwise NaN reaches
    // Drizzle and Postgres 500s instead of the 400 the sibling routes return.
    const context = await createTestContext({ seed: "restore-bad-params" });
    contexts.push(context);

    await request(app)
      .post("/api/organizations/foo/action-plans/bar/planning/restore")
      .set(authHeader(context))
      .send({ activityId: 1 })
      .expect(400);
  });

  /**
   * The handler must validate the body with Zod, not `Number()`. `Number(true) === 1`
   * and `Number([7]) === 7`, so a malformed `activityId` used to coerce to a real id
   * and restore the WRONG version instead of being rejected.
   */
  it("400s (not a silent restore) when activityId is a boolean", async () => {
    const context = await createTestContext({ seed: "restore-body-bool" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/action-plans/${planId}/planning/restore`,
      )
      .set(authHeader(context))
      .send({ activityId: true })
      .expect(400);
  });

  it("400s when activityId is an array", async () => {
    const context = await createTestContext({ seed: "restore-body-array" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/action-plans/${planId}/planning/restore`,
      )
      .set(authHeader(context))
      .send({ activityId: [7] })
      .expect(400);
  });

  it("400s when activityId is missing", async () => {
    const context = await createTestContext({ seed: "restore-body-missing" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/action-plans/${planId}/planning/restore`,
      )
      .set(authHeader(context))
      .send({})
      .expect(400);
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
      .send({ analyses: [{ key: "five_whys", data: { whys: ["Versão A"] } }] })
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
