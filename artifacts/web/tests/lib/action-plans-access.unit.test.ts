import { describe, expect, it } from "vitest";
import { canViewActionPlan, type ActionPlanAccessFields, type ActionPlanRequesterScope } from "@/lib/action-plans-access";

const plan = (o: Partial<ActionPlanAccessFields>): ActionPlanAccessFields => ({
  unitId: null,
  responsibleUserId: null,
  coResponsibleUserIds: [],
  effectivenessEvaluatorUserId: null,
  ...o,
});
const scope = (o: Partial<ActionPlanRequesterScope>): ActionPlanRequesterScope => ({
  role: "operator",
  userId: 1,
  unitId: null,
  ...o,
});

describe("canViewActionPlan", () => {
  it("admin vê qualquer plano", () => {
    for (const role of ["org_admin", "platform_admin"] as const) {
      expect(canViewActionPlan(scope({ role, userId: 9 }), plan({ unitId: 5 }))).toBe(true);
    }
  });
  it("analista vê tudo (auditor)", () => {
    expect(canViewActionPlan(scope({ role: "analyst", userId: 9 }), plan({ unitId: 5 }))).toBe(true);
    expect(canViewActionPlan(scope({ role: "analyst", userId: 9 }), plan({ unitId: null }))).toBe(true);
  });
  it("operador vê só onde é ponto focal / co-responsável / avaliador", () => {
    const s = scope({ role: "operator", userId: 7 });
    expect(canViewActionPlan(s, plan({ responsibleUserId: 7 }))).toBe(true);
    expect(canViewActionPlan(s, plan({ coResponsibleUserIds: [3, 7] }))).toBe(true);
    expect(canViewActionPlan(s, plan({ effectivenessEvaluatorUserId: 7 }))).toBe(true);
    expect(canViewActionPlan(s, plan({ responsibleUserId: 8, unitId: 5 }))).toBe(false);
  });
  it("gestor vê a filial dele, corporativo, e onde é pessoal; não vê filial alheia", () => {
    const s = scope({ role: "manager", userId: 7, unitId: 5 });
    expect(canViewActionPlan(s, plan({ unitId: 5 }))).toBe(true); // minha filial
    expect(canViewActionPlan(s, plan({ unitId: null }))).toBe(true); // corporativo
    expect(canViewActionPlan(s, plan({ unitId: 8, responsibleUserId: 7 }))).toBe(true); // pessoal, outra filial
    expect(canViewActionPlan(s, plan({ unitId: 8 }))).toBe(false); // filial alheia, não-pessoal
  });
});
