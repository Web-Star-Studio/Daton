import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ClipboardList, ExternalLink, MessageSquareWarning, Plus, Trash2, User } from "lucide-react";
import {
  getListOrgUsersQueryKey,
  useListOrgUsers,
  type ActionPlanListItem,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ACTION_PLAN_PRIORITY_LABELS,
  ACTION_PLAN_STATUS_LABELS,
  actionPlanPriorityColor,
  actionPlanStatusColor,
  calendarDateToStorageIso,
  formatCalendarDateBR,
  useActionPlansForKpiCell,
  useAddKpiMonthJustificationWithInvalidation,
  useCreateActionPlanWithInvalidation,
  useDeleteActionPlanWithInvalidation,
  useKpiMonthJustifications,
  type ActionPlanPriority,
  type ActionPlanStatus,
} from "@/lib/action-plans-client";
import { formatKpiValue } from "@/lib/kpi-client";

const MONTH_LABELS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const STATUS_OPTIONS: ActionPlanStatus[] = ["open", "in_progress", "completed", "cancelled"];
const PRIORITY_OPTIONS: ActionPlanPriority[] = ["low", "medium", "high"];

type DialogContext = {
  orgId: number;
  indicatorId: number;
  indicatorName: string;
  year: number;
  month: number; // 1-12
  monthlyValueId: number | null;
  value: number | null;
  goal: number | null;
  measureUnit?: string | null;
};

interface CellRedActionsDialogProps {
  context: DialogContext;
  onClose: () => void;
}

type PlanFormState = {
  title: string;
  description: string;
  status: ActionPlanStatus;
  priority: ActionPlanPriority;
  responsibleUserId: string;
  dueDate: string;
  correctiveActionDescription: string;
};

function emptyForm(): PlanFormState {
  return {
    title: "",
    description: "",
    status: "open",
    priority: "medium",
    responsibleUserId: "",
    dueDate: "",
    correctiveActionDescription: "",
  };
}

export function CellRedActionsDialog({ context, onClose }: CellRedActionsDialogProps) {
  const { orgId, indicatorId, indicatorName, year, month, monthlyValueId, value, goal, measureUnit } = context;
  const [, setLocation] = useLocation();

  const { data: justifications = [], isLoading: justificationsLoading } =
    useKpiMonthJustifications(orgId, indicatorId, year, month);

  const [tab, setTab] = useState<"justification" | "plans">(
    justifications.length > 0 ? "justification" : "plans",
  );
  const [justificationDraft, setJustificationDraft] = useState("");
  const [mode, setMode] = useState<"list" | "create">("list");
  const [form, setForm] = useState<PlanFormState>(emptyForm);

  const { data: plans = [], isLoading: plansLoading } = useActionPlansForKpiCell(orgId, monthlyValueId);
  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: { queryKey: getListOrgUsersQueryKey(orgId), staleTime: 60_000 },
  });
  const orgUsers = orgUsersData?.users ?? [];

  const addJustification = useAddKpiMonthJustificationWithInvalidation(orgId, year);
  const createPlan = useCreateActionPlanWithInvalidation(orgId, year);
  const deletePlan = useDeleteActionPlanWithInvalidation(orgId, year);

  const subtitle = useMemo(() => {
    const monthLabel = MONTH_LABELS[month - 1] ?? `Mês ${month}`;
    const valuePart = value !== null && goal !== null
      ? ` · ${formatKpiValue(value, measureUnit)} / tolerância ${formatKpiValue(goal, measureUnit)}`
      : "";
    return `${monthLabel}/${year}${valuePart}`;
  }, [month, year, value, goal, measureUnit]);

  async function handleAddJustification() {
    const body = justificationDraft.trim();
    if (!body) {
      toast({ title: "Escreva uma justificativa antes de salvar", variant: "destructive" });
      return;
    }
    try {
      await addJustification.mutateAsync({
        orgId,
        indicatorId,
        year,
        month,
        data: { body },
      });
      toast({ title: "Justificativa adicionada ao histórico" });
      setJustificationDraft("");
    } catch (err) {
      toast({
        title: "Erro ao salvar justificativa",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleCreatePlan() {
    if (!form.title.trim()) {
      toast({ title: "Informe o título do plano", variant: "destructive" });
      return;
    }
    if (monthlyValueId === null) {
      toast({ title: "Esta célula não pode receber plano de ação", variant: "destructive" });
      return;
    }
    const responsibleUserId = form.responsibleUserId ? Number(form.responsibleUserId) : null;
    const dueDate = form.dueDate ? calendarDateToStorageIso(form.dueDate) : null;
    try {
      await createPlan.mutateAsync({
        orgId,
        data: {
          sourceModule: "kpi",
          sourceRef: {
            kpiMonthlyValueId: monthlyValueId,
            kpiIndicatorId: indicatorId,
            kpiYear: year,
            kpiMonth: month,
          },
          title: form.title.trim(),
          description: form.description.trim() || null,
          status: form.status,
          priority: form.priority,
          responsibleUserId,
          dueDate,
          correctiveActionDescription: form.correctiveActionDescription.trim() || null,
        },
      });
      toast({ title: "Plano de ação criado" });
      setMode("list");
      setForm(emptyForm());
    } catch (err) {
      toast({
        title: "Erro ao salvar plano",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleDeletePlan(planId: number) {
    if (!window.confirm("Excluir este plano de ação? Esta ação não pode ser desfeita.")) return;
    try {
      await deletePlan.mutateAsync({ orgId, planId });
      toast({ title: "Plano excluído" });
    } catch (err) {
      toast({
        title: "Erro ao excluir plano",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  const planSaving = createPlan.isPending;

  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={indicatorName}
      description={subtitle}
      size="lg"
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as "justification" | "plans")}>
        <TabsList className="mb-3">
          <TabsTrigger value="justification" className="gap-1.5">
            <MessageSquareWarning className="h-3.5 w-3.5" />
            Justificativa
            {justifications.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{justifications.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Planos de Ação
            {plans.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{plans.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="justification" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Use a justificativa quando o resultado fora do padrão tem uma explicação pontual e não exige plano de ação.
          </p>

          {justificationsLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando histórico...</p>
          ) : justifications.length > 0 ? (
            <div className="space-y-2 max-h-56 overflow-auto pr-1">
              {justifications.map((entry, idx) => (
                <article
                  key={entry.id}
                  className={cn(
                    "rounded-md border bg-card px-3 py-2 space-y-1",
                    idx === 0 ? "border-blue-300/60 dark:border-blue-500/40" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {entry.createdByUserName ?? "Usuário removido"}
                    </span>
                    <span>{new Date(entry.createdAt).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{entry.body}</p>
                  {idx === 0 && (
                    <span className="inline-block text-[10px] uppercase tracking-wide text-blue-700 dark:text-blue-300">
                      mais recente
                    </span>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem justificativas registradas ainda.</p>
          )}

          <div className="space-y-1.5 pt-1 border-t border-border">
            <Label className="text-xs">Nova justificativa</Label>
            <Textarea
              value={justificationDraft}
              onChange={(e) => setJustificationDraft(e.target.value)}
              placeholder="Ex.: parada técnica programada no mês reduziu a produção..."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={addJustification.isPending}>
              Fechar
            </Button>
            <Button onClick={handleAddJustification} disabled={addJustification.isPending || !justificationDraft.trim()}>
              {addJustification.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="plans" className="space-y-3">
          {mode === "list" && (
            <>
              {plansLoading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
              ) : plans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum plano de ação para esta célula ainda.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-auto">
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      onOpen={() => {
                        onClose();
                        setLocation(`/planos-acao/${plan.id}`);
                      }}
                      onDelete={() => handleDeletePlan(plan.id)}
                    />
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>Fechar</Button>
                <Button
                  onClick={() => {
                    setForm(emptyForm());
                    setMode("create");
                  }}
                  disabled={monthlyValueId === null}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Novo plano
                </Button>
              </DialogFooter>
            </>
          )}

          {mode === "create" && (
            <PlanForm
              form={form}
              setForm={setForm}
              orgUsers={orgUsers}
              onCancel={() => {
                setMode("list");
                setForm(emptyForm());
              }}
              onSave={handleCreatePlan}
              saving={planSaving}
            />
          )}
        </TabsContent>
      </Tabs>
    </Dialog>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function PlanCard({
  plan,
  onOpen,
  onDelete,
}: {
  plan: ActionPlanListItem;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left hover:opacity-90"
          title="Abrir plano em detalhe"
        >
          <p className="text-sm font-medium leading-tight">{plan.title}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <Badge variant="secondary" className={cn("text-[10px] px-1.5", actionPlanStatusColor(plan.status))}>
              {ACTION_PLAN_STATUS_LABELS[plan.status]}
            </Badge>
            <Badge variant="secondary" className={cn("text-[10px] px-1.5", actionPlanPriorityColor(plan.priority))}>
              {ACTION_PLAN_PRIORITY_LABELS[plan.priority]}
            </Badge>
            {plan.responsibleUserName && (
              <span className="text-[11px] text-muted-foreground truncate">{plan.responsibleUserName}</span>
            )}
            {plan.dueDate && (
              <span className="text-[11px] text-muted-foreground">
                até {formatCalendarDateBR(plan.dueDate)}
              </span>
            )}
            {plan.evidencesCount > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {plan.evidencesCount} evidência{plan.evidencesCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </button>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Abrir" aria-label="Abrir plano de ação" onClick={onOpen}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Excluir" aria-label="Excluir plano de ação" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlanForm({
  form,
  setForm,
  orgUsers,
  onCancel,
  onSave,
  saving,
}: {
  form: PlanFormState;
  setForm: (f: PlanFormState | ((prev: PlanFormState) => PlanFormState)) => void;
  orgUsers: { id: number; name: string }[];
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
      <div className="space-y-1.5">
        <Label>Título *</Label>
        <Input
          autoFocus
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Ex.: Investigar queda de produção em maio"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Descrição / contexto</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Contexto do problema, hipóteses iniciais, escopo..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ActionPlanStatus }))}
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
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as ActionPlanPriority }))}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{ACTION_PLAN_PRIORITY_LABELS[p]}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Responsável</Label>
          <SearchableSelect
            value={form.responsibleUserId}
            onChange={(v) => setForm((f) => ({ ...f, responsibleUserId: v }))}
            options={orgUsers.map((u) => ({ value: String(u.id), label: u.name }))}
            placeholder="Selecione um responsável"
            searchPlaceholder="Buscar usuário..."
            emptyMessage={
              orgUsers.length === 0
                ? "Nenhum usuário com conta. Cadastre em Configurações → Usuários."
                : "Nenhum usuário encontrado"
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Prazo</Label>
          <Input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Ação corretiva — como vamos resolver</Label>
        <Textarea
          value={form.correctiveActionDescription}
          onChange={(e) => setForm((f) => ({ ...f, correctiveActionDescription: e.target.value }))}
          placeholder="Descreva a ação corretiva planejada ou executada..."
          rows={4}
        />
        <p className="text-[11px] text-muted-foreground">
          Evidências (arquivos) serão gerenciadas na página de detalhe do plano (em breve).
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Voltar
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Salvando..." : "Criar plano"}
        </Button>
      </DialogFooter>
    </div>
  );
}
