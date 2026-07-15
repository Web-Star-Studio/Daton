import { useMemo } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTION_PLAN_PRIORITY_LABELS,
  formatResponsibles,
  GUT_RELEVANCE_LABELS,
  gutRelevance,
  gutScoreColor,
  todayCalendarDate,
  useActionPlans,
  useActionPlansSummary,
  type ActionPlanListItem,
  type ActionPlanPriority,
  type GutRelevance,
} from "@/lib/action-plans-client";
import { BarList, DashCard, type BarItem } from "./mini-charts";

const BAND_ORDER: GutRelevance[] = ["extrema", "alta", "media", "baixa"];
const BAND_COLOR: Record<GutRelevance, string> = {
  extrema: "bg-red-500",
  alta: "bg-amber-500",
  media: "bg-blue-500",
  baixa: "bg-emerald-500",
};
const PRIORITY_COLOR: Record<ActionPlanPriority, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500" };

function daysUntil(dueIso: string, today: string): number {
  const a = new Date(`${dueIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

function AlertRow({ p, onOpen }: { p: ActionPlanListItem; onOpen: () => void }) {
  const today = todayCalendarDate();
  const d = p.dueDate ? daysUntil(p.dueDate, today) : null;
  const overdue = d !== null && d < 0;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg border bg-card/40 px-3 py-2 text-left transition-colors hover:border-blue-300">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", overdue ? "bg-red-100 text-red-600 dark:bg-red-500/15" : "bg-amber-100 text-amber-600 dark:bg-amber-500/15")}>
        {overdue ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{p.title}</div>
        <div className="text-[11px] text-muted-foreground">
          {p.code ? `${p.code} · ` : ""}
          {overdue ? `vencida há ${Math.abs(d!)}d` : `vence em ${d}d`}
          {formatResponsibles(p.responsibleUserName, p.coResponsibles)
            ? ` · ${formatResponsibles(p.responsibleUserName, p.coResponsibles)}`
            : ""}
        </div>
      </div>
      {p.gutScore != null && <span className={cn("text-sm font-semibold tabular-nums", gutScoreColor(p.gutScore))}>{p.gutScore}</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function PainelOperacional({ orgId }: { orgId: number }) {
  const [, setLocation] = useLocation();
  const { data: plans = [], isLoading } = useActionPlans(orgId);
  const { data: summary } = useActionPlansSummary(orgId);
  const today = todayCalendarDate();

  const gutBars: BarItem[] = useMemo(() => {
    const counts: Record<GutRelevance, number> = { extrema: 0, alta: 0, media: 0, baixa: 0 };
    for (const p of plans) if (p.gutScore != null) counts[gutRelevance(p.gutScore)]++;
    return BAND_ORDER.map((b) => ({ label: GUT_RELEVANCE_LABELS[b], value: counts[b], color: BAND_COLOR[b] }));
  }, [plans]);

  const priorityBars: BarItem[] = useMemo(
    () => (["high", "medium", "low"] as ActionPlanPriority[]).map((p) => ({
      label: ACTION_PLAN_PRIORITY_LABELS[p],
      value: summary?.byPriority?.[p] ?? 0,
      color: PRIORITY_COLOR[p],
    })),
    [summary],
  );

  const alerts = useMemo(() => {
    const open = plans.filter((p) => p.status !== "completed" && p.status !== "cancelled" && p.dueDate);
    return open
      .filter((p) => daysUntil(p.dueDate!, today) <= 7)
      .sort((a, b) => daysUntil(a.dueDate!, today) - daysUntil(b.dueDate!, today) || (b.gutScore ?? 0) - (a.gutScore ?? 0))
      .slice(0, 12);
  }, [plans, today]);

  if (isLoading) return <div className="p-10 text-center text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <DashCard title="Priorização GUT — distribuição por relevância">
          <BarList items={gutBars} />
          <p className="mt-2 text-[10px] text-muted-foreground">Extrema ≥100 · Alta ≥50 · Média ≥20 · Baixa &lt;20 (G×U×T)</p>
        </DashCard>
        <DashCard title="Distribuição por prioridade">
          <BarList items={priorityBars} />
        </DashCard>
      </div>

      <DashCard title={`Alertas e escalonamentos${alerts.length ? ` (${alerts.length})` : ""}`}>
        {alerts.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Nenhuma ação vencida ou vencendo nos próximos 7 dias. 🎉</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((p) => (
              <AlertRow key={p.id} p={p} onOpen={() => setLocation(`/planos-acao/${p.id}`)} />
            ))}
          </div>
        )}
      </DashCard>
    </div>
  );
}
