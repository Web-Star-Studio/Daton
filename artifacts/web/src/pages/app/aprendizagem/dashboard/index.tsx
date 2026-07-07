import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLearningDashboardSummary,
  getGetLearningDashboardSummaryQueryKey,
  useActivateLmsIndicators,
} from "@workspace/api-client-react";
import type {
  LearningSummaryUnitRow,
  LearningSummaryNormRow,
  LearningSummaryExpiredRow,
  LearningSummaryPendingRow,
} from "@workspace/api-client-react";
import { usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
}

function formatDate(iso: string): string {
  // Parse YYYY-MM-DD as local date to avoid UTC midnight shift.
  const parts = iso.slice(0, 10).split("-");
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
    }
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
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

function unitStatusBarColor(status: LearningSummaryUnitRow["status"]): string {
  switch (status) {
    case "ok":
      return "bg-green-500";
    case "atencao":
      return "bg-amber-400";
    case "critico":
      return "bg-red-500";
    default:
      return "bg-muted";
  }
}

function unitStatusTextColor(status: LearningSummaryUnitRow["status"]): string {
  switch (status) {
    case "ok":
      return "text-green-700";
    case "atencao":
      return "text-amber-700";
    case "critico":
      return "text-red-700";
    default:
      return "text-muted-foreground";
  }
}

function MetricCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number | null;
  unit?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", accent)}>
        {value === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {value}
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

function HorizontalBar({
  label,
  pct,
  barColor,
  textColor,
}: {
  label: string;
  pct: number | null;
  barColor: string;
  textColor: string;
}) {
  const width = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-2">
      <span className="w-40 shrink-0 truncate text-xs text-foreground">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={cn("w-9 shrink-0 text-right text-xs font-medium", textColor)}>
        {formatPct(pct)}
      </span>
    </div>
  );
}

export default function LearningDashboardPage() {
  usePageTitle("Dashboard");
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("employees");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentYear = new Date().getFullYear();
  const params = { year: currentYear };

  const {
    data: summary,
    isLoading,
    isError,
  } = useGetLearningDashboardSummary(orgId ?? 0, params, {
    query: {
      enabled: !!orgId,
      queryKey: getGetLearningDashboardSummaryQueryKey(orgId ?? 0, params),
    },
  });

  const { mutate: activateIndicators, isPending: isActivating } = useActivateLmsIndicators({
    mutation: {
      onSuccess: () => {
        toast({ title: "Indicadores de treinamento ativados" });
        queryClient.invalidateQueries({
          queryKey: getGetLearningDashboardSummaryQueryKey(orgId ?? 0, params),
        });
      },
      onError: () => {
        toast({ title: "Erro ao ativar indicadores", variant: "destructive" });
      },
    },
  });

  if (!orgId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Carregando dashboard…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Não foi possível carregar o dashboard. Tente novamente.
      </div>
    );
  }

  const cards = summary?.cards;
  const byUnit: LearningSummaryUnitRow[] = summary?.byUnit ?? [];
  const byNorm: LearningSummaryNormRow[] = summary?.byNorm ?? [];
  const expired: LearningSummaryExpiredRow[] = summary?.expired ?? [];
  const pending: LearningSummaryPendingRow[] = summary?.pendingEffectiveness ?? [];
  const criticalUnits = byUnit.filter((u) => u.status === "critico");

  const isEmpty =
    byUnit.length === 0 &&
    byNorm.length === 0 &&
    expired.length === 0 &&
    pending.length === 0 &&
    cards?.patCompletion === null;

  if (isEmpty) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        Nenhum dado disponível para o período selecionado.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: subtítulo consolidado + ações */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Visão consolidada do programa de treinamentos
        </p>
        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            disabled={isActivating || !orgId}
            onClick={() => {
              if (!orgId) return;
              activateIndicators({ orgId, data: { year: currentYear } });
            }}
          >
            {isActivating ? "Ativando…" : "Ativar indicadores de treinamento"}
          </Button>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Cumprimento do programa"
          value={cards?.patCompletion ?? null}
          unit="%"
          accent={pctColor(cards?.patCompletion ?? null)}
        />
        <MetricCard
          label="Eficácia geral"
          value={cards?.effectiveness ?? null}
          unit="%"
          accent={pctColor(cards?.effectiveness ?? null)}
        />
        <MetricCard
          label="Colaboradores com gap"
          value={cards?.criticalGaps ?? null}
          accent={
            (cards?.criticalGaps ?? 0) > 0 ? "text-red-700" : "text-green-700"
          }
        />
        <MetricCard
          label="Treinamentos vencidos"
          value={cards?.expiredTrainings ?? null}
          accent={
            (cards?.expiredTrainings ?? 0) > 0
              ? "text-red-700"
              : "text-green-700"
          }
        />
      </div>

      {/* By Unit + By Norm */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cumprimento por filial */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Cumprimento por filial</span>
            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              ISO 9001 §9.1
            </span>
          </div>
          <div className="space-y-2.5 p-4">
            {byUnit.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados.</p>
            ) : (
              byUnit.map((row) => (
                <HorizontalBar
                  key={row.unitId}
                  label={row.unitName}
                  pct={row.completion}
                  barColor={unitStatusBarColor(row.status)}
                  textColor={unitStatusTextColor(row.status)}
                />
              ))
            )}
          </div>
        </div>

        {/* Eficácia por norma ISO */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Eficácia por norma ISO</span>
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
                  barColor={pctBarColor(row.effectiveness)}
                  textColor={pctColor(row.effectiveness)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Alerta: filiais em estado crítico de cumprimento */}
      {criticalUnits.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span aria-hidden className="mt-0.5 font-semibold">
            ⚠
          </span>
          <span>
            {criticalUnits.length === 1
              ? `1 filial em estado crítico de cumprimento (${criticalUnits[0].unitName}) — priorize planos de ação.`
              : `${criticalUnits.length} filiais em estado crítico de cumprimento — priorize planos de ação.`}
          </span>
        </div>
      )}

      {/* Expired + Pending Effectiveness */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Colaboradores com treinamento vencido */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <span className="text-sm font-semibold">
              Colaboradores com treinamento vencido
            </span>
          </div>
          {expired.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              Nenhum treinamento vencido.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Colaborador
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Filial
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Treinamento
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Venceu em
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expired.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20"
                    >
                      <td className="px-4 py-2 font-medium">{row.employeeName}</td>
                      <td className="px-4 py-2">
                        {row.unitName ? (
                          <Badge className="bg-muted text-muted-foreground">
                            {row.unitName}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">{row.title}</td>
                      <td className="px-4 py-2">
                        <Badge className="bg-red-50 text-red-700">
                          {formatDate(row.expirationDate)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Avaliações de eficácia pendentes */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">
              Avaliações de eficácia pendentes
            </span>
            {pending.length > 0 && (
              <Badge className="bg-muted text-muted-foreground">
                {pending.length}
              </Badge>
            )}
          </div>
          {pending.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              Nenhuma avaliação pendente.
            </p>
          ) : (
            <div className="divide-y">
              {pending.map((row, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">
                      {row.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {row.employeeName}
                    </div>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3">
                <Link
                  href="/aprendizagem/eficacia"
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Ver todas →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
