import { describe, expect, it } from "vitest";
import {
  buildMeasurementLabel,
  evaluateFormula,
  extractVariableKeys,
  formulaToNaturalText,
  parseFormulaAst,
  parseNaturalFormula,
  slugifyKey,
  validateFormula,
} from "@/lib/formula-evaluator";

describe("evaluateFormula", () => {
  it("computes simple division", () => {
    expect(evaluateFormula("a / b", { a: 10, b: 4 })).toBe(2.5);
  });

  it("computes (a / b) * 100", () => {
    expect(evaluateFormula("(a / b) * 100", { a: 12, b: 200 })).toBe(6);
  });

  it("computes a * 100 / b", () => {
    expect(evaluateFormula("a * 100 / b", { a: 12, b: 200 })).toBe(6);
  });

  it("computes 100 - (a / b) * 100", () => {
    expect(evaluateFormula("100 - (a / b) * 100", { a: 1, b: 4 })).toBe(75);
  });

  it("returns null on division by zero", () => {
    expect(evaluateFormula("a / b", { a: 5, b: 0 })).toBe(null);
  });

  it("returns null when an input is null", () => {
    expect(evaluateFormula("a / b", { a: null, b: 4 })).toBe(null);
    expect(evaluateFormula("a / b", { a: 4, b: null })).toBe(null);
  });

  it("returns null when an input is missing", () => {
    expect(evaluateFormula("a / b", { a: 4 })).toBe(null);
  });

  it("supports parentheses precedence", () => {
    expect(evaluateFormula("(a + b) * c", { a: 1, b: 2, c: 3 })).toBe(9);
  });

  it("supports operator precedence without parens", () => {
    expect(evaluateFormula("a + b * c", { a: 1, b: 2, c: 3 })).toBe(7);
  });

  it("supports decimals with comma or dot", () => {
    expect(evaluateFormula("1,5 + a", { a: 0.5 })).toBe(2);
    expect(evaluateFormula("1.5 + 0.5", {})).toBe(2);
  });

  it("returns null on invalid syntax", () => {
    expect(evaluateFormula("a /", { a: 1 })).toBe(null);
    expect(evaluateFormula("(a / b", { a: 1, b: 2 })).toBe(null);
  });

  it("returns null for non-finite results", () => {
    expect(evaluateFormula("a / b * 0", { a: 1, b: 0 })).toBe(null);
  });

  it("is case-insensitive on identifiers", () => {
    expect(evaluateFormula("Total / TOTAL", { total: 4 })).toBe(1);
  });
});

describe("validateFormula", () => {
  it("rejects empty expression", () => {
    expect(validateFormula("", [])).toEqual({ ok: false, error: "Expressão vazia" });
  });

  it("rejects undeclared variable", () => {
    const result = validateFormula("a / b", [{ key: "a", label: "A" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("b");
  });

  it("rejects invalid characters", () => {
    const result = validateFormula("a $ b", [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects unbalanced parens", () => {
    const result = validateFormula("(a / b", [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("accepts valid expression with all declared vars", () => {
    const result = validateFormula("(a / b) * 100", [
      { key: "a", label: "Total atrasos" },
      { key: "b", label: "Total emitidos" },
    ]);
    expect(result.ok).toBe(true);
  });

  it("accepts expression with literals only", () => {
    expect(validateFormula("100 - 5", [])).toEqual({ ok: true });
  });
});

describe("extractVariableKeys", () => {
  it("returns unique keys", () => {
    expect(extractVariableKeys("(atrasos / total) * 100").sort()).toEqual(["atrasos", "total"]);
  });

  it("handles repeated keys", () => {
    expect(extractVariableKeys("a + a + b").sort()).toEqual(["a", "b"]);
  });

  it("returns [] for invalid expression", () => {
    expect(extractVariableKeys("a $$")).toEqual([]);
  });
});

describe("slugifyKey", () => {
  it("lowercases and replaces spaces", () => {
    expect(slugifyKey("Total de atrasos")).toBe("total_de_atrasos");
  });

  it("strips accents", () => {
    expect(slugifyKey("Número de veículos")).toBe("numero_de_veiculos");
  });

  it("handles hyphen and underscore", () => {
    expect(slugifyKey("CT-e emitidos")).toBe("ct_e_emitidos");
  });

  it("prefixes digit-starting labels", () => {
    expect(slugifyKey("3 meses")).toBe("var_3_meses");
  });

  it("returns 'var' for empty", () => {
    expect(slugifyKey("")).toBe("var");
    expect(slugifyKey("!!!")).toBe("var");
  });
});

describe("parseNaturalFormula", () => {
  it("extracts single-word variables", () => {
    const { variables, expression } = parseNaturalFormula("agua / area");
    expect(variables).toEqual([
      { key: "agua", label: "agua" },
      { key: "area", label: "area" },
    ]);
    expect(expression).toBe("agua / area");
  });

  it("extracts multi-word variables with spaces", () => {
    const { variables, expression } = parseNaturalFormula("(consumo de água / área plantada) * 100");
    expect(variables).toEqual([
      { key: "consumo_de_agua", label: "consumo de água" },
      { key: "area_plantada", label: "área plantada" },
    ]);
    expect(expression).toBe("(consumo_de_agua / area_plantada) * 100");
  });

  it("keeps numeric literals as numbers", () => {
    const { variables, expression } = parseNaturalFormula("100 - (a / b) * 100");
    expect(variables.map((v) => v.key)).toEqual(["a", "b"]);
    expect(expression).toBe("100 - (a / b) * 100");
  });

  it("treats x and × as multiplication", () => {
    const a = parseNaturalFormula("a x 100");
    const b = parseNaturalFormula("a × 100");
    expect(a.expression).toBe("a * 100");
    expect(b.expression).toBe("a * 100");
  });

  it("dedupes repeated variables", () => {
    const { variables } = parseNaturalFormula("a + a + b");
    expect(variables.map((v) => v.key)).toEqual(["a", "b"]);
  });

  it("returns empty for blank input", () => {
    expect(parseNaturalFormula("")).toEqual({ variables: [], expression: "" });
    expect(parseNaturalFormula("   ")).toEqual({ variables: [], expression: "" });
  });

  it("handles comma decimals", () => {
    const { expression } = parseNaturalFormula("a * 1,5");
    expect(expression).toBe("a * 1.5");
  });

  it("preserves variables when re-parsing the canonical expression", () => {
    const { variables, expression } = parseNaturalFormula("(total de atrasos / total emitidos) * 100");
    expect(evaluateFormula(expression, { total_de_atrasos: 12, total_emitidos: 200 })).toBe(6);
    expect(variables[0].label).toBe("total de atrasos");
  });
});

describe("formulaToNaturalText", () => {
  it("substitutes keys for labels without wrapping parens", () => {
    const text = formulaToNaturalText(
      [
        { key: "consumo_de_agua", label: "consumo de água" },
        { key: "area_plantada", label: "área plantada" },
      ],
      "(consumo_de_agua / area_plantada) * 100",
    );
    expect(text).toBe("(consumo de água / área plantada) * 100");
  });

  it("returns the round-trip text identical to user input", () => {
    const original = "(consumo de água / área plantada) * 100";
    const { variables, expression } = parseNaturalFormula(original);
    expect(formulaToNaturalText(variables, expression)).toBe(original);
  });

  it("returns empty for empty expression", () => {
    expect(formulaToNaturalText([], "")).toBe("");
  });
});

describe("parseFormulaAst", () => {
  it("parses a single variable", () => {
    const ast = parseFormulaAst("a", [{ key: "a", label: "Água" }]);
    expect(ast).toEqual({ type: "var", key: "a", label: "Água" });
  });

  it("parses a numeric literal", () => {
    expect(parseFormulaAst("100", [])).toEqual({ type: "num", value: 100 });
  });

  it("parses simple division left-associative", () => {
    const ast = parseFormulaAst("a / b", [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ]);
    expect(ast).toEqual({
      type: "op",
      op: "/",
      left: { type: "var", key: "a", label: "A" },
      right: { type: "var", key: "b", label: "B" },
    });
  });

  it("respects precedence: a + b * c", () => {
    const ast = parseFormulaAst("a + b * c", [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
      { key: "c", label: "C" },
    ]);
    expect(ast).toEqual({
      type: "op",
      op: "+",
      left: { type: "var", key: "a", label: "A" },
      right: {
        type: "op",
        op: "*",
        left: { type: "var", key: "b", label: "B" },
        right: { type: "var", key: "c", label: "C" },
      },
    });
  });

  it("respects parentheses: (a + b) * c", () => {
    const ast = parseFormulaAst("(a + b) * c", [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
      { key: "c", label: "C" },
    ]);
    expect(ast).toEqual({
      type: "op",
      op: "*",
      left: {
        type: "op",
        op: "+",
        left: { type: "var", key: "a", label: "A" },
        right: { type: "var", key: "b", label: "B" },
      },
      right: { type: "var", key: "c", label: "C" },
    });
  });

  it("parses (a/b)*100", () => {
    const ast = parseFormulaAst("(a / b) * 100", [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ]);
    expect(ast).toEqual({
      type: "op",
      op: "*",
      left: {
        type: "op",
        op: "/",
        left: { type: "var", key: "a", label: "A" },
        right: { type: "var", key: "b", label: "B" },
      },
      right: { type: "num", value: 100 },
    });
  });

  it("returns null on empty input", () => {
    expect(parseFormulaAst("", [])).toBe(null);
    expect(parseFormulaAst("   ", [])).toBe(null);
  });

  it("returns null on syntax errors", () => {
    expect(parseFormulaAst("a / ", [{ key: "a", label: "A" }])).toBe(null);
    expect(parseFormulaAst("(a / b", [{ key: "a", label: "A" }, { key: "b", label: "B" }])).toBe(null);
    expect(parseFormulaAst("a + + b", [{ key: "a", label: "A" }, { key: "b", label: "B" }])).toBe(null);
  });

  it("falls back to key when label missing", () => {
    const ast = parseFormulaAst("foo", []);
    expect(ast).toEqual({ type: "var", key: "foo", label: "foo" });
  });
});

describe("buildMeasurementLabel", () => {
  it("substitutes keys for labels", () => {
    const out = buildMeasurementLabel(
      [
        { key: "a", label: "Total atrasos" },
        { key: "b", label: "Total emitidos" },
      ],
      "(a / b) * 100",
    );
    expect(out).toBe("((Total atrasos) / (Total emitidos)) * 100");
  });

  it("leaves unknown identifiers untouched", () => {
    expect(buildMeasurementLabel([{ key: "a", label: "A" }], "a + xyz")).toBe("(A) + xyz");
  });

  it("returns empty for empty expression", () => {
    expect(buildMeasurementLabel([], "")).toBe("");
  });
});
