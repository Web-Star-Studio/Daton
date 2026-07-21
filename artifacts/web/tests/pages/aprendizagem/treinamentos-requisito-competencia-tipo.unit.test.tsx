import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  RequirementDialog,
  type RequirementForm,
} from "@/pages/app/aprendizagem/colaboradores/treinamentos";

// Achado do revisor (P2): este é o SEGUNDO lugar (além da aba "Cargos e
// competências") onde o tipo CHA de uma competência aparece num formulário de
// vínculo — o diálogo "Requisito de competência" da matriz do cargo, aberto a
// partir de colaboradores/treinamentos.tsx. Antes deste fix, o seletor de
// "Tipo" ficava sempre editável, mesmo para uma competência já existente no
// catálogo — só que a escolha era descartada no save (o backend realinha ao
// catálogo). Resultado: o usuário escolhia um tipo e a tela acabava
// mostrando outro. `resolveLinkedCompetencyType`/`findBankItemByName` (puros,
// em cargos-utils.ts) já têm cobertura direta em cargos-resolve-tipo.unit.test.ts
// — não repetimos essas variações aqui. Este arquivo cobre o comportamento
// ESPECÍFICO do diálogo (o que renderiza), que nenhum outro teste cobre:
// competência existente -> texto somente leitura; competência nova -> seletor.

const DEFAULT_VALUE: RequirementForm = {
  competencyName: "",
  competencyType: "habilidade",
  requiredLevel: 3,
  notes: "",
  sortOrder: 0,
};

function renderDialog(overrides: {
  value: RequirementForm;
  bankItems?: { name: string; competencyType?: string | null }[];
  onChange?: (value: RequirementForm) => void;
}) {
  return render(
    <RequirementDialog
      open
      onOpenChange={vi.fn()}
      value={overrides.value}
      onChange={overrides.onChange ?? vi.fn()}
      bankItems={overrides.bankItems ?? []}
      onSubmit={vi.fn()}
      title="Novo requisito"
    />,
  );
}

describe("RequirementDialog — tipo vem do catálogo, não é campo do requisito", () => {
  it("não oferece campo de Tipo quando nenhuma competência foi escolhida", () => {
    renderDialog({ value: DEFAULT_VALUE });
    expect(screen.queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Conhecimento")).not.toBeInTheDocument();
    expect(screen.queryByText("Habilidade")).not.toBeInTheDocument();
    expect(screen.queryByText("Atitude")).not.toBeInTheDocument();
  });

  it("competência já existente no catálogo: mostra o tipo do catálogo como texto, sem seletor", () => {
    renderDialog({
      value: { ...DEFAULT_VALUE, competencyName: "Direção defensiva" },
      bankItems: [{ name: "Direção defensiva", competencyType: "atitude" }],
    });
    expect(screen.getByText("Atitude")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
  });

  it("regressão do achado: se o formulário guarda um tipo diferente do catálogo, a tela mostra o do catálogo — nunca o valor local descartado no save", () => {
    // Antes do fix, este seletor ficava sempre editável e mostrava
    // `value.competencyType` (aqui "conhecimento"), mesmo quando o backend ia
    // gravar o tipo do catálogo ("atitude") de qualquer forma.
    renderDialog({
      value: {
        ...DEFAULT_VALUE,
        competencyName: "Direção defensiva",
        competencyType: "conhecimento",
      },
      bankItems: [{ name: "Direção defensiva", competencyType: "atitude" }],
    });
    expect(screen.getByText("Atitude")).toBeInTheDocument();
    expect(screen.queryByText("Conhecimento")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
  });

  it("competência nova (fora do catálogo): mostra o seletor CHA editável", () => {
    renderDialog({
      value: { ...DEFAULT_VALUE, competencyName: "Nova competência" },
      bankItems: [{ name: "Direção defensiva", competencyType: "atitude" }],
    });
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

  it("competência nova: escolher o tipo no seletor propaga via onChange", () => {
    const onChange = vi.fn();
    renderDialog({
      value: { ...DEFAULT_VALUE, competencyName: "Nova competência" },
      bankItems: [],
      onChange,
    });
    fireEvent.change(screen.getByLabelText(/Tipo/i), {
      target: { value: "atitude" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ competencyType: "atitude" }),
    );
  });

  it("editar requisito já vinculado: campo nasce como texto do catálogo, não seletor (o valor pré-carregado é o nome já existente)", () => {
    // Simula abertura via openEditRequirement: o form já vem preenchido com o
    // nome/tipo do requisito salvo — que por definição já está no catálogo.
    renderDialog({
      value: {
        ...DEFAULT_VALUE,
        competencyName: "Direção defensiva",
        competencyType: "atitude",
      },
      bankItems: [{ name: "Direção defensiva", competencyType: "atitude" }],
    });
    expect(screen.queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
    expect(screen.getByText("Atitude")).toBeInTheDocument();
  });
});
