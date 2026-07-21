import { describe, expect, it } from "vitest";
import {
  MAX_TREE_DEPTH,
  analysisHasContent,
  emptyAnalysisData,
  normalizeAnalyses,
  parseAnalyses,
} from "../../artifacts/api-server/src/services/action-plans/analyses";
import { ACTION_PLAN_ANALYSIS_METHOD_KEYS, KT_DIMENSIONS } from "@workspace/db";

/** Uma cadeia de `depth` níveis: cada nó tem exatamente um filho. */
function deepFaultTree(depth: number): unknown {
  let node: Record<string, unknown> = {
    id: `n${depth}`,
    text: "folha",
    gate: "OR",
    children: [],
  };
  for (let i = depth - 1; i >= 1; i--) {
    node = { id: `n${i}`, text: "no", gate: "OR", children: [node] };
  }
  return node;
}

function deepRcaApollo(depth: number): unknown {
  let node: Record<string, unknown> = {
    id: `n${depth}`,
    text: "folha",
    type: "condition",
    children: [],
  };
  for (let i = depth - 1; i >= 1; i--) {
    node = { id: `n${i}`, text: "no", type: "condition", children: [node] };
  }
  return node;
}

describe("parseAnalyses", () => {
  it("aceita uma tratativa válida", () => {
    const r = parseAnalyses([{ key: "five_whys", data: { whys: ["a", "b"] } }]);
    expect(r.ok).toBe(true);
  });

  it("rejeita chave duplicada", () => {
    const r = parseAnalyses([
      { key: "five_whys", data: { whys: [] } },
      { key: "five_whys", data: { whys: [] } },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejeita chave desconhecida", () => {
    const r = parseAnalyses([{ key: "seis_sigma", data: {} }]);
    expect(r.ok).toBe(false);
  });

  it("rejeita data que não casa com a chave", () => {
    const r = parseAnalyses([{ key: "fmea", data: { whys: ["a"] } }]);
    expect(r.ok).toBe(false);
  });

  it("rejeita escala FMEA fora de 1..10", () => {
    const r = parseAnalyses([
      { key: "fmea", data: { rows: [{ id: "1", severity: 11 }] } },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejeita Kepner-Tregoe sem as 4 dimensões fixas", () => {
    const r = parseAnalyses([
      {
        key: "kepner_tregoe",
        data: { rows: [{ dimension: "o_que" }], possibleCauses: [] },
      },
    ]);
    expect(r.ok).toBe(false);
  });

  it("aceita árvore aninhada", () => {
    const r = parseAnalyses([
      {
        key: "fault_tree",
        data: {
          topEvent: "Veículo rodou irregular",
          nodes: [
            {
              id: "n1",
              text: "Teste não conferido",
              gate: "OR",
              children: [
                { id: "n2", text: "Sem treinamento", gate: "OR", children: [] },
              ],
            },
          ],
        },
      },
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejeita Kepner-Tregoe com as 4 dimensões fora da ordem canônica", () => {
    const r = parseAnalyses([
      {
        key: "kepner_tregoe",
        data: {
          rows: [
            { dimension: "onde" },
            { dimension: "o_que" },
            { dimension: "quando" },
            { dimension: "extensao" },
          ],
          possibleCauses: [],
        },
      },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("limite de profundidade das árvores", () => {
  it("aceita uma árvore dentro do limite", () => {
    const r = parseAnalyses([
      { key: "fault_tree", data: { nodes: [deepFaultTree(MAX_TREE_DEPTH)] } },
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejeita uma árvore que excede o limite (em vez de estourar a pilha)", () => {
    const r = parseAnalyses([
      {
        key: "fault_tree",
        data: { nodes: [deepFaultTree(MAX_TREE_DEPTH + 1)] },
      },
    ]);
    expect(r.ok).toBe(false);
  });

  it("payload absurdamente profundo devolve { ok: false } SEM lançar RangeError", () => {
    // O parse é a guarda de escrita do servidor: um payload forjado de poucos KB
    // não pode virar exceção não tratada (era um RangeError escapando do safeParse).
    expect(() => {
      const r = parseAnalyses([
        { key: "fault_tree", data: { nodes: [deepFaultTree(10_000)] } },
      ]);
      expect(r.ok).toBe(false);
    }).not.toThrow();
  });

  it("o mesmo vale para a árvore do RCA Apollo", () => {
    expect(() => {
      const r = parseAnalyses([
        { key: "rca_apollo", data: { causes: [deepRcaApollo(10_000)] } },
      ]);
      expect(r.ok).toBe(false);
    }).not.toThrow();
  });
});

describe("emptyAnalysisData", () => {
  it("produz um data vazio VÁLIDO para cada uma das 8 chaves", () => {
    for (const key of ACTION_PLAN_ANALYSIS_METHOD_KEYS) {
      const r = parseAnalyses([{ key, data: emptyAnalysisData(key) }]);
      expect(r.ok, `chave ${key}`).toBe(true);
    }
  });

  it("o KT vazio já vem com as 4 dimensões", () => {
    const data = emptyAnalysisData("kepner_tregoe") as { rows: unknown[] };
    expect(data.rows).toHaveLength(4);
  });
});

describe("normalizeAnalyses", () => {
  it("descarta porquês vazios mas preserva a ordem (é uma cadeia, não um conjunto)", () => {
    const [a] = normalizeAnalyses([
      { key: "five_whys", data: { whys: ["  a  ", "", "   ", "b"] } },
    ]);
    expect(a).toEqual({ key: "five_whys", data: { whys: ["a", "b"] } });
  });

  it("descarta linha de FMEA sem nenhum campo preenchido", () => {
    const [a] = normalizeAnalyses([
      {
        key: "fmea",
        data: {
          rows: [{ id: "1", failureMode: "Falha real" }, { id: "2" }],
        },
      },
    ]);
    expect((a.data as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it("PRESERVA a tratativa cujo data ficou vazio — o usuário a adicionou de propósito", () => {
    const out = normalizeAnalyses([{ key: "a3", data: {} }]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("a3");
  });

  it("zera selectedCauseId órfão em vez de rejeitar (a causa pode ter sido apagada)", () => {
    const [a] = normalizeAnalyses([
      {
        key: "ishikawa",
        data: {
          causes: [{ id: "c1", category: "metodo", text: "Sem conferência" }],
          selectedCauseId: "c99",
          whys: [],
        },
      },
    ]);
    expect(
      (a.data as { selectedCauseId?: string }).selectedCauseId,
    ).toBeUndefined();
  });

  it("zera mostProbableCauseId órfão do Kepner-Tregoe (caso simétrico do Ishikawa)", () => {
    const [a] = normalizeAnalyses([
      {
        key: "kepner_tregoe",
        data: {
          rows: KT_DIMENSIONS.map((dimension) => ({ dimension })),
          possibleCauses: [{ id: "c1", text: "Falta de conferência" }],
          mostProbableCauseId: "c99",
        },
      },
    ]);
    expect(
      (a.data as { mostProbableCauseId?: string }).mostProbableCauseId,
    ).toBeUndefined();
  });

  it("descarta nó de árvore sem texto, junto da sua subárvore vazia", () => {
    const [a] = normalizeAnalyses([
      {
        key: "fault_tree",
        data: {
          nodes: [
            { id: "n1", text: "real", gate: "OR", children: [] },
            {
              id: "n2",
              gate: "OR",
              children: [{ id: "n3", gate: "OR", children: [] }],
            },
          ],
        },
      },
    ]);
    expect((a.data as { nodes: unknown[] }).nodes).toHaveLength(1);
  });

  it("um nó sem texto MAS com filho com texto sobrevive (não pode sumir com o filho)", () => {
    const [a] = normalizeAnalyses([
      {
        key: "fault_tree",
        data: {
          nodes: [
            {
              id: "n2",
              gate: "AND",
              children: [{ id: "n3", text: "real", gate: "OR", children: [] }],
            },
          ],
        },
      },
    ]);
    expect((a.data as { nodes: unknown[] }).nodes).toHaveLength(1);
  });
});

describe("analysisHasContent", () => {
  it("tratativa recém-adicionada não tem conteúdo", () => {
    expect(
      analysisHasContent({ key: "a3", data: emptyAnalysisData("a3") } as never),
    ).toBe(false);
  });

  it("tratativa preenchida tem conteúdo", () => {
    expect(
      analysisHasContent({ key: "five_whys", data: { whys: ["porque sim"] } }),
    ).toBe(true);
  });
});
