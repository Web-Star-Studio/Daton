import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Pencil, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  RELEVANCE_SCALE_LEGEND,
  SWOT_DECISION_SHORT,
  SWOT_ENVIRONMENT_LABELS,
  SWOT_OBJECTIVE_SOURCE_LABELS,
  SWOT_TYPE_PLURAL,
  performanceAxisLabel,
  performanceScaleLegend,
  swotDecision,
  swotDecisionBadgeColor,
  swotResult,
  swotResultColor,
  swotRiskBand,
  swotTypeBadgeColor,
  swotTypeText,
  swotTypeTint,
  type SwotFactor,
  type SwotFactorType,
  type SwotRiskBand,
} from "@/lib/swot-client";

type ObjectiveRefMap = Map<string, { label: string; source: "swot" | "kpi" }>;

type Props = {
  type: SwotFactorType;
  factors: SwotFactor[];
  objectiveByRef: ObjectiveRefMap;
  unitNameById: Map<number, string>;
  canWrite: boolean;
  onBack: () => void;
  onEdit: (f: SwotFactor) => void;
  onCreateAction: (f: SwotFactor) => void;
};

const BAND_LABEL: Record<SwotRiskBand, string> = { baixo: "Baixo", alto: "Alto", extremo: "Extremo" };
const BAND_ORDER: SwotRiskBand[] = ["extremo", "alto", "baixo"];

/** Fundo da célula da matriz: tint por faixa de risco quando há fatores; neutra (tracejada) quando vazia. */
function cellClass(band: SwotRiskBand, isStrength: boolean, active: boolean, populated: boolean): string {
  if (!populated) {
    return cn("border-dashed border-border bg-muted/30 text-muted-foreground", active && "ring-2 ring-ring");
  }
  const map: Record<SwotRiskBand, string> = {
    baixo: "border-emerald-200/60 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/[0.10] dark:text-emerald-300",
    alto: "border-amber-200/70 bg-amber-100 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300",
    extremo: "border-red-200/70 bg-red-100 text-red-900 dark:border-red-500/20 dark:bg-red-500/15 dark:text-red-300",
  };
  // Força: grade uniformemente "já positivo" (emerald), sem semântica de risco.
  const base = isStrength ? map.baixo : map[band];
  return cn(base, active && "ring-2 ring-ring");
}

function barClass(band: SwotRiskBand): string {
  return { baixo: "bg-emerald-500/70", alto: "bg-amber-500/80", extremo: "bg-red-500/80" }[band];
}

/** Cor sólida da barra de distribuição por perspectiva (classes literais p/ Tailwind). */
function typeBarBg(type: SwotFactorType): string {
  switch (type) {
    case "strength": return "bg-emerald-500/70";
    case "weakness": return "bg-rose-500/70";
    case "opportunity": return "bg-blue-500/70";
    case "threat": return "bg-amber-500/70";
  }
}

export function SwotQuadrantDashboard({
  type,
  factors,
  objectiveByRef,
  unitNameById,
  canWrite,
  onBack,
  onEdit,
  onCreateAction,
}: Props) {
  const isStrength = type === "strength";

  // Deriva resultado/decisão/faixa uma vez.
  const scored = useMemo(
    () =>
      factors.map((f) => {
        const result = swotResult(f.performance, f.relevance);
        return { ...f, result, decision: swotDecision(f.type, result), band: swotRiskBand(result) };
      }),
    [factors],
  );

  // Agregações base (não reagem ao filtro — referência estável).
  const agg = useMemo(() => {
    const total = scored.length;
    const requer = scored.filter((f) => f.decision === "requer").length;
    const extremo = scored.filter((f) => f.band === "extremo").length;
    const avg = total ? scored.reduce((s, f) => s + f.result, 0) / total : 0;
    const cellCount = new Map<string, number>();
    const byBand: Record<SwotRiskBand, number> = { baixo: 0, alto: 0, extremo: 0 };
    const byPersp = new Map<string, number>();
    for (const f of scored) {
      cellCount.set(`${f.performance}:${f.relevance}`, (cellCount.get(`${f.performance}:${f.relevance}`) ?? 0) + 1);
      byBand[f.band] += 1;
      const p = f.perspective || "Sem perspectiva";
      byPersp.set(p, (byPersp.get(p) ?? 0) + 1);
    }
    return { total, requer, extremo, avg, cellCount, byBand, byPersp };
  }, [scored]);

  // ─── Filter bus ──────────────────────────────────────────────────────────
  const [cell, setCell] = useState<{ p: number; r: number } | null>(null);
  const [riskFilter, setRiskFilter] = useState<SwotRiskBand | null>(null);
  const [perspFilter, setPerspFilter] = useState<string | null>(null);
  const [distMode, setDistMode] = useState<"risk" | "perspective">(isStrength ? "perspective" : "risk");

  const filtered = useMemo(
    () =>
      scored
        .filter((f) => {
          if (cell && (f.performance !== cell.p || f.relevance !== cell.r)) return false;
          if (riskFilter && f.band !== riskFilter) return false;
          if (perspFilter && (f.perspective || "Sem perspectiva") !== perspFilter) return false;
          return true;
        })
        .sort((a, b) => b.result - a.result),
    [scored, cell, riskFilter, perspFilter],
  );

  const hasFilter = cell !== null || riskFilter !== null || perspFilter !== null;
  function clearAll() { setCell(null); setRiskFilter(null); setPerspFilter(null); }

  // Limpa seleções que deixaram de existir após edição/exclusão de fatores
  // (célula esvaziada vira não-clicável; perspectiva some da distribuição).
  useEffect(() => {
    if (cell && !agg.cellCount.get(`${cell.p}:${cell.r}`)) setCell(null);
    if (perspFilter && !agg.byPersp.has(perspFilter)) setPerspFilter(null);
  }, [agg, cell, perspFilter]);

  const perspEntries = useMemo(
    () => [...agg.byPersp.entries()].sort((a, b) => b[1] - a[1]),
    [agg.byPersp],
  );
  const maxPersp = perspEntries.reduce((m, [, n]) => Math.max(m, n), 0);

  return (
    <div className="space-y-5">
      {/* 1. Header */}
      <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-4", swotTypeTint(type))}>
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        <span className={cn("h-2.5 w-2.5 rounded-full bg-current", swotTypeText(type))} />
        <div className="min-w-0">
          <h2 className={cn("text-lg font-semibold leading-none", swotTypeText(type))}>{SWOT_TYPE_PLURAL[type]}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {performanceAxisLabel(type)} × Relevância ·{" "}
            {isStrength ? "fatores já positivos" : "resultado ≥ 8 requer ação"}
          </p>
        </div>
        <Badge variant="secondary" className={cn("ml-auto text-[10px]", swotTypeBadgeColor(type))}>
          {agg.total} fator(es)
        </Badge>
      </div>

      {/* 2. KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard type={type} label="Total" value={agg.total} />
        <StatCard
          type={type}
          label={isStrength ? "Já positivos" : "Requer ação"}
          value={isStrength ? agg.total : agg.requer}
          valueClass={!isStrength && agg.requer > 0 ? "text-red-600 dark:text-red-400" : undefined}
        />
        <div className={cn("rounded-xl border-l-4 bg-card p-4 shadow-sm", swotTypeBorderLeft(type))}>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resultado médio</div>
          <div className={cn(
            "mt-1 text-3xl font-semibold tabular-nums",
            isStrength ? "text-emerald-600 dark:text-emerald-400" : swotResultColor(Math.round(agg.avg)),
          )}>
            {agg.avg.toFixed(1)}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", isStrength ? "bg-emerald-500/70" : barClass(swotRiskBand(Math.round(agg.avg))))}
              style={{ width: `${(agg.avg / 16) * 100}%` }}
            />
          </div>
        </div>
        <StatCard
          type={type}
          label={isStrength ? "Alto impacto" : "Risco extremo"}
          value={agg.extremo}
          valueClass={
            isStrength
              ? "text-emerald-600 dark:text-emerald-400"
              : agg.extremo > 0 ? "text-red-600 dark:text-red-400" : undefined
          }
          sub="resultado 13–16"
        />
      </div>

      {/* 3. Hero matrix + distribution */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Matrix */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold">Matriz de prioridade</div>
          <div className="grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] gap-1.5">
            {[4, 3, 2, 1].map((r) => (
              <RowOfMatrix
                key={r}
                relev={r}
                type={type}
                isStrength={isStrength}
                cellCount={agg.cellCount}
                selected={cell}
                onSelect={(p) => setCell((c) => (c && c.p === p && c.r === r ? null : { p, r }))}
              />
            ))}
            {/* eixo X */}
            <div />
            {[1, 2, 3, 4].map((p) => {
              const leg = performanceScaleLegend(type).find((s) => s.value === p);
              return (
                <div key={p} className="px-1 pt-1 text-center text-[10px] leading-tight text-muted-foreground">
                  <div className="font-semibold text-foreground/70">{p}</div>
                  <div className="truncate" title={leg?.label}>{leg?.label}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Eixo X: {performanceAxisLabel(type)} (1–4) · Eixo Y: Relevância (1–4) · cada célula = resultado e nº de fatores.
          </p>
        </div>

        {/* Distribution */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Distribuição</span>
            {!isStrength && (
              <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-[11px]">
                {(["risk", "perspective"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={distMode === m}
                    onClick={() => {
                      setDistMode(m);
                      if (m === "risk") setPerspFilter(null);
                      else setRiskFilter(null);
                    }}
                    className={cn(
                      "rounded-md px-2 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      distMode === m ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {m === "risk" ? "Risco" : "Perspectiva"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {distMode === "risk" && !isStrength ? (
            <div className="space-y-2.5">
              {BAND_ORDER.map((b) => {
                const n = agg.byBand[b];
                const pct = agg.total ? (n / agg.total) * 100 : 0;
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={riskFilter === b}
                    onClick={() => setRiskFilter((cur) => (cur === b ? null : b))}
                    className="group w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className={cn(riskFilter === b && "font-semibold")}>{BAND_LABEL[b]}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full transition-all", barClass(b))} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {perspEntries.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">Sem dados</p>
              ) : (
                perspEntries.map(([p, n]) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={perspFilter === p}
                    onClick={() => setPerspFilter((cur) => (cur === p ? null : p))}
                    className="w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className={cn("truncate", perspFilter === p && "font-semibold")} title={p}>{p}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all", typeBarBg(type))}
                        style={{ width: `${maxPersp ? (n / maxPersp) * 100 : 0}%` }}
                      />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Actionable list (filtered) */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Fatores</span>
          <span className="text-xs text-muted-foreground">({filtered.length})</span>
          {hasFilter && (
            <div className="flex flex-wrap items-center gap-1.5">
              {cell && <FilterChip label={`Célula ${cell.p}×${cell.r} · resultado ${cell.p * cell.r}`} onClear={() => setCell(null)} />}
              {riskFilter && <FilterChip label={`Risco ${BAND_LABEL[riskFilter]}`} onClear={() => setRiskFilter(null)} />}
              {perspFilter && <FilterChip label={perspFilter} onClear={() => setPerspFilter(null)} />}
              <button type="button" onClick={clearAll} className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                limpar tudo
              </button>
            </div>
          )}
        </div>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum fator {hasFilter ? "para este filtro" : "cadastrado"}.</p>
        ) : (
          <ScrollArea className="-mr-3 max-h-[420px] pr-3">
            <ul className="space-y-2">
              {filtered.map((f) => {
                const objRef = f.objectiveSource && f.objectiveSourceId !== null ? `${f.objectiveSource}:${f.objectiveSourceId}` : null;
                const obj = objRef ? objectiveByRef.get(objRef) : null;
                return (
                  <li key={f.id} className="rounded-lg border bg-background p-3 transition-colors hover:border-primary/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug">{f.description}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>{f.unitId !== null ? (unitNameById.get(f.unitId) ?? "—") : "Corporativo"}</span>
                          {f.perspective && <span>· {f.perspective}</span>}
                          <span>· {SWOT_ENVIRONMENT_LABELS[f.environment]}</span>
                          {obj
                            ? <span>· {SWOT_OBJECTIVE_SOURCE_LABELS[obj.source]}: {obj.label}</span>
                            : objRef && <span className="italic">· objetivo removido</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cn("text-lg font-semibold leading-none tabular-nums", swotResultColor(f.result))}>{f.result}</span>
                        <Badge variant="secondary" className={cn("text-[10px]", swotDecisionBadgeColor(f.decision))}>{SWOT_DECISION_SHORT[f.decision]}</Badge>
                      </div>
                    </div>
                    {canWrite && (
                      <div className="mt-2.5 flex gap-1.5">
                        {f.decision === "requer" && (
                          <Button size="sm" variant="outline" onClick={() => onCreateAction(f)}>
                            <Plus className="mr-1 h-3.5 w-3.5" /> Criar ação
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => onEdit(f)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function StatCard({
  type,
  label,
  value,
  valueClass,
  sub,
}: {
  type: SwotFactorType;
  label: string;
  value: number;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className={cn("rounded-xl border-l-4 bg-card p-4 shadow-sm", swotTypeBorderLeft(type))}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-3xl font-semibold tabular-nums", valueClass ?? "text-foreground")}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function swotTypeBorderLeft(type: SwotFactorType): string {
  switch (type) {
    case "strength": return "border-l-emerald-400 dark:border-l-emerald-500/60";
    case "weakness": return "border-l-rose-400 dark:border-l-rose-500/60";
    case "opportunity": return "border-l-blue-400 dark:border-l-blue-500/60";
    case "threat": return "border-l-amber-400 dark:border-l-amber-500/60";
  }
}

function RowOfMatrix({
  relev,
  type,
  isStrength,
  cellCount,
  selected,
  onSelect,
}: {
  relev: number;
  type: SwotFactorType;
  isStrength: boolean;
  cellCount: Map<string, number>;
  selected: { p: number; r: number } | null;
  onSelect: (p: number) => void;
}) {
  const relevLeg = RELEVANCE_SCALE_LEGEND.find((s) => s.value === relev);
  return (
    <>
      <div className="flex flex-col justify-center pr-1 text-right text-[10px] leading-tight text-muted-foreground">
        <span className="font-semibold text-foreground/70">{relev}</span>
        <span className="truncate" title={relevLeg?.label}>{relevLeg?.label}</span>
      </div>
      {[1, 2, 3, 4].map((p) => {
        const result = p * relev;
        const band = swotRiskBand(result);
        const n = cellCount.get(`${p}:${relev}`) ?? 0;
        const active = selected?.p === p && selected?.r === relev;
        const clickable = n > 0;
        return (
          <button
            key={p}
            type="button"
            disabled={!clickable}
            aria-pressed={active}
            onClick={() => onSelect(p)}
            title={`${performanceAxisLabel(type)} ${p}, Relevância ${relev} · resultado ${result} · ${n} fator(es)`}
            className={cn(
              "flex min-h-[58px] flex-col items-center justify-center rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              cellClass(band, isStrength, active, clickable),
              clickable && "cursor-pointer hover:ring-2 hover:ring-ring/60",
            )}
          >
            <span className="text-base font-semibold tabular-nums">{n || ""}</span>
            <span className="text-[9px] opacity-70">{result}</span>
          </button>
        );
      })}
    </>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] text-primary">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remover filtro ${label}`} className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-primary/10">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
