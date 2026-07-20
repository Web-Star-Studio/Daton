import { cn } from "@/lib/utils";
import type { CardStatusFilter } from "./MetricCards";

const PILLS: Array<{ val: CardStatusFilter; label: string; tone: string }> = [
  { val: "", label: "Todos", tone: "bg-muted text-foreground" },
  { val: "vencido", label: "Vencidos", tone: "bg-red-50 text-red-700" },
  { val: "a_vencer", label: "A vencer 30d", tone: "bg-amber-50 text-amber-700" },
  { val: "pendente", label: "Pendentes", tone: "bg-blue-50 text-blue-700" },
  { val: "programado", label: "Programados", tone: "bg-teal-50 text-teal-700" },
  { val: "realizado", label: "Realizados", tone: "bg-green-50 text-green-700" },
];

export function StatusPills({
  active,
  onToggle,
}: {
  active: CardStatusFilter;
  onToggle: (f: CardStatusFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PILLS.map((p) => (
        <button
          key={p.val || "todos"}
          type="button"
          onClick={() => onToggle(p.val)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            active === p.val
              ? p.tone + " ring-1 ring-current/30"
              : "bg-transparent text-muted-foreground hover:bg-muted",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
