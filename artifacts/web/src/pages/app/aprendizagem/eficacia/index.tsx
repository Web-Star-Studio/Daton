import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrganizationTrainings,
  useCreateTrainingEffectivenessReview,
  useAssignTrainingEffectiveness,
  getListOrganizationTrainingsQueryKey,
} from "@workspace/api-client-react";
import type { OrganizationTraining } from "@workspace/api-client-react";
import { usePageTitle, usePageSubtitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { CriarAcaoButton } from "@/pages/app/planos-acao/_components/criar-acao-button";
import { AcoesVinculadas } from "@/pages/app/planos-acao/_components/acoes-vinculadas";

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Format a date-only ISO string (YYYY-MM-DD) as DD/MM/AA without timezone shift. */
function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y?.slice(2)}`;
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

  // ── Query ─────────────────────────────────────────────────────────────────

  const params = { status: "concluido" as const };
  const { data: result, isLoading } = useListOrganizationTrainings(
    orgId ?? 0,
    params,
    {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationTrainingsQueryKey(orgId ?? 0, params),
      },
    },
  );
  const trainings = result?.data ?? [];

  // ── Filter ────────────────────────────────────────────────────────────────

  const [filterRole, setFilterRole] = useState<string>("all");

  const filtered = useMemo(() => {
    if (filterRole === "all") return trainings;
    return trainings.filter((t) => t.effectivenessAssignedRole === filterRole);
  }, [trainings, filterRole]);

  // ── Groups ────────────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    const pendentes: OrganizationTraining[] = [];
    const emAvaliacao: OrganizationTraining[] = [];
    const concluidas: OrganizationTraining[] = [];
    for (const t of filtered) {
      if (t.effectivenessStatus === "effective" || t.effectivenessStatus === "ineffective") {
        concluidas.push(t);
      } else if (t.effectivenessStatus === "in_review") {
        emAvaliacao.push(t);
      } else {
        pendentes.push(t);
      }
    }
    return { pendentes, emAvaliacao, concluidas };
  }, [filtered]);

  // ── Metrics ───────────────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const eficazes = trainings.filter((t) => t.effectivenessStatus === "effective").length;
    const naoEficazes = trainings.filter((t) => t.effectivenessStatus === "ineffective").length;
    const denom = eficazes + naoEficazes;
    const eficazPct = denom > 0 ? `${Math.round((eficazes / denom) * 100)}%` : "—";
    const onTimePct =
      result?.stats?.onTimePercent != null ? `${result.stats.onTimePercent}%` : "—";
    return {
      pendentes: trainings.filter(
        (t) => t.effectivenessStatus === "pending" || t.effectivenessStatus == null,
      ).length,
      eficazPct,
      naoEficazes,
      onTimePct,
    };
  }, [trainings, result]);

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
    const today = new Date().toISOString().slice(0, 10);
    await reviewMutation.mutateAsync({
      orgId,
      empId: target.employeeId,
      trainId: target.id,
      data: {
        evaluationDate: today,
        score: Math.round(avg * 2 * 10) / 10, // 0–10
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
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Pendentes"
          value={metrics.pendentes}
          subtitle="a realizar"
          accent="text-amber-700"
        />
        <Metric
          label="Eficazes"
          value={metrics.eficazPct}
          subtitle="média geral"
          accent="text-green-700"
        />
        <Metric
          label="Não eficazes"
          value={metrics.naoEficazes}
          subtitle="ação corretiva aberta"
          accent="text-red-700"
        />
        <Metric
          label="Realizadas no prazo"
          value={metrics.onTimePct}
          subtitle=""
        />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground shrink-0">Avaliador:</Label>
        <Select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="w-auto text-sm"
        >
          <option value="all">Todos os avaliadores</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Column: Pendentes */}
          <Column title="Pendentes" count={groups.pendentes.length}>
            {groups.pendentes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nada pendente.</p>
            ) : null}
            {groups.pendentes.map((t) => (
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
          </Column>

          {/* Column: Em avaliação */}
          <Column title="Em avaliação" count={groups.emAvaliacao.length}>
            {groups.emAvaliacao.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum em avaliação.</p>
            ) : null}
            {groups.emAvaliacao.map((t) => {
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
          </Column>

          {/* Column: Concluídas */}
          <Column title="Concluídas" count={groups.concluidas.length}>
            {groups.concluidas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma avaliação ainda.</p>
            ) : null}
            {groups.concluidas.map((t) => {
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
                        Eficácia: {t.effectivenessScorePercent}%
                        {t.latestEffectivenessReview?.evaluationDate
                          ? ` · Concluída ${fmtDateShort(t.latestEffectivenessReview.evaluationDate)}`
                          : ""}
                      </span>
                    ) : t.latestEffectivenessReview?.evaluationDate ? (
                      <span className="text-xs text-muted-foreground">
                        Concluída{" "}
                        {fmtDateShort(t.latestEffectivenessReview.evaluationDate)}
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
