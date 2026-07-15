import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ANALYSIS_REGISTRY,
  emptyAnalysisData,
  resumoAnalise,
} from "@/pages/app/planos-acao/_components/analises/registry";
import {
  ANALYSIS_METHOD_KEYS,
  fmeaRpn,
} from "@/pages/app/planos-acao/_components/analises/types";

describe("registry das tratativas", () => {
  it("cobre as 8 chaves", () => {
    for (const key of ANALYSIS_METHOD_KEYS) {
      expect(ANALYSIS_REGISTRY[key], `chave ${key}`).toBeDefined();
    }
  });

  it("o KT vazio já nasce com as 4 dimensões", () => {
    const data = emptyAnalysisData("kepner_tregoe") as { rows: unknown[] };
    expect(data.rows).toHaveLength(4);
  });

  it("resume o FMEA com a contagem e o maior RPN", () => {
    const texto = resumoAnalise({
      key: "fmea",
      data: {
        rows: [
          {
            id: "1",
            failureMode: "A",
            severity: 8,
            occurrence: 4,
            detection: 3,
          },
          {
            id: "2",
            failureMode: "B",
            severity: 2,
            occurrence: 2,
            detection: 2,
          },
        ],
      },
    });
    expect(texto).toContain("2 modos de falha");
    expect(texto).toContain("96");
  });

  it("tratativa vazia resume como vazia", () => {
    expect(resumoAnalise({ key: "a3", data: {} })).toBe("Não preenchida");
  });
});

describe("RPN", () => {
  it("é S × O × D", () => {
    expect(fmeaRpn({ severity: 8, occurrence: 4, detection: 3 })).toBe(96);
  });

  it("é null enquanto faltar qualquer um dos três", () => {
    expect(fmeaRpn({ severity: 8, occurrence: 4 })).toBeNull();
    expect(fmeaRpn({})).toBeNull();
  });
});

describe("FMEA", () => {
  it("mostra o RPN calculado — o usuário nunca o digita", () => {
    const { Component } = ANALYSIS_REGISTRY.fmea;
    render(
      <Component
        data={{
          rows: [
            {
              id: "1",
              failureMode: "X",
              severity: 8,
              occurrence: 4,
              detection: 3,
            },
          ],
        }}
        onChange={() => {}}
        readOnly
      />,
    );
    expect(screen.getByText("96")).toBeInTheDocument();
  });
});
