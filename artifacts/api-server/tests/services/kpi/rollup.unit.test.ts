import { describe, expect, it, vi } from "vitest";

// Mock @workspace/db so this unit test runs without DATABASE_URL
vi.mock("@workspace/db", () => ({
  db: {},
  kpiIndicatorRollupsTable: {},
  kpiIndicatorsTable: {},
  kpiMonthlyValuesTable: {},
  kpiYearConfigsTable: {},
}));

import { aggregateByStrategy } from "../../../src/services/kpi/rollup";

describe("aggregateByStrategy", () => {
  it("soma os valores (sum_values)", () => {
    expect(aggregateByStrategy([1, 1, 1], "sum_values")).toBe(3);
  });
  it("calcula a média (average)", () => {
    expect(aggregateByStrategy([1, 1, 4], "average")).toBe(2);
  });
  it("pega o mínimo (min)", () => {
    expect(aggregateByStrategy([3, 1, 2], "min")).toBe(1);
  });
  it("pega o máximo (max)", () => {
    expect(aggregateByStrategy([3, 1, 2], "max")).toBe(3);
  });
  it("trata sum_inputs como soma (fallback de meta)", () => {
    expect(aggregateByStrategy([1, 2], "sum_inputs")).toBe(3);
  });
  it("retorna null para lista vazia", () => {
    expect(aggregateByStrategy([], "average")).toBeNull();
  });
  it("funciona com um único valor", () => {
    expect(aggregateByStrategy([5], "average")).toBe(5);
  });
});
