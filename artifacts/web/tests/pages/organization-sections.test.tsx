import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrganizacaoPage from "@/pages/app/organizacao";
import { renderWithQueryClient } from "../support/render";

const navigateMock = vi.fn();

vi.mock("@/contexts/LayoutContext", () => ({
  useHeaderActions: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    organization: { id: 101 },
    login: vi.fn(),
  }),
  usePermissions: () => ({
    isOrgAdmin: true,
    canWriteModule: () => true,
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/app/organizacao", navigateMock],
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/organization-onboarding", () => ({
  GOAL_LABELS: {},
  MATURITY_LABELS: {},
  SECTOR_LABELS: {},
  SIZE_LABELS: {},
}));

vi.mock("@workspace/api-client-react", () => ({
  useListUnits: () => ({
    data: [{ id: 1, name: "Matriz", type: "sede", status: "ativa" }],
    isLoading: false,
  }),
  useCreateUnit: () => ({ mutateAsync: vi.fn() }),
  useDeleteUnit: () => ({ mutateAsync: vi.fn() }),
  getListUnitsQueryKey: () => ["units"],
  useListDepartments: () => ({
    data: [{ id: 11, name: "Qualidade", description: "SGQ", unitIds: [1] }],
    isLoading: false,
  }),
  useCreateDepartment: () => ({ mutateAsync: vi.fn() }),
  useDeleteDepartment: () => ({ mutateAsync: vi.fn() }),
  useUpdateDepartment: () => ({ mutateAsync: vi.fn() }),
  getListDepartmentsQueryKey: () => ["departments"],
  useListPositions: () => ({
    data: [{ id: 21, name: "Analista da Qualidade", requirements: "ISO 9001" }],
    isLoading: false,
  }),
  useCreatePosition: () => ({ mutateAsync: vi.fn() }),
  useDeletePosition: () => ({ mutateAsync: vi.fn() }),
  useBulkDeletePositions: () => ({ mutateAsync: vi.fn() }),
  useUpdatePosition: () => ({ mutateAsync: vi.fn() }),
  useImportPositions: () => ({ mutateAsync: vi.fn() }),
  getListPositionsQueryKey: () => ["positions"],
  useGetOrganization: () => ({ data: { id: 101, name: "Daton", statusOperacional: "ativa" } }),
  useUpdateOrganization: () => ({ mutateAsync: vi.fn() }),
  useResetOrganizationOnboarding: () => ({ mutateAsync: vi.fn() }),
  getGetOrganizationQueryKey: () => ["organization"],
}));

describe("organization page sections", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("opens the department dialog from the organization departments section", () => {
    renderWithQueryClient(<OrganizacaoPage section="departamentos" />);

    expect(screen.getByText("Qualidade")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Novo Departamento" }));

    expect(screen.getByText("Novo Departamento")).toBeInTheDocument();
  });

  it("opens the position dialog from the organization positions section", () => {
    renderWithQueryClient(<OrganizacaoPage section="cargos" />);

    expect(screen.getByText("Analista da Qualidade")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Novo Cargo" }));

    expect(screen.getByText("Novo Cargo")).toBeInTheDocument();
  });
});
