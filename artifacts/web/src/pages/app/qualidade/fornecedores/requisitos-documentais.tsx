import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  commitSupplierDocumentRequirementsImport,
  createSupplierDocumentRequirement,
  createSupplierRequirementTemplate,
  exportSupplierDocumentRequirements,
  listSupplierCategories,
  listSupplierDocumentRequirements,
  listSupplierTypes,
  previewSupplierDocumentRequirementsImport,
  suppliersKeys,
  type SupplierDocumentRequirementImportInputRow,
  type SupplierDocumentRequirementImportPreview,
  updateSupplierDocumentRequirement,
} from "@/lib/suppliers-client";
import {
  downloadSupplierDocumentRequirementsWorkbook,
  parseSupplierDocumentRequirementsWorkbook,
} from "@/lib/supplier-document-requirements-workbook";
import { resolveAppAssetPath } from "@/lib/base-path";
import { ArrowLeft, Download, Plus, ShieldCheck, Upload } from "lucide-react";

const requirementFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do requisito documental."),
  description: z.string(),
  weight: z.coerce.number().int().min(1, "O peso deve ser entre 1 e 5.").max(5, "O peso deve ser entre 1 e 5."),
  categoryId: z.string().trim().min(1, "Selecione uma categoria."),
  typeId: z.string().trim().min(1, "Selecione um tipo de fornecedor."),
  status: z.enum(["active", "inactive"]),
});

type RequirementFormValues = z.infer<typeof requirementFormSchema>;

const emptyForm: RequirementFormValues = {
  name: "",
  description: "",
  weight: 1,
  categoryId: "",
  typeId: "",
  status: "active",
};

function requirementStatusLabel(status: string) {
  return status === "inactive" ? "Inativo" : "Ativo";
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs text-destructive">{message}</p> : null;
}

export default function SupplierDocumentRequirementsPage() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const canManageSuppliers = role === "org_admin" || role === "platform_admin";

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<SupplierDocumentRequirementImportInputRow[]>([]);
  const [importPreview, setImportPreview] = useState<SupplierDocumentRequirementImportPreview | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    title: "",
    content: "",
    status: "draft",
    changeSummary: "",
    categoryId: "",
    typeId: "",
  });

  const form = useForm<RequirementFormValues>({
    resolver: zodResolver(requirementFormSchema),
    defaultValues: emptyForm,
  });

  const resetImportState = () => {
    setImportFileName("");
    setImportRows([]);
    setImportPreview(null);
  };

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
  const selectedRequirement = requirements.find((requirement) => requirement.id === selectedId) || null;

  useEffect(() => {
    if (isCreatingNew) return;
    if (requirements.length === 0) {
      setSelectedId(null);
      form.reset(emptyForm);
      return;
    }
    if (!selectedId || !requirements.some((requirement) => requirement.id === selectedId)) {
      setSelectedId(requirements[0].id);
    }
  }, [form, isCreatingNew, requirements, selectedId]);

  useEffect(() => {
    if (!selectedRequirement || isCreatingNew) return;
    form.reset({
      name: selectedRequirement.name,
      description: selectedRequirement.description || "",
      weight: selectedRequirement.weight,
      categoryId: selectedRequirement.categoryId ? String(selectedRequirement.categoryId) : "",
      typeId: selectedRequirement.typeId ? String(selectedRequirement.typeId) : "",
      status: selectedRequirement.status as "active" | "inactive",
    });
  }, [form, isCreatingNew, selectedRequirement]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
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
      toast({ title: "Template criado" });
    },
    onError: (error) => {
      toast({
        title: "Falha ao criar template",
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
      };

      if (selectedRequirement && !isCreatingNew) {
        return {
          action: "update" as const,
          requirement: await updateSupplierDocumentRequirement(orgId!, selectedRequirement.id, payload),
        };
      }

      return {
        action: "create" as const,
        requirement: await createSupplierDocumentRequirement(orgId!, payload),
      };
    },
    onSuccess: ({ action, requirement }) => {
      refresh();
      setIsCreatingNew(false);
      setSelectedId(requirement.id);
      form.reset({
        name: requirement.name,
        description: requirement.description || "",
        weight: requirement.weight,
        categoryId: requirement.categoryId ? String(requirement.categoryId) : "",
        typeId: requirement.typeId ? String(requirement.typeId) : "",
        status: requirement.status as "active" | "inactive",
      });
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

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => navigate("/app/qualidade/fornecedores")}>
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Voltar
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const anchor = document.createElement("a");
          anchor.href = resolveAppAssetPath("/templates/template_importacao_documentos.xlsx");
          anchor.download = "template_importacao_documentos.xlsx";
          anchor.click();
        }}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Baixar modelo
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => exportMutation.mutate()}
        disabled={!orgId || exportMutation.isPending}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        {exportMutation.isPending ? "Exportando..." : "Exportar catálogo"}
      </Button>
      {canManageSuppliers ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetImportState();
            setImportDialogOpen(true);
          }}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Importar planilha
        </Button>
      ) : null}
      {canManageSuppliers ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setTemplateDialogOpen(true)}>
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Template de requisito
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setIsCreatingNew(true);
              setSelectedId(null);
              form.reset(emptyForm);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Novo requisito
          </Button>
        </>
      ) : null}
    </div>
  );

  useHeaderActions(headerActions);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Requisitos</CardTitle>
              <Badge variant="secondary">{requirements.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Gerencie o catálogo oficial de documentos exigidos nas submissões dos fornecedores.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {requirements.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Nenhum requisito documental cadastrado.
              </div>
            ) : (
              requirements.map((requirement) => {
                const categoryName = categories.find((category) => category.id === requirement.categoryId)?.name;
                const typeName = types.find((type) => type.id === requirement.typeId)?.name;

                return (
                  <button
                    key={requirement.id}
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      selectedId === requirement.id && !isCreatingNew
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-border"
                    }`}
                    onClick={() => {
                      setIsCreatingNew(false);
                      setSelectedId(requirement.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-foreground">{requirement.name}</div>
                      <Badge variant={requirement.status === "active" ? "default" : "secondary"}>
                        {requirementStatusLabel(requirement.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{categoryName || "Sem categoria"}</span>
                      <span>{typeName || "Sem tipo"}</span>
                      <span>Peso {requirement.weight}</span>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isCreatingNew ? "Novo requisito documental" : "Detalhes do requisito documental"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="supplier-requirement-name">Nome</Label>
                <Input
                  id="supplier-requirement-name"
                  {...form.register("name")}
                  disabled={!canManageSuppliers}
                />
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
                <Select
                  id="supplier-requirement-type"
                  {...form.register("typeId")}
                  disabled={!canManageSuppliers}
                >
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
                <Select
                  id="supplier-requirement-status"
                  {...form.register("status")}
                  disabled={!canManageSuppliers}
                >
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

            {canManageSuppliers ? (
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreatingNew(false);
                    if (selectedRequirement) {
                      form.reset({
                        name: selectedRequirement.name,
                        description: selectedRequirement.description || "",
                        weight: selectedRequirement.weight,
                        categoryId: selectedRequirement.categoryId ? String(selectedRequirement.categoryId) : "",
                        typeId: selectedRequirement.typeId ? String(selectedRequirement.typeId) : "",
                        status: selectedRequirement.status as "active" | "inactive",
                      });
                    } else {
                      form.reset(emptyForm);
                    }
                  }}
                >
                  Descartar
                </Button>
                <Button
                  type="button"
                  onClick={form.handleSubmit((values) => saveMutation.mutate(values))}
                  disabled={saveMutation.isPending || (!isCreatingNew && !form.formState.isDirty)}
                >
                  {saveMutation.isPending ? "Salvando..." : "Salvar requisito"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Você pode visualizar os requisitos, mas não tem permissão para editá-los.</p>
            )}
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
