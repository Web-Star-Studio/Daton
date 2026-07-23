import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom não implementa scrollIntoView, usado pelo cmdk ao montar os itens.
Element.prototype.scrollIntoView = vi.fn();

const createMutate = vi.fn().mockResolvedValue({ id: 99 });
const addParticipantsMutate = vi.fn().mockResolvedValue({});

const UNITS = [
  { id: 1, name: "PORTO ALEGRE" },
  { id: 2, name: "CARIACICA" },
  { id: 3, name: "DUQUE DE CAXIAS" },
];
const USER_OPTIONS = [
  { id: 50, name: "Ana Souza", email: "ana@x.com", role: "operator" },
  { id: 51, name: "Bruno Lima", email: "bruno@x.com", role: "operator" },
];

vi.mock("@workspace/api-client-react", () => ({
  useListTrainingClasses: () => ({ data: { data: [] }, isLoading: false }),
  useCreateTrainingClass: () => ({
    mutateAsync: createMutate,
    isPending: false,
  }),
  useAddTrainingClassParticipants: () => ({
    mutateAsync: addParticipantsMutate,
  }),
  getListTrainingClassesQueryKey: () => ["classes"],
  useListUnits: () => ({ data: UNITS, isLoading: false }),
  useListUserOptions: () => ({ data: USER_OPTIONS, isLoading: false }),
  getListUserOptionsQueryKey: () => ["user-options"],
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/training-catalog-client", () => ({
  useAllTrainingCatalog: () => ({
    data: { data: [{ id: 5, title: "Direção defensiva", status: "ativo" }] },
    isLoading: false,
  }),
  selectPickerCatalogItems: () => [{ id: 5, title: "Direção defensiva" }],
}));
vi.mock("@/contexts/LayoutContext", () => ({
  usePageTitle: () => {},
  useHeaderActions: () => {},
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { organizationId: 1 } }),
  usePermissions: () => ({ canWriteModule: () => true }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/pages/app/aprendizagem/turmas/detail-panel", () => ({
  TurmaDetailPanel: () => null,
}));
vi.mock("@/pages/app/aprendizagem/turmas/employee-picker", () => ({
  EmployeePicker: () => null,
}));

const { default: TurmasPage } = await import(
  "@/pages/app/aprendizagem/turmas/index"
);

/**
 * O botão "Nova turma" vive no header (useHeaderActions, mockado). O stepper
 * também abre via `?novaTurma=<catalogItemId>` — é por aí que o teste entra.
 * A data de início é obrigatória: sem ela o "Criar turma" fica desabilitado.
 */
async function abrirPasso2(user: ReturnType<typeof userEvent.setup>) {
  window.history.replaceState({}, "", "/?novaTurma=5");
  const view = render(<TurmasPage />);
  await user.click(screen.getByRole("button", { name: /Próximo/ }));
  // O diálogo vai para um portal — procurar em document, não no container.
  const inicio =
    document.body.querySelector<HTMLInputElement>('input[type="date"]');
  expect(inicio).not.toBeNull();
  fireEvent.change(inicio!, { target: { value: "2026-08-10" } });
  return view;
}

/** Gatilho do campo "Filiais", achado pelo texto do resumo.
 *  Por papel não dá: `role="combobox"` não tira nome do conteúdo (regra ARIA),
 *  e sem nome ele se confunde com os `<select>` nativos de FILTRO da página,
 *  que ficam atrás do diálogo e listam exatamente as mesmas filiais. */
const seletorDeFiliais = () =>
  screen
    .getByText("Filiais")
    .closest("div")!
    .querySelectorAll<HTMLElement>('button[role="combobox"]')[0];

/** Item do popover do cmdk. Pelo mesmo motivo acima, `role="option"` casaria
 *  com os `<option>` dos filtros nativos; `[cmdk-item]` só existe no popover. */
function opcao(text: string | RegExp): HTMLElement {
  const items = Array.from(
    document.body.querySelectorAll<HTMLElement>("[cmdk-item]"),
  );
  const found = items.filter((item) => {
    const label = (item.textContent ?? "").trim();
    return typeof text === "string" ? label === text : text.test(label);
  });
  if (found.length !== 1) {
    throw new Error(
      `esperava 1 item "${text}" no popover, achei ${found.length}. ` +
        `Itens: ${items.map((i) => i.textContent).join(" | ")}`,
    );
  }
  return found[0];
}

async function criar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Próximo/ }));
  await user.click(screen.getByRole("button", { name: /Criar turma/ }));
  return createMutate.mock.calls[0][0].data.units;
}

beforeEach(() => {
  createMutate.mockClear();
  addParticipantsMutate.mockClear();
});

describe("Nova turma — múltiplas filiais", () => {
  it("marca várias filiais e envia todas na criação", async () => {
    const user = userEvent.setup();
    await abrirPasso2(user);

    await user.click(seletorDeFiliais());
    await user.click(opcao("PORTO ALEGRE"));
    await user.click(opcao("CARIACICA"));
    await user.keyboard("{Escape}");

    expect(screen.getByText("2 filiais selecionadas")).toBeInTheDocument();
    expect(await criar(user)).toEqual([
      { unitId: 1, responsibleUserId: null },
      { unitId: 2, responsibleUserId: null },
    ]);
  });

  it("'Selecionar todas' marca a organização inteira de uma vez", async () => {
    const user = userEvent.setup();
    await abrirPasso2(user);

    await user.click(seletorDeFiliais());
    await user.click(opcao(/Selecionar todas as filiais \(3\)/));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Todas as filiais (3)")).toBeInTheDocument();
    expect(await criar(user)).toEqual([
      { unitId: 1, responsibleUserId: null },
      { unitId: 2, responsibleUserId: null },
      { unitId: 3, responsibleUserId: null },
    ]);
  });

  it("clicar 'Selecionar todas' de novo limpa a seleção", async () => {
    const user = userEvent.setup();
    await abrirPasso2(user);

    await user.click(seletorDeFiliais());
    await user.click(opcao(/Selecionar todas as filiais \(3\)/));
    await user.click(opcao(/Selecionar todas as filiais \(3\)/));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Selecione as filiais...")).toBeInTheDocument();
    expect(await criar(user)).toEqual([]);
  });

  it("cada filial tem o seu próprio responsável", async () => {
    const user = userEvent.setup();
    await abrirPasso2(user);

    await user.click(seletorDeFiliais());
    await user.click(opcao("PORTO ALEGRE"));
    await user.click(opcao("CARIACICA"));
    await user.keyboard("{Escape}");

    // Uma linha de responsável por filial marcada.
    const semResponsavel = screen.getAllByText("Sem responsável");
    expect(semResponsavel).toHaveLength(2);

    // Define o responsável só da 1ª filial (PORTO ALEGRE).
    await user.click(semResponsavel[0]);
    await user.click(opcao("Ana Souza"));

    expect(await criar(user)).toEqual([
      { unitId: 1, responsibleUserId: 50 },
      { unitId: 2, responsibleUserId: null },
    ]);
  });

  it("desmarcar a filial leva o responsável junto", async () => {
    const user = userEvent.setup();
    await abrirPasso2(user);

    await user.click(seletorDeFiliais());
    await user.click(opcao("PORTO ALEGRE"));
    await user.keyboard("{Escape}");

    await user.click(screen.getByText("Sem responsável"));
    await user.click(opcao("Bruno Lima"));
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();

    await user.click(seletorDeFiliais());
    await user.click(opcao("PORTO ALEGRE"));
    await user.keyboard("{Escape}");

    expect(screen.queryByText("Bruno Lima")).not.toBeInTheDocument();
    expect(await criar(user)).toEqual([]);
  });

  it("marcar todas preserva o responsável já definido", async () => {
    const user = userEvent.setup();
    await abrirPasso2(user);

    await user.click(seletorDeFiliais());
    await user.click(opcao("CARIACICA"));
    await user.keyboard("{Escape}");

    await user.click(screen.getByText("Sem responsável"));
    await user.click(opcao("Ana Souza"));

    await user.click(seletorDeFiliais());
    await user.click(opcao(/Selecionar todas as filiais \(3\)/));
    await user.keyboard("{Escape}");

    const enviado = await criar(user);
    expect(enviado).toHaveLength(3);
    expect(
      enviado.find((u: { unitId: number }) => u.unitId === 2).responsibleUserId,
    ).toBe(50);
  });
});
