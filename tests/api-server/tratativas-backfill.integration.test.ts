// Cobre a migração de dados (Task 20): `root_cause_whys` → `analyses.five_whys`
// e `plan_5w2h` → 1 linha em `action_plan_actions`. O script em si não expõe
// rotas — as funções são importadas diretamente e exercitadas contra o banco
// de teste (TEST_ENV=integration).
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  actionPlanActionsTable,
  actionPlanAnalysisMethodsTable,
  actionPlansTable,
  db,
  usersTable,
  type InsertActionPlan,
} from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../support/backend";
import { runTratativasEAcoesBackfill } from "../../scripts/src/migrate/tratativas-e-acoes-backfill";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

async function createLegacyPlan(
  context: TestOrgContext,
  overrides: Partial<InsertActionPlan> = {},
) {
  const [plan] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: context.organizationId,
      sourceModule: "manual",
      sourceRef: {},
      title: "Plano legado",
      ...overrides,
    })
    .returning();
  return plan;
}

async function reloadPlan(planId: number) {
  const [plan] = await db
    .select()
    .from(actionPlansTable)
    .where(eq(actionPlansTable.id, planId));
  return plan;
}

async function loadActions(planId: number) {
  return db
    .select()
    .from(actionPlanActionsTable)
    .where(eq(actionPlanActionsTable.actionPlanId, planId));
}

async function renameUser(userId: number, name: string) {
  await db.update(usersTable).set({ name }).where(eq(usersTable.id, userId));
}

describe("backfill Tratativas + Ações (Task 20)", () => {
  it("semeia o catálogo de tratativas (8 métodos) para a organização", async () => {
    const context = await createTestContext({ seed: "seed-catalogo" });
    contexts.push(context);

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const methods = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(
        eq(
          actionPlanAnalysisMethodsTable.organizationId,
          context.organizationId,
        ),
      );
    expect(methods).toHaveLength(8);
    expect(methods.some((m) => m.key === "five_whys" && m.isDefault)).toBe(
      true,
    );
  });

  it("root_cause_whys vira analyses.five_whys; root_cause NÃO é tocado", async () => {
    const context = await createTestContext({ seed: "tratativa-whys" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, {
      rootCause: "Falta de treinamento da equipe",
      rootCauseWhys: ["Por que vazou?", "Por que a válvula falhou?"],
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const reloaded = await reloadPlan(plan.id);
    expect(reloaded.analyses).toEqual([
      {
        key: "five_whys",
        data: { whys: ["Por que vazou?", "Por que a válvula falhou?"] },
      },
    ]);
    expect(reloaded.rootCause).toBe("Falta de treinamento da equipe");
  });

  it("plano sem root_cause_whys não ganha analyses", async () => {
    const context = await createTestContext({ seed: "tratativa-sem-whys" });
    contexts.push(context);
    const plan = await createLegacyPlan(context);

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const reloaded = await reloadPlan(plan.id);
    expect(reloaded.analyses).toBeNull();
  });

  it("plan_5w2h vira 1 ação (why/whereAt/how/howMuch verbatim)", async () => {
    const context = await createTestContext({ seed: "acao-verbatim" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, {
      title: "Corrigir vazamento na linha 3",
      plan5w2h: {
        why: "Vazamento de óleo",
        where: "Linha 3 - Setor de Envase",
        how: "Trocar a vedação",
        howMuch: "R$ 1.200,00",
      },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const actions = await loadActions(plan.id);
    expect(actions).toHaveLength(1);
    const action = actions[0];
    expect(action.what).toBe("Corrigir vazamento na linha 3"); // fallback: what vazio usa o title
    expect(action.why).toBe("Vazamento de óleo");
    expect(action.whereAt).toBe("Linha 3 - Setor de Envase");
    expect(action.how).toBe("Trocar a vedação");
    expect(action.howMuch).toBe("R$ 1.200,00");
    expect(action.sortOrder).toBe(0);
  });

  it("what preenchido é usado verbatim (title não entra)", async () => {
    const context = await createTestContext({ seed: "acao-what-preenchido" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, {
      title: "Título do plano",
      plan5w2h: { what: "Enunciado explícito da ação" },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const [action] = await loadActions(plan.id);
    expect(action.what).toBe("Enunciado explícito da ação");
  });

  it("plan5w2h.who que casa (case-insensitive) com o nome de um usuário vira responsibleUserId", async () => {
    const context = await createTestContext({ seed: "acao-who-match" });
    contexts.push(context);
    const member = await createTestUser(context, { suffix: "resp" });
    await renameUser(member.id, "Fulano de Tal");

    const plan = await createLegacyPlan(context, {
      plan5w2h: { what: "Treinar operadores", who: "FULANO DE TAL" },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const [action] = await loadActions(plan.id);
    expect(action.responsibleUserId).toBe(member.id);
    expect(action.notes).toBeNull();
  });

  it("plan5w2h.who sem match cai no responsável do plano E vai para notes", async () => {
    const context = await createTestContext({ seed: "acao-who-nomatch" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, {
      responsibleUserId: context.userId,
      plan5w2h: { what: "Revisar procedimento", who: "Setor de Qualidade" },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const [action] = await loadActions(plan.id);
    expect(action.responsibleUserId).toBe(context.userId);
    expect(action.notes).toBe('Quem (registro anterior): "Setor de Qualidade"');
  });

  it("plan5w2h.when não parseável cai no dueDate do plano E vai para notes", async () => {
    const context = await createTestContext({ seed: "acao-when-nomatch" });
    contexts.push(context);
    const due = new Date("2026-08-01T00:00:00.000Z");
    const plan = await createLegacyPlan(context, {
      dueDate: due,
      plan5w2h: { what: "Concluir análise", when: "Julho/26" },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const [action] = await loadActions(plan.id);
    expect(action.dueDate?.toISOString()).toBe(due.toISOString());
    expect(action.notes).toBe('Quando (registro anterior): "Julho/26"');
  });

  it("who não resolvido E when não parseável combinam as duas notes (ordem Quem · Quando)", async () => {
    const context = await createTestContext({ seed: "acao-who-when-nomatch" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, {
      plan5w2h: { what: "x", who: "Setor de Qualidade", when: "Julho/26" },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const [action] = await loadActions(plan.id);
    expect(action.notes).toBe(
      'Quem (registro anterior): "Setor de Qualidade" · Quando (registro anterior): "Julho/26"',
    );
  });

  it("plan5w2h.when parseável (dd/mm/aaaa) vira dueDate — sem nota", async () => {
    const context = await createTestContext({ seed: "acao-when-match" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, {
      plan5w2h: { what: "x", when: "20/07/2026" },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const [action] = await loadActions(plan.id);
    expect(action.dueDate?.toISOString()).toBe(
      new Date(Date.UTC(2026, 6, 20)).toISOString(),
    );
    expect(action.notes).toBeNull();
  });

  it("plano completed gera ação completed", async () => {
    const context = await createTestContext({ seed: "acao-completed" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, {
      status: "completed",
      plan5w2h: { what: "Ação já concluída" },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const [action] = await loadActions(plan.id);
    expect(action.status).toBe("completed");
    expect(action.completedAt).not.toBeNull();
  });

  it("plano cancelled também gera ação completed", async () => {
    const context = await createTestContext({ seed: "acao-cancelled" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, {
      status: "cancelled",
      plan5w2h: { what: "Ação de plano cancelado" },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const [action] = await loadActions(plan.id);
    expect(action.status).toBe("completed");
  });

  it("plano sem plan_5w2h não ganha ação", async () => {
    const context = await createTestContext({ seed: "acao-sem-plan5w2h" });
    contexts.push(context);
    const plan = await createLegacyPlan(context);

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const actions = await loadActions(plan.id);
    expect(actions).toHaveLength(0);
  });

  it("plan_5w2h vazio ({}) não gera ação", async () => {
    const context = await createTestContext({ seed: "acao-plan5w2h-vazio" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, { plan5w2h: {} });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    const actions = await loadActions(plan.id);
    expect(actions).toHaveLength(0);
  });

  it("idempotência: rodar duas vezes não duplica ação nem sobrescreve analyses", async () => {
    const context = await createTestContext({ seed: "idempotente" });
    contexts.push(context);
    const plan = await createLegacyPlan(context, {
      rootCauseWhys: ["Por que 1?"],
      plan5w2h: { what: "Ação única" },
    });

    await runTratativasEAcoesBackfill({ orgIds: [context.organizationId] });

    // Simula uma edição manual feita pelo usuário depois da 1ª migração — a 2ª
    // rodada não pode sobrescrever isso (guarda de idempotência é por `analyses IS NULL`).
    const editedAnalyses = [
      {
        key: "five_whys" as const,
        data: { whys: ["Editado pelo usuário depois"] },
      },
    ];
    await db
      .update(actionPlansTable)
      .set({ analyses: editedAnalyses })
      .where(eq(actionPlansTable.id, plan.id));

    const secondRun = await runTratativasEAcoesBackfill({
      orgIds: [context.organizationId],
    });

    const actions = await loadActions(plan.id);
    expect(actions).toHaveLength(1); // não duplicou

    const reloaded = await reloadPlan(plan.id);
    expect(reloaded.analyses).toEqual(editedAnalyses); // não sobrescreveu

    // Segunda rodada não conta mais nada como migrado para este plano (já tinha
    // analyses não-nulo e já tinha 1 ação).
    expect(secondRun.tratativas.candidates).toBe(0);
    expect(secondRun.acoes.candidates).toBe(0);
  });
});
