import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LearningSummary } from "@workspace/api-client-react";

const SUMMARY: LearningSummary = {
  cards: {
    patCompletion: 74,
    effectiveness: 63,
    criticalGaps: 38,
    expiredTrainings: 12,
    mandatoryCoverage: 87,
    hoursPerEmployee: 18,
  },
  targets: [
    { metric: "pat_completion", goal: 80, tolerance: 1, direction: "up" },
    { metric: "effectiveness_overall", goal: 80, tolerance: 1, direction: "up" },
    { metric: "mandatory_coverage", goal: 100, tolerance: 2, direction: "up" },
    { metric: "hours_per_employee", goal: 20, tolerance: 2, direction: "up" },
    { metric: "critical_gaps", goal: 0, tolerance: 0, direction: "down" },
    { metric: "expired_trainings", goal: 0, tolerance: 0, direction: "down" },
  ],
  byUnit: [
    {
      unitId: 1,
      unitName: "Curitiba",
      completion: 88,
      effectiveness: 87,
      gaps: 4,
      status: "ok",
    },
    {
      unitId: 2,
      unitName: "Porto Alegre",
      completion: 22,
      effectiveness: 51,
      gaps: 6,
      status: "critico",
    },
  ],
  byNorm: [
    { norm: "ISO 9001 — Qualidade", effectiveness: 85 },
    { norm: "ISO 39001 — Seg. Viária", effectiveness: 63 },
  ],
  expired: [
    {
      employeeName: "Fulano de Tal",
      unitName: "Curitiba",
      title: "Direção defensiva",
      expirationDate: "2026-03-15",
    },
  ],
  pendingEffectiveness: [
    { employeeName: "Beltrano", title: "NR-35 Trabalho em altura" },
  ],
};

vi.mock("@workspace/api-client-react", () => ({
  useGetLearningDashboardSummary: () => ({
    data: SUMMARY,
    isLoading: false,
    isError: false,
  }),
  getGetLearningDashboardSummaryQueryKey: () => ["learning-summary"],
  useListKpiIndicators: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
  getListKpiIndicatorsQueryKey: () => ["kpi-indicators"],
  useActivateLmsIndicators: () => ({ mutate: vi.fn(), isPending: false }),
  useListUnits: () => ({ data: [{ id: 1, name: "Curitiba" }] }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
  usePermissions: vi.fn(),
}));
vi.mock("@/contexts/LayoutContext", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/norms-client", () => ({
  useAllNorms: () => ({ data: [] }),
  buildNormLabelMap: () => new Map(),
}));
vi.mock("@/lib/action-plans-client", () => ({
  useActionPlans: () => ({
    data: [
      {
        id: 5,
        code: "PA-005",
        title: "Retraining — Direção defensiva POA",
        status: "open",
        priority: "high",
        createdAt: "2026-06-15T10:00:00Z",
        dueDate: "2026-09-01",
        responsibleUserName: "Aline P.",
        sourceContext: { label: "Eficácia não eficaz" },
      },
    ],
  }),
  ACTION_PLAN_STATUS_LABELS: { open: "Aberto" },
  actionPlanStatusColor: () => "",
  formatCalendarDateBR: (v: string) => v,
}));

import AprendizagemIndicadoresPage from "@/pages/app/aprendizagem/indicadores";
import { useAuth, usePermissions } from "@/contexts/AuthContext";

const mockAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mockPermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;

describe("AprendizagemIndicadoresPage — layout", () => {
  beforeEach(() => {
    mockAuth.mockReturnValue({
      user: { organizationId: 2 },
      organization: { id: 2, name: "Org Teste" },
    });
    mockPermissions.mockReturnValue({
      hasModuleAccess: () => true,
      canWriteModule: () => true,
    });
  });

  it("mostra os quatro cards do bloco de cumprimento com meta e situação", () => {
    render(<AprendizagemIndicadoresPage />);

    expect(screen.getByText("Cumprimento e cobertura")).toBeInTheDocument();

    // Os dois indicadores que antes não existiam na tela.
    expect(screen.getByText("Horas / colaborador")).toBeInTheDocument();
    expect(
      screen.getByText("% cobertura treinamentos obrigatórios"),
    ).toBeInTheDocument();

    // Valor + meta vindos do payload (não de constante da tela).
    expect(screen.getByText("18h")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument(); // meta de cobertura
    expect(screen.getAllByText("Crítico").length).toBeGreaterThan(0);
  });

  it("inclui a coluna Gap na tabela por filial", () => {
    render(<AprendizagemIndicadoresPage />);
    const header = screen.getByText("Gap");
    expect(header).toBeInTheDocument();

    const row = screen.getByText("Porto Alegre").closest("tr")!;
    expect(within(row).getByText("6")).toBeInTheDocument();
  });

  it("alerta sobre a norma mais distante da meta de eficácia", () => {
    render(<AprendizagemIndicadoresPage />);
    // ISO 39001 (63%) está abaixo da meta de 80% e é a pior do conjunto.
    expect(
      screen.getByText(/ISO 39001/, { selector: "strong" }),
    ).toBeInTheDocument();
  });

  it("lista as ações geradas a partir de treinamento", () => {
    render(<AprendizagemIndicadoresPage />);
    expect(screen.getByText("Ações geradas")).toBeInTheDocument();
    expect(
      screen.getByText(/Retraining — Direção defensiva POA/),
    ).toBeInTheDocument();
  });

  it("expõe vencidos e eficácia pendente, que antes vinham da API sem serem exibidos", () => {
    render(<AprendizagemIndicadoresPage />);
    expect(screen.getByText("Treinamentos vencidos")).toBeInTheDocument();
    expect(screen.getByText("Eficácia pendente")).toBeInTheDocument();
    expect(screen.getByText(/Fulano de Tal/)).toBeInTheDocument();
  });

  it("oferece export em PDF e Excel no lugar do print da tela", async () => {
    render(<AprendizagemIndicadoresPage />);
    const trigger = screen.getByRole("button", { name: /Exportar relatório/ });
    expect(trigger).toBeInTheDocument();
  });
});
