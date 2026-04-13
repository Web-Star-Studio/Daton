import React, { useEffect, useMemo, useState } from "react";
import { ClipboardList, FolderKanban, Plus, ShieldCheck } from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
    outputType: "other",
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
  const [inputForm, setInputForm] = useState<InputFormState>(emptyInputForm);
  const [stageForm, setStageForm] = useState<StageFormState>(emptyStageForm);
  const [outputForm, setOutputForm] =
    useState<OutputFormState>(emptyOutputForm);
  const [reviewForm, setReviewForm] =
    useState<ReviewFormState>(emptyReviewForm);
  const [changeForm, setChangeForm] =
    useState<ChangeFormState>(emptyChangeForm);

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

  async function deleteResource(
    mutation: {
      mutateAsync: (payload: {
        mode: "delete";
        resourceId: number;
      }) => Promise<unknown>;
    },
    resourceId: number,
    label: string,
  ) {
    if (!window.confirm(`Deseja remover ${label}?`)) {
      return;
    }

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
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-xl">Item 8.3 sob controle</CardTitle>
              <p className="text-sm text-muted-foreground">
                Primeiro registramos a aplicabilidade do requisito. Depois, se
                aplicável, ativamos o workflow de projeto e desenvolvimento.
              </p>
            </div>
            <Badge className={getDecisionTone(currentDecision)}>
              {getDecisionLabel(currentDecision)}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4" />
                Aplicabilidade atual
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {currentDecision
                  ? currentDecision.isApplicable
                    ? "8.3 aplicável e workflow habilitado."
                    : "8.3 tratado como não aplicável para o escopo vigente."
                  : "Ainda não existe decisão aprovada para o requisito 8.3."}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FolderKanban className="h-4 w-4" />
                Projetos
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {projectsQuery.data?.length ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ClipboardList className="h-4 w-4" />
                Governança
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {workflowEnabled
                  ? "O módulo já pode registrar entradas, etapas, saídas e revisões."
                  : "O módulo de projetos permanece bloqueado até existir decisão aprovada como aplicável."}
              </p>
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
                <CardTitle>Registrar decisão</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleDecisionSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Requisito 8.3</Label>
                      <Select
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
                      <Label>Responsável</Label>
                      <Select
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
                    <Label>Escopo avaliado</Label>
                    <Input
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
                    <Label>Justificativa</Label>
                    <Textarea
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
                      <Label>Válido a partir de</Label>
                      <Input
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
                      <Label>Válido até</Label>
                      <Input
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
                      {editingDecisionId
                        ? "Salvar decisão"
                        : "Registrar decisão"}
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
                  <p className="text-sm text-muted-foreground">
                    Carregando decisões...
                  </p>
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
                                variant="outline"
                                onClick={() => syncDecisionForm(decision)}
                              >
                                Editar
                              </Button>
                              <Button
                                type="button"
                                onClick={() =>
                                  handleDecisionApprove(decision.id)
                                }
                              >
                                Aprovar
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
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground">
                  O fluxo de P&D permanece bloqueado. Aprove uma decisão
                  aplicável do item 8.3 na aba de Aplicabilidade para habilitar
                  o cadastro de projetos.
                </p>
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
                    <p className="text-sm text-muted-foreground">
                      Carregando projetos...
                    </p>
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
                            {project.status}
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {project.scope}
                        </p>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum projeto criado ainda.
                    </p>
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
                          <Label>Código</Label>
                          <Input
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
                          <Label>Status</Label>
                          <Select
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
                            <option value="draft">Draft</option>
                            <option value="active">Ativo</option>
                            <option value="under_review">Em revisão</option>
                            <option value="completed">Concluído</option>
                            <option value="canceled">Cancelado</option>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Título</Label>
                        <Input
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
                        <Label>Escopo</Label>
                        <Textarea
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
                        <Label>Objetivo</Label>
                        <Textarea
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
                          <Label>Responsável</Label>
                          <Select
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
                          <Label>Início planejado</Label>
                          <Input
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
                          <Label>Fim planejado</Label>
                          <Input
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
                          <Label>Fim real</Label>
                          <Input
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
                          {selectedProjectId
                            ? "Salvar projeto"
                            : "Criar projeto"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setSelectedProjectId(null);
                            setProjectForm(emptyProjectForm());
                          }}
                        >
                          Novo
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                {projectDetail ? (
                  <div className="grid gap-6">
                    <Card className="shadow-sm">
                      <CardHeader>
                        <SectionHeader
                          title="Entradas"
                          description="Premissas, requisitos e referências de entrada do projeto."
                        />
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <form
                          className="grid gap-4 md:grid-cols-4"
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
                                setInputForm(emptyInputForm());
                              },
                            );
                          }}
                        >
                          <Input
                            placeholder="Título"
                            value={inputForm.title}
                            onChange={(event) =>
                              setInputForm((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                          <Input
                            placeholder="Fonte"
                            value={inputForm.source}
                            onChange={(event) =>
                              setInputForm((current) => ({
                                ...current,
                                source: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                          <Input
                            placeholder="Descrição"
                            value={inputForm.description}
                            onChange={(event) =>
                              setInputForm((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                          <div className="flex gap-2">
                            <Input
                              className="max-w-24"
                              placeholder="Ordem"
                              value={inputForm.sortOrder}
                              onChange={(event) =>
                                setInputForm((current) => ({
                                  ...current,
                                  sortOrder: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                            <Button
                              type="submit"
                              disabled={
                                !canWriteGovernance || inputMutation.isPending
                              }
                            >
                              {editingInputId ? "Salvar" : "Adicionar"}
                            </Button>
                          </div>
                        </form>
                        <div className="space-y-3">
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
                                  <p className="text-xs text-muted-foreground">
                                    {item.source || "Sem fonte"} · ordem{" "}
                                    {item.sortOrder}
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
                                    onClick={() => {
                                      setEditingInputId(item.id);
                                      setInputForm(inputToForm(item));
                                    }}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                      void deleteResource(
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
                        <SectionHeader
                          title="Etapas"
                          description="Planejamento com responsável, prazos e evidência mínima por etapa."
                        />
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <form
                          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
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
                                setStageForm(emptyStageForm());
                              },
                            );
                          }}
                        >
                          <Input
                            placeholder="Título da etapa"
                            value={stageForm.title}
                            onChange={(event) =>
                              setStageForm((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                          <Select
                            value={stageForm.responsibleEmployeeId}
                            onChange={(event) =>
                              setStageForm((current) => ({
                                ...current,
                                responsibleEmployeeId: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          >
                            <option value="">Responsável</option>
                            {employeeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                          <Select
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
                          <Input
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
                          <Input
                            className="md:col-span-2"
                            placeholder="Descrição"
                            value={stageForm.description}
                            onChange={(event) =>
                              setStageForm((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                          <Input
                            className="md:col-span-2"
                            placeholder="Evidência"
                            value={stageForm.evidenceNote}
                            onChange={(event) =>
                              setStageForm((current) => ({
                                ...current,
                                evidenceNote: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                          <div className="flex gap-2 md:col-span-2 xl:col-span-4">
                            <Input
                              className="max-w-28"
                              placeholder="Ordem"
                              value={stageForm.sortOrder}
                              onChange={(event) =>
                                setStageForm((current) => ({
                                  ...current,
                                  sortOrder: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                            <Input
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
                            <Button
                              type="submit"
                              disabled={
                                !canWriteGovernance || stageMutation.isPending
                              }
                            >
                              {editingStageId ? "Salvar" : "Adicionar"}
                            </Button>
                          </div>
                        </form>
                        <div className="space-y-3">
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
                                      {item.status}
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
                                    onClick={() => {
                                      setEditingStageId(item.id);
                                      setStageForm(stageToForm(item));
                                    }}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                      void deleteResource(
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
                          <SectionHeader
                            title="Saídas"
                            description="Entregas principais do projeto ou desenvolvimento."
                          />
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <form
                            className="space-y-3"
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
                                  setOutputForm(emptyOutputForm());
                                },
                              );
                            }}
                          >
                            <Input
                              placeholder="Título"
                              value={outputForm.title}
                              onChange={(event) =>
                                setOutputForm((current) => ({
                                  ...current,
                                  title: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                            <Input
                              placeholder="Tipo"
                              value={outputForm.outputType}
                              onChange={(event) =>
                                setOutputForm((current) => ({
                                  ...current,
                                  outputType: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                            <Textarea
                              placeholder="Descrição"
                              value={outputForm.description}
                              onChange={(event) =>
                                setOutputForm((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                            <div className="flex gap-2">
                              <Select
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
                                <option value="draft">Draft</option>
                                <option value="approved">Aprovada</option>
                                <option value="released">Liberada</option>
                              </Select>
                              <Input
                                className="max-w-24"
                                placeholder="Ordem"
                                value={outputForm.sortOrder}
                                onChange={(event) =>
                                  setOutputForm((current) => ({
                                    ...current,
                                    sortOrder: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              />
                              <Button
                                type="submit"
                                disabled={
                                  !canWriteGovernance ||
                                  outputMutation.isPending
                                }
                              >
                                {editingOutputId ? "Salvar" : "Adicionar"}
                              </Button>
                            </div>
                          </form>
                          <div className="space-y-3">
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
                                      {item.outputType} · {item.status}
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
                                      onClick={() => {
                                        setEditingOutputId(item.id);
                                        setOutputForm(outputToForm(item));
                                      }}
                                    >
                                      Editar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        void deleteResource(
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
                          <SectionHeader
                            title="Revisões, verificações e validações"
                            description="Registros mínimos de aprovação técnica e evidência de conformidade."
                          />
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <form
                            className="space-y-3"
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
                                  setReviewForm(emptyReviewForm());
                                },
                              );
                            }}
                          >
                            <div className="grid gap-3 md:grid-cols-2">
                              <Select
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
                                <option value="verification">
                                  Verificação
                                </option>
                                <option value="validation">Validação</option>
                              </Select>
                              <Select
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
                                <option value="needs_changes">
                                  Exige ajustes
                                </option>
                              </Select>
                            </div>
                            <Input
                              placeholder="Título do registro"
                              value={reviewForm.title}
                              onChange={(event) =>
                                setReviewForm((current) => ({
                                  ...current,
                                  title: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                            <div className="grid gap-3 md:grid-cols-2">
                              <Select
                                value={reviewForm.responsibleEmployeeId}
                                onChange={(event) =>
                                  setReviewForm((current) => ({
                                    ...current,
                                    responsibleEmployeeId: event.target.value,
                                  }))
                                }
                                disabled={!canWriteGovernance}
                              >
                                <option value="">Responsável</option>
                                {employeeOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <Input
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
                            <Textarea
                              placeholder="Observações"
                              value={reviewForm.notes}
                              onChange={(event) =>
                                setReviewForm((current) => ({
                                  ...current,
                                  notes: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                            <Button
                              type="submit"
                              disabled={
                                !canWriteGovernance || reviewMutation.isPending
                              }
                            >
                              {editingReviewId ? "Salvar" : "Adicionar"}
                            </Button>
                          </form>
                          <div className="space-y-3">
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
                                        {item.outcome}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {item.reviewType} · responsável{" "}
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
                                      onClick={() => {
                                        setEditingReviewId(item.id);
                                        setReviewForm(reviewToForm(item));
                                      }}
                                    >
                                      Editar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        void deleteResource(
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
                        <SectionHeader
                          title="Mudanças de projeto"
                          description="Controle das mudanças com motivo, impacto e decisão."
                        />
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <form
                          className="space-y-3"
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
                                setChangeForm(emptyChangeForm());
                              },
                            );
                          }}
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <Input
                              placeholder="Título"
                              value={changeForm.title}
                              onChange={(event) =>
                                setChangeForm((current) => ({
                                  ...current,
                                  title: event.target.value,
                                }))
                              }
                              disabled={!canWriteGovernance}
                            />
                            <Select
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
                          <Textarea
                            placeholder="Descrição da mudança"
                            value={changeForm.changeDescription}
                            onChange={(event) =>
                              setChangeForm((current) => ({
                                ...current,
                                changeDescription: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                          <Textarea
                            placeholder="Motivo"
                            value={changeForm.reason}
                            onChange={(event) =>
                              setChangeForm((current) => ({
                                ...current,
                                reason: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                          <Textarea
                            placeholder="Impacto"
                            value={changeForm.impactDescription}
                            onChange={(event) =>
                              setChangeForm((current) => ({
                                ...current,
                                impactDescription: event.target.value,
                              }))
                            }
                            disabled={!canWriteGovernance}
                          />
                          <Button
                            type="submit"
                            disabled={
                              !canWriteGovernance || changeMutation.isPending
                            }
                          >
                            {editingChangeId ? "Salvar" : "Adicionar"}
                          </Button>
                        </form>
                        <div className="space-y-3">
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
                                      {item.status}
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
                                    onClick={() => {
                                      setEditingChangeId(item.id);
                                      setChangeForm(changeToForm(item));
                                    }}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                      void deleteResource(
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
    </div>
  );
}
