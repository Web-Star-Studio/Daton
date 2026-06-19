import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SuasPendenciasPage from "@/pages/app/pendencias";
import type { PendenciasResponse } from "@/lib/pendencias-format";

const response: PendenciasResponse = {
  user: {
    id: 1,
    name: "João Silva",
    role: "operator",
    lastLoginAt: "2026-06-19T08:12:00",
    filial: { id: 7, name: "POA" },
  },
  scope: "mine",
  counts: {
    total: 2,
    overdue: 1,
    dueSoon: 1,
    noDue: 0,
    upcoming: 0,
    bySource: { kpi: 1, action_plan: 1, nonconformity: 0, regulatory_document: 0 },
  },
  items: [],
  completedToday: [],
};

vi.mock("@workspace/api-client-react", () => ({
  useListUnits: () => ({ data: [] }),
  getListUnitsQueryKey: () => ["units"],
}));
vi.mock("@/lib/pendencias-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pendencias-format")>(
    "@/lib/pendencias-format",
  );
  return { ...actual, usePendencias: vi.fn() };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ organization: { id: 9 }, user: { id: 1, name: "João Silva", role: "operator" }, unitId: 7 }),
  usePermissions: vi.fn().mockReturnValue({ isAdmin: false, role: "operator" }),
}));
vi.mock("@/contexts/LayoutContext", () => ({
  usePageTitle: vi.fn(),
  usePageSubtitle: vi.fn(),
}));

import { usePendencias } from "@/lib/pendencias-client";
import { usePermissions } from "@/contexts/AuthContext";

describe("SuasPendenciasPage — identity + cards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00"));
    (usePermissions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ isAdmin: false, role: "operator" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the user block and summary counts", () => {
    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: response,
      isLoading: false,
      isError: false,
    });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("João Silva")).toBeInTheDocument();
    expect(screen.getByText("POA")).toBeInTheDocument(); // filial
    expect(screen.getByText("Operador")).toBeInTheDocument(); // perfil
    expect(screen.getByText(/hoje às 08:12/)).toBeInTheDocument(); // último acesso
    expect(screen.getByText("Total em aberto")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("renders error state", () => {
    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<SuasPendenciasPage />);
    expect(screen.getByText(/Não foi possível carregar/)).toBeInTheDocument();
  });

  it("renders priority sections, a card with deep-link CTA, and the empty state", () => {
    const withItems: PendenciasResponse = {
      ...response,
      items: [
        {
          id: "action_plan:5",
          source: "action_plan",
          sourceLabel: "Plano de ação",
          title: "Revisar procedimento de carga",
          statusLabel: "Aberto",
          dueDate: "2026-06-10",
          urgency: "overdue",
          responsibleUserId: 1,
          link: { route: "/planos-acao/5", ctaLabel: "Ver plano" },
        },
      ],
    };
    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: withItems,
      isLoading: false,
      isError: false,
    });
    const { rerender } = render(<SuasPendenciasPage />);
    expect(screen.getByText("Fazer agora")).toBeInTheDocument();
    expect(screen.getByText("Revisar procedimento de carga")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Ver plano/ });
    expect(cta).toHaveAttribute("href", "/planos-acao/5");

    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...response, items: [], counts: { ...response.counts, total: 0, overdue: 0, dueSoon: 0 } },
      isLoading: false,
      isError: false,
    });
    rerender(<SuasPendenciasPage />);
    expect(screen.getByText(/Você está em dia/)).toBeInTheDocument();
  });
});

describe("SuasPendenciasPage — admin scope selector (regression)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00"));
    (usePermissions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ isAdmin: true, role: "org_admin" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scope buttons render outside the data guard — visible when data is undefined", () => {
    // Simulate scope=unit with no unit selected: query is disabled, data stays undefined.
    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    render(<SuasPendenciasPage />);

    // All three scope buttons must be present even though data is undefined.
    expect(screen.getByText("Minhas")).toBeInTheDocument();
    expect(screen.getByText("Por filial")).toBeInTheDocument();
    expect(screen.getByText("Organização")).toBeInTheDocument();

    // Clicking "Por filial" (scope → "unit", unitId still null) should surface the
    // guidance hint instead of a blank screen.
    act(() => {
      screen.getByText("Por filial").click();
    });
    expect(screen.getByText(/Selecione uma filial para ver as pendências/)).toBeInTheDocument();
  });
});
