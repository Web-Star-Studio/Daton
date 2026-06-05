import { describe, expect, it } from "vitest";
import {
  DEFAULT_SWOT_TOLERANCES,
  encodeObjectiveRef,
  parseObjectiveRef,
  swotDecision,
  swotResult,
} from "@/lib/swot-client";

describe("swotResult", () => {
  it("multiplies performance by relevance (1-4 scale → 1-16)", () => {
    expect(swotResult(4, 4)).toBe(16);
    expect(swotResult(2, 4)).toBe(8);
    expect(swotResult(1, 3)).toBe(3);
    expect(swotResult(3, 3)).toBe(9);
  });
});

describe("swotDecision (FPLAN — requer ação a partir de ≥ 8)", () => {
  it("força é sempre 'positivo', independentemente do resultado", () => {
    expect(swotDecision("strength", 16)).toBe("positivo");
    expect(swotDecision("strength", 8)).toBe("positivo");
    expect(swotDecision("strength", 4)).toBe("positivo");
  });

  it("fraqueza/oportunidade/ameaça requerem plano de ação com resultado ≥ 8", () => {
    expect(swotDecision("weakness", 8)).toBe("requer");
    expect(swotDecision("opportunity", 9)).toBe("requer");
    expect(swotDecision("threat", 9)).toBe("requer");
  });

  it("fraqueza/oportunidade/ameaça ficam 'conforme' com resultado ≤ 7 (dentro da tolerância)", () => {
    expect(swotDecision("weakness", 7)).toBe("conforme");
    expect(swotDecision("opportunity", 6)).toBe("conforme");
    expect(swotDecision("threat", 3)).toBe("conforme");
  });

  it("usa o corte ≥ — boundary check (7 conforme, 8 requer)", () => {
    expect(swotDecision("weakness", 7)).toBe("conforme");
    expect(swotDecision("weakness", 8)).toBe("requer");
  });
});

describe("objective ref (fonte:id)", () => {
  it("encodes source + id", () => {
    expect(encodeObjectiveRef("kpi", 5)).toBe("kpi:5");
    expect(encodeObjectiveRef("swot", 12)).toBe("swot:12");
  });

  it("parses a valid ref round-trip", () => {
    expect(parseObjectiveRef("kpi:5")).toEqual({ source: "kpi", id: 5 });
    expect(parseObjectiveRef("swot:12")).toEqual({ source: "swot", id: 12 });
  });

  it("returns null for empty or malformed refs", () => {
    expect(parseObjectiveRef("")).toBeNull();
    expect(parseObjectiveRef("kpi")).toBeNull();
    expect(parseObjectiveRef("kpi:abc")).toBeNull();
    expect(parseObjectiveRef("swot:")).toBeNull();
    expect(parseObjectiveRef("swot:0")).toBeNull();
    expect(parseObjectiveRef("swot:-3")).toBeNull();
  });
});

describe("DEFAULT_SWOT_TOLERANCES", () => {
  it("padrão FPLAN 001 = 8 para os três tipos", () => {
    expect(DEFAULT_SWOT_TOLERANCES).toEqual({ weakness: 8, opportunity: 8, threat: 8 });
  });
});

describe("corte configurável por tipo (metodologia da org)", () => {
  it("swotDecision usa o corte (≥) específico de cada tipo", () => {
    const t = { weakness: 6, opportunity: 9, threat: 4 };
    // Fraqueza: corte 6 → 5 conforme, 6 requer.
    expect(swotDecision("weakness", 5, t)).toBe("conforme");
    expect(swotDecision("weakness", 6, t)).toBe("requer");
    // Oportunidade: corte 9 → 8 conforme, 9 requer.
    expect(swotDecision("opportunity", 8, t)).toBe("conforme");
    expect(swotDecision("opportunity", 9, t)).toBe("requer");
    // Ameaça: corte 4 → 3 conforme, 4 requer.
    expect(swotDecision("threat", 3, t)).toBe("conforme");
    expect(swotDecision("threat", 4, t)).toBe("requer");
    // Força segue sempre positivo, independentemente do corte.
    expect(swotDecision("strength", 1, t)).toBe("positivo");
  });
});
