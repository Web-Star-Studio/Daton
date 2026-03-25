import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ColaboradoresPage from "@/pages/app/qualidade/colaboradores";
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
}));

vi.mock("@workspace/api-client-react", () => ({
  useListEmployees: () => ({
    data: {
      data: [],
      pagination: { page: 1, totalPages: 1, total: 0, pageSize: 25 },
    },
    isLoading: false,
  }),
  useCreateEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEmployee: () => ({ mutateAsync: vi.fn() }),
  useListUnits: () => ({ data: [{ id: 1, name: "Matriz" }] }),
  useListDepartments: () => ({ data: [{ id: 1, name: "Qualidade" }] }),
  useListPositions: () => ({
    data: [{ id: 1, name: "Analista da Qualidade" }],
  }),
  getListEmployeesQueryKey: () => ["employees"],
  getListDepartmentsQueryKey: () => ["departments"],
  getListPositionsQueryKey: () => ["positions"],
}));

describe("employees page", () => {
  beforeEach(() => {
    permissionsState.canWriteEmployees = true;
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
