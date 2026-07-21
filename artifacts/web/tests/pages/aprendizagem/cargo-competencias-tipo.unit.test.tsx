import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  VincularCompetenciaForm,
  type VincularCompetenciaFormValue,
} from "@/pages/app/aprendizagem/cargos/_components/VincularCompetenciaForm";

// A regra: o tipo é propriedade da COMPETÊNCIA (catálogo), não do requisito de
// vínculo. O formulário de vínculo não tem campo de tipo próprio — quando a
// competência escolhida já existe, o tipo dela aparece só como texto (do
// catálogo); só ao criar uma competência nova é que o usuário escolhe o tipo.

const EMPTY_VALUE: VincularCompetenciaFormValue = {
  competencyName: "",
  competencyType: "",
  requiredLevel: 3,
};

describe("VincularCompetenciaForm — tipo vem do catálogo, não é campo do vínculo", () => {
  it("não oferece campo de Tipo quando nenhuma competência foi escolhida", () => {
    render(
      <VincularCompetenciaForm
        bankItems={[]}
        value={EMPTY_VALUE}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Conhecimento")).not.toBeInTheDocument();
    expect(screen.queryByText("Habilidade")).not.toBeInTheDocument();
    expect(screen.queryByText("Atitude")).not.toBeInTheDocument();
  });

  it("mostra o tipo do catálogo da competência escolhida, somente leitura", () => {
    render(
      <VincularCompetenciaForm
        bankItems={[{ name: "Auditor ISO 14001", competencyType: "conhecimento" }]}
        value={{ ...EMPTY_VALUE, competencyName: "Auditor ISO 14001" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    // Aparece como texto...
    expect(screen.getByText("Conhecimento")).toBeInTheDocument();
    // ...não como campo editável (nenhum <select>/combobox associado a "Tipo").
    expect(screen.queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
  });

  it("ao criar competência nova, pede o tipo (lista CHA)", () => {
    render(
      <VincularCompetenciaForm
        bankItems={[{ name: "Auditor ISO 14001", competencyType: "conhecimento" }]}
        value={{ ...EMPTY_VALUE, competencyName: "Direção defensiva" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const select = screen.getByLabelText(/Tipo/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Conhecimento" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Habilidade" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Atitude" })).toBeInTheDocument();
  });

  it("desativa 'Vincular' quando o nome está vazio", () => {
    render(
      <VincularCompetenciaForm
        bankItems={[]}
        value={EMPTY_VALUE}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Vincular" })).toBeDisabled();
  });

  it("chama onSubmit ao clicar em Vincular com nome preenchido", () => {
    const onSubmit = vi.fn();
    render(
      <VincularCompetenciaForm
        bankItems={[]}
        value={{ ...EMPTY_VALUE, competencyName: "Direção defensiva" }}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const button = screen.getByRole("button", { name: "Vincular" });
    expect(button).not.toBeDisabled();
    button.click();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
