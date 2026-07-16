import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ACTION_TYPE_LABELS,
  SOURCE_MODULE_LABELS,
  useActionPlansSummary,
  type ActionPlanType,
} from "@/lib/action-plans-client";
import { BarList, DashCard, MiniBars, type BarItem } from "./mini-charts";
import { ODS_COLORS } from "./vinculos";

const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const SOURCE_COLORS: Record<string, string> = {
  kpi: "bg-blue-500",
  swot: "bg-violet-500",
  improvement: "bg-emerald-500",
  corrective: "bg-amber-500",
  norm_requirement: "bg-rose-500",
  manual: "bg-slate-400",
};

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function PainelExecutivo({ orgId }: { orgId: number }) {
  const { data: s, isLoading } = useActionPlansSummary(orgId);

  const sourceBars: BarItem[] = useMemo(
    () =>
      Object.entries(s?.bySourceModule ?? {})
        .map(([k, v]) => ({ label: SOURCE_MODULE_LABELS[k] ?? k, value: v, color: SOURCE_COLORS[k] ?? "bg-blue-500" }))
        .sort((a, b) => b.value - a.value),
    [s],
  );

  const typeBars: BarItem[] = useMemo(
    () =>
      (Object.keys(ACTION_TYPE_LABELS) as ActionPlanType[])
        .map((t) => ({ label: ACTION_TYPE_LABELS[t], value: s?.byActionType?.[t] ?? 0 }))
        .filter((b) => b.value > 0),
    [s],
  );

  if (isLoading || !s) return <div className="p-10 text-center text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Taxa de eficácia"
          value={s.effectivenessRatePct === null ? "—" : `${Math.round(s.effectivenessRatePct)}%`}
          tone="text-emerald-600 dark:text-emerald-400"
          sub="ações eficazes / avaliadas"
        />
        <Metric label="Prazo médio de conclusão" value={s.avgCompletionDays === null ? "—" : `${Math.round(s.avgCompletionDays)}d`} sub="da criação ao encerramento" />
        <Metric label="Total de ações" value={String(s.total)} sub={`${s.overdue} vencida(s)`} />
        <Metric label="GUT médio" value={s.gutAverage === null ? "—" : s.gutAverage.toFixed(1)} sub="prioridade média da fila" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashCard title="Distribuição por origem">
          <BarList items={sourceBars} />
        </DashCard>

        <DashCard title="Distribuição por tipo">
          <BarList items={typeBars} />
        </DashCard>

        <DashCard title="Ações por ODS">
          {s.odsDistribution.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Nenhuma ação vinculada a ODS ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {s.odsDistribution.map((o) => (
                <div key={o.ods} className="text-center">
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded text-xs font-bold text-white" style={{ backgroundColor: ODS_COLORS[o.ods] ?? "#64748b" }}>
                    {o.ods}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{o.count} açõe{o.count !== 1 ? "s" : ""}</div>
                </div>
              ))}
            </div>
          )}
        </DashCard>

        <DashCard title="Evolução da taxa de eficácia (6 meses)">
          <MiniBars
            items={s.effectivenessEvolution.map((e) => ({
              label: MONTH_SHORT[e.month - 1] ?? String(e.month),
              value: e.ratePct,
            }))}
            suffix="%"
          />
        </DashCard>
      </div>
    </div>
  );
}
