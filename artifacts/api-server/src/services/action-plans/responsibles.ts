import { and, eq, inArray } from "drizzle-orm";
import { actionPlanActionsTable, actionPlanResponsiblesTable, db, usersTable } from "@workspace/db";
import { collectTaskAssigneeIds } from "./how-tasks";

/**
 * Acesso aos **co-responsáveis** de um plano — os "outros responsáveis", além do
 * ponto focal. O ponto focal é `action_plans.responsible_user_id` e nunca aparece
 * nesta lista; o conjunto completo de responsáveis do plano é
 * `[ponto focal, ...co-responsáveis]`.
 *
 * Desde o "Como" com dono por passo, esta lista é **derivada**, não digitada: é a
 * união de quem responde por alguma AÇÃO do plano com quem recebeu algum PASSO do
 * "Como", menos o ponto focal. `recomputePlanResponsiblesMirror` é o único escritor
 * do caminho vivo; `setPlanCoResponsibles` continua exposto para o caminho legado da
 * rota do plano (dormente — o front não envia mais co-responsável à mão).
 */

export type PlanCoResponsible = { userId: number; name: string };

/** Ids dos co-responsáveis de um plano, em ordem crescente (determinístico). */
export async function listCoResponsibleIds(planId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: actionPlanResponsiblesTable.userId })
    .from(actionPlanResponsiblesTable)
    .where(eq(actionPlanResponsiblesTable.actionPlanId, planId));
  return rows.map((r) => r.userId).sort((a, b) => a - b);
}

/** Co-responsáveis (id + nome) de vários planos numa consulta só, agrupados por
 *  plano e ordenados por NOME — a ordem em que a UI os exibe. */
export async function listCoResponsiblesByPlan(
  planIds: number[],
): Promise<Map<number, PlanCoResponsible[]>> {
  const out = new Map<number, PlanCoResponsible[]>();
  if (planIds.length === 0) return out;

  const rows = await db
    .select({
      planId: actionPlanResponsiblesTable.actionPlanId,
      userId: actionPlanResponsiblesTable.userId,
      name: usersTable.name,
    })
    .from(actionPlanResponsiblesTable)
    .innerJoin(usersTable, eq(usersTable.id, actionPlanResponsiblesTable.userId))
    .where(inArray(actionPlanResponsiblesTable.actionPlanId, planIds));

  for (const r of rows) {
    const bucket = out.get(r.planId) ?? [];
    bucket.push({ userId: r.userId, name: r.name });
    out.set(r.planId, bucket);
  }
  for (const bucket of out.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }
  return out;
}

/**
 * Substitui o conjunto inteiro de co-responsáveis do plano. Idempotente: rodar
 * duas vezes com o mesmo conjunto não duplica nem apaga.
 *
 * Numa transação: se o insert falhasse depois do delete já commitado, o plano
 * ficaria sem co-responsável nenhum — pior do que não ter salvado. É o mesmo
 * cuidado que `unit_managers` toma na troca de gestores (`routes/units.ts:255-260`).
 */
export async function setPlanCoResponsibles(
  orgId: number,
  planId: number,
  userIds: number[],
): Promise<{ added: number[]; removed: number[] }> {
  const desired = [...new Set(userIds)];

  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select({ userId: actionPlanResponsiblesTable.userId })
        .from(actionPlanResponsiblesTable)
        .where(eq(actionPlanResponsiblesTable.actionPlanId, planId))
    ).map((r) => r.userId);

    const toRemove = current.filter((id) => !desired.includes(id));
    const toAdd = desired.filter((id) => !current.includes(id));

    if (toRemove.length > 0) {
      await tx.delete(actionPlanResponsiblesTable).where(
        and(
          eq(actionPlanResponsiblesTable.actionPlanId, planId),
          inArray(actionPlanResponsiblesTable.userId, toRemove),
        ),
      );
    }
    if (toAdd.length > 0) {
      await tx
        .insert(actionPlanResponsiblesTable)
        .values(toAdd.map((userId) => ({ organizationId: orgId, actionPlanId: planId, userId })))
        .onConflictDoNothing();
    }
    // Delta devolvido para que o chamador notifique só QUEM ENTROU (o autosave
    // recalcula o espelho a cada gravação — sem o delta, viraria e-mail repetido).
    return { added: toAdd, removed: toRemove };
  });
}

/**
 * Recalcula o espelho de co-responsáveis a partir da execução: união de quem
 * responde por alguma AÇÃO do plano com quem recebeu algum PASSO do "Como", menos
 * o ponto focal (ninguém é responsável duas vezes). É o único escritor do caminho
 * vivo — chamado após criar/editar/excluir ação e ao trocar o ponto focal do plano.
 * Devolve o delta de `setPlanCoResponsibles` para a notificação de quem entrou.
 */
export async function recomputePlanResponsiblesMirror(
  orgId: number,
  planId: number,
  pontoFocalUserId: number | null,
): Promise<{ added: number[]; removed: number[] }> {
  const rows = await db
    .select({
      responsibleUserId: actionPlanActionsTable.responsibleUserId,
      howTasks: actionPlanActionsTable.howTasks,
    })
    .from(actionPlanActionsTable)
    .where(eq(actionPlanActionsTable.actionPlanId, planId));

  const derived = new Set<number>();
  for (const r of rows) {
    if (r.responsibleUserId != null) derived.add(r.responsibleUserId);
    for (const id of collectTaskAssigneeIds(r.howTasks)) derived.add(id);
  }
  if (pontoFocalUserId != null) derived.delete(pontoFocalUserId);

  return setPlanCoResponsibles(orgId, planId, [...derived]);
}

/** True quando o usuário é dono de ALGUM passo do "Como" de alguma ação do plano.
 *  Espelha `isPlanActionAssignee`: executar um passo dá o mesmo acesso estreito
 *  (abre a ficha, marca só o próprio passo) — não conduz o plano. */
export async function isPlanTaskAssignee(planId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ howTasks: actionPlanActionsTable.howTasks })
    .from(actionPlanActionsTable)
    .where(eq(actionPlanActionsTable.actionPlanId, planId));
  return rows.some((r) => collectTaskAssigneeIds(r.howTasks).includes(userId));
}

/** True quando o usuário é co-responsável do plano. Não cobre o ponto focal —
 *  quem chama já tem `plan.responsibleUserId` em mãos. */
export async function isPlanCoResponsible(planId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: actionPlanResponsiblesTable.id })
    .from(actionPlanResponsiblesTable)
    .where(
      and(
        eq(actionPlanResponsiblesTable.actionPlanId, planId),
        eq(actionPlanResponsiblesTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * É responsável por ALGUMA ação-item deste plano. Executar uma ação é papel distinto de
 * conduzir o plano: o provider de pendências manda esse usuário para a ficha do plano
 * (`/planos-acao/:id#acao-:id`), então ele precisa alcançar o plano mesmo sem o módulo
 * `actionPlans`, sem ser ponto focal e sem ser co-responsável — senão a pendência que ele
 * recebe vira um beco (403 ao abrir). `requireWriteAccess` continua barrando analista, então
 * quem passa aqui e não é analista consegue de fato concluir a ação.
 */
export async function isPlanActionAssignee(planId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: actionPlanActionsTable.id })
    .from(actionPlanActionsTable)
    .where(
      and(
        eq(actionPlanActionsTable.actionPlanId, planId),
        eq(actionPlanActionsTable.responsibleUserId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
