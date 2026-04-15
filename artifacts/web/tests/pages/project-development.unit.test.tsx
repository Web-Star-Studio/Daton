// @vitest-environment jsdom
import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectDevelopmentPage from "@/pages/app/governanca/projeto-desenvolvimento";
import { renderWithQueryClient } from "../support/render";

const authState = {
  canWriteGovernance: true,
  isOrgAdmin: true,
};

const dataState = {
  workflowEnabled: false,
};

const { useHeaderActionsMock } = vi.hoisted(() => ({
  useHeaderActionsMock: vi.fn(),
}));

vi.mock("@/contexts/LayoutContext", () => ({
  useHeaderActions: useHeaderActionsMock,
  usePageTitle: vi.fn(),
  usePageSubtitle: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    organization: { id: 33 },
  }),
  usePermissions: () => ({
    canWriteModule: (module: string) =>
      module === "governance" ? authState.canWriteGovernance : false,
    isOrgAdmin: authState.isOrgAdmin,
    isPlatformAdmin: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/project-development-client", () => ({
  useProjectDevelopmentApplicability: () => ({
    isLoading: false,
    data: {
      workflowEnabled: dataState.workflowEnabled,
      currentDecision: dataState.workflowEnabled
        ? {
            id: 1,
            organizationId: 33,
            requirementCode: "8.3",
            isApplicable: true,
            scopeSummary: "Desenvolvimento de serviço",
            justification: "A organização executa projeto e desenvolvimento.",
            responsibleEmployeeId: 7,
            responsibleEmployeeName: "Ana Responsável",
            approvalStatus: "approved",
            approvedById: 4,
            approvedByName: "Admin SGQ",
            approvedAt: "2026-04-10T12:00:00.000Z",
            validFrom: "2026-04-01",
            validUntil: null,
            isCurrentActive: true,
            createdById: 4,
            createdByName: "Admin SGQ",
            updatedById: 4,
            updatedByName: "Admin SGQ",
            createdAt: "2026-04-10T11:00:00.000Z",
            updatedAt: "2026-04-10T12:00:00.000Z",
          }
        : null,
      history: [],
    },
  }),
  useApplicabilityDecisionMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDevelopmentProjects: () => ({
    isLoading: false,
    data: dataState.workflowEnabled
      ? [
          {
            id: 44,
            organizationId: 33,
            applicabilityDecisionId: 1,
            projectCode: "PD-44",
            title: "Novo serviço controlado",
            scope: "Fluxo mínimo de projeto e desenvolvimento.",
            objective: "Validar o módulo.",
            status: "active",
            responsibleEmployeeId: 7,
            responsibleEmployeeName: "Ana Responsável",
            plannedStartDate: "2026-04-10",
            plannedEndDate: "2026-04-20",
            actualEndDate: null,
            attachments: [],
            createdById: 4,
            updatedById: 4,
            createdAt: "2026-04-10T12:00:00.000Z",
            updatedAt: "2026-04-10T12:00:00.000Z",
          },
        ]
      : [],
  }),
  useDevelopmentProject: () => ({
    data: dataState.workflowEnabled
      ? {
          id: 44,
          organizationId: 33,
          applicabilityDecisionId: 1,
          projectCode: "PD-44",
          title: "Novo serviço controlado",
          scope: "Fluxo mínimo de projeto e desenvolvimento.",
          objective: "Validar o módulo.",
          status: "active",
          responsibleEmployeeId: 7,
          responsibleEmployeeName: "Ana Responsável",
          plannedStartDate: "2026-04-10",
          plannedEndDate: "2026-04-20",
          actualEndDate: null,
          attachments: [],
          createdById: 4,
          updatedById: 4,
          createdByName: "Admin SGQ",
          updatedByName: "Admin SGQ",
          createdAt: "2026-04-10T12:00:00.000Z",
          updatedAt: "2026-04-10T12:00:00.000Z",
          inputs: [],
          stages: [],
          outputs: [],
          reviews: [],
          changes: [],
        }
      : null,
  }),
  useDevelopmentProjectMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useProjectResourceMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getListEmployeesQueryKey: () => ["employees"],
  useListEmployees: () => ({
    data: {
      data: [{ id: 7, name: "Ana Responsável" }],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    },
  }),
}));

describe("project development page", () => {
  beforeEach(() => {
    useHeaderActionsMock.mockClear();
  });

  it("shows the F2 gate when workflow is not enabled", () => {
    dataState.workflowEnabled = false;

    renderWithQueryClient(<ProjectDevelopmentPage />);

    expect(screen.getByText("Item 8.3 sob controle")).toBeInTheDocument();
    expect(
      screen.getByText(/O fluxo de P&D permanece bloqueado/i),
    ).toBeInTheDocument();
  });

  it("renders project data when applicability is approved and enabled", () => {
    dataState.workflowEnabled = true;

    renderWithQueryClient(<ProjectDevelopmentPage />);

    expect(screen.getByText("Aplicável")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Projetos" }));
    expect(
      screen.getAllByText("Novo serviço controlado").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Resumo do projeto")).toBeInTheDocument();
  });
});
