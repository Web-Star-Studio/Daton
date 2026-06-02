import { describe, expect, it } from "vitest";
import { swotDecision, swotResult, swotRiskBand } from "@/lib/swot-client";

describe("swotResult", () => {
  it("multiplies performance by relevance (1-4 scale → 1-16)", () => {
    expect(swotResult(4, 4)).toBe(16);
    expect(swotResult(2, 4)).toBe(8);
    expect(swotResult(1, 3)).toBe(3);
    expect(swotResult(3, 3)).toBe(9);
  });
});

describe("swotDecision (FPLAN methodology — ≥8 requer ação)", () => {
  it("força is always 'positivo', regardless of result", () => {
    expect(swotDecision("strength", 16)).toBe("positivo");
    expect(swotDecision("strength", 8)).toBe("positivo");
    expect(swotDecision("strength", 4)).toBe("positivo");
  });

  it("fraqueza/ameaça/oportunidade require action at result ≥ 8", () => {
    // R20 planilha: Fraqueza resultado 8 → requer
    expect(swotDecision("weakness", 8)).toBe("requer");
    // R23 planilha: Oportunidade resultado 9 → requer
    expect(swotDecision("opportunity", 9)).toBe("requer");
    // R59 planilha: Ameaça resultado 9 → requer
    expect(swotDecision("threat", 9)).toBe("requer");
  });

  it("fraqueza/ameaça/oportunidade are 'irrelevante' at result ≤ 7", () => {
    expect(swotDecision("weakness", 7)).toBe("irrelevante");
    // R45 planilha: Oportunidade resultado 6 → irrelevante
    expect(swotDecision("opportunity", 6)).toBe("irrelevante");
    // R24 planilha: Ameaça resultado 3 → irrelevante
    expect(swotDecision("threat", 3)).toBe("irrelevante");
  });

  it("uses 8 (not 9) as the threshold — boundary check", () => {
    expect(swotDecision("weakness", 7)).toBe("irrelevante");
    expect(swotDecision("weakness", 8)).toBe("requer");
  });
});

describe("swotRiskBand", () => {
  it("classifies ≤7 baixo, 8–12 alto, 13–16 extremo", () => {
    expect(swotRiskBand(7)).toBe("baixo");
    expect(swotRiskBand(8)).toBe("alto");
    expect(swotRiskBand(12)).toBe("alto");
    expect(swotRiskBand(13)).toBe("extremo");
    expect(swotRiskBand(16)).toBe("extremo");
  });
});
