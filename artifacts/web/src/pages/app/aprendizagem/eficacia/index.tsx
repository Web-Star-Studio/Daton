import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrganizationTrainings,
  useListUnits,
  getListOrganizationTrainingsQueryKey,
  getListUnitsQueryKey,
} from "@workspace/api-client-react";
import { useActiveNorms } from "@/lib/norms-client";
import type {
  OrganizationTraining,
  ListOrganizationTrainingsEvaluatorRole,
} from "@workspace/api-client-react";
import { usePageTitle, usePageSubtitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { formatKpiNumber } from "@/lib/kpi-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CriarAcaoButton } from "@/pages/app/planos-acao/_components/criar-acao-button";
import { AcoesVinculadas } from "@/pages/app/planos-acao/_components/acoes-vinculadas";
import {
  AvaliacaoEficaciaWizard,
  ROLE_OPTIONS,
} from "./_components/avaliacao-wizard";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;
const CURRENT_YEAR = new Date().getFullYear();

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-");
  const due = new Date(Number(y), Number(m) - 1, Number(d));
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Format a date-only ISO string (YYYY-MM-DD) as DD/MM/AA without timezone shift. */
function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}

// Implementação única no wizard; reexportado aqui porque é o ponto de import
// histórico da página (e do teste unitário da nota).
export { computeEffectivenessScore } from "./_components/avaliacao-wizard";

function UrgencyBadge({ dueDate }: { dueDate?: string | null }) {
  if (!dueDate) return null;
  const d = daysUntil(dueDate);
  if (d < 0)
    return (
      <Badge className="bg-red-50 text-red-700 border-red-200">Atrasado</Badge>
    );
  if (d <= 7)
    return (
      <Badge className="bg-red-50 text-red-700 border-red-200">Urgente</Badge>
    );
  if (d <= 15)
    return (
      <Badge className="bg-amber-50 text-amber-700 border-amber-200">
        Em prazo
      </Badge>
    );
  return (
    <Badge className="bg-blue-50 text-blue-700 border-blue-200">No prazo</Badge>
  );
}

const ROLE_LABEL: Record<string, string> = {
  gestor: "Gestor",
  rh: "RH",
  instrutor: "Instrutor",
  colaborador: "Colab.",
};

const ROLE_CLASS: Record<string, string> = {
  gestor: "bg-amber-50 text-amber-700 border-amber-200",
  rh: "bg-blue-50 text-blue-700 border-blue-200",
  instrutor: "bg-teal-50 text-teal-700 border-teal-200",
  colaborador: "bg-purple-50 text-purple-700 border-purple-200",
};

function RoleBadge({ role }: { role?: string | null }) {
  if (!role) return null;
  return (
    <Badge className={cn(ROLE_CLASS[role] ?? "bg-muted text-muted-foreground")}>
      {ROLE_LABEL[role] ?? role}
    </Badge>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function EficaciaPage() {
  usePageTitle("Avaliação de eficácia");
  usePageSubtitle("ISO 10015 §4.5 · Kirkpatrick Nível 3 e 4");

  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("employees");
  const queryClient = useQueryClient();

  // ── Filter state ──────────────────────────────────────────────────────────

  const [unitId, setUnitId] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [normId, setNormId] = useState<string>("");
  const [evaluatorRole, setEvaluatorRole] = useState<string>("");

  // Per-column page sizes (grow-pageSize pagination — each column independent)
  const [pageSizePendentes, setPageSizePendentes] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeEmAvaliacao, setPageSizeEmAvaliacao] =
    useState(DEFAULT_PAGE_SIZE);
  const [pageSizeConcluidas, setPageSizeConcluidas] =
    useState(DEFAULT_PAGE_SIZE);

  function resetPageSizes() {
    setPageSizePendentes(DEFAULT_PAGE_SIZE);
    setPageSizeEmAvaliacao(DEFAULT_PAGE_SIZE);
    setPageSizeConcluidas(DEFAULT_PAGE_SIZE);
  }

  // Filter setters that also reset pagination
  function handleSetUnitId(v: string) {
    setUnitId(v);
    resetPageSizes();
  }
  function handleSetYear(v: string) {
    setYear(v);
    resetPageSizes();
  }
  function handleSetNormId(v: string) {
    setNormId(v);
    resetPageSizes();
  }
  function handleSetEvaluatorRole(v: string) {
    setEvaluatorRole(v);
    resetPageSizes();
  }

  // ── Filter data: units and catalog norms ──────────────────────────────────

  const { data: units } = useListUnits(orgId ?? 0, {
    query: { enabled: !!orgId, queryKey: getListUnitsQueryKey(orgId ?? 0) },
  });

  const { data: activeNorms = [] } = useActiveNorms(orgId ?? 0);

  const unitOptions = useMemo(
    () =>
      (units ?? []).map((u) => ({
        value: String(u.id),
        label: u.code ? `${u.code} — ${u.name}` : u.name,
      })),
    [units],
  );

  const normOptions = useMemo(
    () => activeNorms.map((n) => ({ value: String(n.id), label: n.label })),
    [activeNorms],
  );

  const yearOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    for (let y = CURRENT_YEAR; y >= 2009; y--) {
      opts.push({ value: String(y), label: String(y) });
    }
    return opts;
  }, []);

  // ── Shared query params ───────────────────────────────────────────────────

  const sharedParams = {
    status: "concluido" as const,
    // Escopo fixo: o board de eficácia nunca mostra o histórico puro
    // (reuniões/orientações que nunca entram no fluxo de eficácia). A
    // cliente pediu para remover o toggle "Ver todos" — a única diferença
    // entre "all" e "needs_evaluation" é justamente esse histórico.
    scope: "needs_evaluation" as const,
    unitId: unitId ? Number(unitId) : undefined,
    year: year ? Number(year) : undefined,
    normId: normId ? Number(normId) : undefined,
    evaluatorRole: (evaluatorRole || undefined) as
      | ListOrganizationTrainingsEvaluatorRole
      | undefined,
  };

  // ── Three column queries ──────────────────────────────────────────────────

  const paramsPendentes = {
    ...sharedParams,
    boardColumn: "pendentes" as const,
    page: 1,
    pageSize: pageSizePendentes,
  };
  const { data: resultPendentes, isLoading: loadingPendentes } =
    useListOrganizationTrainings(orgId ?? 0, paramsPendentes, {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationTrainingsQueryKey(
          orgId ?? 0,
          paramsPendentes,
        ),
      },
    });

  const paramsEmAvaliacao = {
    ...sharedParams,
    boardColumn: "em_avaliacao" as const,
    page: 1,
    pageSize: pageSizeEmAvaliacao,
  };
  const { data: resultEmAvaliacao, isLoading: loadingEmAvaliacao } =
    useListOrganizationTrainings(orgId ?? 0, paramsEmAvaliacao, {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationTrainingsQueryKey(
          orgId ?? 0,
          paramsEmAvaliacao,
        ),
      },
    });

  const paramsConcluidas = {
    ...sharedParams,
    boardColumn: "concluidas" as const,
    page: 1,
    pageSize: pageSizeConcluidas,
  };
  const { data: resultConcluidas, isLoading: loadingConcluidas } =
    useListOrganizationTrainings(orgId ?? 0, paramsConcluidas, {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationTrainingsQueryKey(
          orgId ?? 0,
          paramsConcluidas,
        ),
      },
    });

  const isLoading = loadingPendentes || loadingEmAvaliacao || loadingConcluidas;

  const pendentes = resultPendentes?.data ?? [];
  const emAvaliacao = resultEmAvaliacao?.data ?? [];
  const concluidas = resultConcluidas?.data ?? [];

  // Stats come from any of the three queries — use pendentes (same for all)
  const stats = resultPendentes?.stats;
  const boardCounts = stats?.boardCounts;

  // ── Metric values from server stats ──────────────────────────────────────

  const metricPendentes = boardCounts?.pendentes ?? 0;
  const metricEficazPct =
    stats?.eficazPercent != null ? `${stats.eficazPercent}%` : "—";
  const metricNaoEficazes = stats?.naoEficazes ?? 0;
  const metricOnTimePct =
    stats?.onTimePercent != null ? `${stats.onTimePercent}%` : "—";

  // ── Invalidate ────────────────────────────────────────────────────────────

  const invalidate = () => {
    if (orgId)
      queryClient.invalidateQueries({
        queryKey: getListOrganizationTrainingsQueryKey(orgId),
      });
  };

  // ── Wizard de avaliação (Contexto → Critérios → Resultado) ────────────────
  // Um único alvo: "Iniciar avaliação" e "Registrar avaliação" abrem o mesmo
  // wizard, que decide em qual passo entrar. Antes eram dois diálogos soltos e
  // iniciar a avaliação devolvia o avaliador ao board sem nada preenchido.

  const [wizardTarget, setWizardTarget] = useState<OrganizationTraining | null>(
    null,
  );

  // O wizard reidrata do rascunho que vem no próprio card; após cada gravação a
  // lista é invalidada, então repescamos a versão fresca do treinamento para o
  // wizard não continuar com o rascunho antigo em mãos.
  const wizardTraining = useMemo(() => {
    if (!wizardTarget) return null;
    const fresh = [
      ...(resultPendentes?.data ?? []),
      ...(resultEmAvaliacao?.data ?? []),
      ...(resultConcluidas?.data ?? []),
    ].find((t) => t.id === wizardTarget.id);
    return fresh ?? wizardTarget;
  }, [wizardTarget, resultPendentes, resultEmAvaliacao, resultConcluidas]);


  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Metric cards — sourced from server stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Pendentes"
          value={metricPendentes}
          subtitle="a realizar"
          accent="text-amber-700"
        />
        <Metric
          label="Eficazes"
          value={metricEficazPct}
          subtitle="média geral"
          accent="text-green-700"
        />
        <Metric
          label="Não eficazes"
          value={metricNaoEficazes}
          subtitle="ação corretiva aberta"
          accent="text-red-700"
        />
        <Metric
          label="Realizadas no prazo"
          value={metricOnTimePct}
          subtitle=""
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Filial */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <Label className="text-xs text-muted-foreground">Filial</Label>
          <SearchableSelect
            value={unitId}
            onChange={handleSetUnitId}
            options={unitOptions}
            placeholder="Todas as filiais"
            searchPlaceholder="Buscar filial..."
          />
        </div>

        {/* Ano */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Ano</Label>
          <Select
            value={year}
            onChange={(e) => handleSetYear(e.target.value)}
            className="w-auto text-sm"
          >
            <option value="">Todos os anos</option>
            {yearOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Norma */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Norma</Label>
          <SearchableSelect
            value={normId}
            onChange={handleSetNormId}
            options={normOptions}
            placeholder="Todas as normas"
            searchPlaceholder="Buscar norma..."
          />
        </div>

        {/* Avaliador */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Avaliador</Label>
          <Select
            value={evaluatorRole}
            onChange={(e) => handleSetEvaluatorRole(e.target.value)}
            className="w-auto text-sm"
          >
            <option value="">Todos os avaliadores</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Column: Pendentes */}
          <Column title="Pendentes" count={boardCounts?.pendentes ?? 0}>
            {pendentes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nada pendente.</p>
            ) : null}
            {pendentes.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border bg-card p-3 shadow-sm"
              >
                <div className="text-sm font-medium">{t.employeeName}</div>
                <div className="text-xs text-muted-foreground">{t.title}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                    A avaliar
                  </Badge>
                </div>
                {canWrite ? (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setWizardTarget(t)}
                    >
                      Iniciar avaliação
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {pageSizePendentes < (boardCounts?.pendentes ?? 0) ? (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() =>
                  setPageSizePendentes((n) => n + DEFAULT_PAGE_SIZE)
                }
              >
                Carregar mais
              </Button>
            ) : null}
          </Column>

          {/* Column: Em avaliação */}
          <Column title="Em avaliação" count={boardCounts?.emAvaliacao ?? 0}>
            {emAvaliacao.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum em avaliação.
              </p>
            ) : null}
            {emAvaliacao.map((t) => {
              const days = t.effectivenessDueDate
                ? daysUntil(t.effectivenessDueDate)
                : null;
              return (
                <div
                  key={t.id}
                  className="rounded-xl border bg-card p-3 shadow-sm"
                >
                  <div className="text-sm font-medium">{t.employeeName}</div>
                  <div className="text-xs text-muted-foreground">{t.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <RoleBadge role={t.effectivenessAssignedRole} />
                    <UrgencyBadge dueDate={t.effectivenessDueDate} />
                    {t.effectivenessDraft ? (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                        Preenchimento iniciado
                      </Badge>
                    ) : null}
                  </div>
                  {days != null && days >= 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Vence em {days} dias
                    </p>
                  ) : null}
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => setWizardTarget(t)}
                    >
                      {t.effectivenessDraft
                        ? "Continuar avaliação"
                        : "Avaliar agora"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {pageSizeEmAvaliacao < (boardCounts?.emAvaliacao ?? 0) ? (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() =>
                  setPageSizeEmAvaliacao((n) => n + DEFAULT_PAGE_SIZE)
                }
              >
                Carregar mais
              </Button>
            ) : null}
          </Column>

          {/* Column: Concluídas */}
          <Column title="Concluídas" count={boardCounts?.concluidas ?? 0}>
            {concluidas.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma avaliação ainda.
              </p>
            ) : null}
            {concluidas.map((t) => {
              const ineffective = t.effectivenessStatus === "ineffective";
              return (
                <div
                  key={t.id}
                  className="rounded-xl border bg-card p-3 shadow-sm"
                >
                  <div className="text-sm font-medium">{t.employeeName}</div>
                  <div className="text-xs text-muted-foreground">{t.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {t.effectivenessStatus === "effective" ? (
                      <Badge className="bg-green-50 text-green-700 border-green-200">
                        Eficaz
                      </Badge>
                    ) : (
                      <Badge className="bg-red-50 text-red-700 border-red-200">
                        Não eficaz
                      </Badge>
                    )}
                    {t.effectivenessScorePercent != null ? (
                      <span className="text-xs text-muted-foreground">
                        Eficácia: {formatKpiNumber(t.effectivenessScorePercent)}%
                        {t.latestEffectivenessReview?.evaluationDate
                          ? ` · Concluída ${fmtDateShort(t.latestEffectivenessReview.evaluationDate)}`
                          : ""}
                      </span>
                    ) : t.latestEffectivenessReview?.evaluationDate ? (
                      <span className="text-xs text-muted-foreground">
                        Concluída{" "}
                        {fmtDateShort(
                          t.latestEffectivenessReview.evaluationDate,
                        )}
                      </span>
                    ) : null}
                    {(t.reviewerCount ?? 0) > 1 ? (
                      <Badge className="bg-teal-50 text-teal-700 border-teal-200">
                        {t.reviewerCount} avaliadores
                      </Badge>
                    ) : null}
                  </div>
                  {ineffective && orgId ? (
                    <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
                      <AcoesVinculadas
                        orgId={orgId}
                        sourceModule="training"
                        refId={t.id}
                      />
                      {canWrite ? (
                        <CriarAcaoButton
                          orgId={orgId}
                          source={{
                            sourceModule: "training",
                            sourceRef: { trainingId: t.id },
                          }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {pageSizeConcluidas < (boardCounts?.concluidas ?? 0) ? (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() =>
                  setPageSizeConcluidas((n) => n + DEFAULT_PAGE_SIZE)
                }
              >
                Carregar mais
              </Button>
            ) : null}
          </Column>
        </div>
      )}

      {wizardTraining ? (
        <AvaliacaoEficaciaWizard
          // Remonta ao trocar de card: o passo/rascunho é estado interno e não
          // pode vazar de uma avaliação para outra.
          key={wizardTraining.id}
          orgId={orgId ?? 0}
          training={wizardTraining}
          onClose={() => setWizardTarget(null)}
          onSaved={invalidate}
        />
      ) : null}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", accent)}>{value}</div>
      {subtitle ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
  );
}

function Column({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {title}
        </h3>
        <Badge className="bg-muted text-muted-foreground">{count}</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
