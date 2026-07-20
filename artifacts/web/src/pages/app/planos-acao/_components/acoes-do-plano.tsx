import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
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
    howMuch: a.howMuch ?? "",
    responsibleUserId:
      a.responsibleUserId != null ? String(a.responsibleUserId) : "",
    dueDate: storageIsoToCalendarDate(a.dueDate),
    status: a.status,
    notes: a.notes ?? "",
  };
}

function draftToPayload(d: ActionDraft): UpdateActionPlanActionBody {
  return {
    what: d.what.trim() || null,
    why: d.why.trim() || null,
    whereAt: d.whereAt.trim() || null,
    how: d.how.trim() || null,
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
    a.howMuch?.trim() ||
    a.notes?.trim() ||
    a.responsibleUserId != null ||
    a.dueDate,
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

  // Flush no pending timers on unmount — nothing to save server-side beyond
  // what's already scheduled; this just avoids a `setState` after unmount.
  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    },
    [],
  );

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

  async function save(actionId: number) {
    const draft = draftsRef.current[actionId];
    if (!draft) return;
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
      if (timersRef.current[actionId]) return;
      dirtyIdsRef.current.delete(actionId);
      const server = actionsRef.current.find((a) => a.id === actionId);
      if (server)
        setDrafts((prev) => ({ ...prev, [actionId]: draftFromAction(server) }));
    }
  }

  /** Clears a row's dirty flag ONLY when no newer edit is pending (no live
   * timer) — the guard that lets the resync effect skip a row still in flight. */
  function clearDirtyIfSettled(actionId: number) {
    if (!timersRef.current[actionId]) dirtyIdsRef.current.delete(actionId);
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
    if (hasContent(action)) {
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
                    className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground"
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
                {aberta && (
                  <div className="border-t bg-muted/20 p-3">
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
                      <Field
                        label="Como"
                        value={draft.how}
                        placeholder="Método / passos"
                        onChange={(v) => patchField(action.id, "how", v)}
                        readOnly={!canEdit}
                      />
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
