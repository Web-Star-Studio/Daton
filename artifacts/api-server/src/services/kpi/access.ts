import type { UserRole } from "../../middlewares/auth";
import { CORPORATE_UNIT_LABEL } from "./units";

/** Corporate = rollup parent OR explicitly labeled with the canonical corporate unit. */
export function isCorporateIndicator(r: { rollupStrategy: string | null; unit: string | null }): boolean {
  if (r.rollupStrategy != null) return true;
  return (r.unit ?? "").trim().toLowerCase() === CORPORATE_UNIT_LABEL.toLowerCase();
}

export interface KpiRequesterScope {
  role: UserRole;
  userId: number;
  /** Filial do gerente; null para os demais perfis. */
  unitId: number | null;
}

export interface KpiIndicatorAccessFields {
  /** Filial do indicador; null = corporativo ou legado não-casado. */
  unitId: number | null;
  responsibleUserId: number | null;
  /** True when this is a corporate (rollup) indicator. */
  isCorporate: boolean;
  /** True when this is an LMS-computed indicator (computedSource='lms'). */
  isLms: boolean;
}

export type KpiAction =
  | "view"
  | "createUnit"
  | "createCorporate"
  | "editDefinition"
  | "operate"
  | "delete";

function isAdmin(role: UserRole): boolean {
  return role === "org_admin" || role === "platform_admin";
}

/**
 * Matriz única de permissão do módulo de Indicadores. Espelhada em
 * `artifacts/web/src/lib/kpi-access.ts` — manter as duas em sync.
 */
export function canActOnKpiIndicator(
  scope: KpiRequesterScope,
  ind: KpiIndicatorAccessFields,
  action: KpiAction,
): boolean {
  if (isAdmin(scope.role)) return true;

  const isOwner = ind.responsibleUserId !== null && ind.responsibleUserId === scope.userId;
  const inMyUnit = scope.unitId !== null && ind.unitId === scope.unitId;

  if (scope.role === "manager") {
    switch (action) {
      case "view":
      case "operate":
        return inMyUnit || ind.isCorporate || ind.isLms;
      case "editDefinition":
        return inMyUnit || ind.isCorporate;
      case "delete":
        return inMyUnit && !ind.isCorporate;
      case "createUnit":
        return inMyUnit; // ind.unitId = filial alvo
      case "createCorporate":
        return true;
      default:
        return false;
    }
  }

  if (scope.role === "operator") {
    switch (action) {
      case "view":
      case "operate":
        return isOwner;
      default:
        return false;
    }
  }

  if (scope.role === "analyst") {
    return action === "view" && (isOwner || ind.isLms);
  }

  return false;
}
