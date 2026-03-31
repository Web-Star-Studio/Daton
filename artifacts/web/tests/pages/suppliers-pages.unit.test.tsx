import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SuppliersPage from "@/pages/app/qualidade/fornecedores";
import SupplierDetailPage from "@/pages/app/qualidade/fornecedores/[id]";
import { renderWithQueryClient } from "../support/render";

const navigateMock = vi.fn();
const toastMock = vi.fn();
const createSupplierMock = vi.fn();
const createSupplierReceiptCheckMock = vi.fn();
let latestHeaderActions: React.ReactNode = null;

const authState = {
  role: "org_admin" as "org_admin" | "platform_admin" | "operator" | "analyst",
};

const supplierDetail = {
  id: 55,
  personType: "pj",
  legalIdentifier: "12.345.678/0001-00",
  legalName: "Fornecedor Exemplo",
  tradeName: "Fornecedor Exemplo",
  category: { id: 9, name: "Serviços" },
  units: [{ id: 1, name: "Matriz" }],
  types: [{ id: 3, name: "Consultoria" }],
  status: "draft",
  criticality: "medium",
  email: "contato@fornecedor.test",
  phone: "(81) 99999-0000",
  website: "https://fornecedor.test",
  postalCode: "50000-000",
  street: "Rua Central",
  streetNumber: "100",
  complement: "",
  neighborhood: "Centro",
  city: "Recife",
  state: "PE",
  notes: "",
  documentCompliancePercentage: null,
  documentReviewStatus: null,
  qualifiedUntil: null,
  offerings: [{ id: 101, name: "Produto crítico", offeringType: "product" }],
  documents: { submissions: [], reviews: [] },
  qualificationReviews: [],
  requirements: { templates: [], communications: [] },
  performanceReviews: [],
  receiptChecks: [],
  failures: [],
};

const activateTab = (name: string) => {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);

  return tab;
};

vi.mock("@/contexts/LayoutContext", () => ({
  useHeaderActions: (actions: React.ReactNode) => {
    latestHeaderActions = actions;
  },
  usePageTitle: vi.fn(),
  usePageSubtitle: vi.fn(),
}));

vi.mock("@/components/ui/tabs", async () => {
  const ReactModule = await import("react");
  const TabsContext = ReactModule.createContext<{
    value: string;
    onValueChange: (value: string) => void;
  } | null>(null);

  return {
    Tabs: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) => (
      <TabsContext.Provider value={{ value, onValueChange }}>
        <div data-testid="mock-tabs-root">{children}</div>
      </TabsContext.Provider>
    ),
    TabsList: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div role="tablist" className={className}>
        {children}
      </div>
    ),
    TabsTrigger: ({
      value,
      children,
      className,
    }: {
      value: string;
      children: React.ReactNode;
      className?: string;
    }) => {
      const context = ReactModule.useContext(TabsContext);
      if (!context) throw new Error("TabsTrigger must be used inside Tabs");

      return (
        <button
          type="button"
          role="tab"
          aria-selected={context.value === value}
          className={className}
          onClick={() => context.onValueChange(value)}
        >
          {children}
        </button>
      );
    },
    TabsContent: ({
      value,
      children,
      className,
    }: {
      value: string;
      children: React.ReactNode;
      className?: string;
    }) => {
      const context = ReactModule.useContext(TabsContext);
      if (!context || context.value !== value) return null;

      return (
        <div role="tabpanel" className={className}>
          {children}
        </div>
      );
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    organization: { id: 101 },
    role: authState.role,
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/app/qualidade/fornecedores", navigateMock],
  useParams: () => ({ id: "55" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@/lib/uploads", () => ({
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT: ".pdf,image/*",
  formatFileSize: (value: number) => `${value} bytes`,
  uploadFilesToStorage: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListUnits: () => ({
    data: [{ id: 1, name: "Matriz" }],
  }),
  useListUserOptions: () => ({
    data: [{ id: 21, label: "Gestor da qualidade" }],
  }),
  getListUnitsQueryKey: () => ["units"],
  getListUserOptionsQueryKey: () => ["user-options"],
}));

vi.mock("@/lib/suppliers-client", () => ({
  suppliersKeys: {
    all: ["suppliers"],
    list: (orgId: number, filters: unknown) => [
      "suppliers",
      "list",
      orgId,
      filters,
    ],
    detail: (orgId: number, supplierId: number) => [
      "suppliers",
      "detail",
      orgId,
      supplierId,
    ],
    categories: (orgId: number) => ["suppliers", "categories", orgId],
    requirements: (orgId: number) => ["suppliers", "requirements", orgId],
    templates: (orgId: number) => ["suppliers", "templates", orgId],
    types: (orgId: number) => ["suppliers", "types", orgId],
  },
  listSuppliers: vi.fn(async () => []),
  listSupplierCategories: vi.fn(async () => [{ id: 9, name: "Serviços" }]),
  listSupplierTypes: vi.fn(async () => [{ id: 3, name: "Consultoria" }]),
  listSupplierDocumentRequirements: vi.fn(async () => []),
  listSupplierRequirementTemplates: vi.fn(async () => []),
  createSupplier: (...args: unknown[]) => createSupplierMock(...args),
  createSupplierCategory: vi.fn(),
  createSupplierDocumentRequirement: vi.fn(),
  createSupplierRequirementTemplate: vi.fn(),
  createSupplierType: vi.fn(),
  getSupplierDetail: vi.fn(async () => supplierDetail),
  updateSupplier: vi.fn(async () => supplierDetail),
  createSupplierDocumentReview: vi.fn(async () => ({})),
  createSupplierDocumentSubmission: vi.fn(async () => ({})),
  createSupplierFailure: vi.fn(async () => ({})),
  createSupplierOffering: vi.fn(async () => ({})),
  createSupplierPerformanceReview: vi.fn(async () => ({})),
  createSupplierQualificationReview: vi.fn(async () => ({})),
  createSupplierReceiptCheck: (...args: unknown[]) =>
    createSupplierReceiptCheckMock(...args),
  createSupplierRequirementCommunication: vi.fn(async () => ({})),
}));

describe("suppliers pages", () => {
  beforeEach(() => {
    authState.role = "org_admin";
    navigateMock.mockReset();
    toastMock.mockReset();
    createSupplierMock.mockReset();
    createSupplierReceiptCheckMock.mockReset();
    latestHeaderActions = null;
    createSupplierMock.mockResolvedValue({ id: 99 });
    createSupplierReceiptCheckMock.mockResolvedValue({ id: 1 });
  });

  it("shows the empty state and validates the create supplier dialog", async () => {
    renderWithQueryClient(<SuppliersPage />);

    expect(
      await screen.findByText("Nenhum fornecedor encontrado"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Criar Fornecedor/i }));

    expect(screen.getByText("Novo fornecedor")).toBeInTheDocument();
    expect(screen.getByText("Identificação")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByText("Unidades vinculadas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar fornecedor" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Razão social é obrigatória",
      }),
    );
    expect(createSupplierMock).not.toHaveBeenCalled();
  });

  it("hides general management actions for operators but keeps receipt registration available", async () => {
    authState.role = "operator";

    renderWithQueryClient(<SupplierDetailPage />);

    await screen.findByRole("heading", { name: "Fornecedor Exemplo" });

    const header = render(<>{latestHeaderActions}</>);

    expect(
      header.queryByRole("button", { name: /Alterar cadastro/i }),
    ).not.toBeInTheDocument();

    const receiptsTab = activateTab("Recebimentos");
    await waitFor(() => {
      expect(receiptsTab).toHaveAttribute("aria-selected", "true");
      header.rerender(<>{latestHeaderActions}</>);
      expect(
        header.getByRole("button", { name: "Registrar recebimento" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      header.getByRole("button", { name: "Registrar recebimento" }),
    );

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Preencha os campos obrigatórios",
      }),
    );
    expect(createSupplierReceiptCheckMock).not.toHaveBeenCalled();
  });

  it("updates header actions when the active tab changes", async () => {
    renderWithQueryClient(<SupplierDetailPage />);

    await screen.findByRole("heading", { name: "Fornecedor Exemplo" });

    const header = render(<>{latestHeaderActions}</>);

    expect(
      header.getByRole("button", { name: /Alterar cadastro/i }),
    ).toBeInTheDocument();
    expect(
      header.queryByRole("button", { name: "Registrar recebimento" }),
    ).not.toBeInTheDocument();

    const receiptsTab = activateTab("Recebimentos");
    await waitFor(() => {
      expect(receiptsTab).toHaveAttribute("aria-selected", "true");
      header.rerender(<>{latestHeaderActions}</>);
      expect(
        header.queryByRole("button", { name: /Alterar cadastro/i }),
      ).not.toBeInTheDocument();
      expect(
        header.getByRole("button", { name: "Registrar recebimento" }),
      ).toBeInTheDocument();
    });
  });

  it("keeps the detail page read-only for analysts", async () => {
    authState.role = "analyst";

    renderWithQueryClient(<SupplierDetailPage />);

    await screen.findByRole("heading", { name: "Fornecedor Exemplo" });

    const header = render(<>{latestHeaderActions}</>);

    expect(
      header.queryByRole("button", { name: /Alterar cadastro/i }),
    ).not.toBeInTheDocument();
    const receiptsTab = activateTab("Recebimentos");
    await waitFor(() => {
      expect(receiptsTab).toHaveAttribute("aria-selected", "true");
      header.rerender(<>{latestHeaderActions}</>);
      expect(
        header.queryByRole("button", { name: "Registrar recebimento" }),
      ).not.toBeInTheDocument();
    });
  });
});
