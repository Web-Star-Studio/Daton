import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ColaboradoresPage from "@/pages/app/aprendizagem/colaboradores";
import { renderWithQueryClient } from "../support/render";

const permissionsState = {
  canWriteEmployees: true,
};

vi.mock("@/contexts/LayoutContext", () => ({
  useHeaderActions: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { organizationId: 101 },
  }),
  usePermissions: () => ({
    canWriteModule: (module: string) =>
      module === "employees" ? permissionsState.canWriteEmployees : false,
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/uploads", () => ({
  uploadFilesToStorage: vi.fn(),
  validateProfileItemUploadSelection: vi.fn(() => null),
  formatFileSize: (bytes: number) => `${bytes} B`,
  MAX_PROFILE_ITEM_ATTACHMENTS: 5,
  PROFILE_ITEM_ATTACHMENT_ACCEPT: ".pdf",
}));

const createEmployeeMutate = vi.fn(async () => ({ id: 1 }));

vi.mock("@workspace/api-client-react", () => ({
  useListEmployees: () => ({
    data: {
      data: [],
      pagination: { page: 1, totalPages: 1, total: 0, pageSize: 25 },
    },
    isLoading: false,
  }),
  useCreateEmployee: () => ({ mutateAsync: createEmployeeMutate, isPending: false }),
  useDeleteEmployee: () => ({ mutateAsync: vi.fn() }),
  useListUnits: () => ({ data: [{ id: 1, name: "Matriz" }] }),
  useListDepartments: () => ({ data: [{ id: 1, name: "Qualidade" }] }),
  useListPositions: () => ({
    data: [{ id: 1, name: "Analista da Qualidade" }],
  }),
  usePreviewTrainingRequirements: () => ({ data: undefined }),
  getListEmployeesQueryKey: () => ["employees"],
  getListDepartmentsQueryKey: () => ["departments"],
  getListPositionsQueryKey: () => ["positions"],
  getPreviewTrainingRequirementsQueryKey: () => ["preview-training-requirements"],
}));

// The page reads the catalog through this hand-written hook (it wraps the generated
// listTrainingCatalog fetcher to page through the whole catalog). Mock it so the
// test never drives a real fetch.
vi.mock("@/lib/training-catalog-client", () => ({
  useAllTrainingCatalog: () => ({ data: { data: [] } }),
}));

describe("employees page", () => {
  beforeEach(() => {
    permissionsState.canWriteEmployees = true;
    createEmployeeMutate.mockClear();
  });

  it("shows the empty state and create flow for users with write access", async () => {
    renderWithQueryClient(<ColaboradoresPage />);

    expect(
      screen.getByText("Nenhum colaborador encontrado"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar Colaborador" }),
    );

    expect(screen.getByText("Novo colaborador")).toBeInTheDocument();
    expect(screen.getByText("Pessoal")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Nome completo do funcionário"), {
      target: { value: "Maria da Silva" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    await waitFor(() => {
      expect(screen.getByText("Tipo de contrato")).toBeInTheDocument();
    });

    const admissionDateInput = document.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement | null;
    expect(admissionDateInput).not.toBeNull();
    fireEvent.change(admissionDateInput!, {
      target: { value: "2024-01-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    await waitFor(() => {
      expect(
        screen.getByText("Experiências profissionais"),
      ).toBeInTheDocument();
    });
  });

  it("does not submit the create form when Enter is pressed in a text field", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ColaboradoresPage />);

    await user.click(
      screen.getByRole("button", { name: "Adicionar Colaborador" }),
    );
    await user.type(
      screen.getByPlaceholderText("Nome completo do funcionário"),
      "Maria da Silva",
    );
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await waitFor(() => {
      expect(screen.getByText("Tipo de contrato")).toBeInTheDocument();
    });
    fireEvent.change(
      document.querySelector('input[type="date"]') as HTMLInputElement,
      { target: { value: "2024-01-10" } },
    );
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await waitFor(() => {
      expect(screen.getByText("Experiências profissionais")).toBeInTheDocument();
    });

    // Passo "Histórico" é o único com o botão type="submit" na tela, então o
    // Enter num campo de texto submetia o formulário (implicit submission):
    // criava o colaborador e fechava o diálogo no meio do preenchimento.
    await user.click(screen.getAllByRole("button", { name: /Adicionar item/ })[0]);
    const titleInput = screen.getAllByPlaceholderText(/Ex:/)[0];
    await user.type(titleInput, "Analista Jr{Enter}");

    expect(createEmployeeMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Novo colaborador")).toBeInTheDocument();
  });

  it("does not submit when Enter is pressed twice on the step buttons", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ColaboradoresPage />);

    await user.click(
      screen.getByRole("button", { name: "Adicionar Colaborador" }),
    );
    await user.type(
      screen.getByPlaceholderText("Nome completo do funcionário"),
      "Maria da Silva",
    );

    // "Próximo" e "Criar colaborador" ocupam a mesma posição no rodapé. Sem key
    // distinta o React reusava o mesmo <button>: ao chegar no último passo ele
    // virava submit AINDA COM O FOCO, e o Enter seguinte criava o colaborador.
    screen.getByRole("button", { name: "Próximo" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByText("Tipo de contrato")).toBeInTheDocument();
    });
    fireEvent.change(
      document.querySelector('input[type="date"]') as HTMLInputElement,
      { target: { value: "2024-01-10" } },
    );
    screen.getByRole("button", { name: "Próximo" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByText("Experiências profissionais")).toBeInTheDocument();
    });

    await user.keyboard("{Enter}");

    expect(createEmployeeMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Experiências profissionais")).toBeInTheDocument();
  });

  it("hides the create action for read-only users", () => {
    permissionsState.canWriteEmployees = false;

    renderWithQueryClient(<ColaboradoresPage />);

    expect(
      screen.queryByRole("button", { name: "Novo Colaborador" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Adicionar Colaborador" }),
    ).not.toBeInTheDocument();
  });
});
