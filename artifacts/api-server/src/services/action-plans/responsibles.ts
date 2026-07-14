import { and, eq, inArray } from "drizzle-orm";
import { actionPlanResponsiblesTable, db, usersTable } from "@workspace/db";

export type PlanResponsible = { userId: number; name: string };

/** Ids dos responsáveis de um plano, em ordem crescente (determinístico). */
export async function listResponsibleIds(planId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: actionPlanResponsiblesTable.userId })
    .from(actionPlanResponsiblesTable)
    .where(eq(actionPlanResponsiblesTable.actionPlanId, planId));
  return rows.map((r) => r.userId).sort((a, b) => a - b);
}

/** Responsáveis (id + nome) de vários planos numa consulta só, agrupados por
 *  plano e ordenados por NOME — a ordem em que a UI os exibe. */
export async function listResponsiblesByPlan(planIds: number[]): Promise<Map<number, PlanResponsible[]>> {
  const out = new Map<number, PlanResponsible[]>();
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
 * Substitui o conjunto inteiro de responsáveis do plano. Idempotente: rodar duas
 * vezes com o mesmo conjunto não duplica nem apaga.
 *
 * Numa transação: se o insert falhasse depois do delete já commitado, o plano
 * ficaria SEM responsável nenhum — pior do que não ter salvado. É o mesmo cuidado
 * que `unit_managers` toma na troca de gestores (`routes/units.ts:255-260`).
 */
export async function setPlanResponsibles(orgId: number, planId: number, userIds: number[]): Promise<void> {
  const desired = [...new Set(userIds)];

  await db.transaction(async (tx) => {
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
  });
}

/** True quando o usuário é UM dos responsáveis do plano (não só "o" responsável). */
export async function isPlanResponsible(planId: number, userId: number): Promise<boolean> {
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
 * Representante gravado no espelho legado `action_plans.responsible_user_id`.
 * Menor id = determinístico. Ninguém LÊ esse campo; ele só existe para que um
 * rollback do deploy encontre um responsável válido em cada plano.
 */
export function legacyResponsibleId(userIds: number[]): number | null {
  if (userIds.length === 0) return null;
  return [...userIds].sort((a, b) => a - b)[0];
}
