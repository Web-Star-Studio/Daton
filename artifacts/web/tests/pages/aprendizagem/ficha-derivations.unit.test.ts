import { describe, it, expect } from "vitest";
import {
  computeTrainingCounters,
  computeTenure,
  compareEducation,
} from "@/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations";

describe("computeTrainingCounters", () => {
  it("conta total/feitos/pendentes/vencidos por status", () => {
    const r = computeTrainingCounters([
      { status: "concluido" },
      { status: "concluido" },
      { status: "pendente" },
      { status: "vencido" },
    ]);
    expect(r).toEqual({
      total: 4,
      feitos: 2,
      pendentes: 1,
      vencidos: 1,
      naoAplicavel: 0,
    });
  });

  it("trata treino concluído com validade passada como vencido", () => {
    const r = computeTrainingCounters(
      [{ status: "concluido", expirationDate: "2020-01-01" }],
      "2026-01-01",
    );
    expect(r.vencidos).toBe(1);
    expect(r.feitos).toBe(0);
  });

  it("lista vazia -> tudo zero", () => {
    expect(computeTrainingCounters([])).toEqual({
      total: 0,
      feitos: 0,
      pendentes: 0,
      vencidos: 0,
      naoAplicavel: 0,
    });
  });
});

describe("computeTenure", () => {
  it("formata anos e meses", () => {
    expect(computeTenure("2019-03-12", new Date("2026-06-20"))).toBe(
      "7 anos e 3 meses",
    );
  });
  it("menos de um ano mostra só meses", () => {
    expect(computeTenure("2026-01-10", new Date("2026-06-20"))).toBe("5 meses");
  });
  it("sem data -> string vazia", () => {
    expect(computeTenure(null)).toBe("");
  });
});

describe("compareEducation", () => {
  it("possui >= requerido -> atende", () => {
    expect(compareEducation("Superior Completo", "Médio Completo")).toBe(
      "atende",
    );
    expect(compareEducation("Médio Completo", "Médio Completo")).toBe("atende");
  });
  it("possui < requerido -> gap", () => {
    expect(compareEducation("Médio Incompleto", "Médio Completo")).toBe("gap");
  });
  it("sem requerido (ou fora do mapa) -> sem_requisito", () => {
    expect(compareEducation("Médio Completo", null)).toBe("sem_requisito");
    expect(compareEducation("Médio Completo", "Não Aplicável")).toBe(
      "sem_requisito",
    );
  });
  it("sem possui -> nao_informado", () => {
    expect(compareEducation(null, "Médio Completo")).toBe("nao_informado");
  });
});
