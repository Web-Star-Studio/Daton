import { AlertCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { KpiIndicator, KpiYearRow } from "@/lib/kpi-client";
import { getIndicatorStatus, type CardStatus } from "./indicator-card";

type CriticalIndicatorsProps = {
  indicators: KpiIndicator[];
  yearRows: KpiYearRow[];
  onSelect: (ind: KpiIndicator) => void;
  /** Max items to show (default 5). */
  limit?: number;
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

function latestValue(row: KpiYearRow | undefined): { month: number; value: number } | null {
  if (!row) return null;
  let latest: { month: number; value: number } | null = null;
  for (const m of row.monthlyValues) {
    if (m.value === null || m.value === undefined) continue;
    if (!latest || m.month > latest.month) latest = { month: m.month, value: m.value };
  }
  return latest;
}

type CriticalItem = {
  indicator: KpiIndicator;
  row: KpiYearRow | undefined;
  status: CardStatus;
  latest: { month: number; value: number } | null;
  overdue: boolean;
};

function pickCritical(
  indicators: KpiIndicator[],
  yearRows: KpiYearRow[],
  limit: number,
): CriticalItem[] {
  const items: CriticalItem[] = indicators.map((ind) => {
    const row = yearRows.find((r) => r.indicator.id === ind.id);
    const status = getIndicatorStatus(ind, row);
    return {
      indicator: ind,
      row,
      status,
      latest: latestValue(row),
      overdue: row?.feedStatus === "overdue",
    };
  });

  // Priority: red w/ data > yellow w/ data > overdue with some data > overdue without data
  const reds = items.filter((i) => i.status === "red");
  const yellows = items.filter((i) => i.status === "yellow");
  const overduesWithData = items.filter(
    (i) => i.status !== "red" && i.status !== "yellow" && i.overdue && i.latest !== null,
  );
  const overduesNoData = items.filter(
    (i) => i.status !== "red" && i.status !== "yellow" && i.overdue && i.latest === null,
  );

  return [...reds, ...yellows, ...overduesWithData, ...overduesNoData].slice(0, limit);
}

export function CriticalIndicators({
  indicators,
  yearRows,
  onSelect,
  limit = 5,
}: CriticalIndicatorsProps) {
  const items = pickCritical(indicators, yearRows, limit);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Indicadores que requerem atenção</h3>
        <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nenhum indicador crítico no momento. Tudo dentro da meta.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map(({ indicator, row, status, latest, overdue }) => {
            const goal = row?.yearConfig.goal ?? null;
            const dotClass =
              status === "red"
                ? "bg-red-500"
                : status === "yellow"
                  ? "bg-amber-500"
                  : "bg-muted-foreground/40";
            const valClass =
              status === "red"
                ? "text-red-700 dark:text-red-300"
                : status === "yellow"
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-muted-foreground";
            return (
              <li key={indicator.id}>
                <button
                  type="button"
                  onClick={() => onSelect(indicator)}
                  className="group flex w-full items-center gap-3 rounded-md py-2 pl-1 pr-2 text-left text-xs transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
                  aria-label={`Ver ${indicator.name} na lista`}
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate font-medium text-foreground"
                        title={indicator.name}
                      >
                        {indicator.name}
                      </span>
                      {overdue ? (
                        <Badge variant="warning" className="px-1 py-0 text-[9px]">
                          Vencido
                        </Badge>
                      ) : null}
                    </div>
                    {indicator.unit || indicator.norms?.length ? (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        {indicator.unit ? (
                          <span className="text-[10px] text-muted-foreground">
                            {indicator.unit}
                          </span>
                        ) : null}
                        {indicator.norms?.map((n) => (
                          <span
                            key={n}
                            className="rounded border px-1 text-[9px] font-medium leading-4 text-muted-foreground"
                          >
                            ISO {n}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn("font-semibold tabular-nums", valClass)}>
                      {latest ? formatValue(latest.value, indicator.measureUnit) : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      meta{" "}
                      {goal !== null && goal !== undefined
                        ? formatValue(goal, indicator.measureUnit)
                        : "—"}
                      {latest ? ` · ${MONTH_ABBR[latest.month - 1]}` : ""}
                    </div>
                  </div>
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
