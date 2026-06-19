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
    completedToday: 0,
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
  useAuth: vi.fn(),
  usePermissions: vi.fn(),
}));
vi.mock("@/contexts/LayoutContext", () => ({
  usePageTitle: vi.fn(),
  usePageSubtitle: vi.fn(),
}));

import { usePendencias } from "@/lib/pendencias-client";
import { useAuth, usePermissions } from "@/contexts/AuthContext";

const mockPendencias = usePendencias as unknown as ReturnType<typeof vi.fn>;
const mockAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mockPermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;

describe("SuasPendenciasPage — operator (identity, cards, no selector)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00"));
    mockAuth.mockReturnValue({
      organization: { id: 9 },
      user: { id: 1, name: "João Silva", role: "operator" },
      role: "operator",
      unitId: 7,
    });
    mockPermissions.mockReturnValue({ isAdmin: false, role: "operator" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the user block and summary counts", () => {
    mockPendencias.mockReturnValue({ data: response, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("João Silva")).toBeInTheDocument();
    expect(screen.getByText("POA")).toBeInTheDocument();
    expect(screen.getByText("Operador")).toBeInTheDocument();
    expect(screen.getByText(/hoje às 08:12/)).toBeInTheDocument();
    expect(screen.getByText("Total em aberto")).toBeInTheDocument();
  });

  it("shows no scope selector for an operator", () => {
    mockPendencias.mockReturnValue({ data: response, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.queryByText("Por filial")).not.toBeInTheDocument();
    expect(screen.queryByText("Organização")).not.toBeInTheDocument();
    expect(screen.queryByText("Minha filial")).not.toBeInTheDocument();
  });

  it("renders loading state", () => {
    mockPendencias.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("renders error state", () => {
    mockPendencias.mockReturnValue({ data: undefined, isLoading: false, isError: true });
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
    mockPendencias.mockReturnValue({ data: withItems, isLoading: false, isError: false });
    const { rerender } = render(<SuasPendenciasPage />);
    expect(screen.getByText("Fazer agora")).toBeInTheDocument();
    expect(screen.getByText("Revisar procedimento de carga")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Ver plano/ });
    expect(cta).toHaveAttribute("href", "/planos-acao/5");

    mockPendencias.mockReturnValue({
      data: { ...response, items: [], counts: { ...response.counts, total: 0, overdue: 0, dueSoon: 0 } },
      isLoading: false,
      isError: false,
    });
    rerender(<SuasPendenciasPage />);
    expect(screen.getByText(/Você está em dia/)).toBeInTheDocument();
  });

  it("renders the Concluídos hoje section when present", () => {
    const withDone = {
      ...response,
      items: [],
      completedToday: [
        {
          id: "action_plan:9",
          source: "action_plan" as const,
          sourceLabel: "Plano de ação",
          title: "Plano encerrado",
          statusLabel: "Encerrado hoje",
          dueDate: "2026-06-19",
          urgency: "no_due" as const,
          responsibleUserId: 1,
          link: { route: "/planos-acao/9", ctaLabel: "Ver plano" },
        },
      ],
      counts: { ...response.counts, total: 0, overdue: 0, dueSoon: 0, completedToday: 1 },
    };
    mockPendencias.mockReturnValue({ data: withDone, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("Concluídos hoje")).toBeInTheDocument();
    expect(screen.getByText("Plano encerrado")).toBeInTheDocument();
  });
});

describe("SuasPendenciasPage — manager scope toggle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00"));
    mockAuth.mockReturnValue({
      organization: { id: 9 },
      user: { id: 2, name: "Maria Gestora", role: "manager" },
      role: "manager",
      unitId: 7,
    });
    mockPermissions.mockReturnValue({ isAdmin: false, role: "manager" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults a manager to their filial and offers the two-button toggle", () => {
    mockPendencias.mockReturnValue({ data: { ...response, scope: "unit" }, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("Minha filial")).toBeInTheDocument();
    expect(screen.getByText("Só as minhas")).toBeInTheDocument();
    expect(screen.queryByText("Organização")).not.toBeInTheDocument();
    // Default scope is the manager's own unit.
    expect(mockPendencias).toHaveBeenLastCalledWith(9, expect.objectContaining({ scope: "unit", unitId: 7 }));
  });

  it("switches to 'Só as minhas' when toggled", () => {
    mockPendencias.mockReturnValue({ data: { ...response, scope: "unit" }, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);
    act(() => {
      screen.getByText("Só as minhas").click();
    });
    expect(mockPendencias).toHaveBeenLastCalledWith(9, expect.objectContaining({ scope: "mine" }));
  });
});

describe("SuasPendenciasPage — admin scope selector (regression)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00"));
    mockAuth.mockReturnValue({
      organization: { id: 9 },
      user: { id: 1, name: "João Silva", role: "org_admin" },
      role: "org_admin",
      unitId: null,
    });
    mockPermissions.mockReturnValue({ isAdmin: true, role: "org_admin" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scope buttons render outside the data guard — visible when data is undefined", () => {
    mockPendencias.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<SuasPendenciasPage />);

    expect(screen.getByText("Minhas")).toBeInTheDocument();
    expect(screen.getByText("Por filial")).toBeInTheDocument();
    expect(screen.getByText("Organização")).toBeInTheDocument();

    act(() => {
      screen.getByText("Por filial").click();
    });
    expect(screen.getByText(/Selecione uma filial para ver as pendências/)).toBeInTheDocument();
  });
});
