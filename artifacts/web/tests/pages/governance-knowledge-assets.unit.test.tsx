// @vitest-environment jsdom
import React from "react";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GovernanceKnowledgeAssetsPage from "@/pages/app/governanca/conhecimento-critico";
import { renderWithQueryClient } from "../support/render";

const permissionsState = {
  canWriteGovernance: true,
};

vi.mock("@/contexts/LayoutContext", () => ({
  useHeaderActions: vi.fn(),
  usePageTitle: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    organization: { id: 101 },
  }),
  usePermissions: () => ({
    canWriteModule: (module: string) =>
      module === "governance" ? permissionsState.canWriteGovernance : false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/uploads", () => ({
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT: ".pdf",
  MAX_PROFILE_ITEM_ATTACHMENTS: 10,
  PROFILE_ITEM_ATTACHMENT_ACCEPT: ".pdf",
  formatFileSize: () => "1 KB",
  uploadFilesToStorage: vi.fn(),
  validateProfileItemUploadSelection: vi.fn(() => null),
}));

vi.mock("@/lib/governance-client", () => ({
  useGovernanceRiskOpportunityItems: () => ({
    data: [
      {
        id: 44,
        type: "risk",
        description: "Perda de conhecimento",
        planTitle: "Plano SGQ",
      },
    ],
  }),
}));

vi.mock("@/lib/governance-system-client", () => ({
  useAllActiveSgqProcesses: () => ({
    data: [{ id: 21, name: "Auditoria interna" }],
  }),
  useKnowledgeAssets: (_orgId: number, params?: { positionId?: number }) => ({
    data: {
      data: [
        {
          id: 1,
          organizationId: 101,
          title: "Conhecimento crítico de auditoria",
          description: "Fluxos e critérios de auditoria interna.",
          lossRiskLevel: "critical",
          retentionMethod: "Mentoria e procedimento.",
          successionPlan: "Dois backups treinados.",
          evidenceAttachments: [],
          evidenceValidUntil: null,
          evidenceStatus: "missing",
          links: [
            {
              id: 10,
              positionId: params?.positionId ?? 7,
              positionName: "Auditor Interno",
              processId: null,
              processName: null,
              documentId: null,
              documentTitle: null,
              riskOpportunityItemId: null,
              riskOpportunityItemLabel: null,
              riskOpportunityPlanTitle: null,
            },
          ],
          createdAt: "2026-03-30T12:00:00.000Z",
          updatedAt: "2026-03-30T12:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    },
    isLoading: false,
  }),
  useKnowledgeAsset: () => ({
    data: {
      id: 1,
      organizationId: 101,
      title: "Conhecimento crítico de auditoria",
      description: "Fluxos e critérios de auditoria interna.",
      lossRiskLevel: "critical",
      retentionMethod: "Mentoria e procedimento.",
      successionPlan: "Dois backups treinados.",
      evidenceAttachments: [],
      evidenceValidUntil: null,
      evidenceStatus: "missing",
      links: [
        {
          id: 10,
          positionId: 7,
          positionName: "Auditor Interno",
          processId: null,
          processName: null,
          documentId: null,
          documentTitle: null,
          riskOpportunityItemId: null,
          riskOpportunityItemLabel: null,
          riskOpportunityPlanTitle: null,
        },
      ],
      createdById: 1,
      createdByName: "Admin",
      updatedById: 1,
      updatedByName: "Admin",
      createdAt: "2026-03-30T12:00:00.000Z",
      updatedAt: "2026-03-30T12:00:00.000Z",
    },
  }),
  useKnowledgeAssetMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteKnowledgeAssetMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getListPositionsQueryKey: () => ["positions"],
  useListPositions: () => ({
    data: [{ id: 7, name: "Auditor Interno" }],
  }),
  useListDocuments: () => ({
    data: [{ id: 33, title: "Manual SGQ" }],
  }),
}));

describe("governance knowledge assets page", () => {
  beforeEach(() => {
    permissionsState.canWriteGovernance = true;
    window.history.replaceState({}, "", "/governanca/conhecimento-critico?positionId=7");
  });

  it("renders the knowledge asset list with status badges and contextual position filter", () => {
    renderWithQueryClient(<GovernanceKnowledgeAssetsPage />);

    expect(
      screen.getAllByText("Conhecimento crítico de auditoria").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Sem evidência").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Risco Crítico").length).toBeGreaterThan(0);
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("7");
  });

  it("hides the create action for read-only governance users", () => {
    permissionsState.canWriteGovernance = false;

    renderWithQueryClient(<GovernanceKnowledgeAssetsPage />);

    expect(
      screen.queryByRole("button", { name: "Novo ativo" }),
    ).toBeNull();
  });
});
