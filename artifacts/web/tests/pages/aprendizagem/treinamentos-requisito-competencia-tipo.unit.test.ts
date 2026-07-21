import { describe, it, expect } from "vitest";
import {
  findBankItemByName,
  resolveLinkedCompetencyType,
} from "@/pages/app/aprendizagem/cargos/cargos-utils";

// Regressão do achado do revisor: o diálogo "Requisito de competência"
// (matriz de cargo, aberto a partir de colaboradores/treinamentos.tsx) tem um
// seletor de tipo CHA para a competência. Ao criar uma competência NOVA ali
// (handleStageNewCompetencyName + handleSubmitRequirement), o item de
// catálogo tem que nascer com o tipo que o usuário escolheu no seletor — não
// um tipo fixo. Um fix anterior criava o item já no clique de "Criar «Nome»"
// com competencyType: "conhecimento" fixo; como o backend deriva o
// competencyType do REQUISITO a partir do item de catálogo (fonte única),
// o usuário escolhia Habilidade/Atitude e a tela acabava mostrando
// Conhecimento mesmo assim — o inverso exato do bug original ("sem tipo").
//
// handleSubmitRequirement (treinamentos.tsx) resolve isso adiando a criação
// do item de catálogo para o SUBMIT do requisito, e usando
// `resolveLinkedCompetencyType` — o mesmo helper puro já usado por
// cargo-competencias-tab.tsx::handleLink — para decidir o tipo gravado.
// Este teste cobre esse ponto de decisão pela mesma import path usada pelo
// handler real, para travar a regra específica desta tela.

describe("tipo da competência criada inline no diálogo de requisito (treinamentos.tsx)", () => {
  it("competência nova: usa o tipo escolhido no seletor do diálogo (Habilidade), não um tipo fixo", () => {
    const catalogItems: { name: string; competencyType?: string | null }[] =
      [];
    expect(
      resolveLinkedCompetencyType(
        catalogItems,
        "Direção defensiva",
        "habilidade",
      ),
    ).toBe("habilidade");
  });

  it("competência nova: também respeita Atitude — não recai para 'conhecimento'", () => {
    const catalogItems: { name: string; competencyType?: string | null }[] =
      [];
    expect(
      resolveLinkedCompetencyType(catalogItems, "Postura em campo", "atitude"),
    ).toBe("atitude");
  });

  it("nunca reintroduz o bug anterior: mesmo sem tipo escolhido, cai no CHA default — nunca vazio", () => {
    const catalogItems: { name: string; competencyType?: string | null }[] =
      [];
    expect(
      resolveLinkedCompetencyType(catalogItems, "Nova competência", ""),
    ).toBe("conhecimento");
  });

  it("competência já existente no catálogo: handleSubmitRequirement não deve recriar o item — usa o tipo do catálogo, não o do seletor local", () => {
    const catalogItems = [
      { name: "Direção defensiva", competencyType: "atitude" },
    ];
    // findBankItemByName é o que handleSubmitRequirement usa para decidir se
    // chama createCompetencyMutation — item existente => não recria.
    expect(findBankItemByName(catalogItems, "Direção defensiva")).toBe(
      catalogItems[0],
    );
    expect(
      resolveLinkedCompetencyType(
        catalogItems,
        "Direção defensiva",
        "conhecimento",
      ),
    ).toBe("atitude");
  });
});
