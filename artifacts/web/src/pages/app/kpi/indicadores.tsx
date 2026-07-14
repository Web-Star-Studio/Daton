import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import {
  getListOrgUsersQueryKey,
  useListOrgUsers,
  useListUnits,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableStringSelect } from "@/components/ui/searchable-string-select";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { YearPicker } from "@/components/ui/year-picker";
import { FormulaBuilder } from "@/components/kpi/formula-builder";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  KPI_CATEGORIES,
  PERIODICITY_LABELS,
  formatKpiNumber,
  formatKpiValue,
  isCurrencyUnit,
  normalizeForSearch,
  type KpiIndicator,
  type KpiObjective,
  type KpiYearRow,
  type WithReferenceMonth,
  useCreateKpiIndicatorWithInvalidation,
  useCreateKpiObjectiveWithInvalidation,
  useDeleteKpiIndicatorWithInvalidation,
  useDeleteKpiObjectiveWithInvalidation,
  useKpiIndicators,
  useKpiObjectives,
  useKpiYearData,
  useUpdateKpiIndicatorWithInvalidation,
  useUpdateKpiObjectiveWithInvalidation,
  useUpsertKpiYearConfigWithInvalidation,
} from "@/lib/kpi-client";
import {
  buildMeasurementLabel,
  detectVariableRenames,
  formulaToNaturalText,
  parseNaturalFormula,
  validateFormula,
} from "@/lib/formula-evaluator";
import { CORPORATE_UNIT_LABEL, isCorporateUnit } from "@/lib/kpi-constants";
import { canActOnKpiIndicator, type KpiRequesterScope } from "@/lib/kpi-access";
import { useActiveNorms, useAllNorms, buildNormLabelMap } from "@/lib/norms-client";
import type { StatusFilter } from "./_components/summary-tiles";
import { getIndicatorStatus, type CardStatus } from "./_components/indicator-card";
import { CorporateRollupsTab } from "./_components/corporate-rollups-tab";
import { CorporateCreateDialog } from "./_components/corporate-create-dialog";

const DEFAULT_YEAR = new Date().getFullYear();

/**
 * Filtros/visão persistidos entre trocas de aba do shell KPI. A página de
 * Indicadores desmonta ao navegar pra "Lançar" e remontava zerada — perdendo o
 * filtro de filial/norma/etc. que o usuário tinha aplicado. Guardamos em nível
 * de módulo (sobrevive ao remount; reseta só no reload da página) e guardamos o
 * orgId pra não vazar filtros entre organizações.
 */
type PersistedIndicadoresView = {
  orgId: number;
  viewMode: "branches" | "corporates";
  year: number;
  searchQuery: string;
  unitFilter: string;
  objectiveFilter: string;
  responsibleFilter: string;
  statusFilter: StatusFilter;
  normaFilter: string;
  categoriaFilter: string;
};
let persistedView: PersistedIndicadoresView | null = null;

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Periodicidades não mensais precisam de um mês de referência. */
function needsReferenceMonth(periodicity: string): boolean {
  return (
    periodicity === "quarterly" ||
    periodicity === "semiannual" ||
    periodicity === "annual"
  );
}

/** Ciclo de meses derivado da periodicidade + mês de referência (1º do ciclo). */
function referenceCycle(periodicity: string, ref: number): number[] {
  const at = (o: number) => ((ref - 1 + o) % 12) + 1;
  if (periodicity === "quarterly")
    return [at(0), at(3), at(6), at(9)].sort((a, b) => a - b);
  if (periodicity === "semiannual") return [at(0), at(6)].sort((a, b) => a - b);
  return [ref];
}

const MEASURE_UNIT_OPTIONS = [
  "%",
  "R$",
  "R$/mês",
  "Unidades",
  "Hrs",
  "Min",
  "Dias",
  "Km",
  "Km/L",
  "kg",
  "ton",
  "m²",
  "m³",
  "L",
  "pts",
] as const;

type IndicatorFormData = {
  name: string;
  /** Natural-language formula text — parsed into variables + expression on save. */
  formulaText: string;
  unit: string;
  unitId: number | null;
  responsibleUserName: string;
  responsibleUserId: number | null;
  measureUnit: string;
  direction: "up" | "down";
  periodicity: "monthly" | "quarterly" | "semiannual" | "annual" | "monthly_15d" | "monthly_45d";
  referenceMonth: string;
  category: string;
  norms: number[];
  objectiveId: string;
  goal: string;
  /**
   * Margem do amarelo no semáforo (default 0.01 em getTrafficLight). Não é
   * editável no diálogo — só existe aqui para que salvar uma edição preserve
   * o valor que já estiver no year-config (ex.: vindo do template/seed).
   */
  tolerance: string;
};

const defaultIndicatorForm = (): IndicatorFormData => ({
  name: "",
  formulaText: "",
  unit: "",
  unitId: null,
  responsibleUserName: "",
  responsibleUserId: null,
  measureUnit: "",
  direction: "up",
  periodicity: "monthly",
  referenceMonth: "",
  category: "",
  norms: [],
  objectiveId: "",
  goal: "",
  tolerance: "",
});

function buildEditFormFromIndicator(
  ind: KpiIndicator,
  yearRows: KpiYearRow[],
): IndicatorFormData {
  const yearRow = yearRows.find((r) => r.indicator.id === ind.id);
  const formulaText = formulaToNaturalText(
    ind.formulaVariables ?? [],
    ind.formulaExpression ?? "",
  );
  return {
    name: ind.name,
    formulaText,
    unit: ind.unit ?? "",
    unitId: ind.unitId ?? null,
    responsibleUserName: ind.responsibleUserName ?? ind.responsible ?? "",
    responsibleUserId: ind.responsibleUserId ?? null,
    measureUnit: ind.measureUnit ?? "",
    direction: ind.direction as "up" | "down",
    periodicity: ind.periodicity as IndicatorFormData["periodicity"],
    referenceMonth: (ind as WithReferenceMonth).referenceMonth
      ? String((ind as WithReferenceMonth).referenceMonth)
      : "",
    category: ind.category ?? "",
    norms: ind.norms ?? [],
    objectiveId:
      yearRow?.yearConfig.objectiveId != null ? String(yearRow.yearConfig.objectiveId) : "",
    goal: yearRow?.yearConfig.goal != null ? String(yearRow.yearConfig.goal) : "",
    tolerance: yearRow?.yearConfig.tolerance != null ? String(yearRow.yearConfig.tolerance) : "",
  };
}

const STATUS_BADGE: Record<CardStatus, { label: string; cls: string; bar: string }> = {
  green: {
    label: "Na tolerância",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  yellow: {
    label: "Atenção",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  red: {
    label: "Fora da tolerância",
    cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    bar: "bg-red-500",
  },
  nodata: {
    label: "Sem dados",
    cls: "bg-muted text-muted-foreground",
    bar: "bg-muted-foreground/30",
  },
};

/** Most recent month with a value for the indicator's year row. */
function latestValue(row: KpiYearRow | undefined): number | null {
  if (!row) return null;
  let latest: { month: number; value: number } | null = null;
  for (const m of row.monthlyValues) {
    if (m.value === null || m.value === undefined) continue;
    if (!latest || m.month > latest.month) latest = { month: m.month, value: m.value };
  }
  return latest ? latest.value : null;
}

const fmtNum = formatKpiNumber;

/**
 * Props opcionais — KpiModulePage usa pra plumbing de troca de aba
 * (Indicadores → Lançar) sem rotas, já que o módulo KPI usa state
 * interno em vez de rotas separadas.
 */
interface KpiIndicadoresPageProps {
  onOpenInLancar?: (indicatorId: number) => void;
}

export default function KpiIndicadoresPage({ onOpenInLancar }: KpiIndicadoresPageProps = {}) {
  const { organization, role, userId, unitId } = useAuth();
  const orgId = organization!.id;

  const scope: KpiRequesterScope = {
    role: (role ?? "analyst") as KpiRequesterScope["role"],
    userId: userId ?? -1,
    unitId,
  };
  const accessOf = (ind: KpiIndicator) => ({
    unitId: ind.unitId ?? null,
    responsibleUserId: ind.responsibleUserId ?? null,
    // Sinal autoritativo vindo do backend (rollupStrategy != null) — mesma
    // definição usada pela matriz de acesso no servidor. Espelha o contrato.
    isCorporate: ind.isCorporate ?? false,
    isLms: (ind.computedSource ?? null) != null,
  });
  const canCreate =
    scope.role === "org_admin" ||
    scope.role === "platform_admin" ||
    scope.role === "manager";

  usePageTitle("Indicadores");
  usePageSubtitle("Cadastro de KPIs e objetivos estratégicos");

  const [indicatorDialog, setIndicatorDialog] = useState(false);
  const [corporateCreateOpen, setCorporateCreateOpen] = useState(false);
  const [objectivesDialog, setObjectivesDialog] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<KpiIndicator | null>(null);
  /**
   * Tab atual: "branches" mostra a listagem por filial (vista padrão),
   * "corporates" mostra os indicadores corporativos (KPIs da empresa toda).
   */
  // Restaura filtros/visão da última visita (mesma org) — ver `persistedView`.
  const saved = persistedView?.orgId === orgId ? persistedView : null;
  const [viewMode, setViewMode] = useState<"branches" | "corporates">(
    saved?.viewMode ?? "branches",
  );
  const [indicatorForm, setIndicatorForm] = useState<IndicatorFormData>(defaultIndicatorForm());
  const [deleteConfirm, setDeleteConfirm] = useState<KpiIndicator | null>(null);
  // Quando a edição da fórmula renomeia variável(is), guarda os pares (já com
  // labels) pra confirmar com o usuário antes de salvar — o backend recalcula
  // os lançamentos antigos migrando as chaves dos inputs.
  const [pendingRenames, setPendingRenames] = useState<
    Array<{ fromLabel: string; toLabel: string }> | null
  >(null);
  const [year, setYear] = useState(saved?.year ?? DEFAULT_YEAR);
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery ?? "");
  const [unitFilter, setUnitFilter] = useState(saved?.unitFilter ?? "");
  const [objectiveFilter, setObjectiveFilter] = useState(
    saved?.objectiveFilter ?? "",
  );
  const [responsibleFilter, setResponsibleFilter] = useState(
    saved?.responsibleFilter ?? "",
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    saved?.statusFilter ?? "",
  );
  const [normaFilter, setNormaFilter] = useState(saved?.normaFilter ?? "");
  const [categoriaFilter, setCategoriaFilter] = useState(
    saved?.categoriaFilter ?? "",
  );
  const [focusedIndicatorId, setFocusedIndicatorId] = useState<number | null>(null);

  // Mantém `persistedView` em dia pra restaurar filtros/visão ao voltar de outra
  // aba (a página desmonta nessa navegação).
  useEffect(() => {
    persistedView = {
      orgId,
      viewMode,
      year,
      searchQuery,
      unitFilter,
      objectiveFilter,
      responsibleFilter,
      statusFilter,
      normaFilter,
      categoriaFilter,
    };
  }, [
    orgId,
    viewMode,
    year,
    searchQuery,
    unitFilter,
    objectiveFilter,
    responsibleFilter,
    statusFilter,
    normaFilter,
    categoriaFilter,
  ]);

  const [objectiveForm, setObjectiveForm] = useState({ code: "", name: "" });
  const [editingObjective, setEditingObjective] = useState<KpiObjective | null>(null);

  const { data: indicators = [], isLoading } = useKpiIndicators(orgId);
  const { data: objectives = [] } = useKpiObjectives(orgId);
  const { data: yearRows = [] } = useKpiYearData(orgId, year);
  const { data: orgUnits = [] } = useListUnits(orgId);
  const { data: activeNorms = [] } = useActiveNorms(orgId);
  const { data: allNorms = [] } = useAllNorms(orgId);
  const normLabelMap = useMemo(() => buildNormLabelMap(allNorms), [allNorms]);
  // Editar um indicador cuja norma foi desativada não pode esconder o checkbox
  // já marcado — inclui a norma referenciada (mesmo inativa) nas opções.
  const checkboxNorms = useMemo(() => {
    const referencedInactive = allNorms.filter(
      (n) => !n.active && indicatorForm.norms.includes(n.id),
    );
    return [...activeNorms, ...referencedInactive];
  }, [activeNorms, allNorms, indicatorForm.norms]);

  const { data: orgUsersData, isLoading: orgUsersLoading } = useListOrgUsers(orgId, {
    query: {
      queryKey: getListOrgUsersQueryKey(orgId),
      enabled: !!orgId,
      staleTime: 60_000,
    },
  });

  // Opções de unidade/filial para o cadastro. "Corporativo" NÃO entra aqui de
  // propósito: indicadores corporativos são criados na aba Corporativos (botão
  // "Novo corporativo"), não por este formulário. Ao editar um corporativo já
  // existente, o SearchableStringSelect preserva o valor legado "Corporativo".
  const orgUnitOptions = orgUnits
    .map((u) => u.name)
    .sort((a, b) => a.localeCompare(b));
  const responsibleOptions = useMemo(
    () =>
      (orgUsersData?.users ?? [])
        .map((u) => u.name)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [orgUsersData?.users],
  );

  const createIndicator = useCreateKpiIndicatorWithInvalidation(orgId);
  const updateIndicator = useUpdateKpiIndicatorWithInvalidation(orgId);
  const deleteIndicator = useDeleteKpiIndicatorWithInvalidation(orgId);
  const createObjective = useCreateKpiObjectiveWithInvalidation(orgId);
  const updateObjective = useUpdateKpiObjectiveWithInvalidation(orgId);
  const deleteObjective = useDeleteKpiObjectiveWithInvalidation(orgId);
  const upsertYearConfig = useUpsertKpiYearConfigWithInvalidation(orgId, year);

  useHeaderActions(
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setObjectivesDialog(true)}>
        <Target className="h-4 w-4 mr-1.5" />
        Objetivos
      </Button>
      {canCreate &&
        (viewMode === "corporates" ? (
          <HeaderActionButton
            label="Novo corporativo"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setCorporateCreateOpen(true)}
          />
        ) : (
          <HeaderActionButton
            label="Novo Indicador"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditingIndicator(null);
              setIndicatorForm(defaultIndicatorForm());
              setIndicatorDialog(true);
            }}
          />
        ))}
    </div>,
  );

  const yearIndicatorIds = new Set(yearRows.map((r) => r.indicator.id));
  const indicatorsForYear = indicators.filter((i) => yearIndicatorIds.has(i.id));

  const uniqueUnits = [...new Set(indicatorsForYear.map((i) => i.unit).filter(Boolean) as string[])].sort();

  const uniqueResponsibles = useMemo(() => {
    const map = new Map<number, string>();
    for (const ind of indicatorsForYear) {
      if (ind.responsibleUserId && ind.responsibleUserName) {
        map.set(ind.responsibleUserId, ind.responsibleUserName);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [indicatorsForYear]);

  const hasUnlinkedIndicators = indicatorsForYear.some((ind) => {
    const row = yearRows.find((r) => r.indicator.id === ind.id);
    return !row?.yearConfig?.objectiveId;
  });
  const hasUnassignedResponsible = indicatorsForYear.some((ind) => !ind.responsibleUserId);

  const indicatorStatusMap = useMemo(() => {
    const map = new Map<number, CardStatus>();
    for (const ind of indicatorsForYear) {
      const row = yearRows.find((r) => r.indicator.id === ind.id);
      map.set(ind.id, getIndicatorStatus(ind, row));
    }
    return map;
  }, [indicatorsForYear, yearRows]);

  const statusCounts = useMemo(() => {
    const counts: Record<CardStatus, number> = { green: 0, yellow: 0, red: 0, nodata: 0 };
    for (const ind of indicatorsForYear) {
      const s = indicatorStatusMap.get(ind.id) ?? "nodata";
      counts[s] += 1;
    }
    return counts;
  }, [indicatorsForYear, indicatorStatusMap]);

  const filteredIndicators = indicatorsForYear.filter((ind) => {
    const matchesSearch = normalizeForSearch(ind.name).includes(
      normalizeForSearch(searchQuery),
    );
    const matchesUnit = !unitFilter || (ind.unit ?? "") === unitFilter;
    const matchesNorma = !normaFilter || (ind.norms ?? []).includes(Number(normaFilter));
    const matchesCategoria = !categoriaFilter || (ind.category ?? "") === categoriaFilter;
    const row = yearRows.find((r) => r.indicator.id === ind.id);
    const objId = row?.yearConfig?.objectiveId ?? null;
    const matchesObjective =
      !objectiveFilter ||
      (objectiveFilter === "none" ? objId === null : String(objId ?? "") === objectiveFilter);
    const matchesResponsible =
      !responsibleFilter ||
      (responsibleFilter === "none"
        ? !ind.responsibleUserId
        : String(ind.responsibleUserId ?? "") === responsibleFilter);
    const matchesStatus =
      !statusFilter || (indicatorStatusMap.get(ind.id) ?? "nodata") === statusFilter;
    return (
      matchesSearch &&
      matchesUnit &&
      matchesNorma &&
      matchesCategoria &&
      matchesObjective &&
      matchesResponsible &&
      matchesStatus
    );
  });

  const hasActiveFilters =
    !!searchQuery ||
    !!unitFilter ||
    !!normaFilter ||
    !!categoriaFilter ||
    !!objectiveFilter ||
    !!responsibleFilter ||
    !!statusFilter;
  const clearFilters = () => {
    setSearchQuery("");
    setUnitFilter("");
    setNormaFilter("");
    setCategoriaFilter("");
    setObjectiveFilter("");
    setResponsibleFilter("");
    setStatusFilter("");
  };

  async function handleSaveIndicator() {
    if (!indicatorForm.name.trim()) {
      toast({ title: "Preencha o nome do indicador", variant: "destructive" });
      return;
    }
    const parsed = parseNaturalFormula(indicatorForm.formulaText);
    const formulaCheck = validateFormula(parsed.expression, parsed.variables);
    if (!formulaCheck.ok) {
      toast({ title: `Fórmula inválida: ${formulaCheck.error}`, variant: "destructive" });
      return;
    }
    // Editar a fórmula de um indicador que já tem lançamentos pode renomear
    // variáveis (o slug é regenerado a partir do label). O backend migra as
    // chaves dos `inputs` antigos e recalcula os valores — confirmamos com o
    // usuário antes de salvar pra deixar o efeito explícito.
    if (editingIndicator) {
      const oldVars = editingIndicator.formulaVariables ?? [];
      const renames = detectVariableRenames(oldVars, parsed.variables);
      if (renames.length > 0) {
        setPendingRenames(
          renames.map((r) => ({
            fromLabel: oldVars.find((v) => v.key === r.from)?.label ?? r.from,
            toLabel:
              parsed.variables.find((v) => v.key === r.to)?.label ?? r.to,
          })),
        );
        return;
      }
    }
    await persistIndicator();
  }

  async function persistIndicator() {
    const parsed = parseNaturalFormula(indicatorForm.formulaText);
    const measurement = buildMeasurementLabel(parsed.variables, parsed.expression);
    const referenceMonth =
      needsReferenceMonth(indicatorForm.periodicity) &&
      indicatorForm.referenceMonth
        ? Number(indicatorForm.referenceMonth)
        : null;
    try {
      if (editingIndicator) {
        const data = {
          name: indicatorForm.name,
          measurement,
          formulaVariables: parsed.variables,
          formulaExpression: parsed.expression,
          unit: indicatorForm.unit || undefined,
          unitId: indicatorForm.unitId,
          responsibleUserId: indicatorForm.responsibleUserId,
          measureUnit: indicatorForm.measureUnit || undefined,
          direction: indicatorForm.direction,
          periodicity: indicatorForm.periodicity,
          referenceMonth,
          category: indicatorForm.category || null,
          norms: indicatorForm.norms,
        };
        const updated = await updateIndicator.mutateAsync({
          orgId,
          indicatorId: editingIndicator.id,
          data,
        });
        await upsertYearConfig.mutateAsync({
          orgId,
          indicatorId: editingIndicator.id,
          year: year,
          data: {
            goal: indicatorForm.goal ? parseFloat(indicatorForm.goal) : null,
            objectiveId: indicatorForm.objectiveId ? parseInt(indicatorForm.objectiveId) : null,
            tolerance: indicatorForm.tolerance ? parseFloat(indicatorForm.tolerance) : null,
          },
        });
        toast({ title: "Indicador atualizado" });
        void updated;
      } else {
        const data = {
          name: indicatorForm.name,
          measurement,
          formulaVariables: parsed.variables,
          formulaExpression: parsed.expression,
          unit: indicatorForm.unit || undefined,
          unitId: indicatorForm.unitId ?? undefined,
          responsibleUserId: indicatorForm.responsibleUserId ?? undefined,
          measureUnit: indicatorForm.measureUnit || undefined,
          direction: indicatorForm.direction,
          periodicity: indicatorForm.periodicity,
          referenceMonth,
          category: indicatorForm.category || undefined,
          norms: indicatorForm.norms,
        };
        const created = await createIndicator.mutateAsync({ orgId, data });
        if (indicatorForm.goal || indicatorForm.objectiveId || indicatorForm.tolerance) {
          await upsertYearConfig.mutateAsync({
            orgId,
            indicatorId: created.id,
            year: year,
            data: {
              goal: indicatorForm.goal ? parseFloat(indicatorForm.goal) : null,
              objectiveId: indicatorForm.objectiveId ? parseInt(indicatorForm.objectiveId) : null,
              tolerance: indicatorForm.tolerance ? parseFloat(indicatorForm.tolerance) : null,
            },
          });
        }
        toast({ title: "Indicador criado" });
        // Nota: criação Corporativo via tab "Corporativos" é o fluxo
        // principal. Aqui o user criou pela tab "Por filial" — se setou
        // unit=Corporativo, ainda terá que ir pra tab Corporativos pra
        // ajustar a composição manualmente (caso edge não detectado).
        void created;
      }
      setIndicatorDialog(false);
    } catch {
      toast({ title: "Erro ao salvar indicador", variant: "destructive" });
    }
  }

  async function handleDeleteIndicator(ind: KpiIndicator) {
    try {
      await deleteIndicator.mutateAsync({ orgId, indicatorId: ind.id });
      toast({ title: "Indicador removido" });
      setDeleteConfirm(null);
    } catch {
      toast({ title: "Erro ao remover indicador", variant: "destructive" });
    }
  }

  async function handleSaveObjective() {
    if (!objectiveForm.name.trim()) {
      toast({ title: "Nome do objetivo é obrigatório", variant: "destructive" });
      return;
    }
    try {
      if (editingObjective) {
        await updateObjective.mutateAsync({ orgId, objectiveId: editingObjective.id, data: objectiveForm });
        toast({ title: "Objetivo atualizado" });
      } else {
        await createObjective.mutateAsync({ orgId, data: objectiveForm });
        toast({ title: "Objetivo criado" });
      }
      setObjectiveForm({ code: "", name: "" });
      setEditingObjective(null);
    } catch {
      toast({ title: "Erro ao salvar objetivo", variant: "destructive" });
    }
  }

  async function handleDeleteObjective(id: number) {
    try {
      await deleteObjective.mutateAsync({ orgId, objectiveId: id });
      toast({ title: "Objetivo removido" });
    } catch {
      toast({ title: "Erro ao remover objetivo", variant: "destructive" });
    }
  }

  const handleEditIndicator = (ind: KpiIndicator) => {
    setEditingIndicator(ind);
    setIndicatorForm(buildEditFormFromIndicator(ind, yearRows));
    setIndicatorDialog(true);
  };

  const jumpToIndicator = (ind: KpiIndicator) => {
    // Clear filters that could hide this specific indicator
    setStatusFilter("");
    setNormaFilter("");
    setCategoriaFilter("");
    setFocusedIndicatorId(ind.id);
    // Wait for re-render then scroll
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(`ind-card-${ind.id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    window.setTimeout(() => setFocusedIndicatorId(null), 2400);
  };

  // When arriving via deep-link (#ind-card-{id}), expand+scroll to that card.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#ind-card-")) return;
    const id = Number(hash.slice("#ind-card-".length));
    if (!Number.isFinite(id) || indicatorsForYear.length === 0) return;
    const target = indicatorsForYear.find((i) => i.id === id);
    if (!target) return;
    jumpToIndicator(target);
    // Strip the hash so re-renders don't keep re-triggering
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorsForYear.length]);

  // Deep-link #ind-edit-{id}: abre o diálogo de edição daquele indicador
  // (usado pela aba Lançar para configurar o mês de referência).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#ind-edit-")) return;
    const id = Number(hash.slice("#ind-edit-".length));
    if (!Number.isFinite(id) || indicators.length === 0) return;
    const target = indicators.find((i) => i.id === id);
    if (!target) return;
    handleEditIndicator(target);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.length]);

  // Deep-link #obj-{id} (ou #obj-none): vem do card de Objetivos Estratégicos
  // no dashboard. Aplica o filtro de objetivo e limpa os demais pra listar
  // todos os indicadores daquele objetivo (na visão "Por filial", onde o
  // filtro de objetivo vale).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#obj-")) return;
    const raw = hash.slice("#obj-".length);
    setViewMode("branches");
    setSearchQuery("");
    setUnitFilter("");
    setNormaFilter("");
    setCategoriaFilter("");
    setResponsibleFilter("");
    setStatusFilter("");
    setObjectiveFilter(raw === "none" ? "none" : raw);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conta quantos Corporativos existem (pra badge da tab)
  const corporateCount = indicators.filter(
    (i) => i.unit?.trim().toLowerCase() === CORPORATE_UNIT_LABEL.toLowerCase(),
  ).length;

  return (
    <div className="p-6 space-y-4">
      {/* Tab bar — Por filial / Corporativos */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setViewMode("branches")}
          className={cn(
            "relative px-3 py-2 text-sm font-medium transition-colors",
            viewMode === "branches"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Por filial
          {viewMode === "branches" && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setViewMode("corporates")}
          className={cn(
            "relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
            viewMode === "corporates"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Corporativos
          {corporateCount > 0 && (
            <span className="rounded-full bg-indigo-100 px-1.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {corporateCount}
            </span>
          )}
          {viewMode === "corporates" && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
          )}
        </button>
      </div>

      {viewMode === "corporates" ? (
        <CorporateRollupsTab
          indicators={indicators}
          yearRows={yearRows}
          onEditIndicator={(ind) => handleEditIndicator(ind)}
          onDeleteIndicator={(ind) => setDeleteConfirm(ind)}
        />
      ) : (
      <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <YearPicker value={year} onChange={setYear} />
        <Input
          placeholder="Buscar indicador..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={normaFilter}
          onChange={(e) => setNormaFilter(e.target.value)}
          className="w-44"
        >
          <option value="">Todas as normas</option>
          {activeNorms.map((n) => (
            <option key={n.id} value={String(n.id)}>
              {n.label}
            </option>
          ))}
        </Select>
        <Select
          value={categoriaFilter}
          onChange={(e) => setCategoriaFilter(e.target.value)}
          className="w-44"
        >
          <option value="">Todas as categorias</option>
          {KPI_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="max-w-xs"
        >
          <option value="">Todas as unidades</option>
          {uniqueUnits.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Select
          value={objectiveFilter}
          onChange={(e) => setObjectiveFilter(e.target.value)}
          className="w-64"
        >
          <option value="">Todos os objetivos</option>
          {objectives.map((o) => (
            <option key={o.id} value={String(o.id)}>
              {o.code ? `${o.code} · ${o.name}` : o.name}
            </option>
          ))}
          {/* Fallback p/ deep-link #obj-{id} de objetivo ausente/stale: garante
              que o <select> controlado tenha a option do seu value atual. */}
          {objectiveFilter &&
            objectiveFilter !== "none" &&
            !objectives.some((o) => String(o.id) === objectiveFilter) && (
              <option value={objectiveFilter}>Objetivo {objectiveFilter}</option>
            )}
          {(hasUnlinkedIndicators || objectiveFilter === "none") && (
            <option value="none">Sem objetivo vinculado</option>
          )}
        </Select>
        <Select
          value={responsibleFilter}
          onChange={(e) => setResponsibleFilter(e.target.value)}
          className="w-56"
        >
          <option value="">Todos os responsáveis</option>
          {uniqueResponsibles.map(([id, name]) => (
            <option key={id} value={String(id)}>
              {name}
            </option>
          ))}
          {hasUnassignedResponsible && <option value="none">Sem responsável</option>}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="w-40"
        >
          <option value="">Todos os status</option>
          <option value="green">Na tolerância ({statusCounts.green})</option>
          <option value="yellow">Atenção ({statusCounts.yellow})</option>
          <option value="red">Fora da tolerância ({statusCounts.red})</option>
          <option value="nodata">Sem dados ({statusCounts.nodata})</option>
        </Select>
        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-xs">
            <X className="mr-1 h-3.5 w-3.5" />
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {/* Indicators table */}
      {isLoading ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      ) : filteredIndicators.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {indicators.length === 0
            ? 'Nenhum indicador cadastrado. Crie o primeiro clicando em "Novo Indicador".'
            : indicatorsForYear.length === 0
              ? `Nenhum indicador configurado para ${year}.`
              : "Nenhum indicador encontrado com os filtros aplicados."}
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Norma</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Tolerância</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIndicators.map((ind) => {
                const row = yearRows.find((r) => r.indicator.id === ind.id);
                const st = indicatorStatusMap.get(ind.id) ?? "nodata";
                const badge = STATUS_BADGE[st];
                const goal = row?.yearConfig.goal ?? null;
                const result = latestValue(row);
                const pct =
                  result !== null && goal != null && goal !== 0
                    ? Math.min(100, Math.round(Math.abs(result / goal) * 100))
                    : 0;
                const focused = focusedIndicatorId === ind.id;
                const canEdit = canActOnKpiIndicator(scope, accessOf(ind), "editDefinition");
                const canDeleteInd = canActOnKpiIndicator(scope, accessOf(ind), "delete");
                return (
                  <TableRow
                    key={ind.id}
                    id={`ind-card-${ind.id}`}
                    className={cn("scroll-mt-6", focused && "bg-primary/10")}
                  >
                    <TableCell className="max-w-[240px] font-medium text-foreground">
                      {onOpenInLancar ? (
                        // Título leva direto ao lançamento do indicador (foca a
                        // fila na aba "Lançar") — evita o cliente ter que buscar
                        // ou filtrar de novo lá. Mesmo plumbing do drawer corporativo.
                        <button
                          type="button"
                          onClick={() => onOpenInLancar(ind.id)}
                          title={`Lançar valores de ${ind.name}`}
                          className="text-left hover:text-primary hover:underline focus-visible:outline-none focus-visible:text-primary focus-visible:underline"
                        >
                          {ind.name}
                        </button>
                      ) : (
                        ind.name
                      )}
                    </TableCell>
                    <TableCell>
                      {ind.category ? (
                        <Badge variant="neutral" className="text-[10px]">
                          {ind.category}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(ind.norms ?? []).length > 0 ? (
                          (ind.norms ?? []).map((n) => (
                            <span
                              key={n}
                              className="rounded border px-1 text-[9px] font-medium leading-4 text-muted-foreground"
                            >
                              {normLabelMap.get(n) ?? "#" + n}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ind.unit ? (
                        isCorporateUnit(ind.unit) ? (
                          // Badge distinto pra rollup corporativo — ajuda Ana a
                          // bater o olho e identificar quando uma linha é o
                          // agregado de todas as filiais.
                          <Badge
                            variant="outline"
                            className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30 text-[10px]"
                          >
                            {ind.unit}
                          </Badge>
                        ) : (
                          ind.unit
                        )
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {PERIODICITY_LABELS[
                        ind.periodicity as keyof typeof PERIODICITY_LABELS
                      ] ?? ind.periodicity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {goal != null ? (
                        <>
                          {isCurrencyUnit(ind.measureUnit)
                            ? formatKpiValue(goal, ind.measureUnit)
                            : fmtNum(goal)}{" "}
                          <span className="text-muted-foreground">
                            {ind.direction === "up" ? "↑" : "↓"}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {result !== null
                        ? formatKpiValue(result, ind.measureUnit)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", badge.bar)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          badge.cls,
                        )}
                      >
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ind.responsibleUserName ?? "—"}
                    </TableCell>
                    <TableCell>
                      {(canEdit || canDeleteInd) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Ações do indicador"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit && (
                              <DropdownMenuItem onClick={() => handleEditIndicator(ind)}>
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Editar
                              </DropdownMenuItem>
                            )}
                            {canDeleteInd && (
                              <DropdownMenuItem
                                onClick={() => setDeleteConfirm(ind)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Remover
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      </>
      )}

      {/* Create/Edit Indicator Dialog */}
      <Dialog
        open={indicatorDialog}
        onOpenChange={setIndicatorDialog}
        title={editingIndicator ? "Editar Indicador" : "Novo Indicador"}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Nome do indicador *</Label>
            <Input
              value={indicatorForm.name}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Atendimento do Prazo de Entrega"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Fórmula *</Label>
            <FormulaBuilder
              value={indicatorForm.formulaText}
              onChange={(next) => setIndicatorForm((f) => ({ ...f, formulaText: next }))}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Norma(s) atendida(s)</Label>
            <div className="flex flex-wrap gap-2">
              {checkboxNorms.map((norm) => {
                const checked = indicatorForm.norms.includes(norm.id);
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
                        setIndicatorForm((f) => ({
                          ...f,
                          norms: e.target.checked
                            ? [...f.norms, norm.id]
                            : f.norms.filter((n) => n !== norm.id),
                        }))
                      }
                    />
                    {norm.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade / filial</Label>
            <SearchableStringSelect
              value={indicatorForm.unit}
              onChange={(v) => {
                const u = orgUnits.find((x) => x.name === v);
                setIndicatorForm((f) => ({ ...f, unit: v, unitId: u?.id ?? null }));
              }}
              options={orgUnitOptions}
              placeholder="Selecione uma unidade"
              searchPlaceholder="Buscar unidade..."
              emptyMessage="Nenhuma unidade encontrada"
            />
            <p className="text-[11px] text-muted-foreground">
              Para um KPI da empresa toda, use{" "}
              <span className="font-medium">"Novo corporativo"</span> na aba
              Corporativos — não cadastre aqui.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <SearchableStringSelect
              value={indicatorForm.responsibleUserName}
              onChange={(v) => {
                const user = (orgUsersData?.users ?? []).find((u) => u.name === v);
                setIndicatorForm((f) => ({
                  ...f,
                  responsibleUserName: v,
                  responsibleUserId: user?.id ?? null,
                }));
              }}
              options={responsibleOptions}
              isLoading={orgUsersLoading}
              placeholder="Selecione um responsável"
              searchPlaceholder="Buscar usuário..."
              emptyMessage={
                responsibleOptions.length === 0
                  ? "Nenhum usuário com conta. Cadastre em Configurações → Usuários."
                  : "Nenhum usuário encontrado"
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Apenas usuários com conta na plataforma podem ser responsáveis.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade de medida</Label>
            <Select
              value={indicatorForm.measureUnit}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, measureUnit: e.target.value }))}
            >
              <option value="">Selecione uma unidade</option>
              {indicatorForm.measureUnit &&
                !MEASURE_UNIT_OPTIONS.includes(indicatorForm.measureUnit as (typeof MEASURE_UNIT_OPTIONS)[number]) && (
                  <option value={indicatorForm.measureUnit}>{indicatorForm.measureUnit}</option>
                )}
              {MEASURE_UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Melhor resultado</Label>
            <Select
              value={indicatorForm.direction}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, direction: e.target.value as "up" | "down" }))}
            >
              <option value="up">↑ Quanto maior, melhor</option>
              <option value="down">↓ Quanto menor, melhor</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Periodicidade</Label>
            <Select
              value={indicatorForm.periodicity}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, periodicity: e.target.value as IndicatorFormData["periodicity"] }))}
            >
              {Object.entries(PERIODICITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          {needsReferenceMonth(indicatorForm.periodicity) ? (
            <div className="space-y-1.5">
              <Label>Mês de referência</Label>
              <Select
                value={indicatorForm.referenceMonth}
                onChange={(e) =>
                  setIndicatorForm((f) => ({
                    ...f,
                    referenceMonth: e.target.value,
                  }))
                }
              >
                <option value="">Selecione o mês</option>
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={String(i + 1)}>
                    {name}
                  </option>
                ))}
              </Select>
              {indicatorForm.referenceMonth &&
              indicatorForm.periodicity !== "annual" ? (
                <p className="text-[11px] text-muted-foreground">
                  Lançado em:{" "}
                  <span className="font-medium text-foreground">
                    {referenceCycle(
                      indicatorForm.periodicity,
                      Number(indicatorForm.referenceMonth),
                    )
                      .map((m) => MONTH_NAMES[m - 1])
                      .join(" · ")}
                  </span>
                  . O sistema marca o ciclo automaticamente.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Mês em que o indicador deve ser lançado — fica destacado na
                  tela de Lançar.
                </p>
              )}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              value={indicatorForm.category}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="">Sem categoria</option>
              {KPI_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Alimenta o semáforo por categoria no dashboard.
            </p>
          </div>
          <div className="col-span-2 border-t pt-3 mt-1">
            <p className="text-xs text-muted-foreground mb-3">Tolerância e objetivo para {year} (opcional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Objetivo estratégico</Label>
                <Select
                  value={indicatorForm.objectiveId}
                  onChange={(e) => setIndicatorForm((f) => ({ ...f, objectiveId: e.target.value }))}
                >
                  <option value="">Sem objetivo vinculado</option>
                  {objectives.map((obj) => (
                    <option key={obj.id} value={String(obj.id)}>
                      {obj.code ? `${obj.code} — ` : ""}{obj.name}
                    </option>
                  ))}
                </Select>
              </div>
              {editingIndicator && isCorporateUnit(editingIndicator.unit) ? (
                <div className="space-y-1.5">
                  <Label>Tolerância ({year})</Label>
                  <p className="rounded-md border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
                    Calculada automaticamente das filiais.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Tolerância ({year})</Label>
                  <Input
                    type="number"
                    value={indicatorForm.goal}
                    onChange={(e) => setIndicatorForm((f) => ({ ...f, goal: e.target.value }))}
                    placeholder="Ex: 95"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIndicatorDialog(false)}>Cancelar</Button>
          <Button
            onClick={handleSaveIndicator}
            disabled={createIndicator.isPending || updateIndicator.isPending}
          >
            {editingIndicator ? "Salvar alterações" : "Criar indicador"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirm Dialog */}
      {deleteConfirm && (
        <Dialog
          open={true}
          onOpenChange={() => setDeleteConfirm(null)}
          title="Remover indicador?"
          size="sm"
        >
          <p className="text-sm text-muted-foreground">
            Esta ação também removerá todos os dados de tolerâncias e valores mensais associados a "{deleteConfirm.name}".
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => handleDeleteIndicator(deleteConfirm)}
              disabled={deleteIndicator.isPending}
            >
              Remover
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Confirmação de rename de variável — a edição da fórmula renomeou
          variável(is), o que faz o backend recalcular os lançamentos já
          registrados migrando as chaves dos inputs. */}
      <AlertDialog
        open={pendingRenames !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRenames(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular lançamentos?</AlertDialogTitle>
            <AlertDialogDescription>
              A nova fórmula renomeia{" "}
              {pendingRenames && pendingRenames.length === 1
                ? "uma variável"
                : `${pendingRenames?.length ?? 0} variáveis`}
              . Os lançamentos já registrados serão recalculados automaticamente
              com a nova fórmula — os valores informados são preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingRenames && pendingRenames.length > 0 ? (
            <ul className="space-y-1 rounded-lg bg-muted/50 p-3 text-[13px]">
              {pendingRenames.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-muted-foreground line-through">
                    {r.fromLabel}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium text-foreground">
                    {r.toLabel}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                setPendingRenames(null);
                void persistIndicator();
              }}
            >
              Recalcular e salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Objectives Dialog */}
      <Dialog
        open={objectivesDialog}
        onOpenChange={setObjectivesDialog}
        title="Objetivos Estratégicos"
        size="lg"
      >
        <div className="space-y-4">
          {/* Add/Edit form */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <p className="text-sm font-medium">{editingObjective ? "Editar objetivo" : "Novo objetivo"}</p>
            <div className="flex gap-3 items-end">
              <div className="w-24 space-y-1">
                <Label className="text-xs">Código</Label>
                <Input
                  value={objectiveForm.code}
                  onChange={(e) => setObjectiveForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="Q2"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input
                  value={objectiveForm.name}
                  onChange={(e) => setObjectiveForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: AUMENTAR A EFICIÊNCIA OPERACIONAL DOS PROCESSOS"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={handleSaveObjective} disabled={createObjective.isPending || updateObjective.isPending}>
                  {editingObjective ? "Salvar" : "Adicionar"}
                </Button>
                {editingObjective && (
                  <Button size="sm" variant="ghost" onClick={() => { setEditingObjective(null); setObjectiveForm({ code: "", name: "" }); }}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {objectives.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum objetivo cadastrado.</p>
            ) : (
              objectives.map((obj) => (
                <div key={obj.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group">
                  <div className="flex items-center gap-2 min-w-0">
                    {obj.code && (
                      <Badge variant="outline" className="text-xs shrink-0">{obj.code}</Badge>
                    )}
                    <span className="text-sm truncate">{obj.name}</span>
                  </div>
                  <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditingObjective(obj);
                        setObjectiveForm({ code: obj.code ?? "", name: obj.name });
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteObjective(obj.id)}
                      disabled={deleteObjective.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setObjectivesDialog(false)}>Fechar</Button>
        </DialogFooter>
      </Dialog>

      <CorporateCreateDialog
        open={corporateCreateOpen}
        onClose={() => setCorporateCreateOpen(false)}
        orgId={orgId}
        year={year}
        indicators={indicators}
        childGoals={new Map(yearRows.map((r) => [r.indicator.id, r.yearConfig.goal ?? null]))}
      />
    </div>
  );
}
