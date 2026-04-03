import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SuppliersPage from "@/pages/app/qualidade/fornecedores";
import SupplierDetailPage from "@/pages/app/qualidade/fornecedores/[id]";
import SupplierDocumentRequirementsPage from "@/pages/app/qualidade/fornecedores/requisitos-documentais";
import { renderWithQueryClient } from "../support/render";

const navigateMock = vi.fn();
const toastMock = vi.fn();
const createSupplierMock = vi.fn();
const createSupplierReceiptCheckMock = vi.fn();
const createSupplierDocumentRequirementMock = vi.fn();
const updateSupplierDocumentRequirementMock = vi.fn();
const uploadFilesToStorageMock = vi.fn();
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
  performanceReviews: [],
  receiptChecks: [],
  failures: [],
};

const supplierRequirements = [
  {
    id: 1,
    organizationId: 101,
    categoryId: 9,
    typeId: 3,
    name: "Certidão negativa",
    description: "Documento obrigatório para homologação inicial.",
    weight: 3,
    status: "active",
    attachments: [],
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:00.000Z",
  },
  {
    id: 2,
    organizationId: 101,
    categoryId: 9,
    typeId: 3,
    name: "Comprovante de capacidade técnica",
    description: "Usado em fornecedores críticos.",
    weight: 5,
    status: "inactive",
    attachments: [
      {
        fileName: "modelo.pdf",
        fileSize: 1024,
        contentType: "application/pdf",
        objectPath: "/private/req/modelo.pdf",
      },
    ],
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:00.000Z",
  },
];

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
  MAX_PROFILE_ITEM_ATTACHMENTS: 10,
  PROFILE_ITEM_ATTACHMENT_ACCEPT: ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv",
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT: ".pdf,image/*",
  formatFileSize: (value: number) => `${value} bytes`,
  uploadFilesToStorage: (...args: unknown[]) => uploadFilesToStorageMock(...args),
  validateProfileItemUploadSelection: vi.fn(() => null),
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
    types: (orgId: number) => ["suppliers", "types", orgId],
  },
  listSuppliers: vi.fn(async () => []),
  listSupplierCategories: vi.fn(async () => [{ id: 9, name: "Serviços" }]),
  listSupplierTypes: vi.fn(async () => [{ id: 3, name: "Consultoria" }]),
  listSupplierDocumentRequirements: vi.fn(async () => supplierRequirements),
  createSupplier: (...args: unknown[]) => createSupplierMock(...args),
  createSupplierCategory: vi.fn(),
  createSupplierDocumentRequirement: (...args: unknown[]) => createSupplierDocumentRequirementMock(...args),
  createSupplierType: vi.fn(),
  getSupplierDetail: vi.fn(async () => supplierDetail),
  updateSupplier: vi.fn(async () => supplierDetail),
  updateSupplierDocumentRequirement: (...args: unknown[]) => updateSupplierDocumentRequirementMock(...args),
  createSupplierDocumentReview: vi.fn(async () => ({})),
  createSupplierDocumentSubmission: vi.fn(async () => ({})),
  createSupplierFailure: vi.fn(async () => ({})),
  createSupplierOffering: vi.fn(async () => ({})),
  createSupplierPerformanceReview: vi.fn(async () => ({})),
  createSupplierQualificationReview: vi.fn(async () => ({})),
  createSupplierReceiptCheck: (...args: unknown[]) =>
    createSupplierReceiptCheckMock(...args),
  exportSupplierDocumentRequirements: vi.fn(async () => ({ rows: [] })),
  previewSupplierDocumentRequirementsImport: vi.fn(async () => ({
    previewToken: "preview-token",
    rows: [],
    summary: { totalRows: 0, createCount: 0, updateCount: 0, errorCount: 0 },
  })),
  commitSupplierDocumentRequirementsImport: vi.fn(async () => ({
    imported: 0,
    created: 0,
    updated: 0,
  })),
}));

vi.mock("@/lib/supplier-document-requirements-workbook", () => ({
  downloadSupplierDocumentRequirementsWorkbook: vi.fn(),
  parseSupplierDocumentRequirementsWorkbook: vi.fn(),
}));

describe("suppliers pages", () => {
  beforeEach(() => {
    authState.role = "org_admin";
    navigateMock.mockReset();
    toastMock.mockReset();
    createSupplierMock.mockReset();
    createSupplierReceiptCheckMock.mockReset();
    createSupplierDocumentRequirementMock.mockReset();
    updateSupplierDocumentRequirementMock.mockReset();
    uploadFilesToStorageMock.mockReset();
    latestHeaderActions = null;
    createSupplierMock.mockResolvedValue({ id: 99 });
    createSupplierReceiptCheckMock.mockResolvedValue({ id: 1 });
    createSupplierDocumentRequirementMock.mockImplementation(async (_orgId: number, payload: any) => ({
      id: 99,
      organizationId: 101,
      categoryId: payload.categoryId,
      typeId: payload.typeId,
      name: payload.name,
      description: payload.description,
      weight: payload.weight,
      status: payload.status,
      attachments: payload.attachments || [],
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z",
    }));
    updateSupplierDocumentRequirementMock.mockImplementation(
      async (_orgId: number, requirementId: number, payload: any) => ({
      id: requirementId,
      organizationId: 101,
      categoryId: payload.categoryId,
      typeId: payload.typeId,
      name: payload.name,
      description: payload.description,
      weight: payload.weight,
      status: payload.status,
      attachments: payload.attachments || [],
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z",
      }),
    );
    uploadFilesToStorageMock.mockResolvedValue([
      {
        fileName: "requisito.pdf",
        fileSize: 2048,
        contentType: "application/pdf",
        objectPath: "/private/requirements/requisito.pdf",
      },
    ]);
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

  it("renders requirements in table mode and opens the import/export modal from the header", async () => {
    renderWithQueryClient(<SupplierDocumentRequirementsPage />);

    expect(await screen.findByText("Certidão negativa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Template de requisito/i })).not.toBeInTheDocument();

    const header = render(<>{latestHeaderActions}</>);
    fireEvent.click(header.getByRole("button", { name: /Importar \/ Exportar/i }));

    expect(await screen.findByRole("heading", { name: "Importar / Exportar requisitos documentais" })).toBeInTheDocument();
    expect(screen.getByText("Baixar modelo")).toBeInTheDocument();
    expect(screen.getByText("Exportar catálogo")).toBeInTheDocument();
    expect(screen.getByText("Importar planilha")).toBeInTheDocument();
  });

  it("creates a new requirement with attachment upload", async () => {
    renderWithQueryClient(<SupplierDocumentRequirementsPage />);
    await screen.findByText("Certidão negativa");

    const header = render(<>{latestHeaderActions}</>);
    fireEvent.click(header.getByRole("button", { name: /Novo requisito/i }));

    expect(await screen.findByRole("heading", { name: "Novo requisito documental" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ficha cadastral assinada" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "4" } });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["conteudo"], "requisito.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadFilesToStorageMock).toHaveBeenCalled();
    });

    expect(await screen.findByText("requisito.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar requisito" }));

    await waitFor(() => {
      expect(createSupplierDocumentRequirementMock).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          name: "Ficha cadastral assinada",
          categoryId: 9,
          typeId: 3,
          weight: 4,
          attachments: [
            expect.objectContaining({
              fileName: "requisito.pdf",
              objectPath: "/private/requirements/requisito.pdf",
            }),
          ],
        }),
      );
    });
  });

  it("opens an existing requirement in read-only mode for analysts", async () => {
    authState.role = "analyst";

    renderWithQueryClient(<SupplierDocumentRequirementsPage />);
    fireEvent.click(await screen.findByText("Comprovante de capacidade técnica"));

    expect(await screen.findByRole("heading", { name: "Visualizar requisito documental" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Comprovante de capacidade técnica")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvar requisito" })).not.toBeInTheDocument();
  });
});
