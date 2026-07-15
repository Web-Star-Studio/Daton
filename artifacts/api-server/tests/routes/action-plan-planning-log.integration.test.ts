import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  actionPlanActivityLogTable,
  actionPlansTable,
  db,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
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
  it("records the whole block, before and after, when the tratativas change", async () => {
    const context = await createTestContext({ seed: "plan-log-5w2h" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${planId}`,
      )
      .set(authHeader(context))
      .send({
        analyses: [{ key: "five_whys", data: { whys: ["Falta de treinamento"] } }],
        rootCause: "Falta de treinamento.",
      })
      .expect(200);

    const [entry] = await planningEntries(planId);
    const planning = (
      entry.changes as { fields: { planning: { from: unknown; to: unknown } } }
    ).fields.planning;

    expect(planning.from).toEqual({
      rootCause: null,
      analyses: null,
    });
    expect(planning.to).toEqual({
      rootCause: "Falta de treinamento.",
      analyses: [{ key: "five_whys", data: { whys: ["Falta de treinamento"] } }],
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
   * changes both the status and the tratativas would record only the status — and
   * the block's version would disappear.
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
      .send({
        status: "in_progress",
        analyses: [{ key: "five_whys", data: { whys: ["Treinar"] } }],
      })
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

  /**
   * The PATCH persists the block after normalizing it, and `planningChanged`
   * compares normalized blocks. So a save that only pads an existing value with
   * whitespace must (a) store the trimmed, canonical form and (b) record no
   * planning entry — because, normalized, nothing actually changed. Writing the
   * raw value here would persist a change that no log entry ever captures.
   */
  it("normalizes on write, so a whitespace-only change stores the trimmed value and logs nothing", async () => {
    const context = await createTestContext({ seed: "plan-log-whitespace" });
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

    await patch({ rootCause: "Causa raiz" });
    expect(await planningEntries(planId)).toHaveLength(1);

    await patch({ rootCause: "  Causa raiz  " });

    // (a) The DB holds the canonical, trimmed form.
    const [row] = await db
      .select()
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, planId));
    expect(row.rootCause).toBe("Causa raiz");

    // (b) No new planning entry — normalized, the block is unchanged.
    expect(await planningEntries(planId)).toHaveLength(1);
  });

  it("logs exactly one planning entry when the content genuinely changed", async () => {
    const context = await createTestContext({ seed: "plan-log-realchange" });
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

    await patch({ rootCause: "Causa raiz" });
    await patch({ rootCause: "Causa raiz revisada" });

    const entries = await planningEntries(planId);
    expect(entries).toHaveLength(2);
    const planning = (
      entries[0].changes as { fields: { planning: { to: unknown } } }
    ).fields.planning;
    expect(planning.to).toMatchObject({ rootCause: "Causa raiz revisada" });
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

/**
 * A plan can be BORN with a planning block (the POST accepts rootCause / analyses,
 * and a plan derived from a nonconformity inherits its rootCause). The `created`
 * snapshot does not carry the block, so without a dedicated `updated` entry the
 * initial state would live only in the `from` of the FIRST later edit — and
 * restore reads only `to`. The initial state would therefore be irrecoverable.
 */
describe("planning version log at creation", () => {
  function createViaApi(
    context: TestOrgContext,
    body: Record<string, unknown>,
  ) {
    return request(app)
      .post(`/api/organizations/${context.organizationId}/action-plans`)
      .set(authHeader(context))
      .send({ sourceModule: "manual", sourceRef: {}, title: "Plano", ...body });
  }

  async function allEntries(planId: number) {
    return db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId))
      .orderBy(asc(actionPlanActivityLogTable.id));
  }

  it("records the initial block as a restorable version when the plan is born with content", async () => {
    const context = await createTestContext({ seed: "plan-create-content" });
    contexts.push(context);

    const created = await createViaApi(context, {
      analyses: [{ key: "five_whys", data: { whys: ["Sem instrutor"] } }],
      rootCause: "Falta de treinamento.",
    }).expect(201);
    const planId = created.body.id as number;

    const entries = await allEntries(planId);
    // The `created` snapshot stays untouched; a second `updated` entry carries the block.
    expect(entries[0].action).toBe("created");
    expect((entries[0].changes as { kind?: string }).kind).toBe("snapshot");

    const planning = await planningEntries(planId);
    expect(planning).toHaveLength(1);
    const block = (
      planning[0].changes as {
        fields: { planning: { from: unknown; to: unknown } };
      }
    ).fields.planning;

    expect(block.from).toEqual({
      rootCause: null,
      analyses: null,
    });
    expect(block.to).toEqual({
      rootCause: "Falta de treinamento.",
      analyses: [{ key: "five_whys", data: { whys: ["Sem instrutor"] } }],
    });
  });

  it("does not record a planning version when the plan is born empty", async () => {
    const context = await createTestContext({ seed: "plan-create-empty" });
    contexts.push(context);

    const created = await createViaApi(context, { priority: "high" }).expect(
      201,
    );
    const planId = created.body.id as number;

    // Only the `created` snapshot — no phantom planning version.
    const entries = await allEntries(planId);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("created");
    expect(await planningEntries(planId)).toHaveLength(0);
  });

  it("restores the initial version after a later edit, bringing the born content back", async () => {
    const context = await createTestContext({ seed: "plan-create-restore" });
    contexts.push(context);

    const created = await createViaApi(context, {
      analyses: [{ key: "five_whys", data: { whys: ["Inicial"] } }],
      rootCause: "Causa inicial",
    }).expect(201);
    const planId = created.body.id as number;

    // The initial version is the sole planning entry so far.
    const [initial] = await planningEntries(planId);

    // A later edit moves the block on.
    await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/action-plans/${planId}`,
      )
      .set(authHeader(context))
      .send({
        analyses: [{ key: "five_whys", data: { whys: ["Editado"] } }],
        rootCause: "Causa editada",
      })
      .expect(200);

    // Restoring the initial version brings the born content back.
    const response = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/action-plans/${planId}/planning/restore`,
      )
      .set(authHeader(context))
      .send({ activityId: initial.id })
      .expect(200);

    expect(response.body.analyses).toEqual([
      { key: "five_whys", data: { whys: ["Inicial"] } },
    ]);
    expect(response.body.rootCause).toBe("Causa inicial");
  });
});
