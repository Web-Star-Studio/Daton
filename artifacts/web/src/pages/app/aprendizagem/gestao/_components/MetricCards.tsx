import { cn } from "@/lib/utils";

export type CardStatusFilter =
  | ""
  | "vencido"
  | "a_vencer"
  | "pendente"
  | "programado"
  | "realizado";

const CARDS: Array<{
  key: Exclude<CardStatusFilter, "">;
  label: string;
  sub: string;
  accent: string;
  border: string;
  countKey: "vencido" | "aVencer" | "pendente" | "programado" | "realizadoMes";
}> = [
  {
    key: "vencido",
    label: "Vencidos",
    sub: "requerem ação imediata",
    accent: "text-red-700",
    border: "border-l-red-500",
    countKey: "vencido",
  },
  {
    key: "a_vencer",
    label: "A vencer em 30 dias",
    sub: "atenção necessária",
    accent: "text-amber-700",
    border: "border-l-amber-500",
    countKey: "aVencer",
  },
  {
    key: "pendente",
    label: "Pendentes",
    sub: "aguardando turma",
    accent: "text-blue-700",
    border: "border-l-blue-500",
    countKey: "pendente",
  },
  {
    key: "programado",
    label: "Programados",
    sub: "turma confirmada",
    accent: "text-teal-700",
    border: "border-l-teal-500",
    countKey: "programado",
  },
  {
    key: "realizado",
    label: "Realizados no mês",
    sub: "concluídos no mês",
    accent: "text-green-700",
    border: "border-l-green-500",
    countKey: "realizadoMes",
  },
];

export function MetricCards({
  counts,
  active,
  onToggle,
}: {
  counts: {
    vencido: number;
    aVencer: number;
    pendente: number;
    programado: number;
    realizadoMes: number;
  };
  active: CardStatusFilter;
  onToggle: (f: CardStatusFilter) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {CARDS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onToggle(c.key)}
          className={cn(
            "rounded-xl border border-l-[3px] bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40",
            c.border,
            active === c.key && "ring-2 ring-primary/40",
          )}
        >
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {c.label}
          </div>
          <div className={cn("mt-1 text-2xl font-semibold tabular-nums", c.accent)}>
            {counts[c.countKey]}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{c.sub}</div>
        </button>
      ))}
    </div>
  );
}
