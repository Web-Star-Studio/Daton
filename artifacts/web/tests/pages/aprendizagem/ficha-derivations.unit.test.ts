import { describe, it, expect } from "vitest";
import {
  computeTrainingCounters,
  computeTenure,
  compareEducation,
  toChaCompetencyType,
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

// Achado 1 do revisor (fix/tipo-competencia-fonte-unica): openEdit() do form de
// edição de competência do colaborador inicializava `form.type` com o valor cru
// do backend. Há 7 linhas legadas de `employee_competencies` em produção com
// `formacao`/`experiencia` (enum estreitado para CHA, backfill pendente) — sem
// normalizar, o <Select> (só 3 opções CHA) ficava sem valor correspondente e o
// PATCH reenviava o valor legado, que o contrato rejeita com 400.
describe("toChaCompetencyType", () => {
  it("valor legado (formacao) cai no fallback conhecimento", () => {
    expect(toChaCompetencyType("formacao")).toBe("conhecimento");
  });

  it("valor legado (experiencia) cai no fallback conhecimento", () => {
    expect(toChaCompetencyType("experiencia")).toBe("conhecimento");
  });

  it("vazio cai no fallback conhecimento", () => {
    expect(toChaCompetencyType("")).toBe("conhecimento");
  });

  it("valor CHA já válido é mantido (habilidade)", () => {
    expect(toChaCompetencyType("habilidade")).toBe("habilidade");
  });

  it("valor CHA já válido é mantido (atitude)", () => {
    expect(toChaCompetencyType("atitude")).toBe("atitude");
  });

  it("valor CHA já válido é mantido (conhecimento)", () => {
    expect(toChaCompetencyType("conhecimento")).toBe("conhecimento");
  });
});

// Achado simétrico (mesmo branch): `targetCompetencyType` do treino (form em
// colaboradores/[id].tsx, abertura de edição e prefill via query string) tem
// a mesma armadilha do achado acima e reusa o MESMO helper — não há valor
// legado em produção hoje (0 treinos), mas o `<Select>` também só tem as 3
// opções CHA, então o form ficaria sem opção correspondente se um valor
// legado chegasse por lá (ex.: deep link ?targetCompetencyType=... de outra
// tela, sem validação). O caso "vazio" aqui é tratado no call site (treino
// sem competência-alvo preserva o fallback local `habilidade`, não passa
// por este helper) — coberto pelos testes de call site, não aqui.
describe("toChaCompetencyType (reuso no form de treino)", () => {
  it("valor legado de treino cai no fallback conhecimento", () => {
    expect(toChaCompetencyType("experiencia")).toBe("conhecimento");
  });

  it("valor CHA de treino já válido é mantido", () => {
    expect(toChaCompetencyType("atitude")).toBe("atitude");
  });
});
