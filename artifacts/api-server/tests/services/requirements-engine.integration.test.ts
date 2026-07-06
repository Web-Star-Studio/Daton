import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  trainingCatalogTable,
  trainingRequirementsTable,
  employeeTrainingsTable,
} from "@workspace/db";
import { applyTrainingRequirements } from "../../src/services/aprendizagem/requirements-engine";
import {
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function makeCatalogItem(orgId: number, title: string) {
  const [item] = await db
    .insert(trainingCatalogTable)
    .values({ organizationId: orgId, title })
    .returning();
  return item;
}

describe("applyTrainingRequirements engine", () => {
  it("gera pendente com dueDate fixo (admissão + dias)", async () => {
    const ctx = await createTestContext({ seed: "engine-fixo" });
    contexts.push(ctx);
    const position = await createPosition(ctx, { name: `Motorista ${ctx.prefix}` });
    const item = await makeCatalogItem(ctx.organizationId, `Dir. defensiva ${ctx.prefix}`);
    await db.insert(trainingRequirementsTable).values({
      organizationId: ctx.organizationId,
      positionId: position.id,
      catalogItemId: item.id,
      deadlineType: "fixo",
      deadlineDays: 30,
      scope: "geral",
    });
    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: position.name,
      admissionDate: "2026-01-10",
    });

    const result = await applyTrainingRequirements({
      orgId: ctx.organizationId,
      employeeId: employee.id,
      database: db,
    });
    expect(result.generated).toBe(1);
    expect(result.reused).toBe(0);

    const [pending] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.employeeId, employee.id));
    expect(pending.status).toBe("pendente");
    expect(pending.catalogItemId).toBe(item.id);
    expect(pending.dueDate).toBe("2026-02-09"); // 10/01 + 30 dias
  });

  it("aproveita treino concluído válido (não regenera)", async () => {
    const ctx = await createTestContext({ seed: "engine-reuse" });
    contexts.push(ctx);
    const position = await createPosition(ctx, { name: `Analista ${ctx.prefix}` });
    const item = await makeCatalogItem(ctx.organizationId, `ISO 9001 ${ctx.prefix}`);
    await db.insert(trainingRequirementsTable).values({
      organizationId: ctx.organizationId,
      positionId: position.id,
      catalogItemId: item.id,
      deadlineType: "rh",
      scope: "geral",
    });
    const employee = await createEmployee(ctx, {
      name: `Ana ${ctx.prefix}`,
      position: position.name,
    });
    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: "ISO 9001 (concluído)",
      status: "concluido",
      catalogItemId: item.id,
      expirationDate: "2099-12-31",
    });

    const result = await applyTrainingRequirements({
      orgId: ctx.organizationId,
      employeeId: employee.id,
      database: db,
    });
    expect(result.reused).toBe(1);
    expect(result.generated).toBe(0);
  });

  it("é idempotente (rodar 2x não duplica)", async () => {
    const ctx = await createTestContext({ seed: "engine-idem" });
    contexts.push(ctx);
    const position = await createPosition(ctx, { name: `Mecânico ${ctx.prefix}` });
    const item = await makeCatalogItem(ctx.organizationId, `NR-20 ${ctx.prefix}`);
    await db.insert(trainingRequirementsTable).values({
      organizationId: ctx.organizationId,
      positionId: position.id,
      catalogItemId: item.id,
      deadlineType: "rh",
      scope: "geral",
    });
    const employee = await createEmployee(ctx, {
      name: `Paulo ${ctx.prefix}`,
      position: position.name,
    });
    const first = await applyTrainingRequirements({
      orgId: ctx.organizationId,
      employeeId: employee.id,
      database: db,
    });
    const second = await applyTrainingRequirements({
      orgId: ctx.organizationId,
      employeeId: employee.id,
      database: db,
    });
    expect(first.generated).toBe(1);
    expect(second.generated).toBe(0);
    const rows = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.employeeId, employee.id));
    expect(rows.length).toBe(1);
  });

  it("respeita escopo de filial", async () => {
    const ctx = await createTestContext({ seed: "engine-filial" });
    contexts.push(ctx);
    const position = await createPosition(ctx, { name: `Motorista ${ctx.prefix}` });
    const unitA = await createUnit(ctx, `Filial A ${ctx.prefix}`);
    const unitB = await createUnit(ctx, `Filial B ${ctx.prefix}`);
    const item = await makeCatalogItem(ctx.organizationId, `Rota ${ctx.prefix}`);
    await db.insert(trainingRequirementsTable).values({
      organizationId: ctx.organizationId,
      positionId: position.id,
      catalogItemId: item.id,
      deadlineType: "rh",
      scope: "filial",
      filialUnitIds: [unitA.id],
    });
    const empA = await createEmployee(ctx, {
      name: `A ${ctx.prefix}`,
      position: position.name,
      unitId: unitA.id,
    });
    const empB = await createEmployee(ctx, {
      name: `B ${ctx.prefix}`,
      position: position.name,
      unitId: unitB.id,
    });

    const resA = await applyTrainingRequirements({
      orgId: ctx.organizationId,
      employeeId: empA.id,
      database: db,
    });
    const resB = await applyTrainingRequirements({
      orgId: ctx.organizationId,
      employeeId: empB.id,
      database: db,
    });
    expect(resA.generated).toBe(1);
    expect(resB.generated).toBe(0);
  });
});
