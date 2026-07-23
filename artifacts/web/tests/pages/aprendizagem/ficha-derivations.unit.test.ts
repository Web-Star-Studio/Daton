import { describe, it, expect } from "vitest";
import {
  computeTrainingCounters,
  computeTenure,
  compareEducation,
  toChaCompetencyType,
  selectOtherCompetencies,
} from "@/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations";
import type { EmployeeCompetency } from "@workspace/api-client-react";

function makeCompetency(
  overrides: Partial<EmployeeCompetency> & { id: number },
): EmployeeCompetency {
  return {
    employeeId: 1,
    name: `Competência ${overrides.id}`,
    type: "conhecimento",
    requiredLevel: 3,
    acquiredLevel: 3,
    attachments: [],
    ...overrides,
  };
}

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

// Achado da cliente: cargo "Auxiliar de Pessoal" exigia escolaridade mínima
// "Ensino Médio Completo" (vocabulário de EDUCATION_OPTIONS em
// position-form-dialog.tsx); colaborador cadastrado com "Fundamental
// Incompleto" (vocabulário de colaboradores/index.tsx). O mapa de ordem só
// reconhecia o vocabulário do colaborador -> eduRank("Ensino Médio
// Completo") === -1 -> "sem_requisito" -> a ficha não acusava o gap. Cobre
// as 3 opções de cargo que não tinham correspondência exata no vocabulário
// do colaborador ("Ensino Fundamental", "Ensino Médio Completo", "Técnico").
describe("compareEducation — vocabulário do cargo (EDUCATION_OPTIONS)", () => {
  it("cargo exige Ensino Médio Completo, colaborador tem Fundamental Incompleto -> gap (caso relatado pela cliente)", () => {
    expect(
      compareEducation("Fundamental Incompleto", "Ensino Médio Completo"),
    ).toBe("gap");
  });
  it("cargo exige Ensino Fundamental, colaborador tem Fundamental Completo -> atende", () => {
    expect(compareEducation("Fundamental Completo", "Ensino Fundamental")).toBe(
      "atende",
    );
  });
  it("cargo exige Ensino Fundamental, colaborador tem Fundamental Incompleto -> gap", () => {
    expect(
      compareEducation("Fundamental Incompleto", "Ensino Fundamental"),
    ).toBe("gap");
  });
  it("cargo exige Técnico, colaborador tem Médio Completo -> gap", () => {
    expect(compareEducation("Médio Completo", "Técnico")).toBe("gap");
  });
  it("cargo exige Técnico, colaborador tem Superior Completo -> atende", () => {
    expect(compareEducation("Superior Completo", "Técnico")).toBe("atende");
  });
  it("colaborador tem Técnico, cargo exige Ensino Médio Completo -> atende", () => {
    expect(compareEducation("Técnico", "Ensino Médio Completo")).toBe(
      "atende",
    );
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

// Task 6 (feat/aprendizagem-evidencia-requisito): a seção manual do rodapé da
// ficha ("Outras competências") não pode repetir requisitos do cargo — esses
// agora entram via as linhas de "Competências do cargo" (evidência ligada ao
// requisito, Tasks 4-5). O backend expõe `isPositionRequirement` pronto
// (Task 3); este helper é o único ponto que decide o que aparece no rodapé.
describe("selectOtherCompetencies", () => {
  it("mantém só as competências que NÃO são requisito do cargo", () => {
    const requisito = makeCompetency({ id: 1, isPositionRequirement: true });
    const livre = makeCompetency({ id: 2, isPositionRequirement: false });
    const semCampo = makeCompetency({ id: 3 }); // isPositionRequirement ausente (undefined)

    const result = selectOtherCompetencies([requisito, livre, semCampo]);

    expect(result.map((c) => c.id)).toEqual([2, 3]);
  });

  it("lista vazia -> lista vazia", () => {
    expect(selectOtherCompetencies([])).toEqual([]);
  });

  it("todas são requisito do cargo -> lista vazia", () => {
    const result = selectOtherCompetencies([
      makeCompetency({ id: 1, isPositionRequirement: true }),
      makeCompetency({ id: 2, isPositionRequirement: true }),
    ]);
    expect(result).toEqual([]);
  });
});
