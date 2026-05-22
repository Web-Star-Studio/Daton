import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiIndicator, KpiYearRow } from "@/lib/kpi-client";
import { getIndicatorStatus, type CardStatus } from "./indicator-card";

type FilialStatusProps = {
  indicators: KpiIndicator[];
  yearRows: KpiYearRow[];
};

type FilialAggregate = {
  name: string;
  total: number;
  green: number;
  yellow: number;
  red: number;
  nodata: number;
  percentOk: number;
};

function aggregate(indicators: KpiIndicator[], yearRows: KpiYearRow[]): FilialAggregate[] {
  const byFilial = new Map<string, FilialAggregate>();
  for (const ind of indicators) {
    const name = ind.unit?.trim() || "Sem unidade";
    let agg = byFilial.get(name);
    if (!agg) {
      agg = { name, total: 0, green: 0, yellow: 0, red: 0, nodata: 0, percentOk: 0 };
      byFilial.set(name, agg);
    }
    agg.total += 1;
    const row = yearRows.find((r) => r.indicator.id === ind.id);
    const status: CardStatus = getIndicatorStatus(ind, row);
    agg[status] += 1;
  }
  const list = [...byFilial.values()].map((a) => ({
    ...a,
    percentOk: a.total > 0 ? Math.round((a.green / a.total) * 100) : 0,
  }));
  list.sort((a, b) => {
    if (b.percentOk !== a.percentOk) return b.percentOk - a.percentOk;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  return list;
}

function tone(percentOk: number): { bar: string; pct: string } {
  if (percentOk >= 70) return { bar: "bg-emerald-500", pct: "text-emerald-700 dark:text-emerald-300" };
  if (percentOk >= 40) return { bar: "bg-amber-500", pct: "text-amber-700 dark:text-amber-300" };
  return { bar: "bg-red-500", pct: "text-red-700 dark:text-red-300" };
}

export function FilialStatus({ indicators, yearRows }: FilialStatusProps) {
  const filiais = aggregate(indicators, yearRows);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Status por unidade</h3>
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      {filiais.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Cadastre uma unidade nos indicadores para ver o status.
        </p>
      ) : (
        <ul className="space-y-2">
          {filiais.map((f) => {
            const t = tone(f.percentOk);
            return (
              <li key={f.name} className="flex items-center gap-2.5 text-xs">
                <span
                  className="w-28 shrink-0 truncate text-muted-foreground"
                  title={f.name}
                >
                  {f.name}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all", t.bar)}
                    style={{ width: `${f.percentOk}%` }}
                    aria-hidden
                  />
                </div>
                <span className={cn("w-9 shrink-0 text-right font-medium tabular-nums", t.pct)}>
                  {f.percentOk}%
                </span>
                <span className="w-12 shrink-0 text-right text-muted-foreground tabular-nums">
                  {f.green}/{f.total}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          ≥70% na tolerância
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          40-69%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          &lt;40%
        </span>
      </p>
    </div>
  );
}
