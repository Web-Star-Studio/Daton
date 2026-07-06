import { describe, it, expect } from "vitest";
import { canActOnKpiIndicator, type KpiRequesterScope, type KpiIndicatorAccessFields } from "@/lib/kpi-access";

const admin: KpiRequesterScope = { role: "org_admin", userId: 1, unitId: null };
const mgrU: KpiRequesterScope = { role: "manager", userId: 2, unitId: 10 };
const op: KpiRequesterScope = { role: "operator", userId: 3, unitId: null };
const an: KpiRequesterScope = { role: "analyst", userId: 4, unitId: null };

const indU10Resp3: KpiIndicatorAccessFields = { unitId: 10, responsibleUserId: 3, isCorporate: false, isLms: false };
const indU20Resp5: KpiIndicatorAccessFields = { unitId: 20, responsibleUserId: 5, isCorporate: false, isLms: false };
const corp: KpiIndicatorAccessFields = { unitId: null, responsibleUserId: 5, isCorporate: true, isLms: false };
const lmsInd: KpiIndicatorAccessFields = { unitId: null, responsibleUserId: null, isCorporate: false, isLms: true };

describe("kpi-access (web mirror)", () => {
  it("admin tudo", () => {
    expect(canActOnKpiIndicator(admin, corp, "delete")).toBe(true);
  });
  it("manager: filial + corp; deleta filial mas não corp", () => {
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "editDefinition")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "delete")).toBe(false);
    expect(canActOnKpiIndicator(mgrU, indU20Resp5, "view")).toBe(false);
  });
  it("operator opera só os seus, não edita definição", () => {
    expect(canActOnKpiIndicator(op, indU10Resp3, "operate")).toBe(true);
    expect(canActOnKpiIndicator(op, indU10Resp3, "editDefinition")).toBe(false);
    expect(canActOnKpiIndicator(op, indU20Resp5, "view")).toBe(false);
  });
  it("analyst só vê os seus", () => {
    expect(canActOnKpiIndicator(an, { unitId: null, responsibleUserId: 4, isCorporate: false, isLms: false }, "view")).toBe(true);
    expect(canActOnKpiIndicator(an, indU10Resp3, "operate")).toBe(false);
  });
});

describe("kpi-access (web mirror) — LMS indicator", () => {
  it("manager pode view e operate em LMS, mas não editDefinition nem delete", () => {
    expect(canActOnKpiIndicator(mgrU, lmsInd, "view")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, lmsInd, "operate")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, lmsInd, "editDefinition")).toBe(false);
    expect(canActOnKpiIndicator(mgrU, lmsInd, "delete")).toBe(false);
  });
  it("analyst pode view em LMS", () => {
    expect(canActOnKpiIndicator(an, lmsInd, "view")).toBe(true);
  });
  it("operator não vê indicador LMS", () => {
    expect(canActOnKpiIndicator(op, lmsInd, "view")).toBe(false);
  });
});
