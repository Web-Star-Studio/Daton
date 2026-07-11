import { useMemo } from "react";
import { Download, History, ShieldCheck, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useKpiIndicators,
  useKpiYearData,
  type KpiIndicator,
  type KpiYearRow,
} from "@/lib/kpi-client";
import {
  ACTION_PLAN_STATUS_LABELS,
  actionPlanStatusColor,
  formatCalendarDateBR,
  useActionPlans,
} from "@/lib/action-plans-client";
import { useActiveNorms } from "@/lib/norms-client";
import { getIndicatorStatus } from "./indicator-card";

const CURRENT_YEAR = new Date().getFullYear();

function latestValue(row: KpiYearRow | undefined): number | null {
  if (!row) return null;
  let latest: { month: number; value: number } | null = null;
  for (const m of row.monthlyValues) {
    if (m.value === null || m.value === undefined) continue;
    if (!latest || m.month > latest.month) latest = { month: m.month, value: m.value };
  }
  return latest ? latest.value : null;
}

type Coverage = { label: string; cls: string };

function coverageOf(total: number, withResult: number): Coverage {
  if (total === 0)
    return { label: "Sem indicadores", cls: "bg-muted text-muted-foreground" };
  if (withResult === total)
    return {
      label: "Atendido",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    };
  if (withResult > 0)
    return {
      label: "Parcial",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    };
  return {
    label: "Pendente",
    cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  };
}

export function AuditoriaScreen() {
  const { organization } = useAuth();
  const orgId = organization!.id;
  const year = CURRENT_YEAR;

  usePageTitle("Evidências para auditoria");
  usePageSubtitle(
    "Rastreabilidade — ISO 9001 · 14001 · 39001 · cláusula 9.1 (monitoramento)",
  );
  useHeaderActions(
    <Button variant="outline" size="sm" disabled title="Exportação em breve">
      <Download className="mr-1.5 h-4 w-4" />
      Exportar PDF
    </Button>,
  );

  const { data: indicators = [], isLoading } = useKpiIndicators(orgId);
  const { data: yearRows = [] } = useKpiYearData(orgId, year);
  const { data: plans = [] } = useActionPlans(orgId, { sourceModule: "kpi" });
  const { data: activeNorms = [] } = useActiveNorms(orgId);

  const rowByIndicator = useMemo(() => {
    const map = new Map<number, KpiYearRow>();
    for (const r of yearRows) map.set(r.indicator.id, r);
    return map;
  }, [yearRows]);

  const hasResult = (ind: KpiIndicator) => latestValue(rowByIndicator.get(ind.id)) !== null;
  const onTarget = (ind: KpiIndicator) =>
    getIndicatorStatus(ind, rowByIndicator.get(ind.id)) === "green";

  const normCoverage = useMemo(
    () =>
      activeNorms.map((norm) => {
        const tagged = indicators.filter((i) => (i.norms ?? []).includes(norm.id));
        const withResult = tagged.filter(hasResult).length;
        const onTargetCount = tagged.filter(onTarget).length;
        return {
          norm,
          total: tagged.length,
          withResult,
          onTarget: onTargetCount,
          coverage: coverageOf(tagged.length, withResult),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [indicators, rowByIndicator, activeNorms],
  );

  const recentRacs = useMemo(
    () => [...plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
    [plans],
  );

  return (
    <div className="space-y-4 p-6">
      {isLoading ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      ) : (
        <>
          {/* Normative coverage */}
          <div className="grid gap-3 sm:grid-cols-3">
            {normCoverage.map(({ norm, total, withResult, onTarget: ot, coverage }) => (
              <div key={norm.id} className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
                    <span className="text-[13px] font-semibold text-foreground">
                      {norm.label}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      coverage.cls,
                    )}
                  >
                    {coverage.label}
                  </span>
                </div>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <dt className="text-muted-foreground">Indicadores monitorados</dt>
                    <dd className="font-medium tabular-nums text-foreground">{total}</dd>
                  </div>
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <dt className="text-muted-foreground">Com resultado no ano</dt>
                    <dd className="font-medium tabular-nums text-foreground">{withResult}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Dentro da tolerância</dt>
                    <dd className="font-medium tabular-nums text-foreground">{ot}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          {/* Traceability log */}
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" aria-hidden />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Log de rastreabilidade — ações corretivas registradas
              </h3>
            </div>
            {recentRacs.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhuma ação corretiva registrada ainda.
              </p>
            ) : (
              <ul className="divide-y">
                {recentRacs.map((plan) => (
                  <li key={plan.id} className="flex items-start gap-3 py-2.5">
                    <TriangleAlert
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">
                          RAC aberta — {plan.title}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                            actionPlanStatusColor(plan.status),
                          )}
                        >
                          {ACTION_PLAN_STATUS_LABELS[plan.status]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {plan.sourceContext.kpi?.indicatorName ?? plan.sourceContext.label}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {formatCalendarDateBR(plan.createdAt) || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
