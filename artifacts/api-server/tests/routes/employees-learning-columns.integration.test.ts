import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
} from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  const cs = contexts.splice(0);
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

describe("GET /organizations/:orgId/employees — learning columns", () => {
  it("returns trainingCompletionPercent and competencyGapStatus per employee", async () => {
    const ctx = await createTestContext({ seed: "emp-learning-cols" });
    contexts.push(ctx);

    // ── 1. Seed unit ─────────────────────────────────────────────────────────
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);

    // ── 2. Seed position with 2 competency requirements ───────────────────────
    //   req1: requiredLevel=5 → critical (requiredLevel >= 4)
    //   req2: requiredLevel=2 → non-critical unless gapLevel >= 2
    const position = await createPosition(ctx, { name: "Motorista" });

    await db.insert(positionCompetencyRequirementsTable).values([
      {
        positionId: position.id,
        competencyName: "Direção defensiva",
        competencyType: "habilidade",
        requiredLevel: 5,
        sortOrder: 1,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
      {
        positionId: position.id,
        competencyName: "Primeiros socorros",
        competencyType: "habilidade",
        requiredLevel: 2,
        sortOrder: 2,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
    ]);

    // ── 3. Seed employee with position="Motorista" ────────────────────────────
    const employee = await createEmployee(ctx, {
      name: `João Motorista ${ctx.prefix}`,
      unitId: unit.id,
      position: "Motorista",
    });

    // ── 4. Seed 1 employee_competency: acquiredLevel=2 for req1 ──────────────
    //   gapLevel = 5 - 2 = 3 ≥ 2 → critical
    await db.insert(employeeCompetenciesTable).values({
      employeeId: employee.id,
      name: "Direção defensiva",
      type: "habilidade",
      requiredLevel: 5,
      acquiredLevel: 2,
    });

    // ── 5. Seed 2 mandatory trainings ────────────────────────────────────────
    //   requirementId != null means "mandatory"
    //   1 concluido (past completionDate) + 1 pendente
    //   → trainingCompletionPercent = 1/2 * 100 = 50.0
    await db.insert(employeeTrainingsTable).values([
      {
        employeeId: employee.id,
        title: "NR-35 Trabalho em Altura",
        status: "concluido",
        completionDate: "2025-01-15",
        requirementId: 9999, // non-null = mandatory
      },
      {
        employeeId: employee.id,
        title: "Combate a incêndio",
        status: "pendente",
        requirementId: 9998, // non-null = mandatory
      },
    ]);

    // ── 6. Seed a second employee WITHOUT requirements and WITHOUT trainings ───
    const employeeOk = await createEmployee(ctx, {
      name: `Ana Sem Requisitos ${ctx.prefix}`,
      unitId: unit.id,
      // no position → no competency requirements
    });

    // ── 7. Call GET /organizations/:orgId/employees ───────────────────────────
    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);

    const data: Array<{
      id: number;
      trainingCompletionPercent: number | null;
      competencyGapStatus: "ok" | "gap" | "critical";
    }> = res.body.data;

    // ── 8. Assertions for the employee with gaps and trainings ────────────────
    const motorista = data.find((e) => e.id === employee.id);
    expect(motorista).toBeDefined();
    expect(motorista!.trainingCompletionPercent).toBe(50);
    expect(motorista!.competencyGapStatus).toBe("critical");

    // ── 9. Assertions for the employee without requirements/trainings ─────────
    const semRequisitos = data.find((e) => e.id === employeeOk.id);
    expect(semRequisitos).toBeDefined();
    expect(semRequisitos!.trainingCompletionPercent).toBeNull();
    expect(semRequisitos!.competencyGapStatus).toBe("ok");
  });

  it('returns competencyGapStatus "gap" for a non-critical gap (gapLevel=1, requiredLevel<4)', async () => {
    const ctx = await createTestContext({ seed: "emp-gap-noncrit" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, `Filial Gap ${ctx.prefix}`);

    // Position with requiredLevel=2: gap is non-critical when acquiredLevel=1
    // (gapLevel=1 < 2, requiredLevel=2 < 4 → NOT critical → "gap")
    const position = await createPosition(ctx, { name: "Auxiliar" });

    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Trabalho em equipe",
      competencyType: "habilidade",
      requiredLevel: 2,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const employee = await createEmployee(ctx, {
      name: `Auxiliar Gap ${ctx.prefix}`,
      unitId: unit.id,
      position: "Auxiliar",
    });

    // acquiredLevel=1, requiredLevel=2 → gapLevel=1 (non-critical)
    await db.insert(employeeCompetenciesTable).values({
      employeeId: employee.id,
      name: "Trabalho em equipe",
      type: "habilidade",
      requiredLevel: 2,
      acquiredLevel: 1,
    });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);

    const data: Array<{
      id: number;
      trainingCompletionPercent: number | null;
      competencyGapStatus: "ok" | "gap" | "critical";
    }> = res.body.data;

    const gapEmployee = data.find((e) => e.id === employee.id);
    expect(gapEmployee).toBeDefined();
    expect(gapEmployee!.competencyGapStatus).toBe("gap");
    expect(gapEmployee!.trainingCompletionPercent).toBeNull();
  });
});
