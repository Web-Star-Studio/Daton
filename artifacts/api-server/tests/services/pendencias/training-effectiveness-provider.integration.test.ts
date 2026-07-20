import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  employeeTrainingsTable,
  trainingEffectivenessReviewsTable,
  unitManagersTable,
  usersTable,
} from "@workspace/db";
import {
  cleanupTestContext,
  createEmployee,
  createTestContext,
  createTestUser,
  createUnit,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { trainingEffectivenessPendenciaProvider } from "../../../src/services/pendencias/providers/training-effectiveness";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const NOW = new Date(2026, 5, 15); // 15/06/2026

async function seedTraining(
  employeeId: number,
  values: Partial<typeof employeeTrainingsTable.$inferInsert> = {},
) {
  const [row] = await db
    .insert(employeeTrainingsTable)
    .values({
      employeeId,
      title: "NR-35 Trabalho em altura",
      status: "concluido",
      ...values,
    })
    .returning({ id: employeeTrainingsTable.id });
  return row.id;
}

describe("trainingEffectivenessPendenciaProvider", () => {
  it("papel 'gestor' resolve para os gestores da filial do colaborador", async () => {
    const ctx = await createTestContext({ seed: "pend-ef-gestor" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    const gestor = await createTestUser(ctx, { role: "operator", suffix: "gestor" });
    await db.insert(unitManagersTable).values({
      organizationId: ctx.organizationId,
      unitId: unit.id,
      userId: gestor.id,
    });
    const employee = await createEmployee(ctx, {
      name: `Colab ${ctx.prefix}`,
      unitId: unit.id,
    });
    const trainingId = await seedTraining(employee.id, {
      effectivenessAssignedRole: "gestor",
      effectivenessDueDate: "2026-06-10", // vencido em 15/06
    });

    const forGestor = await trainingEffectivenessPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [gestor.id],
      now: NOW,
      dueSoonDays: 7,
    });

    expect(forGestor).toHaveLength(1);
    expect(forGestor[0].id).toBe(`training_effectiveness:${trainingId}`);
    expect(forGestor[0].urgency).toBe("overdue");
    expect(forGestor[0].dueDate).toBe("2026-06-10");
    expect(forGestor[0].responsibleUserId).toBe(gestor.id);
    expect(forGestor[0].link.route).toBe("/aprendizagem/eficacia");
    expect(forGestor[0].meta?.resolvedVia).toBe("gestor");

    // O admin NÃO deve receber este item: a filial tem gestor, então não há fallback.
    const forAdmin = await trainingEffectivenessPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });
    expect(forAdmin.map((i) => i.id)).not.toContain(
      `training_effectiveness:${trainingId}`,
    );
  });

  it("papel 'colaborador' resolve para o usuário vinculado ao colaborador", async () => {
    const ctx = await createTestContext({ seed: "pend-ef-colab" });
    contexts.push(ctx);
    const employee = await createEmployee(ctx, { name: `Colab ${ctx.prefix}` });
    const colabUser = await createTestUser(ctx, { role: "operator", suffix: "colab" });
    await db
      .update(usersTable)
      .set({ employeeId: employee.id })
      .where(eq(usersTable.id, colabUser.id));
    const trainingId = await seedTraining(employee.id, {
      effectivenessAssignedRole: "colaborador",
      effectivenessDueDate: "2026-06-18", // dentro da janela de 7 dias
    });

    const items = await trainingEffectivenessPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [colabUser.id],
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`training_effectiveness:${trainingId}`);
    expect(items[0].urgency).toBe("due_soon");
    expect(items[0].responsibleUserId).toBe(colabUser.id);
    expect(items[0].meta?.resolvedVia).toBe("colaborador");
  });

  it("papéis sem pessoa ('rh', 'instrutor') e gestor sem gestor cadastrado caem para o admin", async () => {
    const ctx = await createTestContext({ seed: "pend-ef-fallback" });
    contexts.push(ctx);
    const unitSemGestor = await createUnit(ctx, `Filial ${ctx.prefix}`);
    const employee = await createEmployee(ctx, {
      name: `Colab ${ctx.prefix}`,
      unitId: unitSemGestor.id,
    });
    const rhId = await seedTraining(employee.id, {
      effectivenessAssignedRole: "rh",
      effectivenessDueDate: "2026-06-20",
    });
    const instrutorId = await seedTraining(employee.id, {
      effectivenessAssignedRole: "instrutor",
      effectivenessDueDate: "2026-06-20",
    });
    const gestorOrfaoId = await seedTraining(employee.id, {
      effectivenessAssignedRole: "gestor",
      effectivenessDueDate: "2026-06-20",
    });

    const items = await trainingEffectivenessPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId], // org_admin
      now: NOW,
      dueSoonDays: 7,
    });

    const ids = items.map((i) => i.id);
    expect(ids).toContain(`training_effectiveness:${rhId}`);
    expect(ids).toContain(`training_effectiveness:${instrutorId}`);
    expect(ids).toContain(`training_effectiveness:${gestorOrfaoId}`);
    for (const item of items) {
      expect(item.meta?.resolvedVia).toBe("fallback_admin");
    }
  });

  it("rascunho de avaliação NÃO conclui: o item segue pendente", async () => {
    const ctx = await createTestContext({ seed: "pend-ef-draft" });
    contexts.push(ctx);
    const employee = await createEmployee(ctx, { name: `Colab ${ctx.prefix}` });
    const trainingId = await seedTraining(employee.id, {
      effectivenessAssignedRole: "rh",
      effectivenessDueDate: "2026-06-20",
    });
    await db.insert(trainingEffectivenessReviewsTable).values({
      trainingId,
      evaluatorUserId: ctx.userId,
      evaluationDate: "2026-06-14",
      status: "draft",
    });

    const withDraft = await trainingEffectivenessPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });
    expect(withDraft.map((i) => i.id)).toContain(
      `training_effectiveness:${trainingId}`,
    );

    // Finalizada, sai da lista.
    await db
      .update(trainingEffectivenessReviewsTable)
      .set({ status: "final" })
      .where(eq(trainingEffectivenessReviewsTable.trainingId, trainingId));

    const afterFinal = await trainingEffectivenessPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });
    expect(afterFinal.map((i) => i.id)).not.toContain(
      `training_effectiveness:${trainingId}`,
    );
  });

  it("não atribuídos viram UM item agregado para o admin, só com critério de eficácia", async () => {
    const ctx = await createTestContext({ seed: "pend-ef-agg" });
    contexts.push(ctx);
    const employee = await createEmployee(ctx, { name: `Colab ${ctx.prefix}` });
    // 2 com critério (contam) …
    await seedTraining(employee.id, { evaluationMethod: "Prova prática" });
    await seedTraining(employee.id, { targetCompetencyName: "Trabalho em altura" });
    // … 1 sem critério e 1 com string vazia (não contam).
    await seedTraining(employee.id, {});
    await seedTraining(employee.id, { evaluationMethod: "" });

    const items = await trainingEffectivenessPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });

    const aggregate = items.filter((i) => i.meta?.aggregate === true);
    expect(aggregate).toHaveLength(1);
    expect(aggregate[0].id).toBe("training_effectiveness:unassigned");
    expect(aggregate[0].meta?.unassignedCount).toBe(2);
    expect(aggregate[0].urgency).toBe("no_due");
    expect(aggregate[0].dueDate).toBeNull();
    expect(aggregate[0].responsibleUserId).toBe(ctx.userId);
  });

  it("não-admin não recebe o agregado de não atribuídos", async () => {
    const ctx = await createTestContext({ seed: "pend-ef-agg-nonadmin" });
    contexts.push(ctx);
    const operator = await createTestUser(ctx, { role: "operator", suffix: "op" });
    const employee = await createEmployee(ctx, { name: `Colab ${ctx.prefix}` });
    await seedTraining(employee.id, { evaluationMethod: "Prova prática" });

    const items = await trainingEffectivenessPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [operator.id],
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(0);
  });

  it("listCompletedToday devolve só reviews finais criadas hoje pelo avaliador no escopo", async () => {
    const ctx = await createTestContext({ seed: "pend-ef-done" });
    contexts.push(ctx);
    const employee = await createEmployee(ctx, { name: `Colab ${ctx.prefix}` });
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const finalId = await seedTraining(employee.id, { title: "Final de hoje" });
    const draftId = await seedTraining(employee.id, { title: "Rascunho de hoje" });

    await db.insert(trainingEffectivenessReviewsTable).values([
      {
        trainingId: finalId,
        evaluatorUserId: ctx.userId,
        evaluationDate: "2026-06-15",
        status: "final",
        createdAt: new Date(2026, 5, 15, 9, 0, 0),
      },
      {
        trainingId: draftId,
        evaluatorUserId: ctx.userId,
        evaluationDate: "2026-06-15",
        status: "draft",
        createdAt: new Date(2026, 5, 15, 9, 30, 0),
      },
    ]);

    const done = await trainingEffectivenessPendenciaProvider.listCompletedToday!({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now,
      dueSoonDays: 7,
    });

    expect(done).toHaveLength(1);
    expect(done[0].id).toBe(`training_effectiveness:${finalId}`);
    expect(done[0].statusLabel).toBe("Avaliada hoje");
  });
});
