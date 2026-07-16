import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
