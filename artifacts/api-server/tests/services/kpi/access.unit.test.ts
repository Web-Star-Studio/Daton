import { describe, it, expect } from "vitest";
import { canActOnKpiIndicator, isCorporateIndicator, type KpiRequesterScope, type KpiIndicatorAccessFields } from "../../../src/services/kpi/access";

const admin: KpiRequesterScope = { role: "org_admin", userId: 1, unitId: null };
const platform: KpiRequesterScope = { role: "platform_admin", userId: 9, unitId: null };
const mgrU: KpiRequesterScope = { role: "manager", userId: 2, unitId: 10 };
const op: KpiRequesterScope = { role: "operator", userId: 3, unitId: null };
const an: KpiRequesterScope = { role: "analyst", userId: 4, unitId: null };

const indU10Resp3: KpiIndicatorAccessFields = { unitId: 10, responsibleUserId: 3, isCorporate: false, isLms: false };
const indU20Resp5: KpiIndicatorAccessFields = { unitId: 20, responsibleUserId: 5, isCorporate: false, isLms: false };
const corp: KpiIndicatorAccessFields = { unitId: null, responsibleUserId: 5, isCorporate: true, isLms: false };
const lmsInd: KpiIndicatorAccessFields = { unitId: null, responsibleUserId: null, isCorporate: false, isLms: true };

describe("isCorporateIndicator", () => {
  it("rollup parent é corporativo", () => {
    expect(isCorporateIndicator({ rollupStrategy: "avg", unit: null })).toBe(true);
  });
  it("unit 'Corporativo' (manual/legado) é corporativo", () => {
    expect(isCorporateIndicator({ rollupStrategy: null, unit: "Corporativo" })).toBe(true);
  });
  it("unit 'corporativo ' (case/espaço) é corporativo", () => {
    expect(isCorporateIndicator({ rollupStrategy: null, unit: "corporativo " })).toBe(true);
  });
  it("unit de filial (ex.: 'POA') não é corporativo", () => {
    expect(isCorporateIndicator({ rollupStrategy: null, unit: "POA" })).toBe(false);
  });
  it("unit null + rollup null não é corporativo (leaf não-casado)", () => {
    expect(isCorporateIndicator({ rollupStrategy: null, unit: null })).toBe(false);
  });
});

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
    expect(canActOnKpiIndicator(an, { unitId: null, responsibleUserId: 4, isCorporate: false, isLms: false }, "view")).toBe(true); // analyst owns it
  });
});

describe("canActOnKpiIndicator — operate", () => {
  it("operator opera só os seus", () => {
    expect(canActOnKpiIndicator(op, indU10Resp3, "operate")).toBe(true);
    expect(canActOnKpiIndicator(op, indU20Resp5, "operate")).toBe(false);
  });
  it("analyst nunca opera", () => {
    expect(canActOnKpiIndicator(an, { unitId: null, responsibleUserId: 4, isCorporate: false, isLms: false }, "operate")).toBe(false);
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
    expect(canActOnKpiIndicator(mgrU, { unitId: 10, responsibleUserId: null, isCorporate: false, isLms: false }, "createUnit")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, { unitId: 20, responsibleUserId: null, isCorporate: false, isLms: false }, "createUnit")).toBe(false);
    expect(canActOnKpiIndicator(mgrU, { unitId: null, responsibleUserId: null, isCorporate: true, isLms: false }, "createCorporate")).toBe(true);
  });
  it("admin pode tudo", () => {
    for (const a of ["view", "operate", "editDefinition", "delete", "createUnit", "createCorporate"] as const) {
      expect(canActOnKpiIndicator(admin, corp, a)).toBe(true);
    }
  });
});

describe("canActOnKpiIndicator — LMS indicator (isLms=true)", () => {
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
