import { describe, it, expect } from "vitest";
import {
  resolveLinkedCompetencyType,
  findBankItemByName,
} from "@/pages/app/aprendizagem/cargos/cargos-utils";

// O tipo é propriedade da COMPETÊNCIA (catálogo), não do vínculo: ao vincular
// uma competência já existente, o tipo gravado tem que ser o do catálogo —
// nunca o que porventura esteja selecionado no formulário (`chosenType`, só
// editável no fluxo "criar na hora"). Esta é a regra que corrige o bug da
// cliente (competência do catálogo virando o tipo errado no cargo).

describe("resolveLinkedCompetencyType", () => {
  it("competência existente no catálogo: usa o tipo do catálogo, mesmo com chosenType diferente", () => {
    const bankItems = [{ name: "Auditor ISO 14001", competencyType: "conhecimento" }];
    expect(
      resolveLinkedCompetencyType(bankItems, "Auditor ISO 14001", "habilidade"),
    ).toBe("conhecimento");
  });

  it("competência inexistente no catálogo: usa o chosenType (fluxo criar-na-hora)", () => {
    const bankItems = [{ name: "Auditor ISO 14001", competencyType: "conhecimento" }];
    expect(
      resolveLinkedCompetencyType(bankItems, "Direção defensiva", "habilidade"),
    ).toBe("habilidade");
  });

  it("match é insensível a caixa e a espaços nas pontas", () => {
    const bankItems = [{ name: "  Auditor ISO 14001  ", competencyType: "atitude" }];
    expect(
      resolveLinkedCompetencyType(bankItems, "auditor iso 14001", "conhecimento"),
    ).toBe("atitude");
    expect(
      resolveLinkedCompetencyType(bankItems, "  AUDITOR ISO 14001  ", "conhecimento"),
    ).toBe("atitude");
  });

  it("item existente sem tipo (null/vazio) cai no chosenType", () => {
    const bankItemsNull = [{ name: "Auditor ISO 14001", competencyType: null }];
    expect(
      resolveLinkedCompetencyType(bankItemsNull, "Auditor ISO 14001", "habilidade"),
    ).toBe("habilidade");

    const bankItemsEmpty = [{ name: "Auditor ISO 14001", competencyType: "" }];
    expect(
      resolveLinkedCompetencyType(bankItemsEmpty, "Auditor ISO 14001", "habilidade"),
    ).toBe("habilidade");
  });

  it("catálogo vazio: usa o chosenType", () => {
    expect(resolveLinkedCompetencyType([], "Qualquer coisa", "atitude")).toBe(
      "atitude",
    );
  });
});

describe("findBankItemByName", () => {
  it("acha por nome normalizado (caixa/espaços)", () => {
    const bankItems = [{ name: "Direção defensiva", competencyType: "habilidade" }];
    expect(findBankItemByName(bankItems, "  direção defensiva  ")).toBe(bankItems[0]);
  });

  it("nome vazio nunca casa, mesmo contra item de nome vazio", () => {
    const bankItems = [{ name: "", competencyType: "atitude" }];
    expect(findBankItemByName(bankItems, "")).toBeUndefined();
    expect(findBankItemByName(bankItems, "   ")).toBeUndefined();
  });

  it("sem correspondência: undefined", () => {
    const bankItems = [{ name: "Auditor ISO 14001", competencyType: "conhecimento" }];
    expect(findBankItemByName(bankItems, "Direção defensiva")).toBeUndefined();
  });
});
