import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EficaciaPage from "@/pages/app/aprendizagem/eficacia";
import { renderWithQueryClient } from "../support/render";

// A cliente não quer ver o histórico puro (reuniões/orientações que nunca
// entram no fluxo de eficácia) despejado no board como falsos "a avaliar".
// A única diferença entre scope="all" e scope="needs_evaluation" é esse
// histórico — então o board tem de buscar SEMPRE com "needs_evaluation",
// sem toggle para o usuário trocar para "all".

const mockListOrganizationTrainings = vi.fn(() => ({
  data: { data: [], stats: undefined },
  isLoading: false,
}));

vi.mock("@/contexts/LayoutContext", () => ({
  usePageTitle: vi.fn(),
  usePageSubtitle: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { organizationId: 101 } }),
  usePermissions: () => ({ canWriteModule: () => false }),
}));

vi.mock("@/lib/training-catalog-client", () => ({
  useAllTrainingCatalog: () => ({ data: { data: [] } }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListOrganizationTrainings: (...args: unknown[]) =>
    mockListOrganizationTrainings(...args),
  useCreateTrainingEffectivenessReview: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useAssignTrainingEffectiveness: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useListUnits: () => ({ data: [] }),
  getListOrganizationTrainingsQueryKey: (...args: unknown[]) => [
    "org-trainings",
    ...args,
  ],
  getListUnitsQueryKey: () => ["units"],
}));

describe("board de eficácia — escopo fixo (sem histórico)", () => {
  beforeEach(() => {
    mockListOrganizationTrainings.mockClear();
  });

  it("busca as 3 colunas sempre com scope: needs_evaluation, nunca 'all'", () => {
    renderWithQueryClient(<EficaciaPage />);

    // As 3 colunas (pendentes/em_avaliacao/concluidas) usam sharedParams —
    // nenhuma chamada pode ter escapado com scope: "all".
    expect(mockListOrganizationTrainings.mock.calls.length).toBeGreaterThan(0);
    for (const call of mockListOrganizationTrainings.mock.calls) {
      const params = call[1] as { scope?: string };
      expect(params.scope).toBe("needs_evaluation");
    }
    const scopes = mockListOrganizationTrainings.mock.calls.map(
      (call) => (call[1] as { scope?: string }).scope,
    );
    expect(scopes).not.toContain("all");
  });

  it("não exibe mais o toggle 'Ver todos (inclui histórico)'", () => {
    renderWithQueryClient(<EficaciaPage />);
    expect(
      screen.queryByText("Ver todos (inclui histórico)"),
    ).not.toBeInTheDocument();
  });
});
