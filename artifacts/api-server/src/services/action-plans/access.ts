import type { UserRole } from "../../middlewares/auth";

export interface ActionPlanRequesterScope {
  role: UserRole;
  userId: number;
  /** Filial do gestor (users.unit_id); null para os demais perfis. */
  unitId: number | null;
}

export interface ActionPlanAccessFields {
  /** Filial do plano; null = corporativo. */
  unitId: number | null;
  responsibleUserId: number | null;
  coResponsibleUserIds: number[];
  effectivenessEvaluatorUserId: number | null;
}

function isAdmin(role: UserRole): boolean {
  return role === "org_admin" || role === "platform_admin";
}

/**
 * Matriz única de VISIBILIDADE do hub de Ações. Espelha `canActOnKpiIndicator`.
 * Espelhada no front em `artifacts/web/src/lib/action-plans-access.ts` — sync.
 * Só governa quem VÊ; a escrita é barrada à parte (requireWriteAccess p/ analista).
 */
export function canViewActionPlan(
  scope: ActionPlanRequesterScope,
  plan: ActionPlanAccessFields,
): boolean {
  if (isAdmin(scope.role)) return true;
  if (scope.role === "analyst") return true; // auditor: vê tudo, só leitura

  const personallyInvolved =
    (plan.responsibleUserId !== null && plan.responsibleUserId === scope.userId) ||
    plan.coResponsibleUserIds.includes(scope.userId) ||
    (plan.effectivenessEvaluatorUserId !== null && plan.effectivenessEvaluatorUserId === scope.userId);
  if (personallyInvolved) return true;

  if (scope.role === "manager") {
    return plan.unitId === null || (scope.unitId !== null && plan.unitId === scope.unitId);
  }
  return false; // operator
}
