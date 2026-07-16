import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  History,
  Loader2,
  Lock,
  Paperclip,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { getListOrgUsersQueryKey, useListOrgUsers } from "@workspace/api-client-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { buildResponsibleOptions } from "./_components/responsible-options";
import { mergeDraftIntoForm } from "./_components/merge-draft";
import { diffActionPlanPayload } from "./_components/payload-diff";
import { apiErrorMessage } from "@/lib/api-error";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { resolveApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { MAX_DIRECT_UPLOAD_FILE_SIZE_BYTES, formatFileSize, uploadFileToStorage } from "@/lib/uploads";
import {
  ACTION_PLAN_PRIORITY_LABELS,
  ACTION_PLAN_STATUS_LABELS,
  ACTION_TYPE_LABELS,
  SOURCE_MODULE_LABELS,
  actionPlanPriorityColor,
  actionPlanStatusColor,
  calendarDateToStorageIso,
  isActionPlanEncerrado,
  originLink,
  storageIsoToCalendarDate,
  todayCalendarDate,
  useActionPlan,
  useAddActionPlanEvidenceWithInvalidation,
  useAllAnalysisMethods,
  buildAnalysisMethodLabelMap,
  useCreateActionPlanActionWithInvalidation,
  useDeleteActionPlanEvidenceWithInvalidation,
  useDeleteActionPlanWithInvalidation,
  useSuggestActionPlanDraft,
  useUpdateActionPlanWithInvalidation,
  type ActionPlan5W2H,
  type ActionPlanNormRef,
  type ActionPlanPriority,
  type ActionPlanStatus,
  type ActionPlanType,
  type UpdateActionPlanBody,
} from "@/lib/action-plans-client";
import { ActionPlanTimeline } from "./_components/timeline";
import { GutInput } from "./_components/gut-input";
import { Tratativas } from "./_components/tratativas";
import { AcoesDoPlano } from "./_components/acoes-do-plano";
import { AutoGrowTextarea } from "./_components/auto-grow-textarea";
import type { ActionPlanAnalysis } from "./_components/analises/types";
import { EficaciaPanel, type EficaciaValue } from "./_components/eficacia-panel";
import { Vinculos } from "./_components/vinculos";
import { ComentariosHistorico } from "./_components/comentarios-historico";
import { PlanningVersionsDialog, usePlanningVersionCount } from "./_components/planning-versions-dialog";

const STATUS_OPTIONS: ActionPlanStatus[] = ["open", "in_progress", "completed", "cancelled"];
const PRIORITY_OPTIONS: ActionPlanPriority[] = ["low", "medium", "high"];
const TYPE_OPTIONS: ActionPlanType[] = ["corrective", "preventive", "improvement"];
const MONTH_LABELS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Soft guard shown when concluding a plan that still has open/in-progress actions
 * (see `handleConclude`) — warns, but never blocks. */
function pendingActionsMessage(pending: number): string {
  const plural = pending !== 1;
  return `Este plano tem ${pending} ${plural ? "ações" : "ação"} não ${plural ? "concluídas" : "concluída"}. Concluir mesmo assim?`;
}

/** Whether the AI's 5W2H draft has anything worth mapping onto the plan's first
 * action (see `handleSuggest`). */
function hasPlan5w2hContent(p: ActionPlan5W2H): boolean {
  return Boolean(
    p.what?.trim() || p.why?.trim() || p.where?.trim() || p.how?.trim() || p.howMuch?.trim() || p.who?.trim() || p.when?.trim(),
  );
}

function Section({ id, title, action, children }: { id?: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-border/60 bg-card/42 p-5 shadow-sm backdrop-blur-md transition-shadow">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ActionPlanFichaPage() {
  const [, params] = useRoute<{ id: string }>("/planos-acao/:id");
  const [, paramsApp] = useRoute<{ id: string }>("/app/planos-acao/:id");
  const idStr = params?.id ?? paramsApp?.id;
  const parsedPlanId = idStr ? Number(idStr) : NaN;
  const planId = Number.isInteger(parsedPlanId) && parsedPlanId > 0 ? parsedPlanId : null;

  const { organization, user } = useAuth();
  const { canWrite, isAdmin, role, hasModuleAccess } = usePermissions();
  const orgId = organization!.id;
  const [location, setLocation] = useLocation();

  usePageTitle("Plano de Ação");
  usePageSubtitle("");

  const { data: plan, isLoading } = useActionPlan(orgId, planId);
  // GET /organizations/:id/users is restricted to admins and managers. Asking for
  // it as an operator only buys a 403 in the console — the responsible name comes
  // from the plan itself (see buildResponsibleOptions).
  const canListOrgUsers = isAdmin || (role === "manager" && hasModuleAccess("kpi"));
  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: {
      queryKey: getListOrgUsersQueryKey(orgId),
      staleTime: 60_000,
      enabled: canListOrgUsers,
    },
  });
  const orgUsers = orgUsersData?.users ?? [];

  const updatePlan = useUpdateActionPlanWithInvalidation(orgId);
  const deletePlan = useDeleteActionPlanWithInvalidation(orgId);
  const addEvidence = useAddActionPlanEvidenceWithInvalidation(orgId);
  const deleteEvidence = useDeleteActionPlanEvidenceWithInvalidation(orgId);
  const suggestDraft = useSuggestActionPlanDraft();
  // Only used by `handleSuggest` to create the plan's first action from the AI's
  // 5W2H draft — by the time that can fire, `planId` is guaranteed non-null (the
  // "Sugerir plano" button only renders once the plan has loaded).
  const createFirstAction = useCreateActionPlanActionWithInvalidation(orgId, planId ?? 0);

  // Catálogo de tratativas: displays (labelPorChave) usam o catálogo INTEIRO
  // (incl. inativas), pois um plano pode ter adotado uma tratativa antes de a
  // empresa desligá-la; "+ Adicionar tratativa" só oferece as ativas.
  const { data: todasTratativas = [] } = useAllAnalysisMethods(orgId);
  const metodosAtivos = todasTratativas.filter((m) => m.active);
  const labelPorChave = buildAnalysisMethodLabelMap(todasTratativas);

  const emptyEfic: EficaciaValue = { method: "", dueDate: "", evaluatorUserId: "", before: "", after: "", result: "", comment: "" };
  const [form, setForm] = useState({
    title: "",
    description: "",
    actionType: "corrective" as ActionPlanType,
    status: "open" as ActionPlanStatus,
    priority: "medium" as ActionPlanPriority,
    responsibleUserId: "",
    dueDate: "",
    correctiveActionDescription: "",
    correctiveActionCompletedAt: "",
    gut: { gravity: null as number | null, urgency: null as number | null, tendency: null as number | null },
    analyses: [] as ActionPlanAnalysis[],
    rootCause: "",
    efic: emptyEfic,
    vinc: { odsNumbers: [] as number[], normRefs: [] as ActionPlanNormRef[] },
  });
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const planningVersionCount = usePlanningVersionCount(orgId, planId);
  const [concludeConfirmOpen, setConcludeConfirmOpen] = useState(false);

  // Edit guard: an encerrado plan (or a read-only role) can't be edited/autosaved.
  const isLocked = !!plan && isActionPlanEncerrado(plan);
  const isClosed = !!plan && (plan.status === "completed" || plan.status === "cancelled");
  const canEdit = canWrite && !isLocked;

  // Refs so async callbacks (autosave, flush-on-leave) read the latest values.
  const formRef = useRef(form);
  formRef.current = form;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const isSavingRef = useRef(false);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const hydratedIdRef = useRef<number | null>(null);
  // Last server state this tab synced to, in payload shape. `persist` sends only
  // what differs from it, so an untouched field can never be reverted by a save
  // from a tab that loaded before someone else changed it.
  const baselineRef = useRef<UpdateActionPlanBody | null>(null);

  // Hydrate the form from the server. NEVER overwrite a DIRTY form on a same-plan
  // refetch — that was silently wiping unsaved edits ("estava completinha, entrei
  // e está vazio"). But for a new plan, or a CLEAN form, do (re)sync: this also
  // corrects a stale React Query cache on first paint. Read-only displays
  // (evidences, badges, timeline) read `plan` directly, so they always refresh.
  useEffect(() => {
    if (!plan) return;
    const isNewPlan = plan.id !== hydratedIdRef.current;
    if (!isNewPlan && dirtyRef.current) return;
    hydratedIdRef.current = plan.id;
    const hydrated: typeof form = {
      title: plan.title,
      description: plan.description ?? "",
      actionType: plan.actionType,
      status: plan.status,
      priority: plan.priority,
      responsibleUserId: plan.responsibleUserId != null ? String(plan.responsibleUserId) : "",
      dueDate: storageIsoToCalendarDate(plan.dueDate),
      correctiveActionDescription: plan.correctiveActionDescription ?? "",
      correctiveActionCompletedAt: storageIsoToCalendarDate(plan.correctiveActionCompletedAt),
      gut: { gravity: plan.gutGravity ?? null, urgency: plan.gutUrgency ?? null, tendency: plan.gutTendency ?? null },
      analyses: plan.analyses ?? [],
      rootCause: plan.rootCause ?? "",
      efic: {
        method: plan.effectivenessMethod ?? "",
        dueDate: storageIsoToCalendarDate(plan.effectivenessDueDate),
        evaluatorUserId: plan.effectivenessEvaluatorUserId != null ? String(plan.effectivenessEvaluatorUserId) : "",
        before: plan.effectivenessBefore ?? "",
        after: plan.effectivenessAfter ?? "",
        result: plan.effectivenessResult ?? "",
        comment: plan.effectivenessComment ?? "",
      },
      vinc: { odsNumbers: plan.odsNumbers ?? [], normRefs: plan.normRefs ?? [] },
    };
    setForm(hydrated);
    baselineRef.current = buildPayload(hydrated);
    setDirty(false);
    if (isNewPlan) setSaveStatus("idle");
  }, [plan]);

  function buildPayload(f: typeof form): UpdateActionPlanBody {
    const body: UpdateActionPlanBody = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      actionType: f.actionType,
      status: f.status,
      priority: f.priority,
      responsibleUserId: f.responsibleUserId ? Number(f.responsibleUserId) : null,
      dueDate: f.dueDate ? calendarDateToStorageIso(f.dueDate) : null,
      correctiveActionDescription: f.correctiveActionDescription.trim() || null,
      correctiveActionCompletedAt: f.correctiveActionCompletedAt ? calendarDateToStorageIso(f.correctiveActionCompletedAt) : null,
      gutGravity: f.gut.gravity,
      gutUrgency: f.gut.urgency,
      gutTendency: f.gut.tendency,
      analyses: f.analyses.length ? f.analyses : null,
      rootCause: f.rootCause.trim() || null,
      effectivenessMethod: f.efic.method || null,
      effectivenessDueDate: f.efic.dueDate ? calendarDateToStorageIso(f.efic.dueDate) : null,
      effectivenessBefore: f.efic.before.trim() || null,
      effectivenessAfter: f.efic.after.trim() || null,
      effectivenessComment: f.efic.comment.trim() || null,
      odsNumbers: f.vinc.odsNumbers,
      normRefs: f.vinc.normRefs,
    };
    // Permission-gated fields are sent ONLY by who may change them, so an unrelated
    // save from a stale form never trips the server gate (or overwrites the value).
    // Designating the evaluator is an SGI act; issuing the verdict is the evaluator's.
    const canAssignEvaluator = isAdmin;
    const canIssueVerdict = isAdmin || (plan?.effectivenessEvaluatorUserId != null && plan.effectivenessEvaluatorUserId === user?.id);
    if (canAssignEvaluator) body.effectivenessEvaluatorUserId = f.efic.evaluatorUserId ? Number(f.efic.evaluatorUserId) : null;
    if (canIssueVerdict) body.effectivenessResult = f.efic.result || null;
    return body;
  }

  // Single persistence path (autosave, manual button, conclude). Calls are
  // SERIALIZED via a promise chain: each runs after the previous one and saves the
  // LATEST form snapshot at its turn. So an explicit action (conclude / leave)
  // always lands the newest edits and never collides with an in-flight autosave.
  // Resolves `true` only when a save actually succeeds (errors/empty title → false).
  // `silent` suppresses toasts (used by autosave — the header indicator shows state).
  function persist(opts?: { extra?: Partial<UpdateActionPlanBody>; silent?: boolean }): Promise<boolean> {
    const run = saveChainRef.current.then(async (): Promise<boolean> => {
      if (!planId) return false;
      const snapshot = formRef.current;
      if (!snapshot.title.trim()) {
        if (!opts?.silent) toast({ title: "Informe o título do plano de ação", variant: "destructive" });
        return false;
      }
      // Send ONLY what this tab changed. A full payload would revert every field
      // another tab touched since we loaded the plan (see payload-diff).
      const data = {
        ...diffActionPlanPayload(baselineRef.current, buildPayload(snapshot)),
        ...(opts?.extra ?? {}),
      };
      if (Object.keys(data).length === 0) {
        if (formRef.current === snapshot) setDirty(false);
        setSaveStatus("saved");
        return true;
      }
      isSavingRef.current = true;
      setSaveStatus("saving");
      try {
        await updatePlan.mutateAsync({ orgId, planId, data });
        // The saved fields are now the server's truth for this tab; the rest of the
        // baseline stays as loaded, so we keep not touching what we never edited.
        baselineRef.current = { ...(baselineRef.current ?? {}), ...data };
        // Clear "dirty" only if nothing changed during the save; otherwise the next
        // chained run (scheduled by the autosave effect) persists the newer edits.
        if (formRef.current === snapshot) setDirty(false);
        setSaveStatus("saved");
        return true;
      } catch (err) {
        setSaveStatus("error");
        if (!opts?.silent) toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
        return false;
      } finally {
        isSavingRef.current = false;
      }
    });
    // Keep the chain alive regardless of this run's outcome.
    saveChainRef.current = run.then(() => undefined, () => undefined);
    return run;
  }

  // Autosave: ~1s after the user stops typing, while there are unsaved edits and
  // the plan is editable. The manual "Salvar" button stays as a fallback.
  useEffect(() => {
    if (!dirty || !canEdit || !formRef.current.title.trim()) return;
    const t = setTimeout(() => { void persist({ silent: true }); }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty, canEdit]);

  // Warn before closing/refreshing the tab with unsaved edits; flush on unmount.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || isSavingRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (dirtyRef.current) void persist({ silent: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceContext = plan?.sourceContext;
  const kpiContext = sourceContext?.kpi ?? null;
  const originDest = plan ? originLink(plan) : null;
  const originHref = originDest ? `${location.startsWith("/app/") ? "/app" : ""}${originDest.path}` : null;

  function patch<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    if (await persist()) toast({ title: "Ação salva" });
  }

  // Opt-in AI assist: drafts 5W2H + 5-whys from the problem text. Fill-only — it
  // never overwrites what the user already typed, never persists, and only marks
  // the form dirty so the user reviews and saves via the existing "Salvar".
  async function handleSuggest() {
    const problem = form.description.trim() || form.title.trim();
    if (!problem) {
      toast({ title: "Descreva o problema antes de sugerir", variant: "destructive" });
      return;
    }
    try {
      const draft = await suggestDraft.mutateAsync({
        orgId,
        data: {
          problem,
          title: form.title.trim() || null,
          sourceModule: plan?.sourceModule,
          contextLabel: sourceContext?.label ?? null,
        },
      });
      const has5w2h = hasPlan5w2hContent(draft.plan5w2h);
      const filledNothing = !draft.rootCause && draft.rootCauseWhys.length === 0 && !has5w2h;
      if (filledNothing) {
        toast({ title: "A IA não retornou sugestões", variant: "destructive" });
        return;
      }
      // Fill-only merge: only fills fields the user left blank. Merge off `formRef`
      // (always current) rather than inside a setForm updater — React runs updaters
      // during render, so a flag set in there is still false on the next line.
      const { changed, ...merged } = mergeDraftIntoForm(formRef.current, draft);

      // draft.plan5w2h → primeira ação do plano. Só cria quando a IA sugeriu algo E
      // o plano ainda não tem NENHUMA ação — nunca sobrescreve uma já existente (o
      // usuário pode ter criado/editado ações manualmente entre duas sugestões).
      // Falha ao criar é best-effort: o resto do rascunho (causa raiz / 5 porquês)
      // já foi preenchido e não deve se perder por isso.
      let actionCreated = false;
      if (has5w2h && planId && (plan?.actionsTotal ?? 0) === 0) {
        const w = draft.plan5w2h;
        try {
          await createFirstAction.mutateAsync({
            orgId,
            planId,
            data: {
              what: w.what?.trim() || null,
              why: w.why?.trim() || null,
              whereAt: w.where?.trim() || null,
              how: w.how?.trim() || null,
              howMuch: w.howMuch?.trim() || null,
            },
          });
          actionCreated = true;
        } catch (err) {
          toast({ title: "Rascunho gerado, mas não foi possível criar a 1ª ação", description: apiErrorMessage(err), variant: "destructive" });
        }
      }

      if (!changed && !actionCreated) {
        toast({ title: "Seus campos já estão preenchidos", description: "A IA não tinha o que adicionar." });
        return;
      }
      if (changed) {
        setForm((f) => ({ ...f, ...merged }));
        setDirty(true);
      }
      toast({ title: actionCreated ? "Rascunho gerado — 1ª ação criada a partir do 5W2H" : "Rascunho gerado — revise e salve" });
    } catch (err) {
      toast({ title: "Não foi possível gerar a sugestão", description: apiErrorMessage(err), variant: "destructive" });
    }
  }

  async function handleConclude() {
    if (!planId) return;
    // Soft guard: an open/in-progress action left behind is worth a second look,
    // but never blocks the conclusion — the user may confirm and proceed anyway.
    const pending = (plan?.actionsTotal ?? 0) - (plan?.actionsDone ?? 0);
    if (pending > 0) {
      setConcludeConfirmOpen(true);
      return;
    }
    await doConclude();
  }

  async function doConclude() {
    if (!planId) return;
    const today = todayCalendarDate();
    // `persist` is serialized, so this runs AFTER any in-flight autosave and saves
    // the LATEST form together with the completed status, in one atomic request —
    // nothing typed is stranded, and it never aborts just because a save was running.
    const ok = await persist({
      silent: true,
      extra: { status: "completed", correctiveActionCompletedAt: calendarDateToStorageIso(today) },
    });
    if (ok) {
      setForm((f) => ({ ...f, status: "completed", correctiveActionCompletedAt: today }));
      toast({ title: "Ação concluída" });
    } else {
      toast({ title: "Não foi possível concluir — verifique os campos e tente novamente", variant: "destructive" });
    }
  }

  async function handleReopen() {
    if (!planId) return;
    if (!window.confirm("Reabrir este plano encerrado? Ele voltará para 'Em andamento' e poderá ser editado novamente.")) return;
    try {
      await updatePlan.mutateAsync({ orgId, planId, data: { status: "in_progress" } });
      setForm((f) => ({ ...f, status: "in_progress" }));
      // This PATCH bypasses `persist`, so rebase the baseline by hand. Otherwise
      // `status` reads as changed forever and every later save re-sends
      // "in_progress", silently reopening a plan someone else closed meanwhile.
      baselineRef.current = { ...(baselineRef.current ?? {}), status: "in_progress" };
      toast({ title: "Plano reaberto" });
    } catch (err) {
      toast({ title: "Erro ao reabrir", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!planId) return;
    if (!window.confirm("Excluir esta ação e todas as evidências? Não pode ser desfeito.")) return;
    try {
      await deletePlan.mutateAsync({ orgId, planId });
      toast({ title: "Ação excluída" });
      setLocation("/planos-acao");
    } catch (err) {
      toast({ title: "Erro ao excluir", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !planId) return;
    const list = Array.from(files);
    const oversize = list.find((f) => f.size > MAX_DIRECT_UPLOAD_FILE_SIZE_BYTES);
    if (oversize) {
      toast({ title: `"${oversize.name}" excede o limite de 20MB`, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      for (const file of list) {
        const uploaded = await uploadFileToStorage(file);
        await addEvidence.mutateAsync({ orgId, planId, data: uploaded });
      }
      toast({ title: `${list.length} arquivo${list.length !== 1 ? "s" : ""} anexado${list.length !== 1 ? "s" : ""}` });
    } catch (err) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveEvidence(evidenceId: number) {
    if (!planId) return;
    if (!window.confirm("Remover esta evidência?")) return;
    try {
      await deleteEvidence.mutateAsync({ orgId, planId, evidenceId });
      toast({ title: "Evidência removida" });
    } catch (err) {
      toast({ title: "Erro ao remover", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  const relatedIndicatorIds = useMemo(() => plan?.relatedIndicatorIds ?? [], [plan]);

  if (planId === null) return <div className="p-6"><p className="text-sm text-muted-foreground">URL inválida.</p></div>;
  if (isLoading) return <div className="p-6"><p className="text-sm text-muted-foreground">Carregando...</p></div>;
  if (!plan) {
    return (
      <div className="space-y-2 p-6">
        <p className="text-sm text-muted-foreground">Ação não encontrada.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/planos-acao")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      {/* Top bar */}
      <div id="etapa-encerramento" className="flex scroll-mt-20 flex-wrap items-center gap-2 rounded-lg transition-shadow">
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            // Flush pending edits before leaving; stay only if the save fails (use
            // the return value — dirtyRef lags a render). Anything typed during the
            // flush is caught by the unmount flush, so a successful save proceeds.
            if (dirtyRef.current && !(await persist())) return;
            setLocation("/planos-acao");
          }}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Ações
        </Button>
        {plan.code && <span className="text-sm text-muted-foreground">{plan.code}</span>}
        <Badge variant="secondary" className={cn("px-1.5", actionPlanStatusColor(plan.status))}>{ACTION_PLAN_STATUS_LABELS[plan.status]}</Badge>
        <Badge variant="secondary" className="px-1.5">{ACTION_TYPE_LABELS[plan.actionType]}</Badge>
        <Badge variant="outline" className="px-1.5 text-muted-foreground">{SOURCE_MODULE_LABELS[plan.sourceModule] ?? plan.sourceModule}</Badge>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <div className="flex items-center gap-2">
              <span className="text-xs">
                {saveStatus === "saving" ? (
                  <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</span>
                ) : dirty ? (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-current" /> Alterações não salvas</span>
                ) : saveStatus === "saved" ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Salvo</span>
                ) : saveStatus === "error" ? (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><AlertCircle className="h-3.5 w-3.5" /> Erro ao salvar</span>
                ) : null}
              </span>
              {(dirty || saveStatus === "error") && (
                <Button size="sm" variant={saveStatus === "error" ? "default" : "outline"} onClick={handleSave} disabled={updatePlan.isPending}>
                  <Save className="mr-1 h-3.5 w-3.5" /> Salvar
                </Button>
              )}
            </div>
          )}
          {canWrite && !isClosed && (
            <Button variant="outline" size="sm" onClick={handleConclude} disabled={updatePlan.isPending}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Concluir ação
            </Button>
          )}
          {isAdmin && isLocked && (
            <Button variant="outline" size="sm" onClick={handleReopen} disabled={updatePlan.isPending}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reabrir
            </Button>
          )}
          {canWrite && (!isLocked || isAdmin) && (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={handleDelete} aria-label="Excluir ação">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Encerrado lock banner */}
      {isLocked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            Plano encerrado — bloqueado para alterações.{" "}
            {isAdmin
              ? "Use “Reabrir” para voltar a editar."
              : "Somente um administrador (SGI) pode reabri-lo."}
          </span>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-2xl border border-border/60 bg-card/42 px-5 py-4 shadow-sm backdrop-blur-md">
        <ActionPlanTimeline plan={plan} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ─── Left column ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Section id="etapa-identificacao" title="Identificação e contexto">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input value={form.title} onChange={(e) => patch("title", e.target.value)} readOnly={!canEdit} />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição do problema</Label>
                <Textarea value={form.description} onChange={(e) => patch("description", e.target.value)} rows={3} placeholder="Contexto, problema constatado, escopo..." readOnly={!canEdit} />
              </div>
              {/* Origin */}
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Origem</p>
                    <p className="text-sm font-medium">{sourceContext?.label ?? plan.sourceModule}</p>
                  </div>
                  {originHref && originDest && (
                    <a href={originHref} className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline" title={originDest.label}>
                      <ExternalLink className="h-3 w-3" /> {originDest.label}
                    </a>
                  )}
                </div>
                {kpiContext && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{kpiContext.indicatorName} · {MONTH_LABELS[kpiContext.month - 1]}/{kpiContext.year}</span>
                    {kpiContext.value !== null && kpiContext.goal !== null && <span>· Valor {kpiContext.value} / Meta {kpiContext.goal}</span>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de ação</Label>
                  <Select value={form.actionType} onChange={(e) => patch("actionType", e.target.value as ActionPlanType)} disabled={!canEdit}>
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onChange={(e) => patch("status", e.target.value as ActionPlanStatus)} disabled={!canEdit}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{ACTION_PLAN_STATUS_LABELS[s]}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Responsável</Label>
                  <SearchableSelect
                    value={form.responsibleUserId}
                    onChange={(v) => patch("responsibleUserId", v)}
                    options={buildResponsibleOptions(orgUsers, form.responsibleUserId, plan.responsibleUserName)}
                    placeholder="Selecione"
                    searchPlaceholder="Buscar usuário..."
                    emptyMessage="Nenhum usuário encontrado"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Prazo</Label>
                  <Input type="date" value={form.dueDate} onChange={(e) => patch("dueDate", e.target.value)} readOnly={!canEdit} />
                </div>
                <div className="space-y-1.5">
                  <Label>Prioridade</Label>
                  <Select value={form.priority} onChange={(e) => patch("priority", e.target.value as ActionPlanPriority)} disabled={!canEdit}>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{ACTION_PLAN_PRIORITY_LABELS[p]}</option>)}
                  </Select>
                </div>
              </div>
            </div>
          </Section>

          <Section
            id="etapa-planejamento"
            title="Planejamento"
            action={
              <div className="flex items-center gap-1.5">
                {planningVersionCount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setVersionsOpen(true)}
                  >
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    Versões ({planningVersionCount})
                  </Button>
                )}
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={suggestDraft.isPending}
                    disabled={!form.description.trim() && !form.title.trim()}
                    onClick={() => void handleSuggest()}
                  >
                    {!suggestDraft.isPending && <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                    Sugerir plano (IA)
                  </Button>
                )}
              </div>
            }
          >
            <div className="space-y-6">
              <div>
                <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Tratativas
                </h4>
                <Tratativas
                  analyses={form.analyses}
                  onChange={(analyses) => patch("analyses", analyses)}
                  metodosAtivos={metodosAtivos}
                  labelPorChave={labelPorChave}
                  readOnly={!canEdit}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Causa raiz identificada
                </label>
                <AutoGrowTextarea
                  value={form.rootCause}
                  onChange={(e) => patch("rootCause", e.target.value)}
                  placeholder="Conclusão da análise — a causa fundamental a ser tratada."
                  readOnly={!canEdit}
                />
              </div>
              {planId && (
                <AcoesDoPlano orgId={orgId} planId={planId} orgUsers={orgUsers} canEdit={canEdit} />
              )}
            </div>
          </Section>

          {planId && (
            <PlanningVersionsDialog
              orgId={orgId}
              planId={planId}
              canEdit={canEdit}
              open={versionsOpen}
              onOpenChange={setVersionsOpen}
              onBeforeRestore={() => persist({ silent: true })}
            />
          )}

          <ConfirmDialog
            open={concludeConfirmOpen}
            onOpenChange={setConcludeConfirmOpen}
            title="Concluir com ações em aberto?"
            description={pendingActionsMessage((plan.actionsTotal ?? 0) - (plan.actionsDone ?? 0))}
            confirmLabel="Concluir mesmo assim"
            destructive={false}
            onConfirm={() => {
              setConcludeConfirmOpen(false);
              void doConclude();
            }}
          />

          <Section id="etapa-execucao" title="Comentários e histórico">
            <ComentariosHistorico orgId={orgId} planId={plan.id} canWrite={canWrite} />
          </Section>
        </div>

        {/* ─── Right column ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Section title="Prioridade GUT">
            <GutInput value={form.gut} onChange={(v) => patch("gut", v)} readOnly={!canEdit} />
          </Section>

          <Section title="Vínculos normativos e estratégicos">
            <Vinculos value={form.vinc} onChange={(v) => patch("vinc", v)} readOnly={!canEdit} />
            {relatedIndicatorIds.length > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {relatedIndicatorIds.length} indicador(es) relacionado(s) à origem.
              </p>
            )}
          </Section>

          <Section
            id="etapa-evidencia"
            title="Evidências"
            action={canEdit ? (
              <>
                <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => void handleFiles(e.target.files)} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Paperclip className="mr-1.5 h-4 w-4" /> {uploading ? "Enviando..." : "Anexar"}
                </Button>
              </>
            ) : undefined}
          >
            {plan.evidences && plan.evidences.length > 0 ? (
              <ul className="divide-y">
                {plan.evidences.map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ev.fileName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatFileSize(ev.fileSize)}{ev.uploadedByUserName && ` · ${ev.uploadedByUserName}`} · {new Date(ev.uploadedAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <a href={resolveApiUrl(`/api/storage${ev.objectPath}`)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Baixar" aria-label={`Baixar ${ev.fileName}`}>
                        <Download className="h-4 w-4" />
                      </a>
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveEvidence(ev.id)} aria-label={`Remover ${ev.fileName}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-center text-sm text-muted-foreground">Nenhuma evidência anexada.</p>
            )}
          </Section>

          <Section id="etapa-eficacia" title="Avaliação de eficácia">
            <EficaciaPanel
              value={form.efic}
              onChange={(v) => patch("efic", v)}
              orgUsers={orgUsers}
              readOnly={!canEdit}
              canEvaluate={isAdmin || (plan.effectivenessEvaluatorUserId != null && plan.effectivenessEvaluatorUserId === user?.id)}
              canAssignEvaluator={isAdmin}
              responsibleUserId={form.responsibleUserId}
            />
          </Section>

          {/* Meta footer */}
          <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground">
            {plan.createdByUserName && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {plan.createdByUserName}</span>}
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> criado {new Date(plan.createdAt).toLocaleDateString("pt-BR")}</span>
            {plan.closedAt && <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> fechado {new Date(plan.closedAt).toLocaleDateString("pt-BR")}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
