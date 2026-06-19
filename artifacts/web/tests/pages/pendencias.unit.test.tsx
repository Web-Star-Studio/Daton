import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

vi.mock("@/lib/pendencias-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pendencias-format")>(
    "@/lib/pendencias-format",
  );
  return { ...actual, usePendencias: vi.fn() };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ organization: { id: 9 }, user: { id: 1, name: "João Silva", role: "operator" }, unitId: 7 }),
  usePermissions: () => ({ isAdmin: false, role: "operator" }),
}));
vi.mock("@/contexts/LayoutContext", () => ({
  usePageTitle: vi.fn(),
  usePageSubtitle: vi.fn(),
}));

import { usePendencias } from "@/lib/pendencias-client";

describe("SuasPendenciasPage — identity + cards", () => {
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
});
