import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  VincularCompetenciaForm,
  type VincularCompetenciaFormValue,
} from "@/pages/app/aprendizagem/cargos/_components/VincularCompetenciaForm";

// A regra: o tipo é propriedade da COMPETÊNCIA (catálogo), não do requisito de
// vínculo. O formulário permite escolher VÁRIAS competências de uma vez; não
// tem campo de tipo por item — o seletor de tipo (CHA) só aparece quando o lote
// inclui competências NOVAS a criar, e vale para todas elas. As já existentes
// mantêm o tipo do catálogo.

const EMPTY_VALUE: VincularCompetenciaFormValue = {
  competencyNames: [],
  newCompetencyType: "conhecimento",
  requiredLevel: 3,
};

describe("VincularCompetenciaForm — múltipla seleção; tipo vem do catálogo", () => {
  it("não oferece campo de Tipo quando nada foi escolhido", () => {
    render(
      <VincularCompetenciaForm
        bankItems={[]}
        value={EMPTY_VALUE}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
  });

  it("não pede Tipo quando só há competências já existentes no catálogo", () => {
    render(
      <VincularCompetenciaForm
        bankItems={[
          { name: "Auditor ISO 14001", competencyType: "conhecimento" },
        ]}
        value={{ ...EMPTY_VALUE, competencyNames: ["Auditor ISO 14001"] }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    // Tipo vem do catálogo silenciosamente — sem campo editável no vínculo.
    expect(screen.queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
  });

  it("pede o tipo (lista CHA) quando o lote inclui competência nova", () => {
    render(
      <VincularCompetenciaForm
        bankItems={[
          { name: "Auditor ISO 14001", competencyType: "conhecimento" },
        ]}
        value={{
          ...EMPTY_VALUE,
          competencyNames: ["Auditor ISO 14001", "Direção defensiva"],
        }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const select = screen.getByLabelText(/Tipo/i);
    expect(select).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Conhecimento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Habilidade" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Atitude" })).toBeInTheDocument();
  });

  it("desativa 'Vincular' quando nenhuma competência foi escolhida", () => {
    render(
      <VincularCompetenciaForm
        bankItems={[]}
        value={EMPTY_VALUE}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Vincular/ })).toBeDisabled();
  });

  it("mostra a contagem no botão e chama onSubmit ao clicar", () => {
    const onSubmit = vi.fn();
    render(
      <VincularCompetenciaForm
        bankItems={[]}
        value={{
          ...EMPTY_VALUE,
          competencyNames: ["Direção defensiva", "Primeiros socorros"],
        }}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const button = screen.getByRole("button", { name: /Vincular \(2\)/ });
    expect(button).not.toBeDisabled();
    button.click();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
