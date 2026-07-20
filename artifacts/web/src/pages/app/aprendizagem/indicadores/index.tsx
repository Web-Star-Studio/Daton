import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Download, FileSpreadsheet, FileText } from "lucide-react";
import {
  useGetLearningDashboardSummary,
  getGetLearningDashboardSummaryQueryKey,
  useActivateLmsIndicators,
  useListKpiIndicators,
  getListKpiIndicatorsQueryKey,
  useListUnits,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAllNorms, buildNormLabelMap } from "@/lib/norms-client";
import {
  useActionPlans,
  ACTION_PLAN_STATUS_LABELS,
  actionPlanStatusColor,
  formatCalendarDateBR,
} from "@/lib/action-plans-client";
import type { TrafficLight } from "@/lib/kpi-client";
import {
  LMS_PRIMARY_METRICS,
  STATUS_LABEL,
  findTarget,
  formatMetricValue,
  metricProgress,
  metricStatus,
  type LmsMetricDef,
} from "./_metrics";
import {
  exportLearningIndicatorsToExcel,
  exportLearningIndicatorsToPdf,
} from "./_export";

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

const STATUS_BADGE: Record<TrafficLight, string> = {
  green: "bg-green-50 text-green-700 border-green-200",
  yellow: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_VALUE_COLOR: Record<TrafficLight, string> = {
  green: "text-green-700",
  yellow: "text-amber-700",
  red: "text-red-700",
};

const STATUS_BAR_COLOR: Record<TrafficLight, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

/**
 * Teto de linhas que a rota devolve em `pendingEffectiveness` / `expired`
 * (ver `learning-summary.ts`). Amostras, não contagens — a tela precisa saber
 * disso para não apresentar o tamanho da lista como total.
 */
const PENDING_SAMPLE_LIMIT = 20;

const UNIT_STATUS: Record<
  LearningSummaryUnitRow["status"],
  { label: string; badge: string }
> = {
  ok: { label: "OK", badge: "bg-green-50 text-green-700" },
  atencao: { label: "Atenção", badge: "bg-amber-50 text-amber-700" },
  critico: { label: "Crítico", badge: "bg-red-50 text-red-700" },
  "sem-dados": { label: "Sem dados", badge: "bg-muted text-muted-foreground" },
};

/** Rótulo de seção do mockup: caixa alta, pequeno, espaçado. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * Card de indicador do mockup: nome + cláusula, selo de situação, valor
 * grande, linha de meta e barra de progresso. A situação e a meta vêm de
 * `summary.targets` (config do módulo KPI da organização) — não de constante
 * na tela.
 */
function IndicatorCard({
  def,
  value,
  target,
}: {
  def: LmsMetricDef;
  value: number | null;
  target: ReturnType<typeof findTarget>;
}) {
  const status = metricStatus(value, target);
  const progress = metricProgress(value, target);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight text-foreground">
            {def.label}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {def.isoRef}
          </div>
        </div>
        {status && (
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[10px]", STATUS_BADGE[status])}
          >
            {STATUS_LABEL[status]}
          </Badge>
        )}
      </div>

      <div
        className={cn(
          "mt-2 text-3xl font-semibold tracking-tight",
          status ? STATUS_VALUE_COLOR[status] : "text-muted-foreground",
        )}
      >
        {formatMetricValue(value, def.format)}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {target && (
          <span>
            Meta{" "}
            <strong className="font-semibold text-foreground">
              {formatMetricValue(target.goal, def.format)}
            </strong>
          </span>
        )}
        {target?.direction === "down" && <span>menor é melhor</span>}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        {progress !== null && (
          <div
            className={cn(
              "h-full rounded-full transition-all",
              status ? STATUS_BAR_COLOR[status] : "bg-muted-foreground/40",
            )}
            style={{ width: `${progress}%` }}
          />
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
  const { user, organization } = useAuth();
  const orgId = user?.organizationId ?? 0;
  const { canWriteModule, hasModuleAccess } = usePermissions();
  const canAccess = hasModuleAccess("employees");
  // A lista/ativação de indicadores formais vive no módulo KPI — gateia por ele.
  const canViewKpi = hasModuleAccess("kpi");
  const canWriteKpi = canWriteModule("kpi");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const prefix = location.startsWith("/app/") ? "/app" : "";
  const { data: allNorms = [] } = useAllNorms(orgId);
  const normLabelMap = useMemo(() => buildNormLabelMap(allNorms), [allNorms]);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [unitFilter, setUnitFilter] = useState(""); // "" = todas as filiais

  const { data: units = [] } = useListUnits(orgId);

  const unitId = unitFilter ? Number(unitFilter) : undefined;
  const selectedUnitName =
    units.find((u) => String(u.id) === unitFilter)?.name ?? null;

  const summaryParams = useMemo(
    () => (unitId !== undefined ? { year, unitId } : { year }),
    [year, unitId],
  );

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

  // Ações originadas em treinamento. O endpoint não filtra por filial, então
  // este painel é sempre da organização — sinalizado no título quando há
  // recorte de filial ativo, pra não parecer que respeita o filtro.
  const { data: actionPlans = [] } = useActionPlans(orgId, {
    sourceModule: "training",
  });
  const recentActions = useMemo(
    () =>
      [...actionPlans]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    [actionPlans],
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

  const byNorm: LearningSummaryNormRow[] = summary?.byNorm ?? [];
  const byUnit: LearningSummaryUnitRow[] = summary?.byUnit ?? [];

  // Norma mais distante da meta de eficácia — vira a caixa de alerta do mockup.
  const effTarget = findTarget(summary?.targets, "effectiveness_overall");
  const worstNorm = useMemo(() => {
    if (!effTarget) return null;
    const below = byNorm.filter(
      (n) => n.effectiveness !== null && n.effectiveness < effTarget.goal,
    );
    if (below.length === 0) return null;
    return below.reduce((a, b) =>
      (a.effectiveness ?? 0) <= (b.effectiveness ?? 0) ? a : b,
    );
  }, [byNorm, effTarget]);

  function handleExport(format: "excel" | "pdf") {
    if (!summary) {
      toast({
        title: "Nada pra exportar",
        description: "Os indicadores ainda não foram carregados.",
        variant: "destructive",
      });
      return;
    }
    try {
      const input = {
        summary,
        orgName: organization?.tradeName ?? organization?.name,
        year,
        unitName: selectedUnitName,
      };
      if (format === "excel") {
        exportLearningIndicatorsToExcel(input);
      } else {
        exportLearningIndicatorsToPdf(input);
      }
      toast({
        title: `Relatório exportado (${format === "excel" ? "Excel" : "PDF"})`,
      });
    } catch (err) {
      console.error(err);
      toast({ title: "Falha ao exportar", variant: "destructive" });
    }
  }

  if (!orgId) return null;

  if (!canAccess) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        Você não tem acesso a este módulo.
      </div>
    );
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i).map(
    (y) => ({ value: String(y), label: String(y) }),
  );
  const unitOptions = [
    { value: "", label: "Todas as filiais" },
    ...units.map((u) => ({ value: String(u.id), label: u.name })),
  ];

  return (
    <div className="space-y-5">
      {/* Barra de ferramentas — período, filial e export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          ISO 9001 §9.1 · ISO 10015 · {year}
          {selectedUnitName ? ` · ${selectedUnitName}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-28">
            <SearchableSelect
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              options={yearOptions}
              placeholder="Ano"
            />
          </div>
          <div className="w-52">
            <SearchableSelect
              value={unitFilter}
              onChange={setUnitFilter}
              options={unitOptions}
              placeholder="Todas as filiais"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Exportar relatório
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                <FileText className="mr-2 h-4 w-4" /> PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("excel")}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {summaryLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Carregando indicadores…
        </p>
      ) : summaryError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Não foi possível carregar os indicadores. Tente novamente.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* ── Coluna esquerda ── */}
          <div>
            <SectionLabel>Cumprimento e cobertura</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              {LMS_PRIMARY_METRICS.map((def) => (
                <IndicatorCard
                  key={def.key}
                  def={def}
                  value={summary ? def.read(summary.cards) : null}
                  target={findTarget(summary?.targets, def.key)}
                />
              ))}
            </div>

            <div className="mt-5">
              <SectionLabel>Eficácia por norma</SectionLabel>
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                {byNorm.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem dados.</p>
                ) : (
                  <div className="space-y-2.5">
                    {byNorm.map((row) => (
                      <HorizontalBar
                        key={row.norm}
                        label={row.norm}
                        pct={row.effectiveness}
                      />
                    ))}
                  </div>
                )}

                {worstNorm && effTarget && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                    <span>
                      <strong>{worstNorm.norm}</strong> com{" "}
                      {formatPct(worstNorm.effectiveness)} — a meta de eficácia
                      é {Math.round(effTarget.goal)}%. Risco para auditoria de
                      certificação.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Coluna direita ── */}
          <div>
            <SectionLabel>Desempenho por filial</SectionLabel>
            <div className="rounded-xl border bg-card shadow-sm">
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
                          Gap
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
                            <td
                              className={cn(
                                "px-4 py-2 font-medium",
                                row.gaps > 0
                                  ? "text-red-700"
                                  : "text-muted-foreground",
                              )}
                            >
                              {row.gaps}
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

            <div className="mt-5">
              <SectionLabel>
                Ações geradas
                {selectedUnitName ? " · toda a organização" : ""}
              </SectionLabel>
              <div className="rounded-xl border bg-card shadow-sm">
                {recentActions.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">
                    Nenhuma ação originada de treinamento até aqui.
                  </p>
                ) : (
                  <div className="divide-y">
                    {recentActions.map((a) => (
                      <Link
                        key={a.id}
                        href={`${prefix}/planos-acao/${a.id}`}
                        className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30"
                      >
                        <span
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            a.status === "completed"
                              ? "bg-green-500"
                              : a.status === "cancelled"
                                ? "bg-muted-foreground/40"
                                : a.status === "in_progress"
                                  ? "bg-blue-500"
                                  : "bg-amber-500",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {a.code ? `${a.code} · ` : ""}
                            {a.title}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px]",
                                actionPlanStatusColor(a.status),
                              )}
                            >
                              {ACTION_PLAN_STATUS_LABELS[a.status]}
                            </Badge>
                            {a.sourceContext?.label && (
                              <span className="truncate">
                                {a.sourceContext.label}
                              </span>
                            )}
                            {a.responsibleUserName && (
                              <span>Resp: {a.responsibleUserName}</span>
                            )}
                            {a.dueDate && (
                              <span>
                                Prazo {formatCalendarDateBR(a.dueDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Vencidos e eficácia pendente já vinham na resposta da API e não
                eram mostrados em lugar nenhum — aqui viram pendências visíveis. */}
            <div className="mt-5">
              <SectionLabel>Pendências</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="text-[13px] font-semibold">
                    Treinamentos vencidos
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-2xl font-semibold",
                      (summary?.cards.expiredTrainings ?? 0) > 0
                        ? "text-red-700"
                        : "text-green-700",
                    )}
                  >
                    {summary?.cards.expiredTrainings ?? "—"}
                  </div>
                  {/* A amostra só aparece quando a contagem do exercício é
                      positiva: `expired` é a lista de vencidos DE HOJE e não
                      acompanha o filtro de ano, então exibi-la ao lado de um
                      "0" de um exercício passado seria contraditório. */}
                  {(summary?.cards.expiredTrainings ?? 0) > 0 &&
                    summary!.expired.length > 0 && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {summary!.expired[0]!.employeeName} ·{" "}
                        {summary!.expired[0]!.title}
                      </p>
                    )}
                </div>
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="text-[13px] font-semibold">
                    Eficácia pendente
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {summary
                      ? // A rota devolve no máximo PENDING_SAMPLE_LIMIT linhas;
                        // no teto, o total real é maior — "20+" evita cravar um
                        // número que não é a contagem.
                        summary.pendingEffectiveness.length >=
                          PENDING_SAMPLE_LIMIT
                        ? `${PENDING_SAMPLE_LIMIT}+`
                        : summary.pendingEffectiveness.length
                      : "—"}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    concluídos sem avaliação
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
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
