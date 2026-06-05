import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiIndicator, KpiYearRow } from "@/lib/kpi-client";
import { getIndicatorStatus, type CardStatus } from "./indicator-card";
import { MonthlyTrendChart } from "./monthly-trend-chart";

type EvolutionPanelProps = {
  indicators: KpiIndicator[];
  yearRows: KpiYearRow[];
  /** Number of evolution charts to render (default 3). */
  limit?: number;
};

type Pick = {
  indicator: KpiIndicator;
  row: KpiYearRow;
  status: CardStatus;
  filledCount: number;
};

function pickFeatured(indicators: KpiIndicator[], yearRows: KpiYearRow[], limit: number): Pick[] {
  const picks: Pick[] = [];
  for (const ind of indicators) {
    const row = yearRows.find((r) => r.indicator.id === ind.id);
    if (!row) continue;
    const filled = row.monthlyValues.filter((m) => m.value !== null && m.value !== undefined).length;
    if (filled < 2) continue;
    const status = getIndicatorStatus(ind, row);
    picks.push({ indicator: ind, row, status, filledCount: filled });
  }
  const priority: CardStatus[] = ["red", "yellow", "green", "nodata"];
  picks.sort((a, b) => {
    const ord = priority.indexOf(a.status) - priority.indexOf(b.status);
    if (ord !== 0) return ord;
    return b.filledCount - a.filledCount;
  });
  return picks.slice(0, limit);
}

function monthSeries(row: KpiYearRow): (number | null)[] {
  return Array.from(
    { length: 12 },
    (_, i) => row.monthlyValues.find((v) => v.month === i + 1)?.value ?? null,
  );
}

export function EvolutionPanel({ indicators, yearRows, limit = 3 }: EvolutionPanelProps) {
  const picks = useMemo(() => pickFeatured(indicators, yearRows, limit), [indicators, yearRows, limit]);

  if (picks.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Evolução dos indicadores em destaque</h3>
        <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {picks.map(({ indicator, row, status }) => {
          const goal = row.yearConfig.goal ?? null;
          return (
            <article key={indicator.id} className="flex flex-col">
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <h4
                  className="line-clamp-1 text-xs font-semibold text-foreground"
                  title={indicator.name}
                >
                  {indicator.name}
                </h4>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                    status === "green" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                    status === "yellow" && "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
                    status === "red" && "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
                    status === "nodata" && "bg-muted text-muted-foreground",
                  )}
                >
                  {status === "green"
                    ? "Na tolerância"
                    : status === "yellow"
                      ? "Atenção"
                      : status === "red"
                        ? "Fora"
                        : "Sem dados"}
                </span>
              </div>
              <MonthlyTrendChart
                values={monthSeries(row)}
                goal={goal}
                status={status}
                measureUnit={indicator.measureUnit}
                unit={indicator.unit}
                height={128}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}
