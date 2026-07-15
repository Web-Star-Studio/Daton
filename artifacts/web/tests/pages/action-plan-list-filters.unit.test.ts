import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  buildActionPlanQuery,
  hasActiveFilters,
  type ListFilters,
} from "@/pages/app/planos-acao/_components/list-filters";

describe("EMPTY_FILTERS / hasActiveFilters", () => {
  it("EMPTY_FILTERS não tem filtro ativo", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("qualquer campo preenchido conta como ativo", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, effectiveness: "pending" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, dueWindow: "overdue" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, actionType: "corrective" })).toBe(true);
  });
});

describe("buildActionPlanQuery", () => {
  it("sem filtros e sem 'mine' → undefined", () => {
    expect(buildActionPlanQuery(EMPTY_FILTERS, {})).toBeUndefined();
  });

  it("mapeia cada campo para o query param correspondente", () => {
    const f: ListFilters = {
      status: "open",
      sourceModule: "improvement",
      responsibleUserId: "7",
      actionType: "corrective",
      priority: "high",
      effectiveness: "pending",
      dueWindow: "overdue",
    };
    expect(buildActionPlanQuery(f, {})).toEqual({
      status: "open",
      sourceModule: "improvement",
      responsibleUserId: 7,
      actionType: "corrective",
      priority: "high",
      effectiveness: "pending",
      dueWindow: "overdue",
    });
  });

  it("'mine' sobrescreve o responsável escolhido", () => {
    const f = { ...EMPTY_FILTERS, responsibleUserId: "7" };
    expect(buildActionPlanQuery(f, { mineUserId: 42 })).toEqual({ responsibleUserId: 42 });
  });
});
