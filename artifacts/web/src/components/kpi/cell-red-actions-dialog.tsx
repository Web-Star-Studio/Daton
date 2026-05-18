import { useEffect, useMemo, useState } from "react";
import { ClipboardList, MessageSquareWarning, Pencil, Plus, Trash2 } from "lucide-react";
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
  useActionPlansForKpiCell,
  useCreateActionPlanWithInvalidation,
  useDeleteActionPlanWithInvalidation,
  useUpdateActionPlanWithInvalidation,
  useUpsertKpiMonthJustificationWithInvalidation,
  type ActionPlanPriority,
  type ActionPlanStatus,
} from "@/lib/action-plans-client";

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
  currentJustification: string | null;
};

interface CellRedActionsDialogProps {
  context: DialogContext;
  onClose: () => void;
}

type PlanFormState = {
  id: number | null;
  title: string;
  description: string;
  status: ActionPlanStatus;
  priority: ActionPlanPriority;
  responsibleUserId: string;
  dueDate: string;
  correctiveActionDescription: string;
  correctiveActionCompletedAt: string;
};

function emptyForm(): PlanFormState {
  return {
    id: null,
    title: "",
    description: "",
    status: "open",
    priority: "medium",
    responsibleUserId: "",
    dueDate: "",
    correctiveActionDescription: "",
    correctiveActionCompletedAt: "",
  };
}

function formFromPlan(plan: ActionPlanListItem & {
  description?: string | null;
  correctiveActionDescription?: string | null;
  correctiveActionCompletedAt?: string | null;
}): PlanFormState {
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description ?? "",
    status: plan.status,
    priority: plan.priority,
    responsibleUserId: plan.responsibleUserId != null ? String(plan.responsibleUserId) : "",
    dueDate: plan.dueDate ? plan.dueDate.slice(0, 10) : "",
    correctiveActionDescription: plan.correctiveActionDescription ?? "",
    correctiveActionCompletedAt: plan.correctiveActionCompletedAt ? plan.correctiveActionCompletedAt.slice(0, 10) : "",
  };
}

function formatNumber(v: number | null): string {
  if (v === null) return "—";
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
}

export function CellRedActionsDialog({ context, onClose }: CellRedActionsDialogProps) {
  const { orgId, indicatorId, indicatorName, year, month, monthlyValueId, value, goal, currentJustification } = context;

  const [tab, setTab] = useState<"justification" | "plans">(
    currentJustification ? "justification" : "plans",
  );
  const [justificationDraft, setJustificationDraft] = useState(currentJustification ?? "");
  const [mode, setMode] = useState<"list" | "form">("list");
  const [form, setForm] = useState<PlanFormState>(emptyForm);

  useEffect(() => {
    setJustificationDraft(currentJustification ?? "");
  }, [currentJustification]);

  const { data: plans = [], isLoading: plansLoading } = useActionPlansForKpiCell(orgId, monthlyValueId);
  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: { queryKey: getListOrgUsersQueryKey(orgId), staleTime: 60_000 },
  });
  const orgUsers = orgUsersData?.users ?? [];

  const saveJustification = useUpsertKpiMonthJustificationWithInvalidation(orgId, year);
  const createPlan = useCreateActionPlanWithInvalidation(orgId, year);
  const updatePlan = useUpdateActionPlanWithInvalidation(orgId, year);
  const deletePlan = useDeleteActionPlanWithInvalidation(orgId, year);

  const subtitle = useMemo(() => {
    const monthLabel = MONTH_LABELS[month - 1] ?? `Mês ${month}`;
    const valuePart = value !== null && goal !== null
      ? ` · ${formatNumber(value)} / meta ${formatNumber(goal)}`
      : "";
    return `${monthLabel}/${year}${valuePart}`;
  }, [month, year, value, goal]);

  async function handleSaveJustification() {
    try {
      await saveJustification.mutateAsync({
        orgId,
        indicatorId,
        year,
        month,
        data: { justification: justificationDraft.trim() ? justificationDraft.trim() : null },
      });
      toast({ title: "Justificativa salva" });
      onClose();
    } catch (err) {
      toast({
        title: "Erro ao salvar justificativa",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleSavePlan() {
    if (!form.title.trim()) {
      toast({ title: "Informe o título do plano", variant: "destructive" });
      return;
    }
    if (monthlyValueId === null) {
      toast({ title: "Esta célula não pode receber plano de ação", variant: "destructive" });
      return;
    }
    const responsibleUserId = form.responsibleUserId ? Number(form.responsibleUserId) : null;
    const dueDate = form.dueDate ? new Date(`${form.dueDate}T00:00:00.000Z`).toISOString() : null;
    const correctiveActionCompletedAt = form.correctiveActionCompletedAt
      ? new Date(`${form.correctiveActionCompletedAt}T00:00:00.000Z`).toISOString()
      : null;
    try {
      if (form.id === null) {
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
      } else {
        await updatePlan.mutateAsync({
          orgId,
          planId: form.id,
          data: {
            title: form.title.trim(),
            description: form.description.trim() || null,
            status: form.status,
            priority: form.priority,
            responsibleUserId,
            dueDate,
            correctiveActionDescription: form.correctiveActionDescription.trim() || null,
            correctiveActionCompletedAt,
          },
        });
        toast({ title: "Plano de ação atualizado" });
      }
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

  const planSaving = createPlan.isPending || updatePlan.isPending;

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
          <Textarea
            value={justificationDraft}
            onChange={(e) => setJustificationDraft(e.target.value)}
            placeholder="Ex.: parada técnica programada no mês reduziu a produção..."
            rows={6}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={saveJustification.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSaveJustification} disabled={saveJustification.isPending}>
              {saveJustification.isPending ? "Salvando..." : "Salvar justificativa"}
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
                      onEdit={() => {
                        setForm(formFromPlan(plan));
                        setMode("form");
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
                    setMode("form");
                  }}
                  disabled={monthlyValueId === null}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Novo plano
                </Button>
              </DialogFooter>
            </>
          )}

          {mode === "form" && (
            <PlanForm
              form={form}
              setForm={setForm}
              orgUsers={orgUsers}
              onCancel={() => {
                setMode("list");
                setForm(emptyForm());
              }}
              onSave={handleSavePlan}
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
  onEdit,
  onDelete,
}: {
  plan: ActionPlanListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
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
                até {new Date(plan.dueDate).toLocaleDateString("pt-BR")}
              </span>
            )}
            {plan.evidencesCount > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {plan.evidencesCount} evidência{plan.evidencesCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" aria-label="Editar plano de ação" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
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
  const isEditing = form.id !== null;

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
          <Select
            value={form.responsibleUserId}
            onChange={(e) => setForm((f) => ({ ...f, responsibleUserId: e.target.value }))}
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

      {isEditing && (form.status === "completed" || form.correctiveActionCompletedAt) && (
        <div className="space-y-1.5">
          <Label>Data de conclusão da ação corretiva</Label>
          <Input
            type="date"
            value={form.correctiveActionCompletedAt}
            onChange={(e) => setForm((f) => ({ ...f, correctiveActionCompletedAt: e.target.value }))}
          />
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Voltar
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar plano"}
        </Button>
      </DialogFooter>
    </div>
  );
}
