/**
 * T1 — escopo `needs_evaluation` + condições SQL das colunas do board de eficácia.
 *
 * Valida que o query param `scope` filtra corretamente os treinamentos:
 *   scope=needs_evaluation → apenas os que têm avaliação configurada ou review
 *   scope=all (ou omitido)  → todos (comportamento existente, sem quebra)
 */

import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeTrainingsTable,
  trainingEffectivenessReviewsTable,
} from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  createTestUser,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  const cs = contexts.splice(0);
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

describe("Board de eficácia — T1: scope=needs_evaluation", () => {
  /**
   * Seeds 4 completed trainings and verifies:
   *   - scope=needs_evaluation  → returns (a)(b)(c) only (not d)
   *   - scope=all               → returns all 4
   *   - no scope param          → returns all 4 (default=all, backward-compat)
   */
  it("filters correctly: needs_evaluation excludes trainings with no evaluation config", async () => {
    const ctx = await createTestContext({ seed: "board-t1" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, "Filial Board T1");
    const employee = await createEmployee(ctx, {
      name: "Colaborador Board T1",
      unitId: unit.id,
    });

    // We need a userId to insert a review (evaluatorUserId FK)
    const evaluatorUser = await createTestUser(ctx, { suffix: "evaluator" });

    // (a) — has a training_effectiveness_review → concluída / in-scope
    const [trainingA] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Board T1 - (a) com review",
        status: "concluido",
        completionDate: "2025-01-10",
      })
      .returning();

    await db.insert(trainingEffectivenessReviewsTable).values({
      trainingId: trainingA.id,
      evaluatorUserId: evaluatorUser.id,
      evaluationDate: "2025-02-01",
      isEffective: true,
    });

    // (b) — effectivenessAssignedRole set → em avaliação / in-scope
    const [trainingB] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Board T1 - (b) com assigned_role",
        status: "concluido",
        completionDate: "2025-01-10",
        effectivenessAssignedRole: "gestor",
      })
      .returning();

    // (c) — evaluationMethod set, no review, no assignment → pendente / in-scope
    const [trainingC] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Board T1 - (c) com evaluationMethod",
        status: "concluido",
        completionDate: "2025-01-10",
        evaluationMethod: "Prova",
      })
      .returning();

    // (d) — no evaluationMethod, no targetCompetencyName, no assignment, no review → OUT of scope
    const [trainingD] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Board T1 - (d) sem config eficácia",
        status: "concluido",
        completionDate: "2025-01-10",
      })
      .returning();

    const base = `/api/organizations/${ctx.organizationId}/employees/trainings`;

    // ── needs_evaluation: must return a, b, c but NOT d ───────────────────────
    const resScope = await request(app)
      .get(`${base}?status=concluido&scope=needs_evaluation&pageSize=100`)
      .set(authHeader(ctx));

    expect(resScope.status).toBe(200);
    const scopeIds: number[] = resScope.body.data.map(
      (t: { id: number }) => t.id,
    );
    expect(scopeIds).toContain(trainingA.id);
    expect(scopeIds).toContain(trainingB.id);
    expect(scopeIds).toContain(trainingC.id);
    expect(scopeIds).not.toContain(trainingD.id);

    // ── scope=all: must return all 4 ─────────────────────────────────────────
    const resAll = await request(app)
      .get(`${base}?status=concluido&scope=all&pageSize=100`)
      .set(authHeader(ctx));

    expect(resAll.status).toBe(200);
    const allIds: number[] = resAll.body.data.map((t: { id: number }) => t.id);
    expect(allIds).toContain(trainingA.id);
    expect(allIds).toContain(trainingB.id);
    expect(allIds).toContain(trainingC.id);
    expect(allIds).toContain(trainingD.id);

    // ── no scope (omitted) must also return all 4 (default=all) ──────────────
    const resNoScope = await request(app)
      .get(`${base}?status=concluido&pageSize=100`)
      .set(authHeader(ctx));

    expect(resNoScope.status).toBe(200);
    const noScopeIds: number[] = resNoScope.body.data.map(
      (t: { id: number }) => t.id,
    );
    expect(noScopeIds).toContain(trainingA.id);
    expect(noScopeIds).toContain(trainingB.id);
    expect(noScopeIds).toContain(trainingC.id);
    expect(noScopeIds).toContain(trainingD.id);
  });

  it("rejects invalid scope values with 400", async () => {
    const ctx = await createTestContext({ seed: "board-t1-invalid" });
    contexts.push(ctx);

    const res = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?scope=invalid_value`,
      )
      .set(authHeader(ctx));

    expect(res.status).toBe(400);
  });
});
