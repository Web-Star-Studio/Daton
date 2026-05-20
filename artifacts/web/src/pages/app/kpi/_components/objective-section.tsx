import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KpiIndicator, KpiObjective, KpiYearRow } from "@/lib/kpi-client";
import { IndicatorCard } from "./indicator-card";

type ObjectiveSectionProps = {
  objective: KpiObjective | null;
  indicators: KpiIndicator[];
  yearRows: KpiYearRow[];
  onEdit: (ind: KpiIndicator) => void;
  onDelete: (ind: KpiIndicator) => void;
  defaultOpen?: boolean;
  focusedIndicatorId?: number | null;
};

export function ObjectiveSection({
  objective,
  indicators,
  yearRows,
  onEdit,
  onDelete,
  defaultOpen = true,
  focusedIndicatorId = null,
}: ObjectiveSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const containsFocus =
    focusedIndicatorId != null && indicators.some((i) => i.id === focusedIndicatorId);
  useEffect(() => {
    if (containsFocus) setOpen(true);
  }, [containsFocus]);

  return (
    <section className="space-y-2.5">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="h-7 -ml-1 gap-1.5 px-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70 hover:text-foreground"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
            aria-hidden
          />
          {objective ? (
            <span className="flex items-center gap-1.5">
              {objective.code ? (
                <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                  {objective.code}
                </Badge>
              ) : null}
              <span className="truncate">{objective.name}</span>
            </span>
          ) : (
            <span className="italic text-muted-foreground/80">Sem objetivo vinculado</span>
          )}
        </Button>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {indicators.length} {indicators.length === 1 ? "indicador" : "indicadores"}
        </span>
      </header>

      {open ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {indicators.map((ind) => {
            const yearRow = yearRows.find((r) => r.indicator.id === ind.id);
            return (
              <IndicatorCard
                key={ind.id}
                indicator={ind}
                yearRow={yearRow}
                onEdit={() => onEdit(ind)}
                onDelete={() => onDelete(ind)}
                isFocused={focusedIndicatorId === ind.id}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
