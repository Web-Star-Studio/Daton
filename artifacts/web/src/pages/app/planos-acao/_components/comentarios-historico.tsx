import { useState } from "react";
import {
  AlertTriangle,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Target,
  Trash2,
  History as HistoryIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  useActionPlanActivity,
  useActionPlanComments,
  useAddActionPlanCommentWithInvalidation,
} from "@/lib/action-plans-client";
import { diffPlanningFields, type PlanningBlock } from "./planning-versions";

const ACTION_META: Record<string, { label: string; icon: typeof Pencil; tone: string }> = {
  created: { label: "Ação criada", icon: Plus, tone: "text-blue-600 dark:text-blue-400" },
  updated: { label: "Atualização", icon: Pencil, tone: "text-muted-foreground" },
  status_changed: { label: "Status alterado", icon: RotateCcw, tone: "text-blue-600 dark:text-blue-400" },
  evidence_added: { label: "Evidência anexada", icon: Paperclip, tone: "text-emerald-600 dark:text-emerald-400" },
  evidence_removed: { label: "Evidência removida", icon: Trash2, tone: "text-red-600 dark:text-red-400" },
  effectiveness_evaluated: { label: "Eficácia avaliada", icon: Target, tone: "text-emerald-600 dark:text-emerald-400" },
  escalated: { label: "Escalonada", icon: AlertTriangle, tone: "text-amber-600 dark:text-amber-400" },
  reopened: { label: "Reaberta", icon: RotateCcw, tone: "text-amber-600 dark:text-amber-400" },
  // Ações do plano (5W2H rastreável). A chave é `string` (não o enum), então a
  // falta destas três não quebrava o typecheck — os eventos só apareciam como
  // "Atualização" genérica. Ícones/tons espelham os vizinhos (Plus=azul p/
  // inclusão, Pencil=neutro p/ alteração, Trash2=vermelho p/ remoção).
  action_added: { label: "Ação incluída", icon: Plus, tone: "text-blue-600 dark:text-blue-400" },
  action_updated: { label: "Ação alterada", icon: Pencil, tone: "text-muted-foreground" },
  action_removed: { label: "Ação removida", icon: Trash2, tone: "text-red-600 dark:text-red-400" },
};

/** Uma entrada de `action_updated` cujo diff mostra o status virando "completed"
 * ganha o rótulo mais claro "Ação concluída" (no lugar de "Ação alterada"). */
function actionCompletedLabel(entry: { changes?: unknown }): string | null {
  const c = entry.changes as
    | { kind?: string; fields?: Record<string, { from: unknown; to: unknown }> }
    | null
    | undefined;
  if (!c || c.kind !== "action" || !c.fields) return null;
  return c.fields.status && c.fields.status.to === "completed" ? "Ação concluída" : null;
}

export function describeChanges(entry: { changes?: unknown }): string | null {
  const c = entry.changes as
    | {
        kind?: string;
        message?: string;
        what?: string;
        fields?: Record<string, { from: unknown; to: unknown }>;
        restoredFrom?: { activityId: number; at: string };
      }
    | null
    | undefined;
  if (!c) return null;
  if (c.kind === "note" && c.message) return c.message;
  // Ação do plano: o resumo é o `what` snapshotado — qual ação foi
  // incluída/alterada/removida (o auditor precisa saber, a linha pode nem
  // existir mais). O tipo de mudança já está no rótulo (ACTION_META).
  if (c.kind === "action") return c.what ?? null;
  if (c.kind !== "diff" || !c.fields) return null;

  const parts: string[] = [];

  // The planning block is an object; `String(v)` would print "[object Object]".
  // Summarize it here and leave the before/after to the versions dialog.
  const planning = c.fields.planning as { from: PlanningBlock; to: PlanningBlock } | undefined;
  if (planning) {
    const labels = diffPlanningFields(planning.from, planning.to).map((change) => change.label);
    const prefix = c.restoredFrom ? "Planejamento restaurado" : "Planejamento";
    parts.push(labels.length ? `${prefix}: ${labels.join(", ")}` : prefix);
  }

  for (const [field, { from, to }] of Object.entries(c.fields)) {
    if (field === "planning") continue;
    parts.push(`${field}: ${fmt(from)} → ${fmt(to)}`);
  }

  return parts.length ? parts.join(" · ") : null;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function ComentariosHistorico({
  orgId,
  planId,
  canWrite,
}: {
  orgId: number;
  planId: number;
  canWrite: boolean;
}) {
  const { data: comments = [] } = useActionPlanComments(orgId, planId);
  const { data: activity = [] } = useActionPlanActivity(orgId, planId);
  const addComment = useAddActionPlanCommentWithInvalidation(orgId);
  const [draft, setDraft] = useState("");

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    try {
      await addComment.mutateAsync({ orgId, planId, data: { body } });
      setDraft("");
    } catch (err) {
      toast({ title: "Erro ao comentar", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  return (
    <Tabs defaultValue="comentarios">
      <TabsList className="mb-3">
        <TabsTrigger value="comentarios" className="gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" /> Comentários
          {comments.length > 0 && <span className="text-[10px] text-muted-foreground">({comments.length})</span>}
        </TabsTrigger>
        <TabsTrigger value="historico" className="gap-1.5">
          <HistoryIcon className="h-3.5 w-3.5" /> Histórico
        </TabsTrigger>
      </TabsList>

      <TabsContent value="comentarios" className="space-y-3">
        {canWrite && (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva um comentário..." rows={2} />
            <div className="flex justify-end">
              <Button size="sm" onClick={submit} disabled={addComment.isPending || !draft.trim()}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {addComment.isPending ? "Enviando..." : "Comentar"}
              </Button>
            </div>
          </div>
        )}
        {comments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sem comentários ainda.</p>
        ) : (
          <div className="space-y-2.5">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{c.createdByUserName ?? "Usuário removido"}</span>
                  <span>{new Date(c.createdAt).toLocaleString("pt-BR")}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="historico">
        {activity.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sem registros de auditoria ainda.</p>
        ) : (
          <ul className="space-y-0">
            {activity.map((e) => {
              const meta = ACTION_META[e.action] ?? ACTION_META.updated;
              const Icon = meta.icon;
              const detail = describeChanges(e);
              const label = actionCompletedLabel(e) ?? meta.label;
              return (
                <li key={e.id} className="flex gap-2.5 border-b py-2 last:border-0">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.tone)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">{e.userName ?? "Sistema"}</span>
                      <span className="text-[11px] text-muted-foreground">{new Date(e.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                    {detail && <p className="truncate text-[11px] text-muted-foreground">{detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
