import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Frosted dashboard card with an uppercase section title. */
export function DashCard({ title, action, className, children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-border/60 bg-card/42 p-5 shadow-sm backdrop-blur-md", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export type BarItem = { label: string; value: number; color?: string };

/** Horizontal distribution bars (label · bar · value), proportional to the max. */
export function BarList({ items, emptyLabel = "Sem dados" }: { items: BarItem[]; emptyLabel?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="py-2 text-xs text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-muted-foreground" title={i.label}>{i.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", i.color ?? "bg-blue-500")}
              style={{ width: `${(i.value / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right tabular-nums">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

export type MiniBar = { label: string; value: number | null };

/** Vertical mini bar chart (e.g., 6-month evolution). Null values render empty. */
export function MiniBars({ items, suffix = "" }: { items: MiniBar[]; suffix?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5">
        {items.map((i, idx) => {
          const h = i.value === null ? 0 : Math.max(4, (i.value / max) * 100);
          return (
            <div key={idx} className="flex flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-[9px] tabular-nums text-muted-foreground">
                {i.value === null ? "" : `${Math.round(i.value)}${suffix}`}
              </span>
              <div
                className={cn("w-full rounded-t bg-blue-500/80", i.value === null && "bg-muted")}
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {items.map((i, idx) => (
          <span key={idx} className="flex-1 text-center text-[9px] text-muted-foreground">{i.label}</span>
        ))}
      </div>
    </div>
  );
}
