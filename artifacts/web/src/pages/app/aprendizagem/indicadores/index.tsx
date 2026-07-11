import { useMemo } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLearningDashboardSummary,
  getGetLearningDashboardSummaryQueryKey,
  useActivateLmsIndicators,
  useListKpiIndicators,
  getListKpiIndicatorsQueryKey,
} from "@workspace/api-client-react";
import type {
  LearningSummaryNormRow,
  LearningSummaryUnitRow,
  KpiIndicator,
} from "@workspace/api-client-react";
import { usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAllNorms, buildNormLabelMap } from "@/lib/norms-client";

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
}

function pctColor(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value >= 80) return "text-green-700";
  if (value >= 60) return "text-blue-700";
  if (value >= 40) return "text-amber-700";
  return "text-red-700";
}

function pctBarColor(value: number | null): string {
  if (value === null) return "bg-muted";
  if (value >= 80) return "bg-green-500";
  if (value >= 60) return "bg-blue-500";
  if (value >= 40) return "bg-amber-400";
  return "bg-red-500";
}

const UNIT_STATUS: Record<
  LearningSummaryUnitRow["status"],
  { label: string; badge: string }
> = {
  ok: { label: "OK", badge: "bg-green-50 text-green-700" },
  atencao: { label: "Atenção", badge: "bg-amber-50 text-amber-700" },
  critico: { label: "Crítico", badge: "bg-red-50 text-red-700" },
  "sem-dados": { label: "Sem dados", badge: "bg-muted text-muted-foreground" },
};

function IsoCard({
  label,
  iso,
  value,
  unit,
  accent,
}: {
  label: string;
  iso: string;
  value: number | null;
  unit?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
          {iso}
        </span>
      </div>
      <div className={cn("mt-1 text-2xl font-semibold", accent)}>
        {value === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {Math.round(value)}
            {unit && (
              <span className="text-base font-normal text-muted-foreground">
                {unit}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HorizontalBar({ label, pct }: { label: string; pct: number | null }) {
  const width = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-2">
      <span className="w-40 shrink-0 truncate text-xs text-foreground">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", pctBarColor(pct))}
          style={{ width: `${width}%` }}
        />
      </div>
      <span
        className={cn(
          "w-9 shrink-0 text-right text-xs font-medium",
          pctColor(pct),
        )}
      >
        {formatPct(pct)}
      </span>
    </div>
  );
}

export default function AprendizagemIndicadoresPage() {
  usePageTitle("Indicadores LMS");
  const { user } = useAuth();
  const orgId = user?.organizationId ?? 0;
  const { canWriteModule, hasModuleAccess } = usePermissions();
  const canAccess = hasModuleAccess("employees");
  // A lista/ativação de indicadores formais vive no módulo KPI — gateia por ele.
  const canViewKpi = hasModuleAccess("kpi");
  const canWriteKpi = canWriteModule("kpi");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: allNorms = [] } = useAllNorms(orgId);
  const normLabelMap = useMemo(() => buildNormLabelMap(allNorms), [allNorms]);

  const currentYear = new Date().getFullYear();
  const summaryParams = { year: currentYear };

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useGetLearningDashboardSummary(orgId, summaryParams, {
    query: {
      enabled: !!orgId && canAccess,
      queryKey: getGetLearningDashboardSummaryQueryKey(orgId, summaryParams),
    },
  });

  const {
    data: kpiIndicators,
    isLoading: kpiLoading,
    isError: kpiError,
  } = useListKpiIndicators(
    orgId,
    {},
    {
      query: {
        enabled: !!orgId && canAccess && canViewKpi,
        queryKey: getListKpiIndicatorsQueryKey(orgId, {}),
      },
    },
  );
  const lmsIndicators: KpiIndicator[] = (kpiIndicators ?? []).filter(
    (ind) => ind.computedSource === "lms",
  );

  const { mutate: activateIndicators, isPending: isActivating } =
    useActivateLmsIndicators({
      mutation: {
        onSuccess: () => {
          toast({ title: "Indicadores de treinamento ativados" });
          // Ativar cria/computa indicadores KPI + valores do ano — invalida a
          // lista e a year-data (qualquer variante de params) para refletir sem
          // refresh manual, inclusive se o módulo KPI já foi visitado antes.
          queryClient.invalidateQueries({
            predicate: (q) =>
              typeof q.queryKey[0] === "string" &&
              (q.queryKey[0].includes("/kpi/indicators") ||
                q.queryKey[0].includes("/kpi/years")),
          });
        },
        onError: () => {
          toast({
            title: "Erro ao ativar indicadores",
            variant: "destructive",
          });
        },
      },
    });

  if (!orgId) return null;

  if (!canAccess) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        Você não tem acesso a este módulo.
      </div>
    );
  }

  const cards = summary?.cards;
  const byNorm: LearningSummaryNormRow[] = summary?.byNorm ?? [];
  const byUnit: LearningSummaryUnitRow[] = summary?.byUnit ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Indicadores de treinamento — ISO 9001 §9.1 · ISO 10015
        </p>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Exportar relatório
        </Button>
      </div>

      {/* Cumprimento/cobertura + Eficácia/Desempenho — dependem do summary */}
      {summaryLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Carregando indicadores…
        </p>
      ) : summaryError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Não foi possível carregar os indicadores. Tente novamente.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <IsoCard
              label="Cumprimento do programa"
              iso="ISO 10015 §4.4"
              value={cards?.patCompletion ?? null}
              unit="%"
              accent={pctColor(cards?.patCompletion ?? null)}
            />
            <IsoCard
              label="Eficácia geral"
              iso="ISO 10015 §4.1"
              value={cards?.effectiveness ?? null}
              unit="%"
              accent={pctColor(cards?.effectiveness ?? null)}
            />
            <IsoCard
              label="Colaboradores com gap"
              iso="ISO 9001 §7.2"
              value={cards?.criticalGaps ?? null}
              accent={
                (cards?.criticalGaps ?? 0) > 0
                  ? "text-red-700"
                  : "text-green-700"
              }
            />
            <IsoCard
              label="Treinamentos vencidos"
              iso="ISO 10015 §4.3"
              value={cards?.expiredTrainings ?? null}
              accent={
                (cards?.expiredTrainings ?? 0) > 0
                  ? "text-red-700"
                  : "text-green-700"
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="text-sm font-semibold">Eficácia por norma</span>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  ISO 10015
                </span>
              </div>
              <div className="space-y-2.5 p-4">
                {byNorm.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem dados.</p>
                ) : (
                  byNorm.map((row) => (
                    <HorizontalBar
                      key={row.norm}
                      label={row.norm}
                      pct={row.effectiveness}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm">
              <div className="border-b px-4 py-3">
                <span className="text-sm font-semibold">
                  Desempenho por filial
                </span>
              </div>
              {byUnit.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">Sem dados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                          Filial
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                          Cumpr.
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                          Eficácia
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {byUnit.map((row) => {
                        const st = UNIT_STATUS[row.status];
                        return (
                          <tr
                            key={row.unitId}
                            className="border-b last:border-0"
                          >
                            <td className="px-4 py-2 font-medium">
                              {row.unitName}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-2",
                                pctColor(row.completion),
                              )}
                            >
                              {formatPct(row.completion)}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-2",
                                pctColor(row.effectiveness),
                              )}
                            >
                              {formatPct(row.effectiveness)}
                            </td>
                            <td className="px-4 py-2">
                              <Badge className={st?.badge ?? ""}>
                                {st?.label ?? row.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Indicadores formais (KPI) — dados independentes do summary; módulo KPI */}
      {canViewKpi ? (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <span className="text-sm font-semibold">
              Indicadores formais (KPI)
            </span>
            <Link
              href="/kpi/indicadores"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Abrir no módulo Indicadores →
            </Link>
          </div>
          {kpiLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              Carregando indicadores…
            </p>
          ) : kpiError ? (
            <p className="px-4 py-8 text-center text-sm text-red-600">
              Não foi possível carregar os indicadores formais.
            </p>
          ) : lmsIndicators.length === 0 ? (
            <div className="space-y-3 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Os indicadores de treinamento ainda não foram ativados como KPI
                desta organização.
              </p>
              {canWriteKpi && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isActivating}
                  onClick={() =>
                    activateIndicators({ orgId, data: { year: currentYear } })
                  }
                >
                  {isActivating
                    ? "Ativando…"
                    : "Ativar indicadores de treinamento"}
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {lmsIndicators.map((ind) => (
                <Link
                  key={ind.id}
                  href={`/kpi/indicadores#ind-card-${ind.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {ind.name}
                    </p>
                    {ind.measurement ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {ind.measurement}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(ind.norms ?? []).map((n) => (
                      <span
                        key={n}
                        className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                      >
                        {normLabelMap.get(n) ?? "#" + n}
                      </span>
                    ))}
                    {ind.unit ? (
                      <span className="text-[11px] text-muted-foreground">
                        {ind.unit}
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          Os indicadores formais de treinamento ficam no módulo Indicadores
          (KPI), ao qual você não tem acesso.
        </div>
      )}
    </div>
  );
}
