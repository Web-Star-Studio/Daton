import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
