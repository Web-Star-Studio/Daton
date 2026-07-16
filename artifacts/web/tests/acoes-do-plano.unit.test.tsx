import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  useActionPlanActions,
  useCreateActionPlanActionWithInvalidation,
  useDeleteActionPlanActionWithInvalidation,
  useUpdateActionPlanActionWithInvalidation,
  type ActionPlanAction,
} from "@/lib/action-plans-client";
import { AcoesDoPlano } from "@/pages/app/planos-acao/_components/acoes-do-plano";

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
});
