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
  Trash2,
  User,
} from "lucide-react";
import { getListOrgUsersQueryKey, useListOrgUsers } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { resolveApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  MAX_DIRECT_UPLOAD_FILE_SIZE_BYTES,
  formatFileSize,
  uploadFileToStorage,
} from "@/lib/uploads";
import {
  ACTION_PLAN_PRIORITY_LABELS,
  ACTION_PLAN_STATUS_LABELS,
  actionPlanPriorityColor,
  actionPlanStatusColor,
  useActionPlan,
  useAddActionPlanEvidenceWithInvalidation,
  useDeleteActionPlanEvidenceWithInvalidation,
  useDeleteActionPlanWithInvalidation,
  useUpdateActionPlanWithInvalidation,
  type ActionPlanPriority,
  type ActionPlanStatus,
} from "@/lib/action-plans-client";

const STATUS_OPTIONS: ActionPlanStatus[] = ["open", "in_progress", "completed", "cancelled"];
const PRIORITY_OPTIONS: ActionPlanPriority[] = ["low", "medium", "high"];

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function ActionPlanDetailPage() {
  const [, params] = useRoute<{ id: string }>("/planos-acao/:id");
  const [, paramsApp] = useRoute<{ id: string }>("/app/planos-acao/:id");
  const idStr = params?.id ?? paramsApp?.id;
  const parsedPlanId = idStr ? Number(idStr) : NaN;
  const planId = Number.isInteger(parsedPlanId) && parsedPlanId > 0 ? parsedPlanId : null;

  const { organization } = useAuth();
  const orgId = organization!.id;
  const [, setLocation] = useLocation();

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

  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "open" as ActionPlanStatus,
    priority: "medium" as ActionPlanPriority,
    responsibleUserId: "",
    dueDate: "",
    correctiveActionDescription: "",
    correctiveActionCompletedAt: "",
  });
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!plan) return;
    setForm({
      title: plan.title,
      description: plan.description ?? "",
      status: plan.status,
      priority: plan.priority,
      responsibleUserId: plan.responsibleUserId != null ? String(plan.responsibleUserId) : "",
      dueDate: plan.dueDate ? plan.dueDate.slice(0, 10) : "",
      correctiveActionDescription: plan.correctiveActionDescription ?? "",
      correctiveActionCompletedAt: plan.correctiveActionCompletedAt ? plan.correctiveActionCompletedAt.slice(0, 10) : "",
    });
    setDirty(false);
  }, [plan]);

  const sourceContext = plan?.sourceContext;
  const kpiContext = sourceContext?.kpi ?? null;

  const kpiBackUrl = useMemo(() => {
    if (!kpiContext) return null;
    return `/kpi/lancamentos`;
  }, [kpiContext]);

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    if (!planId) return;
    if (!form.title.trim()) {
      toast({ title: "Informe o título do plano", variant: "destructive" });
      return;
    }
    try {
      await updatePlan.mutateAsync({
        orgId,
        planId,
        data: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          status: form.status,
          priority: form.priority,
          responsibleUserId: form.responsibleUserId ? Number(form.responsibleUserId) : null,
          dueDate: form.dueDate ? new Date(`${form.dueDate}T00:00:00.000Z`).toISOString() : null,
          correctiveActionDescription: form.correctiveActionDescription.trim() || null,
          correctiveActionCompletedAt: form.correctiveActionCompletedAt
            ? new Date(`${form.correctiveActionCompletedAt}T00:00:00.000Z`).toISOString()
            : null,
        },
      });
      setDirty(false);
      toast({ title: "Plano atualizado" });
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleConcludeCorrectiveAction() {
    if (!planId) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await updatePlan.mutateAsync({
        orgId,
        planId,
        data: {
          status: "completed",
          correctiveActionCompletedAt: new Date(`${today}T00:00:00.000Z`).toISOString(),
        },
      });
      toast({ title: "Ação corretiva concluída" });
    } catch (err) {
      toast({
        title: "Erro ao concluir",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleDeletePlan() {
    if (!planId) return;
    if (!window.confirm("Excluir este plano e todas as evidências? Não pode ser desfeito.")) return;
    try {
      await deletePlan.mutateAsync({ orgId, planId });
      toast({ title: "Plano excluído" });
      setLocation("/planos-acao");
    } catch (err) {
      toast({
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
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
        await addEvidence.mutateAsync({
          orgId,
          planId,
          data: uploaded,
        });
      }
      toast({ title: `${list.length} arquivo${list.length !== 1 ? "s" : ""} anexado${list.length !== 1 ? "s" : ""}` });
    } catch (err) {
      toast({
        title: "Erro no upload",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
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
      toast({
        title: "Erro ao remover",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  if (planId === null) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">URL inválida.</p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="p-6 space-y-2">
        <p className="text-sm text-muted-foreground">Plano não encontrado.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/planos-acao")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Voltar para a lista
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/planos-acao")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Planos de ação
        </Button>
        <div className="flex gap-2">
          {dirty && (
            <Button onClick={handleSave} disabled={updatePlan.isPending}>
              <Save className="h-4 w-4 mr-1.5" />
              {updatePlan.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDeletePlan}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            Excluir
          </Button>
        </div>
      </div>

      {/* Origin context */}
      <section className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Origem</p>
        <p className="text-sm font-medium">{sourceContext?.label ?? plan.sourceModule}</p>
        {kpiContext && (
          <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
            <span>
              Indicador: <span className="text-foreground">{kpiContext.indicatorName}</span>
            </span>
            <span>·</span>
            <span>
              {MONTH_LABELS[kpiContext.month - 1]}/{kpiContext.year}
            </span>
            {kpiContext.value !== null && kpiContext.goal !== null && (
              <>
                <span>·</span>
                <span>
                  Valor {kpiContext.value} / Meta {kpiContext.goal}
                </span>
              </>
            )}
            {kpiBackUrl && (
              <a
                href={kpiBackUrl}
                className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir lançamentos
              </a>
            )}
          </div>
        )}
      </section>

      {/* Header form */}
      <section className="rounded-lg border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <Label>Título</Label>
          <Input
            value={form.title}
            onChange={(e) => updateForm("title", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição / contexto</Label>
          <Textarea
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            rows={3}
            placeholder="Contexto do problema, hipóteses iniciais, escopo..."
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status}
              onChange={(e) => updateForm("status", e.target.value as ActionPlanStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{ACTION_PLAN_STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select
              value={form.priority}
              onChange={(e) => updateForm("priority", e.target.value as ActionPlanPriority)}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{ACTION_PLAN_PRIORITY_LABELS[p]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select
              value={form.responsibleUserId}
              onChange={(e) => updateForm("responsibleUserId", e.target.value)}
            >
              <option value="">Não definido</option>
              {orgUsers.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => updateForm("dueDate", e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <Badge variant="secondary" className={cn("px-1.5", actionPlanStatusColor(plan.status))}>
            {ACTION_PLAN_STATUS_LABELS[plan.status]}
          </Badge>
          <Badge variant="secondary" className={cn("px-1.5", actionPlanPriorityColor(plan.priority))}>
            {ACTION_PLAN_PRIORITY_LABELS[plan.priority]}
          </Badge>
          {plan.createdByUserName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              criado por {plan.createdByUserName}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            criado em {new Date(plan.createdAt).toLocaleDateString("pt-BR")}
          </span>
          {plan.closedAt && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              fechado em {new Date(plan.closedAt).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
      </section>

      {/* Corrective action */}
      <section className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Ação corretiva</h3>
          {plan.status !== "completed" && plan.status !== "cancelled" && (
            <Button variant="outline" size="sm" onClick={handleConcludeCorrectiveAction} disabled={updatePlan.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Marcar como concluída
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Descreva como o problema foi (ou será) resolvido. Anexe evidências abaixo.
        </p>
        <Textarea
          value={form.correctiveActionDescription}
          onChange={(e) => updateForm("correctiveActionDescription", e.target.value)}
          rows={5}
          placeholder="Ação tomada, responsáveis pela execução, resultado esperado..."
        />
        {(plan.status === "completed" || form.correctiveActionCompletedAt) && (
          <div className="space-y-1.5">
            <Label>Data de conclusão</Label>
            <Input
              type="date"
              value={form.correctiveActionCompletedAt}
              onChange={(e) => updateForm("correctiveActionCompletedAt", e.target.value)}
              className="max-w-xs"
            />
          </div>
        )}
      </section>

      {/* Evidences */}
      <section className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Evidências</h3>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Paperclip className="h-4 w-4 mr-1.5" />
              {uploading ? "Enviando..." : "Anexar arquivos"}
            </Button>
          </div>
        </div>

        {plan.evidences && plan.evidences.length > 0 ? (
          <ul className="divide-y">
            {plan.evidences.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{ev.fileName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatFileSize(ev.fileSize)} · {ev.contentType}
                    {ev.uploadedByUserName && ` · ${ev.uploadedByUserName}`}
                    {" · "}
                    {new Date(ev.uploadedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <a
                    href={resolveApiUrl(`/api/storage${ev.objectPath}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Abrir / baixar"
                    aria-label={`Baixar ${ev.fileName}`}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleRemoveEvidence(ev.id)}
                    aria-label={`Remover ${ev.fileName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma evidência anexada.
          </p>
        )}
      </section>
    </div>
  );
}
