import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomersPage from "@/pages/app/qualidade/clientes";
import CustomerDetailPage from "@/pages/app/qualidade/clientes/[id]";
import { renderWithQueryClient } from "../support/render";

const navigateMock = vi.fn();
const toastMock = vi.fn();
const createCustomerMock = vi.fn();
const listCustomersMock = vi.fn();
const getCustomerDetailMock = vi.fn();
let latestHeaderActions: React.ReactNode = null;

const authState = {
  role: "org_admin" as "org_admin" | "platform_admin" | "operator" | "analyst",
};

const customerDetail = {
  id: 77,
  organizationId: 101,
  personType: "pj",
  legalIdentifier: "12.345.678/0001-00",
  legalName: "Cliente SGI Exemplo",
  tradeName: "Cliente Exemplo",
  responsibleName: "Responsável Cliente",
  email: "cliente@daton.test",
  phone: "(81) 99999-0000",
  status: "active",
  criticality: "high",
  notes: "Cliente com requisito crítico.",
  createdById: 1,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  requirements: [
    {
      id: 5,
      organizationId: 101,
      customerId: 77,
      unitId: 1,
      unitName: "Matriz",
      unit: { id: 1, name: "Matriz" },
      processId: 2,
      processName: "Atendimento SGI",
      process: { id: 2, name: "Atendimento SGI" },
      responsibleUserId: 21,
      responsibleUserName: "Gestor SGI",
      responsibleUser: { id: 21, name: "Gestor SGI" },
      serviceType: "Prestação de serviço controlado",
      title: "Prazo de resposta acordado",
      description: "Responder solicitações críticas em até 24 horas.",
      source: "Contrato",
      status: "accepted_with_restrictions",
      currentVersion: 2,
      createdById: 1,
      updatedById: 1,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
  ],
  reviews: [
    {
      id: 9,
      requirementId: 5,
      reviewedById: 21,
      reviewedByName: "Gestor SGI",
      decision: "accepted_with_restrictions",
      capacityAnalysis: "Há capacidade com reforço de equipe.",
      restrictions: "Aceite condicionado à janela operacional.",
      justification: null,
      decisionDate: "2026-04-01T00:00:00.000Z",
      attachments: [],
      createdAt: "2026-04-01T00:00:00.000Z",
    },
  ],
  history: [
    {
      id: 11,
      requirementId: 5,
      changedById: 21,
      changedByName: "Gestor SGI",
      changeType: "reviewed",
      changeSummary: "Análise crítica de capacidade registrada.",
      version: 2,
      previousSnapshot: null,
      snapshot: {
        unitId: 1,
        processId: 2,
        responsibleUserId: 21,
        serviceType: "Prestação de serviço controlado",
        title: "Prazo de resposta acordado",
        description: "Responder solicitações críticas em até 24 horas.",
        source: "Contrato",
        status: "accepted_with_restrictions",
        currentVersion: 2,
      },
      createdAt: "2026-04-01T00:00:00.000Z",
    },
  ],
};

vi.mock("@/contexts/LayoutContext", () => ({
  useHeaderActions: (actions: React.ReactNode) => {
    latestHeaderActions = actions;
  },
  usePageTitle: vi.fn(),
  usePageSubtitle: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    organization: { id: 101 },
    role: authState.role,
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/qualidade/clientes", navigateMock],
  useParams: () => ({ id: "77" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListUnits: () => ({
    data: [{ id: 1, name: "Matriz" }],
  }),
  useListUserOptions: () => ({
    data: [{ id: 21, name: "Gestor SGI" }],
  }),
  getListUnitsQueryKey: () => ["units"],
  getListUserOptionsQueryKey: () => ["user-options"],
}));

vi.mock("@/lib/governance-system-client", () => ({
  useAllActiveSgqProcesses: () => ({
    data: [{ id: 2, name: "Atendimento SGI" }],
  }),
}));

vi.mock("@/lib/customers-client", () => ({
  customersKeys: {
    all: ["customers"],
    list: (orgId: number, filters?: Record<string, unknown>) => [
      "customers",
      orgId,
      "list",
      filters || {},
    ],
    detail: (orgId: number, customerId: number) => [
      "customers",
      orgId,
      "detail",
      customerId,
    ],
  },
  listCustomers: (...args: unknown[]) => listCustomersMock(...args),
  createCustomer: (...args: unknown[]) => createCustomerMock(...args),
  getCustomerDetail: (...args: unknown[]) => getCustomerDetailMock(...args),
  createCustomerRequirement: vi.fn(),
  createCustomerRequirementReview: vi.fn(),
}));

describe("customers pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestHeaderActions = null;
    authState.role = "org_admin";
    listCustomersMock.mockResolvedValue([]);
    createCustomerMock.mockResolvedValue({ ...customerDetail, id: 88 });
    getCustomerDetailMock.mockResolvedValue(customerDetail);
  });

  it("shows the empty state and validates the create customer dialog", async () => {
    renderWithQueryClient(<CustomersPage />);

    expect(
      await screen.findByText("Nenhum cliente SGI cadastrado"),
    ).toBeInTheDocument();
    expect(latestHeaderActions).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Novo cliente" }));
    expect(
      screen.getByRole("button", { name: "Criar cliente" }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/CNPJ/), {
      target: { value: "12.345.678/0001-00" },
    });
    fireEvent.change(screen.getByLabelText(/Razão social/), {
      target: { value: "Cliente SGI Exemplo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar cliente" }));

    await waitFor(() => expect(createCustomerMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/qualidade/clientes/88");
  });

  it("hides create actions for analysts", async () => {
    authState.role = "analyst";
    renderWithQueryClient(<CustomersPage />);

    expect(
      await screen.findByText("Nenhum cliente SGI cadastrado"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novo cliente" })).toBeNull();
    expect(latestHeaderActions).toBeNull();
  });

  it("renders requirements, reviews and history on the detail page", async () => {
    renderWithQueryClient(<CustomerDetailPage />);

    expect(await screen.findByText("Prazo de resposta acordado")).toBeVisible();
    expect(
      screen.getByText(
        "Prestação de serviço controlado · Matriz · Atendimento SGI",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Análises críticas" }));
    expect(
      screen.getByText("Há capacidade com reforço de equipe."),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));
    expect(
      screen.getByText("Análise crítica de capacidade registrada."),
    ).toBeVisible();
  });
});
