import { describe, it, expect } from "vitest";
import { transformCompetencyType } from "../scripts/src/migrate/transform";

/**
 * O v2 só reconhece o CHA real — o enum do OpenAPI
 * (`lib/api-spec/openapi.yaml`): `conhecimento`, `habilidade`, `atitude`.
 *
 * `formacao` e `experiencia` foram removidos do enum, mas
 * `transformCompetencyType` alimenta `employee_competencies`
 * (via `migrate-employee-competencies.ts`) e, antes desta correção, nunca
 * tinha um ramo capaz de produzir "atitude" — o fallback devolvia
 * "formacao", reintroduzindo em silêncio o valor banido a cada carga de
 * cliente. Se alguém acrescentar uma categoria nova aqui, tem de acrescentar
 * no contrato também.
 */
const TYPES_DECLARADOS = ["conhecimento", "habilidade", "atitude"];

describe("transformCompetencyType", () => {
  it("só emite valores do CHA declarado no contrato, para qualquer entrada", () => {
    const entradas = [
      null,
      "",
      "Conhecimento",
      "conhecimento",
      "knowledge",
      "Habilidade",
      "habilidade",
      "skill",
      "Atitude",
      "atitude",
      "attitude",
      "Formação",
      "formacao",
      "Experiência",
      "experiencia",
      "qualquer coisa inesperada",
      "HABILIDADE",
    ];
    for (const entrada of entradas) {
      expect(TYPES_DECLARADOS).toContain(transformCompetencyType(entrada));
    }
  });

  it("preserva conhecimento", () => {
    expect(transformCompetencyType("Conhecimento")).toBe("conhecimento");
    expect(transformCompetencyType("knowledge")).toBe("conhecimento");
  });

  it("preserva habilidade", () => {
    expect(transformCompetencyType("Habilidade")).toBe("habilidade");
    expect(transformCompetencyType("skill")).toBe("habilidade");
  });

  it("mapeia atitude — ramo que não existia antes desta correção", () => {
    expect(transformCompetencyType("Atitude")).toBe("atitude");
    expect(transformCompetencyType("attitude")).toBe("atitude");
  });

  it("formação e experiência (removidos do enum) caem em conhecimento", () => {
    expect(transformCompetencyType("formacao")).toBe("conhecimento");
    expect(transformCompetencyType("Formação")).toBe("conhecimento");
    expect(transformCompetencyType("experiencia")).toBe("conhecimento");
    expect(transformCompetencyType("Experiência")).toBe("conhecimento");
  });

  it("entrada vazia ou desconhecida vira conhecimento", () => {
    expect(transformCompetencyType(null)).toBe("conhecimento");
    expect(transformCompetencyType("")).toBe("conhecimento");
    expect(transformCompetencyType("blergh")).toBe("conhecimento");
  });
});
