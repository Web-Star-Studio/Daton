import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
  trainingCatalogTable,
  trainingRequirementsTable,
  unitManagersTable,
} from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
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
    //   "Mandatory" = requirementId IS NOT NULL. A obrigatoriedade real exige um
    //   training_requirements que aponta p/ um item do catálogo (ambos FK notNull),
    //   então semeamos os dois de verdade em vez de um id sentinela — o docker de
    //   teste agora tem a FK employee_trainings_requirement_fk (como a produção).
    //   trainingCompletionPercent conta LINHAS com requirementId != null, não
    //   requisitos distintos, então os 2 treinos podem apontar p/ o mesmo requisito.
    //   1 concluido (past completionDate) + 1 pendente → 1/2 * 100 = 50.0
    const [catalogItem] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: ctx.organizationId,
        title: `Obrigatório ${ctx.prefix}`,
      })
      .returning();
    const [requirement] = await db
      .insert(trainingRequirementsTable)
      .values({
        organizationId: ctx.organizationId,
        positionId: position.id,
        catalogItemId: catalogItem.id,
      })
      .returning();

    await db.insert(employeeTrainingsTable).values([
      {
        employeeId: employee.id,
        title: "NR-35 Trabalho em Altura",
        status: "concluido",
        completionDate: "2025-01-15",
        requirementId: requirement.id, // non-null = mandatory
      },
      {
        employeeId: employee.id,
        title: "Combate a incêndio",
        status: "pendente",
        requirementId: requirement.id, // non-null = mandatory
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
      competencyGapStatus: "ok" | "gap" | "critical" | "indeterminado";
    }> = res.body.data;

    // ── 8. Assertions for the employee with gaps and trainings ────────────────
    // "Direção defensiva" (5 vs 2, atestado manual): gap real, gapLevel = 3 ≥ 2
    // → critical. "Primeiros socorros" (sem atestado manual e sem item de
    // catálogo classificado que o comprove): nao_classificado, NÃO gap — mas
    // "critical" vence "indeterminado" pela precedência, então o colaborador
    // como um todo continua "critical".
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

  it('returns competencyGapStatus "indeterminado" when the position has requirements but nothing can prove them (no manual attestation, no classified catalog)', async () => {
    const ctx = await createTestContext({ seed: "emp-indeterminado" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, `Filial Indet ${ctx.prefix}`);

    // Cargo com requisito, sem nenhum atestado manual e sem item de catálogo
    // classificado (evidence_type) que possa prová-lo → não é lacuna, é
    // ausência de dado. Antes desta task isso devolvia "gap" (bug corrigido).
    const position = await createPosition(ctx, { name: "Operador" });

    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Operação de empilhadeira",
      competencyType: "habilidade",
      requiredLevel: 3,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const employee = await createEmployee(ctx, {
      name: `Operador Indeterminado ${ctx.prefix}`,
      unitId: unit.id,
      position: "Operador",
    });
    // Sem employee_competencies, sem employee_trainings/training_catalog
    // classificado para esta organização.

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);

    const data: Array<{
      id: number;
      competencyGapStatus: "ok" | "gap" | "critical" | "indeterminado";
    }> = res.body.data;

    const operador = data.find((e) => e.id === employee.id);
    expect(operador).toBeDefined();
    expect(operador!.competencyGapStatus).toBe("indeterminado");
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
      competencyGapStatus: "ok" | "gap" | "critical" | "indeterminado";
    }> = res.body.data;

    const gapEmployee = data.find((e) => e.id === employee.id);
    expect(gapEmployee).toBeDefined();
    expect(gapEmployee!.competencyGapStatus).toBe("gap");
    expect(gapEmployee!.trainingCompletionPercent).toBeNull();
  });
});

// Task 4 — a ficha do colaborador (GET /employees/:empId) precisa concordar
// com a listagem (GET /employees) para o MESMO colaborador. Antes desta task
// a ficha usava um motor de texto livre (position-requirements.ts) e podia
// discordar do motor relacional usado aqui — este teste trava a igualdade.
describe("GET /organizations/:orgId/employees/:empId — competencyConformance", () => {
  it("has a competencyConformance.gapStatus equal to the list's competencyGapStatus for the same employee", async () => {
    const ctx = await createTestContext({ seed: "emp-conformance-sync" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    const position = await createPosition(ctx, { name: "Motorista Sync" });

    // requiredLevel=5, acquiredLevel=2 (manual) → gapLevel=3 ≥ 2 → critical.
    // Escolhido de propósito para não ser trivialmente "ok" nos dois lados.
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Direção defensiva",
      competencyType: "habilidade",
      requiredLevel: 5,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const employee = await createEmployee(ctx, {
      name: `Motorista Sync ${ctx.prefix}`,
      unitId: unit.id,
      position: "Motorista Sync",
    });

    await db.insert(employeeCompetenciesTable).values({
      employeeId: employee.id,
      name: "Direção defensiva",
      type: "habilidade",
      requiredLevel: 5,
      acquiredLevel: 2,
    });

    const listRes = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees`)
      .set(authHeader(ctx));
    expect(listRes.status).toBe(200);

    const listEmployee: {
      id: number;
      competencyGapStatus: "ok" | "gap" | "critical" | "indeterminado";
    } = listRes.body.data.find((e: { id: number }) => e.id === employee.id);
    expect(listEmployee).toBeDefined();
    // Sanity: garante que o teste não passa trivialmente com "ok" nos dois lados.
    expect(listEmployee.competencyGapStatus).toBe("critical");

    const detailRes = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/${employee.id}`)
      .set(authHeader(ctx));
    expect(detailRes.status).toBe(200);

    expect(detailRes.body.competencyConformance).not.toBeNull();
    expect(detailRes.body.competencyConformance.gapStatus).toBe(
      listEmployee.competencyGapStatus,
    );
    expect(detailRes.body.competencyConformance.positionName).toBe(
      "Motorista Sync",
    );
  });

  it("returns competencyConformance null when the employee's position text doesn't match any Position record", async () => {
    const ctx = await createTestContext({ seed: "emp-conformance-null" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    const employee = await createEmployee(ctx, {
      name: `Sem Cargo Casado ${ctx.prefix}`,
      unitId: unit.id,
      position: "Cargo Inexistente",
    });

    const detailRes = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/${employee.id}`)
      .set(authHeader(ctx));
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.competencyConformance).toBeNull();
  });
});

// Task 5 (Fase 2) — o gestor exibido na ficha ("Dados profissionais") é
// resolvido pela MESMA tabela unit_managers usada pela listagem de unidades
// (routes/units.ts), agora projetada a partir da unitId do colaborador do
// detalhe (employees.ts:loadUnitManagers), em vez de duplicar a query join.
describe("GET /organizations/:orgId/employees/:empId — managers", () => {
  it("returns the unit's managers (gestores da filial) resolved via unit_managers", async () => {
    const ctx = await createTestContext({ seed: "emp-managers" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, `Filial Gestor ${ctx.prefix}`);
    const manager = await createTestUser(ctx, { suffix: "gestor" });

    await db.insert(unitManagersTable).values({
      organizationId: ctx.organizationId,
      unitId: unit.id,
      userId: manager.id,
    });

    const employee = await createEmployee(ctx, {
      name: `Colaborador Com Gestor ${ctx.prefix}`,
      unitId: unit.id,
    });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/${employee.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.managers).toEqual([
      { id: manager.id, name: `E2E ${ctx.prefix} gestor` },
    ]);
  });

  it("returns an empty managers array when the employee's unit has no managers", async () => {
    const ctx = await createTestContext({ seed: "emp-no-managers" });
    contexts.push(ctx);

    const unit = await createUnit(ctx, `Filial Sem Gestor ${ctx.prefix}`);
    const employee = await createEmployee(ctx, {
      name: `Colaborador Sem Gestor ${ctx.prefix}`,
      unitId: unit.id,
    });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/${employee.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.managers).toEqual([]);
  });

  it("returns an empty managers array when the employee has no unit", async () => {
    const ctx = await createTestContext({ seed: "emp-null-unit-mgr" });
    contexts.push(ctx);

    const employee = await createEmployee(ctx, {
      name: `Colaborador Sem Filial ${ctx.prefix}`,
      unitId: null,
    });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/${employee.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.managers).toEqual([]);
  });
});
