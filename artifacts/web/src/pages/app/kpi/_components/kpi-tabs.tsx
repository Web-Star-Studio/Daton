import { useLocation } from "wouter";
import { LayoutDashboard, PencilLine, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTabId = "dashboard" | "indicadores" | "lancamentos";

type TabDef = {
  id: KpiTabId;
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
};

// Only real, implemented pages are tabs. Indicator registration ("Cadastro")
// happens through the "Novo Indicador" dialog inside the Indicadores page, so
// it is not a tab of its own.
const TABS: TabDef[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/kpi/dashboard" },
  { id: "indicadores", label: "Indicadores", icon: Table2, href: "/kpi/indicadores" },
  { id: "lancamentos", label: "Lançar", icon: PencilLine, href: "/kpi/lancamentos" },
];

/** Maps the current wouter location to the active KPI tab. */
export function getKpiTab(location: string): KpiTabId {
  if (location.includes("/kpi/indicadores")) return "indicadores";
  if (location.includes("/kpi/lancamentos")) return "lancamentos";
  return "dashboard";
}

export function KpiTabs({ active }: { active: KpiTabId }) {
  const [, navigate] = useLocation();

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b bg-card px-3">
      {TABS.map((t) => {
        const on = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(t.href)}
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
