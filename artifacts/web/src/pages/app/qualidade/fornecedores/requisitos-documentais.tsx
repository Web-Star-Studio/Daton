import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ProfileItemAttachmentsField } from "@/components/employees/profile-item-form-fields";
import { toast } from "@/hooks/use-toast";
import {
  commitSupplierDocumentRequirementsImport,
  createSupplierDocumentRequirement,
  exportSupplierDocumentRequirements,
  listSupplierCategories,
  listSupplierDocumentRequirements,
  listSupplierTypes,
  previewSupplierDocumentRequirementsImport,
  suppliersKeys,
  updateSupplierDocumentRequirement,
  type SupplierDocumentRequirement,
  type SupplierDocumentRequirementImportInputRow,
  type SupplierDocumentRequirementImportPreview,
} from "@/lib/suppliers-client";
import {
  downloadSupplierDocumentRequirementsWorkbook,
  parseSupplierDocumentRequirementsWorkbook,
} from "@/lib/supplier-document-requirements-workbook";
import { resolveAppAssetPath } from "@/lib/base-path";
import {
  uploadFilesToStorage,
  validateProfileItemUploadSelection,
  PROFILE_ITEM_ATTACHMENT_ACCEPT,
} from "@/lib/uploads";
import { ArrowLeft, ChevronRight, Download, Plus, Search, Upload } from "lucide-react";

const requirementAttachmentSchema = z.object({
  fileName: z.string().trim().min(1),
  fileSize: z.number().int().nonnegative(),
  contentType: z.string().trim().min(1),
  objectPath: z.string().trim().min(1),
});

const requirementFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do requisito documental."),
  description: z.string(),
  weight: z.coerce.number().int().min(1, "O peso deve ser entre 1 e 5.").max(5, "O peso deve ser entre 1 e 5."),
  categoryId: z.string().trim().min(1, "Selecione uma categoria."),
  typeId: z.string().trim().min(1, "Selecione um tipo de fornecedor."),
  status: z.enum(["active", "inactive"]),
  attachments: z.array(requirementAttachmentSchema).default([]),
});

type RequirementFormValues = z.infer<typeof requirementFormSchema>;

const emptyForm: RequirementFormValues = {
  name: "",
  description: "",
  weight: 1,
  categoryId: "",
  typeId: "",
  status: "active",
  attachments: [],
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-50 text-gray-500 border-gray-200",
};

function requirementStatusLabel(status: string) {
  return status === "inactive" ? "Inativo" : "Ativo";
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs text-destructive">{message}</p> : null;
}

function toFormValues(requirement?: SupplierDocumentRequirement | null): RequirementFormValues {
  if (!requirement) {
    return emptyForm;
  }

  return {
    name: requirement.name,
    description: requirement.description || "",
    weight: requirement.weight,
    categoryId: requirement.categoryId ? String(requirement.categoryId) : "",
    typeId: requirement.typeId ? String(requirement.typeId) : "",
    status: requirement.status as "active" | "inactive",
    attachments: requirement.attachments || [],
  };
}

export default function SupplierDocumentRequirementsPage() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const canManageSuppliers = role === "org_admin" || role === "platform_admin";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [importExportDialogOpen, setImportExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [requirementDialogOpen, setRequirementDialogOpen] = useState(false);
  const [editingRequirementId, setEditingRequirementId] = useState<number | null>(null);
  const [isAttachmentUploading, setIsAttachmentUploading] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<SupplierDocumentRequirementImportInputRow[]>([]);
  const [importPreview, setImportPreview] = useState<SupplierDocumentRequirementImportPreview | null>(null);

  const form = useForm<RequirementFormValues>({
    resolver: zodResolver(requirementFormSchema),
    defaultValues: emptyForm,
  });

  usePageTitle("Requisitos documentais");
  usePageSubtitle("Centralize o catálogo de documentos obrigatórios usados na análise dos fornecedores.");

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
  const requirementsQuery = useQuery({
    queryKey: suppliersKeys.requirements(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierDocumentRequirements(orgId!),
  });

  const categories = categoriesQuery.data || [];
  const types = typesQuery.data || [];
  const requirements = requirementsQuery.data || [];
  const watchedAttachments = form.watch("attachments");

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const typesById = useMemo(
    () => new Map(types.map((type) => [type.id, type.name])),
    [types],
  );

  const stats = useMemo(() => {
    const active = requirements.filter((requirement) => requirement.status === "active").length;
    const inactive = requirements.filter((requirement) => requirement.status === "inactive").length;
    const withAttachments = requirements.filter((requirement) => requirement.attachments.length > 0).length;

    return {
      total: requirements.length,
      active,
      inactive,
      withAttachments,
    };
  }, [requirements]);

  const filteredRequirements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return requirements.filter((requirement) => {
      const categoryName = categoriesById.get(requirement.categoryId || 0) || "";
      const typeName = typesById.get(requirement.typeId || 0) || "";

      if (statusFilter && requirement.status !== statusFilter) {
        return false;
      }
      if (categoryFilter && String(requirement.categoryId || "") !== categoryFilter) {
        return false;
      }
      if (typeFilter && String(requirement.typeId || "") !== typeFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }

      return [
        requirement.name,
        requirement.description || "",
        categoryName,
        typeName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [categoryFilter, categoriesById, requirements, search, statusFilter, typeFilter, typesById]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
  };

  const resetImportState = () => {
    setImportFileName("");
    setImportRows([]);
    setImportPreview(null);
  };

  const openCreateDialog = () => {
    setEditingRequirementId(null);
    form.reset(emptyForm);
    setRequirementDialogOpen(true);
  };

  const openRequirementDialog = (requirement: SupplierDocumentRequirement) => {
    setEditingRequirementId(requirement.id);
    form.reset(toFormValues(requirement));
    setRequirementDialogOpen(true);
  };

  const exportMutation = useMutation({
    mutationFn: () => exportSupplierDocumentRequirements(orgId!),
    onSuccess: ({ rows }) => {
      downloadSupplierDocumentRequirementsWorkbook(rows, "catalogo-requisitos-documentais.xlsx");
    },
    onError: (error) => {
      toast({
        title: "Falha ao exportar catálogo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const previewImportMutation = useMutation({
    mutationFn: (rows: SupplierDocumentRequirementImportInputRow[]) =>
      previewSupplierDocumentRequirementsImport(orgId!, rows),
    onSuccess: (preview) => {
      setImportPreview(preview);
    },
    onError: (error) => {
      toast({
        title: "Falha ao analisar planilha",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const commitImportMutation = useMutation({
    mutationFn: () => {
      if (!importPreview?.previewToken) {
        throw new Error("Gere a prévia da importação antes de confirmar.");
      }

      return commitSupplierDocumentRequirementsImport(orgId!, importPreview.previewToken);
    },
    onSuccess: (result) => {
      refresh();
      setImportDialogOpen(false);
      resetImportState();
      toast({
        title: "Catálogo importado",
        description: `${result.created} criados e ${result.updated} atualizados.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao importar catálogo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: RequirementFormValues) => {
      const payload = {
        name: values.name.trim(),
        description: values.description.trim() || null,
        weight: values.weight,
        status: values.status,
        categoryId: Number(values.categoryId),
        typeId: Number(values.typeId),
        attachments: values.attachments,
      };

      if (editingRequirementId) {
        return {
          action: "update" as const,
          requirement: await updateSupplierDocumentRequirement(orgId!, editingRequirementId, payload),
        };
      }

      return {
        action: "create" as const,
        requirement: await createSupplierDocumentRequirement(orgId!, payload),
      };
    },
    onSuccess: ({ action, requirement }) => {
      refresh();
      setEditingRequirementId(requirement.id);
      form.reset(toFormValues(requirement));
      setRequirementDialogOpen(false);
      toast({
        title: action === "create" ? "Requisito criado" : "Requisito atualizado",
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao salvar requisito documental",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleImportFile = async (file: File | null) => {
    if (!file) return;

    resetImportState();
    previewImportMutation.reset();

    try {
      const parsedRows = await parseSupplierDocumentRequirementsWorkbook(file);
      if (parsedRows.length === 0) {
        throw new Error("A planilha não possui linhas de dados para importar.");
      }

      setImportFileName(file.name);
      setImportRows(parsedRows);
      previewImportMutation.mutate(parsedRows);
    } catch (error) {
      resetImportState();
      previewImportMutation.reset();
      toast({
        title: "Falha ao ler planilha",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleAttachmentUpload = async (files: FileList | null) => {
    if (!files?.length) return;

    const selectedFiles = Array.from(files);
    const validationError = validateProfileItemUploadSelection(selectedFiles, watchedAttachments.length);
    if (validationError) {
      toast({
        title: "Limite de anexos excedido",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setIsAttachmentUploading(true);
    try {
      const uploadedFiles = await uploadFilesToStorage(selectedFiles);
      form.setValue("attachments", [...watchedAttachments, ...uploadedFiles], { shouldDirty: true });
    } catch (error) {
      toast({
        title: "Falha ao enviar anexos",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsAttachmentUploading(false);
    }
  };

  const removeAttachment = (index: number) => {
    form.setValue(
      "attachments",
      watchedAttachments.filter((_, currentIndex) => currentIndex !== index),
      { shouldDirty: true },
    );
  };

  const isEditing = editingRequirementId !== null;
  const requirementDialogTitle = canManageSuppliers
    ? isEditing
      ? "Editar requisito documental"
      : "Novo requisito documental"
    : "Visualizar requisito documental";

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => navigate("/app/qualidade/fornecedores")}>
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Voltar
      </Button>
      {canManageSuppliers ? (
        <Button variant="outline" size="sm" onClick={() => setImportExportDialogOpen(true)}>
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Importar / Exportar
        </Button>
      ) : null}
      {canManageSuppliers ? (
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Novo requisito
        </Button>
      ) : null}
    </div>
  );

  useHeaderActions(headerActions);

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Total</p>
              <p className="mt-0.5 text-xl font-semibold text-foreground">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Ativos</p>
              <p className="mt-0.5 text-xl font-semibold text-emerald-600">{stats.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Inativos</p>
              <p className="mt-0.5 text-xl font-semibold text-gray-500">{stats.inactive}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Com anexos</p>
              <p className="mt-0.5 text-xl font-semibold text-sky-600">{stats.withAttachments}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Buscar por nome ou descrição..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-9 text-[13px]"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-9 w-full text-[13px] lg:w-40"
          >
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </Select>
          <Select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-9 w-full text-[13px] lg:w-52"
          >
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-9 w-full text-[13px] lg:w-52"
          >
            <option value="">Todos os tipos</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </div>

        {requirementsQuery.isLoading ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">Carregando requisitos documentais...</div>
        ) : filteredRequirements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-16 text-center">
            <p className="text-[13px] text-muted-foreground">
              {requirements.length === 0
                ? "Nenhum requisito documental cadastrado."
                : "Nenhum requisito documental encontrado para os filtros informados."}
            </p>
            {canManageSuppliers && requirements.length === 0 ? (
              <Button className="mt-4" size="sm" onClick={openCreateDialog}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Adicionar requisito
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/60">
                  <TableHead className="px-4 py-2.5 text-xs font-semibold">Nome</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold">Categoria</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold">Tipo</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold">Peso</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold">Status</TableHead>
                  <TableHead className="px-4 py-2.5 text-xs font-semibold">Anexos</TableHead>
                  <TableHead className="w-8 px-4 py-2.5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequirements.map((requirement) => (
                  <TableRow
                    key={requirement.id}
                    className="cursor-pointer border-b border-border/40 hover:bg-secondary/20"
                    onClick={() => openRequirementDialog(requirement)}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="space-y-0.5">
                        <p className="text-[13px] font-medium text-foreground">{requirement.name}</p>
                        <p className="max-w-[340px] truncate text-xs text-muted-foreground">
                          {requirement.description?.trim() || "Sem descrição informada."}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-[13px] text-muted-foreground">
                      {categoriesById.get(requirement.categoryId || 0) || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-[13px] text-muted-foreground">
                      {typesById.get(requirement.typeId || 0) || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-[13px] text-muted-foreground">
                      {requirement.weight}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          STATUS_COLORS[requirement.status] || "bg-gray-50 text-gray-500 border-gray-200"
                        }`}
                      >
                        {requirementStatusLabel(requirement.status)}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-[13px] text-muted-foreground">
                      {requirement.attachments.length}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog
        open={importExportDialogOpen}
        onOpenChange={setImportExportDialogOpen}
        title="Importar / Exportar requisitos documentais"
      >
        <div className="space-y-3">
          <button
            type="button"
            className="w-full rounded-xl border border-border/60 bg-card/42 px-4 py-3.5 text-left backdrop-blur-md transition hover:border-primary/30"
            onClick={() => {
              const anchor = document.createElement("a");
              anchor.href = resolveAppAssetPath("/templates/template_importacao_documentos.xlsx");
              anchor.download = "template_importacao_documentos.xlsx";
              anchor.click();
              setImportExportDialogOpen(false);
            }}
          >
            <div className="flex items-center gap-3">
              <Download className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-[13px] font-medium text-foreground">Baixar modelo</p>
                <p className="text-xs text-muted-foreground">
                  Planilha XLSX com o formato esperado para importação em massa.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="w-full rounded-xl border border-border/60 bg-card/42 px-4 py-3.5 text-left backdrop-blur-md transition hover:border-primary/30"
            disabled={exportMutation.isPending}
            onClick={() => {
              exportMutation.mutate();
              setImportExportDialogOpen(false);
            }}
          >
            <div className="flex items-center gap-3">
              <Download className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-[13px] font-medium text-foreground">Exportar catálogo</p>
                <p className="text-xs text-muted-foreground">
                  Exportar todos os requisitos documentais cadastrados como planilha XLSX.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="w-full rounded-xl border border-border/60 bg-card/42 px-4 py-3.5 text-left backdrop-blur-md transition hover:border-primary/30"
            onClick={() => {
              setImportExportDialogOpen(false);
              resetImportState();
              setImportDialogOpen(true);
            }}
          >
            <div className="flex items-center gap-3">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-[13px] font-medium text-foreground">Importar planilha</p>
                <p className="text-xs text-muted-foreground">
                  Importar requisitos documentais a partir de uma planilha XLSX preenchida.
                </p>
              </div>
            </div>
          </button>
        </div>
      </Dialog>

      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          setImportDialogOpen(open);
          if (!open) {
            resetImportState();
          }
        }}
        title="Importar catálogo documental"
        size="lg"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            Use o modelo oficial para importar ou atualizar o catálogo organizacional de requisitos documentais.
            A importação só é liberada depois da prévia validada pela API.
          </div>

          <div className="space-y-2">
            <Label htmlFor="requirements-workbook">Arquivo .xlsx</Label>
            <Input
              id="requirements-workbook"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => void handleImportFile(event.target.files?.[0] || null)}
              disabled={previewImportMutation.isPending || commitImportMutation.isPending}
            />
            {importFileName ? (
              <p className="text-xs text-muted-foreground">Arquivo carregado: {importFileName}</p>
            ) : null}
          </div>

          {importPreview ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Linhas lidas</p>
                    <p className="mt-1 text-xl font-semibold">{importPreview.summary.totalRows}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Criar</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-600">{importPreview.summary.createCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Atualizar</p>
                    <p className="mt-1 text-xl font-semibold text-sky-600">{importPreview.summary.updateCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Com erro</p>
                    <p className="mt-1 text-xl font-semibold text-red-600">{importPreview.summary.errorCount}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {importPreview.rows.map((row) => (
                  <div key={`${row.rowNumber}-${row.name}`} className="rounded-xl border border-border/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          Linha {row.rowNumber} · {row.name || "Documento sem nome"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Peso {row.weight ?? "—"} · {row.description || "Sem descrição"}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          row.action === "create"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : row.action === "update"
                              ? "border-sky-200 bg-sky-50 text-sky-700"
                              : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {row.action === "create"
                          ? "Criar"
                          : row.action === "update"
                            ? "Atualizar"
                            : "Corrigir"}
                      </span>
                    </div>
                    {row.errors.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-sm text-red-600">
                        {row.errors.map((error) => (
                          <li key={error}>- {error}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setImportDialogOpen(false);
              resetImportState();
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => commitImportMutation.mutate()}
            disabled={
              !importPreview ||
              importRows.length === 0 ||
              importPreview.summary.errorCount > 0 ||
              commitImportMutation.isPending
            }
          >
            {commitImportMutation.isPending ? "Importando..." : "Confirmar importação"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={requirementDialogOpen}
        onOpenChange={(open) => {
          setRequirementDialogOpen(open);
          if (!open) {
            setEditingRequirementId(null);
            form.reset(emptyForm);
          }
        }}
        title={requirementDialogTitle}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="supplier-requirement-name">Nome</Label>
              <Input id="supplier-requirement-name" {...form.register("name")} disabled={!canManageSuppliers} />
              <FieldError message={form.formState.errors.name?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-requirement-category">Categoria</Label>
              <Select
                id="supplier-requirement-category"
                {...form.register("categoryId")}
                disabled={!canManageSuppliers}
              >
                <option value="">Selecione</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <FieldError message={form.formState.errors.categoryId?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-requirement-type">Tipo</Label>
              <Select id="supplier-requirement-type" {...form.register("typeId")} disabled={!canManageSuppliers}>
                <option value="">Selecione</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
              <FieldError message={form.formState.errors.typeId?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-requirement-weight">Peso</Label>
              <Input
                id="supplier-requirement-weight"
                type="number"
                min={1}
                max={5}
                {...form.register("weight", { valueAsNumber: true })}
                disabled={!canManageSuppliers}
              />
              <FieldError message={form.formState.errors.weight?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-requirement-status">Status</Label>
              <Select id="supplier-requirement-status" {...form.register("status")} disabled={!canManageSuppliers}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </Select>
              <FieldError message={form.formState.errors.status?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-requirement-description">Descrição</Label>
            <Textarea
              id="supplier-requirement-description"
              placeholder="Explique quando esse documento é exigido e como deve ser analisado."
              {...form.register("description")}
              disabled={!canManageSuppliers}
            />
            <FieldError message={form.formState.errors.description?.message} />
          </div>

          <ProfileItemAttachmentsField
            attachments={watchedAttachments.map((attachment, index) => ({
              id: `${attachment.objectPath}-${index}`,
              fileName: attachment.fileName,
              fileSize: attachment.fileSize,
              objectPath: attachment.objectPath,
              onRemove: canManageSuppliers ? () => removeAttachment(index) : undefined,
            }))}
            onUpload={canManageSuppliers ? (files) => void handleAttachmentUpload(files) : undefined}
            uploading={isAttachmentUploading}
            disabled={!canManageSuppliers}
            accept={PROFILE_ITEM_ATTACHMENT_ACCEPT}
            emptyText="Nenhum anexo adicionado a este requisito."
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setRequirementDialogOpen(false);
              setEditingRequirementId(null);
              form.reset(emptyForm);
            }}
          >
            {canManageSuppliers ? "Cancelar" : "Fechar"}
          </Button>
          {canManageSuppliers ? (
            <Button
              onClick={form.handleSubmit((values) => saveMutation.mutate(values))}
              disabled={saveMutation.isPending || (isEditing && !form.formState.isDirty)}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar requisito"}
            </Button>
          ) : null}
        </DialogFooter>
      </Dialog>
    </>
  );
}
