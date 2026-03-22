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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  createSupplier,
  createSupplierCategory,
  createSupplierDocumentRequirement,
  createSupplierRequirementTemplate,
  createSupplierType,
  listSupplierCategories,
  listSupplierDocumentRequirements,
  listSupplierRequirementTemplates,
  listSupplierTypes,
  listSuppliers,
  suppliersKeys,
  type SupplierCategory,
  type SupplierListItem,
  type SupplierType,
} from "@/lib/suppliers-client";
import { Plus, Settings2, FileStack, ShieldCheck, Tags, Package2 } from "lucide-react";

type SupplierFormState = {
  personType: "pj" | "pf";
  legalIdentifier: string;
  legalName: string;
  tradeName: string;
  categoryId: string;
  unitIds: number[];
  typeIds: number[];
  status: string;
  criticality: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  notes: string;
};

const emptySupplierForm: SupplierFormState = {
  personType: "pj",
  legalIdentifier: "",
  legalName: "",
  tradeName: "",
  categoryId: "",
  unitIds: [],
  typeIds: [],
  status: "draft",
  criticality: "medium",
  email: "",
  phone: "",
  city: "",
  state: "",
  notes: "",
};

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <Card className="border-border/60 p-6">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
    </Card>
  );
}

function formatCompliance(item: SupplierListItem) {
  if (item.documentCompliancePercentage === null || item.documentCompliancePercentage === undefined) {
    return "Sem avaliação";
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

function statusBadgeVariant(status: string): "secondary" | "success" | "warning" | "destructive" | "outline" {
  switch (status) {
    case "approved":
      return "success";
    case "pending_qualification":
    case "restricted":
      return "warning";
    case "blocked":
      return "destructive";
    case "draft":
    case "inactive":
    case "expired":
      return "outline";
    default:
      return "secondary";
  }
}

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
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [requirementDialogOpen, setRequirementDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", status: "active" });
  const [typeForm, setTypeForm] = useState({ name: "", description: "", status: "active", categoryId: "", parentTypeId: "" });
  const [requirementForm, setRequirementForm] = useState({
    name: "",
    description: "",
    weight: "1",
    status: "active",
    categoryId: "",
    typeId: "",
  });
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
  usePageSubtitle("Cadastro, homologação, requisitos, desempenho e recebimento.");

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
  const requirementsQuery = useQuery({
    queryKey: suppliersKeys.requirements(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierDocumentRequirements(orgId!),
  });
  const templatesQuery = useQuery({
    queryKey: suppliersKeys.templates(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierRequirementTemplates(orgId!),
  });
  const unitsQuery = useListUnits(orgId!, {
    query: {
      queryKey: getListUnitsQueryKey(orgId!),
      enabled: !!orgId,
    },
  });

  const createSupplierMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => createSupplier(orgId!, body),
    onSuccess: (supplier) => {
      setSupplierDialogOpen(false);
      setSupplierForm(emptySupplierForm);
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

  const createCategoryMutation = useMutation({
    mutationFn: () => createSupplierCategory(orgId!, categoryForm),
    onSuccess: () => {
      setCategoryDialogOpen(false);
      setCategoryForm({ name: "", description: "", status: "active" });
      queryClient.invalidateQueries({ queryKey: suppliersKeys.categories(orgId!) });
    },
  });

  const createTypeMutation = useMutation({
    mutationFn: () =>
      createSupplierType(orgId!, {
        ...typeForm,
        categoryId: typeForm.categoryId ? Number(typeForm.categoryId) : null,
        parentTypeId: typeForm.parentTypeId ? Number(typeForm.parentTypeId) : null,
      }),
    onSuccess: () => {
      setTypeDialogOpen(false);
      setTypeForm({ name: "", description: "", status: "active", categoryId: "", parentTypeId: "" });
      queryClient.invalidateQueries({ queryKey: suppliersKeys.types(orgId!) });
    },
  });

  const createRequirementMutation = useMutation({
    mutationFn: () =>
      createSupplierDocumentRequirement(orgId!, {
        name: requirementForm.name,
        description: requirementForm.description,
        weight: Number(requirementForm.weight),
        status: requirementForm.status,
        categoryId: requirementForm.categoryId ? Number(requirementForm.categoryId) : null,
        typeId: requirementForm.typeId ? Number(requirementForm.typeId) : null,
      }),
    onSuccess: () => {
      setRequirementDialogOpen(false);
      setRequirementForm({ name: "", description: "", weight: "1", status: "active", categoryId: "", typeId: "" });
      queryClient.invalidateQueries({ queryKey: suppliersKeys.requirements(orgId!) });
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
  const requirements = requirementsQuery.data || [];
  const templates = templatesQuery.data || [];
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

  const headerActions = canManageSuppliers ? (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setRequirementDialogOpen(true)}>
        <FileStack className="mr-2 h-4 w-4" />
        Requisito documental
      </Button>
      <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
        <ShieldCheck className="mr-2 h-4 w-4" />
        Template de requisito
      </Button>
      <Button variant="outline" onClick={() => setTypeDialogOpen(true)}>
        <Tags className="mr-2 h-4 w-4" />
        Tipo
      </Button>
      <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>
        <Settings2 className="mr-2 h-4 w-4" />
        Categoria
      </Button>
      <Button onClick={() => setSupplierDialogOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Novo fornecedor
      </Button>
    </div>
  ) : null;

  useHeaderActions(headerActions);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard title="Aprovados" value={summary.approved} subtitle="Fornecedores homologados." />
        <SummaryCard title="Restritos" value={summary.restricted} subtitle="Com operação condicionada." />
        <SummaryCard title="Bloqueados" value={summary.blocked} subtitle="Impedidos de operar." />
        <SummaryCard title="AVA1 apto" value={summary.withDocumentReview} subtitle="Com avaliação documental apta." />
      </div>

      <Card className="border-border/60 p-6">
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label htmlFor="supplier-search">Buscar</Label>
            <Input
              id="supplier-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, identificador ou razão social…"
            />
          </div>
          <div>
            <Label htmlFor="supplier-status">Status</Label>
            <Select
              id="supplier-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
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
          <div>
            <Label htmlFor="supplier-category-filter">Categoria</Label>
            <Select
              id="supplier-category-filter"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="supplier-type-filter">Tipo</Label>
            <Select
              id="supplier-type-filter"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div>
            <Label htmlFor="supplier-unit-filter">Unidade</Label>
            <Select
              id="supplier-unit-filter"
              value={unitFilter}
              onChange={(event) => setUnitFilter(event.target.value)}
            >
              <option value="">Todas</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-4 flex items-end justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setCategoryFilter("");
                setTypeFilter("");
                setUnitFilter("");
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="border-b border-border/60">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Base de Fornecedores</CardTitle>
              <p className="text-[13px] text-muted-foreground">
                {suppliers.length} fornecedor(es) encontrado(s) com os filtros atuais.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{categories.length} categorias</Badge>
              <Badge variant="secondary">{types.length} tipos</Badge>
              <Badge variant="secondary">{requirements.length} requisitos</Badge>
              <Badge variant="secondary">{templates.length} templates</Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {suppliersQuery.isLoading ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">Carregando fornecedores…</div>
          ) : suppliers.length === 0 ? (
            <div className="p-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Package2 className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>Nenhum Fornecedor Encontrado</EmptyTitle>
                  <EmptyDescription>
                    Ajuste os filtros ou crie o primeiro fornecedor desta organização.
                  </EmptyDescription>
                </EmptyHeader>
                {canManageSuppliers ? (
                  <EmptyContent>
                    <Button onClick={() => setSupplierDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Criar Fornecedor
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6 py-3">Fornecedor</TableHead>
                  <TableHead className="px-6 py-3">Status</TableHead>
                  <TableHead className="px-6 py-3">Categoria / Tipo</TableHead>
                  <TableHead className="px-6 py-3">Unidades</TableHead>
                  <TableHead className="px-6 py-3">AVA1</TableHead>
                  <TableHead className="px-6 py-3">Última Revisão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow
                    key={supplier.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/qualidade/fornecedores/${supplier.id}`)}
                  >
                    <TableCell className="px-6 py-4">
                      <div className="font-medium">{supplier.tradeName || supplier.legalName}</div>
                      <div className="text-muted-foreground">{supplier.legalIdentifier}</div>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <Badge variant={statusBadgeVariant(supplier.status)}>{statusLabel(supplier.status)}</Badge>
                        <span className="text-xs text-muted-foreground">Criticidade {supplier.criticality}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div>{supplier.category?.name || "Sem categoria"}</div>
                      <div className="text-xs text-muted-foreground">
                        {supplier.types.map((type) => type.name).join(", ") || "Sem tipo"}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-muted-foreground">
                      {supplier.units.map((unit) => unit.name).join(", ") || "Sem vínculo"}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div>{formatCompliance(supplier)}</div>
                      <div className="text-xs text-muted-foreground">{supplier.documentReviewStatus || "Sem parecer"}</div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-muted-foreground">
                      {supplier.latestQualification?.createdAt
                        ? new Date(supplier.latestQualification.createdAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        title="Novo fornecedor"
        description="Crie o cadastro mestre com classificação, unidades e tipos."
        size="xl"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="supplier-person-type">Tipo de pessoa</Label>
            <Select
              id="supplier-person-type"
              value={supplierForm.personType}
              onChange={(event) => setSupplierForm((current) => ({ ...current, personType: event.target.value as "pj" | "pf" }))}
            >
              <option value="pj">Pessoa jurídica</option>
              <option value="pf">Pessoa física</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="supplier-identifier">{supplierForm.personType === "pj" ? "CNPJ" : "CPF"}</Label>
            <Input
              id="supplier-identifier"
              value={supplierForm.legalIdentifier}
              onChange={(event) => setSupplierForm((current) => ({ ...current, legalIdentifier: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="supplier-legal-name">{supplierForm.personType === "pj" ? "Razão social" : "Nome completo"}</Label>
            <Input
              id="supplier-legal-name"
              value={supplierForm.legalName}
              onChange={(event) => setSupplierForm((current) => ({ ...current, legalName: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="supplier-trade-name">Nome fantasia</Label>
            <Input
              id="supplier-trade-name"
              value={supplierForm.tradeName}
              onChange={(event) => setSupplierForm((current) => ({ ...current, tradeName: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="supplier-category">Categoria</Label>
            <Select
              id="supplier-category"
              value={supplierForm.categoryId}
              onChange={(event) => setSupplierForm((current) => ({ ...current, categoryId: event.target.value }))}
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
            <Label htmlFor="supplier-status-input">Status inicial</Label>
            <Select
              id="supplier-status-input"
              value={supplierForm.status}
              onChange={(event) => setSupplierForm((current) => ({ ...current, status: event.target.value }))}
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
            <Label htmlFor="supplier-criticality">Criticidade</Label>
            <Select
              id="supplier-criticality"
              value={supplierForm.criticality}
              onChange={(event) => setSupplierForm((current) => ({ ...current, criticality: event.target.value }))}
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="supplier-email">E-mail</Label>
            <Input
              id="supplier-email"
              type="email"
              value={supplierForm.email}
              onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="supplier-phone">Telefone</Label>
            <Input
              id="supplier-phone"
              type="tel"
              value={supplierForm.phone}
              onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="supplier-city">Cidade</Label>
            <Input
              id="supplier-city"
              value={supplierForm.city}
              onChange={(event) => setSupplierForm((current) => ({ ...current, city: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="supplier-state">UF</Label>
            <Input
              id="supplier-state"
              value={supplierForm.state}
              onChange={(event) => setSupplierForm((current) => ({ ...current, state: event.target.value }))}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label>Unidades vinculadas</Label>
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
          <div>
            <Label>Tipos de fornecedor</Label>
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

        <div className="mt-4">
          <Label htmlFor="supplier-notes">Observações</Label>
          <Textarea
            id="supplier-notes"
            value={supplierForm.notes}
            onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))}
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              createSupplierMutation.mutate({
                personType: supplierForm.personType,
                legalIdentifier: supplierForm.legalIdentifier,
                legalName: supplierForm.legalName,
                tradeName: supplierForm.tradeName || null,
                categoryId: supplierForm.categoryId ? Number(supplierForm.categoryId) : null,
                unitIds: supplierForm.unitIds,
                typeIds: supplierForm.typeIds,
                status: supplierForm.status,
                criticality: supplierForm.criticality,
                email: supplierForm.email || null,
                phone: supplierForm.phone || null,
                city: supplierForm.city || null,
                state: supplierForm.state || null,
                notes: supplierForm.notes || null,
              })
            }
            isLoading={createSupplierMutation.isPending}
          >
            Criar fornecedor
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} title="Nova categoria" size="md">
        <div className="space-y-4">
          <div>
            <Label htmlFor="supplier-category-name">Nome</Label>
            <Input
              id="supplier-category-name"
              value={categoryForm.name}
              onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="supplier-category-description">Descrição</Label>
            <Textarea
              id="supplier-category-description"
              value={categoryForm.description}
              onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancelar</Button>
          <Button onClick={() => createCategoryMutation.mutate()} isLoading={createCategoryMutation.isPending}>
            Salvar categoria
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen} title="Novo tipo" size="md">
        <div className="space-y-4">
          <div>
            <Label htmlFor="supplier-type-name">Nome</Label>
            <Input
              id="supplier-type-name"
              value={typeForm.name}
              onChange={(event) => setTypeForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="supplier-type-category">Categoria</Label>
            <Select
              id="supplier-type-category"
              value={typeForm.categoryId}
              onChange={(event) => setTypeForm((current) => ({ ...current, categoryId: event.target.value }))}
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
            <Label htmlFor="supplier-type-parent">Tipo pai</Label>
            <Select
              id="supplier-type-parent"
              value={typeForm.parentTypeId}
              onChange={(event) => setTypeForm((current) => ({ ...current, parentTypeId: event.target.value }))}
            >
              <option value="">Sem hierarquia</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="supplier-type-description">Descrição</Label>
            <Textarea
              id="supplier-type-description"
              value={typeForm.description}
              onChange={(event) => setTypeForm((current) => ({ ...current, description: event.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>Cancelar</Button>
          <Button onClick={() => createTypeMutation.mutate()} isLoading={createTypeMutation.isPending}>
            Salvar tipo
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={requirementDialogOpen} onOpenChange={setRequirementDialogOpen} title="Novo requisito documental" size="md">
        <div className="space-y-4">
          <div>
            <Label htmlFor="supplier-requirement-name">Nome</Label>
            <Input
              id="supplier-requirement-name"
              value={requirementForm.name}
              onChange={(event) => setRequirementForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="supplier-requirement-weight">Peso</Label>
              <Input
                id="supplier-requirement-weight"
                type="number"
                min={1}
                max={5}
                value={requirementForm.weight}
                onChange={(event) => setRequirementForm((current) => ({ ...current, weight: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplier-requirement-category">Categoria</Label>
              <Select
                id="supplier-requirement-category"
                value={requirementForm.categoryId}
                onChange={(event) => setRequirementForm((current) => ({ ...current, categoryId: event.target.value }))}
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="supplier-requirement-type">Tipo</Label>
            <Select
              id="supplier-requirement-type"
              value={requirementForm.typeId}
              onChange={(event) => setRequirementForm((current) => ({ ...current, typeId: event.target.value }))}
            >
              <option value="">Sem tipo</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="supplier-requirement-description">Descrição</Label>
            <Textarea
              id="supplier-requirement-description"
              value={requirementForm.description}
              onChange={(event) => setRequirementForm((current) => ({ ...current, description: event.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRequirementDialogOpen(false)}>Cancelar</Button>
          <Button onClick={() => createRequirementMutation.mutate()} isLoading={createRequirementMutation.isPending}>
            Salvar requisito
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen} title="Novo template de requisito" size="lg">
        <div className="space-y-4">
          <div>
            <Label htmlFor="supplier-template-title">Título</Label>
            <Input
              id="supplier-template-title"
              value={templateForm.title}
              onChange={(event) => setTemplateForm((current) => ({ ...current, title: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="supplier-template-category">Categoria</Label>
              <Select
                id="supplier-template-category"
                value={templateForm.categoryId}
                onChange={(event) => setTemplateForm((current) => ({ ...current, categoryId: event.target.value }))}
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
              <Label htmlFor="supplier-template-type">Tipo</Label>
              <Select
                id="supplier-template-type"
                value={templateForm.typeId}
                onChange={(event) => setTemplateForm((current) => ({ ...current, typeId: event.target.value }))}
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
            <Label htmlFor="supplier-template-content">Conteúdo</Label>
            <Textarea
              id="supplier-template-content"
              rows={8}
              value={templateForm.content}
              onChange={(event) => setTemplateForm((current) => ({ ...current, content: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="supplier-template-summary">Resumo da mudança</Label>
            <Input
              id="supplier-template-summary"
              value={templateForm.changeSummary}
              onChange={(event) => setTemplateForm((current) => ({ ...current, changeSummary: event.target.value }))}
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
