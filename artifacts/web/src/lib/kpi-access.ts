export type KpiUserRole = "platform_admin" | "org_admin" | "operator" | "analyst" | "manager";

export interface KpiRequesterScope {
  role: KpiUserRole;
  userId: number;
  unitId: number | null;
}

export interface KpiIndicatorAccessFields {
  unitId: number | null;
  responsibleUserId: number | null;
  isCorporate: boolean;
}

export type KpiAction =
  | "view"
  | "createUnit"
  | "createCorporate"
  | "editDefinition"
  | "operate"
  | "delete";

function isAdmin(role: KpiUserRole): boolean {
  return role === "org_admin" || role === "platform_admin";
}

/** Espelho de artifacts/api-server/src/services/kpi/access.ts — manter em sync. */
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
      case "editDefinition":
      case "operate":
        return inMyUnit || ind.isCorporate;
      case "delete":
        return inMyUnit && !ind.isCorporate;
      case "createUnit":
        return inMyUnit;
      case "createCorporate":
        return true;
    }
  }
  if (scope.role === "operator") {
    return (action === "view" || action === "operate") && isOwner;
  }
  if (scope.role === "analyst") {
    return action === "view" && isOwner;
  }
  return false;
}
