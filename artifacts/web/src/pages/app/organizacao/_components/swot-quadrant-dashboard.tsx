import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SWOT_TYPE_PLURAL,
  performanceAxisLabel,
  swotDecision,
  swotResult,
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

type ScoredFactor = SwotFactor & {
  result: number;
  decision: ReturnType<typeof swotDecision>;
  band: SwotRiskBand;
};

type PerspStat = {
  persp: string;
  total: number;
  requer: number;
  byBand: Record<SwotRiskBand, number>;
};

const BAND_ORDER: SwotRiskBand[] = ["extremo", "alto", "baixo"];
const MAX_PERSP = 8; // máx. de áreas exibidas na aba "Por área".

/** Scroll sutil, nativo e discoverable (barra fina visível quando há overflow). */
const SCROLL_CLS =
  "overflow-y-auto [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border";

/** Rótulo da faixa: risco (Fraqueza/Ameaça/Oportunidade) vs alavancagem (Força). */
const ZONE_LABELS: Record<"risk" | "leverage", Record<SwotRiskBand, string>> = {
  risk: { extremo: "Extremo", alto: "Alto", baixo: "Baixo" },
  leverage: { extremo: "Alavancar agora", alto: "Sustentar", baixo: "Monitorar" },
};
function zoneLabel(band: SwotRiskBand, isStrength: boolean): string {
  return ZONE_LABELS[isStrength ? "leverage" : "risk"][band];
}

function barClass(band: SwotRiskBand): string {
  return { baixo: "bg-emerald-500/70", alto: "bg-amber-500/80", extremo: "bg-red-500/80" }[band];
}

/** Preenchimento da barra por faixa. Força usa escala emerald (sem semântica de risco). */
function magnitudeBarClass(band: SwotRiskBand, isStrength: boolean): string {
  if (isStrength) {
    return { baixo: "bg-emerald-500/60", alto: "bg-emerald-500/80", extremo: "bg-emerald-600" }[band];
  }
  return barClass(band);
}

/** Cor do número do resultado (segundo canal além do comprimento da barra). */
function bandTextClass(band: SwotRiskBand, isStrength: boolean): string {
  if (isStrength) return "text-emerald-700 dark:text-emerald-300";
  return {
    baixo: "text-emerald-700 dark:text-emerald-300",
    alto: "text-amber-700 dark:text-amber-400",
    extremo: "text-red-700 dark:text-red-400",
  }[band];
}

export function SwotQuadrantDashboard({
  type,
  factors,
  canWrite,
  onBack,
  onEdit,
  onCreateAction,
}: Props) {
  const isStrength = type === "strength";
  const [view, setView] = useState<"prio" | "persp">("prio");

  // Deriva resultado/decisão/faixa e ordena por gravidade (desempate estável).
  const ranked = useMemo<ScoredFactor[]>(
    () =>
      factors
        .map((f) => {
          const result = swotResult(f.performance, f.relevance);
          return { ...f, result, decision: swotDecision(f.type, result), band: swotRiskBand(result) };
        })
        .sort((a, b) => b.result - a.result || b.relevance - a.relevance || b.performance - a.performance),
    [factors],
  );

  const agg = useMemo(() => {
    const total = ranked.length;
    const requer = ranked.filter((f) => f.decision === "requer").length;
    const extremo = ranked.filter((f) => f.band === "extremo").length;
    const avg = total ? ranked.reduce((s, f) => s + f.result, 0) / total : 0;
    return { total, requer, extremo, avg };
  }, [ranked]);

  // Perspectiva × faixa (aba "Por área"): onde o risco/força se concentra.
  const perspStats = useMemo<PerspStat[]>(() => {
    const m = new Map<string, PerspStat>();
    for (const f of ranked) {
      const p = f.perspective || "Sem perspectiva";
      let e = m.get(p);
      if (!e) {
        e = { persp: p, total: 0, requer: 0, byBand: { baixo: 0, alto: 0, extremo: 0 } };
        m.set(p, e);
      }
      e.total += 1;
      e.byBand[f.band] += 1;
      if (f.decision === "requer") e.requer += 1;
    }
    // Áreas mais "pesadas" primeiro (extremo conta dobrado).
    return [...m.values()].sort(
      (a, b) =>
        b.byBand.extremo * 2 + b.byBand.alto - (a.byBand.extremo * 2 + a.byBand.alto) || b.total - a.total,
    );
  }, [ranked]);

  const hasPersp = useMemo(() => factors.some((f) => f.perspective), [factors]);
  const showPersp = view === "persp" && hasPersp;

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

      {/* 2. Frase-resposta + gráfico de prioridade (barras) */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        {/* Frase-herói: a conclusão em uma linha, antes do gráfico. */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {isStrength ? (
            <>
              <span className="text-3xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{agg.total}</span>
              <span className="text-sm text-muted-foreground">
                {agg.total === 1 ? "força mapeada" : "forças mapeadas"}
                {agg.extremo > 0 && (
                  <>
                    {" "}· <span className="font-medium text-foreground">{agg.extremo}</span> de alto impacto
                  </>
                )}
              </span>
            </>
          ) : (
            <>
              <span
                className={cn(
                  "text-3xl font-semibold tabular-nums",
                  agg.requer > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {agg.requer}
              </span>
              <span className="text-sm text-muted-foreground">
                de {agg.total} {agg.total === 1 ? "fator" : "fatores"}{" "}
                <span className="font-medium text-foreground">{agg.requer === 1 ? "requer ação" : "requerem ação"}</span>
              </span>
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            média <span className="tabular-nums">{agg.avg.toFixed(1)}</span> / 16
          </span>
        </div>

        {agg.total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum fator cadastrado neste pilar.</p>
        ) : (
          <>
            {/* Mini-abas: Prioridade (barras por fator) × Por área (barras por perspectiva). */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs">
                <TabButton active={!showPersp} onClick={() => setView("prio")}>
                  {isStrength ? "Destaques" : "Prioridade"}
                </TabButton>
                {hasPersp && (
                  <TabButton active={showPersp} onClick={() => setView("persp")}>
                    Por área
                  </TabButton>
                )}
              </div>
              {!showPersp && !isStrength && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-block h-3 w-0.5 bg-foreground" /> linha = corte 8 (requer ação)
                </span>
              )}
            </div>

            <div className="mt-3">
              {showPersp ? (
                <PerspectiveBars stats={perspStats} isStrength={isStrength} />
              ) : (
                <PriorityBars
                  rows={ranked}
                  isStrength={isStrength}
                  canWrite={canWrite}
                  onEdit={onEdit}
                  onCreateAction={onCreateAction}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Gráfico de barras horizontais: todos os fatores por gravidade (com scroll), régua do corte 8. */
function PriorityBars({
  rows,
  isStrength,
  canWrite,
  onEdit,
  onCreateAction,
}: {
  rows: ScoredFactor[];
  isStrength: boolean;
  canWrite: boolean;
  onEdit: (f: SwotFactor) => void;
  onCreateAction: (f: SwotFactor) => void;
}) {
  return (
    <ul className={cn("max-h-[20rem] space-y-1.5 pr-1.5", SCROLL_CLS)}>
      {rows.map((f) => {
        // Sinal textual de decisão (independe de cor e de canWrite) — para read-only e leitor de tela.
        const decisionText = isStrength
          ? "força já positiva"
          : f.decision === "requer"
            ? "requer ação"
            : "facultativo";
        const labelInner = (
          <>
            {f.description}
            <span className="sr-only"> — resultado {f.result} de 16, {decisionText}</span>
          </>
        );
        return (
          <li key={f.id} className="group grid grid-cols-[minmax(6rem,38%)_1fr_auto] items-center gap-2 sm:gap-3">
            {canWrite ? (
              <button
                type="button"
                onClick={() => onEdit(f)}
                title={f.description}
                className="block w-full truncate rounded text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {labelInner}
              </button>
            ) : (
              <span className="block w-full truncate text-sm" title={f.description}>
                {labelInner}
              </span>
            )}
            <div className="flex items-center gap-2">
              <div aria-hidden="true" className="relative h-5 min-w-[2.5rem] flex-1 overflow-hidden rounded bg-muted/50">
                <div
                  className={cn("h-full rounded", magnitudeBarClass(f.band, isStrength))}
                  style={{ width: `${Math.max((f.result / 16) * 100, 4)}%` }}
                />
                {!isStrength && (
                  <span className="absolute top-0 h-full w-0.5 bg-foreground" style={{ left: "50%" }} />
                )}
              </div>
              <span className={cn("w-6 shrink-0 text-right text-sm font-semibold tabular-nums", bandTextClass(f.band, isStrength))}>
                {f.result}
              </span>
            </div>
            {canWrite && (
              <div className="flex shrink-0 items-center gap-1">
                {f.decision === "requer" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => onCreateAction(f)}
                    aria-label={`Criar ação para: ${f.description}`}
                  >
                    <Plus className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Ação</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => onEdit(f)}
                  aria-label={`Editar: ${f.description}`}
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Barras por perspectiva × faixa: onde o risco/força se concentra. */
function PerspectiveBars({ stats, isStrength }: { stats: PerspStat[]; isStrength: boolean }) {
  const maxTotal = Math.max(...stats.map((e) => e.total), 1);
  const shown = stats.slice(0, MAX_PERSP);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {BAND_ORDER.map((b) => (
          <span key={b} className="inline-flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", magnitudeBarClass(b, isStrength))} />
            {zoneLabel(b, isStrength)}
          </span>
        ))}
      </div>
      <ul className="space-y-2.5">
        {shown.map((e) => (
          <li key={e.persp}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-medium" title={e.persp}>{e.persp}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {e.total}
                {!isStrength && e.requer > 0 && (
                  <> · {e.requer} {e.requer === 1 ? "requer" : "requerem"} ação</>
                )}
                {isStrength && e.byBand.extremo > 0 && <> · {e.byBand.extremo} de alto impacto</>}
              </span>
            </div>
            <div aria-hidden="true" className="h-3 w-full overflow-hidden rounded-full bg-muted/40">
              <div className="flex h-full" style={{ width: `${(e.total / maxTotal) * 100}%` }}>
                {BAND_ORDER.map((b) =>
                  e.byBand[b] ? (
                    <div
                      key={b}
                      className={cn("h-full", magnitudeBarClass(b, isStrength))}
                      style={{ width: `${(e.byBand[b] / e.total) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {stats.length > MAX_PERSP && (
        <p className="mt-2 text-[11px] text-muted-foreground">+ {stats.length - MAX_PERSP} outra(s) área(s)</p>
      )}
    </div>
  );
}
