import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMutate = vi.fn().mockResolvedValue({});
const completeMutate = vi.fn().mockResolvedValue({ completed: 2 });

vi.mock("@workspace/api-client-react", () => ({
  useUpdateTrainingClassParticipant: () => ({ mutateAsync: updateMutate }),
  useCompleteTrainingClass: () => ({ mutateAsync: completeMutate }),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));

const { EncerrarTurmaDialog, effectiveResult } = await import(
  "@/pages/app/aprendizagem/turmas/encerrar-turma-dialog"
);

const PARTICIPANTS = [
  { id: 10, classId: 1, employeeId: 100, employeeName: "Juliana Ferreira" },
  { id: 11, classId: 1, employeeId: 101, employeeName: "Marcos Almeida" },
  { id: 12, classId: 1, employeeId: 102, employeeName: "Camila Nunes" },
];

function renderDialog(participants = PARTICIPANTS, minScore: number | null = 7) {
  return render(
    <EncerrarTurmaDialog
      orgId={1}
      classId={1}
      open
      onOpenChange={() => {}}
      participants={participants as never}
      minScore={minScore}
      isDone={false}
      onDone={() => {}}
    />,
  );
}

const next = () => screen.getByRole("button", { name: /Próximo/ });

beforeEach(() => {
  updateMutate.mockClear();
  completeMutate.mockClear();
});

describe("Assistente de encerramento de turma", () => {
  it("trava o avanço enquanto houver presença indefinida", () => {
    renderDialog();
    expect(screen.getByText("0 de 3 definidos")).toBeInTheDocument();
    expect(next()).toBeDisabled();
    expect(screen.getAllByText("Pendente")).toHaveLength(3);
  });

  it("“marcar todos como presentes” resolve a pendência de uma vez", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Marcar todos/ }));

    expect(screen.getByText("3 de 3 definidos")).toBeInTheDocument();
    expect(screen.getAllByText("Presente")).toHaveLength(3);
    expect(next()).toBeEnabled();
  });

  it("desmarcar individualmente deixa a pessoa como faltou, sem travar", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Marcar todos/ }));
    await user.click(screen.getByRole("checkbox", { name: /Camila/ }));

    expect(screen.getByText("Faltou")).toBeInTheDocument();
    expect(screen.getAllByText("Presente")).toHaveLength(2);
    // Faltou também é uma definição — não deve voltar a travar.
    expect(screen.getByText("3 de 3 definidos")).toBeInTheDocument();
    expect(next()).toBeEnabled();
  });

  it("presença nunca tocada não é interpretada como falta", async () => {
    renderDialog();
    const user = userEvent.setup();
    // Define só uma pessoa: as outras duas seguem pendentes e travam.
    await user.click(screen.getByRole("checkbox", { name: /Juliana/ }));

    expect(screen.getByText("1 de 3 definidos")).toBeInTheDocument();
    expect(screen.getAllByText("Pendente")).toHaveLength(2);
    expect(next()).toBeDisabled();
  });

  it("o passo de notas só lista quem esteve presente", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Marcar todos/ }));
    await user.click(screen.getByRole("checkbox", { name: /Camila/ }));
    await user.click(next());

    expect(screen.getByText("Juliana Ferreira")).toBeInTheDocument();
    expect(screen.getByText("Marcos Almeida")).toBeInTheDocument();
    expect(screen.queryByText("Camila Nunes")).not.toBeInTheDocument();
    expect(screen.getByText(/nota mínima desta turma: 7/i)).toBeInTheDocument();
  });

  it("conclui gravando presença e chamando o complete uma única vez", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Marcar todos/ }));
    await user.click(screen.getByRole("checkbox", { name: /Camila/ }));
    await user.click(next());
    await user.click(next());
    await user.click(screen.getByRole("button", { name: /Concluir turma/ }));

    // 3 participantes mudaram de presença (2 presentes + 1 falta).
    expect(updateMutate).toHaveBeenCalledTimes(3);
    expect(completeMutate).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/2 registro\(s\) de treinamento gerado\(s\)/),
    ).toBeInTheDocument();
    // Eficácia é oferecida, não obrigatória.
    expect(
      screen.getByRole("button", { name: /Avaliar eficácia/ }),
    ).toBeInTheDocument();
  });

  it("manda a presença junto ao gravar nota, senão o backend não recalcula o resultado", async () => {
    // Já estava "presente"; o operador só digita uma nota abaixo da mínima.
    // Um PATCH só de `score` preservaria o result antigo e o backend emitiria
    // o registro de treinamento de alguém que a tela mostra como reprovado.
    renderDialog([{ ...PARTICIPANTS[0], attendance: "presente" }] as never);
    const user = userEvent.setup();

    await user.click(next());
    const nota = screen.getByRole("spinbutton");
    await user.clear(nota);
    await user.type(nota, "3");
    await user.tab();

    expect(screen.getByText("Reprovado")).toBeInTheDocument();

    await user.click(next());
    await user.click(screen.getByRole("button", { name: /Concluir turma/ }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0].data).toEqual({
      attendance: "presente",
      score: 3,
    });
  });

  it("mostra o resultado manual de quem não será regravado", () => {
    // O backend preserva result manual quando nada é enviado; a tela precisa
    // refletir isso em vez de recalcular pela nota.
    expect(
      effectiveResult(
        { attendance: "presente", score: 3, result: "aprovado" },
        "presente",
        3,
        7,
      ),
    ).toBe("aprovado");
    // Mas se a nota mudar, aí sim o backend recalcula.
    expect(
      effectiveResult(
        { attendance: "presente", score: 3, result: "aprovado" },
        "presente",
        9,
        7,
      ),
    ).toBe("aprovado");
    expect(
      effectiveResult(
        { attendance: "presente", score: 9, result: "aprovado" },
        "presente",
        3,
        7,
      ),
    ).toBe("reprovado");
    // Falta sempre reprova; presente sem nota mínima aprova (igual ao backend).
    expect(effectiveResult({}, "faltou", null, 7)).toBe("reprovado");
    expect(effectiveResult({}, "presente", null, null)).toBe("aprovado");
  });

  it("não regrava quem já estava com a presença correta", async () => {
    renderDialog([
      { ...PARTICIPANTS[0], attendance: "presente" },
      { ...PARTICIPANTS[1], attendance: "presente" },
      { ...PARTICIPANTS[2], attendance: "faltou" },
    ] as never);
    const user = userEvent.setup();

    // Já vem tudo definido: avança direto.
    expect(screen.getByText("3 de 3 definidos")).toBeInTheDocument();
    await user.click(next());
    await user.click(next());
    await user.click(screen.getByRole("button", { name: /Concluir turma/ }));

    expect(updateMutate).not.toHaveBeenCalled();
    expect(completeMutate).toHaveBeenCalledTimes(1);
  });
});
