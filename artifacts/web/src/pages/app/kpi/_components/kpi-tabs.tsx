import { LayoutDashboard, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTabId = "dashboard" | "indicadores";

type TabDef = {
  id: KpiTabId;
  label: string;
  icon: typeof LayoutDashboard;
};

// State-based tabs (no route navigation) — the whole module lives on one page,
// mirroring the IndicaOS prototype. "Lançar" stays out of the shell for now: it
// still uses the old flow and keeps only its standalone /kpi/lancamentos route.
const TABS: TabDef[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "indicadores", label: "Indicadores", icon: Table2 },
];

export function KpiTabs({
  active,
  onChange,
}: {
  active: KpiTabId;
  onChange: (tab: KpiTabId) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b bg-card px-3">
      {TABS.map((t) => {
        const on = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors",
              on
                ? "border-emerald-500 font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
