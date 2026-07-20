import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useUpdateTrainingClassParticipant,
  useCompleteTrainingClass,
} from "@workspace/api-client-react";
import type { TrainingClassParticipant } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { ScoreInput } from "./score-input";

type Attendance = "presente" | "faltou";
/** `undefined` = ainda não definido — é o que trava o encerramento. */
type AttendanceMap = Record<number, Attendance | undefined>;

const STEPS = ["Presença", "Notas", "Concluir"];

function initialAttendance(
  participants: TrainingClassParticipant[],
): AttendanceMap {
  const map: AttendanceMap = {};
  for (const p of participants) {
    map[p.id] =
      p.attendance === "presente" || p.attendance === "faltou"
        ? p.attendance
        : undefined;
  }
  return map;
}

function initialScores(
  participants: TrainingClassParticipant[],
): Record<number, number | null> {
  const map: Record<number, number | null> = {};
  for (const p of participants) map[p.id] = p.score ?? null;
  return map;
}

export type ParticipantResult = "aprovado" | "reprovado" | null;

/** Este participante será regravado no encerramento? */
export function willWrite(
  stored: Pick<TrainingClassParticipant, "attendance" | "score">,
  nextAttendance: Attendance | undefined,
  nextScore: number | null,
): boolean {
  return (
    nextAttendance !== (stored.attendance ?? undefined) ||
    nextScore !== (stored.score ?? null)
  );
}

/**
 * O `result` que o backend vai efetivamente gravar — a tela precisa mostrar
 * isso, não a sua própria conta.
 *
 * Duas regras do servidor importam aqui (`deriveResult` + o handler PATCH em
 * routes/training-classes.ts):
 *
 * 1. `result` só é recomputado quando o PATCH manda `attendance` (ou `result`).
 *    Um PATCH só de `score` preserva o resultado manual anterior. Por isso o
 *    encerramento manda sempre a presença junto da nota — senão o assistente
 *    exibia "Reprovado" e o backend, com o result antigo, ainda gerava o
 *    registro de treinamento concluído.
 * 2. Quem não é regravado mantém o resultado atual, inclusive um definido à
 *    mão. Nesse caso é ele que deve aparecer, não o derivado da nota.
 */
export function effectiveResult(
  stored: Pick<TrainingClassParticipant, "attendance" | "score" | "result">,
  nextAttendance: Attendance | undefined,
  nextScore: number | null,
  minScore: number | null | undefined,
): ParticipantResult {
  if (!willWrite(stored, nextAttendance, nextScore)) {
    return stored.result === "aprovado" || stored.result === "reprovado"
      ? stored.result
      : null;
  }
  // Espelha deriveResult() do backend.
  if (nextAttendance === "presente") {
    if (minScore == null || nextScore == null) return "aprovado";
    return nextScore >= minScore ? "aprovado" : "reprovado";
  }
  if (nextAttendance === "faltou") return "reprovado";
  return null;
}

/**
 * Assistente de encerramento: Presença → Notas → Concluir.
 *
 * A presença é obrigatória (todo inscrito precisa estar Presente ou Faltou)
 * porque `completeTrainingClass` só gera registro de treinamento para quem está
 * como "presente" — concluir com a presença em branco produzia turma realizada
 * sem nenhum registro, silenciosamente. A nota é opcional: nem todo treinamento
 * tem prova.
 */
export function EncerrarTurmaDialog({
  orgId,
  classId,
  open,
  onOpenChange,
  participants,
  minScore,
  isDone,
  onDone,
}: {
  orgId: number;
  classId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participants: TrainingClassParticipant[];
  minScore?: number | null;
  isDone: boolean;
  onDone: () => void;
}) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [attendance, setAttendance] = useState<AttendanceMap>(() =>
    initialAttendance(participants),
  );
  const [scores, setScores] = useState(() => initialScores(participants));
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState<number | null>(null);

  const updateParticipant = useUpdateTrainingClassParticipant();
  const completeMutation = useCompleteTrainingClass();

  // Reabrir o assistente recomeça do zero, já refletindo o que foi salvo antes.
  useEffect(() => {
    if (open) {
      setStep(1);
      setAttendance(initialAttendance(participants));
      setScores(initialScores(participants));
      setCompleted(null);
    }
    // `participants` só importa na abertura — durante o fluxo o estado é local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const defined = participants.filter((p) => attendance[p.id]).length;
  const allDefined = defined === participants.length && participants.length > 0;
  const present = useMemo(
    () => participants.filter((p) => attendance[p.id] === "presente"),
    [participants, attendance],
  );
  const absent = participants.length - present.length;

  const markAllPresent = () => {
    const next: AttendanceMap = {};
    for (const p of participants) next[p.id] = "presente";
    setAttendance(next);
  };

  const resultOf = (p: TrainingClassParticipant): ParticipantResult =>
    effectiveResult(p, attendance[p.id], scores[p.id], minScore);

  const approved = present.filter((p) => resultOf(p) === "aprovado").length;

  const handleConclude = async () => {
    setSaving(true);
    try {
      // Só grava o que mudou — evita PATCH inútil por participante.
      for (const p of participants) {
        const nextAttendance = attendance[p.id];
        const nextScore = scores[p.id];
        if (!willWrite(p, nextAttendance, nextScore)) continue;
        await updateParticipant.mutateAsync({
          orgId,
          id: classId,
          participantId: p.id,
          data: {
            // `attendance` vai sempre, mesmo inalterada: é ela que faz o
            // backend recomputar o `result`. Ver effectiveResult().
            attendance: nextAttendance,
            ...(nextScore != null ? { score: nextScore } : {}),
          },
        });
      }
      const res = await completeMutation.mutateAsync({ orgId, id: classId });
      setCompleted(res.completed);
      onDone();
    } catch {
      toast({
        title: "Erro ao encerrar turma",
        // Presenças/notas já gravadas antes da falha permanecem — dizer "nada
        // foi concluído" mentiria. Reexecutar é seguro (grava só o diff).
        description: "A turma não foi encerrada. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const title = isDone ? "Revisar encerramento" : "Encerrar turma";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        completed == null ? `Passo ${step} de 3 · ${STEPS[step - 1]}` : undefined
      }
      size="lg"
    >
      {completed != null ? (
        <div className="space-y-3">
          <div className="rounded-lg border bg-green-50/60 p-4">
            <p className="text-sm font-medium text-green-800">
              Turma encerrada.
            </p>
            <p className="mt-1 text-xs text-green-700">
              {completed} registro(s) de treinamento gerado(s) · {present.length}{" "}
              presente(s) · {absent} falta(s).
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            A eficácia do treinamento (ISO 10015) é avaliada depois, com prazo
            próprio — normalmente algumas semanas após a capacitação.
          </p>
        </div>
      ) : null}

      {completed == null && step === 1 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" onClick={markAllPresent}>
              ✔ Marcar todos como presentes
            </Button>
            <span
              className={`text-xs ${
                allDefined ? "text-muted-foreground" : "text-amber-700"
              }`}
            >
              {defined} de {participants.length} definidos
            </span>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
            {participants.map((p) => {
              const state = attendance[p.id];
              return (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={state === "presente"}
                    ref={(el) => {
                      // Terceiro estado: nunca definido. Sem isso, "não
                      // preenchido" viraria "faltou" sem ninguém decidir.
                      if (el) el.indeterminate = state === undefined;
                    }}
                    onChange={(e) =>
                      setAttendance((prev) => ({
                        ...prev,
                        [p.id]: e.target.checked ? "presente" : "faltou",
                      }))
                    }
                  />
                  <span className="flex-1 truncate">{p.employeeName}</span>
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-wide ${
                      state === "presente"
                        ? "text-green-700"
                        : state === "faltou"
                          ? "text-red-700"
                          : "text-amber-700"
                    }`}
                  >
                    {state === "presente"
                      ? "Presente"
                      : state === "faltou"
                        ? "Faltou"
                        : "Pendente"}
                  </span>
                </label>
              );
            })}
            {participants.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Nenhum inscrito — adicione participantes antes de encerrar.
              </p>
            ) : null}
          </div>
          {!allDefined ? (
            <p className="text-xs text-amber-700">
              Defina a presença de todos para seguir. Desmarque quem faltou.
            </p>
          ) : null}
        </div>
      ) : null}

      {completed == null && step === 2 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Nota é opcional
            {minScore != null ? ` · nota mínima desta turma: ${minScore}` : ""}.
            Quem faltou não aparece aqui.
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
            {present.map((p) => {
              const s = scores[p.id];
              const result = resultOf(p);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm"
                >
                  <span className="flex-1 truncate">{p.employeeName}</span>
                  <ScoreInput
                    score={s}
                    disabled={false}
                    onSave={(v) =>
                      setScores((prev) => ({ ...prev, [p.id]: v }))
                    }
                  />
                  <span
                    className={`w-20 shrink-0 text-right text-[10px] uppercase tracking-wide ${
                      result === "reprovado"
                        ? "text-red-700"
                        : result === "aprovado"
                          ? "text-green-700"
                          : "text-muted-foreground"
                    }`}
                  >
                    {result === "reprovado"
                      ? "Reprovado"
                      : result === "aprovado"
                        ? "Aprovado"
                        : "—"}
                  </span>
                </div>
              );
            })}
            {present.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Ninguém foi marcado como presente.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {completed == null && step === 3 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["Presentes", present.length, "text-green-700"],
                ["Faltas", absent, "text-red-700"],
                [
                  minScore != null ? "Aprovados" : "Com nota",
                  minScore != null
                    ? approved
                    : present.filter((p) => scores[p.id] != null).length,
                  "text-blue-700",
                ],
              ] as [string, number, string][]
            ).map(([label, value, tone]) => (
              <div key={label} className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
                <div className={`text-lg font-semibold ${tone}`}>{value}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Ao concluir, cada participante presente ganha um registro de
            treinamento concluído. Quem faltou não gera registro. Participantes
            já concluídos em um encerramento anterior não são duplicados.
          </p>
        </div>
      ) : null}

      <DialogFooter>
        {completed != null ? (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button onClick={() => navigate("/aprendizagem/eficacia")}>
              Avaliar eficácia
            </Button>
          </>
        ) : (
          <>
            {step > 1 ? (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                ← Voltar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            )}
            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !allDefined}
                title={
                  step === 1 && !allDefined
                    ? "Defina a presença de todos os inscritos."
                    : undefined
                }
              >
                Próximo →
              </Button>
            ) : (
              <Button onClick={() => void handleConclude()} disabled={saving}>
                {saving ? "Concluindo..." : "Concluir turma"}
              </Button>
            )}
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}
