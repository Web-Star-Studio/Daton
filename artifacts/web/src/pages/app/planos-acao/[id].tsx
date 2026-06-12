import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  Paperclip,
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

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/42 p-5 shadow-sm backdrop-blur-md">
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

  const { organization, user } = useAuth();
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!plan) return;
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
  }, [plan]);

  const sourceContext = plan?.sourceContext;
  const kpiContext = sourceContext?.kpi ?? null;
  const originDest = plan ? originLink(plan) : null;
  const originHref = originDest ? `${location.startsWith("/app/") ? "/app" : ""}${originDest.path}` : null;

  function patch<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    if (!planId) return;
    if (!form.title.trim()) {
      toast({ title: "Informe o título da ação", variant: "destructive" });
      return;
    }
    const whys = form.rootCauseWhys.map((w) => w.trim()).filter(Boolean);
    try {
      await updatePlan.mutateAsync({
        orgId,
        planId,
        data: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          actionType: form.actionType,
          status: form.status,
          priority: form.priority,
          responsibleUserId: form.responsibleUserId ? Number(form.responsibleUserId) : null,
          dueDate: form.dueDate ? calendarDateToStorageIso(form.dueDate) : null,
          correctiveActionDescription: form.correctiveActionDescription.trim() || null,
          correctiveActionCompletedAt: form.correctiveActionCompletedAt ? calendarDateToStorageIso(form.correctiveActionCompletedAt) : null,
          gutGravity: form.gut.gravity,
          gutUrgency: form.gut.urgency,
          gutTendency: form.gut.tendency,
          plan5w2h: clean5w2h(form.plan5w2h),
          rootCause: form.rootCause.trim() || null,
          rootCauseWhys: whys.length > 0 ? whys : null,
          effectivenessMethod: form.efic.method || null,
          effectivenessDueDate: form.efic.dueDate ? calendarDateToStorageIso(form.efic.dueDate) : null,
          effectivenessEvaluatorUserId: form.efic.evaluatorUserId ? Number(form.efic.evaluatorUserId) : null,
          effectivenessResult: form.efic.result || null,
          effectivenessBefore: form.efic.before.trim() || null,
          effectivenessAfter: form.efic.after.trim() || null,
          effectivenessComment: form.efic.comment.trim() || null,
          odsNumbers: form.vinc.odsNumbers,
          normRefs: form.vinc.normRefs,
        },
      });
      setDirty(false);
      toast({ title: "Ação atualizada" });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
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
    try {
      await updatePlan.mutateAsync({
        orgId,
        planId,
        data: { status: "completed", correctiveActionCompletedAt: calendarDateToStorageIso(todayCalendarDate()) },
      });
      toast({ title: "Ação concluída" });
    } catch (err) {
      toast({ title: "Erro ao concluir", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
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

  const isClosed = plan.status === "completed" || plan.status === "cancelled";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/planos-acao")}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Ações
        </Button>
        {plan.code && <span className="text-sm text-muted-foreground">{plan.code}</span>}
        <Badge variant="secondary" className={cn("px-1.5", actionPlanStatusColor(plan.status))}>{ACTION_PLAN_STATUS_LABELS[plan.status]}</Badge>
        <Badge variant="secondary" className="px-1.5">{ACTION_TYPE_LABELS[plan.actionType]}</Badge>
        <Badge variant="outline" className="px-1.5 text-muted-foreground">{SOURCE_MODULE_LABELS[plan.sourceModule] ?? plan.sourceModule}</Badge>
        <div className="ml-auto flex gap-2">
          {canWrite && dirty && (
            <Button onClick={handleSave} disabled={updatePlan.isPending}>
              <Save className="mr-1.5 h-4 w-4" /> {updatePlan.isPending ? "Salvando..." : "Salvar"}
            </Button>
          )}
          {canWrite && !isClosed && (
            <Button variant="outline" size="sm" onClick={handleConclude} disabled={updatePlan.isPending}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Concluir ação
            </Button>
          )}
          {canWrite && (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={handleDelete} aria-label="Excluir ação">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-border/60 bg-card/42 px-5 py-4 shadow-sm backdrop-blur-md">
        <ActionPlanTimeline plan={plan} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ─── Left column ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Section title="Identificação e contexto">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input value={form.title} onChange={(e) => patch("title", e.target.value)} readOnly={!canWrite} />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição do problema</Label>
                <Textarea value={form.description} onChange={(e) => patch("description", e.target.value)} rows={3} placeholder="Contexto, problema constatado, escopo..." readOnly={!canWrite} />
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
                  <Select value={form.actionType} onChange={(e) => patch("actionType", e.target.value as ActionPlanType)} disabled={!canWrite}>
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onChange={(e) => patch("status", e.target.value as ActionPlanStatus)} disabled={!canWrite}>
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
                    disabled={!canWrite}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Prazo</Label>
                  <Input type="date" value={form.dueDate} onChange={(e) => patch("dueDate", e.target.value)} readOnly={!canWrite} />
                </div>
                <div className="space-y-1.5">
                  <Label>Prioridade</Label>
                  <Select value={form.priority} onChange={(e) => patch("priority", e.target.value as ActionPlanPriority)} disabled={!canWrite}>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{ACTION_PLAN_PRIORITY_LABELS[p]}</option>)}
                  </Select>
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Plano de ação (5W2H)"
            action={canWrite ? (
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
            <Plano5W2H value={form.plan5w2h} onChange={(v) => patch("plan5w2h", v)} readOnly={!canWrite} />
          </Section>

          <Section title="Causa raiz (5 porquês)">
            <CausaRaiz
              rootCause={form.rootCause}
              whys={form.rootCauseWhys}
              onChange={({ rootCause, whys }) => {
                setForm((f) => ({ ...f, rootCause, rootCauseWhys: whys }));
                setDirty(true);
              }}
              readOnly={!canWrite}
            />
          </Section>

          <Section title="Comentários e histórico">
            <ComentariosHistorico orgId={orgId} planId={plan.id} canWrite={canWrite} />
          </Section>
        </div>

        {/* ─── Right column ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Section title="Prioridade GUT">
            <GutInput value={form.gut} onChange={(v) => patch("gut", v)} readOnly={!canWrite} />
          </Section>

          <Section title="Vínculos normativos e estratégicos">
            <Vinculos value={form.vinc} onChange={(v) => patch("vinc", v)} readOnly={!canWrite} />
            {relatedIndicatorIds.length > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {relatedIndicatorIds.length} indicador(es) relacionado(s) à origem.
              </p>
            )}
          </Section>

          <Section
            title="Evidências"
            action={canWrite ? (
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
                      {canWrite && (
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

          <Section title="Avaliação de eficácia">
            <EficaciaPanel
              value={form.efic}
              onChange={(v) => patch("efic", v)}
              orgUsers={orgUsers}
              readOnly={!canWrite}
              canEvaluate={isAdmin || (plan.effectivenessEvaluatorUserId != null && plan.effectivenessEvaluatorUserId === user?.id)}
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
