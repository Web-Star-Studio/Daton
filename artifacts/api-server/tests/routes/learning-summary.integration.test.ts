import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, employeeTrainingsTable, trainingCatalogTable, trainingEffectivenessReviewsTable, annualTrainingProgramTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createUnit,
  createEmployee,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  const cs = contexts.splice(0);
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

describe("GET /organizations/:orgId/learning/summary", () => {
  it("retorna shape completo com arrays e cards numéricos/null", async () => {
    const ctx = await createTestContext({ seed: "lrn-summary-shape" });
    contexts.push(ctx);

    // 1. Seed unit
    const unit = await createUnit(ctx, "Filial SP");

    // 2. Seed employee in that unit
    const employee = await createEmployee(ctx, {
      name: "João Aprendiz",
      unitId: unit.id,
    });

    // 3. Seed catalog item with a norm
    const [catalog] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: ctx.organizationId,
        title: "NR-35 Trabalho em altura",
        norm: "NR-35",
      })
      .returning({ id: trainingCatalogTable.id });

    // 4. Seed a PAT item (planejada)
    await db.insert(annualTrainingProgramTable).values({
      organizationId: ctx.organizationId,
      year: 2026,
      catalogItemId: catalog.id,
      unitId: unit.id,
      plannedMonth: 1,
      status: "planejada",
    });

    // 5. Seed a completed training (for pendingEffectiveness — no review)
    const [training] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "NR-35",
        status: "concluido",
        completionDate: "2026-01-15",
        catalogItemId: catalog.id,
      })
      .returning({ id: employeeTrainingsTable.id });

    // 6. Seed an expired training (no completion)
    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: "Primeiros Socorros",
      status: "pendente",
      expirationDate: "2025-12-31",
    });

    // 7. Seed an effectiveness review for some training (for byNorm)
    await db.insert(trainingEffectivenessReviewsTable).values({
      trainingId: training.id,
      evaluatorUserId: ctx.userId,
      evaluationDate: "2026-01-20",
      isEffective: true,
    });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/learning/summary?year=2026`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);

    const body = res.body;

    // cards shape
    expect(body).toHaveProperty("cards");
    expect(body.cards).toHaveProperty("patCompletion");
    expect(body.cards).toHaveProperty("effectiveness");
    expect(body.cards).toHaveProperty("criticalGaps");
    expect(body.cards).toHaveProperty("expiredTrainings");
    // values are either number or null
    for (const key of ["patCompletion", "effectiveness", "criticalGaps", "expiredTrainings"]) {
      const val = body.cards[key];
      expect(val === null || typeof val === "number").toBe(true);
    }

    // array fields
    expect(Array.isArray(body.byUnit)).toBe(true);
    expect(Array.isArray(body.byNorm)).toBe(true);
    expect(Array.isArray(body.expired)).toBe(true);
    expect(Array.isArray(body.pendingEffectiveness)).toBe(true);

    // byUnit has the seeded unit
    const unitRow = body.byUnit.find(
      (u: { unitId: number }) => u.unitId === unit.id,
    );
    expect(unitRow).toBeDefined();
    expect(unitRow.unitName).toBe("Filial SP");
    expect(typeof unitRow.completion === "number" || unitRow.completion === null).toBe(true);
    expect(["ok", "atencao", "critico", "sem-dados"].includes(unitRow.status)).toBe(true);

    // byNorm should contain NR-35 (training with catalog that has norm, with an effectiveness review)
    const normRow = body.byNorm.find((n: { norm: string }) => n.norm === "NR-35");
    expect(normRow).toBeDefined();
    expect(typeof normRow.effectiveness === "number" || normRow.effectiveness === null).toBe(true);

    // expired should contain the expired training
    expect(body.expired.length).toBeGreaterThan(0);
    const expiredRow = body.expired.find(
      (e: { title: string }) => e.title === "Primeiros Socorros",
    );
    expect(expiredRow).toBeDefined();
    expect(expiredRow.employeeName).toBe("João Aprendiz");

    // pendingEffectiveness: training #1 has a review so it should NOT appear here.
    // Just assert the array structure for this case; the dedicated test below covers the notExists path.
    for (const row of body.pendingEffectiveness) {
      expect(typeof row.employeeName).toBe("string");
      expect(typeof row.title).toBe("string");
    }
    const pendingForReviewed = body.pendingEffectiveness.find(
      (r: { title: string }) => r.title === "NR-35",
    );
    expect(pendingForReviewed).toBeUndefined();
  });

  it("pendingEffectiveness inclui treinamentos concluídos sem review de eficácia", async () => {
    const ctx = await createTestContext({ seed: "lrn-pending-eff" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, "Filial Pending");
    const employee = await createEmployee(ctx, {
      name: "Maria Pendente",
      unitId: unit.id,
    });

    // Training A — concluído COM review (não deve aparecer em pendingEffectiveness)
    const [trainingWithReview] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Treinamento Com Avaliação",
        status: "concluido",
        completionDate: "2026-03-10",
      })
      .returning({ id: employeeTrainingsTable.id });

    await db.insert(trainingEffectivenessReviewsTable).values({
      trainingId: trainingWithReview.id,
      evaluatorUserId: ctx.userId,
      evaluationDate: "2026-03-20",
      isEffective: true,
    });

    // Training B — concluído SEM review (deve aparecer em pendingEffectiveness)
    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: "Treinamento Sem Avaliação",
      status: "concluido",
      completionDate: "2026-04-01",
    });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/learning/summary?year=2026`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);

    const pending: Array<{ employeeName: string; title: string }> =
      res.body.pendingEffectiveness;

    // Training B (sem review) deve estar presente
    const pendingB = pending.find((r) => r.title === "Treinamento Sem Avaliação");
    expect(pendingB).toBeDefined();
    expect(pendingB?.employeeName).toBe("Maria Pendente");

    // Training A (com review) NÃO deve estar presente
    const pendingA = pending.find((r) => r.title === "Treinamento Com Avaliação");
    expect(pendingA).toBeUndefined();
  });

  it("rejeita orgId diferente do token (403)", async () => {
    const ctx = await createTestContext({ seed: "lrn-summary-403" });
    contexts.push(ctx);

    const res = await request(app)
      .get(`/api/organizations/99999/learning/summary?year=2026`)
      .set(authHeader(ctx));

    expect(res.status).toBe(403);
  });

  it("filtra por unitId quando passado", async () => {
    const ctx = await createTestContext({ seed: "lrn-summary-unit-filter" });
    contexts.push(ctx);

    const unitA = await createUnit(ctx, "Filial A");
    const unitB = await createUnit(ctx, "Filial B");

    // Seed training in unitB employee
    const empB = await createEmployee(ctx, { name: "Ana B", unitId: unitB.id });
    await db.insert(employeeTrainingsTable).values({
      employeeId: empB.id,
      title: "Treino B",
      status: "pendente",
      expirationDate: "2025-01-01",
    });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/learning/summary?year=2026&unitId=${unitA.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    // expired should only have trainings from unitA employees (none seeded for unitA)
    const expiredFromB = res.body.expired.find(
      (e: { employeeName: string }) => e.employeeName === "Ana B",
    );
    expect(expiredFromB).toBeUndefined();
  });
});
