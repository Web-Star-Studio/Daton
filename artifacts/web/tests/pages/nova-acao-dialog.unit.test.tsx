import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const toastMock = vi.fn();
const mockAtivas = vi.fn();
const mockCreate = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/planos-acao", navigateMock],
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@workspace/api-client-react", () => ({
  getListOrgUsersQueryKey: (orgId: number) => ["org-users", orgId],
  useListOrgUsers: () => ({ data: { users: [] } }),
}));

// Partial mock: keep every pure helper (labels, gutScore, priorityFromGut...) from the real
// module — GutInput depends on some of them — replace only the catalog + mutation hooks so
// the test never touches the network.
vi.mock("@/lib/action-plans-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/action-plans-client")>(
    "@/lib/action-plans-client",
  );
  return {
    ...actual,
    useActiveAnalysisMethods: (...args: unknown[]) => mockAtivas(...args),
    useCreateActionPlanWithInvalidation: (...args: unknown[]) => mockCreate(...args),
  };
});

import { NovaAcaoDialog } from "@/pages/app/planos-acao/_components/nova-acao-dialog";

type Metodo = { id: number; organizationId: number; key: string; label: string; active: boolean; isDefault: boolean; sortOrder: number };

function metodo(overrides: Partial<Metodo>): Metodo {
  return { id: 1, organizationId: 1, key: "five_whys", label: "5 Porquês", active: true, isDefault: false, sortOrder: 0, ...overrides };
}

describe("NovaAcaoDialog", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toastMock.mockReset();
    mockAtivas.mockReset().mockReturnValue({ data: [] });
    mockCreate.mockReset().mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ id: 42 }), isPending: false });
  });

  it('usa os textos de "plano de ação" (não "ação") no título, subtítulo e botão', () => {
    render(<NovaAcaoDialog orgId={1} open onOpenChange={() => {}} />);

    expect(screen.getByText("Novo plano de ação")).toBeInTheDocument();
    expect(
      screen.getByText("Detalhe as tratativas, as ações e a eficácia na ficha."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar plano de ação" })).toBeInTheDocument();
  });

  it("mostra a seção Tratativas com o texto de apoio", () => {
    mockAtivas.mockReturnValue({
      data: [metodo({ key: "five_whys", label: "5 Porquês" })],
    });
    render(<NovaAcaoDialog orgId={1} open onOpenChange={() => {}} />);

    expect(screen.getByText("Tratativas")).toBeInTheDocument();
    expect(
      screen.getByText("Os métodos de análise que este plano vai usar. Dá para mudar depois na ficha."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /5 Porquês/i })).toBeInTheDocument();
  });

  /**
   * Regressão de timing: o catálogo (`useActiveAnalysisMethods`) chega DEPOIS do primeiro
   * render do diálogo (a query resolve de forma assíncrona). O `useEffect` que pré-marca os
   * defaults depende de `[open, ativas]` — precisa reaplicar quando `ativas` muda, não só
   * quando `open` muda (que já tinha disparado, vazio, no primeiro render).
   */
  it("pré-marca as tratativas padrão quando o catálogo chega depois do primeiro render", () => {
    mockAtivas.mockReturnValue({ data: [] });
    const { rerender } = render(<NovaAcaoDialog orgId={1} open onOpenChange={() => {}} />);

    mockAtivas.mockReturnValue({
      data: [
        metodo({ id: 1, key: "five_whys", label: "5 Porquês", isDefault: true }),
        metodo({ id: 2, key: "ishikawa", label: "Ishikawa", isDefault: false }),
      ],
    });
    rerender(<NovaAcaoDialog orgId={1} open onOpenChange={() => {}} />);

    expect(screen.getByRole("checkbox", { name: /5 Porquês/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Ishikawa/i })).not.toBeChecked();
  });

  it("não marca nenhuma tratativa quando nenhuma é padrão", () => {
    mockAtivas.mockReturnValue({
      data: [metodo({ key: "fmea", label: "FMEA", isDefault: false })],
    });
    render(<NovaAcaoDialog orgId={1} open onOpenChange={() => {}} />);

    expect(screen.getByRole("checkbox", { name: /FMEA/i })).not.toBeChecked();
  });

  it("envia analyses com as tratativas selecionadas (dados vazios) e o toast de sucesso", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 42 });
    mockCreate.mockReturnValue({ mutateAsync, isPending: false });
    mockAtivas.mockReturnValue({
      data: [
        metodo({ id: 1, key: "five_whys", label: "5 Porquês", isDefault: true }),
        metodo({ id: 2, key: "ishikawa", label: "Ishikawa", isDefault: false }),
      ],
    });

    render(<NovaAcaoDialog orgId={1} open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Ex.: Revisar EPIs na linha de produção"), {
      target: { value: "Corrigir vazamento na linha 2" },
    });
    // five_whys já vem marcado por padrão; marca também Ishikawa.
    fireEvent.click(screen.getByRole("checkbox", { name: /Ishikawa/i }));

    fireEvent.click(screen.getByRole("button", { name: "Criar plano de ação" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const body = mutateAsync.mock.calls[0][0].data;
    expect(body.analyses).toEqual([
      { key: "five_whys", data: { whys: [] } },
      { key: "ishikawa", data: { causes: [], whys: [] } },
    ]);

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ title: "Plano de ação criado" }));
  });

  it("não envia a tratativa desmarcada", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 42 });
    mockCreate.mockReturnValue({ mutateAsync, isPending: false });
    mockAtivas.mockReturnValue({
      data: [metodo({ id: 1, key: "five_whys", label: "5 Porquês", isDefault: true })],
    });

    render(<NovaAcaoDialog orgId={1} open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Ex.: Revisar EPIs na linha de produção"), {
      target: { value: "Corrigir vazamento na linha 2" },
    });
    // Desmarca a única tratativa (que veio marcada por ser padrão).
    fireEvent.click(screen.getByRole("checkbox", { name: /5 Porquês/i }));

    fireEvent.click(screen.getByRole("button", { name: "Criar plano de ação" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const body = mutateAsync.mock.calls[0][0].data;
    expect(body.analyses).toEqual([]);
  });

  /**
   * Regressão crítica: `useActiveAnalysisMethods` refiltra o catálogo (novo array, mesmo
   * conteúdo) a cada render de quem o chama — não é memoizado. Um `mockReturnValue` (que
   * devolve sempre a MESMA referência) esconderia esse comportamento; aqui usamos
   * `mockImplementation` para simular o array instável de verdade. Se o efeito de defaults
   * dependesse do array em si (em vez de uma assinatura estável), qualquer edição não
   * relacionada no formulário (digitar no título, por exemplo) causaria um re-render →
   * `ativas` mudaria de referência → o efeito reaplicaria os defaults → a escolha do usuário
   * seria apagada.
   */
  it("mantém a escolha do usuário quando o formulário re-renderiza (array do catálogo instável)", () => {
    mockAtivas.mockImplementation(() => ({
      data: [metodo({ id: 1, key: "five_whys", label: "5 Porquês", isDefault: true })],
    }));

    render(<NovaAcaoDialog orgId={1} open onOpenChange={() => {}} />);

    const checkbox = screen.getByRole("checkbox", { name: /5 Porquês/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    // Interação totalmente não relacionada — re-renderiza o diálogo inteiro.
    fireEvent.change(screen.getByPlaceholderText("Ex.: Revisar EPIs na linha de produção"), {
      target: { value: "Algo" },
    });

    expect(checkbox).not.toBeChecked();
  });
});
