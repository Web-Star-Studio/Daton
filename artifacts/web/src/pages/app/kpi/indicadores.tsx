import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Target, Trash2, X } from "lucide-react";
import {
  getListOrgUsersQueryKey,
  useListOrgUsers,
  useListUnits,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableStringSelect } from "@/components/ui/searchable-string-select";
import { Select } from "@/components/ui/select";
import { YearPicker } from "@/components/ui/year-picker";
import { FormulaBuilder } from "@/components/kpi/formula-builder";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  KPI_CATEGORIES,
  KPI_NORMS,
  PERIODICITY_LABELS,
  type KpiIndicator,
  type KpiObjective,
  type KpiYearRow,
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
  formulaToNaturalText,
  parseNaturalFormula,
  validateFormula,
} from "@/lib/formula-evaluator";
import type { FeedFilter, StatusFilter } from "./_components/summary-tiles";
import { ObjectiveSection } from "./_components/objective-section";
import { getIndicatorStatus, type CardStatus } from "./_components/indicator-card";

const DEFAULT_YEAR = new Date().getFullYear();

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
  responsibleUserName: string;
  responsibleUserId: number | null;
  measureUnit: string;
  direction: "up" | "down";
  periodicity: "monthly" | "quarterly" | "semiannual" | "annual" | "monthly_15d" | "monthly_45d";
  category: string;
  norms: string[];
  objectiveId: string;
  goal: string;
};

const defaultIndicatorForm = (): IndicatorFormData => ({
  name: "",
  formulaText: "",
  unit: "",
  responsibleUserName: "",
  responsibleUserId: null,
  measureUnit: "",
  direction: "up",
  periodicity: "monthly",
  category: "",
  norms: [],
  objectiveId: "",
  goal: "",
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
    responsibleUserName: ind.responsibleUserName ?? ind.responsible ?? "",
    responsibleUserId: ind.responsibleUserId ?? null,
    measureUnit: ind.measureUnit ?? "",
    direction: ind.direction as "up" | "down",
    periodicity: ind.periodicity as IndicatorFormData["periodicity"],
    category: ind.category ?? "",
    norms: ind.norms ?? [],
    objectiveId:
      yearRow?.yearConfig.objectiveId != null ? String(yearRow.yearConfig.objectiveId) : "",
    goal: yearRow?.yearConfig.goal != null ? String(yearRow.yearConfig.goal) : "",
  };
}

export default function KpiIndicadoresPage() {
  const { organization } = useAuth();
  const orgId = organization!.id;

  usePageTitle("Indicadores");
  usePageSubtitle("Cadastro de KPIs e objetivos estratégicos");

  const [indicatorDialog, setIndicatorDialog] = useState(false);
  const [objectivesDialog, setObjectivesDialog] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<KpiIndicator | null>(null);
  const [indicatorForm, setIndicatorForm] = useState<IndicatorFormData>(defaultIndicatorForm());
  const [deleteConfirm, setDeleteConfirm] = useState<KpiIndicator | null>(null);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [searchQuery, setSearchQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [objectiveFilter, setObjectiveFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("");
  const [focusedIndicatorId, setFocusedIndicatorId] = useState<number | null>(null);

  const [objectiveForm, setObjectiveForm] = useState({ code: "", name: "" });
  const [editingObjective, setEditingObjective] = useState<KpiObjective | null>(null);

  const { data: indicators = [], isLoading } = useKpiIndicators(orgId);
  const { data: objectives = [] } = useKpiObjectives(orgId);
  const { data: yearRows = [] } = useKpiYearData(orgId, year);
  const { data: orgUnits = [] } = useListUnits(orgId);

  const { data: orgUsersData, isLoading: orgUsersLoading } = useListOrgUsers(orgId, {
    query: {
      queryKey: getListOrgUsersQueryKey(orgId),
      enabled: !!orgId,
      staleTime: 60_000,
    },
  });

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
      <HeaderActionButton
        label="Novo Indicador"
        icon={<Plus className="h-4 w-4" />}
        onClick={() => {
          setEditingIndicator(null);
          setIndicatorForm(defaultIndicatorForm());
          setIndicatorDialog(true);
        }}
      />
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

  const feedCounts = useMemo(() => {
    let fed = 0;
    let overdue = 0;
    for (const ind of indicatorsForYear) {
      const row = yearRows.find((r) => r.indicator.id === ind.id);
      if (!row) continue;
      if (row.feedStatus === "overdue") overdue += 1;
      else fed += 1;
    }
    return { fed, overdue };
  }, [indicatorsForYear, yearRows]);

  const filteredIndicators = indicatorsForYear.filter((ind) => {
    const matchesSearch = ind.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUnit = !unitFilter || (ind.unit ?? "") === unitFilter;
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
    const matchesFeed =
      !feedFilter || (yearRows.find((r) => r.indicator.id === ind.id)?.feedStatus ?? "fed") === feedFilter;
    return (
      matchesSearch &&
      matchesUnit &&
      matchesObjective &&
      matchesResponsible &&
      matchesStatus &&
      matchesFeed
    );
  });

  const hasActiveFilters =
    !!searchQuery ||
    !!unitFilter ||
    !!objectiveFilter ||
    !!responsibleFilter ||
    !!statusFilter ||
    !!feedFilter;
  const clearFilters = () => {
    setSearchQuery("");
    setUnitFilter("");
    setObjectiveFilter("");
    setResponsibleFilter("");
    setStatusFilter("");
    setFeedFilter("");
  };

  const groupMap = new Map<number | null, KpiIndicator[]>();
  for (const ind of filteredIndicators) {
    const row = yearRows.find((r) => r.indicator.id === ind.id);
    const objId = row?.yearConfig?.objectiveId ?? null;
    if (!groupMap.has(objId)) groupMap.set(objId, []);
    groupMap.get(objId)!.push(ind);
  }
  const groupedIndicators = [...groupMap.keys()]
    .sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      const oa = objectives.find((o) => o.id === a);
      const ob = objectives.find((o) => o.id === b);
      return (oa?.code ?? oa?.name ?? "").localeCompare(ob?.code ?? ob?.name ?? "");
    })
    .map((objId) => ({
      objective: objId != null ? (objectives.find((o) => o.id === objId) ?? null) : null,
      indicators: groupMap.get(objId)!,
    }));

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
    const measurement = buildMeasurementLabel(parsed.variables, parsed.expression);
    try {
      if (editingIndicator) {
        await updateIndicator.mutateAsync({ orgId, indicatorId: editingIndicator.id, data: {
          name: indicatorForm.name,
          measurement,
          formulaVariables: parsed.variables,
          formulaExpression: parsed.expression,
          unit: indicatorForm.unit || undefined,
          responsibleUserId: indicatorForm.responsibleUserId,
          measureUnit: indicatorForm.measureUnit || undefined,
          direction: indicatorForm.direction,
          periodicity: indicatorForm.periodicity,
          category: indicatorForm.category || null,
          norms: indicatorForm.norms,
        }});
        await upsertYearConfig.mutateAsync({
          orgId,
          indicatorId: editingIndicator.id,
          year: year,
          data: {
            goal: indicatorForm.goal ? parseFloat(indicatorForm.goal) : null,
            objectiveId: indicatorForm.objectiveId ? parseInt(indicatorForm.objectiveId) : null,
          },
        });
        toast({ title: "Indicador atualizado" });
      } else {
        const created = await createIndicator.mutateAsync({
          orgId,
          data: {
            name: indicatorForm.name,
            measurement,
            formulaVariables: parsed.variables,
            formulaExpression: parsed.expression,
            unit: indicatorForm.unit || undefined,
            responsibleUserId: indicatorForm.responsibleUserId ?? undefined,
            measureUnit: indicatorForm.measureUnit || undefined,
            direction: indicatorForm.direction,
            periodicity: indicatorForm.periodicity,
            category: indicatorForm.category || undefined,
            norms: indicatorForm.norms,
          },
        });
        if (indicatorForm.goal || indicatorForm.objectiveId) {
          await upsertYearConfig.mutateAsync({
            orgId,
            indicatorId: created.id,
            year: year,
            data: {
              goal: indicatorForm.goal ? parseFloat(indicatorForm.goal) : null,
              objectiveId: indicatorForm.objectiveId ? parseInt(indicatorForm.objectiveId) : null,
            },
          });
        }
        toast({ title: "Indicador criado" });
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
    setFeedFilter("");
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

  return (
    <div className="p-6 space-y-4">
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
          {hasUnlinkedIndicators && <option value="none">Sem objetivo vinculado</option>}
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
          <option value="green">Na meta ({statusCounts.green})</option>
          <option value="yellow">Atenção ({statusCounts.yellow})</option>
          <option value="red">Fora da meta ({statusCounts.red})</option>
          <option value="nodata">Sem dados ({statusCounts.nodata})</option>
        </Select>
        <Select
          value={feedFilter}
          onChange={(e) => setFeedFilter(e.target.value as FeedFilter)}
          className="w-44"
        >
          <option value="">Todo o lançamento</option>
          <option value="fed">Alimentados ({feedCounts.fed})</option>
          <option value="overdue">Vencidos ({feedCounts.overdue})</option>
        </Select>
        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-xs">
            <X className="mr-1 h-3.5 w-3.5" />
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {/* Indicators grouped by objective */}
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
        <div className="space-y-6">
          {groupedIndicators.map((group) => (
            <ObjectiveSection
              key={group.objective?.id ?? "none"}
              objective={group.objective}
              indicators={group.indicators}
              yearRows={yearRows}
              onEdit={handleEditIndicator}
              onDelete={setDeleteConfirm}
              focusedIndicatorId={focusedIndicatorId}
            />
          ))}
        </div>
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
              {KPI_NORMS.map((norm) => {
                const checked = indicatorForm.norms.includes(norm.code);
                return (
                  <label
                    key={norm.code}
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
                            ? [...f.norms, norm.code]
                            : f.norms.filter((n) => n !== norm.code),
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
              onChange={(v) => setIndicatorForm((f) => ({ ...f, unit: v }))}
              options={orgUnitOptions}
              placeholder="Selecione uma unidade"
              searchPlaceholder="Buscar unidade..."
              emptyMessage="Nenhuma unidade encontrada"
            />
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
            <p className="text-xs text-muted-foreground mb-3">Meta e objetivo para {year} (opcional)</p>
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
              <div className="space-y-1.5">
                <Label>Meta ({year})</Label>
                <Input
                  type="number"
                  value={indicatorForm.goal}
                  onChange={(e) => setIndicatorForm((f) => ({ ...f, goal: e.target.value }))}
                  placeholder="Ex: 95"
                />
              </div>
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
            Esta ação também removerá todos os dados de metas e valores mensais associados a "{deleteConfirm.name}".
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
    </div>
  );
}
