import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom não implementa scrollIntoView, usado pelo cmdk (SearchableSelect do responsável).
Element.prototype.scrollIntoView = vi.fn();

const mutateAsync = vi.fn(async () => ({ id: 77 }));

vi.mock("wouter", () => ({ useLocation: () => ["/planos-acao", vi.fn()] }));

vi.mock("@workspace/api-client-react", () => ({
  useListOrgUsers: () => ({ data: { users: [] } }),
  getListOrgUsersQueryKey: () => ["org-users"],
}));

vi.mock("@/lib/action-plans-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/action-plans-client")>();
  return {
    ...actual,
    useCreateActionPlanWithInvalidation: () => ({ mutateAsync, isPending: false }),
  };
});

import { NovaAcaoDialog } from "@/pages/app/planos-acao/_components/nova-acao-dialog";

beforeEach(() => {
  mutateAsync.mockClear();
});

describe("NovaAcaoDialog — criada dentro do módulo (sem origem imposta)", () => {
  it("grava a origem escolhida, com Melhoria de Processo como padrão", async () => {
    render(<NovaAcaoDialog orgId={2} open onOpenChange={vi.fn()} />);
    const user = userEvent.setup();

    expect(screen.getByLabelText(/Origem/)).toHaveValue("improvement");

    await user.type(screen.getByLabelText(/Título/), "Reduzir fila no recebimento");
    await user.click(screen.getByRole("button", { name: "Criar ação" }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0].data).toMatchObject({
      sourceModule: "improvement",
      actionType: "improvement",
      title: "Reduzir fila no recebimento",
    });
  });

  it("trocar a origem para Corretiva sugere o Tipo Corretiva", async () => {
    render(<NovaAcaoDialog orgId={2} open onOpenChange={vi.fn()} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Origem/), "corrective");

    expect(screen.getByLabelText(/Tipo/)).toHaveValue("corrective");
  });

  it("a sugestão não trava o Tipo: o usuário sobrescreve depois de escolher a origem", async () => {
    render(<NovaAcaoDialog orgId={2} open onOpenChange={vi.fn()} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Origem/), "norm_requirement");
    expect(screen.getByLabelText(/Tipo/)).toHaveValue("corrective");

    await user.selectOptions(screen.getByLabelText(/Tipo/), "preventive");
    await user.type(screen.getByLabelText(/Título/), "Lacuna 9.1");
    await user.click(screen.getByRole("button", { name: "Criar ação" }));

    expect(mutateAsync.mock.calls[0][0].data).toMatchObject({
      sourceModule: "norm_requirement",
      actionType: "preventive",
    });
  });

  it("não oferece a origem legada 'Manual'", () => {
    render(<NovaAcaoDialog orgId={2} open onOpenChange={vi.fn()} />);

    const origem = screen.getByLabelText(/Origem/);
    expect(origem).not.toHaveTextContent("Manual");
  });
});

describe("NovaAcaoDialog — aberto a partir de outro módulo", () => {
  it("não mostra o campo Origem e mantém a origem imposta pelo chamador", async () => {
    render(
      <NovaAcaoDialog
        orgId={2}
        open
        onOpenChange={vi.fn()}
        source={{ sourceModule: "kpi", sourceRef: { kpiMonthlyValueId: 9 }, originLabel: "Indicador X · Mai/2026" }}
      />,
    );
    const user = userEvent.setup();

    expect(screen.queryByLabelText(/Origem \*/)).toBeNull();

    await user.type(screen.getByLabelText(/Título/), "Tratar desvio do indicador");
    await user.click(screen.getByRole("button", { name: "Criar ação" }));

    expect(mutateAsync.mock.calls[0][0].data).toMatchObject({
      sourceModule: "kpi",
      actionType: "corrective",
    });
  });
});
