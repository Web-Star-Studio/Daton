import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { computeTrainingCounters } from "../_lib/ficha-derivations";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

const STAT_TONE: Record<string, string> = {
  feitos: "text-emerald-600",
  pendentes: "text-amber-600",
  vencidos: "text-red-600",
};

export function FichaHeader({
  name,
  position,
  contractLabel,
  department,
  unitName,
  trainings,
}: {
  name: string;
  position?: string | null;
  contractLabel?: string | null;
  department?: string | null;
  unitName?: string | null;
  trainings: { status?: string | null; expirationDate?: string | null }[];
}) {
  const c = computeTrainingCounters(trainings);
  const badges = [contractLabel, department, unitName].filter(
    Boolean,
  ) as string[];
  const stats: { key: string; label: string; value: number }[] = [
    { key: "total", label: "Total", value: c.total },
    { key: "feitos", label: "Feitos", value: c.feitos },
    { key: "pendentes", label: "Pendentes", value: c.pendentes },
    { key: "vencidos", label: "Vencidos", value: c.vencidos },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-secondary text-lg font-bold text-foreground">
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold leading-tight">{name}</h2>
        {position && (
          <p className="text-sm text-muted-foreground">{position}</p>
        )}
        {badges.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <Badge key={b} variant="secondary" className="text-[10px]">
                {b}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-6">
        {stats.map((s) => (
          <div key={s.key} className="text-center">
            <div
              className={cn(
                "text-xl font-bold tabular-nums leading-none",
                STAT_TONE[s.key],
              )}
            >
              {s.value}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
