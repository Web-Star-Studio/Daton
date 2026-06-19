import { useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { itemsByDay, URGENCY_META, type Pendencia } from "@/lib/pendencias-format";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const DOT_COLOR: Record<"danger" | "warning" | "info", string> = {
  danger: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export function PendenciasCalendar({
  items,
  month,
  onMonthChange,
}: {
  items: Pendencia[];
  month: Date;
  onMonthChange: (next: Date) => void;
}) {
  const byDay = itemsByDay(items);
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const [selected, setSelected] = useState<string | null>(null);
  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];

  function keyOf(d: Date): string {
    return format(d, "yyyy-MM-dd");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold capitalize text-foreground">
          {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => onMonthChange(subMonths(month, 1))}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const k = keyOf(d);
          const dayItems = byDay.get(k) ?? [];
          const inMonth = isSameMonth(d, month);
          const isSelected = selected === k;
          return (
            <button
              key={k}
              type="button"
              aria-label={dayItems.length > 0 ? `Dia ${format(d, "d")}: ${dayItems.length} pendência(s)` : undefined}
              onClick={() => setSelected(dayItems.length > 0 ? k : null)}
              className={cn(
                "flex aspect-square flex-col items-center justify-start rounded-lg border p-1 text-[12px] transition-colors",
                inMonth ? "border-border/60" : "border-transparent text-muted-foreground/40",
                isSelected ? "ring-2 ring-foreground" : "hover:bg-muted/30",
                dayItems.length > 0 && "font-medium",
              )}
            >
              <span>{format(d, "d")}</span>
              {dayItems.length > 0 && (
                <span className="mt-auto flex items-center gap-0.5">
                  {dayItems.slice(0, 3).map((it) => (
                    <span
                      key={it.id}
                      className={cn("h-1.5 w-1.5 rounded-full", DOT_COLOR[URGENCY_META[it.urgency].badgeVariant])}
                    />
                  ))}
                  <span className="ml-0.5 text-[10px] text-muted-foreground">{dayItems.length}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && selectedItems.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
          <p className="text-[12px] font-medium text-foreground">
            {format(new Date(`${selected}T12:00:00`), "dd 'de' MMMM", { locale: ptBR })}
          </p>
          {selectedItems.map((it) => (
            <Link
              key={it.id}
              href={it.link.route}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted/40"
            >
              <span className="truncate">
                <span className="text-muted-foreground">{it.sourceLabel} · </span>
                {it.title}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{it.link.ctaLabel} ↗</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
