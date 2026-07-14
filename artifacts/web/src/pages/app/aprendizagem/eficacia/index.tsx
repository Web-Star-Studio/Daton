import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrganizationTrainings,
  useCreateTrainingEffectivenessReview,
  useAssignTrainingEffectiveness,
  useListUnits,
  getListOrganizationTrainingsQueryKey,
  getListUnitsQueryKey,
} from "@workspace/api-client-react";
import { useAllTrainingCatalog } from "@/lib/training-catalog-client";
import type {
  OrganizationTraining,
  ListOrganizationTrainingsEvaluatorRole,
} from "@workspace/api-client-react";
import { usePageTitle, usePageSubtitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatKpiNumber } from "@/lib/kpi-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CriarAcaoButton } from "@/pages/app/planos-acao/_components/criar-acao-button";
import { AcoesVinculadas } from "@/pages/app/planos-acao/_components/acoes-vinculadas";

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

/** Return local date string YYYY-MM-DD without UTC shift. */
function localDateToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Format a date-only ISO string (YYYY-MM-DD) as DD/MM/AA without timezone shift. */
function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}

/**
 * Nota de eficácia (0–10) a partir da média dos 3 critérios Kirkpatrick (1–5).
 * `avg * 2` leva da escala 1–5 para 0–10; duas casas é o que a coluna
 * numeric(4,2) guarda e o que a tela exibe (ex.: média 3,67 → 7,33).
 */
export function computeEffectivenessScore(avg: number): number {
  return Math.round(avg * 2 * 100) / 100;
}

function UrgencyBadge({ dueDate }: { dueDate?: string | null }) {
  if (!dueDate) return null;
  const d = daysUntil(dueDate);
  if (d < 0)
    return <Badge className="bg-red-50 text-red-700 border-red-200">Atrasado</Badge>;
  if (d <= 7)
    return <Badge className="bg-red-50 text-red-700 border-red-200">Urgente</Badge>;
  if (d <= 15)
    return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Em prazo</Badge>;
  return <Badge className="bg-blue-50 text-blue-700 border-blue-200">No prazo</Badge>;
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

// ─── Criteria ───────────────────────────────────────────────────────────────

const CRITERIA = [
  { key: "behavior", label: "Aplica no dia a dia (comportamento · L3)" },
  { key: "result", label: "Melhorou o desempenho / reduziu incidentes (resultado · L4)" },
  { key: "transfer", label: "Multiplica o conhecimento para a equipe (transferência)" },
] as const;

type CriteriaKey = (typeof CRITERIA)[number]["key"];

const ROLE_OPTIONS = [
  { value: "gestor", label: "Gestor" },
  { value: "rh", label: "RH" },
  { value: "instrutor", label: "Instrutor" },
  { value: "colaborador", label: "Colaborador" },
] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function EficaciaPage() {
  usePageTitle("Avaliação de eficácia");
  usePageSubtitle("ISO 10015 §4.5 · Kirkpatrick Nível 3 e 4");

  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("employees");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Filter state ──────────────────────────────────────────────────────────

  const [unitId, setUnitId] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [norm, setNorm] = useState<string>("");
  const [evaluatorRole, setEvaluatorRole] = useState<string>("");
  const [scope, setScope] = useState<"needs_evaluation" | "all">("needs_evaluation");

  // Per-column page sizes (grow-pageSize pagination — each column independent)
  const [pageSizePendentes, setPageSizePendentes] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeEmAvaliacao, setPageSizeEmAvaliacao] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeConcluidas, setPageSizeConcluidas] = useState(DEFAULT_PAGE_SIZE);

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
  function handleSetNorm(v: string) {
    setNorm(v);
    resetPageSizes();
  }
  function handleSetEvaluatorRole(v: string) {
    setEvaluatorRole(v);
    resetPageSizes();
  }
  function handleSetScope(v: "needs_evaluation" | "all") {
    setScope(v);
    resetPageSizes();
  }

  // ── Filter data: units and catalog norms ──────────────────────────────────

  const { data: units } = useListUnits(orgId ?? 0, {
    query: { enabled: !!orgId, queryKey: getListUnitsQueryKey(orgId ?? 0) },
  });

  const { data: catalog } = useAllTrainingCatalog(orgId ?? 0, undefined, {
    query: { enabled: !!orgId },
  });

  const unitOptions = useMemo(
    () =>
      (units ?? []).map((u) => ({
        value: String(u.id),
        label: u.code ? `${u.code} — ${u.name}` : u.name,
      })),
    [units],
  );

  const normOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: Array<{ value: string; label: string }> = [];
    for (const item of catalog?.data ?? []) {
      if (item.norm && !seen.has(item.norm)) {
        seen.add(item.norm);
        opts.push({ value: item.norm, label: item.norm });
      }
    }
    return opts;
  }, [catalog]);

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
    scope,
    unitId: unitId ? Number(unitId) : undefined,
    year: year ? Number(year) : undefined,
    norm: norm || undefined,
    evaluatorRole: (evaluatorRole || undefined) as ListOrganizationTrainingsEvaluatorRole | undefined,
  };

  // ── Three column queries ──────────────────────────────────────────────────

  const paramsPendentes = { ...sharedParams, boardColumn: "pendentes" as const, page: 1, pageSize: pageSizePendentes };
  const { data: resultPendentes, isLoading: loadingPendentes } = useListOrganizationTrainings(
    orgId ?? 0,
    paramsPendentes,
    {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationTrainingsQueryKey(orgId ?? 0, paramsPendentes),
      },
    },
  );

  const paramsEmAvaliacao = { ...sharedParams, boardColumn: "em_avaliacao" as const, page: 1, pageSize: pageSizeEmAvaliacao };
  const { data: resultEmAvaliacao, isLoading: loadingEmAvaliacao } = useListOrganizationTrainings(
    orgId ?? 0,
    paramsEmAvaliacao,
    {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationTrainingsQueryKey(orgId ?? 0, paramsEmAvaliacao),
      },
    },
  );

  const paramsConcluidas = { ...sharedParams, boardColumn: "concluidas" as const, page: 1, pageSize: pageSizeConcluidas };
  const { data: resultConcluidas, isLoading: loadingConcluidas } = useListOrganizationTrainings(
    orgId ?? 0,
    paramsConcluidas,
    {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationTrainingsQueryKey(orgId ?? 0, paramsConcluidas),
      },
    },
  );

  const isLoading = loadingPendentes || loadingEmAvaliacao || loadingConcluidas;

  const pendentes = resultPendentes?.data ?? [];
  const emAvaliacao = resultEmAvaliacao?.data ?? [];
  const concluidas = resultConcluidas?.data ?? [];

  // Stats come from any of the three queries — use pendentes (same for all)
  const stats = resultPendentes?.stats;
  const boardCounts = stats?.boardCounts;

  // ── Metric values from server stats ──────────────────────────────────────

  const metricPendentes = boardCounts?.pendentes ?? 0;
  const metricEficazPct = stats?.eficazPercent != null ? `${stats.eficazPercent}%` : "—";
  const metricNaoEficazes = stats?.naoEficazes ?? 0;
  const metricOnTimePct = stats?.onTimePercent != null ? `${stats.onTimePercent}%` : "—";

  // ── Invalidate ────────────────────────────────────────────────────────────

  const invalidate = () => {
    if (orgId)
      queryClient.invalidateQueries({
        queryKey: getListOrganizationTrainingsQueryKey(orgId),
      });
  };

  // ── Review modal (Kirkpatrick) ────────────────────────────────────────────

  const reviewMutation = useCreateTrainingEffectivenessReview();
  const [target, setTarget] = useState<OrganizationTraining | null>(null);
  const [scores, setScores] = useState<Record<CriteriaKey, number>>({
    behavior: 3,
    result: 3,
    transfer: 3,
  });
  const [comments, setComments] = useState("");

  const openEval = (t: OrganizationTraining) => {
    setTarget(t);
    setScores({ behavior: 3, result: 3, transfer: 3 });
    setComments("");
  };

  const avg = (scores.behavior + scores.result + scores.transfer) / 3;
  const isEffective = avg >= 3;

  const handleSaveReview = async () => {
    if (!orgId || !target) return;
    try {
      await reviewMutation.mutateAsync({
        orgId,
        empId: target.employeeId,
        trainId: target.id,
        data: {
          evaluationDate: localDateToday(),
          // avg é a média de 3 critérios Kirkpatrick (1–5); ×2 leva à escala 0–10.
          // Duas casas: é o que a coluna numeric(4,2) guarda e o que a tela exibe.
          score: computeEffectivenessScore(avg),
          isEffective,
          resultLevel: Math.round(avg), // 1–5
          comments: comments || undefined,
          evaluatorRole:
            (target.effectivenessAssignedRole as
              | "gestor"
              | "rh"
              | "instrutor"
              | "colaborador"
              | undefined) ?? undefined,
        },
      });
      invalidate();
      setTarget(null);
      toast({
        title: "Avaliação registrada",
        description: isEffective ? "Resultado: Eficaz" : "Resultado: Não eficaz",
      });
    } catch {
      toast({
        title: "Erro ao salvar avaliação",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  // ── Assign dialog ("Iniciar avaliação") ───────────────────────────────────

  const assignMutation = useAssignTrainingEffectiveness();
  const [assignTarget, setAssignTarget] = useState<OrganizationTraining | null>(null);
  const [assignRole, setAssignRole] = useState<string>("gestor");
  const [assignDueDate, setAssignDueDate] = useState<string>("");

  const openAssign = (t: OrganizationTraining) => {
    setAssignTarget(t);
    setAssignRole("gestor");
    // default: 30 days from today
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setAssignDueDate(d.toISOString().slice(0, 10));
  };

  const handleSaveAssign = async () => {
    if (!orgId || !assignTarget || !assignDueDate) return;
    try {
      await assignMutation.mutateAsync({
        orgId,
        empId: assignTarget.employeeId,
        trainId: assignTarget.id,
        data: {
          evaluatorRole: assignRole as "gestor" | "rh" | "instrutor" | "colaborador",
          dueDate: assignDueDate,
        },
      });
      invalidate();
      setAssignTarget(null);
      toast({ title: "Avaliação iniciada", description: "Card movido para Em avaliação." });
    } catch {
      toast({
        title: "Erro ao iniciar avaliação",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

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
        <Metric label="Realizadas no prazo" value={metricOnTimePct} subtitle="" />
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
            value={norm}
            onChange={handleSetNorm}
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

        {/* Scope toggle */}
        <div className="flex items-center gap-2 pb-1">
          <input
            id="scope-all"
            type="checkbox"
            checked={scope === "all"}
            onChange={(e) => handleSetScope(e.target.checked ? "all" : "needs_evaluation")}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <Label htmlFor="scope-all" className="text-xs text-muted-foreground cursor-pointer">
            Ver todos (inclui histórico)
          </Label>
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
              <div key={t.id} className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="text-sm font-medium">{t.employeeName}</div>
                <div className="text-xs text-muted-foreground">{t.title}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200">A avaliar</Badge>
                </div>
                {canWrite ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => openAssign(t)}
                    >
                      Iniciar avaliação
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => openEval(t)}
                    >
                      Registrar avaliação
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
                onClick={() => setPageSizePendentes((n) => n + DEFAULT_PAGE_SIZE)}
              >
                Carregar mais
              </Button>
            ) : null}
          </Column>

          {/* Column: Em avaliação */}
          <Column title="Em avaliação" count={boardCounts?.emAvaliacao ?? 0}>
            {emAvaliacao.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum em avaliação.</p>
            ) : null}
            {emAvaliacao.map((t) => {
              const days = t.effectivenessDueDate ? daysUntil(t.effectivenessDueDate) : null;
              return (
                <div key={t.id} className="rounded-xl border bg-card p-3 shadow-sm">
                  <div className="text-sm font-medium">{t.employeeName}</div>
                  <div className="text-xs text-muted-foreground">{t.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <RoleBadge role={t.effectivenessAssignedRole} />
                    <UrgencyBadge dueDate={t.effectivenessDueDate} />
                  </div>
                  {days != null && days >= 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">Vence em {days} dias</p>
                  ) : null}
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => openEval(t)}
                    >
                      Registrar avaliação
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
                onClick={() => setPageSizeEmAvaliacao((n) => n + DEFAULT_PAGE_SIZE)}
              >
                Carregar mais
              </Button>
            ) : null}
          </Column>

          {/* Column: Concluídas */}
          <Column title="Concluídas" count={boardCounts?.concluidas ?? 0}>
            {concluidas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma avaliação ainda.</p>
            ) : null}
            {concluidas.map((t) => {
              const ineffective = t.effectivenessStatus === "ineffective";
              return (
                <div key={t.id} className="rounded-xl border bg-card p-3 shadow-sm">
                  <div className="text-sm font-medium">{t.employeeName}</div>
                  <div className="text-xs text-muted-foreground">{t.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {t.effectivenessStatus === "effective" ? (
                      <Badge className="bg-green-50 text-green-700 border-green-200">Eficaz</Badge>
                    ) : (
                      <Badge className="bg-red-50 text-red-700 border-red-200">Não eficaz</Badge>
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
                        Concluída {fmtDateShort(t.latestEffectivenessReview.evaluationDate)}
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
                      <AcoesVinculadas orgId={orgId} sourceModule="training" refId={t.id} />
                      {canWrite ? (
                        <CriarAcaoButton
                          orgId={orgId}
                          source={{ sourceModule: "training", sourceRef: { trainingId: t.id } }}
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
                onClick={() => setPageSizeConcluidas((n) => n + DEFAULT_PAGE_SIZE)}
              >
                Carregar mais
              </Button>
            ) : null}
          </Column>
        </div>
      )}

      {/* Dialog: Iniciar avaliação (assign) */}
      <Dialog
        open={!!assignTarget}
        onOpenChange={(o) => !o && setAssignTarget(null)}
        title="Iniciar avaliação"
        description={
          assignTarget ? `${assignTarget.employeeName} · ${assignTarget.title}` : ""
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Papel do avaliador
            </Label>
            <Select
              value={assignRole}
              onChange={(e) => setAssignRole(e.target.value)}
              className="mt-1 w-full"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Prazo para avaliação
            </Label>
            <input
              type="date"
              value={assignDueDate}
              onChange={(e) => setAssignDueDate(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAssignTarget(null)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSaveAssign()}
            disabled={assignMutation.isPending || !assignDueDate}
          >
            Iniciar avaliação
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog: Registrar avaliação (Kirkpatrick) */}
      <Dialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Avaliação de eficácia"
        description={target ? `${target.employeeName} · ${target.title}` : ""}
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Avalie os critérios (1–5). Resultado eficaz quando a média ≥ 3.
          </p>
          {CRITERIA.map((c) => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{c.label}</span>
              <Select
                value={String(scores[c.key])}
                onChange={(e) =>
                  setScores((s) => ({ ...s, [c.key]: Number(e.target.value) }))
                }
                className="w-auto"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Observação
            </Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              isEffective ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800",
            )}
          >
            Média atual: <strong>{avg.toFixed(1)}/5</strong> · Resultado:{" "}
            <strong>{isEffective ? "Eficaz" : "Não eficaz"}</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTarget(null)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSaveReview()}
            disabled={reviewMutation.isPending}
          >
            Salvar avaliação
          </Button>
        </DialogFooter>
      </Dialog>
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
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
        <Badge className="bg-muted text-muted-foreground">{count}</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
