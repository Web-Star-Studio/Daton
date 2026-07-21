import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormacaoQualificacoes } from "@/pages/app/aprendizagem/colaboradores/_components/FormacaoQualificacoes";

const conformance = {
  positionName: "Analista",
  gapStatus: "critical",
  requirements: [
    {
      competencyName: "Comp A",
      competencyType: "habilidade",
      requiredLevel: 1,
      acquiredLevel: 1,
      status: "atende",
      source: "treinamento",
      evidence: null,
    },
    {
      competencyName: "Comp B",
      competencyType: "habilidade",
      requiredLevel: 2,
      acquiredLevel: 1,
      status: "gap",
      source: "manual",
      evidence: null,
    },
    {
      competencyName: "Comp C",
      competencyType: "habilidade",
      requiredLevel: 1,
      acquiredLevel: 0,
      status: "nao_classificado",
      source: null,
      evidence: null,
    },
  ],
} as never;

// Um requisito de cada estado acionável: nao_classificado, gap, atende+manual
// e atende+treinamento — cobre as 4 combinações que a Task 5 vai consumir via
// onAttachEvidence/onEditEvidence.
const actionableConformance = {
  positionName: "Analista",
  gapStatus: "critical",
  requirements: [
    {
      competencyName: "Não Classificada",
      competencyType: "habilidade",
      requiredLevel: 1,
      acquiredLevel: 0,
      status: "nao_classificado",
      source: null,
      evidence: null,
      manualCompetencyId: null,
    },
    {
      competencyName: "Com Gap",
      competencyType: "habilidade",
      requiredLevel: 3,
      acquiredLevel: 1,
      status: "gap",
      source: "manual",
      evidence: null,
      manualCompetencyId: 10,
    },
    {
      competencyName: "Atende Manual",
      competencyType: "conhecimento",
      requiredLevel: 2,
      acquiredLevel: 2,
      status: "atende",
      source: "manual",
      evidence: null,
      manualCompetencyId: 11,
    },
    {
      competencyName: "Atende Treinamento",
      competencyType: "atitude",
      requiredLevel: 1,
      acquiredLevel: 1,
      status: "atende",
      source: "treinamento",
      evidence: {
        trainingId: 5,
        title: "Curso X",
        completionDate: null,
        expirationDate: null,
      },
      manualCompetencyId: null,
    },
  ],
} as never;

const naoAvaliadoConformance = {
  positionName: "Analista",
  gapStatus: "indeterminado",
  requirements: [
    {
      competencyName: "Só não classificada",
      competencyType: "habilidade",
      requiredLevel: 1,
      acquiredLevel: 0,
      status: "nao_classificado",
      source: null,
      evidence: null,
      manualCompetencyId: null,
    },
  ],
} as never;

describe("FormacaoQualificacoes", () => {
  it("mostra escolaridade e os 3 estados das competências", () => {
    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Médio Completo"
        conformance={conformance}
      />,
    );
    expect(screen.getByText("Formação e qualificações")).toBeInTheDocument();
    expect(screen.getByText(/Escolaridade/i)).toBeInTheDocument();
    expect(screen.getByText("Comp A")).toBeInTheDocument();
    expect(screen.getByText("Comp B")).toBeInTheDocument();
    expect(screen.getByText("Comp C")).toBeInTheDocument();
    // Texto específico do item (o rodapé também contém "não avaliável", então
    // a busca precisa ser específica para não casar em dois lugares).
    expect(
      screen.getByText(/Não avaliável — treinamento não classificado/i),
    ).toBeInTheDocument();
    // barra: 1 atende / (1 atende + 1 gap) -> 1 não avaliável no rodapé
    expect(
      screen.getByText(/1 requisito ainda não avaliável/i),
    ).toBeInTheDocument();
  });

  it("conformance null -> estado neutro", () => {
    render(
      <FormacaoQualificacoes
        education="Médio Completo"
        requiredEducation={null}
        conformance={null}
      />,
    );
    expect(
      screen.getByText(/sem requisitos definidos|não possui requisitos/i),
    ).toBeInTheDocument();
  });

  it("sem editable, nenhum botão de ação aparece", () => {
    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Médio Completo"
        conformance={actionableConformance}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/via treinamento/i)).not.toBeInTheDocument();
  });

  it("com editable, ações aparecem por estado e chamam os callbacks certos", async () => {
    const user = userEvent.setup();
    const onAttachEvidence = vi.fn();
    const onEditEvidence = vi.fn();

    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Médio Completo"
        conformance={actionableConformance}
        editable
        onAttachEvidence={onAttachEvidence}
        onEditEvidence={onEditEvidence}
      />,
    );

    // nao_classificado e gap -> botão "Evidência" (nome exato, para não casar
    // com o botão "Editar evidência" da linha atende+manual).
    const evidenceButtons = screen.getAllByRole("button", {
      name: /^Evidência$/i,
    });
    expect(evidenceButtons).toHaveLength(2);

    await user.click(evidenceButtons[0]);
    expect(onAttachEvidence).toHaveBeenCalledTimes(1);
    expect(onAttachEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ competencyName: "Não Classificada" }),
    );

    await user.click(evidenceButtons[1]);
    expect(onAttachEvidence).toHaveBeenCalledTimes(2);
    expect(onAttachEvidence).toHaveBeenLastCalledWith(
      expect.objectContaining({ competencyName: "Com Gap" }),
    );

    // atende + manual -> controle de editar
    const editButton = screen.getByRole("button", { name: /editar/i });
    await user.click(editButton);
    expect(onEditEvidence).toHaveBeenCalledTimes(1);
    expect(onEditEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ competencyName: "Atende Manual" }),
    );

    // atende + treinamento -> hint textual, sem botão de evidência
    expect(screen.getByText(/via treinamento · Curso X/i)).toBeInTheDocument();

    // total de botões = 2 (evidência) + 1 (editar) = 3, nada extra na linha
    // "atende + treinamento"
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("0 requisitos avaliados -> selo neutro, não 'Requisitos atendidos'", () => {
    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Superior Completo"
        conformance={naoAvaliadoConformance}
      />,
    );
    expect(screen.getByText("Sem avaliação ainda")).toBeInTheDocument();
    expect(screen.queryByText("Requisitos atendidos")).not.toBeInTheDocument();
  });
});
