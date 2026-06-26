import { describe, expect, it } from "vitest";
import type { KpiYearRow, RoadSafetyFactor } from "@workspace/api-client-react";
import {
  buildLinkedIndicatorMap,
  factorCurrentValue,
  factorGoalValue,
  factorMeasureUnit,
  isLinkedToIndicator,
} from "@/lib/road-safety-client";

const mv = (month: number, value: number | null) =>
  ({
    month,
    value,
    monthlyValueId: null,
    justification: null,
    justificationsCount: 0,
    actionPlansCount: 0,
  }) as KpiYearRow["monthlyValues"][number];

function row(id: number, monthlyValues: KpiYearRow["monthlyValues"]): KpiYearRow {
  return {
    indicator: {
      id,
      organizationId: 1,
      name: `Ind ${id}`,
      measurement: "",
      formulaVariables: [],
      formulaExpression: "",
      unit: "Corporativo",
      measureUnit: "%",
      direction: "down",
      periodicity: "monthly",
      norms: [],
      createdAt: "",
      updatedAt: "",
    },
    yearConfig: {
      id: 1,
      organizationId: 1,
      indicatorId: id,
      year: 2026,
      goal: 4,
      createdAt: "",
      updatedAt: "",
    },
    monthlyValues,
    feedStatus: "fed",
  } as KpiYearRow;
}

describe("buildLinkedIndicatorMap", () => {
  it("pega o último mês não-nulo como valor atual e a meta do ano", () => {
    const map = buildLinkedIndicatorMap([row(7, [mv(1, 5), mv(2, null), mv(3, 4.2)])]);
    const info = map.get(7)!;
    expect(info.latestValue).toBe(4.2);
    expect(info.latestMonth).toBe(3);
    expect(info.goal).toBe(4);
    expect(info.measureUnit).toBe("%");
  });

  it("ignora ordem do array e ainda pega o maior mês preenchido", () => {
    const map = buildLinkedIndicatorMap([row(9, [mv(3, 4.2), mv(1, 5)])]);
    expect(map.get(9)!.latestValue).toBe(4.2);
    expect(map.get(9)!.latestMonth).toBe(3);
  });

  it("latestValue null quando não há mês preenchido", () => {
    const map = buildLinkedIndicatorMap([row(8, [mv(1, null)])]);
    expect(map.get(8)!.latestValue).toBeNull();
  });
});

describe("helpers de valor efetivo", () => {
  const linked = { kpiIndicatorId: 7, latestValue: 1, goal: 2, measureUnit: "x" } as unknown as RoadSafetyFactor;
  const manual = { kpiIndicatorId: null, latestValue: 9, goal: 8, measureUnit: "un" } as unknown as RoadSafetyFactor;
  const info = {
    id: 7,
    name: "I",
    unit: null,
    measureUnit: "%",
    direction: "down" as const,
    latestValue: 4.2,
    latestMonth: 3,
    goal: 4,
  };

  it("vinculado usa o indicador", () => {
    expect(isLinkedToIndicator(linked)).toBe(true);
    expect(factorCurrentValue(linked, info)).toBe(4.2);
    expect(factorGoalValue(linked, info)).toBe(4);
    expect(factorMeasureUnit(linked, info)).toBe("%");
  });

  it("vinculado sem info (ainda carregando) cai no próprio fator", () => {
    expect(factorCurrentValue(linked, null)).toBe(1);
    expect(factorGoalValue(linked, undefined)).toBe(2);
  });

  it("não vinculado usa o próprio fator", () => {
    expect(isLinkedToIndicator(manual)).toBe(false);
    expect(factorCurrentValue(manual)).toBe(9);
    expect(factorGoalValue(manual)).toBe(8);
    expect(factorMeasureUnit(manual)).toBe("un");
  });
});
