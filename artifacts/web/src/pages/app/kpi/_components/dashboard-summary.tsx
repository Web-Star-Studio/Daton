import { AlertOctagon, ClipboardCheck, ListChecks, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardStatus } from "./indicator-card";
import type { FeedFilter, StatusFilter } from "./summary-tiles";

type DashboardSummaryProps = {
  total: number;
  statusCounts: Record<CardStatus, number>;
  feedCounts: { fed: number; overdue: number };
  /** Short caption for the "Total" tile (e.g. norm coverage). */
  totalCaption: string;
  statusFilter: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  feedFilter: FeedFilter;
  onFeedChange: (f: FeedFilter) => void;
};

type TileTone = "neutral" | "green" | "red" | "amber";

const TONE: Record<TileTone, { value: string; label: string; icon: string; ring: string }> = {
  neutral: {
    value: "text-foreground",
    label: "text-muted-foreground",
    icon: "text-muted-foreground",
    ring: "ring-foreground/30",
  },
  green: {
    value: "text-emerald-600 dark:text-emerald-400",
    label: "text-emerald-600 dark:text-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/50",
  },
  red: {
    value: "text-red-600 dark:text-red-400",
    label: "text-red-600 dark:text-red-400",
    icon: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/50",
  },
  amber: {
    value: "text-amber-600 dark:text-amber-400",
    label: "text-amber-600 dark:text-amber-400",
    icon: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/50",
  },
};

function pct(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function DashboardSummary({
  total,
  statusCounts,
  feedCounts,
  totalCaption,
  statusFilter,
  onStatusChange,
  feedFilter,
  onFeedChange,
}: DashboardSummaryProps) {
  const needAction = statusCounts.red;
  const attention = statusCounts.yellow;

  const tiles = [
    {
      key: "total",
      label: "Total de indicadores",
      value: total,
      sub: totalCaption,
      tone: "neutral" as TileTone,
      Icon: ListChecks,
      active: false,
      onClick: null as (() => void) | null,
    },
    {
      key: "fed",
      label: "Alimentados",
      value: feedCounts.fed,
      sub: `${pct(feedCounts.fed, total)} no prazo`,
      tone: "green" as TileTone,
      Icon: ClipboardCheck,
      active: feedFilter === "fed",
      onClick:
        feedCounts.fed > 0
          ? () => onFeedChange(feedFilter === "fed" ? "" : "fed")
          : null,
    },
    {
      key: "overdue",
      label: "Vencidos",
      value: feedCounts.overdue,
      sub: `${pct(feedCounts.overdue, total)} pendentes`,
      tone: (feedCounts.overdue > 0 ? "red" : "neutral") as TileTone,
      Icon: AlertOctagon,
      active: feedFilter === "overdue",
      onClick:
        feedCounts.overdue > 0
          ? () => onFeedChange(feedFilter === "overdue" ? "" : "overdue")
          : null,
    },
    {
      key: "action",
      label: "Requerem ação",
      value: needAction,
      sub:
        needAction + attention > 0
          ? `${needAction} fora da meta · ${attention} em atenção`
          : "Tudo dentro da meta",
      tone: (needAction > 0 ? "amber" : "neutral") as TileTone,
      Icon: TriangleAlert,
      active: statusFilter === "red",
      onClick:
        needAction > 0
          ? () => onStatusChange(statusFilter === "red" ? "" : "red")
          : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => {
        const tone = TONE[t.tone];
        const clickable = t.onClick !== null;
        return (
          <button
            key={t.key}
            type="button"
            disabled={!clickable}
            aria-pressed={t.active}
            onClick={() => t.onClick?.()}
            className={cn(
              "flex flex-col rounded-xl border bg-card px-4 py-3.5 text-left transition-all",
              clickable
                ? "cursor-pointer hover:border-foreground/20 hover:shadow-sm"
                : "cursor-default",
              t.active && "ring-2 ring-offset-1 ring-offset-background",
              t.active && tone.ring,
            )}
          >
            <div className="flex items-center gap-1.5">
              <t.Icon className={cn("h-3.5 w-3.5 shrink-0", tone.icon)} aria-hidden />
              <span
                className={cn(
                  "truncate text-[11px] font-medium uppercase tracking-wide",
                  tone.label,
                )}
              >
                {t.label}
              </span>
            </div>
            <span
              className={cn(
                "mt-2 text-[30px] font-semibold leading-none tabular-nums",
                tone.value,
              )}
            >
              {t.value}
            </span>
            <span className="mt-2 truncate text-[11px] text-muted-foreground">
              {t.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}
