import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { TurmasDoTreinamento } from "./turmas-do-treinamento";
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
  shortNormLabel,
} from "@/lib/norms-client";
import {
  useAllTrainingCatalogOptions,
  activeLabelsOfKind,
  mergeLabelOptions,
  activeEvidenceTypes,
  evidenceTypeByCode,
  evidenceCodeProves,
  type TrainingCatalogOption,
} from "@/lib/training-catalog-options-client";
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
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Plus, Copy, Pencil, Trash2, Settings } from "lucide-react";

/** Rótulo descritivo de um tipo de evidência derivado das flags do catálogo. */
function evidenceOptionLabel(o: TrainingCatalogOption): string {
  if (o.provesCompetency)
    return `${o.label} — comprova competência${o.requiresValidity ? " (com validade)" : ""}`;
  return `${o.label} — não comprova competência`;
}
/** Quantos badges de norma cabem no cabeçalho do card antes do "+N". */
const NORM_BADGES_ON_CARD = 2;

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
  developmentNature: string;
  knowledgeArea: string;
  normIds: number[];
  workloadHours: string;
  validityMonths: string;
  isMandatory: boolean;
  status: string;
  // O que este treino comprova. evidenceType classifica (capacitação/habilitação
  // provam competência; conscientização não). targetCompetencies é a lista de
  // competências comprovadas — um treino pode provar várias.
  evidenceType: string;
  targetCompetencies: { name: string; type: string; level: number }[];
  defaultInstructor: string;
  objective: string;
  programContent: string;
};

const EMPTY_FORM: CatalogForm = {
  title: "",
  category: "Capacitação",
  modality: "Presencial",
  developmentNature: "",
  knowledgeArea: "",
  normIds: [],
  workloadHours: "",
  validityMonths: "",
  isMandatory: false,
  status: "ativo",
  evidenceType: "",
  targetCompetencies: [],
  defaultInstructor: "",
  objective: "",
  programContent: "",
};

function itemToForm(item: TrainingCatalogItem): CatalogForm {
  return {
    title: item.title,
    category: item.category ?? "Capacitação",
    modality: item.modality ?? "Presencial",
    developmentNature: item.developmentNature ?? "",
    knowledgeArea: item.knowledgeArea ?? "",
    normIds: item.normIds ?? [],
    workloadHours: item.workloadHours != null ? String(item.workloadHours) : "",
    validityMonths:
      item.validityMonths != null ? String(item.validityMonths) : "",
    isMandatory: item.isMandatory,
    status: item.status,
    evidenceType: item.evidenceType ?? "",
    targetCompetencies: item.targetCompetencies ?? [],
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
    developmentNature: form.developmentNature || undefined,
    knowledgeArea: form.knowledgeArea || undefined,
    normIds: form.normIds,
    workloadHours: form.workloadHours ? Number(form.workloadHours) : undefined,
    validityMonths:
      form.validityMonths === "" ? null : Number(form.validityMonths),
    isMandatory: form.isMandatory,
    status: form.status,
    evidenceType: form.evidenceType
      ? (form.evidenceType as NonNullable<
          CreateTrainingCatalogItemBody["evidenceType"]
        >)
      : undefined,
    targetCompetencies: form.targetCompetencies,
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
  // Banco de competências → opções do multi-select (por id) + mapa por id.
  const competencyOptions = useMemo(
    () =>
      (competencyQuery.data?.data ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        keywords: [c.name],
      })),
    [competencyQuery.data],
  );
  const competencyById = useMemo(
    () => new Map((competencyQuery.data?.data ?? []).map((c) => [c.id, c])),
    [competencyQuery.data],
  );
  // Catálogo de normas gerenciável (Configurações → Normas). Pickers usam as
  // ativas; exibições usam o mapa completo (inclui inativas já referenciadas).
  const { data: activeNorms = [] } = useActiveNorms(orgId ?? 0);
  const { data: allNorms = [] } = useAllNorms(orgId ?? 0);
  const normLabelMap = useMemo(() => buildNormLabelMap(allNorms), [allNorms]);
  // Catálogo gerenciável das opções do form (categoria/modalidade/tipo de
  // evidência), em Configurações → Sistema → Treinamentos.
  const { data: trainingOptions = [] } = useAllTrainingCatalogOptions(
    orgId ?? 0,
  );
  const { canWriteModule, isOrgAdmin } = usePermissions();
  const canWrite = canWriteModule("employees");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

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
  // Ids selecionados = itens do banco cujo nome está na lista do form (a lista
  // guarda {name,type,level}; casamos pelo nome).
  const selectedCompetencyIds = useMemo(
    () =>
      (competencyQuery.data?.data ?? [])
        .filter((c) => form.targetCompetencies.some((t) => t.name === c.name))
        .map((c) => c.id),
    [competencyQuery.data, form.targetCompetencies],
  );
  const toggleCompetency = (id: number) => {
    const c = competencyById.get(id);
    if (!c) return;
    setForm((f) => {
      const exists = f.targetCompetencies.some((t) => t.name === c.name);
      return {
        ...f,
        targetCompetencies: exists
          ? f.targetCompetencies.filter((t) => t.name !== c.name)
          : [
              ...f.targetCompetencies,
              {
                name: c.name,
                type: c.competencyType ?? "habilidade",
                level: 1,
              },
            ],
      };
    });
  };
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

  // ── Opções gerenciáveis (categoria/modalidade/tipo de evidência) ──────────
  const evidenceByCode = useMemo(
    () => evidenceTypeByCode(trainingOptions),
    [trainingOptions],
  );
  const activeCategoryLabels = useMemo(
    () => activeLabelsOfKind(trainingOptions, "category"),
    [trainingOptions],
  );
  const activeModalityLabels = useMemo(
    () => activeLabelsOfKind(trainingOptions, "modality"),
    [trainingOptions],
  );
  const activeDevNatureLabels = useMemo(
    () => activeLabelsOfKind(trainingOptions, "development_nature"),
    [trainingOptions],
  );
  const activeKnowledgeAreaLabels = useMemo(
    () => activeLabelsOfKind(trainingOptions, "knowledge_area"),
    [trainingOptions],
  );
  // Filtro: ativos ∪ rótulos legados presentes nos itens ∪ o filtro atual (para
  // um valor selecionado não sumir do <Select> ao desativar a opção).
  const categoryFilterOptions = useMemo(
    () =>
      mergeLabelOptions(activeCategoryLabels, [
        ...items.map((i) => i.category),
        category,
      ]),
    [activeCategoryLabels, items, category],
  );
  const modalityFilterOptions = useMemo(
    () =>
      mergeLabelOptions(activeModalityLabels, [
        ...items.map((i) => i.modality),
        modality,
      ]),
    [activeModalityLabels, items, modality],
  );
  // Diálogo: ativos ∪ o valor atual do form (editar item cuja opção foi desativada).
  const categoryFormOptions = useMemo(
    () => mergeLabelOptions(activeCategoryLabels, [form.category]),
    [activeCategoryLabels, form.category],
  );
  const modalityFormOptions = useMemo(
    () => mergeLabelOptions(activeModalityLabels, [form.modality]),
    [activeModalityLabels, form.modality],
  );
  // Natureza do desenvolvimento / Área do conhecimento: sobem sem opções; o
  // seletor oferta os ativos ∪ o valor atual (opcionais → "—" sempre disponível).
  const devNatureFormOptions = useMemo(
    () => mergeLabelOptions(activeDevNatureLabels, [form.developmentNature]),
    [activeDevNatureLabels, form.developmentNature],
  );
  const knowledgeAreaFormOptions = useMemo(
    () => mergeLabelOptions(activeKnowledgeAreaLabels, [form.knowledgeArea]),
    [activeKnowledgeAreaLabels, form.knowledgeArea],
  );
  // Tipos de evidência ofertados: ativos + o já selecionado (mesmo inativo).
  const evidenceOptions = useMemo(() => {
    const active = activeEvidenceTypes(trainingOptions);
    if (
      form.evidenceType &&
      !active.some((o) => o.code === form.evidenceType)
    ) {
      const current = evidenceByCode.get(form.evidenceType);
      if (current) return [...active, current];
    }
    return active;
  }, [trainingOptions, form.evidenceType, evidenceByCode]);
  const formEvidenceProves = evidenceCodeProves(
    evidenceByCode,
    form.evidenceType,
  );

  // Engrenagem "Gerenciar" → Configurações → Sistema → aba Treinamentos.
  const goToTrainingConfig = () => {
    setFormOpen(false);
    navigate("/app/configuracoes/sistema");
    window.location.hash = "training-catalog";
  };
  const manageGear = isOrgAdmin ? (
    <button
      type="button"
      onClick={goToTrainingConfig}
      className="flex items-center gap-1 rounded p-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      title="Gerenciar opções em Configurações → Sistema → Treinamentos"
      aria-label="Gerenciar opções"
    >
      <Settings className="h-3.5 w-3.5" />
      Gerenciar
    </button>
  ) : null;

  const openCreate = () => {
    setEditingId(null);
    // Um item NOVO nunca deve começar numa opção desativada: parte da 1ª ativa
    // do catálogo (cai no default fixo só se o catálogo estiver vazio). Em edições
    // o valor atual continua sendo ofertado como extra, mesmo se inativo.
    setForm({
      ...EMPTY_FORM,
      category: activeCategoryLabels[0] ?? EMPTY_FORM.category,
      modality: activeModalityLabels[0] ?? EMPTY_FORM.modality,
    });
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

  // "Abrir turma" da ficha: leva para Gestão de turmas já com o treinamento
  // escolhido e o passo 1 do stepper aberto (a turma em si é criada lá, onde
  // ficam participantes, presença e notas).
  const abrirTurma = (item: TrainingCatalogItem) => {
    setFichaItem(null);
    navigate(`/aprendizagem/turmas?novaTurma=${item.id}`);
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
          <option value="">Todos os tipos de treinamento</option>
          {categoryFilterOptions.map((c) => (
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
          {modalityFilterOptions.map((m) => (
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
          {paginated.pageItems.map((item) => {
            const normLabels = normLabelsForItem(item, normLabelMap);
            const shownNorms = normLabels.slice(0, NORM_BADGES_ON_CARD);
            const hiddenNorms = normLabels.length - shownNorms.length;
            return (
              <div
                key={item.id}
                className="flex cursor-pointer flex-col rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
                onClick={() => setFichaItem(item)}
              >
                {/* Título tem prioridade de espaço (min-w-0 + flex-1); a coluna de
                  normas é limitada e truncada. Rótulos longos ("NR-11 ·
                  Transporte e Movimentação de Materiais") espremiam o título até
                  ele quebrar palavra a palavra. Rótulo inteiro no title/ficha. */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 text-sm font-semibold">
                    {item.title}
                  </h3>
                  {normLabels.length > 0 ? (
                    <div className="flex max-w-[45%] flex-wrap items-start justify-end gap-1">
                      {shownNorms.map((label) => (
                        <span
                          key={label}
                          title={label}
                          // min-w-0: item de flex tem min-width:auto (tamanho do
                          // conteúdo), que ganha do max-w-full e anularia o truncate.
                          className="min-w-0 max-w-full truncate rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700"
                        >
                          {shortNormLabel(label)}
                        </span>
                      ))}
                      {hiddenNorms > 0 ? (
                        <span
                          title={normLabels.join(", ")}
                          className="shrink-0 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700"
                        >
                          +{hiddenNorms}
                        </span>
                      ) : null}
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
                    <Badge className="bg-red-50 text-red-700">
                      Obrigatório
                    </Badge>
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
            );
          })}
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
        headerActions={
          fichaItem && canWrite ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const item = fichaItem;
                  setFichaItem(null);
                  openDuplicate(item);
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Duplicar
              </Button>
              <Button size="sm" onClick={() => abrirTurma(fichaItem)}>
                Abrir turma
              </Button>
            </>
          ) : null
        }
      >
        {fichaItem ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info
                label="Tipo de treinamento"
                value={fichaItem.category}
              />
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
              {fichaItem.developmentNature ? (
                <Info
                  label="Natureza do desenvolvimento"
                  value={fichaItem.developmentNature}
                />
              ) : null}
              {fichaItem.knowledgeArea ? (
                <Info
                  label="Área do conhecimento"
                  value={fichaItem.knowledgeArea}
                />
              ) : null}
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
              {/* Só tipos que comprovam competência exibem vínculos — não mostrar
                  os de um item que não comprova (ex.: conscientização com lista
                  gravada por outra via), para não enganar. */}
              {evidenceCodeProves(evidenceByCode, fichaItem.evidenceType) &&
              fichaItem.targetCompetencies &&
              fichaItem.targetCompetencies.length > 0 ? (
                <span>
                  · Competência
                  {fichaItem.targetCompetencies.length > 1 ? "s" : ""}:{" "}
                  {fichaItem.targetCompetencies.map((c) => c.name).join(", ")}
                </span>
              ) : null}
              {fichaItem.defaultInstructor ? (
                <span>· Instrutor: {fichaItem.defaultInstructor}</span>
              ) : null}
            </div>
            {orgId ? (
              <TurmasDoTreinamento orgId={orgId} catalogItemId={fichaItem.id} />
            ) : null}
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
          <Field label="Tipo de Treinamento" action={manageGear}>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categoryFormOptions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Modalidade" action={manageGear}>
            <Select
              value={form.modality}
              onChange={(e) => setForm({ ...form, modality: e.target.value })}
            >
              {modalityFormOptions.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Natureza do desenvolvimento" action={manageGear}>
            <Select
              value={form.developmentNature}
              onChange={(e) =>
                setForm({ ...form, developmentNature: e.target.value })
              }
            >
              <option value="">—</option>
              {devNatureFormOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Área do conhecimento" action={manageGear}>
            <Select
              value={form.knowledgeArea}
              onChange={(e) =>
                setForm({ ...form, knowledgeArea: e.target.value })
              }
            >
              <option value="">—</option>
              {knowledgeAreaFormOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
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
          <Field label="Tipo de evidência" action={manageGear}>
            <Select
              value={form.evidenceType}
              onChange={(e) => {
                const v = e.target.value;
                // Só tipos que comprovam competência mantêm o vínculo. Ao mudar
                // para um tipo que não comprova (ou nenhum), limpa as competências.
                const proves = evidenceCodeProves(evidenceByCode, v);
                setForm((f) => ({
                  ...f,
                  evidenceType: v,
                  targetCompetencies: proves ? f.targetCompetencies : [],
                }));
              }}
            >
              <option value="">Não classificado</option>
              {evidenceOptions.map((o) => (
                <option key={o.id} value={o.code ?? ""}>
                  {evidenceOptionLabel(o)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Competências comprovadas" className="md:col-span-2">
            <SearchableMultiSelect
              options={competencyOptions}
              selected={selectedCompetencyIds}
              onToggle={toggleCompetency}
              placeholder="Selecione as competências que este treino comprova…"
              searchPlaceholder="Buscar competência…"
              emptyMessage="Nenhuma competência no banco. Cadastre em Cargos e competências."
              disabled={!formEvidenceProves}
            />
            {!formEvidenceProves ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {form.evidenceType
                  ? "Este tipo de evidência não comprova competência — o vínculo fica desabilitado."
                  : "Escolha um tipo de evidência que comprova competência para vincular o que este treino comprova."}
              </p>
            ) : null}
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
  action,
  children,
}: {
  label: string;
  className?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-muted-foreground">
          {label}
        </Label>
        {action}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
