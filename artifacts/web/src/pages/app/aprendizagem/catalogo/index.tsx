import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useCreateTrainingCatalogItem,
  useUpdateTrainingCatalogItem,
  useDeleteTrainingCatalogItem,
  useListUserOptions,
  getListUserOptionsQueryKey,
  useListCompetencyCatalog,
  getListCompetencyCatalogQueryKey,
} from "@workspace/api-client-react";
import {
  buildCatalogParams,
  describeCatalogDeletionImpact,
  readCatalogDeletionDependencies,
  useAllTrainingCatalog,
  type CatalogDeletionDependencies,
} from "@/lib/training-catalog-client";
import {
  useActiveNorms,
  useAllNorms,
  buildNormLabelMap,
} from "@/lib/norms-client";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { paginateList } from "@/lib/paginate";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { formatKpiNumber } from "@/lib/kpi-client";
import { TrainingWorkloadInput } from "@/pages/app/aprendizagem/_components/carga-horaria";
import { useToast } from "@/hooks/use-toast";

const CATALOG_PAGE_SIZE = 24;
import type {
  TrainingCatalogItem,
  CreateTrainingCatalogItemBody,
} from "@workspace/api-client-react";
import { usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SearchableSelect,
  toNameOptions,
} from "@/components/ui/searchable-select";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Plus, Copy, Pencil, Trash2 } from "lucide-react";

const CATEGORIES = [
  "Integração",
  "Reciclagem",
  "Capacitação",
  "Certificação",
  "Reunião",
];
const MODALITIES = ["Presencial", "EAD", "Híbrido", "Externo"];

/** Rótulo(s) da(s) norma(s) de um item: prioriza o catálogo (normIds); cai no
 *  texto legado `norm` para itens ainda não migrados. */
function normLabelsForItem(
  item: TrainingCatalogItem,
  normLabelMap: Map<number, string>,
): string[] {
  const fromCatalog = (item.normIds ?? [])
    .map((id) => normLabelMap.get(id))
    .filter((l): l is string => Boolean(l));
  if (fromCatalog.length > 0) return fromCatalog;
  const legacy = item.norm?.replace(" §7.2", "").replace(" (MTE)", "").trim();
  return legacy ? [legacy] : [];
}
const VALIDITIES: { label: string; value: number | null }[] = [
  { label: "Sem validade", value: null },
  { label: "6 meses", value: 6 },
  { label: "12 meses", value: 12 },
  { label: "18 meses", value: 18 },
  { label: "24 meses", value: 24 },
  { label: "36 meses", value: 36 },
  { label: "48 meses", value: 48 },
];

type CatalogForm = {
  title: string;
  category: string;
  modality: string;
  normIds: number[];
  workloadHours: string;
  validityMonths: string;
  isMandatory: boolean;
  status: string;
  targetCompetencyName: string;
  defaultInstructor: string;
  objective: string;
  programContent: string;
};

const EMPTY_FORM: CatalogForm = {
  title: "",
  category: "Capacitação",
  modality: "Presencial",
  normIds: [],
  workloadHours: "",
  validityMonths: "",
  isMandatory: false,
  status: "ativo",
  targetCompetencyName: "",
  defaultInstructor: "",
  objective: "",
  programContent: "",
};

function itemToForm(item: TrainingCatalogItem): CatalogForm {
  return {
    title: item.title,
    category: item.category ?? "Capacitação",
    modality: item.modality ?? "Presencial",
    normIds: item.normIds ?? [],
    workloadHours: item.workloadHours != null ? String(item.workloadHours) : "",
    validityMonths:
      item.validityMonths != null ? String(item.validityMonths) : "",
    isMandatory: item.isMandatory,
    status: item.status,
    targetCompetencyName: item.targetCompetencyName ?? "",
    defaultInstructor: item.defaultInstructor ?? "",
    objective: item.objective ?? "",
    programContent: item.programContent ?? "",
  };
}

function formToBody(form: CatalogForm): CreateTrainingCatalogItemBody {
  return {
    title: form.title.trim(),
    category: form.category || undefined,
    modality: form.modality || undefined,
    normIds: form.normIds,
    workloadHours: form.workloadHours ? Number(form.workloadHours) : undefined,
    validityMonths:
      form.validityMonths === "" ? null : Number(form.validityMonths),
    isMandatory: form.isMandatory,
    status: form.status,
    targetCompetencyName: form.targetCompetencyName || undefined,
    defaultInstructor: form.defaultInstructor || undefined,
    objective: form.objective || undefined,
    programContent: form.programContent || undefined,
  };
}

const MODALITY_BADGE: Record<string, string> = {
  Presencial: "bg-teal-50 text-teal-700",
  EAD: "bg-blue-50 text-blue-700",
  Híbrido: "bg-purple-50 text-purple-700",
  Externo: "bg-orange-50 text-orange-700",
};

export default function CatalogoPage() {
  usePageTitle("Catálogo de treinamentos");
  const { user } = useAuth();
  const orgId = user?.organizationId;

  // Picker de usuários (instrutor): busca server-side (escala p/ orgs >100
  // usuários — #119). useListUserOptions (não useListOrgUsers, admin-only) é
  // acessível a quem edita. Competências continuam client-side (não paginam).
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebouncedValue(userSearch, 300);
  const userParams = {
    search: debouncedUserSearch || undefined,
    page: 1,
    pageSize: 100,
  };
  const usersQuery = useListUserOptions(orgId ?? 0, userParams, {
    query: {
      enabled: !!orgId,
      queryKey: getListUserOptionsQueryKey(orgId ?? 0, userParams),
    },
  });
  const userNames = useMemo(
    () => (usersQuery.data ?? []).map((u) => u.name),
    [usersQuery.data],
  );
  const competencyQuery = useListCompetencyCatalog(orgId ?? 0, {
    query: {
      enabled: !!orgId,
      queryKey: getListCompetencyCatalogQueryKey(orgId ?? 0),
    },
  });
  const competencyNames = useMemo(
    () => (competencyQuery.data?.data ?? []).map((c) => c.name),
    [competencyQuery.data],
  );
  // Catálogo de normas gerenciável (Configurações → Normas). Pickers usam as
  // ativas; exibições usam o mapa completo (inclui inativas já referenciadas).
  const { data: activeNorms = [] } = useActiveNorms(orgId ?? 0);
  const { data: allNorms = [] } = useAllNorms(orgId ?? 0);
  const normLabelMap = useMemo(() => buildNormLabelMap(allNorms), [allNorms]);
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("employees");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  // Debounced before it reaches the query: each keystroke would otherwise refetch
  // EVERY page of the catalog (useAllTrainingCatalog drains all pages), fanning a
  // short query into dozens of requests on a large catalog. Same pattern as the
  // user picker above.
  const debouncedSearch = useDebouncedValue(search, 300);
  // Filtro por id do catálogo de normas (string no <Select>, número na query).
  const [normFilter, setNormFilter] = useState("");
  const [category, setCategory] = useState("");
  const [modality, setModality] = useState("");
  // Padrão = só ativos (os 2.707 itens de histórico marcados como inativo no
  // banco não devem aparecer aqui sem o usuário pedir). "todos" remove o
  // filtro de status na busca — ver buildCatalogParams.
  const [statusFilter, setStatusFilter] = useState("ativo");

  const params = useMemo(
    () =>
      buildCatalogParams({
        search: debouncedSearch,
        normId: normFilter,
        category,
        modality,
        statusFilter,
      }),
    [debouncedSearch, normFilter, category, modality, statusFilter],
  );

  const { data: result, isLoading } = useAllTrainingCatalog(
    orgId ?? 0,
    params,
    {
      query: { enabled: !!orgId },
    },
  );
  const items = result?.data ?? [];
  const activeCount = useMemo(
    () => items.filter((i) => i.status === "ativo").length,
    [items],
  );
  // Rótulo honesto: a lista é filtrada no servidor, então o total só é "do
  // catálogo" quando não há filtro ativo (review #132). Ver params abaixo.
  // statusFilter "ativo" é o padrão (não é escolha do usuário), então não
  // conta como filtro — senão o rótulo do topo diria "no filtro atual" o
  // tempo todo, mesmo sem nenhuma ação do usuário.
  const isCatalogFiltered = Boolean(
    search || normFilter || category || modality || statusFilter !== "ativo",
  );

  // The full (filtered) catalog is already in memory — paginate the DOM so a
  // large catalog (800+ items) doesn't render every card at once. Back to page 1
  // whenever the filters change.
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [params]);
  const paginated = paginateList(items, page, CATALOG_PAGE_SIZE);

  const createMutation = useCreateTrainingCatalogItem();
  const updateMutation = useUpdateTrainingCatalogItem();
  const deleteMutation = useDeleteTrainingCatalogItem();

  const invalidate = () => {
    if (orgId)
      queryClient.invalidateQueries({
        queryKey: ["all-training-catalog", orgId],
      });
  };

  // dialogs
  const [formOpen, setFormOpen] = useState(false);
  // Reseta a busca do picker de usuário ao fechar (evita reabrir já filtrado). #119
  useEffect(() => {
    if (!formOpen) setUserSearch("");
  }, [formOpen]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CatalogForm>(EMPTY_FORM);
  const [fichaItem, setFichaItem] = useState<TrainingCatalogItem | null>(null);
  // Diálogo de exclusão (na interface, nunca window.confirm). Duas fases no
  // mesmo diálogo: `dependencies: null` é a confirmação simples; quando o DELETE
  // sem cascade volta 409 (item com obrigatoriedades/turmas/PAT), passa a exibir
  // o impacto e o "excluir mesmo assim".
  const [deleteDialog, setDeleteDialog] = useState<{
    item: TrainingCatalogItem;
    dependencies: CatalogDeletionDependencies | null;
  } | null>(null);

  // Normas ofertadas no seletor: as ativas + qualquer inativa já selecionada
  // (editar um item cuja norma foi desativada não pode esconder o marcado).
  const checkboxNorms = useMemo(() => {
    const referencedInactive = allNorms.filter(
      (n) => !n.active && form.normIds.includes(n.id),
    );
    return [...activeNorms, ...referencedInactive];
  }, [activeNorms, allNorms, form.normIds]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };
  const openEdit = (item: TrainingCatalogItem) => {
    setEditingId(item.id);
    setForm(itemToForm(item));
    setFormOpen(true);
  };
  const openDuplicate = (item: TrainingCatalogItem) => {
    setEditingId(null);
    setForm({ ...itemToForm(item), title: `${item.title} — cópia` });
    setFormOpen(true);
  };

  useHeaderActions(
    canWrite ? (
      <HeaderActionButton
        size="sm"
        onClick={openCreate}
        label="Novo treinamento"
        icon={<Plus className="h-3.5 w-3.5" />}
      >
        Novo treinamento
      </HeaderActionButton>
    ) : null,
  );

  const handleSave = async () => {
    if (!orgId || !form.title.trim()) return;
    const body = formToBody(form);
    if (editingId) {
      await updateMutation.mutateAsync({
        orgId,
        itemId: editingId,
        data: body,
      });
    } else {
      await createMutation.mutateAsync({ orgId, data: body });
    }
    invalidate();
    setFormOpen(false);
  };

  // Passo 1: abre o diálogo de confirmação na interface (nunca window.confirm).
  const handleDelete = (item: TrainingCatalogItem) => {
    setDeleteDialog({ item, dependencies: null });
  };

  // Passo 2: confirma a remoção simples. Tenta sem cascade; se o backend recusa
  // (409, item com obrigatoriedades/turmas/PAT), passa o MESMO diálogo para a
  // fase de cascata (mostra o impacto) em vez de mostrar um toast de erro.
  const confirmDelete = async () => {
    if (!orgId || !deleteDialog) return;
    const { item } = deleteDialog;
    try {
      await deleteMutation.mutateAsync({ orgId, itemId: item.id });
      invalidate();
      setDeleteDialog(null);
      toast({ title: "Treinamento removido do catálogo" });
    } catch (error) {
      const dependencies = readCatalogDeletionDependencies(error);
      if (dependencies) {
        setDeleteDialog({ item, dependencies });
        return;
      }
      setDeleteDialog(null);
      toast({
        title: "Não foi possível remover",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  // Passo 3 (fase cascata): apaga com ?cascade=true — o backend some com as
  // obrigatoriedades, turmas, PAT e pendências ainda não realizadas, e preserva
  // o registro de quem já concluiu (histórico).
  const confirmCascadeDelete = async () => {
    if (!orgId || !deleteDialog) return;
    try {
      await deleteMutation.mutateAsync({
        orgId,
        itemId: deleteDialog.item.id,
        params: { cascade: true },
      });
      invalidate();
      setDeleteDialog(null);
      toast({ title: "Treinamento removido do catálogo" });
    } catch (error) {
      toast({
        title: "Não foi possível remover",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  // Com o filtro de status default ("ativo"), items já é só ativos e
  // activeCount === items.length. Ao escolher "Inativos"/"Todos", manter a
  // palavra "ativos" no rótulo ficaria estranho ("0 treinamentos ativos" ao
  // lado de uma lista de 15 inativos) — nesse caso o rótulo mostra a
  // contagem simples de items.length, sem o adjetivo.
  const catalogCountLabel =
    statusFilter === "ativo" ? activeCount : items.length;

  return (
    <div className="space-y-4">
      {/* Métrica em destaque (fidelidade ao mockup: treinamentos ativos) */}
      <p className="text-sm text-muted-foreground">
        <span className="text-base font-semibold text-foreground">
          {catalogCountLabel}
        </span>{" "}
        treinamento{catalogCountLabel !== 1 ? "s" : ""}
        {statusFilter === "ativo"
          ? ` ativo${catalogCountLabel !== 1 ? "s" : ""}`
          : ""}{" "}
        {isCatalogFiltered ? "no filtro atual" : "no catálogo"}
      </p>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar treinamento..."
          className="max-w-xs"
        />
        <Select
          value={normFilter}
          onChange={(e) => setNormFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">Todas as normas</option>
          {activeNorms.map((n) => (
            <option key={n.id} value={String(n.id)}>
              {n.label}
            </option>
          ))}
        </Select>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-auto"
        >
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={modality}
          onChange={(e) => setModality(e.target.value)}
          className="w-auto"
        >
          <option value="">Todas as modalidades</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-auto"
        >
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos (arquivados)</option>
          <option value="todos">Todos</option>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {items.length} treinamento{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grid de cards */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
          {statusFilter === "ativo" ? (
            // Só ativos é o padrão: uma lista vazia aqui pode ser só um recorte —
            // pode haver itens arquivados. Avisa antes que o usuário recrie um
            // treinamento que já existe (inativo).
            <>
              Nenhum treinamento ativo
              {isCatalogFiltered ? " no filtro atual" : ""}. Troque o filtro
              para “Inativos” ou “Todos” para ver os arquivados
              {canWrite ? ", ou clique em “Novo treinamento”." : "."}
            </>
          ) : (
            <>
              Nenhum treinamento encontrado
              {canWrite ? " — clique em “Novo treinamento”." : "."}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paginated.pageItems.map((item) => (
            <div
              key={item.id}
              className="flex cursor-pointer flex-col rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
              onClick={() => setFichaItem(item)}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                {normLabelsForItem(item, normLabelMap).length > 0 ? (
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {normLabelsForItem(item, normLabelMap).map((label) => (
                      <span
                        key={label}
                        className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[
                  item.category,
                  item.workloadHours
                    ? `${formatKpiNumber(item.workloadHours)}h`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {item.objective ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {item.objective}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.modality ? (
                  <Badge className={MODALITY_BADGE[item.modality] ?? ""}>
                    {item.modality}
                  </Badge>
                ) : null}
                {item.isMandatory ? (
                  <Badge className="bg-red-50 text-red-700">Obrigatório</Badge>
                ) : (
                  <Badge className="bg-muted text-muted-foreground">
                    Seletivo
                  </Badge>
                )}
                {item.status !== "ativo" ? (
                  <Badge className="bg-amber-50 text-amber-700">
                    {item.status}
                  </Badge>
                ) : null}
              </div>
              {canWrite ? (
                <div
                  className="mt-3 flex gap-1 border-t pt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(item)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openDuplicate(item)}
                    title="Duplicar"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    onClick={() => void handleDelete(item)}
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {!isLoading && paginated.totalPages > 1 ? (
        <div className="mt-4">
          <PaginationControls
            page={paginated.page}
            pageSize={CATALOG_PAGE_SIZE}
            total={paginated.total}
            totalPages={paginated.totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : null}

      {/* Ficha (view) */}
      <Dialog
        open={!!fichaItem}
        onOpenChange={(o) => !o && setFichaItem(null)}
        title={fichaItem?.title ?? ""}
        description={
          fichaItem
            ? [
                fichaItem.category,
                fichaItem.modality,
                fichaItem.isMandatory ? "Obrigatório" : "Seletivo",
              ]
                .filter(Boolean)
                .join(" · ")
            : ""
        }
        size="lg"
      >
        {fichaItem ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="Categoria" value={fichaItem.category} />
              <Info
                label="Carga horária"
                value={
                  fichaItem.workloadHours
                    ? `${formatKpiNumber(fichaItem.workloadHours)}h`
                    : null
                }
              />
              <Info
                label="Validade"
                value={
                  fichaItem.validityMonths
                    ? `${fichaItem.validityMonths} meses`
                    : "Sem validade"
                }
              />
              <Info label="Modalidade" value={fichaItem.modality} />
            </div>
            {fichaItem.objective || fichaItem.programContent ? (
              <div className="grid gap-4 md:grid-cols-2">
                {fichaItem.objective ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Objetivo
                    </h4>
                    <p className="text-muted-foreground">
                      {fichaItem.objective}
                    </p>
                  </div>
                ) : null}
                {fichaItem.programContent ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Conteúdo programático
                    </h4>
                    <p className="whitespace-pre-line text-muted-foreground">
                      {fichaItem.programContent}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {normLabelsForItem(fichaItem, normLabelMap).length > 0 ? (
                <span>
                  Norma
                  {normLabelsForItem(fichaItem, normLabelMap).length > 1
                    ? "s"
                    : ""}
                  : {normLabelsForItem(fichaItem, normLabelMap).join(", ")}
                </span>
              ) : null}
              {fichaItem.targetCompetencyName ? (
                <span>· Competência: {fichaItem.targetCompetencyName}</span>
              ) : null}
              {fichaItem.defaultInstructor ? (
                <span>· Instrutor: {fichaItem.defaultInstructor}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>

      {/* Confirmação de exclusão (na interface). Fase simples até o DELETE voltar
          409; então mostra o impacto e o "excluir mesmo assim" (cascata). */}
      <Dialog
        open={!!deleteDialog}
        onOpenChange={(o) => !o && setDeleteDialog(null)}
        title={deleteDialog ? `Remover "${deleteDialog.item.title}"?` : ""}
        size="sm"
      >
        {deleteDialog ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {deleteDialog.dependencies
                ? describeCatalogDeletionImpact(deleteDialog.dependencies)
                : "Treinamentos já lançados para os colaboradores são preservados."}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialog(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  void (deleteDialog.dependencies
                    ? confirmCascadeDelete()
                    : confirmDelete())
                }
                disabled={deleteMutation.isPending}
              >
                {deleteDialog.dependencies ? "Excluir mesmo assim" : "Remover"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </Dialog>

      {/* Novo / Editar / Duplicar */}
      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingId ? "Editar treinamento" : "Novo treinamento"}
        description="Definição reutilizável do catálogo"
        size="xl"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Título *" className="md:col-span-2">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Categoria">
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Modalidade">
            <Select
              value={form.modality}
              onChange={(e) => setForm({ ...form, modality: e.target.value })}
            >
              {MODALITIES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Norma(s) de referência" className="md:col-span-2">
            {checkboxNorms.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma norma cadastrada. Cadastre em Configurações → Normas.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {checkboxNorms.map((norm) => {
                  const checked = form.normIds.includes(norm.id);
                  return (
                    <label
                      key={norm.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                        checked
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "border-border text-foreground hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-emerald-600"
                        checked={checked}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            normIds: e.target.checked
                              ? [...f.normIds, norm.id]
                              : f.normIds.filter((n) => n !== norm.id),
                          }))
                        }
                      />
                      {norm.label}
                    </label>
                  );
                })}
              </div>
            )}
          </Field>
          <Field label="Carga horária (h)">
            <TrainingWorkloadInput
              value={form.workloadHours}
              onChange={(v) => setForm({ ...form, workloadHours: v })}
            />
          </Field>
          <Field label="Validade">
            <Select
              value={form.validityMonths}
              onChange={(e) =>
                setForm({ ...form, validityMonths: e.target.value })
              }
            >
              {VALIDITIES.map((v) => (
                <option key={v.label} value={v.value ?? ""}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Competência vinculada">
            <SearchableSelect
              value={form.targetCompetencyName}
              onChange={(v) => setForm({ ...form, targetCompetencyName: v })}
              options={toNameOptions(
                competencyNames,
                form.targetCompetencyName,
              )}
              onCreateOption={(v) =>
                setForm({ ...form, targetCompetencyName: v })
              }
              isLoading={competencyQuery.isLoading}
              placeholder="Selecione uma competência…"
              searchPlaceholder="Buscar ou digitar competência…"
              createOptionLabel={(input) => `Usar “${input}”`}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="ativo">Ativo</option>
              <option value="rascunho">Rascunho</option>
              <option value="inativo">Inativo</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              checked={form.isMandatory}
              onChange={(e) =>
                setForm({ ...form, isMandatory: e.target.checked })
              }
            />
            <span className="text-sm font-medium">Treinamento obrigatório</span>
          </label>
          <Field
            label="Instrutor / responsável padrão"
            className="md:col-span-2"
          >
            <SearchableSelect
              value={form.defaultInstructor}
              onChange={(v) => setForm({ ...form, defaultInstructor: v })}
              options={toNameOptions(userNames, form.defaultInstructor)}
              onCreateOption={(v) => setForm({ ...form, defaultInstructor: v })}
              searchValue={userSearch}
              onSearchChange={setUserSearch}
              isLoading={usersQuery.isLoading}
              placeholder="Selecione um usuário…"
              searchPlaceholder="Buscar usuário ou digitar…"
              createOptionLabel={(input) => `Usar “${input}”`}
            />
          </Field>
          <Field label="Objetivo" className="md:col-span-2">
            <Textarea
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              rows={2}
            />
          </Field>
          <Field label="Conteúdo programático" className="md:col-span-2">
            <Textarea
              value={form.programContent}
              onChange={(e) =>
                setForm({ ...form, programContent: e.target.value })
              }
              rows={3}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFormOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={
              !form.title.trim() ||
              createMutation.isPending ||
              updateMutation.isPending
            }
          >
            Salvar treinamento
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value || "—"}</div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
