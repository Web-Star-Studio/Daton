import { BarChart3, ClipboardList, ShieldCheck, SlidersHorizontal, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionTabId = "lista" | "executivo" | "operacional" | "auditoria" | "eficacia";

const TABS: { id: ActionTabId; label: string; icon: typeof ClipboardList }[] = [
  { id: "lista", label: "Lista de ações", icon: ClipboardList },
  { id: "executivo", label: "Executivo", icon: BarChart3 },
  { id: "operacional", label: "Operacional", icon: SlidersHorizontal },
  { id: "auditoria", label: "Auditoria", icon: ShieldCheck },
  { id: "eficacia", label: "Eficácia", icon: Target },
];

export function ActionTabs({ active, onChange }: { active: ActionTabId; onChange: (t: ActionTabId) => void }) {
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
              on ? "border-blue-500 font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
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
