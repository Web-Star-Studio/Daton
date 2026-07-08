import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTrainingClass,
  useUpdateTrainingClassParticipant,
  useCompleteTrainingClass,
  useUpdateTrainingClass,
  getGetTrainingClassQueryKey,
} from "@workspace/api-client-react";
import type { TrainingClassParticipant } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  uploadFilesToStorage,
  formatFileSize,
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT,
} from "@/lib/uploads";
import { resolveApiUrl } from "@/lib/api";

type Tab = "presenca" | "notas" | "evidencias";

// Mantém as mesmas cores da lista de turmas (turmas/index.tsx) — mesmo domínio
// de status, para não divergir entre a lista e o painel (review #134).
const CLASS_STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  realizada: "Realizada",
  cancelada: "Cancelada",
};
const CLASS_STATUS_BADGE: Record<string, string> = {
  agendada: "bg-amber-50 text-amber-700",
  em_andamento: "bg-blue-50 text-blue-700",
  realizada: "bg-green-50 text-green-700",
  cancelada: "bg-muted text-muted-foreground",
};

export function TurmaDetailPanel({
  orgId,
  classId,
  canWrite,
  catalogTitle,
  onChanged,
}: {
  orgId: number;
  classId: number;
  canWrite: boolean;
  catalogTitle: Map<number, string>;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("presenca");
  const [uploading, setUploading] = useState(false);

  const { data: detail, isLoading } = useGetTrainingClass(orgId, classId, {
    query: {
      enabled: !!orgId && !!classId,
      queryKey: getGetTrainingClassQueryKey(orgId, classId),
    },
  });

  const updateParticipant = useUpdateTrainingClassParticipant();
  const completeMutation = useCompleteTrainingClass();
  const updateClass = useUpdateTrainingClass();

  const invalidateDetail = () => {
    queryClient.invalidateQueries({
      queryKey: getGetTrainingClassQueryKey(orgId, classId),
    });
  };

  const setAttendance = async (
    p: TrainingClassParticipant,
    attendance: string,
  ) => {
    try {
      await updateParticipant.mutateAsync({
        orgId,
        id: classId,
        participantId: p.id,
        data: { attendance },
      });
      invalidateDetail();
    } catch {
      toast({
        title: "Erro ao salvar presença",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const setScore = async (p: TrainingClassParticipant, score: number) => {
    try {
      await updateParticipant.mutateAsync({
        orgId,
        id: classId,
        participantId: p.id,
        data: { score },
      });
      invalidateDetail();
    } catch {
      toast({
        title: "Erro ao salvar nota",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleComplete = async () => {
    try {
      const res = await completeMutation.mutateAsync({ orgId, id: classId });
      invalidateDetail();
      onChanged();
      toast({
        title: "Turma concluída",
        description: `${res.completed} treino(s) registrado(s) como concluído(s).`,
      });
    } catch {
      toast({
        title: "Erro ao concluir turma",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !detail) return;
    setUploading(true);
    try {
      const uploaded = await uploadFilesToStorage(Array.from(files));
      await updateClass.mutateAsync({
        orgId,
        id: classId,
        data: { attachments: [...detail.attachments, ...uploaded] },
      });
      invalidateDetail();
    } catch (error) {
      toast({
        title: "Falha no upload",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading || !detail) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        Carregando turma...
      </div>
    );
  }

  const participants = detail.participants ?? [];
  const isDone = detail.status === "realizada";

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">
                {catalogTitle.get(detail.catalogItemId) ?? "Turma"}
                {detail.code ? ` — ${detail.code}` : ""}
              </h3>
              <Badge className={CLASS_STATUS_BADGE[detail.status] ?? ""}>
                {CLASS_STATUS_LABEL[detail.status] ?? detail.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {detail.startDate}
              {detail.endDate ? `–${detail.endDate}` : ""} ·{" "}
              {participants.length} inscrito(s)
            </p>
          </div>
          {canWrite && !isDone ? (
            <Button
              size="sm"
              onClick={() => void handleComplete()}
              disabled={completeMutation.isPending}
            >
              Concluir turma
            </Button>
          ) : null}
        </div>
        <div className="mt-3 flex gap-1 text-xs">
          {(["presenca", "notas", "evidencias"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 font-medium ${
                tab === t
                  ? "bg-blue-50 text-blue-700"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "presenca"
                ? "Presença"
                : t === "notas"
                  ? "Notas"
                  : "Evidências"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4">
        {tab === "presenca" ? (
          <div className="space-y-2">
            {participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2"
              >
                <InitialsAvatar name={p.employeeName} />
                <span className="flex-1 truncate text-sm">{p.employeeName}</span>
                {canWrite && !isDone ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => void setAttendance(p, "presente")}
                      className={`rounded-full px-2.5 py-0.5 text-xs ${
                        p.attendance === "presente"
                          ? "bg-green-100 text-green-800"
                          : "border text-muted-foreground"
                      }`}
                    >
                      Presente
                    </button>
                    <button
                      onClick={() => void setAttendance(p, "faltou")}
                      className={`rounded-full px-2.5 py-0.5 text-xs ${
                        p.attendance === "faltou"
                          ? "bg-red-100 text-red-800"
                          : "border text-muted-foreground"
                      }`}
                    >
                      Faltou
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {p.attendance ?? "—"}
                  </span>
                )}
              </div>
            ))}
            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum inscrito.</p>
            ) : null}
          </div>
        ) : null}

        {tab === "notas" ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-1">Participante</th>
                <th className="py-1">Nota</th>
                <th className="py-1">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-1.5">
                    <span className="flex items-center gap-2">
                      <InitialsAvatar name={p.employeeName} />
                      {p.employeeName}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <ScoreInput
                      score={p.score ?? null}
                      disabled={!canWrite || isDone}
                      onSave={(v) => void setScore(p, v)}
                    />
                  </td>
                  <td className="py-1.5">
                    {p.result === "aprovado" ? (
                      <Badge className="bg-green-50 text-green-700">Aprovado</Badge>
                    ) : p.result === "reprovado" ? (
                      <Badge className="bg-red-50 text-red-700">Reprovado</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {tab === "evidencias" ? (
          <div className="space-y-3">
            {detail.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma evidência enviada.
              </p>
            ) : (
              <ul className="space-y-1">
                {detail.attachments.map((a, i) => (
                  <li
                    key={`${a.objectPath}-${i}`}
                    className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"
                  >
                    <a
                      href={resolveApiUrl(`/api/storage${a.objectPath}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-blue-700 hover:underline"
                    >
                      {a.fileName}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(a.fileSize)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canWrite ? (
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground hover:border-primary/50">
                <input
                  type="file"
                  multiple
                  accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                  className="hidden"
                  onChange={(e) => void handleUpload(e.target.files)}
                />
                {uploading ? "Enviando..." : "Enviar evidência (PDF/imagem, máx. 20MB)"}
              </label>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Controlled score input that stays in sync with refetched data.
function ScoreInput({
  score,
  disabled,
  onSave,
}: {
  score: number | null;
  disabled: boolean;
  onSave: (v: number) => void;
}) {
  const [val, setVal] = useState(score != null ? String(score) : "");
  useEffect(() => {
    setVal(score != null ? String(score) : "");
  }, [score]);
  return (
    <Input
      type="number"
      value={val}
      disabled={disabled}
      className="h-8 w-20"
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val !== "" && val !== String(score ?? "")) onSave(Number(val));
      }}
    />
  );
}

/** Iniciais do nome (primeiro + último) para o avatar do participante. */
function getInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

function InitialsAvatar({ name }: { name: string | null | undefined }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground"
      aria-hidden
    >
      {getInitials(name)}
    </span>
  );
}
