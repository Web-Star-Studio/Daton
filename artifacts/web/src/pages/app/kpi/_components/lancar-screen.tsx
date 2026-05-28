import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { YearPicker } from "@/components/ui/year-picker";
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
import { CellRedActionsDialog } from "@/components/kpi/cell-red-actions-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { evaluateFormula, hasValidFormula } from "@/lib/formula-evaluator";
import {
  KPI_CATEGORIES,
  MONTH_LABELS,
  NON_MONTHLY_PERIODICITIES,
  PERIODICITY_LABELS,
  computeMonthlyStats,
  expectedMonths,
  formatKpiNumber,
  getTrafficLight,
  restrictedMonths,
  trafficLightColor,
  useKpiYearData,
  useUpsertKpiValuesWithInvalidation,
  type KpiDirection,
  type KpiYearRow,
} from "@/lib/kpi-client";
import { Sparkline } from "./sparkline";
import { getIndicatorStatus, type CardStatus } from "./indicator-card";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTH_FULL = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const fmt = formatKpiNumber;

type StatusInfo = { label: string; box: string; pill: string };

function statusInfo(
  status: "green" | "yellow" | "red" | null,
  hasGoal: boolean,
): StatusInfo {
  if (status === "green")
    return {
      label: "Dentro da tolerância",
      box: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
      pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    };
  if (status === "yellow")
    return {
      label: "Atenção",
      box: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
      pill: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    };
  if (status === "red")
    return {
      label: "Fora da tolerância",
      box: "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
      pill: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    };
  return {
    label: hasGoal ? "Aguardando valores" : "Tolerância não definida",
    box: "border-border bg-muted/40",
    pill: "bg-muted text-muted-foreground",
  };
}

/** Meses vermelhos (fora da tolerância) ainda sem justificativa nem plano de ação. */
function untreatedRedMonths(row: KpiYearRow): number[] {
  const goal = row.yearConfig.goal ?? null;
  const direction = (row.indicator.direction ?? "up") as KpiDirection;
  // Indicador não-mensal: meses fora da referência não contam como desvio.
  const restrict = restrictedMonths(
    row.indicator.periodicity,
    row.indicator.referenceMonth,
  );
  return row.monthlyValues
    .filter(
      (mv) =>
        mv.value != null &&
        (!restrict || restrict.has(mv.month)) &&
        getTrafficLight(mv.value, goal, direction) === "red" &&
        mv.justificationsCount === 0 &&
        mv.actionPlansCount === 0,
    )
    .map((mv) => mv.month);
}

/** Spreadsheet-style year history for the indicator being launched. */
function HistoryPanel({
  row,
  year,
  maxLaunchableMonth,
  goal,
  direction,
  selectedMonth,
  measureUnit,
  onSelectMonth,
  onClearMonth,
}: {
  row: KpiYearRow;
  year: number;
  /** Último mês que pode receber lançamento (em ano corrente = mês atual). */
  maxLaunchableMonth: number;
  goal: number | null;
  direction: KpiDirection;
  selectedMonth: number;
  measureUnit: string;
  /** Foca o mês no form (cria lançamento se vazio, edita se já tem valor). */
  onSelectMonth: (month: number) => void;
  /** Limpa o valor do mês (deixa em branco) — gatilho do "×" no canto da célula. */
  onClearMonth: (month: number) => void;
}) {
  const monthValues = Array.from(
    { length: 12 },
    (_, i) => row.monthlyValues.find((m) => m.month === i + 1)?.value ?? null,
  );
  const expected = expectedMonths(
    row.indicator.periodicity,
    row.indicator.referenceMonth,
  );
  // restrict = meses que CONTAM (null = todos). Para não-mensal com referência,
  // os meses fora dela ficam travados e são ignorados nos cálculos.
  const restrict = restrictedMonths(
    row.indicator.periodicity,
    row.indicator.referenceMonth,
  );
  const stats = computeMonthlyStats(monthValues, goal, direction, restrict);
  const untreated = new Set(untreatedRedMonths(row));
  const refMonthsLabel = [...expected]
    .sort((a, b) => a - b)
    .map((m) => MONTH_FULL[m - 1])
    .join(", ");
  const periodicityLabel = (
    PERIODICITY_LABELS[
      row.indicator.periodicity as keyof typeof PERIODICITY_LABELS
    ] ?? row.indicator.periodicity
  ).toLowerCase();
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground">
          Histórico {year}
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Tolerância:{" "}
          {goal !== null
            ? `${direction === "down" ? "≤" : "≥"} ${fmt(goal)}${measureUnit ? ` ${measureUnit}` : ""}`
            : "não definida"}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {MONTH_LABELS.map((label, i) => {
          const v = monthValues[i];
          const st = getTrafficLight(v, goal, direction);
          const month = i + 1;
          // Mês fora da referência (indicador não-mensal): travado, ignorado
          // nos cálculos. Se tiver valor, é anomalia (provável erro de carga).
          const locked = !!restrict && !restrict.has(month);
          const isAnomaly = locked && v !== null;
          // Mês lançável: não é futuro E não está travado pela referência.
          const clickable = month <= maxLaunchableMonth && !locked;
          const isExpectedEmpty = v === null && expected.has(month);
          const isUntreatedRed = untreated.has(month);
          const cls = cn(
            "rounded-md border px-1 py-1 text-center",
            month === selectedMonth && !locked && "ring-2 ring-blue-500",
            isAnomaly
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
              : locked
                ? "border-dashed bg-muted/20 text-muted-foreground/40"
                : v !== null && st
                  ? trafficLightColor(st)
                  : isExpectedEmpty
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "bg-muted/30",
            clickable &&
              "cursor-pointer transition hover:ring-2 hover:ring-blue-400",
          );
          const body = (
            <>
              <div className="flex items-center justify-center gap-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
                {isAnomaly ? (
                  <TriangleAlert className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
                ) : isUntreatedRed ? (
                  <TriangleAlert className="h-2.5 w-2.5 text-red-600 dark:text-red-400" />
                ) : null}
              </div>
              <div className="text-[11px] font-medium tabular-nums">
                {v !== null
                  ? fmt(v)
                  : isExpectedEmpty
                    ? "previsto"
                    : locked
                      ? "—"
                      : "—"}
              </div>
            </>
          );
          // Tooltip do mês travado explica por que não dá pra lançar.
          const lockedTitle = isAnomaly
            ? `Valor fora do mês de referência (${refMonthsLabel}) — clique no × para limpar`
            : `Indicador ${periodicityLabel} — lance só em ${refMonthsLabel}`;
          return (
            <div key={label} className="group/cell relative">
              {clickable ? (
                <button
                  type="button"
                  className={cn(cls, "w-full")}
                  onClick={() => onSelectMonth(month)}
                  title={
                    v !== null ? "Editar lançamento" : "Lançar valor neste mês"
                  }
                >
                  {body}
                </button>
              ) : (
                <div
                  className={cls}
                  title={
                    locked
                      ? lockedTitle
                      : "Mês futuro — ainda não disponível"
                  }
                >
                  {body}
                </div>
              )}
              {/* "×" pra limpar o valor do mês (deixa em branco): meses lançáveis
                 com valor salvo (inclusive zero) E anomalias fora da referência. */}
              {v !== null && (clickable || isAnomaly) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearMonth(month);
                  }}
                  title={
                    isAnomaly ? "Limpar valor fora da referência" : "Limpar valor deste mês"
                  }
                  aria-label={`Limpar valor de ${label}`}
                  className="absolute -right-1 -top-1 z-10 rounded-full border bg-card p-0.5 text-muted-foreground opacity-0 shadow-sm transition hover:text-red-600 focus-visible:opacity-100 group-hover/cell:opacity-100 dark:hover:text-red-400"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {untreated.size > 0 ? (
        <p className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {untreated.size} {untreated.size === 1 ? "mês" : "meses"} fora da tolerância
          sem plano de ação — use o botão de justificativa abaixo do resultado.
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          Clique em um mês pra editar o lançamento ou lançar o valor.
        </p>
      )}
      <Sparkline
        values={monthValues}
        goal={goal}
        status={stats.overallStatus ?? "nodata"}
        height={44}
      />
      <dl className="space-y-1 border-t pt-2 text-[11px]">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Média</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {fmt(stats.average)}
            {measureUnit && stats.average !== null ? ` ${measureUnit}` : ""}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Acumulado</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {fmt(stats.accumulated)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Progresso da tolerância</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {stats.progress != null ? `${Math.round(stats.progress)}%` : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function LancarScreen({
  onEditIndicator,
  initialIndicatorId,
  onInitialIndicatorConsumed,
  advanced = false,
  onAdvancedChange,
}: {
  /** Abre o cadastro do indicador (aba Indicadores) para definir o mês de referência. */
  onEditIndicator: (indicatorId: number) => void;
  /**
   * Quando definido, o LancarScreen seleciona esse indicador automaticamente
   * (abrindo o painel de edição) e rola até ele. Usado pelo deep-link vindo
   * do drawer "Explorar Corporativo" e dos badges de composição.
   */
  initialIndicatorId?: number | null;
  /**
   * Chamado uma vez após consumir o `initialIndicatorId` — o pai usa pra
   * resetar o estado de pendingFocus, evitando re-focar a cada re-render.
   */
  onInitialIndicatorConsumed?: () => void;
  /** Estado do toggle "Modo avançado" — controlado pelo pai (kpi-module). */
  advanced?: boolean;
  onAdvancedChange?: (v: boolean) => void;
}) {
  const { organization } = useAuth();
  const orgId = organization!.id;
  // Ano selecionado pela Ana. Default = ano corrente, mas backfill de anos
  // passados é suportado: o backend faz carry-forward de tolerância/objetivo
  // do ano anterior, então indicadores aparecem em qualquer ano sem que
  // alguém precise reabrir o cadastro.
  const [year, setYear] = useState(CURRENT_YEAR);
  // Quantos meses do ano selecionado já viraram "lançáveis": no ano corrente
  // só até o mês atual (CURRENT_MONTH); em anos passados/futuros, todos os 12.
  const maxLaunchableMonth = year === CURRENT_YEAR ? CURRENT_MONTH : 12;

  usePageTitle("Lançar resultado");
  usePageSubtitle("Sua fila de pendências — registre os resultados mensais");

  const { data: rows = [], isLoading } = useKpiYearData(orgId, year);
  const upsertValues = useUpsertKpiValuesWithInvalidation(orgId, year);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<CardStatus | "">("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [directValue, setDirectValue] = useState("");
  const [racMonth, setRacMonth] = useState<number | null>(null);
  // Mês pendente de limpeza (abre o AlertDialog de confirmação).
  const [clearMonth, setClearMonth] = useState<number | null>(null);

  const selectedRow = useMemo(
    () =>
      selectedId != null
        ? (rows.find((r) => r.indicator.id === selectedId) ?? null)
        : null,
    [rows, selectedId],
  );

  // Deep-link: quando o pai (KpiModulePage) entrega um initialIndicatorId,
  // selecionamos esse indicador, rolamos até o cartão dele na lista, e
  // sinalizamos consumo pro pai resetar o pendingFocus.
  useEffect(() => {
    if (initialIndicatorId == null) return;
    // Espera os rows carregarem pra garantir que o indicador existe no ano corrente
    if (rows.length === 0) return;
    const match = rows.find((r) => r.indicator.id === initialIndicatorId);
    if (!match) {
      onInitialIndicatorConsumed?.();
      return;
    }
    setSelectedId(initialIndicatorId);
    // Scroll suave até o cartão; o id é colocado nos <li> das listas abaixo.
    setTimeout(() => {
      const el = document.getElementById(`lancar-ind-${initialIndicatorId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    onInitialIndicatorConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIndicatorId, rows.length]);

  const hasFormula =
    !!selectedRow &&
    hasValidFormula(
      selectedRow.indicator.formulaVariables,
      selectedRow.indicator.formulaExpression,
    );

  // Prefill the form from whatever is already stored for the chosen month.
  useEffect(() => {
    if (!selectedRow) return;
    const mv = selectedRow.monthlyValues.find((m) => m.month === month);
    const next: Record<string, string> = {};
    for (const v of selectedRow.indicator.formulaVariables ?? []) {
      const stored = mv?.inputs?.[v.key];
      next[v.key] = stored == null ? "" : String(stored).replace(".", ",");
    }
    setDraft(next);
    setDirectValue(mv?.value != null ? String(mv.value).replace(".", ",") : "");
  }, [selectedRow, month]);

  const parsedInputs = useMemo(() => {
    const out: Record<string, number | null> = {};
    if (!selectedRow) return out;
    for (const v of selectedRow.indicator.formulaVariables ?? []) {
      const raw = draft[v.key]?.trim().replace(",", ".");
      const n = raw ? Number(raw) : NaN;
      out[v.key] = raw && !Number.isNaN(n) ? n : null;
    }
    return out;
  }, [draft, selectedRow]);

  const computedValue = useMemo<number | null>(() => {
    if (!selectedRow) return null;
    if (hasFormula) {
      return evaluateFormula(
        selectedRow.indicator.formulaExpression,
        parsedInputs,
      );
    }
    const raw = directValue.trim().replace(",", ".");
    const n = raw ? Number(raw) : NaN;
    return raw && !Number.isNaN(n) ? n : null;
  }, [selectedRow, hasFormula, parsedInputs, directValue]);

  const goal = selectedRow?.yearConfig.goal ?? null;
  const direction = (selectedRow?.indicator.direction ?? "up") as KpiDirection;
  const status = getTrafficLight(computedValue, goal, direction);
  const measureUnit = selectedRow?.indicator.measureUnit ?? "";

  // The chosen month may already have a saved value — drives the result box
  // and gates the corrective-action flow (a RAC needs a saved monthly value).
  const savedMonthly =
    selectedRow?.monthlyValues.find((m) => m.month === month) ?? null;
  const monthlyValueId = savedMonthly?.monthlyValueId ?? null;
  const effectiveValue =
    computedValue !== null ? computedValue : (savedMonthly?.value ?? null);
  const effectiveStatus = getTrafficLight(effectiveValue, goal, direction);
  const outOfTarget = effectiveStatus === "red";

  // Meses que o form pode lançar: não-futuros e, p/ indicador não-mensal,
  // só os meses de referência. Fallback p/ todos quando a restrição ainda não
  // tem mês lançável (ex.: referência em dezembro no meio do ano corrente).
  const launchableMonths = useMemo(() => {
    const all = Array.from({ length: maxLaunchableMonth }, (_, i) => i + 1);
    const restrict = selectedRow
      ? restrictedMonths(
          selectedRow.indicator.periodicity,
          selectedRow.indicator.referenceMonth,
        )
      : null;
    const filtered = restrict ? all.filter((m) => restrict.has(m)) : all;
    return filtered.length ? filtered : all;
  }, [selectedRow, maxLaunchableMonth]);

  // Se o mês selecionado caiu fora dos lançáveis (deep-link, troca de
  // indicador), ajusta pro último lançável.
  useEffect(() => {
    if (!selectedRow) return;
    if (!launchableMonths.includes(month)) {
      setMonth(launchableMonths[launchableMonths.length - 1]);
    }
  }, [selectedRow, launchableMonths, month]);

  // Mês para o qual o diálogo de justificativa/RAC está aberto (forma ou histórico).
  const racMonthly =
    racMonth !== null && selectedRow
      ? (selectedRow.monthlyValues.find((m) => m.month === racMonth) ?? null)
      : null;

  // Opções de filtro derivadas dos indicadores do ano.
  const unitOptions = useMemo(
    () =>
      [
        ...new Set(
          rows.map((r) => r.indicator.unit).filter(Boolean) as string[],
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows],
  );
  const responsibleOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      if (r.indicator.responsibleUserId && r.indicator.responsibleUserName) {
        map.set(r.indicator.responsibleUserId, r.indicator.responsibleUserName);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (q && !r.indicator.name.toLowerCase().includes(q)) return false;
        if (categoryFilter && (r.indicator.category ?? "") !== categoryFilter)
          return false;
        if (unitFilter && (r.indicator.unit ?? "") !== unitFilter) return false;
        if (
          responsibleFilter &&
          String(r.indicator.responsibleUserId ?? "") !== responsibleFilter
        )
          return false;
        if (
          statusFilter &&
          getIndicatorStatus(r.indicator, r) !== statusFilter
        )
          return false;
        return true;
      })
      .sort((a, b) => a.indicator.name.localeCompare(b.indicator.name, "pt-BR"));
  }, [rows, search, categoryFilter, unitFilter, responsibleFilter, statusFilter]);

  // Indicador não mensal sem mês de referência → precisa de configuração.
  const needsConfig = (r: KpiYearRow) =>
    NON_MONTHLY_PERIODICITIES.has(r.indicator.periodicity) &&
    !r.indicator.referenceMonth;
  const hasUntreatedRed = (r: KpiYearRow) => untreatedRedMonths(r).length > 0;
  const faltaConfig = filtered.filter(needsConfig);
  const requerAcao = filtered.filter(
    (r) => !needsConfig(r) && hasUntreatedRed(r),
  );
  const pendentes = filtered.filter(
    (r) => !needsConfig(r) && !hasUntreatedRed(r) && r.feedStatus === "overdue",
  );
  const emDia = filtered.filter(
    (r) => !needsConfig(r) && !hasUntreatedRed(r) && r.feedStatus !== "overdue",
  );
  const hasFilters =
    !!search ||
    !!categoryFilter ||
    !!unitFilter ||
    !!responsibleFilter ||
    !!statusFilter;

  function openForm(row: KpiYearRow) {
    // Candidatos = meses lançáveis respeitando a referência (não-mensal só
    // lança nos meses esperados). Começa no mês mais recente sem valor.
    const restrict = restrictedMonths(
      row.indicator.periodicity,
      row.indicator.referenceMonth,
    );
    const candidates = Array.from(
      { length: maxLaunchableMonth },
      (_, i) => i + 1,
    ).filter((m) => !restrict || restrict.has(m));
    let defaultMonth = candidates.length
      ? candidates[candidates.length - 1]
      : maxLaunchableMonth;
    for (let k = candidates.length - 1; k >= 0; k--) {
      const m = candidates[k];
      const mv = row.monthlyValues.find((x) => x.month === m);
      if (mv?.value == null) {
        defaultMonth = m;
        break;
      }
    }
    setSelectedId(row.indicator.id);
    setMonth(defaultMonth);
  }

  async function handleSave() {
    if (!selectedRow) return;
    if (computedValue === null) {
      toast({
        title: "Informe os valores para calcular o resultado",
        variant: "destructive",
      });
      return;
    }
    try {
      await upsertValues.mutateAsync({
        orgId,
        indicatorId: selectedRow.indicator.id,
        year,
        data: {
          values: [
            {
              month,
              value: computedValue,
              inputs: hasFormula ? parsedInputs : {},
            },
          ],
        },
      });
      if (status === "red") {
        // Stay on the form so the highlighted justification / RAC action is
        // visible — the monthly value now exists and can receive a plan.
        toast({
          title: "Resultado lançado — fora da tolerância",
          description:
            "Registre a justificativa e, se necessário, um plano de ação.",
        });
      } else {
        toast({ title: "Resultado lançado" });
        setSelectedId(null);
      }
    } catch {
      toast({ title: "Erro ao lançar o resultado", variant: "destructive" });
    }
  }

  // Limpa o valor de um mês (deixa em branco). Usado pelo "×" das células do
  // histórico — p/ casos como carga de zero importada do Excel em indicador
  // anual onde o mês não deveria ser preenchido. Confirma via AlertDialog
  // (clearMonth guarda o mês pendente de limpeza).
  async function confirmClearMonth() {
    if (!selectedRow || clearMonth === null) return;
    const targetMonth = clearMonth;
    try {
      await upsertValues.mutateAsync({
        orgId,
        indicatorId: selectedRow.indicator.id,
        year,
        data: {
          values: [{ month: targetMonth, value: null, inputs: {} }],
        },
      });
      // Se limpamos o mês que está aberto no form, zera os campos também.
      if (targetMonth === month) {
        setDraft({});
        setDirectValue("");
      }
      toast({ title: "Lançamento removido" });
    } catch {
      toast({ title: "Erro ao remover o lançamento", variant: "destructive" });
    } finally {
      setClearMonth(null);
    }
  }

  const saving = upsertValues.isPending;

  // ─── Form view ─────────────────────────────────────────────────────────────
  if (selectedRow) {
    const s = statusInfo(effectiveStatus, goal !== null);
    return (
      <div className="space-y-4 p-6">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para a fila
        </button>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,560px)_320px]">
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <div className="border-b pb-3">
              <h2 className="text-base font-semibold text-foreground">
                {selectedRow.indicator.name}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tolerância:{" "}
                <span className="font-medium text-foreground/80">
                  {goal !== null
                    ? `${fmt(goal)} ${measureUnit}`.trim()
                    : "não definida"}
                </span>
                {selectedRow.indicator.unit
                  ? ` · ${selectedRow.indicator.unit}`
                  : ""}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Período de referência
              </label>
              <Select
                value={String(month)}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-48"
              >
                {launchableMonths.map((m) => (
                  <option key={m} value={String(m)}>
                    {MONTH_FULL[m - 1]} de {year}
                  </option>
                ))}
              </Select>
            </div>

            {hasFormula ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Fórmula de cálculo
                  </label>
                  <div className="rounded-md bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    {selectedRow.indicator.measurement || "—"}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Valores
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(selectedRow.indicator.formulaVariables ?? []).map((v) => (
                      <div
                        key={v.key}
                        className="rounded-lg bg-muted/50 px-3 py-2"
                      >
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {v.label || v.key}
                        </div>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={draft[v.key] ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [v.key]: e.target.value }))
                          }
                          placeholder="0"
                          className="h-8 border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Resultado do período
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={directValue}
                  onChange={(e) => setDirectValue(e.target.value)}
                  placeholder="Informe o valor apurado"
                />
                <p className="text-[11px] text-muted-foreground">
                  Este indicador não tem fórmula configurada — informe o
                  resultado diretamente.
                </p>
              </div>
            )}

            <div
              className={cn(
                "flex items-center justify-between gap-4 rounded-lg border px-4 py-3",
                s.box,
              )}
            >
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Resultado
                </div>
                <div className="text-2xl font-semibold tabular-nums text-foreground">
                  {effectiveValue !== null
                    ? `${fmt(effectiveValue)} ${measureUnit}`.trim()
                    : "—"}
                </div>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    s.pill,
                  )}
                >
                  {s.label}
                </span>
                {goal !== null ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Tolerância: {fmt(goal)} {measureUnit}
                  </div>
                ) : null}
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Salvar lançamento
            </Button>

            {/* Justificativa / plano de ação — abre o diálogo já existente.
               Destacado quando o resultado está fora da tolerância. */}
            {outOfTarget ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      Resultado fora da tolerância
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-700/90 dark:text-amber-300/80">
                      Registre a justificativa do desvio e, se necessário, um
                      plano de ação corretiva (ISO 9.1.3 · 10.1).
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 border-amber-300 bg-amber-100/60 text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25"
                      disabled={monthlyValueId === null}
                      onClick={() => setRacMonth(month)}
                    >
                      <ClipboardList className="mr-1.5 h-4 w-4" />
                      Justificativa e plano de ação
                    </Button>
                    {monthlyValueId === null ? (
                      <p className="mt-1 text-[10px] text-amber-700/70 dark:text-amber-300/60">
                        Salve o lançamento para registrar.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-muted-foreground"
                disabled={monthlyValueId === null}
                onClick={() => setRacMonth(month)}
                title={
                  monthlyValueId === null
                    ? "Salve o lançamento para registrar"
                    : undefined
                }
              >
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                Justificativa / plano de ação
              </Button>
            )}
          </div>
          <HistoryPanel
            row={selectedRow}
            year={year}
            maxLaunchableMonth={maxLaunchableMonth}
            goal={goal}
            direction={direction}
            selectedMonth={month}
            measureUnit={measureUnit}
            onSelectMonth={setMonth}
            onClearMonth={setClearMonth}
          />
        </div>
        {racMonth !== null ? (
          <CellRedActionsDialog
            context={{
              orgId,
              indicatorId: selectedRow.indicator.id,
              indicatorName: selectedRow.indicator.name,
              year,
              month: racMonth,
              monthlyValueId: racMonthly?.monthlyValueId ?? null,
              value: racMonthly?.value ?? null,
              goal,
            }}
            onClose={() => setRacMonth(null)}
          />
        ) : null}
        <AlertDialog
          open={clearMonth !== null}
          onOpenChange={(open) => {
            if (!open) setClearMonth(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Limpar lançamento?</AlertDialogTitle>
              <AlertDialogDescription>
                O valor de{" "}
                <span className="font-medium text-foreground">
                  {clearMonth !== null ? MONTH_FULL[clearMonth - 1] : ""} de{" "}
                  {year}
                </span>{" "}
                será removido e o mês voltará a ficar em branco. Esta ação não
                pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void confirmClearMonth();
                }}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                Limpar lançamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ─── Queue view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <YearPicker
          value={year}
          onChange={(y) => {
            setYear(y);
            // Se o user tinha um indicador aberto, fecha — a tela volta pra
            // fila do novo ano. Evita confusão de "estou editando 2025 mas
            // o título mostra 2026".
            setSelectedId(null);
          }}
        />
        <Input
          placeholder="Buscar indicador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
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
          className="w-44"
        >
          <option value="">Todas as unidades</option>
          {unitOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Select
          value={responsibleFilter}
          onChange={(e) => setResponsibleFilter(e.target.value)}
          className="w-48"
        >
          <option value="">Todos os responsáveis</option>
          {responsibleOptions.map(([id, name]) => (
            <option key={id} value={String(id)}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CardStatus | "")}
          className="w-40"
        >
          <option value="">Todos os status</option>
          <option value="green">Na tolerância</option>
          <option value="yellow">Atenção</option>
          <option value="red">Fora da tolerância</option>
          <option value="nodata">Sem dados</option>
        </Select>
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={() => {
              setSearch("");
              setCategoryFilter("");
              setUnitFilter("");
              setResponsibleFilter("");
              setStatusFilter("");
            }}
          >
            Limpar
          </Button>
        ) : null}
        {onAdvancedChange ? (
          <label
            className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
            title="Alterna para a planilha completa (visão antiga, edição em massa por célula)"
          >
            <Switch
              checked={advanced}
              onCheckedChange={onAdvancedChange}
              aria-label="Modo avançado"
            />
            Modo avançado
          </label>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? `Nenhum indicador configurado para ${year}.`
            : "Nenhum indicador encontrado com os filtros aplicados."}
        </div>
      ) : (
        <div className="space-y-5">
          {faltaConfig.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
              <div className="mb-1 flex items-center gap-2">
                <TriangleAlert
                  className="h-4 w-4 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Falta o mês de referência
                </h3>
                <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/25 dark:text-amber-200">
                  {faltaConfig.length}
                </span>
              </div>
              <p className="mb-2.5 text-[11px] text-amber-700/90 dark:text-amber-300/80">
                Indicadores não mensais sem mês de referência — clique para
                definir no cadastro.
              </p>
              <ul className="space-y-2">
                {faltaConfig.map((row) => (
                  <li key={row.indicator.id} id={`lancar-ind-${row.indicator.id}`} className="scroll-mt-6">
                    <button
                      type="button"
                      onClick={() => onEditIndicator(row.indicator.id)}
                      className="group flex w-full items-center gap-3 rounded-lg border border-amber-200 bg-card px-4 py-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50/60 dark:border-amber-500/30 dark:hover:bg-amber-500/10"
                    >
                      <TriangleAlert
                        className="h-4 w-4 shrink-0 text-amber-500"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-foreground">
                          {row.indicator.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {PERIODICITY_LABELS[
                            row.indicator
                              .periodicity as keyof typeof PERIODICITY_LABELS
                          ] ?? row.indicator.periodicity}
                          {row.indicator.unit ? ` · ${row.indicator.unit}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        Definir mês →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {requerAcao.length > 0 ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-500/10">
              <div className="mb-1 flex items-center gap-2">
                <TriangleAlert
                  className="h-4 w-4 text-red-600 dark:text-red-400"
                  aria-hidden
                />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-red-800 dark:text-red-300">
                  Requer plano de ação
                </h3>
                <span className="rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-500/25 dark:text-red-200">
                  {requerAcao.length}
                </span>
              </div>
              <p className="mb-2.5 text-[11px] text-red-700/90 dark:text-red-300/80">
                Indicadores com mês fora da tolerância ainda sem justificativa nem
                plano de ação — clique para tratar.
              </p>
              <ul className="space-y-2">
                {requerAcao.map((row) => {
                  const reds = untreatedRedMonths(row);
                  return (
                    <li key={row.indicator.id} id={`lancar-ind-${row.indicator.id}`} className="scroll-mt-6">
                      <button
                        type="button"
                        onClick={() => openForm(row)}
                        className="group flex w-full items-center gap-3 rounded-lg border border-red-200 bg-card px-4 py-3 text-left transition-colors hover:border-red-300 hover:bg-red-50/60 dark:border-red-500/30 dark:hover:bg-red-500/10"
                      >
                        <TriangleAlert
                          className="h-4 w-4 shrink-0 text-red-500"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                              {row.indicator.name}
                            </span>
                            {row.indicator.unit ? (
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                · {row.indicator.unit}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-[11px] text-red-700 dark:text-red-300">
                            {reds.length} {reds.length === 1 ? "mês" : "meses"}{" "}
                            fora da tolerância:{" "}
                            {reds.map((m) => MONTH_LABELS[m - 1]).join(", ")}
                          </div>
                          {row.indicator.responsibleUserName ? (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Responsável: {row.indicator.responsibleUserName}
                            </div>
                          ) : null}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {(
            [
              {
                key: "pend",
                title: "Pendentes",
                items: pendentes,
                dot: "bg-red-500",
                badge:
                  "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
                empty: "Nenhum indicador vencido — tudo lançado.",
              },
              {
                key: "ok",
                title: "Em dia",
                items: emDia,
                dot: "bg-emerald-500",
                badge:
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                empty: "Nenhum indicador em dia.",
              },
            ] as const
          ).map((section) => (
            <div key={section.key}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn("h-2 w-2 rounded-full", section.dot)}
                  aria-hidden
                />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    section.badge,
                  )}
                >
                  {section.items.length}
                </span>
              </div>
              {section.items.length === 0 ? (
                <p className="px-1 text-[11px] text-muted-foreground">
                  {section.empty}
                </p>
              ) : (
                <ul className="space-y-2">
                  {section.items.map((row) => (
                    <li key={row.indicator.id} id={`lancar-ind-${row.indicator.id}`} className="scroll-mt-6">
                      <button
                        type="button"
                        onClick={() => openForm(row)}
                        className="group flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-foreground/15 hover:bg-muted/40"
                      >
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            section.dot,
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium text-foreground">
                            {row.indicator.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {row.yearConfig.goal !== null
                              ? `Tolerância: ${fmt(row.yearConfig.goal)} ${row.indicator.measureUnit ?? ""}`.trim()
                              : "Tolerância não definida"}
                            {row.indicator.unit
                              ? ` · ${row.indicator.unit}`
                              : ""}
                            {row.indicator.category
                              ? ` · ${row.indicator.category}`
                              : ""}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
