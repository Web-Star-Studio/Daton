import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

// Um requisito de cada estado acionável — cobre as combinações que a linha
// da tabela precisa rotear corretamente: a ação (editar vs. anexar) segue a
// PRESENÇA de `manualCompetencyId`, nunca status/source isolados (ver PR de
// revisão: reabrir "+ Evidência" em cima de um atestado manual existente
// apagava a evidência silenciosamente).
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
      // gap sem atestado manual -> "+ Evidência" (anexar em branco é seguro,
      // não existe nada pra perder).
      competencyName: "Com Gap",
      competencyType: "habilidade",
      requiredLevel: 3,
      acquiredLevel: 1,
      status: "gap",
      source: "manual",
      evidence: null,
      manualCompetencyId: null,
    },
    {
      // gap PARCIAL que já tem atestado manual (nível insuficiente) -> lápis
      // / editar, nunca "+ Evidência" (senão reabre em branco e apaga o que
      // já foi registrado). Este é o caso do Important #1 da revisão.
      competencyName: "Gap com Atestado",
      competencyType: "habilidade",
      requiredLevel: 4,
      acquiredLevel: 2,
      status: "gap",
      source: "manual",
      evidence: null,
      manualCompetencyId: 12,
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
      // atende via treinamento mas SEM atestado manual próprio -> só o hint
      // "via treinamento", nenhum botão de ação.
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
    {
      // atende via treinamento MAS também tem atestado manual -> hint "via
      // treinamento" E lápis (editável). Este é o caso do Important #2 da
      // revisão.
      competencyName: "Atende Treinamento com Atestado",
      competencyType: "atitude",
      requiredLevel: 1,
      acquiredLevel: 1,
      status: "atende",
      source: "treinamento",
      evidence: {
        trainingId: 6,
        title: "Curso Y",
        completionDate: null,
        expirationDate: null,
      },
      manualCompetencyId: 13,
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
    // barra: 1 atende / 3 requisitos (atende+gap+não classificado) -> 1 não
    // avaliável no rodapé
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

  it("sem editable: nenhum botão de ação, mas o hint 'via treinamento' aparece (informativo p/ read-only)", () => {
    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Médio Completo"
        conformance={actionableConformance}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    // O hint da fonte (treinamento) é informativo: explica POR QUE o requisito
    // está atendido e deve aparecer mesmo para quem não pode editar.
    expect(screen.getAllByText(/via treinamento/i).length).toBeGreaterThan(0);
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

    // Sem atestado manual (nao_classificado ou gap com
    // manualCompetencyId null) -> botão "Evidência" (nome exato, para não
    // casar com o botão "Editar evidência").
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

    // Com atestado manual (manualCompetencyId != null) -> lápis / editar,
    // mesmo em linha "gap" parcial ou "atende + treinamento". A ação roteia
    // pela presença do atestado, não pelo status/source da linha.
    const editButtons = screen.getAllByRole("button", { name: /editar/i });
    expect(editButtons).toHaveLength(3);

    await user.click(editButtons[0]);
    expect(onEditEvidence).toHaveBeenCalledTimes(1);
    expect(onEditEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ competencyName: "Gap com Atestado" }),
    );

    await user.click(editButtons[1]);
    expect(onEditEvidence).toHaveBeenCalledTimes(2);
    expect(onEditEvidence).toHaveBeenLastCalledWith(
      expect.objectContaining({ competencyName: "Atende Manual" }),
    );

    await user.click(editButtons[2]);
    expect(onEditEvidence).toHaveBeenCalledTimes(3);
    expect(onEditEvidence).toHaveBeenLastCalledWith(
      expect.objectContaining({
        competencyName: "Atende Treinamento com Atestado",
      }),
    );

    // atende + treinamento sem atestado manual -> só hint textual, sem botão
    expect(screen.getByText(/via treinamento · Curso X/i)).toBeInTheDocument();

    // atende + treinamento COM atestado manual -> hint textual E lápis
    // aparecem juntos na mesma linha.
    expect(screen.getByText(/via treinamento · Curso Y/i)).toBeInTheDocument();

    // total de botões = 2 (evidência) + 3 (editar) = 5
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("0 requisitos avaliados + educação neutra -> selo 'Sem avaliação ainda'", () => {
    render(
      <FormacaoQualificacoes
        education="Médio Completo"
        requiredEducation={null}
        conformance={naoAvaliadoConformance}
      />,
    );
    expect(screen.getByText("Sem avaliação ainda")).toBeInTheDocument();
    expect(screen.queryByText("Requisitos atendidos")).not.toBeInTheDocument();
  });

  it("0 requisitos avaliáveis MAS educação atende -> selo 'Avaliação pendente' (não 'Sem avaliação' nem 'Requisitos atendidos')", () => {
    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Superior Completo"
        conformance={naoAvaliadoConformance}
      />,
    );
    // Educação atendida é uma avaliação positiva: o card não deve dizer que
    // nada foi avaliado. Mas ainda existe 1 competência não classificada sem
    // evidência anexada — dizer "Requisitos atendidos" aqui seria o mesmo bug
    // relatado por cliente (selo verde/100% escondendo pendência real).
    expect(screen.getByText("Avaliação pendente")).toBeInTheDocument();
    expect(screen.queryByText("Sem avaliação ainda")).not.toBeInTheDocument();
    expect(screen.queryByText("Requisitos atendidos")).not.toBeInTheDocument();
  });

  it("atende + gap + não classificado -> denominador inclui os 3, percentual honesto (não 100% quando falta evidência)", () => {
    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Médio Completo"
        conformance={conformance}
      />,
    );
    // 1 atende / (1 atende + 1 gap + 1 não classificado) = 1/3 -> 33%.
    // Antes do fix, "nao_classificado" saía do denominador e a conta virava
    // 1/1 -> 100%, escondendo o requisito ainda sem evidência.
    expect(screen.getByText("1/3 requisitos atendidos")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
  });
});

// Achado da cliente: cargo exigia escolaridade mínima e a ficha não acusava
// nada quando o colaborador ficava abaixo — nem indicação visual, nem forma
// de definir um prazo para regularizar. Cobre o bloco de gap redesenhado
// (Possui/Requerido + "Não atende") e o prazo de regularização, nos dois
// lugares onde ele aparece: escolaridade e requisito de competência.
describe("FormacaoQualificacoes — prazo de regularização de gap", () => {
  it("escolaridade em gap: mostra o alerta 'Não atende' com Possui/Requerido", () => {
    render(
      <FormacaoQualificacoes
        education="Fundamental Incompleto"
        requiredEducation="Ensino Médio Completo"
        conformance={null}
      />,
    );
    expect(
      screen.getByText("Escolaridade não atende o requisito do cargo"),
    ).toBeInTheDocument();
    expect(screen.getByText("Não atende")).toBeInTheDocument();
    expect(screen.getByText("Fundamental Incompleto")).toBeInTheDocument();
    expect(screen.getByText("Ensino Médio Completo")).toBeInTheDocument();
  });

  it("não editable e sem prazo definido: não mostra input nem texto de prazo", () => {
    render(
      <FormacaoQualificacoes
        education="Fundamental Incompleto"
        requiredEducation="Ensino Médio Completo"
        conformance={null}
      />,
    );
    expect(screen.queryByText(/Prazo para regularização/i)).not.toBeInTheDocument();
  });

  it("editable: mostra o campo de data e salva ao escolher uma data", async () => {
    const onSetEducationDeadline = vi.fn();
    render(
      <FormacaoQualificacoes
        education="Fundamental Incompleto"
        requiredEducation="Ensino Médio Completo"
        conformance={null}
        editable
        onSetEducationDeadline={onSetEducationDeadline}
      />,
    );
    const dateInput = screen.getByDisplayValue("");
    expect(dateInput).toHaveAttribute("type", "date");

    fireEvent.change(dateInput, { target: { value: "2026-08-01" } });
    expect(onSetEducationDeadline).toHaveBeenCalledWith("2026-08-01");
  });

  it("prazo já definido e vencido: mostra 'Vencido' e o selo escala para 'Gaps vencidos'", () => {
    render(
      <FormacaoQualificacoes
        education="Fundamental Incompleto"
        requiredEducation="Ensino Médio Completo"
        educationDeadline={{
          dueDate: "2020-01-01",
          resolvedAt: null,
          overdue: true,
          createdAt: "2020-01-01T00:00:00Z",
          updatedAt: "2020-01-01T00:00:00Z",
        }}
        conformance={null}
      />,
    );
    expect(screen.getByText(/Vencido há/i)).toBeInTheDocument();
    expect(screen.getByText("Gaps vencidos")).toBeInTheDocument();
    expect(screen.queryByText("Gaps encontrados")).not.toBeInTheDocument();
  });

  it("prazo definido e não vencido, editable: mostra a data no input e permite remover", async () => {
    const user = userEvent.setup();
    const onClearEducationDeadline = vi.fn();
    render(
      <FormacaoQualificacoes
        education="Fundamental Incompleto"
        requiredEducation="Ensino Médio Completo"
        educationDeadline={{
          dueDate: "2027-01-01",
          resolvedAt: null,
          overdue: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        }}
        conformance={null}
        editable
        onClearEducationDeadline={onClearEducationDeadline}
      />,
    );
    expect(screen.getByDisplayValue("2027-01-01")).toBeInTheDocument();
    expect(screen.queryByText(/Vencido/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Remover prazo/i }));
    expect(onClearEducationDeadline).toHaveBeenCalledTimes(1);
  });

  it("requisito de competência em gap, editable: também tem campo de prazo, e o de 'atende' não tem", () => {
    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Médio Completo"
        conformance={conformance}
        editable
      />,
    );
    // "Comp B" está em gap (deadline ainda não definido) -> um campo de data
    // aparece; "Comp A" atende -> nenhum campo de data para ela.
    const dateInputs = document.querySelectorAll('input[type="date"]');
    // 1 da linha de competência em gap (a escolaridade aqui é "atende", sem
    // campo de data próprio).
    expect(dateInputs).toHaveLength(1);
  });

  it("requisito de competência com prazo vencido: aparece 'Vencido' na própria linha", () => {
    const conformanceWithOverdue = {
      positionName: "Analista",
      gapStatus: "critical",
      requirements: [
        {
          competencyName: "Comp Vencida",
          competencyType: "habilidade",
          requiredLevel: 3,
          acquiredLevel: 1,
          status: "gap",
          source: "manual",
          evidence: null,
          deadline: {
            dueDate: "2020-01-01",
            resolvedAt: null,
            overdue: true,
            createdAt: "2020-01-01T00:00:00Z",
            updatedAt: "2020-01-01T00:00:00Z",
          },
        },
      ],
    } as never;

    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Médio Completo"
        conformance={conformanceWithOverdue}
      />,
    );
    expect(screen.getByText(/Vencido há/i)).toBeInTheDocument();
    expect(screen.getByText("Gaps vencidos")).toBeInTheDocument();
  });
});
