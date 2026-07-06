import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, employeeTrainingsTable, trainingEffectivenessReviewsTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  const cs = contexts.splice(0);
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

describe("Effectiveness workflow — B2", () => {
  /**
   * Scenario (a): training with evaluationMethod and no review/assignment
   * shows effectivenessStatus === "pending".
   */
  it("(a) pending — training with evaluationMethod and no review shows status pending", async () => {
    const ctx = await createTestContext({ seed: "eff-wf-a" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, "Filial A");
    const employee = await createEmployee(ctx, { name: "Ana Eficácia", unitId: unit.id });

    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: "Treinamento NR-35",
      status: "concluido",
      completionDate: "2025-03-01",
      evaluationMethod: "prova",
    });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    const item = res.body.data.find((t: { title: string }) => t.title === "Treinamento NR-35");
    expect(item).toBeDefined();
    expect(item.effectivenessStatus).toBe("pending");
  });

  /**
   * Scenarios (b) + (c): full workflow.
   *  (b) POST effectiveness-assignment → status becomes in_review
   *  (c) POST effectiveness-reviews (inherits role) → effective; reviewerCount=1; scorePercent
   */
  it("(b+c) assignment → in_review → review inherits role + reviewerCount + scorePercent", async () => {
    const ctx = await createTestContext({ seed: "eff-wf-bc" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, "Filial BC");
    const employee = await createEmployee(ctx, { name: "Carlos Eficácia", unitId: unit.id });

    // seed a training with evaluationMethod so it starts as "pending"
    const [training] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Treinamento de Segurança",
        status: "concluido",
        completionDate: "2025-04-01",
        evaluationMethod: "observacao",
      })
      .returning();

    const empId = employee.id;
    const trainId = training.id;
    const base = `/api/organizations/${ctx.organizationId}/employees/${empId}/trainings/${trainId}`;
    const dueDate = "2025-06-30";

    // ── (b) POST effectiveness-assignment ────────────────────────────────────
    const assignRes = await request(app)
      .post(`${base}/effectiveness-assignment`)
      .set(authHeader(ctx))
      .send({ evaluatorRole: "gestor", dueDate });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.effectivenessStatus).toBe("in_review");
    expect(assignRes.body.effectivenessAssignedRole).toBe("gestor");
    expect(assignRes.body.effectivenessDueDate).toBe(dueDate);

    // verify via GET list as well
    const listAfterAssign = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings`)
      .set(authHeader(ctx));
    expect(listAfterAssign.status).toBe(200);
    const itemAfterAssign = listAfterAssign.body.data.find(
      (t: { id: number }) => t.id === trainId,
    );
    expect(itemAfterAssign).toBeDefined();
    expect(itemAfterAssign.effectivenessStatus).toBe("in_review");
    expect(itemAfterAssign.effectivenessAssignedRole).toBe("gestor");
    expect(itemAfterAssign.effectivenessDueDate).toBe(dueDate);
    expect(itemAfterAssign.reviewerCount).toBe(0);
    expect(itemAfterAssign.effectivenessScorePercent).toBeNull();

    // ── (c) POST effectiveness-reviews (no evaluatorRole → inherits "gestor") ──
    const score = 7;
    const reviewRes = await request(app)
      .post(`${base}/effectiveness-reviews`)
      .set(authHeader(ctx))
      .send({
        evaluationDate: "2025-05-15",
        isEffective: true,
        score,
      });

    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.evaluatorRole).toBe("gestor"); // inherited from training

    // verify list after review
    const listAfterReview = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings`)
      .set(authHeader(ctx));
    expect(listAfterReview.status).toBe(200);
    const itemAfterReview = listAfterReview.body.data.find(
      (t: { id: number }) => t.id === trainId,
    );
    expect(itemAfterReview).toBeDefined();
    expect(itemAfterReview.effectivenessStatus).toBe("effective");
    expect(itemAfterReview.reviewerCount).toBe(1);
    expect(itemAfterReview.effectivenessScorePercent).toBe(score * 10);
  });

  /**
   * Scenario (d): onTimePercent
   * 2 trainings with verdict + effectivenessDueDate, 1 on time and 1 late
   * → stats.onTimePercent === 50
   */
  it("(d) onTimePercent = 50 when 1 of 2 verdicted+dated trainings is on time", async () => {
    const ctx = await createTestContext({ seed: "eff-wf-d" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, "Filial D");
    const employee = await createEmployee(ctx, { name: "Dora Eficácia", unitId: unit.id });

    // Training 1: dueDate 2025-01-10, reviewed on 2025-01-09 (ON TIME)
    const [t1] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Treinamento D1",
        status: "concluido",
        completionDate: "2025-01-01",
        evaluationMethod: "prova",
        effectivenessDueDate: "2025-01-10",
      })
      .returning();

    // Training 2: dueDate 2025-01-10, reviewed on 2025-01-15 (LATE)
    const [t2] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Treinamento D2",
        status: "concluido",
        completionDate: "2025-01-01",
        evaluationMethod: "prova",
        effectivenessDueDate: "2025-01-10",
      })
      .returning();

    // Insert reviews directly (bypassing the API since we just need the data in the DB)
    await db.insert(trainingEffectivenessReviewsTable).values({
      trainingId: t1.id,
      evaluatorUserId: ctx.userId,
      evaluationDate: "2025-01-09", // on time (before dueDate 2025-01-10)
      isEffective: true,
    });
    await db.insert(trainingEffectivenessReviewsTable).values({
      trainingId: t2.id,
      evaluatorUserId: ctx.userId,
      evaluationDate: "2025-01-15", // late (after dueDate 2025-01-10)
      isEffective: false,
    });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    // 1 of 2 on time → 50%
    expect(res.body.stats.onTimePercent).toBe(50);
  });

  /**
   * Org-scoping: POST effectiveness-assignment must reject trainings from another org.
   */
  it("rejects effectiveness-assignment from another org with 404", async () => {
    const ctx1 = await createTestContext({ seed: "eff-wf-scope1" });
    const ctx2 = await createTestContext({ seed: "eff-wf-scope2" });
    contexts.push(ctx1, ctx2);

    const employee2 = await createEmployee(ctx2, { name: "Outro Org" });
    const [training2] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee2.id,
        title: "Treinamento Outro Org",
        status: "concluido",
      })
      .returning();

    // ctx1 user tries to assign to a training in ctx2's org
    const res = await request(app)
      .post(
        `/api/organizations/${ctx1.organizationId}/employees/${employee2.id}/trainings/${training2.id}/effectiveness-assignment`,
      )
      .set(authHeader(ctx1))
      .send({ evaluatorRole: "gestor", dueDate: "2025-12-31" });

    expect(res.status).toBe(404);
  });
});
