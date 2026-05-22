import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CellRedActionsDialog } from "@/components/kpi/cell-red-actions-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { evaluateFormula, hasValidFormula } from "@/lib/formula-evaluator";
import {
  KPI_CATEGORIES,
  MONTH_LABELS,
  computeMonthlyStats,
  getTrafficLight,
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

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

type StatusInfo = { label: string; box: string; pill: string };

function statusInfo(
  status: "green" | "yellow" | "red" | null,
  hasGoal: boolean,
): StatusInfo {
  if (status === "green")
    return {
      label: "Dentro da meta",
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
      label: "Fora da meta",
      box: "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
      pill: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    };
  return {
    label: hasGoal ? "Aguardando valores" : "Meta não definida",
    box: "border-border bg-muted/40",
    pill: "bg-muted text-muted-foreground",
  };
}

/** Spreadsheet-style year history for the indicator being launched. */
function HistoryPanel({
  row,
  goal,
  direction,
  selectedMonth,
  measureUnit,
}: {
  row: KpiYearRow;
  goal: number | null;
  direction: KpiDirection;
  selectedMonth: number;
  measureUnit: string;
}) {
  const monthValues = Array.from(
    { length: 12 },
    (_, i) => row.monthlyValues.find((m) => m.month === i + 1)?.value ?? null,
  );
  const stats = computeMonthlyStats(monthValues, goal, direction);
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground">
          Histórico {CURRENT_YEAR}
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Meta:{" "}
          {goal !== null
            ? `${direction === "down" ? "≤" : "≥"} ${fmt(goal)}${measureUnit ? ` ${measureUnit}` : ""}`
            : "não definida"}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {MONTH_LABELS.map((label, i) => {
          const v = monthValues[i];
          const st = getTrafficLight(v, goal, direction);
          return (
            <div
              key={label}
              className={cn(
                "rounded-md border px-1 py-1 text-center",
                i + 1 === selectedMonth && "ring-2 ring-blue-500",
                v !== null && st ? trafficLightColor(st) : "bg-muted/30",
              )}
            >
              <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </div>
              <div className="text-[11px] font-medium tabular-nums">
                {v !== null ? fmt(v) : "—"}
              </div>
            </div>
          );
        })}
      </div>
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
          <dt className="text-muted-foreground">Progresso da meta</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {stats.progress != null ? `${Math.round(stats.progress)}%` : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function LancarScreen() {
  const { organization } = useAuth();
  const orgId = organization!.id;
  const year = CURRENT_YEAR;

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
  const [racOpen, setRacOpen] = useState(false);

  const selectedRow = useMemo(
    () =>
      selectedId != null
        ? (rows.find((r) => r.indicator.id === selectedId) ?? null)
        : null,
    [rows, selectedId],
  );

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

  const pendentes = filtered.filter((r) => r.feedStatus === "overdue");
  const emDia = filtered.filter((r) => r.feedStatus !== "overdue");
  const hasFilters =
    !!search ||
    !!categoryFilter ||
    !!unitFilter ||
    !!responsibleFilter ||
    !!statusFilter;

  function openForm(row: KpiYearRow) {
    let defaultMonth = CURRENT_MONTH;
    for (let m = CURRENT_MONTH; m >= 1; m--) {
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
          title: "Resultado lançado — fora da meta",
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
                Meta:{" "}
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
                {Array.from({ length: CURRENT_MONTH }, (_, i) => i + 1).map(
                  (m) => (
                    <option key={m} value={String(m)}>
                      {MONTH_FULL[m - 1]} de {year}
                    </option>
                  ),
                )}
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
                    Meta: {fmt(goal)} {measureUnit}
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
               Destacado quando o resultado está fora da meta. */}
            {outOfTarget ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      Resultado fora da meta
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
                      onClick={() => setRacOpen(true)}
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
                onClick={() => setRacOpen(true)}
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
            goal={goal}
            direction={direction}
            selectedMonth={month}
            measureUnit={measureUnit}
          />
        </div>
        {racOpen ? (
          <CellRedActionsDialog
            context={{
              orgId,
              indicatorId: selectedRow.indicator.id,
              indicatorName: selectedRow.indicator.name,
              year,
              month,
              monthlyValueId,
              value: effectiveValue,
              goal,
            }}
            onClose={() => setRacOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  // ─── Queue view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
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
          <option value="green">Na meta</option>
          <option value="yellow">Atenção</option>
          <option value="red">Fora da meta</option>
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
                    <li key={row.indicator.id}>
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
                              ? `Meta: ${fmt(row.yearConfig.goal)} ${row.indicator.measureUnit ?? ""}`.trim()
                              : "Meta não definida"}
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
