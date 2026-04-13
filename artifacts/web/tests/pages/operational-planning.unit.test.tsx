import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OperationalPlanningPage from "@/pages/app/governanca/planejamento-operacional";

const refetchDetailMock = vi.fn();

const planSummary = {
  id: 1,
  organizationId: 7,
  title: "Plano SGI Transporte",
  planCode: "OP-001",
  processId: 5,
  processName: "Atendimento em campo",
  unitId: 3,
  unitName: "Unidade Sul",
  responsibleId: 4,
  responsibleName: "Ana Lima",
  serviceType: "Operacao assistida",
  status: "active" as const,
  currentRevisionNumber: 2,
  checklistItemCount: 1,
  pendingChangesCount: 1,
  latestCycle: {
    id: 11,
    cycleCode: "CICLO-001",
    status: "ready",
  },
  createdAt: "2026-04-10T12:00:00.000Z",
  updatedAt: "2026-04-10T12:00:00.000Z",
};

const planDetail = {
  id: 1,
  organizationId: 7,
  title: "Plano SGI Transporte",
  planCode: "OP-001",
  processId: 5,
  processName: "Atendimento em campo",
  unitId: 3,
  unitName: "Unidade Sul",
  responsibleId: 4,
  responsibleName: "Ana Lima",
  serviceType: "Operacao assistida",
  scope: "Planejar a execucao do servico com controles SGI.",
  sequenceDescription:
    "Receber demanda, validar prontidao e registrar evidencias.",
  executionCriteria: "Checklist concluido e documento vigente.",
  requiredResources: ["Equipe", "Veiculo"],
  inputs: ["Demanda aprovada"],
  outputs: ["Servico preparado"],
  esgConsiderations: "Checar requisitos ambientais e de seguranca.",
  readinessBlockingEnabled: true,
  status: "active" as const,
  currentRevisionNumber: 2,
  createdById: 9,
  updatedById: 9,
  createdAt: "2026-04-10T12:00:00.000Z",
  updatedAt: "2026-04-10T12:00:00.000Z",
  documents: [
    {
      id: 6,
      title: "Procedimento Operacional",
      status: "approved",
    },
  ],
  riskLinks: [
    {
      id: 8,
      title: "Risco de atraso",
      type: "risk",
      status: "identified",
      planTitle: "Plano Estrategico 2026",
    },
  ],
  checklistItems: [
    {
      id: 10,
      title: "Documento vigente confirmado",
      instructions: "Validar a revisao aplicavel antes da execucao.",
      isCritical: true,
      sortOrder: 1,
      createdAt: "2026-04-10T12:00:00.000Z",
      updatedAt: "2026-04-10T12:00:00.000Z",
    },
  ],
  revisions: [
    {
      id: 12,
      revisionNumber: 2,
      changeSummary: "Atualizacao de criterios operacionais.",
      changedById: 9,
      changedByName: "Marina Gestora",
      snapshot: {},
      createdAt: "2026-04-10T12:00:00.000Z",
    },
  ],
  cycles: [
    {
      id: 11,
      cycleCode: "CICLO-001",
      cycleDate: "2026-04-10T12:00:00.000Z",
      status: "ready" as const,
      evidenceSummary: "Preparacao concluida com evidencias anexadas.",
      externalReference: "ERP-123",
      attachments: [],
      readinessSummary: {
        total: 1,
        pending: 0,
        criticalPending: 0,
      },
      readinessExecutions: [
        {
          id: 13,
          checklistItemId: 10,
          checklistTitle: "Documento vigente confirmado",
          isCritical: true,
          status: "ok" as const,
          executedById: 4,
          executedByName: "Ana Lima",
          executedAt: "2026-04-10T12:00:00.000Z",
          evidenceNote: "Checklist concluido antes da operacao.",
          attachments: [],
        },
      ],
      createdAt: "2026-04-10T12:00:00.000Z",
      updatedAt: "2026-04-10T12:00:00.000Z",
    },
  ],
  changes: [
    {
      id: 14,
      title: "Mudanca de rota",
      cycleEvidenceId: 11,
      reason: "Cliente mudou a janela de atendimento.",
      impactLevel: "high" as const,
      impactDescription: "Requer ajuste de equipe e nova comunicacao.",
      mitigationAction: "Revalidar prontidao e comunicar responsaveis.",
      decision: "approved" as const,
      requestedById: 9,
      requestedByName: "Marina Gestora",
      approvedById: 9,
      approvedByName: "Marina Gestora",
      approvedAt: "2026-04-10T12:00:00.000Z",
      risks: [
        {
          id: 8,
          title: "Risco de atraso",
          type: "risk",
        },
      ],
      createdAt: "2026-04-10T12:00:00.000Z",
      updatedAt: "2026-04-10T12:00:00.000Z",
    },
  ],
};

const operationalPlanningHooks = vi.hoisted(() => ({
  useOperationalPlans: vi.fn(),
  useOperationalPlan: vi.fn(),
  useCreateOperationalPlanMutation: vi.fn(),
  useUpdateOperationalPlanMutation: vi.fn(),
  useCreateOperationalChecklistItemMutation: vi.fn(),
  useUpdateOperationalChecklistItemMutation: vi.fn(),
  useDeleteOperationalChecklistItemMutation: vi.fn(),
  useCreateOperationalCycleMutation: vi.fn(),
  useUpdateOperationalCycleMutation: vi.fn(),
  useCreateOperationalChangeMutation: vi.fn(),
  useUpdateOperationalChangeMutation: vi.fn(),
  useUpdateOperationalReadinessExecutionMutation: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    organization: { id: 7 },
    user: { role: "org_admin" },
  }),
}));

vi.mock("@/contexts/LayoutContext", () => ({
  useHeaderActions: vi.fn(),
  usePageSubtitle: vi.fn(),
  usePageTitle: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  resolveApiUrl: (path: string) => path,
}));

vi.mock("@/lib/uploads", () => ({
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT: ".pdf,.png,.jpg",
  formatFileSize: (size: number) => `${size} B`,
  uploadFilesToStorage: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/governance-client", () => ({
  useGovernanceRiskOpportunityItems: () => ({
    data: [{ id: 8, title: "Risco de atraso" }],
  }),
}));

vi.mock("@/lib/governance-system-client", () => ({
  useAllActiveSgqProcesses: () => ({
    data: [{ id: 5, name: "Atendimento em campo" }],
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListUnits: () => ({
    data: [{ id: 3, name: "Unidade Sul" }],
  }),
  useListEmployees: () => ({
    data: {
      data: [{ id: 4, name: "Ana Lima" }],
    },
  }),
  useListDocuments: () => ({
    data: [{ id: 6, title: "Procedimento Operacional", status: "approved" }],
  }),
}));

vi.mock("@/lib/operational-planning-client", () => operationalPlanningHooks);

describe("OperationalPlanningPage", () => {
  beforeEach(() => {
    refetchDetailMock.mockReset();

    const mutationResult = {
      mutateAsync: vi.fn(),
      isPending: false,
    };

    operationalPlanningHooks.useOperationalPlans.mockReturnValue({
      data: [planSummary],
      isLoading: false,
    });
    operationalPlanningHooks.useOperationalPlan.mockImplementation(
      (_orgId?: number, planId?: number) => ({
        data: planId === 1 ? planDetail : undefined,
        isLoading: false,
        refetch: refetchDetailMock,
      }),
    );
    operationalPlanningHooks.useCreateOperationalPlanMutation.mockReturnValue(
      mutationResult,
    );
    operationalPlanningHooks.useUpdateOperationalPlanMutation.mockReturnValue(
      mutationResult,
    );
    operationalPlanningHooks.useCreateOperationalChecklistItemMutation.mockReturnValue(
      mutationResult,
    );
    operationalPlanningHooks.useUpdateOperationalChecklistItemMutation.mockReturnValue(
      mutationResult,
    );
    operationalPlanningHooks.useDeleteOperationalChecklistItemMutation.mockReturnValue(
      mutationResult,
    );
    operationalPlanningHooks.useCreateOperationalCycleMutation.mockReturnValue(
      mutationResult,
    );
    operationalPlanningHooks.useUpdateOperationalCycleMutation.mockReturnValue(
      mutationResult,
    );
    operationalPlanningHooks.useCreateOperationalChangeMutation.mockReturnValue(
      mutationResult,
    );
    operationalPlanningHooks.useUpdateOperationalChangeMutation.mockReturnValue(
      mutationResult,
    );
    operationalPlanningHooks.useUpdateOperationalReadinessExecutionMutation.mockReturnValue(
      mutationResult,
    );
  });

  it("renders the operational planning flow with linked controls, cycles and changes", async () => {
    const user = userEvent.setup();
    render(<OperationalPlanningPage />);

    expect(screen.getByText("1 plano(s) operacional(is)")).toBeInTheDocument();
    expect(screen.getAllByText("Plano SGI Transporte").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Ativo").length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(
        operationalPlanningHooks.useOperationalPlan,
      ).toHaveBeenLastCalledWith(7, 1);
    });

    // aba Visão geral (default)
    expect(screen.getByText("Controles planejados")).toBeInTheDocument();
    expect(screen.getByText("Procedimento Operacional")).toBeInTheDocument();
    expect(screen.getAllByText("Risco de atraso").length).toBeGreaterThan(0);

    // aba Checklist
    await user.click(screen.getByRole("tab", { name: "Checklist" }));
    expect(
      screen.getAllByText("Documento vigente confirmado").length,
    ).toBeGreaterThan(0);

    // aba Ciclos
    await user.click(screen.getByRole("tab", { name: "Ciclos" }));
    expect(screen.getByText("CICLO-001")).toBeInTheDocument();
    expect(screen.getByText("Pronto")).toBeInTheDocument();
    expect(screen.getByText("Conforme")).toBeInTheDocument();

    // aba Mudanças
    await user.click(screen.getByRole("tab", { name: "Mudanças" }));
    expect(screen.getByText("Mudanca de rota")).toBeInTheDocument();
    expect(screen.getByText("Aprovada")).toBeInTheDocument();
    expect(screen.getByText("Alto")).toBeInTheDocument();
  });
});
