import { describe, it, expect } from "vitest";
import { canActOnKpiIndicator, type KpiRequesterScope, type KpiIndicatorAccessFields } from "../../../src/services/kpi/access";

const admin: KpiRequesterScope = { role: "org_admin", userId: 1, unitId: null };
const platform: KpiRequesterScope = { role: "platform_admin", userId: 9, unitId: null };
const mgrU: KpiRequesterScope = { role: "manager", userId: 2, unitId: 10 };
const op: KpiRequesterScope = { role: "operator", userId: 3, unitId: null };
const an: KpiRequesterScope = { role: "analyst", userId: 4, unitId: null };

const indU10Resp3: KpiIndicatorAccessFields = { unitId: 10, responsibleUserId: 3, isCorporate: false };
const indU20Resp5: KpiIndicatorAccessFields = { unitId: 20, responsibleUserId: 5, isCorporate: false };
const corp: KpiIndicatorAccessFields = { unitId: null, responsibleUserId: 5, isCorporate: true };

describe("canActOnKpiIndicator — view", () => {
  it("admin e platform veem tudo", () => {
    for (const i of [indU10Resp3, indU20Resp5, corp]) {
      expect(canActOnKpiIndicator(admin, i, "view")).toBe(true);
      expect(canActOnKpiIndicator(platform, i, "view")).toBe(true);
    }
  });
  it("manager vê a própria filial e corporativos, não outras filiais", () => {
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "view")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "view")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, indU20Resp5, "view")).toBe(false);
  });
  it("operator/analyst veem só onde são responsáveis", () => {
    expect(canActOnKpiIndicator(op, indU10Resp3, "view")).toBe(true);
    expect(canActOnKpiIndicator(op, indU20Resp5, "view")).toBe(false);
    expect(canActOnKpiIndicator(an, indU10Resp3, "view")).toBe(false); // resp=3, an=4
    expect(canActOnKpiIndicator(an, { unitId: null, responsibleUserId: 4, isCorporate: false }, "view")).toBe(true); // analyst owns it
  });
});

describe("canActOnKpiIndicator — operate", () => {
  it("operator opera só os seus", () => {
    expect(canActOnKpiIndicator(op, indU10Resp3, "operate")).toBe(true);
    expect(canActOnKpiIndicator(op, indU20Resp5, "operate")).toBe(false);
  });
  it("analyst nunca opera", () => {
    expect(canActOnKpiIndicator(an, { unitId: null, responsibleUserId: 4, isCorporate: false }, "operate")).toBe(false);
  });
  it("manager opera filial + corp", () => {
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "operate")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "operate")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, indU20Resp5, "operate")).toBe(false);
  });
});

describe("canActOnKpiIndicator — editDefinition / delete / create", () => {
  it("operator/analyst não editam definição nem criam nem deletam", () => {
    for (const a of ["editDefinition", "delete", "createUnit", "createCorporate"] as const) {
      expect(canActOnKpiIndicator(op, indU10Resp3, a)).toBe(false);
      expect(canActOnKpiIndicator(an, indU10Resp3, a)).toBe(false);
    }
  });
  it("manager edita definição da filial e de corp, mas só deleta filial própria (não corp)", () => {
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "editDefinition")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "editDefinition")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "delete")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "delete")).toBe(false);
    expect(canActOnKpiIndicator(mgrU, indU20Resp5, "delete")).toBe(false);
  });
  it("manager cria na própria filial e cria corporativo", () => {
    expect(canActOnKpiIndicator(mgrU, { unitId: 10, responsibleUserId: null, isCorporate: false }, "createUnit")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, { unitId: 20, responsibleUserId: null, isCorporate: false }, "createUnit")).toBe(false);
    expect(canActOnKpiIndicator(mgrU, { unitId: null, responsibleUserId: null, isCorporate: true }, "createCorporate")).toBe(true);
  });
  it("admin pode tudo", () => {
    for (const a of ["view", "operate", "editDefinition", "delete", "createUnit", "createCorporate"] as const) {
      expect(canActOnKpiIndicator(admin, corp, a)).toBe(true);
    }
  });
});
