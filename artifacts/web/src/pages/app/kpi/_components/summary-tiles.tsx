import {
  AlertOctagon,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ListChecks,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardStatus } from "./indicator-card";

export type StatusFilter = "" | "green" | "yellow" | "red" | "nodata";
export type FeedFilter = "" | "fed" | "overdue";

type TileColor = "neutral" | "green" | "amber" | "red" | "muted" | "blue";

const COLOR_STYLES: Record<TileColor, { value: string; icon: string; ring: string }> = {
  neutral: {
    value: "text-foreground",
    icon: "text-muted-foreground",
    ring: "ring-foreground/30",
  },
  green: {
    value: "text-emerald-700 dark:text-emerald-300",
    icon: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/50",
  },
  amber: {
    value: "text-amber-700 dark:text-amber-300",
    icon: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/50",
  },
  red: {
    value: "text-red-700 dark:text-red-300",
    icon: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/50",
  },
  muted: {
    value: "text-foreground/70",
    icon: "text-muted-foreground",
    ring: "ring-foreground/30",
  },
  blue: {
    value: "text-blue-700 dark:text-blue-300",
    icon: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500/50",
  },
};

type Tile = {
  key: string;
  label: string;
  value: number;
  sub: string;
  color: TileColor;
  Icon: typeof ListChecks;
  active: boolean;
  onSelect: (() => void) | null;
  group: "compliance" | "performance" | "total";
};

type SummaryTilesProps = {
  total: number;
  statusCounts: Record<CardStatus, number>;
  feedCounts: { fed: number; overdue: number };
  statusFilter: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  feedFilter: FeedFilter;
  onFeedChange: (f: FeedFilter) => void;
};

export function SummaryTiles({
  total,
  statusCounts,
  feedCounts,
  statusFilter,
  onStatusChange,
  feedFilter,
  onFeedChange,
}: SummaryTilesProps) {
  const toggleStatus = (s: Exclude<StatusFilter, "">) => () =>
    onStatusChange(statusFilter === s ? "" : s);
  const toggleFeed = (f: Exclude<FeedFilter, "">) => () =>
    onFeedChange(feedFilter === f ? "" : f);

  const tiles: Tile[] = [
    {
      key: "total",
      label: "Total",
      value: total,
      sub: `${statusCounts.nodata} sem dados no ano`,
      color: "neutral",
      Icon: ListChecks,
      active: false,
      onSelect: null,
      group: "total",
    },
    {
      key: "fed",
      label: "Alimentados",
      value: feedCounts.fed,
      sub: pct(feedCounts.fed, total) + " no prazo",
      color: "blue",
      Icon: ClipboardCheck,
      active: feedFilter === "fed",
      onSelect: feedCounts.fed > 0 ? toggleFeed("fed") : null,
      group: "compliance",
    },
    {
      key: "overdue",
      label: "Vencidos",
      value: feedCounts.overdue,
      sub: pct(feedCounts.overdue, total) + " com atraso",
      color: feedCounts.overdue > 0 ? "red" : "muted",
      Icon: AlertOctagon,
      active: feedFilter === "overdue",
      onSelect: feedCounts.overdue > 0 ? toggleFeed("overdue") : null,
      group: "compliance",
    },
    {
      key: "green",
      label: "Na tolerância",
      value: statusCounts.green,
      sub: pct(statusCounts.green, total),
      color: "green",
      Icon: CheckCircle2,
      active: statusFilter === "green",
      onSelect: statusCounts.green > 0 ? toggleStatus("green") : null,
      group: "performance",
    },
    {
      key: "yellow",
      label: "Atenção",
      value: statusCounts.yellow,
      sub: pct(statusCounts.yellow, total),
      color: "amber",
      Icon: TriangleAlert,
      active: statusFilter === "yellow",
      onSelect: statusCounts.yellow > 0 ? toggleStatus("yellow") : null,
      group: "performance",
    },
    {
      key: "red",
      label: "Fora da tolerância",
      value: statusCounts.red,
      sub: pct(statusCounts.red, total),
      color: "red",
      Icon: TrendingDown,
      active: statusFilter === "red",
      onSelect: statusCounts.red > 0 ? toggleStatus("red") : null,
      group: "performance",
    },
    {
      key: "nodata",
      label: "Sem dados",
      value: statusCounts.nodata,
      sub: pct(statusCounts.nodata, total),
      color: "muted",
      Icon: Circle,
      active: statusFilter === "nodata",
      onSelect: statusCounts.nodata > 0 ? toggleStatus("nodata") : null,
      group: "performance",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {tiles.map((t) => {
        const styles = COLOR_STYLES[t.color];
        const clickable = t.onSelect !== null;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => t.onSelect?.()}
            disabled={!clickable}
            aria-pressed={t.active}
            className={cn(
              "group flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-all",
              clickable && "hover:bg-muted/40 hover:border-foreground/15 cursor-pointer",
              !clickable && "cursor-default opacity-70",
              t.active && "ring-2 ring-offset-1 ring-offset-background",
              t.active && styles.ring,
            )}
          >
            <t.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", styles.icon)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t.label}
              </div>
              <div
                className={cn(
                  "mt-0.5 text-2xl font-semibold leading-none tabular-nums",
                  styles.value,
                )}
              >
                {t.value}
              </div>
              <div className="mt-1 truncate text-[10px] text-muted-foreground tabular-nums">
                {t.sub}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function pct(value: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((value / total) * 100)}%`;
}
