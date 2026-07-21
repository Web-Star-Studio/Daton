import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { updateActionPlanAction } from "@workspace/api-client-react";
import { ChevronDown, ChevronRight, ListChecks, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  ACTION_STATUS_LABELS,
  calendarDateToStorageIso,
  storageIsoToCalendarDate,
  todayCalendarDate,
  useActionPlanActions,
  useCreateActionPlanActionWithInvalidation,
  useDeleteActionPlanActionWithInvalidation,
  useUpdateActionPlanActionWithInvalidation,
  type ActionPlanAction,
  type ActionPlanActionStatus,
  type ActionPlanActionTask,
  type UpdateActionPlanActionBody,
} from "@/lib/action-plans-client";
import { buildResponsibleOptions } from "./responsible-options";
import { AutoGrowTextarea } from "./auto-grow-textarea";

const DEBOUNCE_MS = 1000;

const STATUS_OPTIONS: SearchableOption[] = (
  Object.keys(ACTION_STATUS_LABELS) as ActionPlanActionStatus[]
).map((status) => ({ value: status, label: ACTION_STATUS_LABELS[status] }));

/** Editable snapshot of one row. Mirrors `ActionPlanAction`, but with the date
 * as a calendar string (for `<input type="date">`) and every text field as
 * `""` instead of `null` (controlled inputs can't hold `null`). */
type ActionDraft = {
  what: string;
  why: string;
  whereAt: string;
  how: string;
  howTasks: ActionPlanActionTask[];
  howMuch: string;
  responsibleUserId: string;
  dueDate: string;
  status: ActionPlanActionStatus;
  notes: string;
};

function draftFromAction(a: ActionPlanAction): ActionDraft {
  return {
    what: a.what ?? "",
    why: a.why ?? "",
    whereAt: a.whereAt ?? "",
    how: a.how ?? "",
    howTasks: a.howTasks ?? [],
    howMuch: a.howMuch ?? "",
    responsibleUserId:
      a.responsibleUserId != null ? String(a.responsibleUserId) : "",
    dueDate: storageIsoToCalendarDate(a.dueDate),
    status: a.status,
    notes: a.notes ?? "",
  };
}

/** Só persiste passos com texto — uma linha em branco (recém-adicionada e nunca
 * preenchida) é ruído, não conteúdo. O servidor faz a mesma limpeza; aqui evita
 * mandar lixo e mantém o contador "X/Y" honesto. `null` quando não sobra nada. */
function sanitizeTasks(tasks: ActionPlanActionTask[]): ActionPlanActionTask[] | null {
  const clean = tasks
    .map((t) => ({ ...t, text: t.text.trim() }))
    .filter((t) => t.text !== "");
  return clean.length > 0 ? clean : null;
}

function draftToPayload(d: ActionDraft): UpdateActionPlanActionBody {
  return {
    what: d.what.trim() || null,
    why: d.why.trim() || null,
    whereAt: d.whereAt.trim() || null,
    how: d.how.trim() || null,
    howTasks: sanitizeTasks(d.howTasks),
    howMuch: d.howMuch.trim() || null,
    responsibleUserId: d.responsibleUserId ? Number(d.responsibleUserId) : null,
    dueDate: d.dueDate ? calendarDateToStorageIso(d.dueDate) : null,
    status: d.status,
    notes: d.notes.trim() || null,
  };
}

/** Whether the row carries anything worth confirming before deleting. */
function hasContent(a: ActionPlanAction): boolean {
  return Boolean(
    a.what?.trim() ||
    a.why?.trim() ||
    a.whereAt?.trim() ||
    a.how?.trim() ||
    (a.howTasks?.length ?? 0) > 0 ||
    a.howMuch?.trim() ||
    a.notes?.trim() ||
    a.responsibleUserId != null ||
    a.dueDate,
  );
}

/** Data de conclusão de um passo, curta, em pt-BR (dd/mm/aaaa). */
function formatDoneAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

/** Como `hasContent`, mas lê o RASCUNHO atual (não o `action` do servidor, que pode
 * estar defasado): protege texto/tarefa recém-digitados e ainda não salvos de sumirem
 * sem confirmação ao remover a ação logo em seguida. */
function draftHasContent(d: ActionDraft): boolean {
  return Boolean(
    d.what.trim() ||
    d.why.trim() ||
    d.whereAt.trim() ||
    d.how.trim() ||
    d.howTasks.some((t) => t.text.trim() !== "") ||
    d.howMuch.trim() ||
    d.notes.trim() ||
    d.responsibleUserId ||
    d.dueDate,
  );
}

/** Overdue = a due date in the past AND the action hasn't reached a final
 * state (open/in_progress only — a completed or cancelled action is never
 * "late"). `today` is a YYYY-MM-DD calendar string, compared lexically
 * against the stored date's own YYYY-MM-DD prefix (no `Date` parsing, so no
 * timezone drift — same approach as the plan-level overdue check). */
export function isActionOverdue(
  action: Pick<ActionPlanAction, "dueDate" | "status">,
  today: string,
): boolean {
  if (!action.dueDate) return false;
  if (action.status !== "open" && action.status !== "in_progress") return false;
  return action.dueDate.slice(0, 10) < today;
}

/**
 * Tabela de ações rastreáveis (5W2H) do plano. Cada linha nasce vazia ao
 * clicar "+ Incluir ação" (POST imediato) e cada campo salva sozinho — um
 * PATCH debounced (~1s) por linha, independente do autosave da ficha do
 * plano (payloads distintos, nenhuma escrita compartilhada).
 */
export function AcoesDoPlano({
  orgId,
  planId,
  orgUsers,
  canEdit,
}: {
  orgId: number;
  planId: number;
  orgUsers: Array<{ id: number; name: string }>;
  canEdit: boolean;
}) {
  const { data: actions = [] } = useActionPlanActions(orgId, planId);
  const createAction = useCreateActionPlanActionWithInvalidation(orgId, planId);
  const updateAction = useUpdateActionPlanActionWithInvalidation(orgId, planId);
  const deleteAction = useDeleteActionPlanActionWithInvalidation(orgId, planId);

  const [drafts, setDrafts] = useState<Record<number, ActionDraft>>({});
  // Refs so the debounced save (fired from a stale setTimeout closure) always
  // reads the LATEST edited values, and so a server refetch never stomps a
  // row the user is still typing in — same reasoning as the plan's own
  // `formRef`/`dirtyRef` pair in `[id].tsx`.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  // Mirror of `actions` so the error-revert in `save()` reads the freshest
  // server list, not the one captured when its timer was scheduled.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const dirtyIdsRef = useRef<Set<number>>(new Set());
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // Serialização por ação: no máximo um PATCH em voo por linha. Sem isto, dois
  // saves da MESMA ação podem completar fora de ordem e o snapshot antigo do
  // primeiro sobrescreve o valor mais novo do segundo (perda silenciosa).
  const inFlightRef = useRef<Record<number, boolean>>({});
  const resaveRef = useRef<Set<number>>(new Set());
  // Evita setState depois do unmount (o flush abaixo dispara PATCHes na saída).
  const mountedRef = useRef(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [aRemover, setARemover] = useState<ActionPlanAction | null>(null);

  const today = todayCalendarDate();

  // Sync drafts from the server list — but never overwrite a row the user is
  // still editing (dirty), and drop drafts for rows that no longer exist. Runs
  // only when `actions` itself changes (React Query's structural sharing keeps
  // the same array reference across a no-op refetch), so rebuilding every
  // clean row unconditionally here is what lets a change from ANOTHER tab (or
  // our own round-tripped save) actually show up — not just newly-added rows.
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<number, ActionDraft> = {};
      for (const a of actions) {
        next[a.id] =
          dirtyIdsRef.current.has(a.id) && prev[a.id]
            ? prev[a.id]
            : draftFromAction(a);
      }
      return next;
    });
  }, [actions]);

  // No unmount (ou troca de plano), FLUSH das edições ainda não enviadas — sair da
  // tela dentro da janela do debounce (~1s) não pode perder o que o usuário digitou.
  // Dispara o PATCH direto no cliente (não pelo hook, desmontado junto) com o draft
  // MAIS recente. Sem invalidação de cache: o dado é gravado no servidor e a próxima
  // montagem já lê o valor certo.
  useEffect(() => {
    mountedRef.current = true;
    const orgIdSnapshot = orgId;
    const planIdSnapshot = planId;
    return () => {
      mountedRef.current = false;
      const toFlush = new Set<number>();
      for (const id of Object.keys(timersRef.current)) toFlush.add(Number(id));
      for (const id of resaveRef.current) toFlush.add(id);
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
      resaveRef.current.clear();
      for (const actionId of toFlush) {
        const draft = draftsRef.current[actionId];
        if (draft) {
          void updateActionPlanAction(
            orgIdSnapshot,
            planIdSnapshot,
            actionId,
            draftToPayload(draft),
          );
        }
      }
    };
  }, [orgId, planId]);

  function scheduleSave(actionId: number) {
    const existing = timersRef.current[actionId];
    if (existing) clearTimeout(existing);
    timersRef.current[actionId] = setTimeout(() => {
      delete timersRef.current[actionId];
      void save(actionId);
    }, DEBOUNCE_MS);
  }

  function patchField<K extends keyof ActionDraft>(
    actionId: number,
    key: K,
    value: ActionDraft[K],
  ) {
    dirtyIdsRef.current.add(actionId);
    setDrafts((prev) => ({
      ...prev,
      [actionId]: { ...prev[actionId], [key]: value },
    }));
    scheduleSave(actionId);
  }

  // ─── Checklist do "Como" (passos que o responsável marca) ──────────────────
  // Passo recém-criado a focar quando a linha montar (ver o ref-callback no input).
  const focusTaskRef = useRef<string | null>(null);

  /** Adiciona um passo em branco. Só local: marca a linha suja (para o resync do
   * servidor não a apagar enquanto o usuário digita) mas NÃO agenda save — um passo
   * sem texto não persiste, salvar agora apenas o removeria no round-trip. Ao digitar,
   * `patchField("howTasks", ...)` agenda o autosave como qualquer outro campo. */
  function addTask(actionId: number, tasks: ActionPlanActionTask[]) {
    const task: ActionPlanActionTask = { id: crypto.randomUUID(), text: "", done: false };
    focusTaskRef.current = task.id;
    dirtyIdsRef.current.add(actionId);
    setDrafts((prev) => ({
      ...prev,
      [actionId]: { ...prev[actionId], howTasks: [...tasks, task] },
    }));
  }

  async function save(actionId: number) {
    // Serialização: se já há um PATCH desta ação em voo, não dispara um segundo em
    // paralelo (os dois poderiam completar fora de ordem). Marca "re-salvar" e sai;
    // ao terminar, o save em voo re-roda uma vez com o draft mais recente.
    if (inFlightRef.current[actionId]) {
      resaveRef.current.add(actionId);
      return;
    }
    const draft = draftsRef.current[actionId];
    if (!draft) return;
    inFlightRef.current[actionId] = true;
    try {
      await updateAction.mutateAsync({
        orgId,
        planId,
        actionId,
        data: draftToPayload(draft),
      });
      // Só desmarca "suja" se nenhuma edição nova foi agendada enquanto o PATCH
      // estava em voo. Se `timersRef.current[actionId]` existe, o usuário mexeu na
      // linha durante o request — limpar a flag agora deixaria o resync (disparado
      // pelo refetch do onSuccess) reconstruir a linha do servidor e apagar essa
      // edição em voo; o timer pendente então salvaria o valor JÁ revertido. Manter
      // a flag suja faz o resync pular a linha e o próximo save leva o valor certo.
      clearDirtyIfSettled(actionId);
    } catch (err) {
      // E.g. concluding without "O quê" filled in — the server answers 400.
      // Revert the row to its last known-good server value so the UI never
      // keeps showing an edit the server rejected (a "Concluída" that never
      // actually saved) — a menos que o usuário já tenha começado a corrigir a
      // linha (timer vivo): nesse caso a edição nova manda, não a reversão.
      toast({
        title: "Erro ao salvar ação",
        description: apiErrorMessage(err),
        variant: "destructive",
      });
      if (!timersRef.current[actionId] && !resaveRef.current.has(actionId)) {
        dirtyIdsRef.current.delete(actionId);
        const server = actionsRef.current.find((a) => a.id === actionId);
        if (server && mountedRef.current)
          setDrafts((prev) => ({ ...prev, [actionId]: draftFromAction(server) }));
      }
    } finally {
      inFlightRef.current[actionId] = false;
      // Uma edição chegou durante o PATCH — salva de novo, agora com o valor atual.
      if (resaveRef.current.has(actionId)) {
        resaveRef.current.delete(actionId);
        void save(actionId);
      }
    }
  }

  /** Clears a row's dirty flag ONLY when nothing newer is pending — no live timer
   * AND no queued re-save — the guard that lets the resync effect skip a row still
   * being written. Também mantém suja enquanto houver um passo em branco recém-criado:
   * o resync do servidor não pode reconstruir a linha e apagar a tarefa vazia antes de
   * o usuário digitá-la (Enter/autosave na fronteira do debounce). */
  function clearDirtyIfSettled(actionId: number) {
    const hasBlankTask =
      draftsRef.current[actionId]?.howTasks.some((t) => t.text.trim() === "") ?? false;
    if (!timersRef.current[actionId] && !resaveRef.current.has(actionId) && !hasBlankTask) {
      dirtyIdsRef.current.delete(actionId);
    }
  }

  async function handleAdd() {
    try {
      const created = await createAction.mutateAsync({
        orgId,
        planId,
        data: {},
      });
      setExpanded((prev) => new Set(prev).add(created.id));
    } catch (err) {
      toast({
        title: "Erro ao incluir ação",
        description: apiErrorMessage(err),
        variant: "destructive",
      });
    }
  }

  function toggleExpanded(actionId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
  }

  function requestRemove(action: ActionPlanAction) {
    // Confirma pelo rascunho atual (o `action` do servidor pode não ter o que o
    // usuário acabou de digitar/adicionar e ainda não salvou).
    const draft = draftsRef.current[action.id];
    if (draft ? draftHasContent(draft) : hasContent(action)) {
      setARemover(action);
      return;
    }
    void doRemove(action.id);
  }

  async function doRemove(actionId: number) {
    const timer = timersRef.current[actionId];
    if (timer) clearTimeout(timer);
    delete timersRef.current[actionId];
    dirtyIdsRef.current.delete(actionId);
    resaveRef.current.delete(actionId);
    try {
      await deleteAction.mutateAsync({ orgId, planId, actionId });
    } catch (err) {
      toast({
        title: "Erro ao remover ação",
        description: apiErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setARemover(null);
    }
  }

  const total = actions.length;
  const done = actions.filter((a) => a.status === "completed").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Ações · {done} de {total} concluídas
        </h4>
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => void handleAdd()}
            disabled={createAction.isPending}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Incluir ação
          </Button>
        )}
      </div>

      {actions.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nenhuma ação registrada neste plano. Inclua as ações que tratam a
          causa raiz.
        </p>
      ) : (
        // Um card por ação, empilhado — a coluna da ficha é estreita e uma tabela
        // com O quê + 3 controles não cabe (rolava na horizontal). Aqui o "O quê"
        // ocupa a linha inteira e Quem/Quando/Status quebram para 1 coluna no estreito.
        <div className="space-y-2">
          {actions.map((action) => {
            const draft = drafts[action.id] ?? draftFromAction(action);
            const aberta = expanded.has(action.id);
            const overdue = isActionOverdue(action, today);
            const filledTasks = draft.howTasks.filter((t) => t.text.trim() !== "");
            const tasksDone = filledTasks.filter((t) => t.done).length;
            return (
              <div
                key={action.id}
                id={`acao-${action.id}`}
                className="scroll-mt-20 rounded-xl border bg-card/60"
              >
                <div className="flex items-start gap-2 p-2.5">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(action.id)}
                    aria-label={aberta ? "Recolher ação" : "Expandir ação"}
                    aria-expanded={aberta}
                    className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    {aberta ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={draft.what}
                        onChange={(e) =>
                          patchField(action.id, "what", e.target.value)
                        }
                        placeholder="O que será feito"
                        readOnly={!canEdit}
                        className="flex-1"
                      />
                      {overdue && (
                        <Badge
                          variant="destructive"
                          className="shrink-0 text-[10px]"
                        >
                          Atrasada
                        </Badge>
                      )}
                    </div>
                    {/* A coluna da ficha nunca passa de ~438px, então 3 colunas apertariam os
                        controles (o "Selecione"/"Em andamento" truncava). Quem ocupa a linha
                        inteira (nomes são longos); Quando e Status dividem a de baixo. */}
                    <div className="@container">
                      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3">
                        <div className="col-span-2 @2xl:col-span-1">
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Quem
                          </label>
                          <SearchableSelect
                            value={draft.responsibleUserId}
                            onChange={(v) =>
                              patchField(action.id, "responsibleUserId", v)
                            }
                            options={buildResponsibleOptions(
                              orgUsers,
                              draft.responsibleUserId,
                              action.responsibleUserName,
                            )}
                            placeholder="Selecione"
                            searchPlaceholder="Buscar usuário..."
                            emptyMessage="Nenhum usuário encontrado"
                            disabled={!canEdit}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Quando
                          </label>
                          <Input
                            type="date"
                            value={draft.dueDate}
                            onChange={(e) =>
                              patchField(action.id, "dueDate", e.target.value)
                            }
                            readOnly={!canEdit}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Status
                          </label>
                          <SearchableSelect
                            value={draft.status}
                            // Status é obrigatório — ignora o "Limpar seleção" do combobox (setaria "").
                            onChange={(v) => {
                              if (v)
                                patchField(
                                  action.id,
                                  "status",
                                  v as ActionPlanActionStatus,
                                );
                            }}
                            options={STATUS_OPTIONS}
                            disabled={!canEdit}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1 h-8 w-8 shrink-0 text-muted-foreground"
                      aria-label="Remover ação"
                      onClick={() => requestRemove(action)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {/* Afeto de expansão explícito: o chevron sozinho não deixava claro
                    que havia mais (Como/checklist, Por quê, Onde, Quanto, Observações). */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(action.id)}
                  aria-expanded={aberta}
                  aria-label={aberta ? "Recolher detalhes da ação" : "Expandir detalhes da ação"}
                  className="flex w-full items-center gap-1.5 border-t px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {aberta ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{aberta ? "Recolher" : "Como, Por quê, Onde, Quanto"}</span>
                  {!aberta && filledTasks.length > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-normal">
                      <ListChecks className="h-3 w-3" />
                      {`${tasksDone}/${filledTasks.length} no Como`}
                    </span>
                  )}
                </button>
                {aberta && (
                  <div className="bg-muted/20 p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field
                        label="Por quê"
                        value={draft.why}
                        placeholder="Justificativa / objetivo"
                        onChange={(v) => patchField(action.id, "why", v)}
                        readOnly={!canEdit}
                      />
                      <Field
                        label="Onde"
                        value={draft.whereAt}
                        placeholder="Local / processo / unidade"
                        onChange={(v) => patchField(action.id, "whereAt", v)}
                        readOnly={!canEdit}
                      />
                      {/* "Como" ocupa a linha inteira: é a checklist de passos que o
                          responsável quebra em tarefas e vai marcando. O texto livre
                          (`how`) foi aposentado da UI — a lista É o método. */}
                      <div className="space-y-2 sm:col-span-2">
                        <TasksChecklist
                          tasks={draft.howTasks}
                          canEdit={canEdit}
                          focusTaskRef={focusTaskRef}
                          onAdd={() => addTask(action.id, draft.howTasks)}
                          onToggle={(taskId, done) =>
                            patchField(
                              action.id,
                              "howTasks",
                              draft.howTasks.map((t) =>
                                t.id === taskId ? { ...t, done } : t,
                              ),
                            )
                          }
                          onText={(taskId, text) =>
                            patchField(
                              action.id,
                              "howTasks",
                              draft.howTasks.map((t) =>
                                t.id === taskId ? { ...t, text } : t,
                              ),
                            )
                          }
                          onRemove={(taskId) =>
                            patchField(
                              action.id,
                              "howTasks",
                              draft.howTasks.filter((t) => t.id !== taskId),
                            )
                          }
                        />
                      </div>
                      <Field
                        label="Quanto"
                        value={draft.howMuch}
                        placeholder="Custo estimado (ex.: R$ 2.400,00)"
                        onChange={(v) => patchField(action.id, "howMuch", v)}
                        readOnly={!canEdit}
                      />
                      <div className="sm:col-span-2">
                        <Field
                          label="Observações"
                          value={draft.notes}
                          placeholder="Notas adicionais sobre esta ação"
                          onChange={(v) => patchField(action.id, "notes", v)}
                          readOnly={!canEdit}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={aRemover !== null}
        onOpenChange={(open) => {
          if (!open) setARemover(null);
        }}
        title="Remover ação?"
        description={
          aRemover
            ? `A ação "${aRemover.what?.trim() || "sem título"}" será apagada deste plano. Não pode ser desfeito.`
            : undefined
        }
        confirmLabel="Remover"
        loading={deleteAction.isPending}
        onConfirm={() => {
          if (aRemover) void doRemove(aRemover.id);
        }}
      />
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <AutoGrowTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
      />
    </div>
  );
}

/**
 * Checklist de passos do "Como": o responsável quebra o método em tarefas e vai
 * marcando conforme executa. Fica sob o campo "Como" da ação. Cada mudança (texto,
 * marcação, remoção) salva pelo mesmo autosave debounced dos demais campos da ação;
 * só a inclusão de uma linha em branco não dispara save (ver `addTask`).
 */
function TasksChecklist({
  tasks,
  canEdit,
  focusTaskRef,
  onAdd,
  onToggle,
  onText,
  onRemove,
}: {
  tasks: ActionPlanActionTask[];
  canEdit: boolean;
  focusTaskRef: MutableRefObject<string | null>;
  onAdd: () => void;
  onToggle: (taskId: string, done: boolean) => void;
  onText: (taskId: string, text: string) => void;
  onRemove: (taskId: string) => void;
}) {
  const filled = tasks.filter((t) => t.text.trim() !== "");
  const done = filled.filter((t) => t.done).length;

  // Read-only e sem tarefas: não polui a ficha com um cabeçalho vazio.
  if (tasks.length === 0 && !canEdit) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" />
        <span>Como</span>
        {filled.length > 0 && (
          <span className="font-normal normal-case tracking-normal">
            · {done}/{filled.length} concluídas
          </span>
        )}
      </div>

      {tasks.length > 0 && (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li key={task.id} className="space-y-0.5">
              <div className="flex items-center gap-2">
              <Checkbox
                checked={task.done}
                onCheckedChange={(v) => onToggle(task.id, v === true)}
                // Um passo sem texto ainda não existe de fato — não deixa marcar.
                disabled={!canEdit || task.text.trim() === ""}
                aria-label={
                  task.done ? "Desmarcar tarefa" : "Marcar tarefa como concluída"
                }
                className="shrink-0"
              />
              <Input
                ref={(el) => {
                  // Foca o passo recém-criado assim que a linha monta (uma vez).
                  if (el && focusTaskRef.current === task.id) {
                    el.focus();
                    focusTaskRef.current = null;
                  }
                }}
                value={task.text}
                onChange={(e) => onText(task.id, e.target.value)}
                onKeyDown={(e) => {
                  // Enter encadeia: salva o passo atual e já abre o próximo.
                  if (e.key === "Enter" && !e.shiftKey && canEdit) {
                    e.preventDefault();
                    onAdd();
                  }
                }}
                placeholder="Descreva o passo…"
                readOnly={!canEdit}
                className={cn(
                  "h-8 flex-1 text-[13px]",
                  task.done && "text-muted-foreground line-through",
                )}
              />
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  aria-label="Remover tarefa"
                  onClick={() => onRemove(task.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              </div>
              {/* Carimbo de conclusão: quando e quem marcou (vem do servidor). */}
              {task.done && task.doneAt && (
                <p className="pl-6 text-[11px] text-muted-foreground">
                  Concluída em {formatDoneAt(task.doneAt)}
                  {task.doneByUserName ? ` · ${task.doneByUserName}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={onAdd}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar tarefa
        </Button>
      )}
    </div>
  );
}
