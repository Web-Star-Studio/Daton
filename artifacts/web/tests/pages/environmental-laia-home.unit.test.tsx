import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EnvironmentalLaiaPage from "@/pages/app/ambiental/laia";

const navigateMock = vi.fn();

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/app/ambiental/laia", navigateMock],
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    organization: { id: 1 },
  }),
}));

vi.mock("@/contexts/LayoutContext", () => ({
  useHeaderActions: vi.fn(),
  usePageSubtitle: vi.fn(),
  usePageTitle: vi.fn(),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div role="tablist">{children}</div>
  ),
  TabsTrigger: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <button role="tab">{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@workspace/api-client-react", () => ({
  getListLegislationsQueryKey: vi.fn(() => ["legislations"]),
  getListUnitsQueryKey: vi.fn(() => ["units"]),
  useListLegislations: vi.fn(() => ({ data: [] })),
  useListUnits: vi.fn(() => ({
    data: [
      { id: 7, name: "Unidade Sede" },
      { id: 8, name: "Filial Sul" },
    ],
  })),
}));

vi.mock("@/lib/environmental-laia-client", () => ({
  createLaiaMonitoringPlan: vi.fn(),
  useCreateLaiaAssessment: vi.fn(() => ({
    isPending: false,
    mutateAsync: vi.fn(),
  })),
  useCreateLaiaSector: vi.fn(() => ({
    isPending: false,
    mutateAsync: vi.fn(),
  })),
  useLaiaAssessment: vi.fn(() => ({ data: undefined })),
  useLaiaAssessments: vi.fn(() => ({ data: [] })),
  useLaiaBranchConfigs: vi.fn(() => ({
    data: [
      {
        id: 1,
        unitId: 7,
        unitName: "Unidade Sede",
        surveyStatus: "levantado",
        updatedAt: "2026-03-30T12:00:00.000Z",
        totalAssessments: 8,
        criticalAssessments: 2,
        significantAssessments: 3,
        notSignificantAssessments: 5,
      },
      {
        id: null,
        unitId: 8,
        unitName: "Filial Sul",
        surveyStatus: "nao_levantado",
        updatedAt: null,
        totalAssessments: 0,
        criticalAssessments: 0,
        significantAssessments: 0,
        notSignificantAssessments: 0,
      },
    ],
  })),
  useLaiaDashboard: vi.fn(() => ({
    data: {
      totalAssessments: 8,
      significantAssessments: 3,
      criticalAssessments: 2,
      withoutControlResponsible: 1,
      withLegalRequirement: 0,
      withMonitoringPending: 1,
      byOperationalSituation: {},
      byLifecycleStage: {},
    },
  })),
  useLaiaMethodology: vi.fn(() => ({
    data: {
      id: 1,
      name: "Metodologia LAIA",
      status: "active",
      activeVersionId: 1,
      createdAt: null,
      updatedAt: null,
      versions: [
        {
          id: 1,
          versionNumber: 3,
          title: "Versão 3",
          scoreThresholds: { negligibleMax: 49, moderateMax: 70 },
          moderateSignificanceRule: "Regra padrão",
          publishedAt: "2026-03-15T12:00:00.000Z",
          notes: null,
        },
      ],
    },
  })),
  useLaiaRevisions: vi.fn(() => ({
    data: [
      {
        id: 11,
        assessmentId: 99,
        title: "Revisão anual",
        description: null,
        revisionNumber: 4,
        status: "finalized",
        createdAt: "2026-03-20T12:00:00.000Z",
        finalizedAt: null,
        changes: [],
      },
    ],
  })),
  useLaiaSectors: vi.fn(() => ({ data: [] })),
  usePublishLaiaMethodology: vi.fn(() => ({
    isPending: false,
    mutateAsync: vi.fn(),
  })),
  useUpdateLaiaAssessment: vi.fn(() => ({
    isPending: false,
    mutateAsync: vi.fn(),
  })),
}));

describe("Environmental LAIA home page", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("renders methodology, units and revisions tabs in the expected order", () => {
    render(<EnvironmentalLaiaPage />);

    expect(screen.queryByRole("tab", { name: "Matriz" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Setores" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Metodologia",
      "Unidades",
      "Revisões",
    ]);
  });

  it("renders unit cards with metrics and navigates to the unit detail route", () => {
    render(<EnvironmentalLaiaPage />);

    expect(screen.getByText("Unidade Sede")).toBeInTheDocument();
    expect(screen.getByText("Filial Sul")).toBeInTheDocument();
    expect(screen.getAllByText("Significativas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Não significativas").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Unidade Sede/i }));

    expect(navigateMock).toHaveBeenCalledWith("/app/ambiental/laia/unidades/7");
  });
});
