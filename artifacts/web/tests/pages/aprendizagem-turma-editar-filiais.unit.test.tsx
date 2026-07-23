import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom não implementa scrollIntoView, usado pelo cmdk ao montar os itens.
Element.prototype.scrollIntoView = vi.fn();

const updateClassMutate = vi.fn().mockResolvedValue({});

const UNITS = [
  { id: 1, name: "PORTO ALEGRE" },
  { id: 2, name: "CARIACICA" },
  { id: 3, name: "DUQUE DE CAXIAS" },
];
const USER_OPTIONS = [
  { id: 50, name: "Ana Souza", email: "ana@x.com", role: "operator" },
  { id: 51, name: "Bruno Lima", email: "bruno@x.com", role: "operator" },
];

// Turma já criada: 1 filial (PORTO ALEGRE) + responsável Ana.
const DETAIL = {
  id: 7,
  organizationId: 1,
  catalogItemId: 5,
  code: "T01",
  startDate: "2026-09-01",
  endDate: null,
  status: "agendada",
  attachments: [],
  participants: [],
  units: [{ unitId: 1, unitName: "PORTO ALEGRE" }],
  responsibleUserId: 50,
  responsibleUserName: "Ana Souza",
};

vi.mock("@workspace/api-client-react", () => ({
  useGetTrainingClass: () => ({ data: DETAIL, isLoading: false }),
  useUpdateTrainingClassParticipant: () => ({ mutateAsync: vi.fn() }),
  useUpdateTrainingClass: () => ({ mutateAsync: updateClassMutate }),
  getGetTrainingClassQueryKey: () => ["class", 7],
  useListUnits: () => ({ data: UNITS, isLoading: false }),
  getListUnitsQueryKey: () => ["units"],
  useListUserOptions: () => ({ data: USER_OPTIONS, isLoading: false }),
  getListUserOptionsQueryKey: () => ["user-options"],
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/uploads", () => ({
  uploadFilesToStorage: vi.fn(),
  formatFileSize: () => "0 KB",
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT: "",
}));
vi.mock("@/lib/api", () => ({ resolveApiUrl: (p: string) => p }));
vi.mock("@/pages/app/aprendizagem/turmas/encerrar-turma-dialog", () => ({
  EncerrarTurmaDialog: () => null,
}));
vi.mock("@/pages/app/aprendizagem/turmas/add-participants-dialog", () => ({
  AddParticipantsDialog: () => null,
}));
vi.mock("@/pages/app/aprendizagem/turmas/score-input", () => ({
  ScoreInput: () => null,
}));

const { TurmaDetailPanel } = await import(
  "@/pages/app/aprendizagem/turmas/detail-panel"
);

function renderPanel() {
  return render(
    <TurmaDetailPanel
      orgId={1}
      classId={7}
      canWrite
      catalogTitle={new Map([[5, "Direção Defensiva"]])}
      onChanged={() => {}}
    />,
  );
}

/** Item do popover do cmdk (evita casar com <option> nativos). */
function opcao(text: string | RegExp): HTMLElement {
  const items = Array.from(
    document.body.querySelectorAll<HTMLElement>("[cmdk-item]"),
  );
  const found = items.filter((i) => {
    const label = (i.textContent ?? "").trim();
    return typeof text === "string" ? label === text : text.test(label);
  });
  if (found.length !== 1) {
    throw new Error(
      `esperava 1 item "${text}", achei ${found.length}: ${items
        .map((i) => i.textContent)
        .join(" | ")}`,
    );
  }
  return found[0];
}

const comboDe = (rotulo: string) =>
  screen
    .getByText(rotulo)
    .closest("div")!
    .querySelectorAll<HTMLElement>('button[role="combobox"]')[0];

beforeEach(() => updateClassMutate.mockClear());

describe("Detalhe da turma — edição inline de filiais e responsável", () => {
  it("mostra o responsável e as filiais, com botão Editar", () => {
    renderPanel();
    expect(screen.getByText(/Responsável: Ana Souza/)).toBeInTheDocument();
    expect(screen.getByText("PORTO ALEGRE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar/ })).toBeInTheDocument();
  });

  it("adiciona uma filial e troca o responsável, salvando o replace-all", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /Editar/ }));

    // Adiciona CARIACICA (PORTO ALEGRE já vem marcada).
    await user.click(comboDe("Filiais"));
    await user.click(opcao("CARIACICA"));
    await user.keyboard("{Escape}");

    // Troca o responsável para Bruno.
    await user.click(comboDe("Responsável pela turma"));
    await user.click(opcao("Bruno Lima"));

    await user.click(screen.getByRole("button", { name: /^Salvar$/ }));

    expect(updateClassMutate).toHaveBeenCalledTimes(1);
    expect(updateClassMutate.mock.calls[0][0].data).toEqual({
      units: [{ unitId: 1 }, { unitId: 2 }],
      responsibleUserId: 51,
    });
  });

  it("limpar o responsável envia null", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /Editar/ }));
    // Abre o picker do responsável e usa "Limpar seleção".
    await user.click(comboDe("Responsável pela turma"));
    await user.click(opcao(/Limpar seleção/));

    await user.click(screen.getByRole("button", { name: /^Salvar$/ }));

    expect(updateClassMutate.mock.calls[0][0].data.responsibleUserId).toBeNull();
  });

  it("Cancelar não chama o update", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByRole("button", { name: /Cancelar/ }));

    expect(updateClassMutate).not.toHaveBeenCalled();
    // Voltou ao modo de leitura.
    expect(screen.getByRole("button", { name: /Editar/ })).toBeInTheDocument();
  });
});
