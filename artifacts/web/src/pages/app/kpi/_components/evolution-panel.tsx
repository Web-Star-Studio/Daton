import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { KpiIndicator, KpiYearRow } from "@/lib/kpi-client";
import { getIndicatorStatus, type CardStatus } from "./indicator-card";

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

const COLOR_BY_STATUS: Record<CardStatus, string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
  nodata: "#64748b",
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

function buildSeries(row: KpiYearRow): { name: string; value: number | null; meta: number | null }[] {
  const goal = row.yearConfig.goal ?? null;
  return Array.from({ length: 12 }, (_, i) => {
    const m = row.monthlyValues.find((v) => v.month === i + 1);
    return {
      name: MONTH_ABBR[i],
      value: m?.value ?? null,
      meta: goal,
    };
  });
}

function formatTick(value: number, measureUnit?: string | null): string {
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return measureUnit ? `${formatted}${measureUnit.length <= 3 ? measureUnit : ""}` : formatted;
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
          const data = buildSeries(row);
          const goal = row.yearConfig.goal ?? null;
          const color = COLOR_BY_STATUS[status];
          const measureUnit = indicator.measureUnit;
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
                    ? "Na meta"
                    : status === "yellow"
                      ? "Atenção"
                      : status === "red"
                        ? "Fora"
                        : "Sem dados"}
                </span>
              </div>
              <div className="mb-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1 w-2.5 rounded" style={{ background: color }} />
                  Resultado
                </span>
                {goal !== null ? (
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-0 w-2.5 border-t-2 border-dashed"
                      style={{ borderColor: "#ef4444" }}
                    />
                    Meta {formatTick(goal, measureUnit)}
                  </span>
                ) : null}
                {indicator.unit ? (
                  <span className="ml-auto truncate" title={indicator.unit}>
                    {indicator.unit}
                  </span>
                ) : null}
              </div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 5, right: 6, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      width={48}
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v: number) => formatTick(v, measureUnit)}
                      tickLine={false}
                      axisLine={false}
                    />
                    {goal !== null ? (
                      <ReferenceLine
                        y={goal}
                        stroke="#ef4444"
                        strokeDasharray="4 3"
                        strokeWidth={1.25}
                        opacity={0.7}
                      />
                    ) : null}
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover, white)",
                        border: "1px solid rgba(148,163,184,0.25)",
                        borderRadius: 6,
                        fontSize: 11,
                        padding: "4px 8px",
                      }}
                      labelStyle={{ fontWeight: 500 }}
                      formatter={(value) => {
                        const num = typeof value === "number" ? value : null;
                        return [
                          num === null ? "—" : formatTick(num, measureUnit),
                          "Resultado",
                        ];
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 3, fill: color, strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
