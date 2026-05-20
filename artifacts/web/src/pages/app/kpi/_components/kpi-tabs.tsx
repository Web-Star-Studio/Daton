import { useLocation } from "wouter";
import {
  LayoutDashboard,
  PencilLine,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabDef = {
  id: KpiTabId;
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  /** Tabs from the prototype not yet implemented stay visible but disabled. */
  soon?: boolean;
};

export type KpiTabId =
  | "dashboard"
  | "indicadores"
  | "lancamentos"
  | "cadastro"
  | "rac"
  | "auditoria";

const TABS: TabDef[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/kpi/dashboard" },
  { id: "indicadores", label: "Indicadores", icon: Table2, href: "/kpi/indicadores" },
  { id: "lancamentos", label: "Lançar", icon: PencilLine, href: "/kpi/lancamentos" },
  { id: "cadastro", label: "Cadastro", icon: SlidersHorizontal, href: "#", soon: true },
  { id: "rac", label: "RAC", icon: TriangleAlert, href: "#", soon: true },
  { id: "auditoria", label: "Auditoria", icon: ShieldCheck, href: "#", soon: true },
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
            disabled={t.soon}
            onClick={() => !t.soon && navigate(t.href)}
            title={t.soon ? "Em breve" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors",
              on
                ? "border-emerald-500 font-medium text-foreground"
                : "border-transparent text-muted-foreground",
              !t.soon && !on && "hover:text-foreground",
              t.soon && "cursor-not-allowed opacity-40",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {t.label}
            {t.soon ? (
              <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                breve
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
