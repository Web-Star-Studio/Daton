import { AlertTriangle, ArrowDown, ArrowUp, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { hasValidFormula } from "@/lib/formula-evaluator";
import {
  PERIODICITY_LABELS,
  getTrafficLight,
  type KpiIndicator,
  type KpiYearRow,
  type TrafficLight,
} from "@/lib/kpi-client";
import { Sparkline } from "./sparkline";

export type CardStatus = TrafficLight | "nodata";

const STATUS_BORDER: Record<CardStatus, string> = {
  green: "border-l-emerald-500",
  yellow: "border-l-amber-500",
  red: "border-l-red-500",
  nodata: "border-l-muted-foreground/20",
};

const STATUS_DOT: Record<CardStatus, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  nodata: "bg-muted-foreground/30",
};

const STATUS_BAR: Record<CardStatus, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  nodata: "bg-muted-foreground/30",
};

const STATUS_LABEL: Record<CardStatus, string> = {
  green: "Na tolerância",
  yellow: "Atenção",
  red: "Fora da tolerância",
  nodata: "Sem dados",
};

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatValue(value: number | null | undefined, measureUnit?: string | null): string {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return measureUnit ? `${formatted} ${measureUnit}` : formatted;
}

function findLatestValue(
  monthlyValues: KpiYearRow["monthlyValues"] | undefined,
): { month: number; value: number } | null {
  if (!monthlyValues) return null;
  let latest: { month: number; value: number } | null = null;
  for (const m of monthlyValues) {
    if (m.value === null || m.value === undefined) continue;
    if (!latest || m.month > latest.month) latest = { month: m.month, value: m.value };
  }
  return latest;
}

export function getIndicatorStatus(
  indicator: KpiIndicator,
  yearRow: KpiYearRow | undefined,
): CardStatus {
  const goal = yearRow?.yearConfig.goal ?? null;
  const latest = findLatestValue(yearRow?.monthlyValues);
  if (!latest) return "nodata";
  return getTrafficLight(latest.value, goal, indicator.direction as "up" | "down") ?? "nodata";
}

type IndicatorCardProps = {
  indicator: KpiIndicator;
  yearRow?: KpiYearRow;
  onEdit: () => void;
  onDelete: () => void;
  isFocused?: boolean;
};

export function IndicatorCard({
  indicator,
  yearRow,
  onEdit,
  onDelete,
  isFocused = false,
}: IndicatorCardProps) {
  const goal = yearRow?.yearConfig.goal ?? null;
  const direction = indicator.direction as "up" | "down";
  const latest = findLatestValue(yearRow?.monthlyValues);
  const status: CardStatus = !latest
    ? "nodata"
    : getTrafficLight(latest.value, goal, direction) ?? "nodata";

  const monthValueArray: (number | null)[] = Array.from({ length: 12 }, (_, i) => {
    const m = yearRow?.monthlyValues.find((v) => v.month === i + 1);
    return m?.value ?? null;
  });
  const hasAnyMonthly = monthValueArray.some((v) => v !== null);

  const progressPct = (() => {
    if (!latest || goal === null || goal === undefined || goal === 0) return 0;
    const ratio = (latest.value / goal) * 100;
    if (direction === "up") return Math.max(0, Math.min(100, ratio));
    if (ratio <= 100) return 100;
    return Math.max(0, Math.min(100, 10000 / ratio));
  })();

  const hasFormula = hasValidFormula(indicator.formulaVariables, indicator.formulaExpression);
  const objectiveLinked = yearRow?.yearConfig.objectiveId != null;

  const responsibleName = indicator.responsibleUserName ?? null;
  const responsibleInitials = responsibleName
    ? responsibleName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join("")
    : null;

  const valueColor =
    status === "green"
      ? "text-emerald-700 dark:text-emerald-300"
      : status === "yellow"
        ? "text-amber-700 dark:text-amber-300"
        : status === "red"
          ? "text-red-700 dark:text-red-300"
          : "text-muted-foreground";

  return (
    <div
      id={`ind-card-${indicator.id}`}
      className={cn(
        // h-full pra que cards lado-a-lado em grid estiquem até a altura do
        // maior (evita visual irregular quando um card tem nome em 2 linhas
        // ou badges extra de rollup).
        "group relative flex h-full flex-col rounded-lg border border-l-2 bg-card p-3.5 shadow-xs transition-all scroll-mt-6",
        "hover:shadow-sm hover:border-foreground/15",
        STATUS_BORDER[status],
        isFocused && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background shadow-md",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATUS_DOT[status])}
          aria-label={STATUS_LABEL[status]}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug text-foreground line-clamp-2">
            {indicator.name}
          </h3>
          {indicator.measurement ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
              {indicator.measurement}
            </p>
          ) : null}
          {/* Badge sutil indicando "calculado automaticamente" se algum mês do
              ano tem valor computado via rollup (Corporativo com filiais configurados). */}
          {(() => {
            const computedMonths = yearRow?.monthlyValues.filter((m) => m.isComputed) ?? [];
            if (computedMonths.length === 0) return null;
            const latest = computedMonths[computedMonths.length - 1];
            const cw = latest?.childrenWithData ?? 0;
            const ct = latest?.childrenTotal ?? 0;
            return (
              <p
                className="mt-1 text-[10px] text-indigo-700 dark:text-indigo-300"
                title="Valor calculado on-read a partir dos indicadores das filiais (rollup)"
              >
                ↻ calculado de {cw}/{ct} filia{ct === 1 ? "l" : "is"}
              </p>
            );
          })()}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label="Ações do indicador"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn("text-2xl font-semibold tabular-nums leading-none", valueColor)}>
          {latest ? formatValue(latest.value, indicator.measureUnit) : "—"}
        </span>
        {direction === "up" ? (
          <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" aria-label="Maior é melhor" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" aria-label="Menor é melhor" />
        )}
        {latest ? (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
            {MONTH_ABBR[latest.month - 1]}
          </span>
        ) : null}
      </div>

      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Tolerância:{" "}
            <span className="font-medium tabular-nums text-foreground/80">
              {goal !== null && goal !== undefined
                ? formatValue(goal, indicator.measureUnit)
                : "não definida"}
            </span>
          </span>
          <span className="tabular-nums">{STATUS_LABEL[status]}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", STATUS_BAR[status])}
            style={{ width: `${progressPct}%` }}
            aria-hidden
          />
        </div>
      </div>

      {hasAnyMonthly ? (
        <div className="mt-2.5">
          <Sparkline values={monthValueArray} goal={goal} status={status} height={36} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <Badge variant="neutral" className="px-1.5 py-0 text-[10px] font-medium">
          {PERIODICITY_LABELS[indicator.periodicity as keyof typeof PERIODICITY_LABELS] ??
            indicator.periodicity}
        </Badge>
        {indicator.measureUnit ? (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
            {indicator.measureUnit}
          </Badge>
        ) : null}
        {!hasFormula ? (
          <Badge variant="warning" className="gap-1 px-1.5 py-0 text-[10px] font-medium">
            <AlertTriangle className="h-2.5 w-2.5" />
            sem fórmula
          </Badge>
        ) : null}
        {!objectiveLinked ? (
          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
          >
            sem objetivo
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5 text-[11px]">
        <span
          className="min-w-0 truncate text-muted-foreground"
          title={indicator.unit ?? undefined}
        >
          {indicator.unit ? indicator.unit : <span className="italic opacity-70">sem unidade</span>}
        </span>
        {responsibleName ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground/70"
              aria-hidden
            >
              {responsibleInitials}
            </span>
            <span className="truncate text-foreground/80" title={responsibleName}>
              {responsibleName}
            </span>
          </span>
        ) : (
          <span className="italic text-muted-foreground/70">sem responsável</span>
        )}
      </div>
    </div>
  );
}
