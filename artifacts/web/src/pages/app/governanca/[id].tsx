import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useListUnits, useListUserOptions, getListUnitsQueryKey, getListUserOptionsQueryKey, type UserOption } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  type GovernanceObjective,
  type GovernancePlanBody,
  type GovernanceSwotItem,
} from "@/lib/governance-api";
import { parseGovernanceWorkbook, type GovernanceImportPreview } from "@/lib/governance-import";
import { resolveApiUrl } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, FileText, Pencil, Plus, RotateCcw, Send, ShieldAlert, Trash2, XCircle } from "lucide-react";

type Tab = "overview" | "swot" | "interested" | "scope" | "objectives" | "actions" | "revisions";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  overdue: "Vencido",
  archived: "Arquivado",
};

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" });
  } catch {
    return value;
  }
}

function dateToIso(date: string) {
  return date ? new Date(`${date}T00:00:00`).toISOString() : null;
}

function isoToDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function blankSwotForm(): Omit<GovernanceSwotItem, "id"> {
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

function blankInterestedForm(): Omit<GovernanceInterestedParty, "id"> {
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

function blankObjectiveForm(): Omit<GovernanceObjective, "id"> {
  return {
    code: "",
    systemDomain: "",
    description: "",
    notes: "",
    sortOrder: 0,
  };
}

function blankActionForm(): {
  title: string;
  description?: string | null;
  swotItemId?: number | null;
  objectiveId?: number | null;
  responsibleUserId?: number | null;
  dueDate?: string | null;
  status: GovernanceAction["status"];
  notes?: string | null;
  sortOrder?: number;
  unitIds: number[];
} {
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
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: plan, isLoading } = useGovernancePlan(orgId, planId);
  const updatePlanMutation = useUpdateGovernancePlan(orgId, planId);
  const importPlanMutation = useImportGovernancePlan(orgId, planId);
  const submitMutation = useGovernanceWorkflowAction(orgId, planId, "submit");
  const approveMutation = useGovernanceWorkflowAction(orgId, planId, "approve");
  const rejectMutation = useGovernanceWorkflowAction(orgId, planId, "reject");
  const reopenMutation = useGovernanceWorkflowAction(orgId, planId, "reopen");
  const swotCrud = useGovernanceCrudMutation<Omit<GovernanceSwotItem, "id">>(orgId, planId, "swot-items");
  const interestedCrud = useGovernanceCrudMutation<Omit<GovernanceInterestedParty, "id">>(orgId, planId, "interested-parties");
  const objectiveCrud = useGovernanceCrudMutation<Omit<GovernanceObjective, "id">>(orgId, planId, "objectives");
  const actionCrud = useGovernanceCrudMutation<ReturnType<typeof blankActionForm>>(orgId, planId, "actions");
  const { data: units = [] } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });
  const { data: users = [] } = useListUserOptions(orgId!, {
    query: { queryKey: getListUserOptionsQueryKey(orgId!), enabled: !!orgId },
  });

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [planForm, setPlanForm] = useState<GovernancePlanBody | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<GovernanceImportPreview | null>(null);
  const [swotDialogOpen, setSwotDialogOpen] = useState(false);
  const [swotEditing, setSwotEditing] = useState<GovernanceSwotItem | null>(null);
  const [swotForm, setSwotForm] = useState(blankSwotForm());
  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [partyEditing, setPartyEditing] = useState<GovernanceInterestedParty | null>(null);
  const [partyForm, setPartyForm] = useState(blankInterestedForm());
  const [objectiveDialogOpen, setObjectiveDialogOpen] = useState(false);
  const [objectiveEditing, setObjectiveEditing] = useState<GovernanceObjective | null>(null);
  const [objectiveForm, setObjectiveForm] = useState(blankObjectiveForm());
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionEditing, setActionEditing] = useState<GovernanceAction | null>(null);
  const [actionForm, setActionForm] = useState(blankActionForm());
  const canEdit = canWriteModule("governance") && !!plan && ["draft", "rejected"].includes(plan.status);

  usePageTitle(plan?.title || "Planejamento Estratégico");
  usePageSubtitle(plan ? `Status ${STATUS_LABELS[plan.status] || plan.status} • revisão ativa R${plan.activeRevisionNumber}` : undefined);

  useEffect(() => {
    if (plan) {
      setPlanForm({
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
  }, [plan]);

  const openSwotDialog = (item?: GovernanceSwotItem) => {
    setSwotEditing(item || null);
    setSwotForm(item ? { ...item } : blankSwotForm());
    setSwotDialogOpen(true);
  };

  const openPartyDialog = (item?: GovernanceInterestedParty) => {
    setPartyEditing(item || null);
    setPartyForm(item ? { ...item } : blankInterestedForm());
    setPartyDialogOpen(true);
  };

  const openObjectiveDialog = (item?: GovernanceObjective) => {
    setObjectiveEditing(item || null);
    setObjectiveForm(item ? { ...item } : blankObjectiveForm());
    setObjectiveDialogOpen(true);
  };

  const openActionDialog = (item?: GovernanceAction) => {
    setActionEditing(item || null);
    setActionForm(
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

  const handleSavePlan = async () => {
    if (!planForm) return;
    try {
      await updatePlanMutation.mutateAsync({
        ...planForm,
        nextReviewAt: planForm.nextReviewAt ? dateToIso(planForm.nextReviewAt) : null,
        importedWorkbookName: planForm.importedWorkbookName || null,
      });
      toast({ title: "Plano atualizado", description: "As informações principais foram salvas." });
    } catch (error) {
      toast({
        title: "Falha ao salvar plano",
        description: error instanceof Error ? error.message : "Não foi possível salvar o plano.",
      });
    }
  };

  const handleWorkflow = async (kind: "submit" | "approve" | "reject" | "reopen") => {
    try {
      if (kind === "submit") {
        await submitMutation.mutateAsync({});
      } else if (kind === "approve") {
        await approveMutation.mutateAsync({
          reviewReason: planForm?.reviewReason || plan?.reviewReason || null,
          changeSummary: "Aprovação do planejamento estratégico.",
        });
      } else if (kind === "reject") {
        await rejectMutation.mutateAsync({
          reviewReason: planForm?.reviewReason || plan?.reviewReason || null,
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

  const saveSwot = async () => {
    const payload = {
      ...swotForm,
      matrixLabel: swotForm.matrixLabel || null,
      perspective: swotForm.perspective || null,
      performance: swotForm.performance ? Number(swotForm.performance) : null,
      relevance: swotForm.relevance ? Number(swotForm.relevance) : null,
      result: swotForm.result ? Number(swotForm.result) : null,
      treatmentDecision: swotForm.treatmentDecision || null,
      linkedObjectiveCode: swotForm.linkedObjectiveCode || null,
      linkedObjectiveLabel: swotForm.linkedObjectiveLabel || null,
      importedActionReference: swotForm.importedActionReference || null,
      notes: swotForm.notes || null,
    };
    try {
      if (swotEditing) {
        await swotCrud.updateMutation.mutateAsync({ id: swotEditing.id, body: payload });
      } else {
        await swotCrud.createMutation.mutateAsync(payload);
      }
      setSwotDialogOpen(false);
    } catch (error) {
      toast({ title: "Falha ao salvar item SWOT", description: error instanceof Error ? error.message : "Erro ao salvar." });
    }
  };

  const saveParty = async () => {
    try {
      if (partyEditing) {
        await interestedCrud.updateMutation.mutateAsync({ id: partyEditing.id, body: partyForm });
      } else {
        await interestedCrud.createMutation.mutateAsync(partyForm);
      }
      setPartyDialogOpen(false);
    } catch (error) {
      toast({ title: "Falha ao salvar parte interessada", description: error instanceof Error ? error.message : "Erro ao salvar." });
    }
  };

  const saveObjective = async () => {
    try {
      if (objectiveEditing) {
        await objectiveCrud.updateMutation.mutateAsync({ id: objectiveEditing.id, body: objectiveForm });
      } else {
        await objectiveCrud.createMutation.mutateAsync(objectiveForm);
      }
      setObjectiveDialogOpen(false);
    } catch (error) {
      toast({ title: "Falha ao salvar objetivo", description: error instanceof Error ? error.message : "Erro ao salvar." });
    }
  };

  const saveAction = async () => {
    const payload = {
      ...actionForm,
      dueDate: actionForm.dueDate ? dateToIso(actionForm.dueDate) : null,
      description: actionForm.description || null,
      notes: actionForm.notes || null,
      swotItemId: actionForm.swotItemId || null,
      objectiveId: actionForm.objectiveId || null,
      responsibleUserId: actionForm.responsibleUserId || null,
    };
    try {
      if (actionEditing) {
        await actionCrud.updateMutation.mutateAsync({ id: actionEditing.id, body: payload });
      } else {
        await actionCrud.createMutation.mutateAsync(payload);
      }
      setActionDialogOpen(false);
    } catch (error) {
      toast({ title: "Falha ao salvar ação", description: error instanceof Error ? error.message : "Erro ao salvar." });
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

  if (isLoading || !plan || !planForm) {
    return <div className="px-6 py-6 text-sm text-muted-foreground">Carregando planejamento estratégico...</div>;
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/governanca/planejamento" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Governança
        </Link>
        <Badge variant="secondary">{STATUS_LABELS[plan.status] || plan.status}</Badge>
      </div>

      {plan.complianceIssues.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-700 mt-0.5" />
            <div>
              <p className="font-medium text-amber-950">Pendências de conformidade</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 space-y-1">
                {plan.complianceIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-border/60 pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${activeTab === tab.key ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
            <div>
              <Label>Título</Label>
              <Input value={planForm.title} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, title: event.target.value } : prev)} disabled={!canEdit} />
            </div>
            <div>
              <Label>Resumo executivo</Label>
              <Textarea value={planForm.executiveSummary || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, executiveSummary: event.target.value } : prev)} disabled={!canEdit} rows={4} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Frequência de revisão (meses)</Label>
                <Input type="number" value={planForm.reviewFrequencyMonths || 12} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, reviewFrequencyMonths: Number(event.target.value) } : prev)} disabled={!canEdit} />
              </div>
              <div>
                <Label>Próxima revisão</Label>
                <Input type="date" value={planForm.nextReviewAt || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, nextReviewAt: event.target.value } : prev)} disabled={!canEdit} />
              </div>
              <div>
                <Label>Normas</Label>
                <Input value={(planForm.standards || []).join(", ")} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, standards: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } : prev)} disabled={!canEdit} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Mudança climática relevante?</Label>
                <select
                  className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={planForm.climateChangeRelevant === null ? "" : planForm.climateChangeRelevant ? "sim" : "nao"}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPlanForm((prev) => prev ? { ...prev, climateChangeRelevant: value === "" ? null : value === "sim" } : prev);
                  }}
                  disabled={!canEdit}
                >
                  <option value="">Não avaliado</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
              <div>
                <Label>Motivo da revisão</Label>
                <Input value={planForm.reviewReason || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, reviewReason: event.target.value } : prev)} disabled={!canEdit} />
              </div>
            </div>
            <div>
              <Label>Justificativa de mudança climática</Label>
              <Textarea value={planForm.climateChangeJustification || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, climateChangeJustification: event.target.value } : prev)} disabled={!canEdit} rows={3} />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-muted/30 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Itens SWOT</p>
                <p className="mt-1 text-xl font-semibold">{plan.metrics.swotCount}</p>
              </div>
              <div className="rounded-xl bg-muted/30 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Partes interessadas</p>
                <p className="mt-1 text-xl font-semibold">{plan.metrics.interestedPartyCount}</p>
              </div>
              <div className="rounded-xl bg-muted/30 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Objetivos</p>
                <p className="mt-1 text-xl font-semibold">{plan.metrics.objectiveCount}</p>
              </div>
              <div className="rounded-xl bg-muted/30 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Ações abertas</p>
                <p className="mt-1 text-xl font-semibold">{plan.metrics.openActionCount}</p>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-sm font-medium">Evidência formal</p>
              {latestEvidenceDocumentId ? (
                <div className="mt-2 text-sm text-muted-foreground">
                  Última evidência vinculada ao documento #{latestEvidenceDocumentId}.
                </div>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">A evidência PDF será gerada automaticamente na aprovação.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "scope" && (
        <div className="grid gap-4 rounded-2xl border border-border/60 bg-card p-6">
          <div>
            <Label>Escopo técnico</Label>
            <Textarea value={planForm.technicalScope || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, technicalScope: event.target.value } : prev)} disabled={!canEdit} rows={3} />
          </div>
          <div>
            <Label>Escopo geográfico</Label>
            <Textarea value={planForm.geographicScope || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, geographicScope: event.target.value } : prev)} disabled={!canEdit} rows={3} />
          </div>
          <div>
            <Label>Política</Label>
            <Textarea value={planForm.policy || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, policy: event.target.value } : prev)} disabled={!canEdit} rows={4} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Missão</Label>
              <Textarea value={planForm.mission || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, mission: event.target.value } : prev)} disabled={!canEdit} rows={3} />
            </div>
            <div>
              <Label>Visão</Label>
              <Textarea value={planForm.vision || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, vision: event.target.value } : prev)} disabled={!canEdit} rows={3} />
            </div>
          </div>
          <div>
            <Label>Valores</Label>
            <Textarea value={planForm.values || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, values: event.target.value } : prev)} disabled={!canEdit} rows={5} />
          </div>
          <div>
            <Label>Conclusão estratégica</Label>
            <Textarea value={planForm.strategicConclusion || ""} onChange={(event) => setPlanForm((prev) => prev ? { ...prev, strategicConclusion: event.target.value } : prev)} disabled={!canEdit} rows={3} />
          </div>
        </div>
      )}

      {activeTab === "swot" && (
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Matriz SWOT</h3>
              <p className="text-sm text-muted-foreground">Itens de contexto interno e externo com decisão de tratamento.</p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => openSwotDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Novo item
              </Button>
            )}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="px-2 py-3">Domínio</th>
                  <th className="px-2 py-3">Tipo</th>
                  <th className="px-2 py-3">Descrição</th>
                  <th className="px-2 py-3">Resultado</th>
                  <th className="px-2 py-3">Tratamento</th>
                  <th className="px-2 py-3">Objetivo</th>
                  {canEdit && <th className="px-2 py-3">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {plan.swotItems.map((item) => (
                  <tr key={item.id} className="border-b border-border/40">
                    <td className="px-2 py-3">{item.domain.toUpperCase()}</td>
                    <td className="px-2 py-3">{item.swotType}</td>
                    <td className="px-2 py-3">{item.description}</td>
                    <td className="px-2 py-3">{item.result ?? "—"}</td>
                    <td className="px-2 py-3">{item.treatmentDecision || "—"}</td>
                    <td className="px-2 py-3">{item.linkedObjectiveLabel || item.linkedObjectiveCode || "—"}</td>
                    {canEdit && (
                      <td className="px-2 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openSwotDialog(item)}>Editar</Button>
                          <Button size="sm" variant="outline" onClick={() => swotCrud.deleteMutation.mutate(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "interested" && (
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Partes Interessadas</h3>
              <p className="text-sm text-muted-foreground">Requisitos relevantes ao contexto do sistema de gestão.</p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => openPartyDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nova parte
              </Button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {plan.interestedParties.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-medium">{item.name}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{item.expectedRequirements || "Sem requisitos descritos."}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openPartyDialog(item)}>Editar</Button>
                      <Button size="sm" variant="outline" onClick={() => interestedCrud.deleteMutation.mutate(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "objectives" && (
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Objetivos Estratégicos</h3>
              <p className="text-sm text-muted-foreground">Objetivos vinculados ao contexto e aos desdobramentos do plano.</p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => openObjectiveDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Novo objetivo
              </Button>
            )}
          </div>
          <div className="mt-4 grid gap-3">
            {plan.objectives.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{item.code}</Badge>
                      <span className="text-sm text-muted-foreground">{item.systemDomain || "Sem sistema"}</span>
                    </div>
                    <h4 className="mt-2 font-medium">{item.description}</h4>
                    {item.notes && <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openObjectiveDialog(item)}>Editar</Button>
                      <Button size="sm" variant="outline" onClick={() => objectiveCrud.deleteMutation.mutate(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "actions" && (
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Ações</h3>
              <p className="text-sm text-muted-foreground">Desdobramentos por unidade, responsáveis e prazos.</p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => openActionDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Nova ação
              </Button>
            )}
          </div>
          <div className="mt-4 grid gap-3">
            {plan.actions.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{item.status}</Badge>
                      <span className="text-sm text-muted-foreground">Prazo: {formatDate(item.dueDate)}</span>
                    </div>
                    <h4 className="mt-2 font-medium">{item.title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description || "Sem descrição."}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Responsável: {item.responsibleUserName || "Não definido"} • Unidades: {item.units.map((unit) => unit.name).join(", ") || "Nenhuma"}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openActionDialog(item)}>Editar</Button>
                      <Button size="sm" variant="outline" onClick={() => actionCrud.deleteMutation.mutate(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "revisions" && (
        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Revisões e Evidências</h3>
            <p className="text-sm text-muted-foreground">Histórico formal de aprovação, snapshots e evidência documental.</p>
          </div>

          <div className="grid gap-3">
            {plan.revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma revisão aprovada ainda.</p>
            ) : (
              plan.revisions.map((revision) => (
                <div key={revision.id} className="rounded-xl border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">R{revision.revisionNumber}</Badge>
                        <span className="text-sm text-muted-foreground">{formatDate(revision.revisionDate, true)}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Motivo: {revision.reason || "—"} • Aprovado por: {revision.approvedByName || "—"}
                      </p>
                      {revision.changeSummary && <p className="mt-1 text-sm text-muted-foreground">{revision.changeSummary}</p>}
                    </div>
                    {revision.evidenceDocumentId && (
                      <Button size="sm" variant="outline" onClick={() => navigate(`/qualidade/documentacao/${revision.evidenceDocumentId}`)}>
                        Ver documento
                      </Button>
                    )}
                  </div>
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
                  {(importPreview.anomalies.length > 0 ? importPreview.anomalies : ["Nenhuma anomalia detectada na leitura inicial."]).map((issue) => (
                    <li key={issue}>{issue}</li>
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
            <select className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={swotForm.domain} onChange={(event) => setSwotForm((prev) => ({ ...prev, domain: event.target.value as GovernanceSwotItem["domain"] }))}>
              <option value="sgq">SGQ</option>
              <option value="sga">SGA</option>
              <option value="sgsv">SGSV</option>
              <option value="esg">ESG</option>
              <option value="governance">Governança</option>
            </select>
          </div>
          <div>
            <Label>Tipo</Label>
            <select className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={swotForm.swotType} onChange={(event) => setSwotForm((prev) => ({ ...prev, swotType: event.target.value as GovernanceSwotItem["swotType"] }))}>
              <option value="strength">Força</option>
              <option value="weakness">Fraqueza</option>
              <option value="opportunity">Oportunidade</option>
              <option value="threat">Ameaça</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea value={swotForm.description} onChange={(event) => setSwotForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} />
          </div>
          <div>
            <Label>Resultado</Label>
            <Input type="number" value={swotForm.result || ""} onChange={(event) => setSwotForm((prev) => ({ ...prev, result: event.target.value ? Number(event.target.value) : null }))} />
          </div>
          <div>
            <Label>Decisão de tratamento</Label>
            <Input value={swotForm.treatmentDecision || ""} onChange={(event) => setSwotForm((prev) => ({ ...prev, treatmentDecision: event.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSwotDialogOpen(false)}>Cancelar</Button>
          <Button onClick={saveSwot} isLoading={swotCrud.createMutation.isPending || swotCrud.updateMutation.isPending}>Salvar</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={partyDialogOpen} onOpenChange={setPartyDialogOpen} title={partyEditing ? "Editar parte interessada" : "Nova parte interessada"} size="lg">
        <div className="grid gap-4">
          <div>
            <Label>Nome</Label>
            <Input value={partyForm.name} onChange={(event) => setPartyForm((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div>
            <Label>Requisitos esperados</Label>
            <Textarea value={partyForm.expectedRequirements || ""} onChange={(event) => setPartyForm((prev) => ({ ...prev, expectedRequirements: event.target.value }))} rows={3} />
          </div>
          <div>
            <Label>Forma de monitoramento</Label>
            <Textarea value={partyForm.monitoringMethod || ""} onChange={(event) => setPartyForm((prev) => ({ ...prev, monitoringMethod: event.target.value }))} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPartyDialogOpen(false)}>Cancelar</Button>
          <Button onClick={saveParty} isLoading={interestedCrud.createMutation.isPending || interestedCrud.updateMutation.isPending}>Salvar</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={objectiveDialogOpen} onOpenChange={setObjectiveDialogOpen} title={objectiveEditing ? "Editar objetivo" : "Novo objetivo"} size="lg">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Código</Label>
              <Input value={objectiveForm.code} onChange={(event) => setObjectiveForm((prev) => ({ ...prev, code: event.target.value }))} />
            </div>
            <div>
              <Label>Sistema</Label>
              <Input value={objectiveForm.systemDomain || ""} onChange={(event) => setObjectiveForm((prev) => ({ ...prev, systemDomain: event.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={objectiveForm.description} onChange={(event) => setObjectiveForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={objectiveForm.notes || ""} onChange={(event) => setObjectiveForm((prev) => ({ ...prev, notes: event.target.value }))} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setObjectiveDialogOpen(false)}>Cancelar</Button>
          <Button onClick={saveObjective} isLoading={objectiveCrud.createMutation.isPending || objectiveCrud.updateMutation.isPending}>Salvar</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen} title={actionEditing ? "Editar ação" : "Nova ação"} size="lg">
        <div className="grid gap-4">
          <div>
            <Label>Título</Label>
            <Input value={actionForm.title} onChange={(event) => setActionForm((prev) => ({ ...prev, title: event.target.value }))} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={actionForm.description || ""} onChange={(event) => setActionForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Responsável</Label>
              <select className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={actionForm.responsibleUserId || ""} onChange={(event) => setActionForm((prev) => ({ ...prev, responsibleUserId: event.target.value ? Number(event.target.value) : null }))}>
                <option value="">Não definido</option>
                {users.map((user: UserOption) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Prazo</Label>
              <Input type="date" value={actionForm.dueDate || ""} onChange={(event) => setActionForm((prev) => ({ ...prev, dueDate: event.target.value }))} />
            </div>
            <div>
              <Label>Status</Label>
              <select className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={actionForm.status} onChange={(event) => setActionForm((prev) => ({ ...prev, status: event.target.value as GovernanceAction["status"] }))}>
                <option value="pending">Pendente</option>
                <option value="in_progress">Em andamento</option>
                <option value="done">Concluída</option>
                <option value="canceled">Cancelada</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Item SWOT vinculado</Label>
              <select className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={actionForm.swotItemId || ""} onChange={(event) => setActionForm((prev) => ({ ...prev, swotItemId: event.target.value ? Number(event.target.value) : null }))}>
                <option value="">Sem vínculo</option>
                {plan.swotItems.map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}
              </select>
            </div>
            <div>
              <Label>Objetivo vinculado</Label>
              <select className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={actionForm.objectiveId || ""} onChange={(event) => setActionForm((prev) => ({ ...prev, objectiveId: event.target.value ? Number(event.target.value) : null }))}>
                <option value="">Sem vínculo</option>
                {plan.objectives.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.description}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Unidades impactadas</Label>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {units.map((unit) => (
                <label key={unit.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={actionForm.unitIds.includes(unit.id)}
                    onChange={(event) => setActionForm((prev) => ({
                      ...prev,
                      unitIds: event.target.checked ? [...prev.unitIds, unit.id] : prev.unitIds.filter((id) => id !== unit.id),
                    }))}
                  />
                  <span>{unit.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setActionDialogOpen(false)}>Cancelar</Button>
          <Button onClick={saveAction} isLoading={actionCrud.createMutation.isPending || actionCrud.updateMutation.isPending}>Salvar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
