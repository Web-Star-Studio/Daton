import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Shuffle,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useGovernanceRiskOpportunityItems } from "@/lib/governance-client";
import { useAllActiveSgqProcesses } from "@/lib/governance-system-client";
import {
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT,
  formatFileSize,
  type UploadedFileRef,
  uploadFilesToStorage,
} from "@/lib/uploads";
import {
  useCreateOperationalChangeMutation,
  useCreateOperationalChecklistItemMutation,
  useCreateOperationalCycleMutation,
  useCreateOperationalPlanMutation,
  useDeleteOperationalChecklistItemMutation,
  useOperationalPlan,
  useOperationalPlans,
  useUpdateOperationalChangeMutation,
  useUpdateOperationalChecklistItemMutation,
  useUpdateOperationalCycleMutation,
  useUpdateOperationalPlanMutation,
  useUpdateOperationalReadinessExecutionMutation,
  type OperationalAttachment,
  type OperationalChangeBody,
  type OperationalChecklistBody,
  type OperationalCycleBody,
  type OperationalPlanBody,
  type OperationalPlanDetail,
} from "@/lib/operational-planning-client";
import { resolveApiUrl } from "@/lib/api";
import {
  useListDocuments,
  useListEmployees,
  useListUnits,
} from "@workspace/api-client-react";

type PlanFormState = {
  title: string;
  planCode: string;
  processId: string;
  unitId: string;
  responsibleId: string;
  serviceType: string;
  scope: string;
  sequenceDescription: string;
  executionCriteria: string;
  requiredResources: string;
  inputs: string;
  outputs: string;
  esgConsiderations: string;
  readinessBlockingEnabled: boolean;
  status: "draft" | "active" | "archived";
  documentIds: number[];
  riskOpportunityItemIds: number[];
  changeSummary: string;
};

type ChecklistFormState = {
  title: string;
  instructions: string;
  isCritical: boolean;
  sortOrder: string;
  changeSummary: string;
};

type CycleFormState = {
  cycleCode: string;
  cycleDate: string;
  status:
    | "planned"
    | "ready"
    | "in_execution"
    | "completed"
    | "blocked"
    | "canceled";
  evidenceSummary: string;
  externalReference: string;
  attachments: OperationalAttachment[];
};

type ChangeFormState = {
  title: string;
  cycleEvidenceId: string;
  reason: string;
  impactLevel: "low" | "medium" | "high" | "critical";
  impactDescription: string;
  mitigationAction: string;
  decision: "pending" | "approved" | "rejected";
  riskOpportunityItemIds: number[];
};

type ExecutionFormState = {
  status: "pending" | "ok" | "failed" | "waived";
  executedById: string;
  evidenceNote: string;
  attachments: OperationalAttachment[];
};

function emptyPlanForm(): PlanFormState {
  return {
    title: "",
    planCode: "",
    processId: "",
    unitId: "",
    responsibleId: "",
    serviceType: "",
    scope: "",
    sequenceDescription: "",
    executionCriteria: "",
    requiredResources: "",
    inputs: "",
    outputs: "",
    esgConsiderations: "",
    readinessBlockingEnabled: true,
    status: "draft",
    documentIds: [],
    riskOpportunityItemIds: [],
    changeSummary: "",
  };
}

function emptyChecklistForm(): ChecklistFormState {
  return {
    title: "",
    instructions: "",
    isCritical: false,
    sortOrder: "0",
    changeSummary: "",
  };
}

function emptyCycleForm(): CycleFormState {
  return {
    cycleCode: "",
    cycleDate: "",
    status: "planned",
    evidenceSummary: "",
    externalReference: "",
    attachments: [],
  };
}

function emptyChangeForm(): ChangeFormState {
  return {
    title: "",
    cycleEvidenceId: "",
    reason: "",
    impactLevel: "medium",
    impactDescription: "",
    mitigationAction: "",
    decision: "pending",
    riskOpportunityItemIds: [],
  };
}

function emptyExecutionForm(): ExecutionFormState {
  return {
    status: "pending",
    executedById: "",
    evidenceNote: "",
    attachments: [],
  };
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function planToForm(plan: OperationalPlanDetail): PlanFormState {
  return {
    title: plan.title,
    planCode: plan.planCode ?? "",
    processId: plan.processId ? String(plan.processId) : "",
    unitId: plan.unitId ? String(plan.unitId) : "",
    responsibleId: plan.responsibleId ? String(plan.responsibleId) : "",
    serviceType: plan.serviceType ?? "",
    scope: plan.scope ?? "",
    sequenceDescription: plan.sequenceDescription ?? "",
    executionCriteria: plan.executionCriteria ?? "",
    requiredResources: plan.requiredResources.join(", "),
    inputs: plan.inputs.join(", "),
    outputs: plan.outputs.join(", "),
    esgConsiderations: plan.esgConsiderations ?? "",
    readinessBlockingEnabled: plan.readinessBlockingEnabled,
    status: plan.status,
    documentIds: plan.documents.map((document) => document.id),
    riskOpportunityItemIds: plan.riskLinks.map((risk) => risk.id),
    changeSummary: "",
  };
}

function getPlanStatusTone(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "archived":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
}

function getPlanStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Ativo";
    case "archived":
      return "Arquivado";
    default:
      return "Rascunho";
  }
}

function getCycleStatusTone(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "blocked":
      return "bg-red-100 text-red-800 border-red-200";
    case "ready":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "in_execution":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "canceled":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
}

function getCycleStatusLabel(status: string) {
  switch (status) {
    case "ready":
      return "Pronto";
    case "in_execution":
      return "Em execução";
    case "completed":
      return "Concluído";
    case "blocked":
      return "Bloqueado";
    case "canceled":
      return "Cancelado";
    default:
      return "Planejado";
  }
}

function getDecisionTone(decision: string) {
  switch (decision) {
    case "approved":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
}

function getDecisionLabel(decision: string) {
  switch (decision) {
    case "approved":
      return "Aprovada";
    case "rejected":
      return "Rejeitada";
    default:
      return "Pendente";
  }
}

function getExecutionStatusLabel(status: string) {
  switch (status) {
    case "ok":
      return "Conforme";
    case "failed":
      return "Falhou";
    case "waived":
      return "Dispensado";
    default:
      return "Pendente";
  }
}

function getImpactLevelLabel(level: string) {
  switch (level) {
    case "low":
      return "Baixo";
    case "high":
      return "Alto";
    case "critical":
      return "Crítico";
    default:
      return "Médio";
  }
}

function getDocumentStatusLabel(status?: string | null) {
  switch (status) {
    case "draft":
      return "Rascunho";
    case "in_review":
      return "Em revisão";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    case "archived":
      return "Arquivado";
    case "obsolete":
      return "Obsoleto";
    default:
      return "Sem status";
  }
}

function getRiskTypeLabel(type: string) {
  switch (type) {
    case "opportunity":
      return "Oportunidade";
    default:
      return "Risco";
  }
}

function getRiskStatusLabel(status?: string | null) {
  switch (status) {
    case "identified":
      return "Identificado";
    case "assessed":
      return "Avaliado";
    case "responding":
      return "Em tratamento";
    case "awaiting_effectiveness":
      return "Aguardando eficácia";
    case "effective":
      return "Eficaz";
    case "ineffective":
      return "Ineficaz";
    case "continuous":
      return "Contínuo";
    case "canceled":
      return "Cancelado";
    default:
      return status || "Sem status";
  }
}

function AttachmentList({
  attachments,
}: {
  attachments: OperationalAttachment[];
}) {
  if (attachments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Sem anexos enviados.</p>
    );
  }

  return (
    <div className="space-y-2">
      {attachments.map((attachment) => (
        <a
          key={attachment.objectPath}
          href={resolveApiUrl(`/api/storage${attachment.objectPath}`)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-muted/40"
        >
          <span className="truncate">{attachment.fileName}</span>
          <span className="text-xs text-muted-foreground">
            {formatFileSize(attachment.fileSize)}
          </span>
        </a>
      ))}
    </div>
  );
}

export default function OperationalPlanningPage() {
  const { organization, user } = useAuth();
  const orgId = organization?.id;
  const canWrite = user?.role !== "analyst";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "draft" | "active" | "archived"
  >("");
  const [unitFilter, setUnitFilter] = useState("");
  const [processFilter, setProcessFilter] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
  const [editingChecklistId, setEditingChecklistId] = useState<number | null>(
    null,
  );
  const [editingCycleId, setEditingCycleId] = useState<number | null>(null);
  const [editingChangeId, setEditingChangeId] = useState<number | null>(null);
  const [editingExecution, setEditingExecution] = useState<{
    cycleId: number;
    checklistItemId: number;
  } | null>(null);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [checklistForm, setChecklistForm] =
    useState<ChecklistFormState>(emptyChecklistForm);
  const [cycleForm, setCycleForm] = useState<CycleFormState>(emptyCycleForm);
  const [changeForm, setChangeForm] =
    useState<ChangeFormState>(emptyChangeForm);
  const [executionForm, setExecutionForm] =
    useState<ExecutionFormState>(emptyExecutionForm);

  usePageTitle("Planejamento Operacional");
  usePageSubtitle(
    "Controle SGI/ESG para critérios, prontidão, mudanças operacionais e evidências do ciclo.",
  );

  useHeaderActions(
    canWrite ? (
      <HeaderActionButton
        icon={<Plus className="h-4 w-4" />}
        label="Novo plano operacional"
        onClick={() => {
          setIsEditingPlan(false);
          setPlanForm(emptyPlanForm());
          setPlanDialogOpen(true);
        }}
      />
    ) : null,
  );

  const filters = useMemo(
    () => ({
      status: statusFilter || undefined,
      unitId: unitFilter ? Number(unitFilter) : undefined,
      processId: processFilter ? Number(processFilter) : undefined,
      search: search.trim() || undefined,
    }),
    [processFilter, search, statusFilter, unitFilter],
  );

  const { data: plans = [], isLoading: plansLoading } = useOperationalPlans(
    orgId,
    filters,
  );
  const {
    data: planDetail,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useOperationalPlan(orgId, selectedPlanId ?? undefined);

  const createPlanMutation = useCreateOperationalPlanMutation(orgId);
  const updatePlanMutation = useUpdateOperationalPlanMutation(
    orgId,
    selectedPlanId ?? undefined,
  );
  const createChecklistMutation = useCreateOperationalChecklistItemMutation(
    orgId,
    selectedPlanId ?? undefined,
  );
  const updateChecklistMutation = useUpdateOperationalChecklistItemMutation(
    orgId,
    selectedPlanId ?? undefined,
    editingChecklistId ?? undefined,
  );
  const deleteChecklistMutation = useDeleteOperationalChecklistItemMutation(
    orgId,
    selectedPlanId ?? undefined,
  );
  const createCycleMutation = useCreateOperationalCycleMutation(
    orgId,
    selectedPlanId ?? undefined,
  );
  const updateCycleMutation = useUpdateOperationalCycleMutation(
    orgId,
    selectedPlanId ?? undefined,
    editingCycleId ?? undefined,
  );
  const createChangeMutation = useCreateOperationalChangeMutation(
    orgId,
    selectedPlanId ?? undefined,
  );
  const updateChangeMutation = useUpdateOperationalChangeMutation(
    orgId,
    selectedPlanId ?? undefined,
    editingChangeId ?? undefined,
  );
  const updateExecutionMutation =
    useUpdateOperationalReadinessExecutionMutation(
      orgId,
      selectedPlanId ?? undefined,
      editingExecution?.cycleId ?? undefined,
      editingExecution?.checklistItemId ?? undefined,
    );

  const { data: units = [] } = useListUnits(orgId ?? 0);
  const { data: employeesResult } = useListEmployees(orgId ?? 0, {
    page: 1,
    pageSize: 100,
  });
  const employees = employeesResult?.data ?? [];
  const { data: documents = [] } = useListDocuments(orgId ?? 0, {
    page: 1,
    pageSize: 100,
  });
  const { data: processes = [] } = useAllActiveSgqProcesses(orgId);
  const { data: riskItems = [] } = useGovernanceRiskOpportunityItems(orgId);

  useEffect(() => {
    if (!plans.length) {
      setSelectedPlanId(null);
      return;
    }
    if (!selectedPlanId || !plans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  async function handleUploadFiles(files: FileList | null) {
    if (!files?.length) return [];
    const uploaded = await uploadFilesToStorage(Array.from(files));
    return uploaded as UploadedFileRef[];
  }

  async function submitPlan() {
    if (!orgId) return;
    const payload: OperationalPlanBody = {
      title: planForm.title,
      planCode: planForm.planCode || null,
      processId: planForm.processId ? Number(planForm.processId) : null,
      unitId: planForm.unitId ? Number(planForm.unitId) : null,
      responsibleId: planForm.responsibleId
        ? Number(planForm.responsibleId)
        : null,
      serviceType: planForm.serviceType || null,
      scope: planForm.scope || null,
      sequenceDescription: planForm.sequenceDescription || null,
      executionCriteria: planForm.executionCriteria || null,
      requiredResources: splitCsv(planForm.requiredResources),
      inputs: splitCsv(planForm.inputs),
      outputs: splitCsv(planForm.outputs),
      esgConsiderations: planForm.esgConsiderations || null,
      readinessBlockingEnabled: planForm.readinessBlockingEnabled,
      status: planForm.status,
      documentIds: planForm.documentIds,
      riskOpportunityItemIds: planForm.riskOpportunityItemIds,
      changeSummary: planForm.changeSummary || null,
    };

    try {
      const result = isEditingPlan
        ? await updatePlanMutation.mutateAsync(payload)
        : await createPlanMutation.mutateAsync(payload);
      setSelectedPlanId(result.id);
      setPlanDialogOpen(false);
      toast({
        title: isEditingPlan
          ? "Plano operacional atualizado"
          : "Plano operacional criado",
      });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Falha ao salvar plano",
        variant: "destructive",
      });
    }
  }

  async function submitChecklist() {
    try {
      const payload: OperationalChecklistBody = {
        title: checklistForm.title,
        instructions: checklistForm.instructions || null,
        isCritical: checklistForm.isCritical,
        sortOrder: Number(checklistForm.sortOrder || 0),
        changeSummary: checklistForm.changeSummary || null,
      };
      if (editingChecklistId) {
        await updateChecklistMutation.mutateAsync(payload);
      } else {
        await createChecklistMutation.mutateAsync(payload);
      }
      setChecklistDialogOpen(false);
      toast({ title: "Checklist de prontidão salva" });
    } catch (error) {
      toast({
        title:
          error instanceof Error ? error.message : "Falha ao salvar checklist",
        variant: "destructive",
      });
    }
  }

  async function submitCycle() {
    try {
      const payload: OperationalCycleBody = {
        cycleCode: cycleForm.cycleCode,
        cycleDate: cycleForm.cycleDate
          ? new Date(cycleForm.cycleDate).toISOString()
          : null,
        status: cycleForm.status,
        evidenceSummary: cycleForm.evidenceSummary || null,
        externalReference: cycleForm.externalReference || null,
        attachments: cycleForm.attachments,
      };
      if (editingCycleId) {
        await updateCycleMutation.mutateAsync(payload);
      } else {
        await createCycleMutation.mutateAsync(payload);
      }
      setCycleDialogOpen(false);
      toast({ title: "Ciclo operacional salvo" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Falha ao salvar ciclo",
        variant: "destructive",
      });
    }
  }

  async function submitChange() {
    try {
      const payload: OperationalChangeBody = {
        title: changeForm.title,
        cycleEvidenceId: changeForm.cycleEvidenceId
          ? Number(changeForm.cycleEvidenceId)
          : null,
        reason: changeForm.reason,
        impactLevel: changeForm.impactLevel,
        impactDescription: changeForm.impactDescription || null,
        mitigationAction: changeForm.mitigationAction || null,
        decision: changeForm.decision,
        riskOpportunityItemIds: changeForm.riskOpportunityItemIds,
      };
      if (editingChangeId) {
        await updateChangeMutation.mutateAsync(payload);
      } else {
        await createChangeMutation.mutateAsync(payload);
      }
      setChangeDialogOpen(false);
      toast({ title: "Mudança operacional salva" });
    } catch (error) {
      toast({
        title:
          error instanceof Error ? error.message : "Falha ao salvar mudança",
        variant: "destructive",
      });
    }
  }

  async function submitExecution() {
    try {
      await updateExecutionMutation.mutateAsync({
        status: executionForm.status,
        executedById: executionForm.executedById
          ? Number(executionForm.executedById)
          : null,
        evidenceNote: executionForm.evidenceNote || null,
        attachments: executionForm.attachments,
      });
      setExecutionDialogOpen(false);
      toast({ title: "Prontidão registrada" });
    } catch (error) {
      toast({
        title:
          error instanceof Error
            ? error.message
            : "Falha ao registrar prontidão",
        variant: "destructive",
      });
    }
  }

  const selectedExecution = useMemo(() => {
    if (!planDetail || !editingExecution) return null;
    return planDetail.cycles
      .find((cycle) => cycle.id === editingExecution.cycleId)
      ?.readinessExecutions.find(
        (execution) =>
          execution.checklistItemId === editingExecution.checklistItemId,
      );
  }, [editingExecution, planDetail]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px_220px_220px] lg:items-center">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por plano, código ou tipo de serviço"
            />
            <Select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as "" | "draft" | "active" | "archived",
                )
              }
            >
              <option value="">Todos os status</option>
              <option value="draft">Rascunho</option>
              <option value="active">Ativo</option>
              <option value="archived">Arquivado</option>
            </Select>
            <Select
              value={unitFilter}
              onChange={(event) => setUnitFilter(event.target.value)}
            >
              <option value="">Todas as unidades</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
            <Select
              value={processFilter}
              onChange={(event) => setProcessFilter(event.target.value)}
            >
              <option value="">Todos os processos</option>
              {processes.map((process) => (
                <option key={process.id} value={process.id}>
                  {process.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ClipboardCheck className="h-4 w-4" />
              {plans.length}{" "}
              {plans.length === 1 ? "plano operacional" : "planos operacionais"}
            </div>
            {(statusFilter || unitFilter || processFilter || search.trim()) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setUnitFilter("");
                  setProcessFilter("");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <Card className="h-fit xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle>Planos operacionais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {plansLoading && (
              <p className="text-sm text-muted-foreground">
                Carregando planos...
              </p>
            )}
            {!plansLoading && plans.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum plano operacional encontrado para os filtros atuais.
              </p>
            )}
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  selectedPlanId === plan.id
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium leading-snug">{plan.title}</p>
                  <Badge
                    variant="outline"
                    className={`shrink-0 ${getPlanStatusTone(plan.status)}`}
                  >
                    {getPlanStatusLabel(plan.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.planCode || "Sem código"} •{" "}
                  {plan.serviceType || "Serviço não informado"}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{plan.processName || "Processo não vinculado"}</span>
                  <span>{plan.unitName || "Unidade não vinculada"}</span>
                  {plan.latestCycle && (
                    <span className="text-primary/70">
                      {plan.latestCycle.cycleCode}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!selectedPlanId && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                Selecione um plano para visualizar o detalhe operacional.
              </CardContent>
            </Card>
          )}

          {selectedPlanId && detailLoading && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                Carregando plano operacional...
              </CardContent>
            </Card>
          )}

          {planDetail && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CardTitle>{planDetail.title}</CardTitle>
                      <Badge
                        variant="outline"
                        className={getPlanStatusTone(planDetail.status)}
                      >
                        {getPlanStatusLabel(planDetail.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {planDetail.planCode || "Sem código"} • Revisão{" "}
                      {planDetail.currentRevisionNumber} • Processo{" "}
                      {planDetail.processName || "não vinculado"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void refetchDetail()}
                      size="sm"
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Atualizar
                    </Button>
                    {canWrite && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEditingPlan(true);
                          setPlanForm(planToForm(planDetail));
                          setPlanDialogOpen(true);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar plano
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Unidade
                    </p>
                    <p className="mt-1 font-medium">
                      {planDetail.unitName || "Não vinculada"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Responsável
                    </p>
                    <p className="mt-1 font-medium">
                      {planDetail.responsibleName || "Não definido"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Serviço
                    </p>
                    <p className="mt-1 font-medium">
                      {planDetail.serviceType || "Não informado"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Prontidão
                    </p>
                    <p className="mt-1 font-medium">
                      {planDetail.readinessBlockingEnabled
                        ? "Bloqueante"
                        : "Livre"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="visao-geral">
                <TabsList>
                  <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
                  <TabsTrigger value="checklist">Checklist</TabsTrigger>
                  <TabsTrigger value="ciclos">Ciclos</TabsTrigger>
                  <TabsTrigger value="mudancas">Mudanças</TabsTrigger>
                </TabsList>

                <TabsContent value="visao-geral" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Controles planejados</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-5 lg:grid-cols-2">
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-medium">
                            Escopo operacional
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {planDetail.scope || "Não registrado"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            Sequência de execução
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {planDetail.sequenceDescription || "Não registrada"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            Critérios de execução
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {planDetail.executionCriteria || "Não registrados"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            Considerações ESG/SGI
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {planDetail.esgConsiderations || "Não registradas"}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-medium">
                            Recursos necessários
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {planDetail.requiredResources.length ? (
                              planDetail.requiredResources.map((resource) => (
                                <Badge key={resource} variant="secondary">
                                  {resource}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Não informados
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Entradas</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {planDetail.inputs.length ? (
                              planDetail.inputs.map((item) => (
                                <Badge key={item} variant="outline">
                                  {item}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Não informadas
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Saídas</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {planDetail.outputs.length ? (
                              planDetail.outputs.map((item) => (
                                <Badge key={item} variant="outline">
                                  {item}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Não informadas
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Documentos aplicáveis</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {planDetail.documents.length ? (
                          planDetail.documents.map((document) => (
                            <div
                              key={document.id}
                              className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-3"
                            >
                              <div>
                                <p className="font-medium">{document.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  Documento #{document.id}
                                </p>
                              </div>
                              <Badge variant="outline">
                                {getDocumentStatusLabel(document.status)}
                              </Badge>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Nenhum documento vinculado ao plano.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Riscos e oportunidades vinculados</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {planDetail.riskLinks.length ? (
                          planDetail.riskLinks.map((risk) => (
                            <div
                              key={risk.id}
                              className="rounded-xl border border-border/60 px-3 py-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-medium">{risk.title}</p>
                                <Badge variant="outline">
                                  {getRiskTypeLabel(risk.type)}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {risk.planTitle || "Sem plano estratégico"} •{" "}
                                {getRiskStatusLabel(risk.status)}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Nenhum risco ou oportunidade vinculado.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Histórico de revisões</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {planDetail.revisions.map((revision) => (
                        <div
                          key={revision.id}
                          className="rounded-xl border border-border/60 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">
                                Revisão {revision.revisionNumber}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {revision.changedByName ||
                                  "Usuário não identificado"}{" "}
                                • {formatDateTime(revision.createdAt)}
                              </p>
                            </div>
                            <Badge variant="outline">Snapshot</Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {revision.changeSummary || "Sem resumo informado"}
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="checklist" className="space-y-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Checklist de prontidão</CardTitle>
                      {canWrite && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditingChecklistId(null);
                            setChecklistForm(emptyChecklistForm());
                            setChecklistDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Novo item
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {planDetail.checklistItems.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Ainda não existem itens configurados para a prontidão.
                        </p>
                      )}
                      {planDetail.checklistItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border/60 px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{item.title}</p>
                                {item.isCritical && (
                                  <Badge
                                    variant="outline"
                                    className="bg-red-100 text-red-800 border-red-200"
                                  >
                                    Crítico
                                  </Badge>
                                )}
                              </div>
                              {item.instructions && (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {item.instructions}
                                </p>
                              )}
                            </div>
                            {canWrite && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingChecklistId(item.id);
                                    setChecklistForm({
                                      title: item.title,
                                      instructions: item.instructions || "",
                                      isCritical: item.isCritical,
                                      sortOrder: String(item.sortOrder),
                                      changeSummary: "",
                                    });
                                    setChecklistDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      await deleteChecklistMutation.mutateAsync(
                                        item.id,
                                      );
                                      toast({
                                        title: "Item removido da checklist",
                                      });
                                    } catch (error) {
                                      toast({
                                        title:
                                          error instanceof Error
                                            ? error.message
                                            : "Falha ao remover item",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="ciclos" className="space-y-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Ciclos e evidências</CardTitle>
                      {canWrite && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditingCycleId(null);
                            setCycleForm(emptyCycleForm());
                            setCycleDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Novo ciclo
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {planDetail.cycles.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nenhum ciclo operacional registrado ainda.
                        </p>
                      )}
                      {planDetail.cycles.map((cycle) => (
                        <div
                          key={cycle.id}
                          className="rounded-2xl border border-border/60 p-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-lg font-medium">
                                  {cycle.cycleCode}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={getCycleStatusTone(cycle.status)}
                                >
                                  {getCycleStatusLabel(cycle.status)}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {cycle.evidenceSummary ||
                                  "Sem resumo de evidência"}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Data do ciclo: {formatDateTime(cycle.cycleDate)}
                                {cycle.externalReference
                                  ? ` • Ref. externa: ${cycle.externalReference}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">
                                Pendências críticas:{" "}
                                {cycle.readinessSummary.criticalPending}
                              </Badge>
                              {canWrite && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingCycleId(cycle.id);
                                    setCycleForm({
                                      cycleCode: cycle.cycleCode,
                                      cycleDate: cycle.cycleDate
                                        ? new Date(cycle.cycleDate)
                                            .toISOString()
                                            .slice(0, 16)
                                        : "",
                                      status: cycle.status,
                                      evidenceSummary:
                                        cycle.evidenceSummary || "",
                                      externalReference:
                                        cycle.externalReference || "",
                                      attachments: cycle.attachments,
                                    });
                                    setCycleDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {planDetail.readinessBlockingEnabled &&
                            cycle.readinessSummary.criticalPending > 0 &&
                            !["completed", "canceled"].includes(
                              cycle.status,
                            ) && (
                              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                  {cycle.readinessSummary.criticalPending === 1
                                    ? "1 item crítico pendente — o ciclo está bloqueado para avançar."
                                    : `${cycle.readinessSummary.criticalPending} itens críticos pendentes — o ciclo está bloqueado para avançar.`}
                                </span>
                              </div>
                            )}

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-xl bg-muted/40 p-3 text-sm">
                              <p className="text-muted-foreground">
                                Itens totais
                              </p>
                              <p className="text-lg font-semibold">
                                {cycle.readinessSummary.total}
                              </p>
                            </div>
                            <div className="rounded-xl bg-muted/40 p-3 text-sm">
                              <p className="text-muted-foreground">Pendentes</p>
                              <p className="text-lg font-semibold">
                                {cycle.readinessSummary.pending}
                              </p>
                            </div>
                            <div className="rounded-xl bg-muted/40 p-3 text-sm">
                              <p className="text-muted-foreground">
                                Pendências críticas
                              </p>
                              <p className="text-lg font-semibold">
                                {cycle.readinessSummary.criticalPending}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            <p className="text-sm font-medium">
                              Execução da prontidão
                            </p>
                            {cycle.readinessExecutions.map((execution) => (
                              <div
                                key={execution.id}
                                className="rounded-xl border border-border/60 px-3 py-3"
                              >
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium">
                                        {execution.checklistTitle}
                                      </p>
                                      {execution.isCritical && (
                                        <Badge
                                          variant="outline"
                                          className="bg-red-100 text-red-800 border-red-200"
                                        >
                                          Crítico
                                        </Badge>
                                      )}
                                      <Badge variant="outline">
                                        {getExecutionStatusLabel(
                                          execution.status,
                                        )}
                                      </Badge>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {execution.executedByName ||
                                        "Sem executor"}{" "}
                                      • {formatDateTime(execution.executedAt)}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {execution.evidenceNote ||
                                        "Sem observação registrada"}
                                    </p>
                                  </div>
                                  {canWrite && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setEditingExecution({
                                          cycleId: cycle.id,
                                          checklistItemId:
                                            execution.checklistItemId,
                                        });
                                        setExecutionForm({
                                          status: execution.status,
                                          executedById: execution.executedById
                                            ? String(execution.executedById)
                                            : planDetail.responsibleId
                                              ? String(planDetail.responsibleId)
                                              : "",
                                          evidenceNote:
                                            execution.evidenceNote || "",
                                          attachments: execution.attachments,
                                        });
                                        setExecutionDialogOpen(true);
                                      }}
                                    >
                                      Registrar
                                    </Button>
                                  )}
                                </div>
                                {execution.attachments.length > 0 && (
                                  <div className="mt-3">
                                    <AttachmentList
                                      attachments={execution.attachments}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {cycle.attachments.length > 0 && (
                            <div className="mt-4 space-y-3">
                              <p className="text-sm font-medium">
                                Anexos do ciclo
                              </p>
                              <AttachmentList attachments={cycle.attachments} />
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="mudancas" className="space-y-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Mudanças operacionais controladas</CardTitle>
                      {canWrite && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditingChangeId(null);
                            setChangeForm(emptyChangeForm());
                            setChangeDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Nova mudança
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {planDetail.changes.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma mudança operacional registrada.
                        </p>
                      )}
                      {planDetail.changes.map((change) => (
                        <div
                          key={change.id}
                          className="rounded-2xl border border-border/60 p-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <p className="text-lg font-medium">
                                  {change.title}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={getDecisionTone(change.decision)}
                                >
                                  {getDecisionLabel(change.decision)}
                                </Badge>
                                <Badge variant="outline">
                                  {getImpactLevelLabel(change.impactLevel)}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {change.reason}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Solicitado por{" "}
                                {change.requestedByName || "usuário"} em{" "}
                                {formatDateTime(change.createdAt)}
                              </p>
                            </div>
                            {canWrite && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingChangeId(change.id);
                                  setChangeForm({
                                    title: change.title,
                                    cycleEvidenceId: change.cycleEvidenceId
                                      ? String(change.cycleEvidenceId)
                                      : "",
                                    reason: change.reason,
                                    impactLevel: change.impactLevel,
                                    impactDescription:
                                      change.impactDescription || "",
                                    mitigationAction:
                                      change.mitigationAction || "",
                                    decision: change.decision,
                                    riskOpportunityItemIds: change.risks.map(
                                      (risk) => risk.id,
                                    ),
                                  });
                                  setChangeDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>

                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="text-sm font-medium">
                                Impacto avaliado
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {change.impactDescription ||
                                  "Sem descrição complementar"}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Mitigação</p>
                              <p className="text-sm text-muted-foreground">
                                {change.mitigationAction || "Não registrada"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4">
                            <p className="text-sm font-medium">
                              Riscos associados
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {change.risks.length ? (
                                change.risks.map((risk) => (
                                  <Badge key={risk.id} variant="secondary">
                                    {risk.title}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  Nenhum risco associado diretamente.
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        title={
          isEditingPlan ? "Editar plano operacional" : "Novo plano operacional"
        }
        description="Registre critérios, vínculos e controles de planejamento da realização do serviço."
        size="2xl"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={planForm.title}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={planForm.planCode}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    planCode: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Processo SGQ</Label>
              <Select
                value={planForm.processId}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    processId: event.target.value,
                  }))
                }
              >
                <option value="">Selecionar</option>
                {processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select
                value={planForm.unitId}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    unitId: event.target.value,
                  }))
                }
              >
                <option value="">Selecionar</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select
                value={planForm.responsibleId}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    responsibleId: event.target.value,
                  }))
                }
              >
                <option value="">Selecionar</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={planForm.status}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    status: event.target.value as PlanFormState["status"],
                  }))
                }
              >
                <option value="draft">Rascunho</option>
                <option value="active">Ativo</option>
                <option value="archived">Arquivado</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de serviço</Label>
            <Input
              value={planForm.serviceType}
              onChange={(event) =>
                setPlanForm((current) => ({
                  ...current,
                  serviceType: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Escopo</Label>
              <Textarea
                value={planForm.scope}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    scope: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Sequência de execução</Label>
              <Textarea
                value={planForm.sequenceDescription}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    sequenceDescription: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Critérios de execução</Label>
              <Textarea
                value={planForm.executionCriteria}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    executionCriteria: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Considerações ESG/SGI</Label>
              <Textarea
                value={planForm.esgConsiderations}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    esgConsiderations: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Recursos necessários</Label>
              <Input
                value={planForm.requiredResources}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    requiredResources: event.target.value,
                  }))
                }
                placeholder="Ex.: frota, EPI, checklist local"
              />
            </div>
            <div className="space-y-2">
              <Label>Entradas</Label>
              <Input
                value={planForm.inputs}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    inputs: event.target.value,
                  }))
                }
                placeholder="Ex.: ordem, demanda, dados"
              />
            </div>
            <div className="space-y-2">
              <Label>Saídas</Label>
              <Input
                value={planForm.outputs}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    outputs: event.target.value,
                  }))
                }
                placeholder="Ex.: evidência, relatório, entrega"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={planForm.readinessBlockingEnabled}
                onCheckedChange={(checked) =>
                  setPlanForm((current) => ({
                    ...current,
                    readinessBlockingEnabled: Boolean(checked),
                  }))
                }
              />
              <div>
                <p className="font-medium">
                  Bloquear avanço do ciclo quando houver item crítico pendente
                </p>
                <p className="text-sm text-muted-foreground">
                  Mantém o gate operacional ativo para execução controlada.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-3">
              <Label>Documentos aplicáveis</Label>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border/60 p-3">
                {documents.map((document) => (
                  <label
                    key={document.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={planForm.documentIds.includes(document.id)}
                      onCheckedChange={(checked) =>
                        setPlanForm((current) => ({
                          ...current,
                          documentIds: checked
                            ? [...current.documentIds, document.id]
                            : current.documentIds.filter(
                                (id) => id !== document.id,
                              ),
                        }))
                      }
                    />
                    <span className="text-sm">{document.title}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Label>Riscos e oportunidades vinculados</Label>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border/60 p-3">
                {riskItems.map((risk) => (
                  <label
                    key={risk.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={planForm.riskOpportunityItemIds.includes(
                        risk.id,
                      )}
                      onCheckedChange={(checked) =>
                        setPlanForm((current) => ({
                          ...current,
                          riskOpportunityItemIds: checked
                            ? [...current.riskOpportunityItemIds, risk.id]
                            : current.riskOpportunityItemIds.filter(
                                (id) => id !== risk.id,
                              ),
                        }))
                      }
                    />
                    <span className="text-sm">{risk.title}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Resumo da revisão</Label>
            <Input
              value={planForm.changeSummary}
              onChange={(event) =>
                setPlanForm((current) => ({
                  ...current,
                  changeSummary: event.target.value,
                }))
              }
              placeholder="Ex.: Ajuste de critérios para novo cliente"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submitPlan()}
            disabled={
              createPlanMutation.isPending || updatePlanMutation.isPending
            }
          >
            Salvar plano
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={checklistDialogOpen}
        onOpenChange={setChecklistDialogOpen}
        title={
          editingChecklistId
            ? "Editar item de prontidão"
            : "Novo item de prontidão"
        }
        description="Configure checkpoints mínimos antes da execução do serviço."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={checklistForm.title}
              onChange={(event) =>
                setChecklistForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Instruções</Label>
            <Textarea
              value={checklistForm.instructions}
              onChange={(event) =>
                setChecklistForm((current) => ({
                  ...current,
                  instructions: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={checklistForm.sortOrder}
                onChange={(event) =>
                  setChecklistForm((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3">
              <Checkbox
                checked={checklistForm.isCritical}
                onCheckedChange={(checked) =>
                  setChecklistForm((current) => ({
                    ...current,
                    isCritical: Boolean(checked),
                  }))
                }
              />
              <span className="text-sm font-medium">Item crítico</span>
            </label>
          </div>
          <div className="space-y-2">
            <Label>Resumo da revisão</Label>
            <Input
              value={checklistForm.changeSummary}
              onChange={(event) =>
                setChecklistForm((current) => ({
                  ...current,
                  changeSummary: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setChecklistDialogOpen(false)}
          >
            Cancelar
          </Button>
          <Button onClick={() => void submitChecklist()}>Salvar item</Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={cycleDialogOpen}
        onOpenChange={setCycleDialogOpen}
        title={
          editingCycleId ? "Editar ciclo operacional" : "Novo ciclo operacional"
        }
        description="Registre o ciclo de operação e as evidências da preparação realizada."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Código do ciclo</Label>
              <Input
                value={cycleForm.cycleCode}
                onChange={(event) =>
                  setCycleForm((current) => ({
                    ...current,
                    cycleCode: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Data/hora do ciclo</Label>
              <Input
                type="datetime-local"
                value={cycleForm.cycleDate}
                onChange={(event) =>
                  setCycleForm((current) => ({
                    ...current,
                    cycleDate: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={cycleForm.status}
                onChange={(event) =>
                  setCycleForm((current) => ({
                    ...current,
                    status: event.target.value as CycleFormState["status"],
                  }))
                }
              >
                <option value="planned">Planejado</option>
                <option value="ready">Pronto</option>
                <option value="in_execution">Em execução</option>
                <option value="completed">Concluído</option>
                <option value="blocked">Bloqueado</option>
                <option value="canceled">Cancelado</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Referência externa</Label>
              <Input
                value={cycleForm.externalReference}
                onChange={(event) =>
                  setCycleForm((current) => ({
                    ...current,
                    externalReference: event.target.value,
                  }))
                }
                placeholder="Ex.: ordem no ERP/TMS"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Resumo da evidência</Label>
            <Textarea
              value={cycleForm.evidenceSummary}
              onChange={(event) =>
                setCycleForm((current) => ({
                  ...current,
                  evidenceSummary: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-3">
            <Label>Anexos do ciclo</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground hover:bg-muted/40">
              <UploadCloud className="h-4 w-4" />
              Enviar evidências do ciclo
              <input
                type="file"
                multiple
                className="hidden"
                accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                onChange={async (event) => {
                  try {
                    const uploaded = await handleUploadFiles(
                      event.target.files,
                    );
                    setCycleForm((current) => ({
                      ...current,
                      attachments: [...current.attachments, ...uploaded],
                    }));
                    toast({ title: "Anexos carregados" });
                  } catch (error) {
                    toast({
                      title:
                        error instanceof Error
                          ? error.message
                          : "Falha no upload dos anexos",
                      variant: "destructive",
                    });
                  } finally {
                    event.target.value = "";
                  }
                }}
              />
            </label>
            <AttachmentList attachments={cycleForm.attachments} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCycleDialogOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submitCycle()}>Salvar ciclo</Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={changeDialogOpen}
        onOpenChange={setChangeDialogOpen}
        title={
          editingChangeId
            ? "Editar mudança operacional"
            : "Nova mudança operacional"
        }
        description="Avalie impacto, registre mitigação e vincule riscos associados."
        size="lg"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={changeForm.title}
              onChange={(event) =>
                setChangeForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Ciclo relacionado</Label>
              <Select
                value={changeForm.cycleEvidenceId}
                onChange={(event) =>
                  setChangeForm((current) => ({
                    ...current,
                    cycleEvidenceId: event.target.value,
                  }))
                }
              >
                <option value="">Não vincular</option>
                {planDetail?.cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.cycleCode}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nível de impacto</Label>
              <Select
                value={changeForm.impactLevel}
                onChange={(event) =>
                  setChangeForm((current) => ({
                    ...current,
                    impactLevel: event.target
                      .value as ChangeFormState["impactLevel"],
                  }))
                }
              >
                <option value="low">Baixo</option>
                <option value="medium">Médio</option>
                <option value="high">Alto</option>
                <option value="critical">Crítico</option>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Motivo da mudança</Label>
            <Textarea
              value={changeForm.reason}
              onChange={(event) =>
                setChangeForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Descrição do impacto</Label>
              <Textarea
                value={changeForm.impactDescription}
                onChange={(event) =>
                  setChangeForm((current) => ({
                    ...current,
                    impactDescription: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Ação mitigatória</Label>
              <Textarea
                value={changeForm.mitigationAction}
                onChange={(event) =>
                  setChangeForm((current) => ({
                    ...current,
                    mitigationAction: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Decisão</Label>
            <Select
              value={changeForm.decision}
              onChange={(event) =>
                setChangeForm((current) => ({
                  ...current,
                  decision: event.target.value as ChangeFormState["decision"],
                }))
              }
            >
              <option value="pending">Pendente</option>
              <option value="approved">Aprovada</option>
              <option value="rejected">Rejeitada</option>
            </Select>
          </div>
          <div className="space-y-3">
            <Label>Riscos associados</Label>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border/60 p-3">
              {riskItems.map((risk) => (
                <label
                  key={risk.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={changeForm.riskOpportunityItemIds.includes(
                      risk.id,
                    )}
                    onCheckedChange={(checked) =>
                      setChangeForm((current) => ({
                        ...current,
                        riskOpportunityItemIds: checked
                          ? [...current.riskOpportunityItemIds, risk.id]
                          : current.riskOpportunityItemIds.filter(
                              (id) => id !== risk.id,
                            ),
                      }))
                    }
                  />
                  <span className="text-sm">{risk.title}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setChangeDialogOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submitChange()}>Salvar mudança</Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={executionDialogOpen}
        onOpenChange={setExecutionDialogOpen}
        title="Registrar prontidão"
        description="Atualize o status do checkpoint e anexe a evidência correspondente."
        size="lg"
      >
        <div className="space-y-4">
          {selectedExecution && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <p className="font-medium">{selectedExecution.checklistTitle}</p>
              <p className="text-sm text-muted-foreground">
                Status atual:{" "}
                {getExecutionStatusLabel(selectedExecution.status)}
              </p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={executionForm.status}
                onChange={(event) =>
                  setExecutionForm((current) => ({
                    ...current,
                    status: event.target.value as ExecutionFormState["status"],
                  }))
                }
              >
                <option value="pending">Pendente</option>
                <option value="ok">Conforme</option>
                <option value="failed">Falhou</option>
                <option value="waived">Dispensado</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável pela execução</Label>
              <Select
                value={executionForm.executedById}
                onChange={(event) =>
                  setExecutionForm((current) => ({
                    ...current,
                    executedById: event.target.value,
                  }))
                }
              >
                <option value="">Selecionar</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observação / evidência</Label>
            <Textarea
              value={executionForm.evidenceNote}
              onChange={(event) =>
                setExecutionForm((current) => ({
                  ...current,
                  evidenceNote: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-3">
            <Label>Anexos</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground hover:bg-muted/40">
              <UploadCloud className="h-4 w-4" />
              Enviar evidências do checkpoint
              <input
                type="file"
                multiple
                className="hidden"
                accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                onChange={async (event) => {
                  try {
                    const uploaded = await handleUploadFiles(
                      event.target.files,
                    );
                    setExecutionForm((current) => ({
                      ...current,
                      attachments: [...current.attachments, ...uploaded],
                    }));
                    toast({ title: "Evidências carregadas" });
                  } catch (error) {
                    toast({
                      title:
                        error instanceof Error
                          ? error.message
                          : "Falha no upload da evidência",
                      variant: "destructive",
                    });
                  } finally {
                    event.target.value = "";
                  }
                }}
              />
            </label>
            <AttachmentList attachments={executionForm.attachments} />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setExecutionDialogOpen(false)}
          >
            Cancelar
          </Button>
          <Button onClick={() => void submitExecution()}>
            Salvar prontidão
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
