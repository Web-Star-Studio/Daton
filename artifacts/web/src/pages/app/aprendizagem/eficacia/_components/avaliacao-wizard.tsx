import React, { useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  useCreateTrainingEffectivenessReview,
  useAssignTrainingEffectiveness,
} from "@workspace/api-client-react";
import type { OrganizationTraining } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

// ─── Modelo de avaliação ─────────────────────────────────────────────────────

export type CriteriaKey = "behavior" | "result" | "transfer";

type ScaleOption = { value: number; label: string };

const FREQUENCY_SCALE: ScaleOption[] = [
  { value: 5, label: "5 — Sempre" },
  { value: 4, label: "4 — Frequentemente" },
  { value: 3, label: "3 — Às vezes" },
  { value: 2, label: "2 — Raramente" },
  { value: 1, label: "1 — Nunca" },
];

/**
 * O critério de resultado (L4) não mede frequência e sim direção da mudança —
 * usar "Sempre/Nunca" nele produzia respostas sem sentido ("reduziu incidentes:
 * às vezes"). A escala numérica continua 1–5 para a média não mudar.
 */
const CHANGE_SCALE: ScaleOption[] = [
  { value: 5, label: "5 — Sim, claramente" },
  { value: 4, label: "4 — Parcialmente" },
  { value: 3, label: "3 — Sem alteração" },
  { value: 2, label: "2 — Piorou levemente" },
  { value: 1, label: "1 — Piorou" },
];

type CriterionDef = {
  key: CriteriaKey;
  group: string;
  label: string;
  scale: ScaleOption[];
};

export const CRITERIA: CriterionDef[] = [
  {
    key: "behavior",
    group: "Comportamento (Kirkpatrick L3)",
    label: "Aplica no dia a dia o que foi treinado",
    scale: FREQUENCY_SCALE,
  },
  {
    key: "result",
    group: "Resultado (Kirkpatrick L4)",
    label: "Melhorou o desempenho / reduziu incidentes após o treinamento",
    scale: CHANGE_SCALE,
  },
  {
    key: "transfer",
    group: "Transferência",
    label: "Multiplica o conhecimento para a equipe",
    scale: FREQUENCY_SCALE,
  },
];

/** Papéis de avaliador — compartilhado com o filtro do board. */
export const ROLE_OPTIONS = [
  { value: "gestor", label: "Gestor" },
  { value: "rh", label: "RH" },
  { value: "instrutor", label: "Instrutor" },
  { value: "colaborador", label: "Colaborador" },
];

type EvaluatorRole = "gestor" | "rh" | "instrutor" | "colaborador";

type Scores = Record<CriteriaKey, number>;

const DEFAULT_SCORES: Scores = { behavior: 3, result: 3, transfer: 3 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Nota de eficácia (0–10) a partir da média dos 3 critérios Kirkpatrick (1–5).
 * `avg * 2` leva da escala 1–5 para 0–10; duas casas é o que a coluna
 * numeric(4,2) guarda e o que a tela exibe (ex.: média 3,67 → 7,33).
 */
export function computeEffectivenessScore(avg: number): number {
  return Math.round(avg * 2 * 100) / 100;
}

function localDateToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-");
  const due = new Date(Number(y), Number(m) - 1, Number(d));
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatPrazo(dueDate?: string | null): string | null {
  if (!dueDate) return null;
  const d = daysUntil(dueDate);
  if (d < 0) return `Prazo vencido há ${Math.abs(d)} dia(s)`;
  if (d === 0) return "Prazo vence hoje";
  return `Prazo: ${d} dia(s)`;
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

const STEPS = ["Contexto", "Critérios", "Resultado"] as const;

function Stepper({ current }: { current: number }) {
  return (
    <div className="mb-6 flex items-center">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={label}>
            {i > 0 ? <div className="mx-2 h-px flex-1 bg-border" /> : null}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                  done && "bg-green-600 text-white",
                  active && "bg-primary text-primary-foreground",
                  !done && !active && "border bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : n}
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  done && "text-green-700",
                  active && "text-foreground",
                  !done && !active && "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

export function AvaliacaoEficaciaWizard({
  orgId,
  training,
  onClose,
  onSaved,
}: {
  orgId: number;
  training: OrganizationTraining;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const assignMutation = useAssignTrainingEffectiveness();
  const reviewMutation = useCreateTrainingEffectivenessReview();

  const draft = training.effectivenessDraft ?? null;

  // Já atribuído (ou com rascunho) ⇒ o contexto está resolvido e o avaliador cai
  // direto nos critérios. Era exatamente a etapa que fazia o fluxo parar no meio.
  const startAtCriteria =
    !!training.effectivenessAssignedRole || !!training.effectivenessDueDate;

  const [step, setStep] = useState<number>(startAtCriteria ? 2 : 1);
  const [role, setRole] = useState<string>(
    training.effectivenessAssignedRole ?? draft?.evaluatorRole ?? "gestor",
  );
  const [dueDate, setDueDate] = useState<string>(
    training.effectivenessDueDate ?? addDaysIso(30),
  );
  const [scores, setScores] = useState<Scores>(
    draft?.criteria
      ? {
          behavior: draft.criteria.behavior,
          result: draft.criteria.result,
          transfer: draft.criteria.transfer,
        }
      : DEFAULT_SCORES,
  );
  const [comments, setComments] = useState<string>(draft?.comments ?? "");

  // Só grava rascunho se houve mudança — evita criar linha de rascunho quando o
  // avaliador apenas abre e fecha o wizard sem tocar em nada.
  const dirtyRef = useRef(false);
  const finalizedRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  const avg = useMemo(
    () => (scores.behavior + scores.result + scores.transfer) / 3,
    [scores],
  );
  const isEffective = avg >= 3;
  const busy = assignMutation.isPending || reviewMutation.isPending;

  const buildReviewPayload = (status: "draft" | "final") => ({
    orgId,
    empId: training.employeeId,
    trainId: training.id,
    data: {
      evaluationDate: localDateToday(),
      score: computeEffectivenessScore(avg),
      isEffective,
      resultLevel: Math.round(avg),
      comments: comments || undefined,
      criteria: scores,
      status,
      evaluatorRole: (training.effectivenessAssignedRole ??
        role) as EvaluatorRole,
    },
  });

  const saveDraft = async () => {
    await reviewMutation.mutateAsync(buildReviewPayload("draft"));
  };

  // ── Navegação ─────────────────────────────────────────────────────────────

  const handleNext = async () => {
    try {
      if (step === 1) {
        // Atribuir é o próprio "Iniciar avaliação": grava papel e prazo e já
        // segue para os critérios, sem devolver o avaliador ao board.
        await assignMutation.mutateAsync({
          orgId,
          empId: training.employeeId,
          trainId: training.id,
          data: { evaluatorRole: role as EvaluatorRole, dueDate },
        });
        onSaved();
        setStep(2);
        return;
      }
      if (step === 2) {
        await saveDraft();
        dirtyRef.current = false;
        onSaved();
        setStep(3);
      }
    } catch {
      toast({
        title: step === 1 ? "Erro ao iniciar avaliação" : "Erro ao salvar",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleFinish = async () => {
    try {
      await reviewMutation.mutateAsync(buildReviewPayload("final"));
      finalizedRef.current = true;
      onSaved();
      onClose();
      toast({
        title: "Avaliação concluída",
        description: isEffective ? "Resultado: Eficaz" : "Resultado: Não eficaz",
      });
    } catch {
      toast({
        title: "Erro ao concluir avaliação",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  /**
   * Fechar no meio do preenchimento não pode descartar o que foi digitado — é a
   * diferença entre "em avaliação" significar algo e ser só um card parado.
   */
  const handleClose = async () => {
    if (!finalizedRef.current && dirtyRef.current && step >= 2) {
      try {
        await saveDraft();
        onSaved();
        toast({
          title: "Rascunho salvo",
          description: "O preenchimento continua de onde você parou.",
        });
      } catch {
        toast({
          title: "Não foi possível salvar o rascunho",
          description: "O preenchimento desta janela será perdido.",
          variant: "destructive",
        });
      }
    }
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const prazoLabel = formatPrazo(training.effectivenessDueDate ?? dueDate);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) void handleClose();
      }}
      title="Avaliação de eficácia"
      description={[
        training.employeeName,
        training.title,
        prazoLabel,
      ]
        .filter(Boolean)
        .join(" · ")}
      size="lg"
    >
      <div>
        <Stepper current={step} />

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Defina quem avalia e até quando. Ao continuar, a avaliação já é
              iniciada e você segue direto para os critérios.
            </p>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Papel do avaliador
              </Label>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value)}
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
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <p className="mb-4 text-xs text-muted-foreground">
              Avalie os critérios abaixo (1–5). O resultado é eficaz quando a
              média for maior ou igual a 3.
            </p>
            {CRITERIA.map((c, i) => (
              <div key={c.key}>
                {i === 0 || CRITERIA[i - 1]!.group !== c.group ? (
                  <div
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                      i === 0 ? "mb-2" : "mb-2 mt-4",
                    )}
                  >
                    {c.group}
                  </div>
                ) : null}
                <div className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
                  <span className="flex-1 text-[13px] text-muted-foreground">
                    {c.label}
                  </span>
                  <Select
                    value={String(scores[c.key])}
                    onChange={(e) => {
                      markDirty();
                      setScores((s) => ({
                        ...s,
                        [c.key]: Number(e.target.value),
                      }));
                    }}
                    className="w-auto"
                  >
                    {c.scale.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
            <div className="mt-4">
              <Label className="text-xs font-semibold text-muted-foreground">
                Observação do avaliador
              </Label>
              <Textarea
                value={comments}
                onChange={(e) => {
                  markDirty();
                  setComments(e.target.value);
                }}
                rows={3}
                placeholder="Registre observações sobre o desempenho do colaborador após o treinamento..."
                className="mt-1"
              />
            </div>
            <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-[13px] text-muted-foreground">
              Média parcial: <strong>{avg.toFixed(1)}/5</strong> · Resultado
              provisório:{" "}
              <strong>{isEffective ? "Eficaz" : "Não eficaz"}</strong>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div
              className={cn(
                "rounded-xl border p-4 text-center",
                isEffective
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50",
              )}
            >
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Resultado da avaliação
              </div>
              <div
                className={cn(
                  "mt-1 text-2xl font-semibold",
                  isEffective ? "text-green-700" : "text-red-700",
                )}
              >
                {isEffective ? "Eficaz" : "Não eficaz"}
              </div>
              <div className="mt-1 text-[13px] text-muted-foreground">
                Média {avg.toFixed(1)}/5 · Nota{" "}
                {computeEffectivenessScore(avg).toFixed(1)}/10
              </div>
            </div>

            <div className="rounded-lg border">
              {CRITERIA.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center gap-3 border-b px-3 py-2 text-[13px] last:border-b-0"
                >
                  <span className="flex-1 text-muted-foreground">
                    {c.label}
                  </span>
                  <span className="font-semibold">{scores[c.key]}</span>
                </div>
              ))}
            </div>

            {comments ? (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
                <div className="mb-0.5 text-xs font-semibold text-muted-foreground">
                  Observação
                </div>
                {comments}
              </div>
            ) : null}

            {!isEffective ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                Resultado não eficaz. Ao concluir, o card vai para
                &quot;Concluídas&quot; sinalizado para tratamento — abra um plano
                de ação ou reprograme o treinamento pelo próprio card.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter>
        {step > 1 ? (
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={busy}
          >
            Voltar
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void handleClose()}>
            Cancelar
          </Button>
        )}
        {step < 3 ? (
          <Button
            onClick={() => void handleNext()}
            disabled={busy || (step === 1 && !dueDate)}
          >
            Continuar
          </Button>
        ) : (
          <Button onClick={() => void handleFinish()} disabled={busy}>
            Concluir avaliação
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
