/**
 * T1 — escopo `needs_evaluation` + condições SQL das colunas do board de eficácia.
 * T2 — paginação SQL real + stats agregadas + filtros (year/norm/evaluatorRole/boardColumn).
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
  trainingCatalogTable,
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

  it("#115: string vazia em evaluationMethod/targetCompetencyName conta como ausente (SQL alinhado ao JS)", async () => {
    const ctx = await createTestContext({ seed: "board-t1-empty" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, "Filial Board T1 Empty");
    const employee = await createEmployee(ctx, {
      name: "Colaborador Board T1 Empty",
      unitId: unit.id,
    });

    // (e) evaluationMethod = '' → deve ser tratado como AUSENTE (fora de escopo +
    //     effectivenessStatus null), exatamente como o JS getEffectivenessStatus.
    const [emptyMethod] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Board T1 - (e) evaluationMethod vazio",
        status: "concluido",
        completionDate: "2025-01-10",
        evaluationMethod: "",
      })
      .returning();

    // (f) targetCompetencyName = '' → idem
    const [emptyTarget] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Board T1 - (f) targetCompetencyName vazio",
        status: "concluido",
        completionDate: "2025-01-10",
        targetCompetencyName: "",
      })
      .returning();

    // (g) evaluationMethod real → controle: em escopo + pending
    const [realMethod] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Board T1 - (g) evaluationMethod real",
        status: "concluido",
        completionDate: "2025-01-10",
        evaluationMethod: "Prova",
      })
      .returning();

    const base = `/api/organizations/${ctx.organizationId}/employees/trainings`;

    // SQL (scope=needs_evaluation): string vazia NÃO entra; a real entra.
    const resScope = await request(app)
      .get(`${base}?status=concluido&scope=needs_evaluation&pageSize=100`)
      .set(authHeader(ctx));
    expect(resScope.status).toBe(200);
    const scopeIds: number[] = resScope.body.data.map(
      (t: { id: number }) => t.id,
    );
    expect(scopeIds).toContain(realMethod.id);
    expect(scopeIds).not.toContain(emptyMethod.id);
    expect(scopeIds).not.toContain(emptyTarget.id);

    // JS (effectivenessStatus): string vazia → null; a real → pending. Iguais ao SQL.
    const resAll = await request(app)
      .get(`${base}?status=concluido&scope=all&pageSize=100`)
      .set(authHeader(ctx));
    expect(resAll.status).toBe(200);
    const statusById = new Map<number, string | null>(
      resAll.body.data.map(
        (t: { id: number; effectivenessStatus: string | null }) => [
          t.id,
          t.effectivenessStatus,
        ],
      ),
    );
    expect(statusById.get(emptyMethod.id)).toBeNull();
    expect(statusById.get(emptyTarget.id)).toBeNull();
    expect(statusById.get(realMethod.id)).toBe("pending");
  });

  it("#115: treino só-com-prazo (effectivenessDueDate) fica no needs_evaluation + status in_review (SQL×JS)", async () => {
    const ctx = await createTestContext({ seed: "board-t1-duedate" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, "Filial Board T1 DueDate");
    const employee = await createEmployee(ctx, {
      name: "Colaborador Board T1 DueDate",
      unitId: unit.id,
    });

    // (h) só effectivenessDueDate (sem assignedRole, sem review, sem critério):
    //     getEffectivenessStatus → in_review (por prazo). scope=needs_evaluation
    //     deve INCLUIR o treino — antes o escopo SQL o excluía (divergência #115).
    const [dueDateOnly] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: "Board T1 - (h) só prazo de eficácia",
        status: "concluido",
        completionDate: "2025-01-10",
        effectivenessDueDate: "2025-06-01",
      })
      .returning();

    const base = `/api/organizations/${ctx.organizationId}/employees/trainings`;
    const res = await request(app)
      .get(`${base}?status=concluido&scope=needs_evaluation&pageSize=100`)
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    const item = res.body.data.find(
      (t: { id: number; effectivenessStatus: string | null }) =>
        t.id === dueDateOnly.id,
    );
    // SQL (scope) inclui o treino; JS (status) o classifica in_review — alinhados.
    expect(item).toBeDefined();
    expect(item.effectivenessStatus).toBe("in_review");
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

// ─────────────────────────────────────────────────────────────────────────────
// T2 — paginação SQL real + stats agregadas + filtros
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seed layout (all status=concluido):
 *   A  completionDate=2024-03-15  effectivenessAssignedRole=null  effectivenessDueDate=null  evaluationMethod=null
 *      → 2 reviews: rev1(2024-04-01 isEffective=false), rev2(2024-05-01 isEffective=true)
 *      → boardConcluidas, effectivenessStatus=effective (latest=true)  → eficaz
 *   B  completionDate=2024-03-15  effectivenessAssignedRole=gestor  effectivenessDueDate=2024-04-30
 *      → no reviews  → boardEmAvaliacao, effectivenessStatus=in_review
 *   C  completionDate=2024-03-15  effectivenessAssignedRole=rh  effectivenessDueDate=2024-04-30
 *      → no reviews  → boardEmAvaliacao, effectivenessStatus=in_review
 *   D  completionDate=2024-03-15  effectivenessAssignedRole=null  effectivenessDueDate=null  evaluationMethod=Prova
 *      → no reviews  → boardPendentes, effectivenessStatus=pending
 *   E  completionDate=2025-06-01  catalogItemId=<ISO 9001 catalog>  effectivenessAssignedRole=null
 *      → 1 review (2025-07-01 isEffective=false)
 *      → boardConcluidas, effectivenessStatus=ineffective  → naoEficaz, year=2025, norm=ISO 9001
 *   F  completionDate=2025-06-15  effectivenessAssignedRole=instrutor  effectivenessDueDate=null
 *      → no reviews  → boardEmAvaliacao, year=2025
 *
 * boardCounts: pendentes=1(D), emAvaliacao=3(B,C,F), concluidas=2(A,E)
 * eficazes=1(A)  naoEficazes=1(E)
 */
describe("Board de eficácia — T2: paginação SQL + stats agregadas + filtros", () => {
  it("boardColumn=em_avaliacao paginates correctly and stats.boardCounts reflect full set", async () => {
    const ctx = await createTestContext({ seed: "board-t2-main" });
    contexts.push(ctx);

    const { base, trainingIds } = await seedT2(ctx);

    // Page 1 of em_avaliacao (pageSize=2) — should return 2 rows, all in_review
    const res = await request(app)
      .get(`${base}?boardColumn=em_avaliacao&pageSize=2&page=1&scope=needs_evaluation`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    for (const t of res.body.data) {
      expect(t.effectivenessStatus).toBe("in_review");
    }
    // pagination.total = full count of em_avaliacao column (3: B,C,F)
    expect(res.body.pagination.total).toBe(3);

    // stats.boardCounts cover the full set (all 6), independent of page
    const bc = res.body.stats.boardCounts;
    expect(bc.pendentes).toBe(1);
    expect(bc.emAvaliacao).toBe(3);
    expect(bc.concluidas).toBe(2);

    void trainingIds; // used in other tests
  });

  it("boardColumn=concluidas returns only concluidas and pagination.total=2", async () => {
    const ctx = await createTestContext({ seed: "board-t2-concluidas" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?boardColumn=concluidas&pageSize=5&page=1&scope=needs_evaluation`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    for (const t of res.body.data) {
      expect(["effective", "ineffective"]).toContain(t.effectivenessStatus);
    }
  });

  it("stats.eficazes and stats.naoEficazes respect the latest review per training", async () => {
    const ctx = await createTestContext({ seed: "board-t2-eficaz" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?scope=needs_evaluation&pageSize=100`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    // A has 2 reviews; latest (evaluationDate=2024-05-01) isEffective=true → eficaz
    // E has 1 review; isEffective=false → naoEficaz
    expect(res.body.stats.eficazes).toBe(1);
    expect(res.body.stats.naoEficazes).toBe(1);
    expect(res.body.stats.eficazPercent).toBe(50);
  });

  it("filter year=2025 reduces set to only 2025 trainings", async () => {
    const ctx = await createTestContext({ seed: "board-t2-year" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?year=2025&pageSize=100`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    // E and F have completionDate in 2025
    expect(res.body.pagination.total).toBe(2);
    for (const t of res.body.data) {
      expect(t.completionDate).toMatch(/^2025-/);
    }
  });

  it("filter year=2024 reduces set to only 2024 trainings", async () => {
    const ctx = await createTestContext({ seed: "board-t2-year2024" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?year=2024&pageSize=100`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    // A, B, C, D have completionDate in 2024
    expect(res.body.pagination.total).toBe(4);
  });

  it("filter norm=ISO 9001 returns only training E", async () => {
    const ctx = await createTestContext({ seed: "board-t2-norm" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?norm=ISO+9001&pageSize=100`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
  });

  it("filter evaluatorRole=gestor returns only training B", async () => {
    const ctx = await createTestContext({ seed: "board-t2-role" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?evaluatorRole=gestor&pageSize=100`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
  });

  it("employeeId filter still works (backward compat with minha-area)", async () => {
    const ctx = await createTestContext({ seed: "board-t2-empid" });
    contexts.push(ctx);

    const { base, employeeId } = await seedT2(ctx);

    // Create a second employee with a training that should NOT appear
    const unit2 = await createUnit(ctx, "Filial B T2-empid");
    const emp2 = await createEmployee(ctx, { name: "Colaborador B T2-empid", unitId: unit2.id });
    await db.insert(employeeTrainingsTable).values({
      employeeId: emp2.id,
      title: "Outro colaborador T2",
      status: "concluido",
      completionDate: "2024-01-01",
    });

    const res = await request(app)
      .get(`${base}?employeeId=${employeeId}&pageSize=100`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    // Only the 6 seeded trainings for the main employee
    expect(res.body.pagination.total).toBe(6);
    for (const t of res.body.data) {
      expect(t.employeeId).toBe(employeeId);
    }
  });

  it("pagination page 2 of em_avaliacao returns 1 item (3 total, pageSize=2)", async () => {
    const ctx = await createTestContext({ seed: "board-t2-page2" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?boardColumn=em_avaliacao&pageSize=2&page=2&scope=needs_evaluation`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.page).toBe(2);
  });

  it("stats.boardCounts independent of boardColumn page filter", async () => {
    const ctx = await createTestContext({ seed: "board-t2-indep" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    // Request with boardColumn=em_avaliacao&pageSize=1 → only 1 row returned
    const res = await request(app)
      .get(`${base}?boardColumn=em_avaliacao&pageSize=1&page=1&scope=needs_evaluation`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    // But boardCounts must reflect the FULL set (all 6 trainings), not just this page
    const bc = res.body.stats.boardCounts;
    expect(bc.pendentes).toBe(1);
    expect(bc.emAvaliacao).toBe(3);
    expect(bc.concluidas).toBe(2);
  });

  it("stats.onTimePercent reflects aggregate over full set (1 of 2 on time = 50%)", async () => {
    // Seeds 2 concluded trainings (each with a review) that also have effectivenessDueDate:
    //   G — evaluationDate=2024-03-01 <= effectivenessDueDate=2024-03-15 → on time
    //   H — evaluationDate=2024-05-01 >  effectivenessDueDate=2024-04-30 → late
    // Expected: onTimePercent = 50 (1 of 2).
    // Also verified with pageSize=1 to prove the stat comes from the aggregate, not the page.
    const ctx = await createTestContext({ seed: "board-t2-ontime" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, `Filial T2-ontime ${ctx.prefix}`);
    const employee = await createEmployee(ctx, {
      name: `Colaborador T2-ontime ${ctx.prefix}`,
      unitId: unit.id,
    });
    const evaluatorUser = await createTestUser(ctx, { suffix: "eval-ontime" });

    // G — on time: evaluationDate (2024-03-01) <= effectivenessDueDate (2024-03-15)
    const [trainingG] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `T2-G ontime ${ctx.prefix}`,
        status: "concluido",
        completionDate: "2024-01-10",
        effectivenessDueDate: "2024-03-15",
      })
      .returning();

    await db.insert(trainingEffectivenessReviewsTable).values({
      trainingId: trainingG.id,
      evaluatorUserId: evaluatorUser.id,
      evaluationDate: "2024-03-01",
      isEffective: true,
    });

    // H — late: evaluationDate (2024-05-01) > effectivenessDueDate (2024-04-30)
    const [trainingH] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `T2-H late ${ctx.prefix}`,
        status: "concluido",
        completionDate: "2024-02-10",
        effectivenessDueDate: "2024-04-30",
      })
      .returning();

    await db.insert(trainingEffectivenessReviewsTable).values({
      trainingId: trainingH.id,
      evaluatorUserId: evaluatorUser.id,
      evaluationDate: "2024-05-01",
      isEffective: false,
    });

    const base = `/api/organizations/${ctx.organizationId}/employees/trainings`;

    // pageSize=100 — baseline check
    const res100 = await request(app)
      .get(`${base}?scope=needs_evaluation&pageSize=100`)
      .set(authHeader(ctx));

    expect(res100.status).toBe(200);
    expect(res100.body.stats.onTimePercent).toBe(50);

    // pageSize=1 — must return the same aggregate stat even though only 1 row is on the page
    const res1 = await request(app)
      .get(`${base}?scope=needs_evaluation&pageSize=1&page=1`)
      .set(authHeader(ctx));

    expect(res1.status).toBe(200);
    expect(res1.body.data.length).toBe(1);
    expect(res1.body.stats.onTimePercent).toBe(50);

    void trainingG; // used above
    void trainingH; // used above
  });

  it("stats.eficazes and stats.naoEficazes are independent of page size (aggregate, not page)", async () => {
    // Uses the standard T2 seed: eficazes=1 (A), naoEficazes=1 (E), 6 total rows.
    // With pageSize=1 only 1 row is returned, but stats must still reflect the full set.
    const ctx = await createTestContext({ seed: "board-t2-eficaz-page" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?scope=needs_evaluation&pageSize=1&page=1`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    // Stats must reflect the full filtered set (A=eficaz, E=naoEficaz), not just the 1-row page
    expect(res.body.stats.eficazes).toBe(1);
    expect(res.body.stats.naoEficazes).toBe(1);
    expect(res.body.stats.eficazPercent).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — effectivenessStatus e expiringWithinDays em SQL (paginação correta)
// Verifica que filtros antes do LIMIT garantem pagination.total correto.
// ─────────────────────────────────────────────────────────────────────────────

describe("Board de eficácia — T3: effectivenessStatus e expiringWithinDays em SQL", () => {
  /**
   * Usa o seed T2 (6 treinamentos).
   * D é o único "pending" (evaluationMethod=Prova, sem review/assignedRole/dueDate).
   * Testa: effectivenessStatus=pending com pageSize=2 → ≤2 linhas, todos pending,
   *   pagination.total = 1 (contagem real de pending, não total do conjunto).
   */
  it("effectivenessStatus=pending: pagination.total = contagem real de pending", async () => {
    const ctx = await createTestContext({ seed: "board-t3-pending" });
    contexts.push(ctx);

    const { base } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?effectivenessStatus=pending&pageSize=2&page=1`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    for (const t of res.body.data) {
      expect(t.effectivenessStatus).toBe("pending");
    }
    // Apenas D é pending no seed T2 → total deve ser 1, não 6
    expect(res.body.pagination.total).toBe(1);
  });

  /**
   * Usa o seed T2.
   * A tem 2 reviews: a mais antiga (2024-04-01) isEffective=false,
   *   a mais recente (2024-05-01) isEffective=true → effectivenessStatus=effective.
   * E tem 1 review: isEffective=false → effectivenessStatus=ineffective.
   * Filtrando effectivenessStatus=effective: apenas A deve aparecer,
   *   provando que o filtro usa a review MAIS RECENTE.
   */
  it("effectivenessStatus=effective: retorna apenas trainings com latest review effective", async () => {
    const ctx = await createTestContext({ seed: "board-t3-effective" });
    contexts.push(ctx);

    const { base, trainingIds } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?effectivenessStatus=effective&pageSize=100`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data.length).toBe(1);
    // A aparece (latest=true); E NÃO aparece (only review=false)
    expect(res.body.data[0].id).toBe(trainingIds.trainingA);
    expect(res.body.data[0].effectivenessStatus).toBe("effective");
  });

  /**
   * Usa o seed T2.
   * E tem 1 review: isEffective=false → ineffective.
   * A tem 2 reviews: a mais recente isEffective=true → NÃO é ineffective.
   */
  it("effectivenessStatus=ineffective: retorna apenas trainings com latest review ineffective", async () => {
    const ctx = await createTestContext({ seed: "board-t3-ineffective" });
    contexts.push(ctx);

    const { base, trainingIds } = await seedT2(ctx);

    const res = await request(app)
      .get(`${base}?effectivenessStatus=ineffective&pageSize=100`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data[0].id).toBe(trainingIds.trainingE);
    expect(res.body.data[0].effectivenessStatus).toBe("ineffective");
  });

  /**
   * expiringWithinDays=30: apenas treinamentos com expirationDate
   * entre hoje e hoje+30 dias, paginados corretamente.
   * Seed:
   *   P1 — expirationDate = hoje+10d → dentro do prazo ✓
   *   P2 — expirationDate = hoje+60d → fora do prazo ✗
   *   P3 — expirationDate = ontem     → já vencido ✗
   *   P4 — sem expirationDate          → excluído ✗
   * Espera: pagination.total=1, pageSize=5 retorna apenas P1.
   */
  it("expiringWithinDays=30: pagination.total = apenas trainings dentro do prazo", async () => {
    const ctx = await createTestContext({ seed: "board-t3-expiring" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, `Filial T3-exp ${ctx.prefix}`);
    const employee = await createEmployee(ctx, {
      name: `Colaborador T3-exp ${ctx.prefix}`,
      unitId: unit.id,
    });

    const in10d = new Date(Date.now() + 10 * 86400000)
      .toISOString()
      .split("T")[0];
    const in60d = new Date(Date.now() + 60 * 86400000)
      .toISOString()
      .split("T")[0];
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0];

    // P1 — vence em 10 dias → dentro de 30 dias ✓
    const [trainingP1] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `T3-P1 expiring ${ctx.prefix}`,
        status: "concluido",
        completionDate: "2024-01-01",
        expirationDate: in10d,
      })
      .returning();

    // P2 — vence em 60 dias → fora do horizonte de 30 dias ✗
    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `T3-P2 not-yet ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2024-01-01",
      expirationDate: in60d,
    });

    // P3 — venceu ontem → excluído (expirationDate < today) ✗
    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `T3-P3 expired ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2024-01-01",
      expirationDate: yesterday,
    });

    // P4 — sem expirationDate → excluído ✗
    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `T3-P4 no-exp ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2024-01-01",
    });

    const base = `/api/organizations/${ctx.organizationId}/employees/trainings`;

    const res = await request(app)
      .get(`${base}?expiringWithinDays=30&pageSize=5&page=1`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    // Apenas P1 está no prazo
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(trainingP1.id);
  });

  /**
   * expiringWithinDays=30 com pageSize=1: pagination.total permanece correto
   * mesmo quando a página retorna menos itens que o total.
   * Seed: P1 (hoje+5d) + P2 (hoje+15d) + P3 (hoje+60d fora do prazo).
   * Espera: pagination.total=2, pageSize=1 retorna 1 linha.
   */
  it("expiringWithinDays=30: pagination.total correto com pageSize=1 (2 matches)", async () => {
    const ctx = await createTestContext({ seed: "board-t3-expiring-page" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, `Filial T3-exp-pg ${ctx.prefix}`);
    const employee = await createEmployee(ctx, {
      name: `Colaborador T3-exp-pg ${ctx.prefix}`,
      unitId: unit.id,
    });

    const in5d = new Date(Date.now() + 5 * 86400000)
      .toISOString()
      .split("T")[0];
    const in15d = new Date(Date.now() + 15 * 86400000)
      .toISOString()
      .split("T")[0];
    const in60d = new Date(Date.now() + 60 * 86400000)
      .toISOString()
      .split("T")[0];

    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `T3-Q1 exp5d ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2024-01-01",
      expirationDate: in5d,
    });
    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `T3-Q2 exp15d ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2024-01-01",
      expirationDate: in15d,
    });
    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `T3-Q3 exp60d ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2024-01-01",
      expirationDate: in60d,
    });

    const base = `/api/organizations/${ctx.organizationId}/employees/trainings`;

    const res = await request(app)
      .get(`${base}?expiringWithinDays=30&pageSize=1&page=1`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1); // apenas 1 na página
    expect(res.body.pagination.total).toBe(2); // mas 2 no total dentro do prazo
    expect(res.body.pagination.totalPages).toBe(2);
  });
});

// ─── T2 seed helper ──────────────────────────────────────────────────────────

async function seedT2(ctx: Awaited<ReturnType<typeof createTestContext>>) {
  const unit = await createUnit(ctx, `Filial T2 ${ctx.prefix}`);
  const employee = await createEmployee(ctx, {
    name: `Colaborador T2 ${ctx.prefix}`,
    unitId: unit.id,
  });
  const evaluatorUser = await createTestUser(ctx, { suffix: "eval-t2" });

  // Catalog item with norm=ISO 9001 (for training E)
  const [catalogItem] = await db
    .insert(trainingCatalogTable)
    .values({
      organizationId: ctx.organizationId,
      title: `Treinamento ISO 9001 T2 ${ctx.prefix}`,
      norm: "ISO 9001",
    })
    .returning();

  // A — 2024, 2 reviews (latest isEffective=true) → boardConcluidas, eficaz
  const [trainingA] = await db
    .insert(employeeTrainingsTable)
    .values({
      employeeId: employee.id,
      title: `T2-A ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2024-03-15",
    })
    .returning();

  await db.insert(trainingEffectivenessReviewsTable).values({
    trainingId: trainingA.id,
    evaluatorUserId: evaluatorUser.id,
    evaluationDate: "2024-04-01",
    isEffective: false,
  });
  await db.insert(trainingEffectivenessReviewsTable).values({
    trainingId: trainingA.id,
    evaluatorUserId: evaluatorUser.id,
    evaluationDate: "2024-05-01",
    isEffective: true,
  });

  // B — 2024, gestor, effectivenessDueDate set, no reviews → boardEmAvaliacao
  await db.insert(employeeTrainingsTable).values({
    employeeId: employee.id,
    title: `T2-B ${ctx.prefix}`,
    status: "concluido",
    completionDate: "2024-03-15",
    effectivenessAssignedRole: "gestor",
    effectivenessDueDate: "2024-04-30",
  });

  // C — 2024, rh, effectivenessDueDate set, no reviews → boardEmAvaliacao
  await db.insert(employeeTrainingsTable).values({
    employeeId: employee.id,
    title: `T2-C ${ctx.prefix}`,
    status: "concluido",
    completionDate: "2024-03-15",
    effectivenessAssignedRole: "rh",
    effectivenessDueDate: "2024-04-30",
  });

  // D — 2024, evaluationMethod, no assignment/review → boardPendentes
  await db.insert(employeeTrainingsTable).values({
    employeeId: employee.id,
    title: `T2-D ${ctx.prefix}`,
    status: "concluido",
    completionDate: "2024-03-15",
    evaluationMethod: "Prova",
  });

  // E — 2025, ISO 9001 catalog, 1 review isEffective=false → boardConcluidas, naoEficaz
  const [trainingE] = await db
    .insert(employeeTrainingsTable)
    .values({
      employeeId: employee.id,
      title: `T2-E ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2025-06-01",
      catalogItemId: catalogItem.id,
    })
    .returning();

  await db.insert(trainingEffectivenessReviewsTable).values({
    trainingId: trainingE.id,
    evaluatorUserId: evaluatorUser.id,
    evaluationDate: "2025-07-01",
    isEffective: false,
  });

  // F — 2025, instrutor, no reviews → boardEmAvaliacao
  await db.insert(employeeTrainingsTable).values({
    employeeId: employee.id,
    title: `T2-F ${ctx.prefix}`,
    status: "concluido",
    completionDate: "2025-06-15",
    effectivenessAssignedRole: "instrutor",
  });

  const base = `/api/organizations/${ctx.organizationId}/employees/trainings`;
  return { base, employeeId: employee.id, trainingIds: { trainingA: trainingA.id, trainingE: trainingE.id } };
}
