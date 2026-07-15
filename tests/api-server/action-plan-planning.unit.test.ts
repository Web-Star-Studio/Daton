import { describe, expect, it } from "vitest";
import {
  extractPlanning,
  normalizePlanning,
  planningChanged,
} from "../../artifacts/api-server/src/services/action-plans/planning";

describe("PlanningBlock com tratativas", () => {
  it("extrai causa raiz e tratativas", () => {
    const block = extractPlanning({
      rootCause: "Falta de treinamento",
      analyses: [{ key: "five_whys", data: { whys: ["a"] } }],
    });
    expect(block).toEqual({
      rootCause: "Falta de treinamento",
      analyses: [{ key: "five_whys", data: { whys: ["a"] } }],
    });
  });

  it("não carrega mais plan5w2h nem rootCauseWhys", () => {
    const block = normalizePlanning({ rootCause: "x", analyses: null });
    expect(block).not.toHaveProperty("plan5w2h");
    expect(block).not.toHaveProperty("rootCauseWhys");
  });

  it("colapsa lista vazia de tratativas para null", () => {
    expect(normalizePlanning({ rootCause: null, analyses: [] }).analyses).toBeNull();
  });

  it("normaliza o conteúdo de dentro da tratativa", () => {
    const block = normalizePlanning({
      rootCause: "  ",
      analyses: [{ key: "five_whys", data: { whys: ["  a  ", ""] } }],
    });
    expect(block.rootCause).toBeNull();
    expect(block.analyses).toEqual([{ key: "five_whys", data: { whys: ["a"] } }]);
  });

  it("detecta mudança DENTRO de uma tratativa", () => {
    const before = { rootCause: null, analyses: [{ key: "five_whys" as const, data: { whys: ["a"] } }] };
    const after = { rootCause: null, analyses: [{ key: "five_whys" as const, data: { whys: ["a", "b"] } }] };
    expect(planningChanged(before, after)).toBe(true);
  });

  it("um autosave que só passeia pelo formulário NÃO é uma mudança", () => {
    const before = { rootCause: "x", analyses: [{ key: "a3" as const, data: { goal: "meta" } }] };
    const after = { rootCause: " x ", analyses: [{ key: "a3" as const, data: { goal: "  meta  " } }] };
    expect(planningChanged(before, after)).toBe(false);
  });

  it("adicionar uma tratativa vazia É uma mudança (foi decisão do usuário)", () => {
    const before = { rootCause: null, analyses: null };
    const after = { rootCause: null, analyses: [{ key: "fmea" as const, data: { rows: [] } }] };
    expect(planningChanged(before, after)).toBe(true);
  });
});
