import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  actionPlanActivityLogTable,
  actionPlansTable,
  db,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
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

async function planningEntries(planId: number) {
  const rows = await db
    .select()
    .from(actionPlanActivityLogTable)
    .where(eq(actionPlanActivityLogTable.actionPlanId, planId))
    .orderBy(desc(actionPlanActivityLogTable.id));
  return rows.filter((row) => {
    const changes = row.changes as {
      kind?: string;
      fields?: Record<string, unknown>;
    } | null;
    return changes?.kind === "diff" && changes.fields?.planning !== undefined;
  });
}

describe("planning version log", () => {
  it("records the whole block, before and after, when the 5W2H changes", async () => {
    const context = await createTestContext({ seed: "plan-log-5w2h" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${planId}`,
      )
      .set(authHeader(context))
      .send({
        plan5w2h: { what: "Treinar" },
        rootCause: "Falta de treinamento.",
      })
      .expect(200);

    const [entry] = await planningEntries(planId);
    const planning = (
      entry.changes as { fields: { planning: { from: unknown; to: unknown } } }
    ).fields.planning;

    expect(planning.from).toEqual({
      plan5w2h: null,
      rootCause: null,
      rootCauseWhys: null,
    });
    expect(planning.to).toEqual({
      plan5w2h: { what: "Treinar" },
      rootCause: "Falta de treinamento.",
      rootCauseWhys: null,
    });
  });

  it("does not record planning when the save did not touch the block", async () => {
    const context = await createTestContext({ seed: "plan-log-untouched" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${planId}`,
      )
      .set(authHeader(context))
      .send({ priority: "high" })
      .expect(200);

    expect(await planningEntries(planId)).toHaveLength(0);
  });

  /**
   * The log is prioritized: an if/else writes ONE entry per save, and the buildDiff
   * branch is only reached in the else. Without a dedicated entry, a save that
   * changes both the status and the 5W2H would record only the status — and the
   * block's version would disappear.
   */
  it("records planning even when the same save also changed the status", async () => {
    const context = await createTestContext({ seed: "plan-log-with-status" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${planId}`,
      )
      .set(authHeader(context))
      .send({ status: "in_progress", plan5w2h: { what: "Treinar" } })
      .expect(200);

    const entries = await planningEntries(planId);
    expect(entries).toHaveLength(1);

    const all = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(
        and(
          eq(actionPlanActivityLogTable.actionPlanId, planId),
          eq(actionPlanActivityLogTable.action, "status_changed"),
        ),
      );
    expect(all).toHaveLength(1);
  });

  it("stops logging rootCause as a loose field", async () => {
    const context = await createTestContext({ seed: "plan-log-rootcause" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${planId}`,
      )
      .set(authHeader(context))
      .send({ rootCause: "Nova causa" })
      .expect(200);

    const rows = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId));
    const loose = rows.filter((row) => {
      const changes = row.changes as {
        fields?: Record<string, unknown>;
      } | null;
      return changes?.fields?.rootCause !== undefined;
    });

    expect(loose).toHaveLength(0);
    expect(await planningEntries(planId)).toHaveLength(1);
  });
});
