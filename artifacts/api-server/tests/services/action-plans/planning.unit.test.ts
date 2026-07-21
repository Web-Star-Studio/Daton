import { describe, expect, it } from "vitest";
import {
  extractPlanning,
  normalizePlanning,
  planningChanged,
} from "../../../src/services/action-plans/planning";

describe("extractPlanning", () => {
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

  it("mantém só os dois campos do bloco, ignorando o resto da linha", () => {
    const block = extractPlanning({
      rootCause: "Causa",
      analyses: null,
      // campos que existem na linha mas não pertencem ao bloco
      title: "irrelevante",
    } as unknown as Parameters<typeof extractPlanning>[0]);
    expect(block).toEqual({ rootCause: "Causa", analyses: null });
  });
});

describe("normalizePlanning", () => {
  it("não carrega mais plan5w2h nem rootCauseWhys", () => {
    const block = normalizePlanning({ rootCause: "x", analyses: null });
    expect(block).not.toHaveProperty("plan5w2h");
    expect(block).not.toHaveProperty("rootCauseWhys");
  });

  it("colapsa lista vazia de tratativas para null", () => {
    expect(
      normalizePlanning({ rootCause: null, analyses: [] }).analyses,
    ).toBeNull();
  });

  // O formulário manda `null` quando o bloco é esvaziado; o banco pode ter `""` ou `[]`.
  // Tratar todas essas formas como "vazio" evita versões-fantasma no histórico.
  it("colapsa causa raiz em branco e lista vazia para a mesma vazidade", () => {
    expect(normalizePlanning({ rootCause: "  ", analyses: [] })).toEqual({
      rootCause: null,
      analyses: null,
    });
  });

  it("normaliza o conteúdo de dentro da tratativa", () => {
    const block = normalizePlanning({
      rootCause: "  ",
      analyses: [{ key: "five_whys", data: { whys: ["  a  ", ""] } }],
    });
    expect(block.rootCause).toBeNull();
    expect(block.analyses).toEqual([
      { key: "five_whys", data: { whys: ["a"] } },
    ]);
  });

  it("apara a causa raiz preenchida", () => {
    expect(
      normalizePlanning({ rootCause: "  Causa  ", analyses: null }),
    ).toEqual({ rootCause: "Causa", analyses: null });
  });
});

describe("planningChanged", () => {
  it("é false para o mesmo conteúdo", () => {
    const block = {
      rootCause: "Causa",
      analyses: [{ key: "a3" as const, data: { goal: "meta" } }],
    };
    expect(planningChanged(block, { ...block })).toBe(false);
  });

  it("detecta mudança DENTRO de uma tratativa", () => {
    const before = {
      rootCause: null,
      analyses: [{ key: "five_whys" as const, data: { whys: ["a"] } }],
    };
    const after = {
      rootCause: null,
      analyses: [{ key: "five_whys" as const, data: { whys: ["a", "b"] } }],
    };
    expect(planningChanged(before, after)).toBe(true);
  });

  it("um autosave que só passeia pelo formulário NÃO é uma mudança", () => {
    const before = {
      rootCause: "x",
      analyses: [{ key: "a3" as const, data: { goal: "meta" } }],
    };
    const after = {
      rootCause: " x ",
      analyses: [{ key: "a3" as const, data: { goal: "  meta  " } }],
    };
    expect(planningChanged(before, after)).toBe(false);
  });

  it("adicionar uma tratativa vazia É uma mudança (foi decisão do usuário)", () => {
    const before = { rootCause: null, analyses: null };
    const after = {
      rootCause: null,
      analyses: [{ key: "fmea" as const, data: { rows: [] } }],
    };
    expect(planningChanged(before, after)).toBe(true);
  });

  it("ignora a ordem das chaves de objeto dentro de uma tratativa", () => {
    const before = {
      rootCause: null,
      analyses: [
        { key: "a3" as const, data: { goal: "meta", background: "ctx" } },
      ],
    };
    const after = {
      rootCause: null,
      analyses: [
        { key: "a3" as const, data: { background: "ctx", goal: "meta" } },
      ],
    };
    expect(planningChanged(before, after)).toBe(false);
  });

  it("trata null e lista vazia como a mesma vazidade", () => {
    const a = { rootCause: null, analyses: null };
    const b = { rootCause: "", analyses: [] };
    expect(planningChanged(a, b)).toBe(false);
  });

  it("é sensível à ordem dos porquês dentro da tratativa (é uma cadeia, não um conjunto)", () => {
    const a = {
      rootCause: null,
      analyses: [{ key: "five_whys" as const, data: { whys: ["a", "b"] } }],
    };
    const b = {
      rootCause: null,
      analyses: [{ key: "five_whys" as const, data: { whys: ["b", "a"] } }],
    };
    expect(planningChanged(a, b)).toBe(true);
  });

  it("é true quando a causa raiz muda", () => {
    const before = { rootCause: "Causa", analyses: null };
    const after = { rootCause: "Outra causa", analyses: null };
    expect(planningChanged(before, after)).toBe(true);
  });
});
