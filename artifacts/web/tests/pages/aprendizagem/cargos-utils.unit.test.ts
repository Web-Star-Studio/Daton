import { describe, it, expect } from "vitest";
import {
  deriveAreas,
  filterPositions,
  buildPositionSubline,
  levelLabel,
  isCritical,
  levelBucket,
} from "@/pages/app/aprendizagem/cargos/cargos-utils";

describe("deriveAreas", () => {
  it("devolve áreas distintas não vazias, ordenadas", () => {
    expect(
      deriveAreas([
        { area: "Operações" },
        { area: "Logística" },
        { area: "Operações" },
        { area: null },
        { area: "" },
      ]),
    ).toEqual(["Logística", "Operações"]);
  });
});

describe("filterPositions", () => {
  const pos = [
    { name: "Motorista", area: "Operações" },
    { name: "Analista SGI", area: "Qualidade" },
    { name: "Mecânico", area: "Manutenção" },
  ];
  it("busca por nome ignorando caixa e acento", () => {
    expect(filterPositions(pos, "mecanico", "").map((p) => p.name)).toEqual([
      "Mecânico",
    ]);
  });
  it("filtra por área; vazio = todas", () => {
    expect(filterPositions(pos, "", "Qualidade").map((p) => p.name)).toEqual([
      "Analista SGI",
    ]);
    expect(filterPositions(pos, "", "").length).toBe(3);
  });
  it("combina busca + área", () => {
    expect(filterPositions(pos, "a", "Operações").map((p) => p.name)).toEqual([
      "Motorista",
    ]);
  });
});

describe("buildPositionSubline", () => {
  it("monta as três partes", () => {
    expect(
      buildPositionSubline({
        area: "Operações",
        competencyCount: 8,
        normLabel: "ISO 39001",
      }),
    ).toBe("Operações · 8 competências · ISO 39001");
  });
  it("pluraliza e omite partes ausentes", () => {
    expect(buildPositionSubline({ competencyCount: 1 })).toBe("1 competência");
    expect(buildPositionSubline({ area: "Logística", competencyCount: 0 })).toBe(
      "Logística · 0 competências",
    );
    expect(buildPositionSubline({})).toBe("");
  });
});

describe("níveis de competência", () => {
  it("levelLabel mapeia por faixa", () => {
    expect(levelLabel(0)).toBe("—");
    expect(levelLabel(1)).toBe("Básico");
    expect(levelLabel(3)).toBe("Intermediário");
    expect(levelLabel(5)).toBe("Avançado");
  });
  it("isCritical apenas quando ≥ 4", () => {
    expect(isCritical(3)).toBe(false);
    expect(isCritical(4)).toBe(true);
  });
  it("levelBucket aproxima para 1/3/5", () => {
    expect(levelBucket(0)).toBe(1);
    expect(levelBucket(2)).toBe(1);
    expect(levelBucket(3)).toBe(3);
    expect(levelBucket(4)).toBe(5);
    expect(levelBucket(5)).toBe(5);
  });
});
