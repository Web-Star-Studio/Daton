import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EnvironmentalLaiaUnitDetailPage from "@/pages/app/ambiental/laia/unidades/[unitId]";

const navigateMock = vi.fn();
const updateBranchConfigMutateAsync = vi.fn();
const updateSectorMutateAsync = vi.fn();

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/app/ambiental/laia/unidades/7", navigateMock],
    useParams: () => ({ unitId: "7" }),
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
  }: {
    children: React.ReactNode;
  }) => <button role="tab">{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ChartTooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ChartTooltipContent: () => null,
}));

vi.mock("@workspace/api-client-react", () => ({
  getListLegislationsQueryKey: vi.fn(() => ["legislations"]),
  getListUnitsQueryKey: vi.fn(() => ["units"]),
  useListLegislations: vi.fn(() => ({
    data: [{ id: 31, title: "Lei ambiental" }],
  })),
  useListUnits: vi.fn(() => ({
    data: [{ id: 7, name: "Unidade Sede" }],
  })),
}));

vi.mock("@/components/environmental/laia/assessment-dialog", () => ({
  LaiaAssessmentDialog: ({ open }: { open: boolean }) =>
    open ? <div>Assessment dialog open</div> : null,
  getLatestUnitDraftId: vi.fn(() => null),
}));

vi.mock("@/components/environmental/laia/sector-dialog", () => ({
  LaiaSectorDialog: ({ open }: { open: boolean }) =>
    open ? <div>Sector dialog open</div> : null,
}));

vi.mock("@/lib/environmental-laia-client", () => ({
  useLaiaAssessments: vi.fn((orgId: number | undefined, filters?: { status?: string }) => {
    if (filters?.status === "draft") {
      return { data: [] };
    }

    return {
      data: [
        {
          id: 101,
          unitId: 7,
          sectorId: 21,
          aspectCode: "LAIA-101",
          activityOperation: "Tratamento de efluentes",
          environmentalAspect: "Efluente líquido",
          environmentalImpact: "Contaminação hídrica",
          status: "active",
          category: "critico",
          significance: "significant",
          totalScore: 82,
          operationalSituation: "normal",
          sectorName: "Atividade ETE",
          unitName: "Unidade Sede",
          createdAt: null,
          updatedAt: null,
        },
      ],
    };
  }),
  useLaiaBranchConfigs: vi.fn(() => ({
    data: [
      {
        id: 4,
        unitId: 7,
        unitName: "Unidade Sede",
        surveyStatus: "em_levantamento",
        updatedAt: "2026-03-30T12:00:00.000Z",
        totalAssessments: 1,
        criticalAssessments: 1,
        significantAssessments: 1,
        notSignificantAssessments: 0,
      },
    ],
  })),
  useLaiaSectors: vi.fn(() => ({
    data: [
      {
        id: 21,
        unitId: 7,
        departmentId: null,
        code: "ETE-01",
        name: "Atividade ETE",
        description: "Tratamento de efluentes industriais",
        isActive: true,
        createdAt: null,
        updatedAt: null,
      },
    ],
  })),
  useLaiaUnitOverview: vi.fn(() => ({
    data: {
      unitId: 7,
      unitName: "Unidade Sede",
      surveyStatus: "em_levantamento",
      totalAssessments: 4,
      byTemporality: { futura: 1, atual: 2, passada: 1 },
      byOperationalSituation: { normal: 2, anormal: 1, emergencia: 1 },
      byIncidence: { direto: 3, indireto: 1 },
      byImpactClass: { adverso: 3, benefico: 1 },
    },
  })),
  useUpdateLaiaBranchConfig: vi.fn(() => ({
    mutateAsync: updateBranchConfigMutateAsync,
  })),
  useUpdateLaiaSector: vi.fn(() => ({
    mutateAsync: updateSectorMutateAsync,
  })),
}));

describe("Environmental LAIA unit detail page", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    updateBranchConfigMutateAsync.mockReset().mockResolvedValue(undefined);
    updateSectorMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  it("renders the expected tabs and unit assessment table", () => {
    render(<EnvironmentalLaiaUnitDetailPage />);

    expect(screen.getByText("Unidade Sede")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Visão geral",
      "Avaliações",
      "Setores",
    ]);

    expect(screen.getByText("LAIA-101")).toBeInTheDocument();
    expect(screen.getByText("Tratamento de efluentes")).toBeInTheDocument();
    expect(screen.getByText("Contaminação hídrica")).toBeInTheDocument();
  });

  it("updates the survey status and toggles the sector status", async () => {
    render(<EnvironmentalLaiaUnitDetailPage />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Status de levantamento"), {
        target: { value: "levantado" },
      });
    });

    expect(updateBranchConfigMutateAsync).toHaveBeenCalledWith({
      unitId: 7,
      surveyStatus: "levantado",
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("switch"));
    });

    expect(updateSectorMutateAsync).toHaveBeenCalledWith({
      sectorId: 21,
      isActive: false,
    });
  });
});
