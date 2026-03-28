import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions, usePageTitle, usePageSubtitle } from "@/contexts/LayoutContext";
import {
  useListUnits,
  getListUnitsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { DialogStepTabs } from "@/components/ui/dialog-step-tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  commitSuppliersImport,
  createSupplier,
  createSupplierRequirementTemplate,
  exportSuppliers,
  listSupplierCategories,
  listSupplierTypes,
  listSuppliers,
  previewSuppliersImport,
  suppliersKeys,
  type SupplierImportInputRow,
  type SupplierImportPreview,
  type SupplierListItem,
} from "@/lib/suppliers-client";
import {
  formatSupplierLegalIdentifier,
  formatSupplierPostalCode,
  supplierLegalIdentifierPlaceholder,
} from "@/lib/supplier-formatters";
import { resolveAppAssetPath } from "@/lib/base-path";
import { downloadSuppliersWorkbook, parseSuppliersWorkbook } from "@/lib/suppliers-workbook";
import {
  Download,
  Plus,
  ShieldCheck,
  Package2,
  Search,
  ChevronRight,
  FileStack,
  Tags,
  Settings2,
  Upload,
} from "lucide-react";

type SupplierFormState = {
  personType: "pj" | "pf";
  legalIdentifier: string;
  legalName: string;
  tradeName: string;
  responsibleName: string;
  categoryId: string;
  unitIds: number[];
  typeIds: number[];
  status: string;
  criticality: string;
  email: string;
  phone: string;
  postalCode: string;
  city: string;
  state: string;
  notes: string;
};

const emptySupplierForm: SupplierFormState = {
  personType: "pj",
  legalIdentifier: "",
  legalName: "",
  tradeName: "",
  responsibleName: "",
  categoryId: "",
  unitIds: [],
  typeIds: [],
  status: "draft",
  criticality: "medium",
  email: "",
  phone: "",
  postalCode: "",
  city: "",
  state: "",
  notes: "",
};

const CREATE_STEPS = ["Identificação", "Classificação", "Contato"];

function formatCompliance(item: SupplierListItem) {
  if (item.documentCompliancePercentage === null || item.documentCompliancePercentage === undefined) {
    return "—";
  }
  return `${item.documentCompliancePercentage}%`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    pending_qualification: "Pendente",
    approved: "Aprovado",
    restricted: "Restrito",
    blocked: "Bloqueado",
    expired: "Vencido",
    inactive: "Inativo",
  };
  return labels[status] || status;
}

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending_qualification: "bg-amber-50 text-amber-700 border-amber-200",
  restricted: "bg-amber-50 text-amber-700 border-amber-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function SuppliersPage() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierImportDialogOpen, setSupplierImportDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [maxReachedCreateStep, setMaxReachedCreateStep] = useState(0);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [supplierImportFileName, setSupplierImportFileName] = useState("");
  const [supplierImportRows, setSupplierImportRows] = useState<SupplierImportInputRow[]>([]);
  const [supplierImportPreview, setSupplierImportPreview] = useState<SupplierImportPreview | null>(null);

  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm);
  const [templateForm, setTemplateForm] = useState({
    title: "",
    content: "",
    status: "draft",
    changeSummary: "",
    categoryId: "",
    typeId: "",
  });

  const canManageSuppliers = role === "org_admin" || role === "platform_admin";

  usePageTitle("Fornecedores");
  usePageSubtitle("Cadastro, documentos, homologação, recebimentos, histórico e desempenho.");

  const supplierFilters = useMemo(
    () => ({
      search: search || undefined,
      status: statusFilter || undefined,
      categoryId: categoryFilter || undefined,
      typeId: typeFilter || undefined,
      unitId: unitFilter || undefined,
    }),
    [search, statusFilter, categoryFilter, typeFilter, unitFilter],
  );

  const suppliersQuery = useQuery({
    queryKey: suppliersKeys.list(orgId || 0, supplierFilters),
    enabled: !!orgId,
    queryFn: () => listSuppliers(orgId!, supplierFilters),
  });
  const categoriesQuery = useQuery({
    queryKey: suppliersKeys.categories(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierCategories(orgId!),
  });
  const typesQuery = useQuery({
    queryKey: suppliersKeys.types(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierTypes(orgId!),
  });
  const unitsQuery = useListUnits(orgId!, {
    query: {
      queryKey: getListUnitsQueryKey(orgId!),
      enabled: !!orgId,
    },
  });

  const resetCreateForm = () => {
    setSupplierForm(emptySupplierForm);
    setCreateStep(0);
    setMaxReachedCreateStep(0);
  };

  const resetSupplierImport = () => {
    setSupplierImportFileName("");
    setSupplierImportRows([]);
    setSupplierImportPreview(null);
  };

  const changeCreateStep = (targetStep: number) => {
    const bounded = Math.max(0, Math.min(targetStep, CREATE_STEPS.length - 1));
    setCreateStep(bounded);
    setMaxReachedCreateStep((current) => Math.max(current, bounded));
  };

  const createSupplierMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => createSupplier(orgId!, body),
    onSuccess: (supplier) => {
      setSupplierDialogOpen(false);
      resetCreateForm();
      queryClient.invalidateQueries({ queryKey: suppliersKeys.list(orgId!, {}) });
      queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
      navigate(`/app/qualidade/fornecedores/${supplier.id}`);
    },
    onError: (error) => {
      toast({
        title: "Falha ao criar fornecedor",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const exportSuppliersMutation = useMutation({
    mutationFn: () => exportSuppliers(orgId!),
    onSuccess: ({ rows }) => {
      downloadSuppliersWorkbook(rows, "cadastro-fornecedores.xlsx");
    },
    onError: (error) => {
      toast({
        title: "Falha ao exportar fornecedores",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const previewSupplierImportMutation = useMutation({
    mutationFn: (rows: SupplierImportInputRow[]) => previewSuppliersImport(orgId!, rows),
    onSuccess: (preview) => {
      setSupplierImportPreview(preview);
    },
    onError: (error) => {
      setSupplierImportRows([]);
      setSupplierImportPreview(null);
      toast({
        title: "Falha ao analisar planilha",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const commitSupplierImportMutation = useMutation({
    mutationFn: () => {
      if (!supplierImportPreview?.previewToken) {
        throw new Error("Gere a prévia da importação antes de confirmar.");
      }
      return commitSuppliersImport(orgId!, supplierImportPreview.previewToken);
    },
    onSuccess: (result) => {
      resetSupplierImport();
      setSupplierImportDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
      toast({
        title: "Fornecedores importados",
        description: `${result.created} criados e ${result.updated} atualizados.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao importar fornecedores",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: () =>
      createSupplierRequirementTemplate(orgId!, {
        title: templateForm.title,
        content: templateForm.content,
        status: templateForm.status,
        changeSummary: templateForm.changeSummary,
        categoryId: templateForm.categoryId ? Number(templateForm.categoryId) : null,
        typeId: templateForm.typeId ? Number(templateForm.typeId) : null,
      }),
    onSuccess: () => {
      setTemplateDialogOpen(false);
      setTemplateForm({ title: "", content: "", status: "draft", changeSummary: "", categoryId: "", typeId: "" });
      queryClient.invalidateQueries({ queryKey: suppliersKeys.templates(orgId!) });
    },
  });

  const categories = categoriesQuery.data || [];
  const types = typesQuery.data || [];
  const suppliers = suppliersQuery.data || [];
  const units = unitsQuery.data || [];

  const typeOptions = useMemo(
    () =>
      types
        .filter((type) => type.status !== "inactive")
        .map((type) => ({
          value: type.id,
          label: type.name,
          keywords: [type.description || "", type.status],
        })),
    [types],
  );
  const unitOptions = useMemo(
    () =>
      units.map((unit) => ({
        value: unit.id,
        label: unit.name,
      })),
    [units],
  );

  const summary = useMemo(() => {
    const approved = suppliers.filter((supplier) => supplier.status === "approved").length;
    const restricted = suppliers.filter((supplier) => supplier.status === "restricted").length;
    const blocked = suppliers.filter((supplier) => supplier.status === "blocked").length;
    const withDocumentReview = suppliers.filter((supplier) => supplier.documentReviewStatus === "apt").length;
    return { approved, restricted, blocked, withDocumentReview };
  }, [suppliers]);

  const handleSupplierImportFile = async (file: File | null) => {
    if (!file) return;

    setSupplierImportFileName("");
    setSupplierImportRows([]);
    setSupplierImportPreview(null);
    previewSupplierImportMutation.reset();

    try {
      const parsedRows = await parseSuppliersWorkbook(file);
      if (parsedRows.length === 0) {
        throw new Error("A planilha não possui linhas de dados para importar.");
      }

      setSupplierImportFileName(file.name);
      setSupplierImportRows(parsedRows);
      previewSupplierImportMutation.mutate(parsedRows);
    } catch (error) {
      setSupplierImportFileName("");
      setSupplierImportRows([]);
      setSupplierImportPreview(null);
      previewSupplierImportMutation.reset();
      toast({
        title: "Falha ao ler planilha",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const supplierImportSourceByRowNumber = useMemo(
    () => new Map(supplierImportRows.map((row) => [row.rowNumber ?? 0, row])),
    [supplierImportRows],
  );

  const headerActions = canManageSuppliers ? (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const anchor = document.createElement("a");
          anchor.href = resolveAppAssetPath("/templates/template_importacao_fornecedores.xlsx");
          anchor.download = "template_importacao_fornecedores.xlsx";
          anchor.click();
        }}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Baixar modelo
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => exportSuppliersMutation.mutate()}
        disabled={exportSuppliersMutation.isPending}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        {exportSuppliersMutation.isPending ? "Exportando..." : "Exportar fornecedores"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          resetSupplierImport();
          setSupplierImportDialogOpen(true);
        }}
      >
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Importar planilha
      </Button>
      <Button variant="outline" size="sm" onClick={() => navigate("/app/qualidade/fornecedores/requisitos-documentais")}>
        <FileStack className="mr-1.5 h-3.5 w-3.5" />
        Requisitos documentais
      </Button>
      <Button variant="outline" size="sm" onClick={() => setTemplateDialogOpen(true)}>
        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
        Template de requisito
      </Button>
      <Button variant="outline" size="sm" onClick={() => navigate("/app/qualidade/fornecedores/tipos")}>
        <Tags className="mr-1.5 h-3.5 w-3.5" />
        Tipos
      </Button>
      <Button variant="outline" size="sm" onClick={() => navigate("/app/qualidade/fornecedores/catalogo-itens")}>
        <Package2 className="mr-1.5 h-3.5 w-3.5" />
        Catálogo P/S
      </Button>
      <Button variant="outline" size="sm" onClick={() => navigate("/app/qualidade/fornecedores/categorias")}>
        <Settings2 className="mr-1.5 h-3.5 w-3.5" />
        Categorias
      </Button>
      <Button
        size="sm"
        onClick={() => {
          resetCreateForm();
          setSupplierDialogOpen(true);
        }}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Novo fornecedor
      </Button>
    </div>
  ) : null;

  useHeaderActions(headerActions);

  const handleSubmitSupplier = () => {
    if (!supplierForm.legalName.trim()) {
      toast({
        title: "Razão social é obrigatória",
        description: "Informe a razão social ou nome completo do fornecedor.",
        variant: "destructive",
      });
      return;
    }

    createSupplierMutation.mutate({
      personType: supplierForm.personType,
      legalIdentifier: supplierForm.legalIdentifier,
      legalName: supplierForm.legalName,
      tradeName: supplierForm.tradeName || null,
      responsibleName: supplierForm.responsibleName || null,
      categoryId: supplierForm.categoryId ? Number(supplierForm.categoryId) : null,
      unitIds: supplierForm.unitIds,
      typeIds: supplierForm.typeIds,
      status: supplierForm.status,
      criticality: supplierForm.criticality,
      email: supplierForm.email || null,
      phone: supplierForm.phone || null,
      postalCode: supplierForm.postalCode || null,
      city: supplierForm.city || null,
      state: supplierForm.state || null,
      notes: supplierForm.notes || null,
    });
  };

  return (
    <>
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Aprovados</p>
            <p className="text-xl font-semibold text-emerald-600 mt-0.5">{summary.approved}</p>
          </div>
          <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Restritos</p>
            <p className="text-xl font-semibold text-amber-600 mt-0.5">{summary.restricted}</p>
          </div>
          <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Bloqueados</p>
            <p className="text-xl font-semibold text-red-600 mt-0.5">{summary.blocked}</p>
          </div>
          <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">AVA1 apto</p>
            <p className="text-xl font-semibold text-foreground mt-0.5">{summary.withDocumentReview}</p>
          </div>
        </div>

        {/* Inline filters */}
        <div className="flex flex-wrap gap-6 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label>Buscar</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, identificador ou razão social…"
              className="mt-2"
            />
          </div>
          <div className="w-40">
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2"
            >
              <option value="">Todos</option>
              <option value="draft">Rascunho</option>
              <option value="pending_qualification">Pendente</option>
              <option value="approved">Aprovado</option>
              <option value="restricted">Restrito</option>
              <option value="blocked">Bloqueado</option>
              <option value="expired">Vencido</option>
              <option value="inactive">Inativo</option>
            </Select>
          </div>
          <div className="w-40">
            <Label>Categoria</Label>
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="mt-2"
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Label>Tipo</Label>
            <Select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="mt-2"
            >
              <option value="">Todos</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Label>Unidade</Label>
            <Select
              value={unitFilter}
              onChange={(event) => setUnitFilter(event.target.value)}
              className="mt-2"
            >
              <option value="">Todas</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Table */}
        {suppliersQuery.isLoading ? (
          <div className="text-center py-16 text-[13px] text-muted-foreground">Carregando fornecedores…</div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-16">
            <Package2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground">Nenhum fornecedor encontrado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Ajuste os filtros ou crie o primeiro fornecedor desta organização.
            </p>
            {canManageSuppliers && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => {
                  resetCreateForm();
                  setSupplierDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Criar Fornecedor
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Fornecedor</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Categoria / Tipo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Unidades</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">AVA1</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Última Revisão</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="border-b border-border/40 last:border-0 transition-colors hover:bg-secondary/30 cursor-pointer"
                    onClick={() => navigate(`/app/qualidade/fornecedores/${supplier.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-foreground">{supplier.tradeName || supplier.legalName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{supplier.legalIdentifier}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_COLORS[supplier.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {statusLabel(supplier.status)}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">Criticidade {supplier.criticality}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-foreground">{supplier.category?.name || "Sem categoria"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {supplier.types.map((type) => type.name).join(", ") || "Sem tipo"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">
                      {supplier.units.map((unit) => unit.name).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-foreground">{formatCompliance(supplier)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{supplier.documentReviewStatus || "Sem parecer"}</p>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">
                      {supplier.latestQualification?.createdAt
                        ? new Date(supplier.latestQualification.createdAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create supplier dialog - multi-step wizard */}
      <Dialog
        open={supplierDialogOpen}
        onOpenChange={(open) => {
          setSupplierDialogOpen(open);
          if (!open) resetCreateForm();
        }}
        title="Novo fornecedor"
        description={
          [
            "Informe os dados de identificação do fornecedor.",
            "Defina categoria, status, criticidade e vínculos.",
            "Registre contato e observações adicionais.",
          ][createStep]
        }
        size="lg"
      >
        <DialogStepTabs
          steps={CREATE_STEPS}
          step={createStep}
          onStepChange={changeCreateStep}
          maxAccessibleStep={maxReachedCreateStep}
        />

        {createStep === 0 && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Tipo de pessoa</Label>
              <Select
                value={supplierForm.personType}
                onChange={(event) =>
                  setSupplierForm((current) => {
                    const nextPersonType = event.target.value as "pj" | "pf";
                    return {
                      ...current,
                      personType: nextPersonType,
                      legalIdentifier: formatSupplierLegalIdentifier(current.legalIdentifier, nextPersonType),
                    };
                  })
                }
                className="mt-1"
              >
                <option value="pj">Pessoa jurídica</option>
                <option value="pf">Pessoa física</option>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">{supplierForm.personType === "pj" ? "CNPJ" : "CPF"}</Label>
              <Input
                value={supplierForm.legalIdentifier}
                onChange={(event) =>
                  setSupplierForm((current) => ({
                    ...current,
                    legalIdentifier: formatSupplierLegalIdentifier(event.target.value, current.personType),
                  }))
                }
                className="mt-1"
                placeholder={supplierLegalIdentifierPlaceholder(supplierForm.personType)}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">{supplierForm.personType === "pj" ? "Razão social *" : "Nome completo *"}</Label>
              <Input
                value={supplierForm.legalName}
                onChange={(event) => setSupplierForm((current) => ({ ...current, legalName: event.target.value }))}
                className="mt-1"
                placeholder={supplierForm.personType === "pj" ? "Razão social da empresa" : "Nome completo"}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Nome fantasia</Label>
              <Input
                value={supplierForm.tradeName}
                onChange={(event) => setSupplierForm((current) => ({ ...current, tradeName: event.target.value }))}
                className="mt-1"
                placeholder="Nome comercial"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Responsável {supplierForm.personType === "pj" ? "*" : ""}
              </Label>
              <Input
                value={supplierForm.responsibleName}
                onChange={(event) => setSupplierForm((current) => ({ ...current, responsibleName: event.target.value }))}
                className="mt-1"
                placeholder="Responsável pelo cadastro"
              />
            </div>
          </div>
        )}

        {createStep === 1 && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Categoria</Label>
              <Select
                value={supplierForm.categoryId}
                onChange={(event) => setSupplierForm((current) => ({ ...current, categoryId: event.target.value }))}
                className="mt-1"
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Status inicial</Label>
              <Select
                value={supplierForm.status}
                onChange={(event) => setSupplierForm((current) => ({ ...current, status: event.target.value }))}
                className="mt-1"
              >
                <option value="draft">Rascunho</option>
                <option value="pending_qualification">Pendente</option>
                <option value="approved">Aprovado</option>
                <option value="restricted">Restrito</option>
                <option value="blocked">Bloqueado</option>
                <option value="inactive">Inativo</option>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Criticidade</Label>
              <Select
                value={supplierForm.criticality}
                onChange={(event) => setSupplierForm((current) => ({ ...current, criticality: event.target.value }))}
                className="mt-1"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">Unidades vinculadas</Label>
              <div className="mt-1">
                <SearchableMultiSelect
                  options={unitOptions}
                  selected={supplierForm.unitIds}
                  onToggle={(id) =>
                    setSupplierForm((current) => ({
                      ...current,
                      unitIds: current.unitIds.includes(id)
                        ? current.unitIds.filter((value) => value !== id)
                        : [...current.unitIds, id],
                    }))
                  }
                  placeholder="Selecione as unidades"
                  searchPlaceholder="Buscar unidade"
                  emptyMessage="Nenhuma unidade encontrada."
                />
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">Tipos de fornecedor</Label>
              <div className="mt-1">
                <SearchableMultiSelect
                  options={typeOptions}
                  selected={supplierForm.typeIds}
                  onToggle={(id) =>
                    setSupplierForm((current) => ({
                      ...current,
                      typeIds: current.typeIds.includes(id)
                        ? current.typeIds.filter((value) => value !== id)
                        : [...current.typeIds, id],
                    }))
                  }
                  placeholder="Selecione os tipos"
                  searchPlaceholder="Buscar tipo"
                  emptyMessage="Nenhum tipo encontrado."
                />
              </div>
            </div>
          </div>
        )}

        {createStep === 2 && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">E-mail</Label>
              <Input
                type="email"
                value={supplierForm.email}
                onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))}
                className="mt-1"
                placeholder={supplierForm.personType === "pj" ? "contato@empresa.com" : "Opcional"}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Telefone</Label>
              <Input
                type="tel"
                value={supplierForm.phone}
                onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))}
                className="mt-1"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Cidade</Label>
              <Input
                value={supplierForm.city}
                onChange={(event) => setSupplierForm((current) => ({ ...current, city: event.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">UF</Label>
              <Input
                value={supplierForm.state}
                onChange={(event) =>
                  setSupplierForm((current) => ({ ...current, state: event.target.value.toUpperCase().slice(0, 2) }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">CEP</Label>
              <Input
                value={supplierForm.postalCode}
                onChange={(event) =>
                  setSupplierForm((current) => ({ ...current, postalCode: formatSupplierPostalCode(event.target.value) }))
                }
                className="mt-1"
                placeholder="00000-000"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">Observações</Label>
              <Textarea
                value={supplierForm.notes}
                onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {createStep > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => changeCreateStep(createStep - 1)}
            >
              Anterior
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => { setSupplierDialogOpen(false); resetCreateForm(); }}>
              Cancelar
            </Button>
          )}
          {createStep < CREATE_STEPS.length - 1 ? (
            <Button type="button" onClick={() => changeCreateStep(createStep + 1)}>
              Próximo
            </Button>
          ) : (
            <Button onClick={handleSubmitSupplier} isLoading={createSupplierMutation.isPending}>
              Criar fornecedor
            </Button>
          )}
        </DialogFooter>
      </Dialog>

      <Dialog
        open={supplierImportDialogOpen}
        onOpenChange={(open) => {
          setSupplierImportDialogOpen(open);
          if (!open) {
            resetSupplierImport();
          }
        }}
        title="Importar fornecedores"
        size="lg"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            Use o modelo oficial para importar ou atualizar fornecedores. A planilha é validada antes da gravação,
            com erro por linha quando unidade, categoria ou tipo não existirem no cadastro.
          </div>

          <div className="space-y-2">
            <Label htmlFor="suppliers-workbook">Arquivo .xlsx</Label>
            <Input
              id="suppliers-workbook"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => void handleSupplierImportFile(event.target.files?.[0] || null)}
              disabled={previewSupplierImportMutation.isPending || commitSupplierImportMutation.isPending}
            />
            {supplierImportFileName ? (
              <p className="text-xs text-muted-foreground">Arquivo carregado: {supplierImportFileName}</p>
            ) : null}
          </div>

          {supplierImportPreview ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Linhas lidas</p>
                    <p className="mt-1 text-xl font-semibold">{supplierImportPreview.summary.totalRows}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Criar</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-600">
                      {supplierImportPreview.summary.createCount}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Atualizar</p>
                    <p className="mt-1 text-xl font-semibold text-sky-600">
                      {supplierImportPreview.summary.updateCount}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Com erro</p>
                    <p className="mt-1 text-xl font-semibold text-red-600">
                      {supplierImportPreview.summary.errorCount}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {supplierImportPreview.rows.map((row) => {
                  const sourceRow = supplierImportSourceByRowNumber.get(row.rowNumber);
                  const personTypeLabel = row.personType === "pj" ? "PJ" : row.personType === "pf" ? "PF" : "—";

                  return (
                    <div
                      key={`${row.rowNumber}-${row.legalIdentifier}-${row.legalName}`}
                      className="rounded-xl border border-border/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">
                            Linha {row.rowNumber} · {row.legalName || "Fornecedor sem nome"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.legalIdentifier || "Documento não informado"} · {personTypeLabel}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {sourceRow?.categoryName || "Sem categoria"} ·{" "}
                            {sourceRow?.typeNames || "Sem tipo"} ·{" "}
                            {sourceRow?.unitNames || "Sem unidade"}
                          </div>
                        </div>
                        <Badge
                          variant={
                            row.action === "create"
                              ? "default"
                              : row.action === "update"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {row.action === "create"
                            ? "Criar"
                            : row.action === "update"
                              ? "Atualizar"
                              : "Corrigir"}
                        </Badge>
                      </div>
                      {row.errors.length > 0 ? (
                        <ul className="mt-3 space-y-1 text-sm text-red-600">
                          {row.errors.map((error) => (
                            <li key={error}>- {error}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setSupplierImportDialogOpen(false);
              resetSupplierImport();
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => commitSupplierImportMutation.mutate()}
            disabled={
              !supplierImportPreview ||
              supplierImportRows.length === 0 ||
              supplierImportPreview.summary.errorCount > 0 ||
              commitSupplierImportMutation.isPending
            }
          >
            {commitSupplierImportMutation.isPending ? "Importando..." : "Confirmar importação"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Template dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen} title="Novo template de requisito" size="lg">
        <div className="space-y-5">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Título</Label>
            <Input
              value={templateForm.title}
              onChange={(event) => setTemplateForm((current) => ({ ...current, title: event.target.value }))}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Categoria</Label>
              <Select
                value={templateForm.categoryId}
                onChange={(event) => setTemplateForm((current) => ({ ...current, categoryId: event.target.value }))}
                className="mt-1"
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Tipo</Label>
              <Select
                value={templateForm.typeId}
                onChange={(event) => setTemplateForm((current) => ({ ...current, typeId: event.target.value }))}
                className="mt-1"
              >
                <option value="">Sem tipo</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Conteúdo</Label>
            <Textarea
              rows={8}
              value={templateForm.content}
              onChange={(event) => setTemplateForm((current) => ({ ...current, content: event.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Resumo da mudança</Label>
            <Input
              value={templateForm.changeSummary}
              onChange={(event) => setTemplateForm((current) => ({ ...current, changeSummary: event.target.value }))}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancelar</Button>
          <Button onClick={() => createTemplateMutation.mutate()} isLoading={createTemplateMutation.isPending}>
            Salvar template
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
