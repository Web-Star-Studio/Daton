import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { KPI_CATEGORIES, type KpiIndicator, type KpiYearRow } from "@/lib/kpi-client";
import { getIndicatorStatus } from "./indicator-card";

type CategorySemaphoreProps = {
  indicators: KpiIndicator[];
  yearRows: KpiYearRow[];
};

type CatAgg = { name: string; green: number; total: number };

const NO_CATEGORY = "Sem categoria";

function aggregate(indicators: KpiIndicator[], yearRows: KpiYearRow[]): CatAgg[] {
  const byCat = new Map<string, CatAgg>();
  for (const ind of indicators) {
    const name = ind.category?.trim() || NO_CATEGORY;
    let agg = byCat.get(name);
    if (!agg) {
      agg = { name, green: 0, total: 0 };
      byCat.set(name, agg);
    }
    agg.total += 1;
    const row = yearRows.find((r) => r.indicator.id === ind.id);
    if (getIndicatorStatus(ind, row) === "green") agg.green += 1;
  }

  // Order: known categories first (in canonical order), extras alphabetically,
  // "Sem categoria" always last.
  const order = (name: string): number => {
    if (name === NO_CATEGORY) return 999;
    const idx = (KPI_CATEGORIES as string[]).indexOf(name);
    return idx === -1 ? 500 : idx;
  };
  return [...byCat.values()].sort((a, b) => {
    const oa = order(a.name);
    const ob = order(b.name);
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function tone(green: number, total: number): { bg: string; border: string; val: string } {
  if (total === 0)
    return { bg: "bg-muted/40", border: "border-border", val: "text-foreground/70" };
  const ratio = green / total;
  if (ratio >= 0.7)
    return {
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
      border: "border-emerald-200 dark:border-emerald-500/30",
      val: "text-emerald-700 dark:text-emerald-300",
    };
  if (ratio >= 0.4)
    return {
      bg: "bg-amber-50 dark:bg-amber-500/10",
      border: "border-amber-200 dark:border-amber-500/30",
      val: "text-amber-700 dark:text-amber-300",
    };
  return {
    bg: "bg-red-50 dark:bg-red-500/10",
    border: "border-red-200 dark:border-red-500/30",
    val: "text-red-700 dark:text-red-300",
  };
}

export function CategorySemaphore({ indicators, yearRows }: CategorySemaphoreProps) {
  const aggs = aggregate(indicators, yearRows);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Semáforo por categoria</h3>
        <LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      {aggs.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Defina a categoria dos indicadores para ver o semáforo.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {aggs.map((a) => {
            const t = tone(a.green, a.total);
            return (
              <div
                key={a.name}
                className={cn(
                  "flex flex-col items-center rounded-md border px-2.5 py-3 text-center",
                  t.bg,
                  t.border,
                )}
              >
                <div className={cn("text-2xl font-semibold tabular-nums", t.val)}>
                  {a.green}
                  <span className="text-base font-normal text-muted-foreground">
                    /{a.total}
                  </span>
                </div>
                <span
                  className="mt-1 truncate text-[11px] text-muted-foreground"
                  title={a.name}
                >
                  {a.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          na meta
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          atenção
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          fora
        </span>
      </p>
    </div>
  );
}
