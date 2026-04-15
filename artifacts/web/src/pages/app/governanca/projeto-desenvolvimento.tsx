import React, { useEffect, useMemo, useState } from "react";
import {
  FolderKanban,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  useApplicabilityDecisionMutation,
  useDevelopmentProject,
  useDevelopmentProjectMutation,
  useDevelopmentProjects,
  useProjectDevelopmentApplicability,
  useProjectResourceMutation,
  type ApplicabilityDecision,
  type ApplicabilityDecisionBody,
  type DevelopmentProjectBody,
  type DevelopmentProjectChange,
  type DevelopmentProjectChangeBody,
  type DevelopmentProjectDetail,
  type DevelopmentProjectInput,
  type DevelopmentProjectInputBody,
  type DevelopmentProjectOutput,
  type DevelopmentProjectOutputBody,
  type DevelopmentProjectReview,
  type DevelopmentProjectReviewBody,
  type DevelopmentProjectStage,
  type DevelopmentProjectStageBody,
} from "@/lib/project-development-client";
import {
  getListEmployeesQueryKey,
  useListEmployees,
  type Employee,
} from "@workspace/api-client-react";

type DecisionFormState = {
  isApplicable: "true" | "false";
  scopeSummary: string;
  justification: string;
  responsibleEmployeeId: string;
  validFrom: string;
  validUntil: string;
};

type ProjectFormState = {
  projectCode: string;
  title: string;
  scope: string;
  objective: string;
  status: "draft" | "active" | "under_review" | "completed" | "canceled";
  responsibleEmployeeId: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualEndDate: string;
};

type InputFormState = {
  title: string;
  description: string;
  source: string;
  sortOrder: string;
};

type StageFormState = {
  title: string;
  description: string;
  responsibleEmployeeId: string;
  status: "planned" | "in_progress" | "completed" | "blocked" | "canceled";
  dueDate: string;
  completedAt: string;
  evidenceNote: string;
  sortOrder: string;
};

type OutputFormState = {
  title: string;
  description: string;
  outputType: string;
  status: "draft" | "approved" | "released";
  sortOrder: string;
};

type ReviewFormState = {
  reviewType: "review" | "verification" | "validation";
  title: string;
  notes: string;
  outcome: "pending" | "approved" | "rejected" | "needs_changes";
  responsibleEmployeeId: string;
  occurredAt: string;
};

type ChangeFormState = {
  title: string;
  changeDescription: string;
  reason: string;
  impactDescription: string;
  status: "pending" | "approved" | "rejected" | "implemented";
};

function emptyDecisionForm(): DecisionFormState {
  return {
    isApplicable: "true",
    scopeSummary: "",
    justification: "",
    responsibleEmployeeId: "",
    validFrom: "",
    validUntil: "",
  };
}

function emptyProjectForm(): ProjectFormState {
  return {
    projectCode: "",
    title: "",
    scope: "",
    objective: "",
    status: "draft",
    responsibleEmployeeId: "",
    plannedStartDate: "",
    plannedEndDate: "",
    actualEndDate: "",
  };
}

function emptyInputForm(): InputFormState {
  return { title: "", description: "", source: "", sortOrder: "0" };
}

function emptyStageForm(): StageFormState {
  return {
    title: "",
    description: "",
    responsibleEmployeeId: "",
    status: "planned",
    dueDate: "",
    completedAt: "",
    evidenceNote: "",
    sortOrder: "0",
  };
}

function emptyOutputForm(): OutputFormState {
  return {
    title: "",
    description: "",
    outputType: "specification",
    status: "draft",
    sortOrder: "0",
  };
}

function emptyReviewForm(): ReviewFormState {
  return {
    reviewType: "review",
    title: "",
    notes: "",
    outcome: "pending",
    responsibleEmployeeId: "",
    occurredAt: "",
  };
}

function emptyChangeForm(): ChangeFormState {
  return {
    title: "",
    changeDescription: "",
    reason: "",
    impactDescription: "",
    status: "pending",
  };
}

function decisionToForm(decision: ApplicabilityDecision): DecisionFormState {
  return {
    isApplicable: decision.isApplicable ? "true" : "false",
    scopeSummary: decision.scopeSummary ?? "",
    justification: decision.justification,
    responsibleEmployeeId: decision.responsibleEmployeeId
      ? String(decision.responsibleEmployeeId)
      : "",
    validFrom: decision.validFrom ?? "",
    validUntil: decision.validUntil ?? "",
  };
}

function projectToForm(project: DevelopmentProjectDetail): ProjectFormState {
  return {
    projectCode: project.projectCode ?? "",
    title: project.title,
    scope: project.scope,
    objective: project.objective ?? "",
    status: project.status,
    responsibleEmployeeId: project.responsibleEmployeeId
      ? String(project.responsibleEmployeeId)
      : "",
    plannedStartDate: project.plannedStartDate ?? "",
    plannedEndDate: project.plannedEndDate ?? "",
    actualEndDate: project.actualEndDate ?? "",
  };
}

function inputToForm(item: DevelopmentProjectInput): InputFormState {
  return {
    title: item.title,
    description: item.description ?? "",
    source: item.source ?? "",
    sortOrder: String(item.sortOrder),
  };
}

function stageToForm(item: DevelopmentProjectStage): StageFormState {
  return {
    title: item.title,
    description: item.description ?? "",
    responsibleEmployeeId: item.responsibleEmployeeId
      ? String(item.responsibleEmployeeId)
      : "",
    status: item.status,
    dueDate: item.dueDate ?? "",
    completedAt: item.completedAt ? item.completedAt.slice(0, 16) : "",
    evidenceNote: item.evidenceNote ?? "",
    sortOrder: String(item.sortOrder),
  };
}

function outputToForm(item: DevelopmentProjectOutput): OutputFormState {
  return {
    title: item.title,
    description: item.description ?? "",
    outputType: item.outputType,
    status: item.status,
    sortOrder: String(item.sortOrder),
  };
}

function reviewToForm(item: DevelopmentProjectReview): ReviewFormState {
  return {
    reviewType: item.reviewType,
    title: item.title,
    notes: item.notes ?? "",
    outcome: item.outcome,
    responsibleEmployeeId: item.responsibleEmployeeId
      ? String(item.responsibleEmployeeId)
      : "",
    occurredAt: item.occurredAt ? item.occurredAt.slice(0, 16) : "",
  };
}

function changeToForm(item: DevelopmentProjectChange): ChangeFormState {
  return {
    title: item.title,
    changeDescription: item.changeDescription,
    reason: item.reason,
    impactDescription: item.impactDescription ?? "",
    status: item.status,
  };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  under_review: "Em revisão",
  completed: "Concluído",
  canceled: "Cancelado",
};

const STAGE_STATUS_LABEL: Record<string, string> = {
  planned: "Planejada",
  in_progress: "Em andamento",
  completed: "Concluída",
  blocked: "Bloqueada",
  canceled: "Cancelada",
};

const OUTPUT_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  approved: "Aprovada",
  released: "Liberada",
};

const OUTPUT_TYPE_LABEL: Record<string, string> = {
  specification: "Especificação",
  report: "Relatório",
  plan: "Plano",
  prototype: "Protótipo",
  certificate: "Certificado",
  other: "Outro",
};

const REVIEW_TYPE_LABEL: Record<string, string> = {
  review: "Revisão",
  verification: "Verificação",
  validation: "Validação",
};

const REVIEW_OUTCOME_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  needs_changes: "Exige ajustes",
};

const CHANGE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  implemented: "Implementada",
};

function getDecisionTone(decision?: ApplicabilityDecision | null) {
  if (!decision) return "bg-slate-100 text-slate-700 border-slate-200";
  if (decision.approvalStatus === "pending") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (decision.isApplicable) {
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
  return "bg-sky-100 text-sky-800 border-sky-200";
}

function getDecisionLabel(decision?: ApplicabilityDecision | null) {
  if (!decision) return "Sem decisão aprovada";
  if (decision.approvalStatus === "pending") return "Pendente de aprovação";
  return decision.isApplicable ? "Aplicável" : "Não aplicável";
}

function getProjectStatusTone(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "active":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "under_review":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "canceled":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
}

function getReviewTone(outcome: string) {
  switch (outcome) {
    case "approved":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200";
    case "needs_changes":
      return "bg-orange-100 text-orange-800 border-orange-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
}

function getChangeTone(status: string) {
  switch (status) {
    case "implemented":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "approved":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

type PendingDelete = {
  label: string;
  onConfirm: () => Promise<void>;
};

export default function ProjectDevelopmentPage() {
  usePageTitle("Projeto e Desenvolvimento");
  usePageSubtitle(
    "Controle de aplicabilidade do item 8.3 e workflow leve de P&D.",
  );

  const { organization } = useAuth();
  const { canWriteModule, isOrgAdmin, isPlatformAdmin } = usePermissions();
  const orgId = organization?.id;
  const canWriteGovernance = canWriteModule("governance");
  const canManageApplicability = isOrgAdmin || isPlatformAdmin;

  const [activeTab, setActiveTab] = useState("applicabilidade");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );
  const [editingDecisionId, setEditingDecisionId] = useState<number | null>(
    null,
  );
  const [decisionForm, setDecisionForm] =
    useState<DecisionFormState>(emptyDecisionForm);
  const [projectForm, setProjectForm] =
    useState<ProjectFormState>(emptyProjectForm);
  const [editingInputId, setEditingInputId] = useState<number | null>(null);
  const [editingStageId, setEditingStageId] = useState<number | null>(null);
  const [editingOutputId, setEditingOutputId] = useState<number | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const [editingChangeId, setEditingChangeId] = useState<number | null>(null);
  const [isAddingInput, setIsAddingInput] = useState(false);
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [isAddingOutput, setIsAddingOutput] = useState(false);
  const [isAddingReview, setIsAddingReview] = useState(false);
  const [isAddingChange, setIsAddingChange] = useState(false);
  const [inputForm, setInputForm] = useState<InputFormState>(emptyInputForm);
  const [stageForm, setStageForm] = useState<StageFormState>(emptyStageForm);
  const [outputForm, setOutputForm] =
    useState<OutputFormState>(emptyOutputForm);
  const [reviewForm, setReviewForm] =
    useState<ReviewFormState>(emptyReviewForm);
  const [changeForm, setChangeForm] =
    useState<ChangeFormState>(emptyChangeForm);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  const applicabilityQuery = useProjectDevelopmentApplicability(orgId);
  const projectsQuery = useDevelopmentProjects(orgId);
  const projectDetailQuery = useDevelopmentProject(
    orgId,
    selectedProjectId ?? undefined,
  );
  const decisionMutation = useApplicabilityDecisionMutation(orgId);
  const projectMutation = useDevelopmentProjectMutation(
    orgId,
    selectedProjectId ?? undefined,
  );
  const inputMutation = useProjectResourceMutation(
    orgId,
    selectedProjectId ?? undefined,
    "inputs",
  );
  const stageMutation = useProjectResourceMutation(
    orgId,
    selectedProjectId ?? undefined,
    "stages",
  );
  const outputMutation = useProjectResourceMutation(
    orgId,
    selectedProjectId ?? undefined,
    "outputs",
  );
  const reviewMutation = useProjectResourceMutation(
    orgId,
    selectedProjectId ?? undefined,
    "reviews",
  );
  const changeMutation = useProjectResourceMutation(
    orgId,
    selectedProjectId ?? undefined,
    "changes",
  );
  const { data: employeesResult } = useListEmployees(
    orgId ?? 0,
    { page: 1, pageSize: 100, status: "active" },
    {
      query: {
        enabled: !!orgId,
        queryKey: getListEmployeesQueryKey(orgId ?? 0, {
          page: 1,
          pageSize: 100,
          status: "active",
        }),
      },
    },
  );

  const employees = (employeesResult?.data ?? []) as Employee[];
  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: String(employee.id),
        label: employee.name,
      })),
    [employees],
  );

  const workflowEnabled = applicabilityQuery.data?.workflowEnabled ?? false;
  const currentDecision = applicabilityQuery.data?.currentDecision ?? null;
  const projectDetail = projectDetailQuery.data ?? null;

  useEffect(() => {
    if (
      !selectedProjectId &&
      projectsQuery.data &&
      projectsQuery.data.length > 0
    ) {
      setSelectedProjectId(projectsQuery.data[0].id);
    }
  }, [projectsQuery.data, selectedProjectId]);

  useEffect(() => {
    if (projectDetail) {
      setProjectForm(projectToForm(projectDetail));
      setEditingInputId(null);
      setEditingStageId(null);
      setEditingOutputId(null);
      setEditingReviewId(null);
      setEditingChangeId(null);
      setIsAddingInput(false);
      setIsAddingStage(false);
      setIsAddingOutput(false);
      setIsAddingReview(false);
      setIsAddingChange(false);
      setInputForm(emptyInputForm());
      setStageForm(emptyStageForm());
      setOutputForm(emptyOutputForm());
      setReviewForm(emptyReviewForm());
      setChangeForm(emptyChangeForm());
    } else if (!selectedProjectId) {
      setProjectForm(emptyProjectForm());
    }
  }, [projectDetail, selectedProjectId]);

  useHeaderActions(
    activeTab === "projetos" && canWriteGovernance && workflowEnabled ? (
      <HeaderActionButton
        label="Novo projeto"
        icon={<Plus className="h-4 w-4" />}
        onClick={() => {
          setSelectedProjectId(null);
          setProjectForm(emptyProjectForm());
        }}
      />
    ) : null,
  );

  function syncDecisionForm(decision?: ApplicabilityDecision | null) {
    if (!decision) {
      setEditingDecisionId(null);
      setDecisionForm(emptyDecisionForm());
      return;
    }
    setEditingDecisionId(decision.id);
    setDecisionForm(decisionToForm(decision));
  }

  function buildDecisionPayload(): ApplicabilityDecisionBody {
    return {
      isApplicable: decisionForm.isApplicable === "true",
      scopeSummary: decisionForm.scopeSummary.trim() || null,
      justification: decisionForm.justification.trim(),
      responsibleEmployeeId: Number(decisionForm.responsibleEmployeeId),
      validFrom: decisionForm.validFrom || null,
      validUntil: decisionForm.validUntil || null,
    };
  }

  function buildProjectPayload(): DevelopmentProjectBody {
    return {
      projectCode: projectForm.projectCode.trim() || null,
      title: projectForm.title.trim(),
      scope: projectForm.scope.trim(),
      objective: projectForm.objective.trim() || null,
      status: projectForm.status,
      responsibleEmployeeId: projectForm.responsibleEmployeeId
        ? Number(projectForm.responsibleEmployeeId)
        : null,
      plannedStartDate: projectForm.plannedStartDate || null,
      plannedEndDate: projectForm.plannedEndDate || null,
      actualEndDate: projectForm.actualEndDate || null,
    };
  }

  async function handleDecisionSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      const payload = buildDecisionPayload();
      if (!payload.justification || !payload.responsibleEmployeeId) {
        throw new Error("Preencha justificativa e responsável");
      }
      await decisionMutation.mutateAsync({
        mode: editingDecisionId ? "update" : "create",
        decisionId: editingDecisionId ?? undefined,
        body: payload,
      });
      toast({
        title: editingDecisionId ? "Decisão atualizada" : "Decisão registrada",
      });
      if (!editingDecisionId) {
        setDecisionForm(emptyDecisionForm());
      }
    } catch (error) {
      toast({
        title: "Não foi possível salvar a decisão",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  async function handleDecisionApprove(decisionId: number) {
    try {
      await decisionMutation.mutateAsync({ mode: "approve", decisionId });
      toast({ title: "Decisão aprovada" });
    } catch (error) {
      toast({
        title: "Não foi possível aprovar",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  async function handleProjectSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      const payload = buildProjectPayload();
      if (!payload.title || !payload.scope) {
        throw new Error("Título e escopo são obrigatórios");
      }
      const saved = await projectMutation.mutateAsync({
        mode: selectedProjectId ? "update" : "create",
        body: payload,
      });
      setSelectedProjectId(saved.id);
      toast({
        title: selectedProjectId ? "Projeto atualizado" : "Projeto criado",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar o projeto",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  async function submitResource<TBody>(
    mutation: {
      mutateAsync: (payload: {
        mode: "create" | "update";
        resourceId?: number;
        body?: TBody | Partial<TBody>;
      }) => Promise<unknown>;
      isPending: boolean;
    },
    payload: TBody,
    editingId: number | null,
    successTitle: string,
    reset: () => void,
  ) {
    try {
      await mutation.mutateAsync({
        mode: editingId ? "update" : "create",
        resourceId: editingId ?? undefined,
        body: payload,
      });
      toast({ title: successTitle });
      reset();
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  function deleteResource(
    mutation: {
      mutateAsync: (payload: {
        mode: "delete";
        resourceId: number;
      }) => Promise<unknown>;
    },
    resourceId: number,
    label: string,
  ) {
    setPendingDelete({
      label,
      onConfirm: async () => {
        try {
          await mutation.mutateAsync({ mode: "delete", resourceId });
          toast({ title: "Registro removido" });
        } catch (error) {
          toast({
            title: "Não foi possível remover",
            description: (error as Error).message,
            variant: "destructive",
          });
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">
                Aplicabilidade do requisito 8.3
              </CardTitle>
            </div>
            <Badge className={getDecisionTone(currentDecision)}>
              {getDecisionLabel(currentDecision)}
            </Badge>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                Decisão vigente
              </p>
              <p className="mt-1 text-sm text-foreground">
                {currentDecision
                  ? currentDecision.isApplicable
                    ? "Aplicável — workflow de P&D habilitado"
                    : "Não aplicável — justificativa registrada"
                  : "Nenhuma decisão aprovada"}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                Projetos de desenvolvimento
              </p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold text-foreground">
                  {projectsQuery.data?.length ?? 0}
                </span>
                <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="applicabilidade">Aplicabilidade</TabsTrigger>
          <TabsTrigger value="projetos">Projetos</TabsTrigger>
        </TabsList>

        <TabsContent value="applicabilidade" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>
                  {editingDecisionId ? "Editar decisão" : "Registrar decisão"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleDecisionSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="decision-applicable">
                        Requisito 8.3 <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        id="decision-applicable"
                        value={decisionForm.isApplicable}
                        onChange={(event) =>
                          setDecisionForm((current) => ({
                            ...current,
                            isApplicable: event.target.value as
                              | "true"
                              | "false",
                          }))
                        }
                        disabled={!canManageApplicability}
                      >
                        <option value="true">Aplicável</option>
                        <option value="false">Não aplicável</option>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="decision-responsible">
                        Responsável <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        id="decision-responsible"
                        value={decisionForm.responsibleEmployeeId}
                        onChange={(event) =>
                          setDecisionForm((current) => ({
                            ...current,
                            responsibleEmployeeId: event.target.value,
                          }))
                        }
                        disabled={!canManageApplicability}
                      >
                        <option value="">Selecione</option>
                        {employeeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="decision-scope">Escopo avaliado</Label>
                    <Textarea
                      id="decision-scope"
                      value={decisionForm.scopeSummary}
                      onChange={(event) =>
                        setDecisionForm((current) => ({
                          ...current,
                          scopeSummary: event.target.value,
                        }))
                      }
                      disabled={!canManageApplicability}
                      placeholder="Ex.: desenvolvimento de novos serviços e customizações"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="decision-justification">
                      Justificativa <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="decision-justification"
                      value={decisionForm.justification}
                      onChange={(event) =>
                        setDecisionForm((current) => ({
                          ...current,
                          justification: event.target.value,
                        }))
                      }
                      disabled={!canManageApplicability}
                      placeholder="Descreva por que o 8.3 é ou não é aplicável ao escopo da organização."
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="decision-valid-from">Válido a partir de</Label>
                      <Input
                        id="decision-valid-from"
                        type="date"
                        value={decisionForm.validFrom}
                        onChange={(event) =>
                          setDecisionForm((current) => ({
                            ...current,
                            validFrom: event.target.value,
                          }))
                        }
                        disabled={!canManageApplicability}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="decision-valid-until">Válido até</Label>
                      <Input
                        id="decision-valid-until"
                        type="date"
                        value={decisionForm.validUntil}
                        onChange={(event) =>
                          setDecisionForm((current) => ({
                            ...current,
                            validUntil: event.target.value,
                          }))
                        }
                        disabled={!canManageApplicability}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      disabled={
                        !canManageApplicability || decisionMutation.isPending
                      }
                    >
                      {decisionMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando…
                        </>
                      ) : editingDecisionId ? (
                        "Salvar decisão"
                      ) : (
                        "Registrar decisão"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => syncDecisionForm(null)}
                    >
                      Limpar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Histórico auditável</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {applicabilityQuery.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-24 w-full rounded-2xl" />
                    <Skeleton className="h-24 w-full rounded-2xl" />
                  </div>
                ) : applicabilityQuery.data?.history.length ? (
                  applicabilityQuery.data.history.map((decision) => (
                    <div
                      key={decision.id}
                      className="rounded-2xl border border-border/70 bg-background/70 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={getDecisionTone(decision)}>
                              {decision.approvalStatus === "pending"
                                ? "Pendente"
                                : decision.isApplicable
                                  ? "Aplicável"
                                  : "Não aplicável"}
                            </Badge>
                            {decision.isCurrentActive ? (
                              <Badge variant="outline">Vigente</Badge>
                            ) : null}
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {decision.scopeSummary ||
                              "Escopo geral da organização"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {decision.justification}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canManageApplicability &&
                          decision.approvalStatus === "pending" ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label={`Editar decisão: ${decision.scopeSummary || "escopo geral"}`}
                                onClick={() => syncDecisionForm(decision)}
                              >
                                Editar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                aria-label={`Aprovar decisão de aplicabilidade`}
                                disabled={decisionMutation.isPending}
                                onClick={() =>
                                  handleDecisionApprove(decision.id)
                                }
                              >
                                {decisionMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Aprovar"
                                )}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                        <p>
                          Responsável: {decision.responsibleEmployeeName || "—"}
                        </p>
                        <p>
                          Vigência:{" "}
                          {decision.validFrom
                            ? formatDate(decision.validFrom)
                            : "—"}{" "}
                          até{" "}
                          {decision.validUntil
                            ? formatDate(decision.validUntil)
                            : "indeterminada"}
                        </p>
                        <p>
                          Criada por {decision.createdByName || "—"} em{" "}
                          {formatDateTime(decision.createdAt)}
                        </p>
                        <p>
                          Aprovada por {decision.approvedByName || "—"} em{" "}
                          {formatDateTime(decision.approvedAt)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma decisão registrada até o momento.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="projetos" className="space-y-6">
          {!workflowEnabled ? (
            <Card className="shadow-sm">
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Workflow de P&D bloqueado
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    É necessário registrar e aprovar uma decisão de
                    aplicabilidade do item 8.3 antes de criar projetos.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("applicabilidade")}
                >
                  Ir para Aplicabilidade
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Projetos de desenvolvimento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {projectsQuery.isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full rounded-2xl" />
                      <Skeleton className="h-20 w-full rounded-2xl" />
                      <Skeleton className="h-20 w-full rounded-2xl" />
                    </div>
                  ) : projectsQuery.data?.length ? (
                    projectsQuery.data.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          selectedProjectId === project.id
                            ? "border-foreground bg-secondary/80"
                            : "border-border/70 bg-background hover:border-foreground/30"
                        }`}
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {project.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {project.projectCode || "Sem código"}
                            </p>
                          </div>
                          <Badge
                            className={getProjectStatusTone(project.status)}
                          >
                            {PROJECT_STATUS_LABEL[project.status] ?? project.status}
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {project.scope}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="space-y-3 py-2">
                      <p className="text-sm text-muted-foreground">
                        Nenhum projeto criado ainda.
                      </p>
                      {canWriteGovernance && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedProjectId(null);
                            setProjectForm(emptyProjectForm());
                          }}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Criar primeiro projeto
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>
                      {selectedProjectId ? "Resumo do projeto" : "Novo projeto"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form className="space-y-4" onSubmit={handleProjectSubmit}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="proj-code">Código</Label>
                          <Input
                            id="proj-code"
                            value={projectForm.projectCode}
                            onChange={(event) =>
                              setProjectForm((current) => ({
                                ...current,
                                projectCode: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proj-status">Status</Label>
                          <Select
                            id="proj-status"
                            value={projectForm.status}
                            onChange={(event) =>
                              setProjectForm((current) => ({
                                ...current,
                                status: event.target
                                  .value as ProjectFormState["status"],
                              }))
                            }
                            disabled={!canWriteGovernance}
                          >
                            <option value="draft">Rascunho</option>
                            <option value="active">Ativo</option>
                            <option value="under_review">Em revisão</option>
                            <option value="completed">Concluído</option>
                            <option value="canceled">Cancelado</option>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="proj-title">
                          Título <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="proj-title"
                          value={projectForm.title}
                          onChange={(event) =>
                            setProjectForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          disabled={!canWriteGovernance}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="proj-scope">
                          Escopo <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          id="proj-scope"
                          value={projectForm.scope}
                          onChange={(event) =>
                            setProjectForm((current) => ({
                              ...current,
                              scope: event.target.value,
                            }))
                          }
                          disabled={!canWriteGovernance}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="proj-objective">Objetivo</Label>
                        <Textarea
                          id="proj-objective"
                          value={projectForm.objective}
                          onChange={(event) =>
                            setProjectForm((current) => ({
                              ...current,
                              objective: event.target.value,
                            }))
                          }
                          disabled={!canWriteGovernance}
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-2">
                          <Label htmlFor="proj-responsible">Responsável</Label>
                          <Select
                            id="proj-responsible"
                            value={projectForm.responsibleEmployeeId}
                            onChange={(event) =>
                              setProjectForm((current) => ({
                                ...current,
                                responsibleEmployeeId: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          >
                            <option value="">Selecione</option>
                            {employeeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proj-start">Início planejado</Label>
                          <Input
                            id="proj-start"
                            type="date"
                            value={projectForm.plannedStartDate}
                            onChange={(event) =>
                              setProjectForm((current) => ({
                                ...current,
                                plannedStartDate: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proj-end-planned">Fim planejado</Label>
                          <Input
                            id="proj-end-planned"
                            type="date"
                            value={projectForm.plannedEndDate}
                            onChange={(event) =>
                              setProjectForm((current) => ({
                                ...current,
                                plannedEndDate: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proj-end-actual">Fim real</Label>
                          <Input
                            id="proj-end-actual"
                            type="date"
                            value={projectForm.actualEndDate}
                            onChange={(event) =>
                              setProjectForm((current) => ({
                                ...current,
                                actualEndDate: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="submit"
                          disabled={
                            !canWriteGovernance || projectMutation.isPending
                          }
                        >
                          {projectMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Salvando…
                            </>
                          ) : selectedProjectId ? (
                            "Salvar projeto"
                          ) : (
                            "Criar projeto"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setSelectedProjectId(null);
                            setProjectForm(emptyProjectForm());
                          }}
                        >
                          Novo projeto
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                {projectDetail ? (
                  <div className="grid gap-6">
                    <Card className="shadow-sm">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <SectionHeader
                            title="Entradas"
                            description="Premissas, requisitos e referências de entrada do projeto."
                          />
                          {canWriteGovernance && !isAddingInput && !editingInputId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsAddingInput(true)}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Adicionar
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {(isAddingInput || editingInputId) && (
                        <form
                          className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const payload: DevelopmentProjectInputBody = {
                              title: inputForm.title.trim(),
                              description: inputForm.description.trim() || null,
                              source: inputForm.source.trim() || null,
                              sortOrder: Number(inputForm.sortOrder || 0),
                            };
                            void submitResource(
                              inputMutation,
                              payload,
                              editingInputId,
                              editingInputId
                                ? "Entrada atualizada"
                                : "Entrada adicionada",
                              () => {
                                setEditingInputId(null);
                                setIsAddingInput(false);
                                setInputForm(emptyInputForm());
                              },
                            );
                          }}
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor="input-title">
                                Título <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="input-title"
                                value={inputForm.title}
                                onChange={(event) =>
                                  setInputForm((current) => ({
                                    ...current,
                                    title: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="input-source">Fonte</Label>
                              <Input
                                id="input-source"
                                value={inputForm.source}
                                onChange={(event) =>
                                  setInputForm((current) => ({
                                    ...current,
                                    source: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="input-description">Descrição</Label>
                            <Textarea
                              id="input-description"
                              value={inputForm.description}
                              onChange={(event) =>
                                setInputForm((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              size="sm"
                              disabled={
                                !canWriteGovernance || inputMutation.isPending
                              }
                            >
                              {inputMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : editingInputId ? (
                                "Salvar"
                              ) : (
                                "Adicionar"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingInputId(null);
                                setIsAddingInput(false);
                                setInputForm(emptyInputForm());
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </form>
                        )}
                        <div className="space-y-3">
                          {projectDetail.inputs.length === 0 && !isAddingInput && (
                            <p className="text-xs text-muted-foreground">
                              Nenhuma entrada registrada.
                            </p>
                          )}
                          {projectDetail.inputs.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-2xl border border-border/70 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">
                                    {item.title}
                                  </p>
                                  {item.source ? (
                                    <p className="text-xs text-muted-foreground">
                                      Fonte: {item.source}
                                    </p>
                                  ) : null}
                                  {item.description ? (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                      {item.description}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label={`Editar entrada: ${item.title}`}
                                    onClick={() => {
                                      setEditingInputId(item.id);
                                      setIsAddingInput(false);
                                      setInputForm(inputToForm(item));
                                    }}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Excluir entrada: ${item.title}`}
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      deleteResource(
                                        inputMutation,
                                        item.id,
                                        "esta entrada",
                                      )
                                    }
                                  >
                                    Excluir
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <SectionHeader
                            title="Etapas"
                            description="Planejamento com responsável, prazos e evidência mínima por etapa."
                          />
                          {canWriteGovernance && !isAddingStage && !editingStageId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsAddingStage(true)}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Adicionar
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {(isAddingStage || editingStageId) && (
                        <form
                          className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const payload: DevelopmentProjectStageBody = {
                              title: stageForm.title.trim(),
                              description: stageForm.description.trim() || null,
                              responsibleEmployeeId:
                                stageForm.responsibleEmployeeId
                                  ? Number(stageForm.responsibleEmployeeId)
                                  : null,
                              status: stageForm.status,
                              dueDate: stageForm.dueDate || null,
                              completedAt: stageForm.completedAt
                                ? new Date(stageForm.completedAt).toISOString()
                                : null,
                              evidenceNote:
                                stageForm.evidenceNote.trim() || null,
                              sortOrder: Number(stageForm.sortOrder || 0),
                            };
                            void submitResource(
                              stageMutation,
                              payload,
                              editingStageId,
                              editingStageId
                                ? "Etapa atualizada"
                                : "Etapa adicionada",
                              () => {
                                setEditingStageId(null);
                                setIsAddingStage(false);
                                setStageForm(emptyStageForm());
                              },
                            );
                          }}
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor="stage-title">
                                Título <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="stage-title"
                                value={stageForm.title}
                                onChange={(event) =>
                                  setStageForm((current) => ({
                                    ...current,
                                    title: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="stage-responsible">Responsável</Label>
                              <Select
                                id="stage-responsible"
                                value={stageForm.responsibleEmployeeId}
                                onChange={(event) =>
                                  setStageForm((current) => ({
                                    ...current,
                                    responsibleEmployeeId: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              >
                                <option value="">Selecione</option>
                                {employeeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="stage-status">Status</Label>
                              <Select
                                id="stage-status"
                                value={stageForm.status}
                                onChange={(event) =>
                                  setStageForm((current) => ({
                                    ...current,
                                    status: event.target
                                      .value as StageFormState["status"],
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              >
                                <option value="planned">Planejada</option>
                                <option value="in_progress">Em andamento</option>
                                <option value="completed">Concluída</option>
                                <option value="blocked">Bloqueada</option>
                                <option value="canceled">Cancelada</option>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="stage-due">Prazo</Label>
                              <Input
                                id="stage-due"
                                type="date"
                                value={stageForm.dueDate}
                                onChange={(event) =>
                                  setStageForm((current) => ({
                                    ...current,
                                    dueDate: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="stage-description">Descrição</Label>
                            <Textarea
                              id="stage-description"
                              value={stageForm.description}
                              onChange={(event) =>
                                setStageForm((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="stage-evidence">Evidência</Label>
                            <Textarea
                              id="stage-evidence"
                              value={stageForm.evidenceNote}
                              onChange={(event) =>
                                setStageForm((current) => ({
                                  ...current,
                                  evidenceNote: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="stage-completed-at">Concluída em</Label>
                            <Input
                              id="stage-completed-at"
                              type="datetime-local"
                              value={stageForm.completedAt}
                              onChange={(event) =>
                                setStageForm((current) => ({
                                  ...current,
                                  completedAt: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              size="sm"
                              disabled={
                                !canWriteGovernance || stageMutation.isPending
                              }
                            >
                              {stageMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : editingStageId ? (
                                "Salvar"
                              ) : (
                                "Adicionar"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingStageId(null);
                                setIsAddingStage(false);
                                setStageForm(emptyStageForm());
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </form>
                        )}
                        <div className="space-y-3">
                          {projectDetail.stages.length === 0 && !isAddingStage && (
                            <p className="text-xs text-muted-foreground">
                              Nenhuma etapa registrada.
                            </p>
                          )}
                          {projectDetail.stages.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-2xl border border-border/70 p-4"
                            >
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium">
                                      {item.title}
                                    </p>
                                    <Badge
                                      className={getProjectStatusTone(
                                        item.status,
                                      )}
                                    >
                                      {STAGE_STATUS_LABEL[item.status] ?? item.status}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Responsável:{" "}
                                    {item.responsibleEmployeeName || "—"} ·
                                    Prazo: {formatDate(item.dueDate)}
                                  </p>
                                  {item.description ? (
                                    <p className="text-sm text-muted-foreground">
                                      {item.description}
                                    </p>
                                  ) : null}
                                  {item.evidenceNote ? (
                                    <p className="text-xs text-muted-foreground">
                                      Evidência: {item.evidenceNote}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label={`Editar etapa: ${item.title}`}
                                    onClick={() => {
                                      setEditingStageId(item.id);
                                      setIsAddingStage(false);
                                      setStageForm(stageToForm(item));
                                    }}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Excluir etapa: ${item.title}`}
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      deleteResource(
                                        stageMutation,
                                        item.id,
                                        "esta etapa",
                                      )
                                    }
                                  >
                                    Excluir
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid gap-6 xl:grid-cols-2">
                      <Card className="shadow-sm">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <SectionHeader
                              title="Saídas"
                              description="Entregas principais do projeto ou desenvolvimento."
                            />
                            {canWriteGovernance && !isAddingOutput && !editingOutputId && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsAddingOutput(true)}
                              >
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                Adicionar
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(isAddingOutput || editingOutputId) && (
                          <form
                            className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const payload: DevelopmentProjectOutputBody = {
                                title: outputForm.title.trim(),
                                description:
                                  outputForm.description.trim() || null,
                                outputType:
                                  outputForm.outputType.trim() || "other",
                                status: outputForm.status,
                                sortOrder: Number(outputForm.sortOrder || 0),
                              };
                              void submitResource(
                                outputMutation,
                                payload,
                                editingOutputId,
                                editingOutputId
                                  ? "Saída atualizada"
                                  : "Saída adicionada",
                                () => {
                                  setEditingOutputId(null);
                                  setIsAddingOutput(false);
                                  setOutputForm(emptyOutputForm());
                                },
                              );
                            }}
                          >
                            <div className="space-y-1.5">
                              <Label htmlFor="output-title">
                                Título <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="output-title"
                                value={outputForm.title}
                                onChange={(event) =>
                                  setOutputForm((current) => ({
                                    ...current,
                                    title: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor="output-type">Tipo</Label>
                                <Select
                                  id="output-type"
                                  value={outputForm.outputType}
                                  onChange={(event) =>
                                    setOutputForm((current) => ({
                                      ...current,
                                      outputType: event.target.value,
                                    }))
                                  }
                                  disabled={!canWriteGovernance}
                                >
                                  <option value="specification">Especificação</option>
                                  <option value="report">Relatório</option>
                                  <option value="plan">Plano</option>
                                  <option value="prototype">Protótipo</option>
                                  <option value="certificate">Certificado</option>
                                  <option value="other">Outro</option>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="output-status">Status</Label>
                                <Select
                                  id="output-status"
                                  value={outputForm.status}
                                  onChange={(event) =>
                                    setOutputForm((current) => ({
                                      ...current,
                                      status: event.target
                                        .value as OutputFormState["status"],
                                    }))
                                  }
                                  disabled={!canWriteGovernance}
                                >
                                  <option value="draft">Rascunho</option>
                                  <option value="approved">Aprovada</option>
                                  <option value="released">Liberada</option>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="output-description">Descrição</Label>
                              <Textarea
                                id="output-description"
                                value={outputForm.description}
                                onChange={(event) =>
                                  setOutputForm((current) => ({
                                    ...current,
                                    description: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="submit"
                                size="sm"
                                disabled={
                                  !canWriteGovernance ||
                                  outputMutation.isPending
                                }
                              >
                                {outputMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : editingOutputId ? (
                                  "Salvar"
                                ) : (
                                  "Adicionar"
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingOutputId(null);
                                  setIsAddingOutput(false);
                                  setOutputForm(emptyOutputForm());
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </form>
                          )}
                          <div className="space-y-3">
                            {projectDetail.outputs.length === 0 && !isAddingOutput && (
                              <p className="text-xs text-muted-foreground">
                                Nenhuma saída registrada.
                              </p>
                            )}
                            {projectDetail.outputs.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-border/70 p-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium">
                                      {item.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {OUTPUT_TYPE_LABEL[item.outputType] ?? item.outputType} ·{" "}
                                      {OUTPUT_STATUS_LABEL[item.status] ?? item.status}
                                    </p>
                                    {item.description ? (
                                      <p className="mt-2 text-sm text-muted-foreground">
                                        {item.description}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      aria-label={`Editar saída: ${item.title}`}
                                      onClick={() => {
                                        setEditingOutputId(item.id);
                                        setIsAddingOutput(false);
                                        setOutputForm(outputToForm(item));
                                      }}
                                    >
                                      Editar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      aria-label={`Excluir saída: ${item.title}`}
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() =>
                                        deleteResource(
                                          outputMutation,
                                          item.id,
                                          "esta saída",
                                        )
                                      }
                                    >
                                      Excluir
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="shadow-sm">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <SectionHeader
                              title="Revisões, verificações e validações"
                              description="Registros mínimos de aprovação técnica e evidência de conformidade."
                            />
                            {canWriteGovernance && !isAddingReview && !editingReviewId && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsAddingReview(true)}
                              >
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                Registrar
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(isAddingReview || editingReviewId) && (
                          <form
                            className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const payload: DevelopmentProjectReviewBody = {
                                reviewType: reviewForm.reviewType,
                                title: reviewForm.title.trim(),
                                notes: reviewForm.notes.trim() || null,
                                outcome: reviewForm.outcome,
                                responsibleEmployeeId:
                                  reviewForm.responsibleEmployeeId
                                    ? Number(reviewForm.responsibleEmployeeId)
                                    : null,
                                occurredAt: reviewForm.occurredAt
                                  ? new Date(
                                      reviewForm.occurredAt,
                                    ).toISOString()
                                  : null,
                              };
                              void submitResource(
                                reviewMutation,
                                payload,
                                editingReviewId,
                                editingReviewId
                                  ? "Registro atualizado"
                                  : "Registro adicionado",
                                () => {
                                  setEditingReviewId(null);
                                  setIsAddingReview(false);
                                  setReviewForm(emptyReviewForm());
                                },
                              );
                            }}
                          >
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor="review-type">
                                  Tipo <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                  id="review-type"
                                  value={reviewForm.reviewType}
                                  onChange={(event) =>
                                    setReviewForm((current) => ({
                                      ...current,
                                      reviewType: event.target
                                        .value as ReviewFormState["reviewType"],
                                    }))
                                  }
                                  disabled={!canWriteGovernance}
                                >
                                  <option value="review">Revisão</option>
                                  <option value="verification">Verificação</option>
                                  <option value="validation">Validação</option>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="review-outcome">Resultado</Label>
                                <Select
                                  id="review-outcome"
                                  value={reviewForm.outcome}
                                  onChange={(event) =>
                                    setReviewForm((current) => ({
                                      ...current,
                                      outcome: event.target
                                        .value as ReviewFormState["outcome"],
                                    }))
                                  }
                                  disabled={!canWriteGovernance}
                                >
                                  <option value="pending">Pendente</option>
                                  <option value="approved">Aprovada</option>
                                  <option value="rejected">Rejeitada</option>
                                  <option value="needs_changes">Exige ajustes</option>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="review-title">
                                Título <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="review-title"
                                value={reviewForm.title}
                                onChange={(event) =>
                                  setReviewForm((current) => ({
                                    ...current,
                                    title: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor="review-responsible">Responsável</Label>
                                <Select
                                  id="review-responsible"
                                  value={reviewForm.responsibleEmployeeId}
                                  onChange={(event) =>
                                    setReviewForm((current) => ({
                                      ...current,
                                      responsibleEmployeeId: event.target.value,
                                    }))
                                  }
                                  disabled={!canWriteGovernance}
                                >
                                  <option value="">Selecione</option>
                                  {employeeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="review-occurred-at">Ocorreu em</Label>
                                <Input
                                  id="review-occurred-at"
                                  type="datetime-local"
                                  value={reviewForm.occurredAt}
                                  onChange={(event) =>
                                    setReviewForm((current) => ({
                                      ...current,
                                      occurredAt: event.target.value,
                                    }))
                                  }
                                  disabled={!canWriteGovernance}
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="review-notes">Observações</Label>
                              <Textarea
                                id="review-notes"
                                value={reviewForm.notes}
                                onChange={(event) =>
                                  setReviewForm((current) => ({
                                    ...current,
                                    notes: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="submit"
                                size="sm"
                                disabled={
                                  !canWriteGovernance || reviewMutation.isPending
                                }
                              >
                                {reviewMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : editingReviewId ? (
                                  "Salvar"
                                ) : (
                                  "Registrar"
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingReviewId(null);
                                  setIsAddingReview(false);
                                  setReviewForm(emptyReviewForm());
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </form>
                          )}
                          <div className="space-y-3">
                            {projectDetail.reviews.length === 0 && !isAddingReview && (
                              <p className="text-xs text-muted-foreground">
                                Nenhum registro de revisão, verificação ou validação.
                              </p>
                            )}
                            {projectDetail.reviews.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-border/70 p-4"
                              >
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-medium">
                                        {item.title}
                                      </p>
                                      <Badge
                                        className={getReviewTone(item.outcome)}
                                      >
                                        {REVIEW_OUTCOME_LABEL[item.outcome] ?? item.outcome}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {REVIEW_TYPE_LABEL[item.reviewType] ?? item.reviewType} · responsável{" "}
                                      {item.responsibleEmployeeName || "—"} ·{" "}
                                      {formatDateTime(item.occurredAt)}
                                    </p>
                                    {item.notes ? (
                                      <p className="text-sm text-muted-foreground">
                                        {item.notes}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      aria-label={`Editar registro: ${item.title}`}
                                      onClick={() => {
                                        setEditingReviewId(item.id);
                                        setIsAddingReview(false);
                                        setReviewForm(reviewToForm(item));
                                      }}
                                    >
                                      Editar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      aria-label={`Excluir registro: ${item.title}`}
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() =>
                                        deleteResource(
                                          reviewMutation,
                                          item.id,
                                          "este registro",
                                        )
                                      }
                                    >
                                      Excluir
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="shadow-sm">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <SectionHeader
                            title="Mudanças de projeto"
                            description="Controle das mudanças com motivo, impacto e decisão."
                          />
                          {canWriteGovernance && !isAddingChange && !editingChangeId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsAddingChange(true)}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Registrar
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {(isAddingChange || editingChangeId) && (
                        <form
                          className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const payload: DevelopmentProjectChangeBody = {
                              title: changeForm.title.trim(),
                              changeDescription:
                                changeForm.changeDescription.trim(),
                              reason: changeForm.reason.trim(),
                              impactDescription:
                                changeForm.impactDescription.trim() || null,
                              status: changeForm.status,
                            };
                            void submitResource(
                              changeMutation,
                              payload,
                              editingChangeId,
                              editingChangeId
                                ? "Mudança atualizada"
                                : "Mudança adicionada",
                              () => {
                                setEditingChangeId(null);
                                setIsAddingChange(false);
                                setChangeForm(emptyChangeForm());
                              },
                            );
                          }}
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor="change-title">
                                Título <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="change-title"
                                value={changeForm.title}
                                onChange={(event) =>
                                  setChangeForm((current) => ({
                                    ...current,
                                    title: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="change-status">Status</Label>
                              <Select
                                id="change-status"
                                value={changeForm.status}
                                onChange={(event) =>
                                  setChangeForm((current) => ({
                                    ...current,
                                    status: event.target
                                      .value as ChangeFormState["status"],
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              >
                                <option value="pending">Pendente</option>
                                <option value="approved">Aprovada</option>
                                <option value="rejected">Rejeitada</option>
                                <option value="implemented">Implementada</option>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="change-description">
                              Descrição <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                              id="change-description"
                              value={changeForm.changeDescription}
                              onChange={(event) =>
                                setChangeForm((current) => ({
                                  ...current,
                                  changeDescription: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="change-reason">
                              Motivo <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                              id="change-reason"
                              value={changeForm.reason}
                              onChange={(event) =>
                                setChangeForm((current) => ({
                                  ...current,
                                  reason: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="change-impact">Impacto</Label>
                            <Textarea
                              id="change-impact"
                              value={changeForm.impactDescription}
                              onChange={(event) =>
                                setChangeForm((current) => ({
                                  ...current,
                                  impactDescription: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              size="sm"
                              disabled={
                                !canWriteGovernance || changeMutation.isPending
                              }
                            >
                              {changeMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : editingChangeId ? (
                                "Salvar"
                              ) : (
                                "Registrar"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingChangeId(null);
                                setIsAddingChange(false);
                                setChangeForm(emptyChangeForm());
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </form>
                        )}
                        <div className="space-y-3">
                          {projectDetail.changes.length === 0 && !isAddingChange && (
                            <p className="text-xs text-muted-foreground">
                              Nenhuma mudança registrada.
                            </p>
                          )}
                          {projectDetail.changes.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-2xl border border-border/70 p-4"
                            >
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium">
                                      {item.title}
                                    </p>
                                    <Badge
                                      className={getChangeTone(item.status)}
                                    >
                                      {CHANGE_STATUS_LABEL[item.status] ?? item.status}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {item.changeDescription}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Motivo: {item.reason}
                                  </p>
                                  {item.impactDescription ? (
                                    <p className="text-xs text-muted-foreground">
                                      Impacto: {item.impactDescription}
                                    </p>
                                  ) : null}
                                  <p className="text-xs text-muted-foreground">
                                    Decisão por {item.decidedByName || "—"} em{" "}
                                    {formatDateTime(item.decidedAt)}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label={`Editar mudança: ${item.title}`}
                                    onClick={() => {
                                      setEditingChangeId(item.id);
                                      setIsAddingChange(false);
                                      setChangeForm(changeToForm(item));
                                    }}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Excluir mudança: ${item.title}`}
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      deleteResource(
                                        changeMutation,
                                        item.id,
                                        "esta mudança",
                                      )
                                    }
                                  >
                                    Excluir
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card className="shadow-sm">
                    <CardContent className="py-8">
                      <p className="text-sm text-muted-foreground">
                        Selecione um projeto existente ou crie um novo para
                        registrar entradas, etapas, saídas, revisões e mudanças.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover {pendingDelete?.label}? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void pendingDelete?.onConfirm();
                setPendingDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
