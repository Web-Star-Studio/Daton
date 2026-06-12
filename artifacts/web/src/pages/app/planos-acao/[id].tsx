import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import { Plano5W2H } from "./_components/plano-5w2h";
import { CausaRaiz } from "./_components/causa-raiz";
import { EficaciaPanel, type EficaciaValue } from "./_components/eficacia-panel";
import { Vinculos } from "./_components/vinculos";
import { ComentariosHistorico } from "./_components/comentarios-historico";

const STATUS_OPTIONS: ActionPlanStatus[] = ["open", "in_progress", "completed", "cancelled"];
const PRIORITY_OPTIONS: ActionPlanPriority[] = ["low", "medium", "high"];
const TYPE_OPTIONS: ActionPlanType[] = ["corrective", "preventive", "improvement"];
const MONTH_LABELS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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

function clean5w2h(v: ActionPlan5W2H): ActionPlan5W2H | null {
  const entries = Object.entries(v).filter(([, val]) => typeof val === "string" && val.trim() !== "");
  return entries.length > 0 ? (Object.fromEntries(entries) as ActionPlan5W2H) : null;
}

export default function ActionPlanFichaPage() {
  const [, params] = useRoute<{ id: string }>("/planos-acao/:id");
  const [, paramsApp] = useRoute<{ id: string }>("/app/planos-acao/:id");
  const idStr = params?.id ?? paramsApp?.id;
  const parsedPlanId = idStr ? Number(idStr) : NaN;
  const planId = Number.isInteger(parsedPlanId) && parsedPlanId > 0 ? parsedPlanId : null;

  const { organization } = useAuth();
  const { canWrite, isAdmin } = usePermissions();
  const orgId = organization!.id;
  const [location, setLocation] = useLocation();

  usePageTitle("Plano de Ação");
  usePageSubtitle("");

  const { data: plan, isLoading } = useActionPlan(orgId, planId);
  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: { queryKey: getListOrgUsersQueryKey(orgId), staleTime: 60_000 },
  });
  const orgUsers = orgUsersData?.users ?? [];

  const updatePlan = useUpdateActionPlanWithInvalidation(orgId);
  const deletePlan = useDeleteActionPlanWithInvalidation(orgId);
  const addEvidence = useAddActionPlanEvidenceWithInvalidation(orgId);
  const deleteEvidence = useDeleteActionPlanEvidenceWithInvalidation(orgId);
  const suggestDraft = useSuggestActionPlanDraft();

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
    plan5w2h: {} as ActionPlan5W2H,
    rootCause: "",
    rootCauseWhys: [] as string[],
    efic: emptyEfic,
    vinc: { odsNumbers: [] as number[], normRefs: [] as ActionPlanNormRef[] },
  });
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setForm({
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
      plan5w2h: plan.plan5w2h ?? {},
      rootCause: plan.rootCause ?? "",
      rootCauseWhys: plan.rootCauseWhys ?? [],
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
    });
    setDirty(false);
    if (isNewPlan) setSaveStatus("idle");
  }, [plan]);

  function buildPayload(f: typeof form): UpdateActionPlanBody {
    const whys = f.rootCauseWhys.map((w) => w.trim()).filter(Boolean);
    return {
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
      plan5w2h: clean5w2h(f.plan5w2h),
      rootCause: f.rootCause.trim() || null,
      rootCauseWhys: whys.length > 0 ? whys : null,
      effectivenessMethod: f.efic.method || null,
      effectivenessDueDate: f.efic.dueDate ? calendarDateToStorageIso(f.efic.dueDate) : null,
      effectivenessEvaluatorUserId: f.efic.evaluatorUserId ? Number(f.efic.evaluatorUserId) : null,
      effectivenessResult: f.efic.result || null,
      effectivenessBefore: f.efic.before.trim() || null,
      effectivenessAfter: f.efic.after.trim() || null,
      effectivenessComment: f.efic.comment.trim() || null,
      odsNumbers: f.vinc.odsNumbers,
      normRefs: f.vinc.normRefs,
    };
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
        if (!opts?.silent) toast({ title: "Informe o título da ação", variant: "destructive" });
        return false;
      }
      isSavingRef.current = true;
      setSaveStatus("saving");
      try {
        await updatePlan.mutateAsync({ orgId, planId, data: { ...buildPayload(snapshot), ...(opts?.extra ?? {}) } });
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
      const filledNothing =
        Object.keys(draft.plan5w2h).length === 0 && !draft.rootCause && draft.rootCauseWhys.length === 0;
      if (filledNothing) {
        toast({ title: "A IA não retornou sugestões", variant: "destructive" });
        return;
      }
      // Fill-only merge: only fills fields the user left blank. `changed` tracks
      // whether anything was actually added, so we don't mark the form dirty (and
      // trigger a no-op save) when every field was already filled.
      let changed = false;
      setForm((f) => {
        const merged5w2h: ActionPlan5W2H = { ...f.plan5w2h };
        for (const key of Object.keys(draft.plan5w2h) as (keyof ActionPlan5W2H)[]) {
          const value = draft.plan5w2h[key];
          if (value && !merged5w2h[key]?.trim()) {
            merged5w2h[key] = value;
            changed = true;
          }
        }
        const rootCause = !f.rootCause.trim() && draft.rootCause ? draft.rootCause : f.rootCause;
        if (rootCause !== f.rootCause) changed = true;
        const hasWhys = f.rootCauseWhys.some((w) => w.trim());
        const rootCauseWhys = !hasWhys && draft.rootCauseWhys.length > 0 ? draft.rootCauseWhys : f.rootCauseWhys;
        if (rootCauseWhys !== f.rootCauseWhys) changed = true;
        return { ...f, plan5w2h: merged5w2h, rootCause, rootCauseWhys };
      });
      if (changed) {
        setDirty(true);
        toast({ title: "Rascunho gerado — revise e salve" });
      } else {
        toast({ title: "Seus campos já estão preenchidos", description: "A IA não tinha o que adicionar." });
      }
    } catch (err) {
      toast({ title: "Não foi possível gerar a sugestão", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  async function handleConclude() {
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
                    options={orgUsers.map((u) => ({ value: String(u.id), label: u.name }))}
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
            title="Plano de ação (5W2H)"
            action={canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                isLoading={suggestDraft.isPending}
                disabled={!form.description.trim() && !form.title.trim()}
                onClick={() => void handleSuggest()}
                title="Rascunhar 5W2H e 5 porquês a partir do problema (IA). Você revisa antes de salvar."
              >
                {!suggestDraft.isPending && <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Sugerir plano (IA)
              </Button>
            ) : undefined}
          >
            <Plano5W2H value={form.plan5w2h} onChange={(v) => patch("plan5w2h", v)} readOnly={!canEdit} />
          </Section>

          <Section title="Causa raiz (5 porquês)">
            <CausaRaiz
              rootCause={form.rootCause}
              whys={form.rootCauseWhys}
              onChange={({ rootCause, whys }) => {
                setForm((f) => ({ ...f, rootCause, rootCauseWhys: whys }));
                setDirty(true);
              }}
              readOnly={!canEdit}
            />
          </Section>

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
            <EficaciaPanel value={form.efic} onChange={(v) => patch("efic", v)} orgUsers={orgUsers} readOnly={!canEdit} />
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
