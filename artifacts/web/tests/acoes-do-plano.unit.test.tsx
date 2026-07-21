import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Espiona só a função CRUA `updateActionPlanAction` (usada no flush do unmount),
// preservando o resto do pacote (os hooks que o action-plans-client reexporta).
vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return { ...actual, updateActionPlanAction: vi.fn().mockResolvedValue({}) };
});

// Partial mock: keep every pure helper/label map from the real module (used
// internally by the component), replace only the data/mutation hooks so the
// test never touches the network.
vi.mock("@/lib/action-plans-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/action-plans-client")>(
    "@/lib/action-plans-client",
  );
  return {
    ...actual,
    useActionPlanActions: vi.fn(),
    useCreateActionPlanActionWithInvalidation: vi.fn(),
    useUpdateActionPlanActionWithInvalidation: vi.fn(),
    useDeleteActionPlanActionWithInvalidation: vi.fn(),
  };
});

import { updateActionPlanAction } from "@workspace/api-client-react";
import {
  useActionPlanActions,
  useCreateActionPlanActionWithInvalidation,
  useDeleteActionPlanActionWithInvalidation,
  useUpdateActionPlanActionWithInvalidation,
  type ActionPlanAction,
} from "@/lib/action-plans-client";
import { AcoesDoPlano } from "@/pages/app/planos-acao/_components/acoes-do-plano";

const mockRawUpdate = updateActionPlanAction as unknown as ReturnType<typeof vi.fn>;

const mockActions = useActionPlanActions as unknown as ReturnType<typeof vi.fn>;
const mockCreate = useCreateActionPlanActionWithInvalidation as unknown as ReturnType<typeof vi.fn>;
const mockUpdate = useUpdateActionPlanActionWithInvalidation as unknown as ReturnType<typeof vi.fn>;
const mockDelete = useDeleteActionPlanActionWithInvalidation as unknown as ReturnType<typeof vi.fn>;

function action(overrides: Partial<ActionPlanAction>): ActionPlanAction {
  return {
    id: 1,
    actionPlanId: 10,
    what: null,
    why: null,
    whereAt: null,
    how: null,
    howTasks: null,
    howMuch: null,
    responsibleUserId: null,
    responsibleUserName: null,
    dueDate: null,
    status: "open",
    completedAt: null,
    notes: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AcoesDoPlano", () => {
  beforeEach(() => {
    mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockDelete.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('mostra "Atrasada" numa linha vencida e não concluída', () => {
    mockActions.mockReturnValue({
      data: [
        action({ id: 1, what: "Revisar procedimento", dueDate: "2020-01-01T12:00:00.000Z", status: "open" }),
      ],
    });
    render(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);
    expect(screen.getByText("Atrasada")).toBeInTheDocument();
  });

  it('não mostra "Atrasada" numa linha concluída, mesmo vencida', () => {
    mockActions.mockReturnValue({
      data: [
        action({ id: 1, what: "Revisar procedimento", dueDate: "2020-01-01T12:00:00.000Z", status: "completed" }),
      ],
    });
    render(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);
    expect(screen.queryByText("Atrasada")).not.toBeInTheDocument();
  });

  it('cabeçalho mostra "1 de 2 concluídas"', () => {
    mockActions.mockReturnValue({
      data: [
        action({ id: 1, what: "Ação 1", status: "completed" }),
        action({ id: 2, what: "Ação 2", status: "open" }),
      ],
    });
    render(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);
    expect(screen.getByText("Ações · 1 de 2 concluídas")).toBeInTheDocument();
  });
});

describe("AcoesDoPlano — autosave por linha (race)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Regressão da race condition Critical: um segundo campo editado na MESMA
  // linha enquanto o PATCH do primeiro campo está em voo NÃO pode ser revertido
  // pelo resync que segue o refetch. O PATCH final tem de carregar o valor novo.
  it("não reverte uma edição em voo — o PATCH final leva o valor novo do mesmo campo/linha", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));

    // Primeiro PATCH fica pendente até resolvermos à mão; os seguintes resolvem.
    let resolveFirst: ((v?: unknown) => void) | undefined;
    const first = new Promise((r) => {
      resolveFirst = r;
    });
    const mutateAsync = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue({});
    mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUpdate.mockReturnValue({ mutateAsync, isPending: false });
    mockDelete.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    // Servidor: "Quando" vazio (dueDate null). O refetch vai devolver isto — se o
    // fix falhar, o resync sobrescreveria a edição de "Quando" com este vazio.
    const server = action({ id: 1, what: "", dueDate: null, status: "open" });
    mockActions.mockReturnValue({ data: [server] });

    const { container, rerender } = render(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);

    // 1) Edita "O quê" → agenda T1.
    fireEvent.change(screen.getByPlaceholderText("O que será feito"), { target: { value: "Trocar filtro" } });
    // 2) T1 dispara → primeiro PATCH (fica pendente).
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    // 3) Durante o PATCH em voo, edita "Quando" na MESMA linha → agenda T2.
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-05-05" } });

    // 4) O primeiro PATCH resolve; o onSuccess (real) dispararia um refetch —
    //    simulado aqui por uma nova referência de `actions` (mesmo conteúdo do
    //    servidor) + rerender, o que aciona o efeito de resync.
    await act(async () => {
      resolveFirst?.({});
      await Promise.resolve();
      mockActions.mockReturnValue({ data: [{ ...server }] });
      rerender(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);
    });

    // 5) T2 dispara → PATCH final.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // A edição de "Quando" sobreviveu: o último PATCH leva a data nova, não o vazio.
    const lastData = mutateAsync.mock.calls.at(-1)?.[0]?.data as { dueDate?: string | null };
    expect(lastData?.dueDate).toBe("2026-05-05T12:00:00.000Z");
  });

  // Serialização: se um segundo save da MESMA linha é disparado enquanto o primeiro
  // PATCH ainda está em voo, não sai um segundo PATCH em paralelo (os dois poderiam
  // completar fora de ordem). Ao terminar o primeiro, re-salva uma vez com o valor atual.
  it("serializa: nunca dois PATCHes em voo na mesma linha; o re-save leva o valor final", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));

    let resolveFirst: ((v?: unknown) => void) | undefined;
    const first = new Promise((r) => { resolveFirst = r; });
    const mutateAsync = vi.fn().mockImplementationOnce(() => first).mockResolvedValue({});
    mockUpdate.mockReturnValue({ mutateAsync, isPending: false });
    mockActions.mockReturnValue({ data: [action({ id: 1, what: "", status: "open" })] });

    render(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);
    const input = screen.getByPlaceholderText("O que será feito");

    // Edita e deixa T1 disparar → PATCH-1 fica em voo.
    fireEvent.change(input, { target: { value: "A" } });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    // Edita de novo e deixa T2 disparar ENQUANTO PATCH-1 ainda está em voo → NÃO
    // dispara um segundo PATCH; marca re-save.
    fireEvent.change(input, { target: { value: "AB" } });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    // PATCH-1 resolve → o re-save dispara UMA vez, com o valor final.
    await act(async () => { resolveFirst?.({}); await Promise.resolve(); });
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync.mock.calls.at(-1)?.[0]?.data?.what).toBe("AB");
  });
});

describe("AcoesDoPlano — flush no unmount", () => {
  beforeEach(() => {
    mockRawUpdate.mockClear();
    mockRawUpdate.mockResolvedValue({});
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Sair da tela dentro da janela do debounce não pode perder a edição: o cleanup
  // dispara o PATCH pendente direto no cliente (a última versão do rascunho).
  it("dispara o PATCH pendente ao desmontar (edição dentro do debounce não se perde)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    mockUpdate.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false });
    mockActions.mockReturnValue({ data: [action({ id: 7, what: "", status: "open" })] });

    const { unmount } = render(<AcoesDoPlano orgId={3} planId={20} orgUsers={[]} canEdit />);

    // Edita mas NÃO deixa o debounce completar (avança só 300ms).
    fireEvent.change(screen.getByPlaceholderText("O que será feito"), { target: { value: "Não perca isto" } });
    await act(async () => { vi.advanceTimersByTime(300); });

    // Desmonta antes do debounce → flush.
    unmount();

    expect(mockRawUpdate).toHaveBeenCalledTimes(1);
    const [orgIdArg, planIdArg, actionIdArg, body] = mockRawUpdate.mock.calls[0];
    expect(orgIdArg).toBe(3);
    expect(planIdArg).toBe(20);
    expect(actionIdArg).toBe(7);
    expect((body as { what?: string | null }).what).toBe("Não perca isto");
  });
});

describe("AcoesDoPlano — checklist do Como", () => {
  beforeEach(() => {
    mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockDelete.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra o progresso da checklist (n/m) no cabeçalho recolhido", () => {
    mockUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockActions.mockReturnValue({
      data: [
        action({
          id: 1,
          what: "Ação",
          howTasks: [
            { id: "a", text: "Passo 1", done: true },
            { id: "b", text: "Passo 2", done: false },
          ],
        }),
      ],
    });
    render(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);
    // Recolhido: só o badge de progresso (não o "concluídas" de dentro).
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("mostra a data e quem concluiu um passo", () => {
    mockUpdate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockActions.mockReturnValue({
      data: [
        action({
          id: 1,
          what: "Ação",
          howTasks: [
            {
              id: "a",
              text: "Passo 1",
              done: true,
              doneAt: "2026-07-21T12:00:00.000Z",
              doneByUserId: 7,
              doneByUserName: "Ana Oliveira",
            },
          ],
        }),
      ],
    });
    render(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);
    fireEvent.click(screen.getByLabelText("Expandir ação"));
    expect(screen.getByText(/Concluída em/)).toBeInTheDocument();
    expect(screen.getByText("Ana Oliveira", { exact: false })).toBeInTheDocument();
  });

  it("marcar um passo salva a checklist inteira via PATCH", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUpdate.mockReturnValue({ mutateAsync, isPending: false });
    mockActions.mockReturnValue({
      data: [
        action({
          id: 1,
          what: "Ação",
          howTasks: [{ id: "a", text: "Passo 1", done: false }],
        }),
      ],
    });
    render(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);

    fireEvent.click(screen.getByLabelText("Expandir ação"));
    fireEvent.click(screen.getByLabelText("Marcar tarefa como concluída"));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    const data = mutateAsync.mock.calls.at(-1)?.[0]?.data as {
      howTasks?: Array<{ id: string; text: string; done: boolean }> | null;
    };
    expect(data?.howTasks).toEqual([{ id: "a", text: "Passo 1", done: true }]);
  });

  it("adicionar um passo em branco não dispara PATCH; digitar, sim (e o vazio não persiste)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUpdate.mockReturnValue({ mutateAsync, isPending: false });
    mockActions.mockReturnValue({
      data: [action({ id: 1, what: "Ação", howTasks: null })],
    });
    render(<AcoesDoPlano orgId={1} planId={10} orgUsers={[]} canEdit />);

    fireEvent.click(screen.getByLabelText("Expandir ação"));

    // Adiciona uma linha em branco: nenhum save agendado.
    fireEvent.click(screen.getByText("Adicionar tarefa"));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(mutateAsync).not.toHaveBeenCalled();

    // Ao digitar, o autosave dispara e persiste só o passo com texto.
    fireEvent.change(screen.getByPlaceholderText("Descreva o passo…"), {
      target: { value: "Comprar material" },
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    const data = mutateAsync.mock.calls.at(-1)?.[0]?.data as {
      howTasks?: Array<{ text: string; done: boolean }> | null;
    };
    expect(data?.howTasks).toHaveLength(1);
    expect(data?.howTasks?.[0]).toMatchObject({ text: "Comprar material", done: false });
  });
});
