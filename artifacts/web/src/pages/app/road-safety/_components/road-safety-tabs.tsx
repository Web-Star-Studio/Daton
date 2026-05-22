import {
  FileText,
  LayoutDashboard,
  LineChart,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type RoadSafetyTab = "painel" | "cadastro" | "lancamentos" | "evidencia";

const TABS: { id: RoadSafetyTab; label: string; icon: typeof FileText }[] = [
  { id: "painel", label: "Painel", icon: LayoutDashboard },
  { id: "cadastro", label: "Cadastro de FD", icon: FileText },
  { id: "lancamentos", label: "Lançar Indicador", icon: LineChart },
  { id: "evidencia", label: "Evidência Auditoria", icon: ShieldCheck },
];

export function RoadSafetyTabs({
  active,
  onChange,
}: {
  active: RoadSafetyTab;
  onChange: (tab: RoadSafetyTab) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b">
      {TABS.map((t) => {
        const on = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] transition-colors",
              on
                ? "border-blue-600 font-medium text-foreground dark:border-blue-400"
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
