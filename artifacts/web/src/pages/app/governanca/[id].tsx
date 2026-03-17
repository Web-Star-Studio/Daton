import React, { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { Link, useLocation, useParams } from "wouter";
import { z } from "zod";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useListUnits, useListUserOptions, getListUnitsQueryKey, getListUserOptionsQueryKey, type UserOption } from "@workspace/api-client-react";
import {
  fetchGovernanceExport,
  useGovernanceCrudMutation,
  useGovernancePlan,
  useGovernanceWorkflowAction,
  useImportGovernancePlan,
  useUpdateGovernancePlan,
  type GovernanceAction,
  type GovernanceImportPayload,
  type GovernanceInterestedParty,
  type GovernanceInterestedPartyBody,
  type GovernanceObjective,
  type GovernanceObjectiveBody,
  type GovernancePlanBody,
  type GovernanceSwotItem,
  type GovernanceSwotBody,
  type GovernanceActionBody,
} from "@/lib/governance-client";
import { parseGovernanceWorkbook, type GovernanceImportPreview } from "@/lib/governance-import";
import { resolveApiUrl } from "@/lib/api";
import {
  dateToIso,
  formatGovernanceDate,
  GOVERNANCE_STATUS_LABELS,
  isoToDateInput,
} from "@/lib/governance-ui";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, FileText, Loader2, Pencil, Plus, RotateCcw, Send, ShieldAlert, Trash2, XCircle } from "lucide-react";

type Tab = "overview" | "swot" | "interested" | "scope" | "objectives" | "actions" | "revisions";

const governancePlanSchema = z.object({
  title: z.string().min(1, "Informe o título"),
  standards: z.array(z.string()),
  executiveSummary: z.string().nullable().optional(),
  reviewFrequencyMonths: z.number().min(1, "Informe a frequência de revisão"),
  nextReviewAt: z.string().nullable().optional(),
  reviewReason: z.string().nullable().optional(),
  climateChangeRelevant: z.boolean().nullable(),
  climateChangeJustification: z.string().nullable().optional(),
  technicalScope: z.string().nullable().optional(),
  geographicScope: z.string().nullable().optional(),
  policy: z.string().nullable().optional(),
  mission: z.string().nullable().optional(),
  vision: z.string().nullable().optional(),
  values: z.string().nullable().optional(),
  strategicConclusion: z.string().nullable().optional(),
  methodologyNotes: z.string().nullable().optional(),
  legacyMethodology: z.string().nullable().optional(),
  legacyIndicatorsNotes: z.string().nullable().optional(),
  legacyRevisionHistory: z.array(z.any()).nullable().optional(),
  importedWorkbookName: z.string().nullable().optional(),
});

const governanceSwotSchema = z.object({
  domain: z.enum(["sgq", "sga", "sgsv", "esg", "governance"]),
  matrixLabel: z.string().nullable().optional(),
  swotType: z.enum(["strength", "weakness", "opportunity", "threat"]),
  environment: z.enum(["internal", "external"]),
  perspective: z.string().nullable().optional(),
  description: z.string().min(1, "Informe a descrição"),
  performance: z.number().nullable().optional(),
  relevance: z.number().nullable().optional(),
  result: z.number().nullable().optional(),
  treatmentDecision: z.string().nullable().optional(),
  linkedObjectiveCode: z.string().nullable().optional(),
  linkedObjectiveLabel: z.string().nullable().optional(),
  importedActionReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number(),
});

const governanceInterestedPartySchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  expectedRequirements: z.string().nullable().optional(),
  roleInCompany: z.string().nullable().optional(),
  roleSummary: z.string().nullable().optional(),
  relevantToManagementSystem: z.boolean(),
  legalRequirementApplicable: z.boolean(),
  monitoringMethod: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number(),
});

const governanceObjectiveSchema = z.object({
  code: z.string().min(1, "Informe o código"),
  systemDomain: z.string().nullable().optional(),
  description: z.string().min(1, "Informe a descrição"),
  notes: z.string().nullable().optional(),
  sortOrder: z.number(),
});

const governanceActionSchema = z.object({
  title: z.string().min(1, "Informe o título"),
  description: z.string().nullable().optional(),
  swotItemId: z.number().nullable().optional(),
  objectiveId: z.number().nullable().optional(),
  responsibleUserId: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["pending", "in_progress", "done", "canceled"]),
  notes: z.string().nullable().optional(),
  sortOrder: z.number(),
  unitIds: z.array(z.number()),
});

function blankSwotForm(): GovernanceSwotBody {
  return {
    domain: "sgq",
    matrixLabel: "SWOT SGI",
    swotType: "strength",
    environment: "internal",
    perspective: "",
    description: "",
    performance: null,
    relevance: null,
    result: null,
    treatmentDecision: "",
    linkedObjectiveCode: "",
    linkedObjectiveLabel: "",
    importedActionReference: "",
    notes: "",
    sortOrder: 0,
  };
}

function blankInterestedForm(): GovernanceInterestedPartyBody {
  return {
    name: "",
    expectedRequirements: "",
    roleInCompany: "",
    roleSummary: "",
    relevantToManagementSystem: true,
    legalRequirementApplicable: false,
    monitoringMethod: "",
    notes: "",
    sortOrder: 0,
  };
}

function blankObjectiveForm(): GovernanceObjectiveBody {
  return {
    code: "",
    systemDomain: "",
    description: "",
    notes: "",
    sortOrder: 0,
  };
}

function blankActionForm(): GovernanceActionBody & { unitIds: number[] } {
  return {
    title: "",
    description: "",
    swotItemId: null,
    objectiveId: null,
    responsibleUserId: null,
    dueDate: "",
    status: "pending",
    notes: "",
    sortOrder: 0,
    unitIds: [],
  };
}

export default function GovernanceDetailPage() {
  const params = useParams<{ id: string }>();
  const planId = Number(params.id);
  const { organization } = useAuth();
  const { canWriteModule, isOrgAdmin } = usePermissions();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const { data: plan, isLoading } = useGovernancePlan(orgId, planId);
  const updatePlanMutation = useUpdateGovernancePlan(orgId, planId);
  const importPlanMutation = useImportGovernancePlan(orgId, planId);
  const submitMutation = useGovernanceWorkflowAction(orgId, planId, "submit");
  const approveMutation = useGovernanceWorkflowAction(orgId, planId, "approve");
  const rejectMutation = useGovernanceWorkflowAction(orgId, planId, "reject");
  const reopenMutation = useGovernanceWorkflowAction(orgId, planId, "reopen");
  const swotCrud = useGovernanceCrudMutation<GovernanceSwotBody>(orgId, planId, "swot-items");
  const interestedCrud = useGovernanceCrudMutation<GovernanceInterestedPartyBody>(orgId, planId, "interested-parties");
  const objectiveCrud = useGovernanceCrudMutation<GovernanceObjectiveBody>(orgId, planId, "objectives");
  const actionCrud = useGovernanceCrudMutation<ReturnType<typeof blankActionForm>>(orgId, planId, "actions");
  const { data: units = [] } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });
  const { data: users = [] } = useListUserOptions(orgId!, {
    query: { queryKey: getListUserOptionsQueryKey(orgId!), enabled: !!orgId },
  });

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<GovernanceImportPreview | null>(null);
  const [swotDialogOpen, setSwotDialogOpen] = useState(false);
  const [swotEditing, setSwotEditing] = useState<GovernanceSwotItem | null>(null);
  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [partyEditing, setPartyEditing] = useState<GovernanceInterestedParty | null>(null);
  const [objectiveDialogOpen, setObjectiveDialogOpen] = useState(false);
  const [objectiveEditing, setObjectiveEditing] = useState<GovernanceObjective | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionEditing, setActionEditing] = useState<GovernanceAction | null>(null);
  const [swotDeletingId, setSwotDeletingId] = useState<number | null>(null);
  const [partyDeletingId, setPartyDeletingId] = useState<number | null>(null);
  const [objectiveDeletingId, setObjectiveDeletingId] = useState<number | null>(null);
  const [actionDeletingId, setActionDeletingId] = useState<number | null>(null);
  const planForm = useForm<GovernancePlanBody>({
    resolver: zodResolver(governancePlanSchema),
    defaultValues: {
      title: "",
      standards: [],
      executiveSummary: "",
      reviewFrequencyMonths: 12,
      nextReviewAt: "",
      reviewReason: "",
      climateChangeRelevant: null,
      climateChangeJustification: "",
      technicalScope: "",
      geographicScope: "",
      policy: "",
      mission: "",
      vision: "",
      values: "",
      strategicConclusion: "",
      methodologyNotes: "",
      legacyMethodology: "",
      legacyIndicatorsNotes: "",
      legacyRevisionHistory: [],
      importedWorkbookName: "",
    },
  });
  const swotForm = useForm<GovernanceSwotBody>({
    resolver: zodResolver(governanceSwotSchema),
    defaultValues: blankSwotForm(),
  });
  const partyForm = useForm<GovernanceInterestedPartyBody>({
    resolver: zodResolver(governanceInterestedPartySchema),
    defaultValues: blankInterestedForm(),
  });
  const objectiveForm = useForm<GovernanceObjectiveBody>({
    resolver: zodResolver(governanceObjectiveSchema),
    defaultValues: blankObjectiveForm(),
  });
  const actionForm = useForm<GovernanceActionBody & { unitIds: number[] }>({
    resolver: zodResolver(governanceActionSchema),
    defaultValues: blankActionForm(),
  });
  const canEdit = canWriteModule("governance") && !!plan && ["draft", "rejected"].includes(plan.status);
  const actionUnitIds = actionForm.watch("unitIds");

  usePageTitle(plan?.title || "Planejamento Estratégico");
  usePageSubtitle(plan ? `Status ${GOVERNANCE_STATUS_LABELS[plan.status] || plan.status} • revisão ativa R${plan.activeRevisionNumber}` : undefined);

  useEffect(() => {
    if (plan) {
      planForm.reset({
        title: plan.title,
        standards: plan.standards,
        executiveSummary: plan.executiveSummary || "",
        reviewFrequencyMonths: plan.reviewFrequencyMonths,
        nextReviewAt: isoToDateInput(plan.nextReviewAt),
        reviewReason: plan.reviewReason || "",
        climateChangeRelevant: plan.climateChangeRelevant ?? null,
        climateChangeJustification: plan.climateChangeJustification || "",
        technicalScope: plan.technicalScope || "",
        geographicScope: plan.geographicScope || "",
        policy: plan.policy || "",
        mission: plan.mission || "",
        vision: plan.vision || "",
        values: plan.values || "",
        strategicConclusion: plan.strategicConclusion || "",
        methodologyNotes: plan.methodologyNotes || "",
        legacyMethodology: plan.legacyMethodology || "",
        legacyIndicatorsNotes: plan.legacyIndicatorsNotes || "",
        legacyRevisionHistory: plan.legacyRevisionHistory || [],
        importedWorkbookName: plan.importedWorkbookName || "",
      });
    }
  }, [plan, planForm]);

  const openSwotDialog = (item?: GovernanceSwotItem) => {
    setSwotEditing(item || null);
    swotForm.reset(item ? { ...item } : blankSwotForm());
    setSwotDialogOpen(true);
  };

  const openPartyDialog = (item?: GovernanceInterestedParty) => {
    setPartyEditing(item || null);
    partyForm.reset(item ? { ...item } : blankInterestedForm());
    setPartyDialogOpen(true);
  };

  const openObjectiveDialog = (item?: GovernanceObjective) => {
    setObjectiveEditing(item || null);
    objectiveForm.reset(item ? { ...item } : blankObjectiveForm());
    setObjectiveDialogOpen(true);
  };

  const openActionDialog = (item?: GovernanceAction) => {
    setActionEditing(item || null);
    actionForm.reset(
      item
        ? {
            title: item.title,
            description: item.description || "",
            swotItemId: item.swotItemId || null,
            objectiveId: item.objectiveId || null,
            responsibleUserId: item.responsibleUserId || null,
            dueDate: isoToDateInput(item.dueDate),
            status: item.status,
            notes: item.notes || "",
            sortOrder: item.sortOrder,
            unitIds: item.units.map((unit) => unit.id),
          }
        : blankActionForm(),
    );
    setActionDialogOpen(true);
  };

  const handleSavePlan = planForm.handleSubmit(async (values) => {
    try {
      await updatePlanMutation.mutateAsync({
        ...values,
        nextReviewAt: values.nextReviewAt ? dateToIso(values.nextReviewAt) : null,
        importedWorkbookName: values.importedWorkbookName || null,
      });
      toast({ title: "Plano atualizado", description: "As informações principais foram salvas." });
    } catch (error) {
      toast({
        title: "Falha ao salvar plano",
        description: error instanceof Error ? error.message : "Não foi possível salvar o plano.",
      });
    }
  });

  const handleWorkflow = async (kind: "submit" | "approve" | "reject" | "reopen") => {
    const currentPlanForm = planForm.getValues();
    try {
      if (kind === "submit") {
        await submitMutation.mutateAsync({});
      } else if (kind === "approve") {
        await approveMutation.mutateAsync({
          reviewReason: currentPlanForm.reviewReason || plan?.reviewReason || null,
          changeSummary: "Aprovação do planejamento estratégico.",
        });
      } else if (kind === "reject") {
        await rejectMutation.mutateAsync({
          reviewReason: currentPlanForm.reviewReason || plan?.reviewReason || null,
          changeSummary: "Rejeição para ajustes.",
        });
      } else {
        await reopenMutation.mutateAsync({});
      }
      toast({ title: "Workflow atualizado", description: "O estado do planejamento foi atualizado." });
    } catch (error) {
      toast({
        title: "Falha no workflow",
        description: error instanceof Error ? error.message : "Não foi possível atualizar o workflow.",
      });
    }
  };

  const handleOpenEvidence = async () => {
    if (!orgId || !plan) return;
    try {
      const exportInfo = await fetchGovernanceExport(orgId, plan.id);
      window.open(resolveApiUrl(`/api/storage${exportInfo.objectPath}`), "_blank");
    } catch (error) {
      toast({
        title: "Evidência indisponível",
        description: error instanceof Error ? error.message : "Nenhuma evidência formal foi encontrada.",
      });
    }
  };

  const handleWorkbookSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setImportPreview(await parseGovernanceWorkbook(file));
    } catch (error) {
      toast({
        title: "Falha ao ler planilha",
        description: error instanceof Error ? error.message : "O arquivo não pôde ser processado.",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleImportWorkbook = async () => {
    if (!importPreview) return;
    try {
      await importPlanMutation.mutateAsync(importPreview.payload as GovernanceImportPayload);
      setImportOpen(false);
      setImportPreview(null);
      toast({ title: "Planilha importada", description: "O rascunho foi sobrescrito com os dados do arquivo." });
    } catch (error) {
      toast({
        title: "Falha ao importar planilha",
        description: error instanceof Error ? error.message : "Não foi possível sobrescrever o rascunho.",
      });
    }
  };

  const saveSwot = swotForm.handleSubmit(async (values) => {
    const payload = {
      ...values,
      matrixLabel: values.matrixLabel || null,
      perspective: values.perspective || null,
      performance: values.performance != null ? Number(values.performance) : null,
      relevance: values.relevance != null ? Number(values.relevance) : null,
      result: values.result != null ? Number(values.result) : null,
      treatmentDecision: values.treatmentDecision || null,
      linkedObjectiveCode: values.linkedObjectiveCode || null,
      linkedObjectiveLabel: values.linkedObjectiveLabel || null,
      importedActionReference: values.importedActionReference || null,
      notes: values.notes || null,
    };
    try {
      if (swotEditing) {
        await swotCrud.updateMutation.mutateAsync({ id: swotEditing.id, body: payload });
      } else {
        await swotCrud.createMutation.mutateAsync(payload);
      }
      swotForm.reset(blankSwotForm());
      setSwotDialogOpen(false);
    } catch (error) {
      toast({ title: "Falha ao salvar item SWOT", description: error instanceof Error ? error.message : "Erro ao salvar." });
    }
  });

  const saveParty = partyForm.handleSubmit(async (values) => {
    try {
      if (partyEditing) {
        await interestedCrud.updateMutation.mutateAsync({ id: partyEditing.id, body: values });
      } else {
        await interestedCrud.createMutation.mutateAsync(values);
      }
      partyForm.reset(blankInterestedForm());
      setPartyDialogOpen(false);
    } catch (error) {
      toast({ title: "Falha ao salvar parte interessada", description: error instanceof Error ? error.message : "Erro ao salvar." });
    }
  });

  const saveObjective = objectiveForm.handleSubmit(async (values) => {
    try {
      if (objectiveEditing) {
        await objectiveCrud.updateMutation.mutateAsync({ id: objectiveEditing.id, body: values });
      } else {
        await objectiveCrud.createMutation.mutateAsync(values);
      }
      objectiveForm.reset(blankObjectiveForm());
      setObjectiveDialogOpen(false);
    } catch (error) {
      toast({ title: "Falha ao salvar objetivo", description: error instanceof Error ? error.message : "Erro ao salvar." });
    }
  });

  const saveAction = actionForm.handleSubmit(async (values) => {
    const payload = {
      ...values,
      dueDate: values.dueDate ? dateToIso(values.dueDate) : null,
      description: values.description || null,
      notes: values.notes || null,
      swotItemId: values.swotItemId || null,
      objectiveId: values.objectiveId || null,
      responsibleUserId: values.responsibleUserId || null,
    };
    try {
      if (actionEditing) {
        await actionCrud.updateMutation.mutateAsync({ id: actionEditing.id, body: payload });
      } else {
        await actionCrud.createMutation.mutateAsync(payload);
      }
      actionForm.reset(blankActionForm());
      setActionDialogOpen(false);
    } catch (error) {
      toast({ title: "Falha ao salvar ação", description: error instanceof Error ? error.message : "Erro ao salvar." });
    }
  });

  const deleteSwot = async (itemId: number) => {
    setSwotDeletingId(itemId);
    try {
      await swotCrud.deleteMutation.mutateAsync(itemId);
    } catch (error) {
      toast({
        title: "Falha ao excluir item SWOT",
        description: error instanceof Error ? error.message : "Erro ao excluir.",
      });
    } finally {
      setSwotDeletingId(null);
    }
  };

  const deleteInterestedParty = async (itemId: number) => {
    setPartyDeletingId(itemId);
    try {
      await interestedCrud.deleteMutation.mutateAsync(itemId);
    } catch (error) {
      toast({
        title: "Falha ao excluir parte interessada",
        description: error instanceof Error ? error.message : "Erro ao excluir.",
      });
    } finally {
      setPartyDeletingId(null);
    }
  };

  const deleteObjective = async (itemId: number) => {
    setObjectiveDeletingId(itemId);
    try {
      await objectiveCrud.deleteMutation.mutateAsync(itemId);
    } catch (error) {
      toast({
        title: "Falha ao excluir objetivo",
        description: error instanceof Error ? error.message : "Erro ao excluir.",
      });
    } finally {
      setObjectiveDeletingId(null);
    }
  };

  const deleteAction = async (itemId: number) => {
    setActionDeletingId(itemId);
    try {
      await actionCrud.deleteMutation.mutateAsync(itemId);
    } catch (error) {
      toast({
        title: "Falha ao excluir ação",
        description: error instanceof Error ? error.message : "Erro ao excluir.",
      });
    } finally {
      setActionDeletingId(null);
    }
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "Visão Geral" },
    { key: "swot", label: "SWOT" },
    { key: "interested", label: "Partes Interessadas" },
    { key: "scope", label: "Escopo e Direcionamento" },
    { key: "objectives", label: "Objetivos" },
    { key: "actions", label: "Ações" },
    { key: "revisions", label: "Revisões e Evidências" },
  ];

  const tabIssues = useMemo(() => {
    const issues = plan?.complianceIssues || [];
    const map: Partial<Record<Tab, string[]>> = {};
    for (const issue of issues) {
      if (issue.includes("SWOT")) {
        map.swot = [...(map.swot || []), issue];
      } else if (issue.includes("partes interessadas")) {
        map.interested = [...(map.interested || []), issue];
      } else if (issue.includes("objetivos estratégicos")) {
        map.objectives = [...(map.objectives || []), issue];
      } else if (issue.includes("ação sem ação vinculada")) {
        map.actions = [...(map.actions || []), issue];
      } else {
        map.overview = [...(map.overview || []), issue];
      }
    }
    return map;
  }, [plan?.complianceIssues]);

  const latestEvidenceDocumentId = plan?.revisions?.[0]?.evidenceDocumentId;

  useHeaderActions(
    <div className="flex items-center gap-2">
      {canEdit && (
        <>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            Reimportar
          </Button>
          <Button size="sm" variant="outline" onClick={handleSavePlan} isLoading={updatePlanMutation.isPending}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Salvar
          </Button>
          <Button size="sm" onClick={() => handleWorkflow("submit")} isLoading={submitMutation.isPending}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Enviar para revisão
          </Button>
        </>
      )}
      {plan?.status === "in_review" && isOrgAdmin && (
        <>
          <Button size="sm" variant="outline" onClick={() => handleWorkflow("reject")} isLoading={rejectMutation.isPending}>
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Rejeitar
          </Button>
          <Button size="sm" onClick={() => handleWorkflow("approve")} isLoading={approveMutation.isPending}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Aprovar
          </Button>
        </>
      )}
      {plan && ["approved", "overdue", "rejected"].includes(plan.status) && isOrgAdmin && (
        <Button size="sm" variant="outline" onClick={() => handleWorkflow("reopen")} isLoading={reopenMutation.isPending}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reabrir rascunho
        </Button>
      )}
      {latestEvidenceDocumentId && (
        <Button size="sm" variant="outline" onClick={handleOpenEvidence}>
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          Abrir evidência
        </Button>
      )}
    </div>,
  );

  if (isLoading || !plan) {
    return <div className="px-6 py-6 text-sm text-muted-foreground">Carregando planejamento estratégico...</div>;
  }

  return (
    <div className="px-6 py-6 space-y-8">
      <nav className="flex items-center gap-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "relative pb-2.5 text-[13px] font-medium transition-colors duration-200 cursor-pointer hover:text-foreground inline-flex items-center gap-1.5",
              activeTab === tab.key
                ? "text-foreground font-semibold after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-foreground after:rounded-full"
                : "text-muted-foreground"
            )}
          >
            {tab.label}
            {tabIssues[tab.key] && (
              <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
            )}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div className="space-y-10">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">Informações do Plano</h3>
            {canEdit ? (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Label>Título</Label>
                  <Input {...planForm.register("title")} />
                </div>
                <div>
                  <Label>Normas</Label>
                  <Controller
                    control={planForm.control}
                    name="standards"
                    render={({ field }) => (
                      <Input
                        value={(field.value || []).join(", ")}
                        onChange={(event) =>
                          field.onChange(
                            event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean),
                          )
                        }
                      />
                    )}
                  />
                </div>
                <div className="col-span-3">
                  <Label>Resumo executivo</Label>
                  <Textarea rows={4} {...planForm.register("executiveSummary")} />
                </div>
                <div>
                  <Label>Frequência de revisão (meses)</Label>
                  <Input
                    type="number"
                    {...planForm.register("reviewFrequencyMonths", {
                      setValueAs: (value) => (value === "" ? 12 : Number(value)),
                    })}
                  />
                </div>
                <div>
                  <Label>Próxima revisão</Label>
                  <Input type="date" {...planForm.register("nextReviewAt")} />
                </div>
                <div>
                  <Label>Motivo da revisão</Label>
                  <Input {...planForm.register("reviewReason")} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Título</p>
                  <p className="text-[14px] text-foreground">{plan.title}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Normas</p>
                  <p className="text-[14px] text-foreground">{(plan.standards || []).join(", ") || "—"}</p>
                </div>
                <div className="col-span-3">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Resumo Executivo</p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">{plan.executiveSummary || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Frequência de Revisão</p>
                  <p className="text-[14px] text-foreground">{plan.reviewFrequencyMonths} meses</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Próxima Revisão</p>
                  <p className="text-[14px] text-foreground">{formatGovernanceDate(plan.nextReviewAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Motivo da Revisão</p>
                  <p className="text-[14px] text-foreground">{plan.reviewReason || "—"}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">Mudança Climática</h3>
            {canEdit ? (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Relevância</Label>
                  <Controller
                    control={planForm.control}
                    name="climateChangeRelevant"
                    render={({ field }) => (
                      <Select
                        value={
                          field.value === null ? "" : field.value ? "sim" : "nao"
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value === "" ? null : value === "sim");
                        }}
                      >
                        <option value="">Não avaliado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </Select>
                    )}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Justificativa</Label>
                  <Textarea rows={3} {...planForm.register("climateChangeJustification")} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Relevância</p>
                  <p className="text-[14px] text-foreground">
                    {plan.climateChangeRelevant === null ? "Não avaliado" : plan.climateChangeRelevant ? "Sim" : "Não"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Justificativa</p>
                  <p className="text-[14px] text-foreground">{plan.climateChangeJustification || "—"}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">Métricas</h3>
            <div className="grid grid-cols-4 gap-x-8 gap-y-6">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Itens SWOT</p>
                <p className="text-2xl font-semibold text-foreground">{plan.metrics.swotCount}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Partes Interessadas</p>
                <p className="text-2xl font-semibold text-foreground">{plan.metrics.interestedPartyCount}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Objetivos</p>
                <p className="text-2xl font-semibold text-foreground">{plan.metrics.objectiveCount}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Ações Abertas</p>
                <p className="text-2xl font-semibold text-foreground">{plan.metrics.openActionCount}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">Evidência Formal</h3>
            {latestEvidenceDocumentId ? (
              <p className="text-[14px] text-foreground">Última evidência vinculada ao documento #{latestEvidenceDocumentId}.</p>
            ) : (
              <p className="text-[14px] text-muted-foreground">A evidência PDF será gerada automaticamente na aprovação.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "scope" && (
        <div className="space-y-10">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">Escopo</h3>
            {canEdit ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Escopo técnico</Label>
                  <Textarea rows={3} {...planForm.register("technicalScope")} />
                </div>
                <div>
                  <Label>Escopo geográfico</Label>
                  <Textarea rows={3} {...planForm.register("geographicScope")} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Escopo Técnico</p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">{plan.technicalScope || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Escopo Geográfico</p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">{plan.geographicScope || "—"}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">Direcionamento Estratégico</h3>
            {canEdit ? (
              <div className="grid gap-4">
                <div>
                  <Label>Política</Label>
                  <Textarea rows={4} {...planForm.register("policy")} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Missão</Label>
                    <Textarea rows={3} {...planForm.register("mission")} />
                  </div>
                  <div>
                    <Label>Visão</Label>
                    <Textarea rows={3} {...planForm.register("vision")} />
                  </div>
                </div>
                <div>
                  <Label>Valores</Label>
                  <Textarea rows={5} {...planForm.register("values")} />
                </div>
                <div>
                  <Label>Conclusão estratégica</Label>
                  <Textarea rows={3} {...planForm.register("strategicConclusion")} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Política</p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">{plan.policy || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Missão</p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">{plan.mission || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Visão</p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">{plan.vision || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Valores</p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">{plan.values || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">Conclusão Estratégica</p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">{plan.strategicConclusion || "—"}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "swot" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">Matriz SWOT</h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">Itens de contexto interno e externo com decisão de tratamento.</p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => openSwotDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Novo item
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">Domínio</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">Tipo</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">Descrição</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">Resultado</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">Tratamento</th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">Objetivo</th>
                  {canEdit && <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]"></th>}
                </tr>
              </thead>
              <tbody>
                {plan.swotItems.map((item) => (
                  <tr key={item.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3 text-foreground">{item.domain.toUpperCase()}</td>
                    <td className="px-3 py-3 text-foreground">{item.swotType}</td>
                    <td className="px-3 py-3 text-foreground">{item.description}</td>
                    <td className="px-3 py-3 text-foreground">{item.result ?? "—"}</td>
                    <td className="px-3 py-3 text-foreground">{item.treatmentDecision || "—"}</td>
                    <td className="px-3 py-3 text-foreground">{item.linkedObjectiveLabel || item.linkedObjectiveCode || "—"}</td>
                    {canEdit && (
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => openSwotDialog(item)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteSwot(item.id)}
                            disabled={swotDeletingId === item.id}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {swotDeletingId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.swotItems.length === 0 && (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Nenhum item SWOT cadastrado.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "interested" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">Partes Interessadas</h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">Requisitos relevantes ao contexto do sistema de gestão.</p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => openPartyDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nova parte
              </Button>
            )}
          </div>
          <div className="space-y-px">
            {plan.interestedParties.map((item) => (
              <div key={item.id} className="group flex items-start justify-between gap-4 py-4 border-b border-border/40">
                <div>
                  <h4 className="text-[14px] font-medium text-foreground">{item.name}</h4>
                  <p className="mt-1 text-[13px] text-muted-foreground">{item.expectedRequirements || "Sem requisitos descritos."}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => openPartyDialog(item)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteInterestedParty(item.id)}
                      disabled={partyDeletingId === item.id}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {partyDeletingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {plan.interestedParties.length === 0 && (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Nenhuma parte interessada cadastrada.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "objectives" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">Objetivos Estratégicos</h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">Objetivos vinculados ao contexto e aos desdobramentos do plano.</p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => openObjectiveDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Novo objetivo
              </Button>
            )}
          </div>
          <div className="space-y-px">
            {plan.objectives.map((item) => (
              <div key={item.id} className="group flex items-start justify-between gap-4 py-4 border-b border-border/40">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[12px] font-medium text-foreground">{item.code}</span>
                    <span className="text-[13px] text-muted-foreground">{item.systemDomain || "Sem sistema"}</span>
                  </div>
                  <h4 className="mt-2 text-[14px] font-medium text-foreground">{item.description}</h4>
                  {item.notes && <p className="mt-1 text-[13px] text-muted-foreground">{item.notes}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => openObjectiveDialog(item)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteObjective(item.id)}
                      disabled={objectiveDeletingId === item.id}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {objectiveDeletingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {plan.objectives.length === 0 && (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Nenhum objetivo cadastrado.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "actions" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">Ações</h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">Desdobramentos por unidade, responsáveis e prazos.</p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => openActionDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nova ação
              </Button>
            )}
          </div>
          <div className="space-y-px">
            {plan.actions.map((item) => (
              <div key={item.id} className="group flex items-start justify-between gap-4 py-4 border-b border-border/40">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[12px] font-medium text-foreground">{item.status}</span>
                    <span className="text-[13px] text-muted-foreground">Prazo: {formatGovernanceDate(item.dueDate)}</span>
                  </div>
                  <h4 className="mt-2 text-[14px] font-medium text-foreground">{item.title}</h4>
                  <p className="mt-1 text-[13px] text-muted-foreground">{item.description || "Sem descrição."}</p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    Responsável: {item.responsibleUserName || "Não definido"} · Unidades: {item.units.map((unit) => unit.name).join(", ") || "Nenhuma"}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => openActionDialog(item)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteAction(item.id)}
                      disabled={actionDeletingId === item.id}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionDeletingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {plan.actions.length === 0 && (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Nenhuma ação cadastrada.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "revisions" && (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">Revisões e Evidências</h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">Histórico formal de aprovação, snapshots e evidência documental.</p>
          </div>

          <div className="space-y-px">
            {plan.revisions.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Nenhuma revisão aprovada ainda.</p>
            ) : (
              plan.revisions.map((revision) => (
                <div key={revision.id} className="flex items-center justify-between gap-4 py-4 border-b border-border/40">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[12px] font-medium text-foreground">R{revision.revisionNumber}</span>
                      <span className="text-[13px] text-muted-foreground">{formatGovernanceDate(revision.revisionDate, true)}</span>
                    </div>
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      Motivo: {revision.reason || "—"} · Aprovado por: {revision.approvedByName || "—"}
                    </p>
                    {revision.changeSummary && <p className="mt-1 text-[13px] text-muted-foreground">{revision.changeSummary}</p>}
                  </div>
                  {revision.evidenceDocumentId && (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/qualidade/documentacao/${revision.evidenceDocumentId}`)}>
                      Ver documento
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen} title="Reimportar planilha" description="Sobrescreve o rascunho atual com os dados do arquivo." size="lg">
        <div className="space-y-4">
          <Input type="file" accept=".xlsx,.xls" onChange={handleWorkbookSelect} />
          {importPreview && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">SWOT</p>
                  <p className="mt-1 text-lg font-semibold">{importPreview.swotCount}</p>
                </div>
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Partes</p>
                  <p className="mt-1 text-lg font-semibold">{importPreview.interestedPartyCount}</p>
                </div>
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Objetivos</p>
                  <p className="mt-1 text-lg font-semibold">{importPreview.objectiveCount}</p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
                  {(importPreview.anomalies.length > 0 ? importPreview.anomalies : ["Nenhuma anomalia detectada na leitura inicial."]).map((issue, index) => (
                    <li key={`${index}-${issue}`}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
          <Button onClick={handleImportWorkbook} disabled={!importPreview} isLoading={importPlanMutation.isPending}>Sobrescrever rascunho</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={swotDialogOpen} onOpenChange={setSwotDialogOpen} title={swotEditing ? "Editar item SWOT" : "Novo item SWOT"} size="lg">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Domínio</Label>
            <Select {...swotForm.register("domain")}>
              <option value="sgq">SGQ</option>
              <option value="sga">SGA</option>
              <option value="sgsv">SGSV</option>
              <option value="esg">ESG</option>
              <option value="governance">Governança</option>
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select {...swotForm.register("swotType")}>
              <option value="strength">Força</option>
              <option value="weakness">Fraqueza</option>
              <option value="opportunity">Oportunidade</option>
              <option value="threat">Ameaça</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea rows={3} {...swotForm.register("description")} />
          </div>
          <div>
            <Label>Resultado</Label>
            <Input
              type="number"
              {...swotForm.register("result", {
                setValueAs: (value) => (value === "" || value == null ? null : Number(value)),
              })}
            />
          </div>
          <div>
            <Label>Decisão de tratamento</Label>
            <Input {...swotForm.register("treatmentDecision")} />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              swotForm.reset(blankSwotForm());
              setSwotDialogOpen(false);
            }}
          >
            Cancelar
          </Button>
          <Button onClick={saveSwot} isLoading={swotCrud.createMutation.isPending || swotCrud.updateMutation.isPending}>Salvar</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={partyDialogOpen} onOpenChange={setPartyDialogOpen} title={partyEditing ? "Editar parte interessada" : "Nova parte interessada"} size="lg">
        <div className="grid gap-4">
          <div>
            <Label>Nome</Label>
            <Input {...partyForm.register("name")} />
          </div>
          <div>
            <Label>Requisitos esperados</Label>
            <Textarea rows={3} {...partyForm.register("expectedRequirements")} />
          </div>
          <div>
            <Label>Forma de monitoramento</Label>
            <Textarea rows={3} {...partyForm.register("monitoringMethod")} />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              partyForm.reset(blankInterestedForm());
              setPartyDialogOpen(false);
            }}
          >
            Cancelar
          </Button>
          <Button onClick={saveParty} isLoading={interestedCrud.createMutation.isPending || interestedCrud.updateMutation.isPending}>Salvar</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={objectiveDialogOpen} onOpenChange={setObjectiveDialogOpen} title={objectiveEditing ? "Editar objetivo" : "Novo objetivo"} size="lg">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Código</Label>
              <Input {...objectiveForm.register("code")} />
            </div>
            <div>
              <Label>Sistema</Label>
              <Input {...objectiveForm.register("systemDomain")} />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={3} {...objectiveForm.register("description")} />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea rows={3} {...objectiveForm.register("notes")} />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              objectiveForm.reset(blankObjectiveForm());
              setObjectiveDialogOpen(false);
            }}
          >
            Cancelar
          </Button>
          <Button onClick={saveObjective} isLoading={objectiveCrud.createMutation.isPending || objectiveCrud.updateMutation.isPending}>Salvar</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen} title={actionEditing ? "Editar ação" : "Nova ação"} size="lg">
        <div className="grid gap-4">
          <div>
            <Label>Título</Label>
            <Input {...actionForm.register("title")} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={3} {...actionForm.register("description")} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Responsável</Label>
              <Select
                {...actionForm.register("responsibleUserId", {
                  setValueAs: (value) => (value === "" || value == null ? null : Number(value)),
                })}
              >
                <option value="">Não definido</option>
                {users.map((user: UserOption) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Prazo</Label>
              <Input type="date" {...actionForm.register("dueDate")} />
            </div>
            <div>
              <Label>Status</Label>
              <Select {...actionForm.register("status")}>
                <option value="pending">Pendente</option>
                <option value="in_progress">Em andamento</option>
                <option value="done">Concluída</option>
                <option value="canceled">Cancelada</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Item SWOT vinculado</Label>
              <Select
                {...actionForm.register("swotItemId", {
                  setValueAs: (value) => (value === "" || value == null ? null : Number(value)),
                })}
              >
                <option value="">Sem vínculo</option>
                {plan.swotItems.map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}
              </Select>
            </div>
            <div>
              <Label>Objetivo vinculado</Label>
              <Select
                {...actionForm.register("objectiveId", {
                  setValueAs: (value) => (value === "" || value == null ? null : Number(value)),
                })}
              >
                <option value="">Sem vínculo</option>
                {plan.objectives.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.description}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label>Unidades impactadas</Label>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {units.map((unit) => (
                <label key={unit.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={actionUnitIds.includes(unit.id)}
                    onChange={(event) =>
                      actionForm.setValue(
                        "unitIds",
                        event.target.checked
                          ? [...actionUnitIds, unit.id]
                          : actionUnitIds.filter((id) => id !== unit.id),
                        { shouldDirty: true },
                      )
                    }
                  />
                  <span>{unit.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              actionForm.reset(blankActionForm());
              setActionDialogOpen(false);
            }}
          >
            Cancelar
          </Button>
          <Button onClick={saveAction} isLoading={actionCrud.createMutation.isPending || actionCrud.updateMutation.isPending}>Salvar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
