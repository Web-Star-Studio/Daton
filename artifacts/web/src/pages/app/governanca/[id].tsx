import React, { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { Link, useLocation, useParams } from "wouter";
import { z } from "zod";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useListUnits,
  useListUserOptions,
  getListUnitsQueryKey,
  getListUserOptionsQueryKey,
  type UserOption,
} from "@workspace/api-client-react";
import {
  fetchGovernanceExport,
  useGovernanceCrudMutation,
  useGovernancePlan,
  useGovernanceReviewReadAction,
  useGovernanceRiskOpportunityEffectivenessReview,
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
  type GovernanceRiskOpportunityBody,
  type GovernanceRiskOpportunityEffectivenessReviewBody,
  type GovernanceReviewer,
  type GovernanceRiskOpportunityItem,
  type GovernanceSwotItem,
  type GovernanceSwotBody,
  type GovernanceActionBody,
} from "@/lib/governance-client";
import {
  parseGovernanceWorkbook,
  type GovernanceImportPreview,
} from "@/lib/governance-import";
import { resolveApiUrl } from "@/lib/api";
import {
  dateToIso,
  formatGovernanceDate,
  GOVERNANCE_STATUS_LABELS,
  isoToDateInput,
} from "@/lib/governance-ui";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";

type Tab =
  | "overview"
  | "swot"
  | "interested"
  | "scope"
  | "objectives"
  | "risks"
  | "actions"
  | "revisions";

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
  reviewerIds: z.array(z.number()).default([]),
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
  riskOpportunityItemId: z.number().nullable().optional(),
  responsibleUserId: z.number().nullable().optional(),
  secondaryResponsibleUserId: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  rescheduledDueDate: z.string().nullable().optional(),
  rescheduleReason: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  completionNotes: z.string().nullable().optional(),
  status: z.enum(["pending", "in_progress", "done", "canceled"]),
  notes: z.string().nullable().optional(),
  sortOrder: z.number(),
  unitIds: z.array(z.number()),
});

const governanceRiskOpportunitySchema = z.object({
  type: z.enum(["risk", "opportunity"]),
  sourceType: z.enum([
    "swot",
    "audit",
    "meeting",
    "legislation",
    "incident",
    "internal_strategy",
    "other",
  ]),
  sourceReference: z.string().nullable().optional(),
  title: z.string().min(1, "Informe o título"),
  description: z.string().min(1, "Informe a descrição"),
  ownerUserId: z.number().nullable().optional(),
  coOwnerUserId: z.number().nullable().optional(),
  unitId: z.number().nullable().optional(),
  objectiveId: z.number().nullable().optional(),
  swotItemId: z.number().nullable().optional(),
  likelihood: z.number().int().min(1).max(4).nullable().optional(),
  impact: z.number().int().min(1).max(4).nullable().optional(),
  responseStrategy: z
    .enum([
      "mitigate",
      "eliminate",
      "accept",
      "monitor",
      "exploit",
      "enhance",
      "share",
      "avoid",
      "other",
    ])
    .nullable()
    .optional(),
  nextReviewAt: z.string().nullable().optional(),
  status: z.enum([
    "identified",
    "assessed",
    "responding",
    "awaiting_effectiveness",
    "effective",
    "ineffective",
    "continuous",
    "canceled",
  ]),
  existingControls: z.string().nullable().optional(),
  expectedEffect: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number(),
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
    riskOpportunityItemId: null,
    responsibleUserId: null,
    secondaryResponsibleUserId: null,
    dueDate: "",
    rescheduledDueDate: "",
    rescheduleReason: "",
    completedAt: "",
    completionNotes: "",
    status: "pending",
    notes: "",
    sortOrder: 0,
    unitIds: [],
  };
}

function blankRiskOpportunityForm(): GovernanceRiskOpportunityBody {
  return {
    type: "risk",
    sourceType: "meeting",
    sourceReference: "",
    title: "",
    description: "",
    ownerUserId: null,
    coOwnerUserId: null,
    unitId: null,
    objectiveId: null,
    swotItemId: null,
    likelihood: null,
    impact: null,
    responseStrategy: null,
    nextReviewAt: "",
    status: "identified",
    existingControls: "",
    expectedEffect: "",
    notes: "",
    sortOrder: 0,
  };
}

function blankRiskEffectivenessReview(): GovernanceRiskOpportunityEffectivenessReviewBody {
  return {
    result: "effective",
    comment: "",
  };
}

function getRiskPriorityTone(priority?: string | null) {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "high":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "medium":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "low":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-secondary/40 text-foreground border-border";
  }
}

function getRiskPriorityLabel(priority?: string | null) {
  switch (priority) {
    case "critical":
      return "Crítico";
    case "high":
      return "Alto";
    case "medium":
      return "Médio";
    case "low":
      return "Baixo";
    default:
      return "Sem score";
  }
}

function getRiskTypeLabel(type: GovernanceRiskOpportunityItem["type"]) {
  return type === "risk" ? "Risco" : "Oportunidade";
}

function getSwotTypeLabel(type: GovernanceSwotItem["swotType"]) {
  switch (type) {
    case "strength":
      return "Força";
    case "weakness":
      return "Fraqueza";
    case "opportunity":
      return "Oportunidade";
    case "threat":
      return "Ameaça";
    default:
      return type;
  }
}

const GOVERNANCE_IMPORT_EXAMPLE_HEADERS = [
  "secao",
  "origem_na_planilha_xlsx",
  "campo",
  "exemplo",
  "como_preencher",
];

const GOVERNANCE_IMPORT_EXAMPLE_ROWS = [
  [
    "Plano",
    "CAPA!B13",
    "titulo",
    "TRANSPORTES GABARDO LTDA.",
    "Título principal do planejamento estratégico.",
  ],
  [
    "Plano",
    "B)DIRECIONAMENTO ESTRATÉGICO SV!B65",
    "resumo_executivo",
    "Contexto interno e externo consolidado para o ciclo 2026.",
    "Resumo executivo do plano. Se N65 existir, ela complementa a conclusão estratégica.",
  ],
  [
    "Plano",
    "C) ESCOPO POLíTICA OBJETIVOS!B4",
    "escopo_tecnico",
    "Transporte rodoviário de cargas e apoio operacional.",
    "Descreve o escopo técnico coberto pelo sistema de gestão.",
  ],
  [
    "Plano",
    "C) ESCOPO POLíTICA OBJETIVOS!B6",
    "escopo_geografico",
    "Pernambuco, Bahia e Sergipe.",
    "Regiões ou unidades atendidas pelo plano.",
  ],
  [
    "Plano",
    "C) ESCOPO POLíTICA OBJETIVOS!B12",
    "politica",
    "Atender requisitos legais, clientes e melhoria contínua.",
    "Texto da política corporativa aplicável ao planejamento.",
  ],
  [
    "Plano",
    "C) ESCOPO POLíTICA OBJETIVOS!B25",
    "missao",
    "Entregar operações seguras, confiáveis e sustentáveis.",
    "Missão da organização.",
  ],
  [
    "Plano",
    "C) ESCOPO POLíTICA OBJETIVOS!B27",
    "visao",
    "Ser referência regional em transporte integrado.",
    "Visão da organização.",
  ],
  [
    "Plano",
    "C) ESCOPO POLíTICA OBJETIVOS!B29",
    "valores",
    "Segurança, ética, disciplina operacional e respeito às pessoas.",
    "Valores institucionais.",
  ],
  [
    "Historico de revisoes",
    "Histórico de Revisões!B:F",
    "data, motivo, item_alterado, revisao, alterado_por",
    "15/02/2026 | Inclusão de novos objetivos | Objetivos | 03 | Qualidade",
    "Cada linha representa uma revisão. A data pode estar em dd/mm/aaaa ou yyyy-mm-dd.",
  ],
  [
    "SWOT SGI",
    "A) SWOT SGI!C:P",
    "descricao, tipo_fator, ambiente, dominio, desempenho, relevancia, resultado, tratamento, ref_acao, cod_objetivo, nome_objetivo",
    "Alta experiência da equipe | Força | Interno | SGQ | 4 | 4 | 16 | Manter padrão | AC-01 | O1 | Melhorar eficiência operacional",
    "Tipos aceitos: Força, Fraqueza, Oportunidade, Ameaça. Ambiente: Interno ou Externo.",
  ],
  [
    "SWOT SGA",
    "A2) SWOT SGA!B:H",
    "descricao, resultado, objetivo_relacionado, correlacao, referencia_acao",
    "Consumo elevado de diesel | 9 | O2 | Relacionado ao indicador ambiental | AC-02",
    "A aba separa forças, fraquezas, oportunidades e ameaças por blocos na coluna B.",
  ],
  [
    "Partes interessadas",
    "B) PARTES INTERESSADAS!C:I",
    "nome, requisitos, papel_na_empresa, resumo_papel, relevante_sgi, requisito_legal, monitoramento",
    "Clientes | Entregas no prazo | Contratante | Parte central da operação | Sim | Não | Pesquisa de satisfação trimestral",
    "Para os campos booleanos, usar Sim ou Não.",
  ],
  [
    "Objetivos estrategicos",
    "C) ESCOPO POLíTICA OBJETIVOS!B16:D22",
    "dominio_sistema, codigo_objetivo, descricao_objetivo",
    "SGQ | O1 | Melhorar eficiência operacional em 10%",
    "A descrição pode começar com código como O1) Texto. O importador separa o código automaticamente.",
  ],
  [
    "Notas de objetivos",
    "D) INDICADORES E OBJETIVOS!A:C",
    "codigo_objetivo, nota_indicador",
    "O1 | Indicador acompanhado mensalmente pela diretoria.",
    "As notas complementam os objetivos quando a aba existir.",
  ],
];

function escapeCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadGovernanceImportExampleCsv() {
  const csvContent = [
    GOVERNANCE_IMPORT_EXAMPLE_HEADERS.map(escapeCsvCell).join(";"),
    ...GOVERNANCE_IMPORT_EXAMPLE_ROWS.map((row) =>
      row.map(escapeCsvCell).join(";"),
    ),
  ].join("\n");

  const blob = new Blob([`\uFEFF${csvContent}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "modelo-importacao-planejamento-estrategico.csv";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function toggleMultiSelectValue(selected: number[], value: number) {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

function getReviewerStatusLabel(status: GovernanceReviewer["status"]) {
  switch (status) {
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    default:
      return "Pendente";
  }
}

function getReviewerStatusTone(status: GovernanceReviewer["status"]) {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
}

function getRiskStatusLabel(status: GovernanceRiskOpportunityItem["status"]) {
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
      return status;
  }
}

function getRiskSourceLabel(
  sourceType: GovernanceRiskOpportunityItem["sourceType"],
) {
  switch (sourceType) {
    case "swot":
      return "SWOT";
    case "audit":
      return "Auditoria";
    case "meeting":
      return "Reunião";
    case "legislation":
      return "Legislação";
    case "incident":
      return "Incidente";
    case "internal_strategy":
      return "Estratégia interna";
    case "other":
      return "Outro";
    default:
      return sourceType;
  }
}

function getRiskResponseStrategyLabel(
  strategy?: GovernanceRiskOpportunityItem["responseStrategy"] | null,
) {
  switch (strategy) {
    case "mitigate":
      return "Mitigar";
    case "eliminate":
      return "Eliminar";
    case "accept":
      return "Aceitar";
    case "monitor":
      return "Monitorar";
    case "exploit":
      return "Explorar";
    case "enhance":
      return "Potencializar";
    case "share":
      return "Compartilhar";
    case "avoid":
      return "Evitar";
    case "other":
      return "Outro";
    default:
      return "Não definida";
  }
}

export default function GovernanceDetailPage() {
  const params = useParams<{ id: string }>();
  const planId = Number(params.id);
  const { organization, user } = useAuth();
  const { canWriteModule, isOrgAdmin } = usePermissions();
  const orgId = organization?.id;
  const [location, navigate] = useLocation();
  const riskRegisterBase = location.startsWith("/app/")
    ? "/app/governanca/riscos-oportunidades"
    : "/governanca/riscos-oportunidades";
  const { data: plan, isLoading } = useGovernancePlan(orgId, planId);
  const updatePlanMutation = useUpdateGovernancePlan(orgId, planId);
  const importPlanMutation = useImportGovernancePlan(orgId, planId);
  const submitMutation = useGovernanceWorkflowAction(orgId, planId, "submit");
  const reviewReadMutation = useGovernanceReviewReadAction(orgId, planId);
  const approveMutation = useGovernanceWorkflowAction(orgId, planId, "approve");
  const rejectMutation = useGovernanceWorkflowAction(orgId, planId, "reject");
  const reopenMutation = useGovernanceWorkflowAction(orgId, planId, "reopen");
  const swotCrud = useGovernanceCrudMutation<GovernanceSwotBody>(
    orgId,
    planId,
    "swot-items",
  );
  const interestedCrud =
    useGovernanceCrudMutation<GovernanceInterestedPartyBody>(
      orgId,
      planId,
      "interested-parties",
    );
  const objectiveCrud = useGovernanceCrudMutation<GovernanceObjectiveBody>(
    orgId,
    planId,
    "objectives",
  );
  const riskOpportunityCrud =
    useGovernanceCrudMutation<GovernanceRiskOpportunityBody>(
      orgId,
      planId,
      "risk-opportunity-items",
    );
  const actionCrud = useGovernanceCrudMutation<
    ReturnType<typeof blankActionForm>
  >(orgId, planId, "actions");
  const riskEffectivenessReviewMutation =
    useGovernanceRiskOpportunityEffectivenessReview(orgId, planId);
  const { data: units = [] } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });
  const { data: users = [] } = useListUserOptions(
    orgId!,
    {},
    {
      query: { queryKey: getListUserOptionsQueryKey(orgId!), enabled: !!orgId },
    },
  );

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] =
    useState<GovernanceImportPreview | null>(null);
  const [swotDialogOpen, setSwotDialogOpen] = useState(false);
  const [swotEditing, setSwotEditing] = useState<GovernanceSwotItem | null>(
    null,
  );
  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [partyEditing, setPartyEditing] =
    useState<GovernanceInterestedParty | null>(null);
  const [objectiveDialogOpen, setObjectiveDialogOpen] = useState(false);
  const [objectiveEditing, setObjectiveEditing] =
    useState<GovernanceObjective | null>(null);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskEditing, setRiskEditing] =
    useState<GovernanceRiskOpportunityItem | null>(null);
  const [riskEffectivenessDialogOpen, setRiskEffectivenessDialogOpen] =
    useState(false);
  const [riskEffectivenessTarget, setRiskEffectivenessTarget] =
    useState<GovernanceRiskOpportunityItem | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionEditing, setActionEditing] = useState<GovernanceAction | null>(
    null,
  );
  const [swotDeletingId, setSwotDeletingId] = useState<number | null>(null);
  const [partyDeletingId, setPartyDeletingId] = useState<number | null>(null);
  const [objectiveDeletingId, setObjectiveDeletingId] = useState<number | null>(
    null,
  );
  const [riskDeletingId, setRiskDeletingId] = useState<number | null>(null);
  const [actionDeletingId, setActionDeletingId] = useState<number | null>(null);
  const [reviewDecisionDialogOpen, setReviewDecisionDialogOpen] =
    useState(false);
  const [reviewDecisionComment, setReviewDecisionComment] = useState("");
  const [riskTypeFilter, setRiskTypeFilter] = useState<string>("all");
  const [riskStatusFilter, setRiskStatusFilter] = useState<string>("all");
  const [riskPriorityFilter, setRiskPriorityFilter] = useState<string>("all");
  const [riskUnitFilter, setRiskUnitFilter] = useState<string>("all");
  const [riskOwnerFilter, setRiskOwnerFilter] = useState<string>("all");
  const [riskSourceFilter, setRiskSourceFilter] = useState<string>("all");
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
      reviewerIds: [],
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
  const riskOpportunityForm = useForm<GovernanceRiskOpportunityBody>({
    resolver: zodResolver(governanceRiskOpportunitySchema),
    defaultValues: blankRiskOpportunityForm(),
  });
  const riskEffectivenessForm =
    useForm<GovernanceRiskOpportunityEffectivenessReviewBody>({
      defaultValues: blankRiskEffectivenessReview(),
    });
  const actionForm = useForm<GovernanceActionBody & { unitIds: number[] }>({
    resolver: zodResolver(governanceActionSchema),
    defaultValues: blankActionForm(),
  });
  const canEdit =
    canWriteModule("governance") &&
    !!plan &&
    ["draft", "rejected"].includes(plan.status);
  const configuredReviewerIds = planForm.watch("reviewerIds") || [];
  const actionUnitIds = actionForm.watch("unitIds");
  const riskLikelihood = riskOpportunityForm.watch("likelihood");
  const riskImpact = riskOpportunityForm.watch("impact");

  usePageTitle(plan?.title || "Planejamento Estratégico");
  usePageSubtitle(
    plan
      ? `Status ${GOVERNANCE_STATUS_LABELS[plan.status] || plan.status} • revisão ativa R${plan.activeRevisionNumber}`
      : undefined,
  );

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
        reviewerIds: plan.reviewerIds || [],
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

  const openActionDialog = (
    item?: GovernanceAction,
    defaults?: Partial<ReturnType<typeof blankActionForm>>,
  ) => {
    setActionEditing(item || null);
    actionForm.reset(
      item
        ? {
            title: item.title,
            description: item.description || "",
            swotItemId: item.swotItemId || null,
            objectiveId: item.objectiveId || null,
            riskOpportunityItemId: item.riskOpportunityItemId || null,
            responsibleUserId: item.responsibleUserId || null,
            secondaryResponsibleUserId: item.secondaryResponsibleUserId || null,
            dueDate: isoToDateInput(item.dueDate),
            rescheduledDueDate: isoToDateInput(item.rescheduledDueDate),
            rescheduleReason: item.rescheduleReason || "",
            completedAt: isoToDateInput(item.completedAt),
            completionNotes: item.completionNotes || "",
            status: item.status,
            notes: item.notes || "",
            sortOrder: item.sortOrder,
            unitIds: item.units.map((unit) => unit.id),
          }
        : {
            ...blankActionForm(),
            ...defaults,
          },
    );
    setActionDialogOpen(true);
  };

  const openRiskOpportunityDialog = (item?: GovernanceRiskOpportunityItem) => {
    setRiskEditing(item || null);
    riskOpportunityForm.reset(
      item
        ? {
            type: item.type,
            sourceType: item.sourceType,
            sourceReference: item.sourceReference || "",
            title: item.title,
            description: item.description,
            ownerUserId: item.ownerUserId || null,
            coOwnerUserId: item.coOwnerUserId || null,
            unitId: item.unitId || null,
            objectiveId: item.objectiveId || null,
            swotItemId: item.swotItemId || null,
            likelihood: item.likelihood || null,
            impact: item.impact || null,
            responseStrategy: item.responseStrategy || undefined,
            nextReviewAt: isoToDateInput(item.nextReviewAt),
            status: item.status,
            existingControls: item.existingControls || "",
            expectedEffect: item.expectedEffect || "",
            notes: item.notes || "",
            sortOrder: 0,
          }
        : blankRiskOpportunityForm(),
    );
    setRiskDialogOpen(true);
  };

  const openRiskOpportunityFromSwot = (item: GovernanceSwotItem) => {
    const linkedObjectiveId =
      plan?.objectives.find(
        (objective) =>
          objective.code === item.linkedObjectiveCode ||
          objective.description === item.linkedObjectiveLabel,
      )?.id || null;
    const type =
      item.swotType === "strength" || item.swotType === "opportunity"
        ? "opportunity"
        : "risk";
    const params = new URLSearchParams({
      planId: String(planId),
      create: "1",
      swotItemId: String(item.id),
      type,
    });

    if (linkedObjectiveId) {
      params.set("objectiveId", String(linkedObjectiveId));
    }

    navigate(`${riskRegisterBase}?${params.toString()}`);
  };

  const openRiskEffectivenessDialog = (item: GovernanceRiskOpportunityItem) => {
    setRiskEffectivenessTarget(item);
    riskEffectivenessForm.reset({
      result: item.latestEffectivenessReview?.result || "effective",
      comment: item.latestEffectivenessReview?.comment || "",
    });
    setRiskEffectivenessDialogOpen(true);
  };

  const handleSavePlan = planForm.handleSubmit(async (values) => {
    try {
      await updatePlanMutation.mutateAsync({
        ...values,
        nextReviewAt: values.nextReviewAt
          ? dateToIso(values.nextReviewAt)
          : null,
        importedWorkbookName: values.importedWorkbookName || null,
      });
      toast({
        title: "Plano atualizado",
        description: "As informações principais foram salvas.",
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar plano",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o plano.",
      });
    }
  });

  const handleWorkflow = async (
    kind: "submit" | "approve" | "reject" | "reopen",
  ) => {
    const currentPlanForm = planForm.getValues();
    try {
      if (kind === "submit") {
        await submitMutation.mutateAsync({});
      } else if (kind === "approve") {
        await approveMutation.mutateAsync({
          reviewReason:
            currentPlanForm.reviewReason || plan?.reviewReason || null,
          changeSummary: "Aprovação do planejamento estratégico.",
        });
      } else if (kind === "reject") {
        await rejectMutation.mutateAsync({
          reviewReason:
            currentPlanForm.reviewReason || plan?.reviewReason || null,
          changeSummary: "Rejeição para ajustes.",
        });
      } else {
        await reopenMutation.mutateAsync({});
      }
      toast({
        title: "Workflow atualizado",
        description: "O estado do planejamento foi atualizado.",
      });
    } catch (error) {
      toast({
        title: "Falha no workflow",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar o workflow.",
      });
    }
  };

  const handleOpenEvidence = async () => {
    if (!orgId || !plan) return;
    try {
      const exportInfo = await fetchGovernanceExport(orgId, plan.id);
      window.open(
        resolveApiUrl(`/api/storage${exportInfo.objectPath}`),
        "_blank",
      );
    } catch (error) {
      toast({
        title: "Evidência indisponível",
        description:
          error instanceof Error
            ? error.message
            : "Nenhuma evidência formal foi encontrada.",
      });
    }
  };

  const handleAcknowledgeReviewRead = async () => {
    try {
      await reviewReadMutation.mutateAsync();
      toast({
        title: "Leitura registrada",
        description: "Sua leitura da revisão foi registrada com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Falha ao registrar leitura",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível acusar a leitura da revisão.",
      });
    }
  };

  const handleApproveReview = async () => {
    try {
      const currentPlanForm = planForm.getValues();
      await approveMutation.mutateAsync({
        reviewReason:
          currentPlanForm.reviewReason || plan?.reviewReason || null,
        comment: null,
      });
      toast({
        title: "Aprovação registrada",
        description: "Seu parecer favorável foi registrado para esta revisão.",
      });
    } catch (error) {
      toast({
        title: "Falha ao aprovar revisão",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível aprovar a revisão.",
      });
    }
  };

  const handleRejectReview = async () => {
    if (!reviewDecisionComment.trim()) {
      toast({
        title: "Justificativa obrigatória",
        description:
          "Explique o motivo da rejeição e as alterações sugeridas antes de continuar.",
      });
      return;
    }

    try {
      const currentPlanForm = planForm.getValues();
      await rejectMutation.mutateAsync({
        reviewReason:
          currentPlanForm.reviewReason || plan?.reviewReason || null,
        comment: reviewDecisionComment.trim(),
      });
      setReviewDecisionDialogOpen(false);
      setReviewDecisionComment("");
      toast({
        title: "Rejeição registrada",
        description:
          "Sua rejeição foi registrada com a justificativa informada.",
      });
    } catch (error) {
      toast({
        title: "Falha ao rejeitar revisão",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível rejeitar a revisão.",
      });
    }
  };

  const handleWorkbookSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setImportPreview(await parseGovernanceWorkbook(file));
    } catch (error) {
      toast({
        title: "Falha ao ler planilha",
        description:
          error instanceof Error
            ? error.message
            : "O arquivo não pôde ser processado.",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleImportWorkbook = async () => {
    if (!importPreview) return;
    try {
      await importPlanMutation.mutateAsync(
        importPreview.payload as GovernanceImportPayload,
      );
      setImportOpen(false);
      setImportPreview(null);
      toast({
        title: "Planilha importada",
        description: "O rascunho foi sobrescrito com os dados do arquivo.",
      });
    } catch (error) {
      toast({
        title: "Falha ao importar planilha",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível sobrescrever o rascunho.",
      });
    }
  };

  const saveSwot = swotForm.handleSubmit(async (values) => {
    const payload = {
      ...values,
      matrixLabel: values.matrixLabel || null,
      perspective: values.perspective || null,
      performance:
        values.performance != null ? Number(values.performance) : null,
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
        await swotCrud.updateMutation.mutateAsync({
          id: swotEditing.id,
          body: payload,
        });
      } else {
        await swotCrud.createMutation.mutateAsync(payload);
      }
      swotForm.reset(blankSwotForm());
      setSwotDialogOpen(false);
    } catch (error) {
      toast({
        title: "Falha ao salvar item SWOT",
        description: error instanceof Error ? error.message : "Erro ao salvar.",
      });
    }
  });

  const saveParty = partyForm.handleSubmit(async (values) => {
    try {
      if (partyEditing) {
        await interestedCrud.updateMutation.mutateAsync({
          id: partyEditing.id,
          body: values,
        });
      } else {
        await interestedCrud.createMutation.mutateAsync(values);
      }
      partyForm.reset(blankInterestedForm());
      setPartyDialogOpen(false);
    } catch (error) {
      toast({
        title: "Falha ao salvar parte interessada",
        description: error instanceof Error ? error.message : "Erro ao salvar.",
      });
    }
  });

  const saveObjective = objectiveForm.handleSubmit(async (values) => {
    try {
      if (objectiveEditing) {
        await objectiveCrud.updateMutation.mutateAsync({
          id: objectiveEditing.id,
          body: values,
        });
      } else {
        await objectiveCrud.createMutation.mutateAsync(values);
      }
      objectiveForm.reset(blankObjectiveForm());
      setObjectiveDialogOpen(false);
    } catch (error) {
      toast({
        title: "Falha ao salvar objetivo",
        description: error instanceof Error ? error.message : "Erro ao salvar.",
      });
    }
  });

  const saveAction = actionForm.handleSubmit(async (values) => {
    const payload = {
      ...values,
      dueDate: values.dueDate ? dateToIso(values.dueDate) : null,
      rescheduledDueDate: values.rescheduledDueDate
        ? dateToIso(values.rescheduledDueDate)
        : null,
      completedAt: values.completedAt ? dateToIso(values.completedAt) : null,
      description: values.description || null,
      notes: values.notes || null,
      swotItemId: values.swotItemId || null,
      objectiveId: values.objectiveId || null,
      riskOpportunityItemId: values.riskOpportunityItemId || null,
      responsibleUserId: values.responsibleUserId || null,
      secondaryResponsibleUserId: values.secondaryResponsibleUserId || null,
      rescheduleReason: values.rescheduleReason || null,
      completionNotes: values.completionNotes || null,
    };
    try {
      if (actionEditing) {
        await actionCrud.updateMutation.mutateAsync({
          id: actionEditing.id,
          body: payload,
        });
      } else {
        await actionCrud.createMutation.mutateAsync(payload);
      }
      actionForm.reset(blankActionForm());
      setActionDialogOpen(false);
    } catch (error) {
      toast({
        title: "Falha ao salvar ação",
        description: error instanceof Error ? error.message : "Erro ao salvar.",
      });
    }
  });

  const saveRiskOpportunity = riskOpportunityForm.handleSubmit(
    async (values) => {
      const payload = {
        ...values,
        sourceReference: values.sourceReference || null,
        ownerUserId: values.ownerUserId || null,
        coOwnerUserId: values.coOwnerUserId || null,
        unitId: values.unitId || null,
        objectiveId: values.objectiveId || null,
        swotItemId: values.swotItemId || null,
        responseStrategy: values.responseStrategy || undefined,
        nextReviewAt: values.nextReviewAt
          ? dateToIso(values.nextReviewAt)
          : null,
        existingControls: values.existingControls || null,
        expectedEffect: values.expectedEffect || null,
        notes: values.notes || null,
      };
      try {
        if (riskEditing) {
          await riskOpportunityCrud.updateMutation.mutateAsync({
            id: riskEditing.id,
            body: payload,
          });
        } else {
          await riskOpportunityCrud.createMutation.mutateAsync(payload);
        }
        riskOpportunityForm.reset(blankRiskOpportunityForm());
        setRiskDialogOpen(false);
        setRiskEditing(null);
      } catch (error) {
        toast({
          title: "Falha ao salvar risco ou oportunidade",
          description:
            error instanceof Error ? error.message : "Erro ao salvar.",
        });
      }
    },
  );

  const saveRiskEffectivenessReview = riskEffectivenessForm.handleSubmit(
    async (values) => {
      if (!riskEffectivenessTarget) return;
      try {
        await riskEffectivenessReviewMutation.mutateAsync({
          itemId: riskEffectivenessTarget.id,
          body: {
            result: values.result,
            comment: values.comment || null,
          },
        });
        riskEffectivenessForm.reset(blankRiskEffectivenessReview());
        setRiskEffectivenessDialogOpen(false);
        setRiskEffectivenessTarget(null);
      } catch (error) {
        toast({
          title: "Falha ao registrar eficácia",
          description:
            error instanceof Error ? error.message : "Erro ao salvar revisão.",
        });
      }
    },
  );

  const deleteSwot = async (itemId: number) => {
    setSwotDeletingId(itemId);
    try {
      await swotCrud.deleteMutation.mutateAsync(itemId);
    } catch (error) {
      toast({
        title: "Falha ao excluir item SWOT",
        description:
          error instanceof Error ? error.message : "Erro ao excluir.",
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
        description:
          error instanceof Error ? error.message : "Erro ao excluir.",
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
        description:
          error instanceof Error ? error.message : "Erro ao excluir.",
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
        description:
          error instanceof Error ? error.message : "Erro ao excluir.",
      });
    } finally {
      setActionDeletingId(null);
    }
  };

  const deleteRiskOpportunity = async (itemId: number) => {
    setRiskDeletingId(itemId);
    try {
      await riskOpportunityCrud.deleteMutation.mutateAsync(itemId);
    } catch (error) {
      toast({
        title: "Falha ao excluir risco ou oportunidade",
        description:
          error instanceof Error ? error.message : "Erro ao excluir.",
      });
    } finally {
      setRiskDeletingId(null);
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
      } else if (issue.includes("risco") || issue.includes("oportunidade")) {
        map.overview = [...(map.overview || []), issue];
      } else if (issue.includes("ação sem ação vinculada")) {
        map.actions = [...(map.actions || []), issue];
      } else {
        map.overview = [...(map.overview || []), issue];
      }
    }
    return map;
  }, [plan?.complianceIssues]);

  const visibleRiskOpportunityItems = useMemo(() => {
    const items = plan?.riskOpportunityItems || [];
    return items.filter((item) => {
      if (riskTypeFilter !== "all" && item.type !== riskTypeFilter) {
        return false;
      }
      if (riskStatusFilter !== "all" && item.status !== riskStatusFilter) {
        return false;
      }
      if (
        riskPriorityFilter !== "all" &&
        item.priority !== riskPriorityFilter
      ) {
        return false;
      }
      if (
        riskUnitFilter !== "all" &&
        String(item.unitId || "") !== riskUnitFilter
      ) {
        return false;
      }
      if (
        riskOwnerFilter !== "all" &&
        String(item.ownerUserId || "") !== riskOwnerFilter
      ) {
        return false;
      }
      if (riskSourceFilter !== "all" && item.sourceType !== riskSourceFilter) {
        return false;
      }
      return true;
    });
  }, [
    plan?.riskOpportunityItems,
    riskOwnerFilter,
    riskPriorityFilter,
    riskSourceFilter,
    riskStatusFilter,
    riskTypeFilter,
    riskUnitFilter,
  ]);

  const riskScorePreview =
    typeof riskLikelihood === "number" && typeof riskImpact === "number"
      ? riskLikelihood * riskImpact
      : null;

  const currentReviewers = plan?.reviewers ?? [];
  const currentReviewer =
    currentReviewers.find((reviewer) => reviewer.userId === user?.id) || null;
  const reviewApprovedCount = currentReviewers.filter(
    (reviewer) => reviewer.status === "approved",
  ).length;
  const reviewRejectedCount = currentReviewers.filter(
    (reviewer) => reviewer.status === "rejected",
  ).length;
  const reviewPendingCount = currentReviewers.filter(
    (reviewer) => reviewer.status === "pending",
  ).length;
  const latestEvidenceDocumentId = plan?.revisions?.[0]?.evidenceDocumentId;
  const activeTabHeaderAction = canEdit
    ? (() => {
        switch (activeTab) {
          case "overview":
            return (
              <HeaderActionButton
                size="sm"
                variant="outline"
                onClick={() =>
                  navigate(`${riskRegisterBase}?planId=${plan.id}`)
                }
                label="Abrir registro deste plano"
                icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
              >
                Abrir registro deste plano
              </HeaderActionButton>
            );
          case "swot":
            return (
              <HeaderActionButton
                size="sm"
                onClick={() => openSwotDialog()}
                label="Novo item"
                icon={<Plus className="h-3.5 w-3.5" />}
              />
            );
          case "interested":
            return (
              <HeaderActionButton
                size="sm"
                onClick={() => openPartyDialog()}
                label="Nova parte"
                icon={<Plus className="h-3.5 w-3.5" />}
              />
            );
          case "objectives":
            return (
              <HeaderActionButton
                size="sm"
                onClick={() => openObjectiveDialog()}
                label="Novo objetivo"
                icon={<Plus className="h-3.5 w-3.5" />}
              />
            );
          case "actions":
            return (
              <HeaderActionButton
                size="sm"
                onClick={() => openActionDialog()}
                label="Nova ação"
                icon={<Plus className="h-3.5 w-3.5" />}
              />
            );
          default:
            return null;
        }
      })()
    : null;

  useHeaderActions(
    <div className="flex items-center gap-2">
      {activeTabHeaderAction}
      {canEdit && (
        <>
          <HeaderActionButton
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
            label="Reimportar"
            icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
          />
          <HeaderActionButton
            size="sm"
            variant="outline"
            onClick={handleSavePlan}
            isLoading={updatePlanMutation.isPending}
            label="Salvar"
            icon={<Pencil className="h-3.5 w-3.5" />}
          />
          <HeaderActionButton
            size="sm"
            onClick={() => handleWorkflow("submit")}
            isLoading={submitMutation.isPending}
            label="Enviar para revisão"
            icon={<Send className="h-3.5 w-3.5" />}
          />
        </>
      )}
      {plan &&
        ["approved", "overdue", "rejected"].includes(plan.status) &&
        isOrgAdmin && (
          <HeaderActionButton
            size="sm"
            variant="outline"
            onClick={() => handleWorkflow("reopen")}
            isLoading={reopenMutation.isPending}
            label="Reabrir rascunho"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
          >
            Reabrir rascunho
          </HeaderActionButton>
        )}
      {latestEvidenceDocumentId && (
        <HeaderActionButton
          size="sm"
          variant="outline"
          onClick={handleOpenEvidence}
          label="Abrir evidência"
          icon={<FileText className="h-3.5 w-3.5" />}
        />
      )}
    </div>,
  );

  if (isLoading || !plan) {
    return (
      <div className="px-6 py-6 text-sm text-muted-foreground">
        Carregando planejamento estratégico...
      </div>
    );
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
                : "text-muted-foreground",
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
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
              Informações do Plano
            </h3>
            {canEdit ? (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="governance-detail-title">Título</Label>
                  <Input
                    id="governance-detail-title"
                    {...planForm.register("title")}
                  />
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
                  <Textarea
                    rows={4}
                    {...planForm.register("executiveSummary")}
                  />
                </div>
                <div>
                  <Label>Frequência de revisão (meses)</Label>
                  <Input
                    type="number"
                    {...planForm.register("reviewFrequencyMonths", {
                      setValueAs: (value) =>
                        value === "" ? 12 : Number(value),
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
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Título
                  </p>
                  <p className="text-[14px] text-foreground">{plan.title}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Normas
                  </p>
                  <p className="text-[14px] text-foreground">
                    {(plan.standards || []).join(", ") || "—"}
                  </p>
                </div>
                <div className="col-span-3">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Resumo Executivo
                  </p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">
                    {plan.executiveSummary || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Frequência de Revisão
                  </p>
                  <p className="text-[14px] text-foreground">
                    {plan.reviewFrequencyMonths} meses
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Próxima Revisão
                  </p>
                  <p className="text-[14px] text-foreground">
                    {formatGovernanceDate(plan.nextReviewAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Motivo da Revisão
                  </p>
                  <p className="text-[14px] text-foreground">
                    {plan.reviewReason || "—"}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
              Mudança Climática
            </h3>
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
                          field.value === null
                            ? ""
                            : field.value
                              ? "sim"
                              : "nao"
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
                  <Textarea
                    rows={3}
                    {...planForm.register("climateChangeJustification")}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Relevância
                  </p>
                  <p className="text-[14px] text-foreground">
                    {plan.climateChangeRelevant === null
                      ? "Não avaliado"
                      : plan.climateChangeRelevant
                        ? "Sim"
                        : "Não"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Justificativa
                  </p>
                  <p className="text-[14px] text-foreground">
                    {plan.climateChangeJustification || "—"}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
              Métricas
            </h3>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-4 xl:grid-cols-7">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                  Itens SWOT
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {plan.metrics.swotCount}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                  Partes Interessadas
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {plan.metrics.interestedPartyCount}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                  Objetivos
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {plan.metrics.objectiveCount}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                  Ações Abertas
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {plan.metrics.openActionCount}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                  Riscos e Oportunidades
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {plan.metrics.riskOpportunityCount}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                  Itens Abertos 6.1
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {plan.metrics.openRiskOpportunityCount}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                  Revisões Atrasadas
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {plan.metrics.overdueRiskOpportunityCount}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
              Evidência Formal
            </h3>
            {latestEvidenceDocumentId ? (
              <p className="text-[14px] text-foreground">
                Última evidência vinculada ao documento #
                {latestEvidenceDocumentId}.
              </p>
            ) : (
              <p className="text-[14px] text-muted-foreground">
                A evidência PDF será gerada automaticamente na aprovação.
              </p>
            )}
          </div>

          <div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-2">
                Registro ISO 6.1
              </h3>
              <p className="text-[13px] text-muted-foreground">
                O cadastro operacional de riscos e oportunidades agora fica no
                registro dedicado de Governança.
              </p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                  Total
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {plan.metrics.riskOpportunityCount}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                  Abertos
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {plan.metrics.openRiskOpportunityCount}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                  Revisão vencida
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {plan.metrics.overdueRiskOpportunityCount}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                  Riscos
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {plan.metrics.riskOpportunitiesByType.risk || 0}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                  Oportunidades
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {plan.metrics.riskOpportunitiesByType.opportunity || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "scope" && (
        <div className="space-y-10">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
              Escopo
            </h3>
            {canEdit ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Escopo técnico</Label>
                  <Textarea rows={3} {...planForm.register("technicalScope")} />
                </div>
                <div>
                  <Label>Escopo geográfico</Label>
                  <Textarea
                    rows={3}
                    {...planForm.register("geographicScope")}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Escopo Técnico
                  </p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">
                    {plan.technicalScope || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Escopo Geográfico
                  </p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">
                    {plan.geographicScope || "—"}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
              Direcionamento Estratégico
            </h3>
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
                  <Textarea
                    rows={3}
                    {...planForm.register("strategicConclusion")}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Política
                  </p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">
                    {plan.policy || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Missão
                  </p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">
                    {plan.mission || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Visão
                  </p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">
                    {plan.vision || "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Valores
                  </p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">
                    {plan.values || "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Conclusão Estratégica
                  </p>
                  <p className="text-[14px] text-foreground whitespace-pre-line">
                    {plan.strategicConclusion || "—"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "swot" && (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              Matriz SWOT
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Itens de contexto interno e externo com decisão de tratamento.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                    Domínio
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                    Tipo
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                    Descrição
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                    Resultado
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                    Tratamento
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                    Objetivo
                  </th>
                  {canEdit && (
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]"></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {plan.swotItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-3 text-foreground">
                      {item.domain.toUpperCase()}
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {getSwotTypeLabel(item.swotType)}
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {item.description}
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {item.result ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {item.treatmentDecision || "—"}
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {item.linkedObjectiveLabel ||
                        item.linkedObjectiveCode ||
                        "—"}
                    </td>
                    {canEdit && (
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            title="Criar risco ou oportunidade"
                            onClick={() => openRiskOpportunityFromSwot(item)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openSwotDialog(item)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
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
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                Nenhum item SWOT cadastrado.
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === "interested" && (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              Partes Interessadas
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Requisitos relevantes ao contexto do sistema de gestão.
            </p>
          </div>
          <div className="space-y-px">
            {plan.interestedParties.map((item) => (
              <div
                key={item.id}
                className="group flex items-start justify-between gap-4 py-4 border-b border-border/40"
              >
                <div>
                  <h4 className="text-[14px] font-medium text-foreground">
                    {item.name}
                  </h4>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {item.expectedRequirements || "Sem requisitos descritos."}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => openPartyDialog(item)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
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
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                Nenhuma parte interessada cadastrada.
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === "objectives" && (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              Objetivos Estratégicos
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Objetivos vinculados ao contexto e aos desdobramentos do plano.
            </p>
          </div>
          <div className="space-y-px">
            {plan.objectives.map((item) => (
              <div
                key={item.id}
                className="group flex items-start justify-between gap-4 py-4 border-b border-border/40"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[12px] font-medium text-foreground">
                      {item.code}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {item.systemDomain || "Sem sistema"}
                    </span>
                  </div>
                  <h4 className="mt-2 text-[14px] font-medium text-foreground">
                    {item.description}
                  </h4>
                  {item.notes && (
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {item.notes}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => openObjectiveDialog(item)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
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
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                Nenhum objetivo cadastrado.
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === "risks" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                Riscos e Oportunidades
              </h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Levantamento, avaliação, resposta e verificação de eficácia para
                o item 6.1.
              </p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => openRiskOpportunityDialog()}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Novo item
              </Button>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div>
              <Label>Tipo</Label>
              <Select
                value={riskTypeFilter}
                onChange={(event) => setRiskTypeFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                <option value="risk">Riscos</option>
                <option value="opportunity">Oportunidades</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={riskStatusFilter}
                onChange={(event) => setRiskStatusFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                <option value="identified">Identificado</option>
                <option value="assessed">Avaliado</option>
                <option value="responding">Em tratamento</option>
                <option value="awaiting_effectiveness">
                  Aguardando eficácia
                </option>
                <option value="effective">Eficaz</option>
                <option value="ineffective">Ineficaz</option>
                <option value="continuous">Contínuo</option>
                <option value="canceled">Cancelado</option>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select
                value={riskPriorityFilter}
                onChange={(event) => setRiskPriorityFilter(event.target.value)}
              >
                <option value="all">Todas</option>
                <option value="critical">Crítico</option>
                <option value="high">Alto</option>
                <option value="medium">Médio</option>
                <option value="low">Baixo</option>
                <option value="na">Sem score</option>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select
                value={riskUnitFilter}
                onChange={(event) => setRiskUnitFilter(event.target.value)}
              >
                <option value="all">Todas</option>
                {units.map((unit) => (
                  <option key={unit.id} value={String(unit.id)}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Responsável</Label>
              <Select
                value={riskOwnerFilter}
                onChange={(event) => setRiskOwnerFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                {users.map((user: UserOption) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Origem</Label>
              <Select
                value={riskSourceFilter}
                onChange={(event) => setRiskSourceFilter(event.target.value)}
              >
                <option value="all">Todas</option>
                <option value="swot">SWOT</option>
                <option value="audit">Auditoria</option>
                <option value="meeting">Reunião</option>
                <option value="legislation">Legislação</option>
                <option value="incident">Incidente</option>
                <option value="internal_strategy">Estratégia interna</option>
                <option value="other">Outra</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                Total
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {plan.metrics.riskOpportunityCount}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                Abertos
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {plan.metrics.openRiskOpportunityCount}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                Revisão vencida
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {plan.metrics.overdueRiskOpportunityCount}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                Riscos
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {plan.metrics.riskOpportunitiesByType.risk || 0}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                Oportunidades
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {plan.metrics.riskOpportunitiesByType.opportunity || 0}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {visibleRiskOpportunityItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-border/60 bg-card px-5 py-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {getRiskTypeLabel(item.type)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border",
                          getRiskPriorityTone(item.priority),
                        )}
                      >
                        {getRiskPriorityLabel(item.priority)}
                      </Badge>
                      <Badge variant="outline">
                        {getRiskStatusLabel(item.status)}
                      </Badge>
                      <Badge variant="outline">
                        {getRiskSourceLabel(item.sourceType)}
                      </Badge>
                    </div>
                    <div>
                      <h4 className="text-[15px] font-semibold text-foreground">
                        {item.title}
                      </h4>
                      <p className="mt-1 text-[13px] text-muted-foreground whitespace-pre-line">
                        {item.description}
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                          Responsável
                        </p>
                        <p className="mt-1 text-[13px] text-foreground">
                          {item.ownerUserName || "Não definido"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                          Unidade
                        </p>
                        <p className="mt-1 text-[13px] text-foreground">
                          {item.unitName || "Não definida"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                          Avaliação
                        </p>
                        <p className="mt-1 text-[13px] text-foreground">
                          {item.likelihood ?? "—"} x {item.impact ?? "—"} ={" "}
                          {item.score ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                          Próxima revisão
                        </p>
                        <p className="mt-1 text-[13px] text-foreground">
                          {formatGovernanceDate(item.nextReviewAt)}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                          Estratégia de resposta
                        </p>
                        <p className="mt-1 text-[13px] text-foreground">
                          {getRiskResponseStrategyLabel(item.responseStrategy)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                          Última eficácia
                        </p>
                        <p className="mt-1 text-[13px] text-foreground">
                          {item.latestEffectivenessReview
                            ? `${item.latestEffectivenessReview.result === "effective" ? "Eficaz" : "Ineficaz"} em ${formatGovernanceDate(
                                item.latestEffectivenessReview.createdAt,
                                true,
                              )}`
                            : "Sem revisão"}
                        </p>
                      </div>
                    </div>
                    {item.expectedEffect && (
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                          Efeito esperado
                        </p>
                        <p className="mt-1 text-[13px] text-muted-foreground whitespace-pre-line">
                          {item.expectedEffect}
                        </p>
                      </div>
                    )}
                    <div className="rounded-xl bg-muted/30 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                            Ações vinculadas
                          </p>
                          <p className="mt-1 text-[13px] text-muted-foreground">
                            {item.actions.length} ação(ões) associada(s) ao
                            tratamento.
                          </p>
                        </div>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              openActionDialog(undefined, {
                                objectiveId: item.objectiveId || null,
                                riskOpportunityItemId: item.id,
                                responsibleUserId: item.ownerUserId || null,
                                secondaryResponsibleUserId:
                                  item.coOwnerUserId || null,
                                swotItemId: item.swotItemId || null,
                                unitIds: item.unitId ? [item.unitId] : [],
                              })
                            }
                          >
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Nova ação vinculada
                          </Button>
                        )}
                      </div>
                      {item.actions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {item.actions.map((action) => (
                            <div
                              key={action.id}
                              className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-[13px] md:flex-row md:items-center md:justify-between"
                            >
                              <div>
                                <p className="font-medium text-foreground">
                                  {action.title}
                                </p>
                                <p className="text-muted-foreground">
                                  {action.responsibleUserName ||
                                    "Sem responsável"}{" "}
                                  · prazo{" "}
                                  {formatGovernanceDate(
                                    action.rescheduledDueDate || action.dueDate,
                                  )}
                                </p>
                              </div>
                              <Badge variant="outline">{action.status}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openRiskEffectivenessDialog(item)}
                      >
                        Registrar eficácia
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openRiskOpportunityDialog(item)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void deleteRiskOpportunity(item.id)}
                        disabled={riskDeletingId === item.id}
                      >
                        {riskDeletingId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Excluir
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {visibleRiskOpportunityItems.length === 0 && (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                {plan.riskOpportunityItems.length === 0
                  ? "Nenhum risco ou oportunidade cadastrado."
                  : "Nenhum item atende aos filtros aplicados."}
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === "actions" && (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              Ações
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Desdobramentos por unidade, responsáveis e prazos.
            </p>
          </div>
          <div className="space-y-px">
            {plan.actions.map((item) => (
              <div
                key={item.id}
                className="group flex items-start justify-between gap-4 py-4 border-b border-border/40"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[12px] font-medium text-foreground">
                      {item.status}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      Prazo: {formatGovernanceDate(item.dueDate)}
                    </span>
                  </div>
                  <h4 className="mt-2 text-[14px] font-medium text-foreground">
                    {item.title}
                  </h4>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {item.description || "Sem descrição."}
                  </p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    Responsável: {item.responsibleUserName || "Não definido"} ·
                    Unidades:{" "}
                    {item.units.map((unit) => unit.name).join(", ") ||
                      "Nenhuma"}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => openActionDialog(item)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
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
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                Nenhuma ação cadastrada.
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === "revisions" && (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              Revisões e Evidências
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Configure os revisores, acompanhe leituras/aprovações e consulte o
              histórico formal de revisões aprovadas.
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background p-5 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold">Revisores da revisão</h4>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Selecione quem precisa acusar leitura e registrar aprovação ou
                  rejeição desta revisão.
                </p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSavePlan}
                  isLoading={updatePlanMutation.isPending}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Salvar revisores
                </Button>
              )}
            </div>

            {canEdit ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {users.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Nenhum usuário disponível para revisão.
                  </p>
                ) : (
                  users.map((option) => {
                    const checked = configuredReviewerIds.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className="flex items-start gap-3 rounded-xl border border-border/60 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/30"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            planForm.setValue(
                              "reviewerIds",
                              toggleMultiSelectValue(
                                configuredReviewerIds,
                                option.id,
                              ),
                              { shouldDirty: true },
                            )
                          }
                        />
                        <span className="text-sm leading-5">{option.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {configuredReviewerIds.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Nenhum revisor configurado.
                  </p>
                ) : (
                  configuredReviewerIds.map((reviewerId) => {
                    const reviewerName =
                      users.find((option) => option.id === reviewerId)?.name ||
                      `Usuário #${reviewerId}`;
                    return (
                      <span
                        key={reviewerId}
                        className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-3 py-1 text-[12px] font-medium"
                      >
                        {reviewerName}
                      </span>
                    );
                  })
                )}
              </div>
            )}

            {!canEdit && plan.status === "in_review" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Aprovados
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {reviewApprovedCount}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Rejeitados
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {reviewRejectedCount}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Pendentes
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {reviewPendingCount}
                  </p>
                </div>
              </div>
            )}

            {currentReviewers.length > 0 && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">
                    Ciclo atual de revisão
                  </h4>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Cada revisor deve acusar a leitura antes de aprovar ou
                    rejeitar. A revisão só sai de pendente quando todos
                    registrarem decisão.
                  </p>
                </div>

                <div className="space-y-3">
                  {currentReviewers.map((reviewer) => (
                    <div
                      key={reviewer.id}
                      className="rounded-xl border border-border/60 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">
                              {reviewer.name}
                            </p>
                            <Badge
                              variant="outline"
                              className={getReviewerStatusTone(reviewer.status)}
                            >
                              {getReviewerStatusLabel(reviewer.status)}
                            </Badge>
                            {reviewer.readAt ? (
                              <span className="text-[12px] text-muted-foreground">
                                Leitura em{" "}
                                {formatGovernanceDate(reviewer.readAt, true)}
                              </span>
                            ) : (
                              <span className="text-[12px] text-muted-foreground">
                                Leitura pendente
                              </span>
                            )}
                          </div>
                          {reviewer.decidedAt && (
                            <p className="mt-1 text-[13px] text-muted-foreground">
                              Parecer registrado em{" "}
                              {formatGovernanceDate(reviewer.decidedAt, true)}
                            </p>
                          )}
                          {reviewer.comment && (
                            <p className="mt-2 text-[13px] text-muted-foreground">
                              {reviewer.comment}
                            </p>
                          )}
                        </div>

                        {currentReviewer?.id === reviewer.id &&
                          reviewer.status === "pending" && (
                            <div className="flex flex-wrap gap-2">
                              {!reviewer.readAt ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleAcknowledgeReviewRead}
                                  isLoading={reviewReadMutation.isPending}
                                >
                                  Registrar leitura
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleApproveReview}
                                    isLoading={approveMutation.isPending}
                                  >
                                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                    Aprovar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setReviewDecisionDialogOpen(true)
                                    }
                                    isLoading={rejectMutation.isPending}
                                  >
                                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                    Rejeitar
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-px">
            {plan.revisions.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                Nenhuma revisão aprovada ainda.
              </p>
            ) : (
              plan.revisions.map((revision) => (
                <div
                  key={revision.id}
                  className="flex items-center justify-between gap-4 py-4 border-b border-border/40"
                >
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[12px] font-medium text-foreground">
                        R{revision.revisionNumber}
                      </span>
                      <span className="text-[13px] text-muted-foreground">
                        {formatGovernanceDate(revision.revisionDate, true)}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      Motivo: {revision.reason || "—"} · Aprovado por:{" "}
                      {revision.approvedByName || "—"}
                    </p>
                    {(revision.reviewers?.length || 0) > 0 && (
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        Revisores:{" "}
                        {(revision.reviewers || [])
                          .map((reviewer) => reviewer.name)
                          .join(", ")}
                      </p>
                    )}
                    {revision.changeSummary && (
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {revision.changeSummary}
                      </p>
                    )}
                  </div>
                  {revision.evidenceDocumentId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/qualidade/documentacao/${revision.evidenceDocumentId}`,
                        )
                      }
                    >
                      Ver documento
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Dialog
        open={reviewDecisionDialogOpen}
        onOpenChange={(open) => {
          setReviewDecisionDialogOpen(open);
          if (!open) setReviewDecisionComment("");
        }}
        title="Rejeitar revisão"
        description="Explique o motivo da rejeição e sugira as alterações necessárias para nova submissão."
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="review-rejection-comment">
              Justificativa da rejeição
            </Label>
            <Textarea
              id="review-rejection-comment"
              className="mt-2 min-h-[140px]"
              value={reviewDecisionComment}
              onChange={(event) => setReviewDecisionComment(event.target.value)}
              placeholder="Descreva o que precisa ser ajustado para que a revisão possa ser aprovada."
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setReviewDecisionDialogOpen(false);
              setReviewDecisionComment("");
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleRejectReview}
            isLoading={rejectMutation.isPending}
          >
            Confirmar rejeição
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Reimportar planilha"
        description="Sobrescreve o rascunho atual com os dados do arquivo."
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold">
                  Modelo CSV com campos explicados
                </p>
                <p className="text-sm text-muted-foreground">
                  Baixe um exemplo com as colunas, origem dos dados e instruções
                  de preenchimento para montar ou revisar a planilha fonte.
                </p>
                <p className="text-xs text-muted-foreground">
                  A importação automática continua usando arquivo{" "}
                  <strong>.xlsx</strong> com as abas esperadas pelo sistema.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={downloadGovernanceImportExampleCsv}
                className="shrink-0"
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Baixar CSV modelo
              </Button>
            </div>
          </div>
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleWorkbookSelect}
          />
          {importPreview && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    SWOT
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {importPreview.swotCount}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Partes
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {importPreview.interestedPartyCount}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Objetivos
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {importPreview.objectiveCount}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
                  {(importPreview.anomalies.length > 0
                    ? importPreview.anomalies
                    : ["Nenhuma anomalia detectada na leitura inicial."]
                  ).map((issue, index) => (
                    <li key={`${index}-${issue}`}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setImportOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleImportWorkbook}
            disabled={!importPreview}
            isLoading={importPlanMutation.isPending}
          >
            Sobrescrever rascunho
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={swotDialogOpen}
        onOpenChange={setSwotDialogOpen}
        title={swotEditing ? "Editar item SWOT" : "Novo item SWOT"}
        size="lg"
      >
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
                setValueAs: (value) =>
                  value === "" || value == null ? null : Number(value),
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
          <Button
            onClick={saveSwot}
            isLoading={
              swotCrud.createMutation.isPending ||
              swotCrud.updateMutation.isPending
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={partyDialogOpen}
        onOpenChange={setPartyDialogOpen}
        title={
          partyEditing ? "Editar parte interessada" : "Nova parte interessada"
        }
        size="lg"
      >
        <div className="grid gap-4">
          <div>
            <Label>Nome</Label>
            <Input {...partyForm.register("name")} />
          </div>
          <div>
            <Label>Requisitos esperados</Label>
            <Textarea
              rows={3}
              {...partyForm.register("expectedRequirements")}
            />
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
          <Button
            onClick={saveParty}
            isLoading={
              interestedCrud.createMutation.isPending ||
              interestedCrud.updateMutation.isPending
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={objectiveDialogOpen}
        onOpenChange={setObjectiveDialogOpen}
        title={objectiveEditing ? "Editar objetivo" : "Novo objetivo"}
        size="lg"
      >
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
          <Button
            onClick={saveObjective}
            isLoading={
              objectiveCrud.createMutation.isPending ||
              objectiveCrud.updateMutation.isPending
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={riskDialogOpen}
        onOpenChange={setRiskDialogOpen}
        title={
          riskEditing
            ? "Editar risco ou oportunidade"
            : "Novo risco ou oportunidade"
        }
        description="Registro ISO 9001:2015 §6.1 com avaliação, resposta e revisão."
        size="lg"
      >
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Tipo</Label>
              <Select {...riskOpportunityForm.register("type")}>
                <option value="risk">Risco</option>
                <option value="opportunity">Oportunidade</option>
              </Select>
            </div>
            <div>
              <Label>Origem</Label>
              <Select {...riskOpportunityForm.register("sourceType")}>
                <option value="meeting">Reunião</option>
                <option value="swot">SWOT</option>
                <option value="audit">Auditoria</option>
                <option value="legislation">Legislação</option>
                <option value="incident">Incidente</option>
                <option value="internal_strategy">Estratégia interna</option>
                <option value="other">Outra</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select {...riskOpportunityForm.register("status")}>
                <option value="identified">Identificado</option>
                <option value="assessed">Avaliado</option>
                <option value="responding">Em tratamento</option>
                <option value="awaiting_effectiveness">
                  Aguardando eficácia
                </option>
                <option value="effective">Eficaz</option>
                <option value="ineffective">Ineficaz</option>
                <option value="continuous">Contínuo</option>
                <option value="canceled">Cancelado</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Título</Label>
            <Input {...riskOpportunityForm.register("title")} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              rows={4}
              {...riskOpportunityForm.register("description")}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Responsável</Label>
              <Select
                {...riskOpportunityForm.register("ownerUserId", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Não definido</option>
                {users.map((user: UserOption) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Co-responsável</Label>
              <Select
                {...riskOpportunityForm.register("coOwnerUserId", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Não definido</option>
                {users.map((user: UserOption) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select
                {...riskOpportunityForm.register("unitId", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Não definida</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Objetivo vinculado</Label>
              <Select
                {...riskOpportunityForm.register("objectiveId", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Sem vínculo</option>
                {plan.objectives.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.description}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Item SWOT vinculado</Label>
              <Select
                {...riskOpportunityForm.register("swotItemId", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Sem vínculo</option>
                {plan.swotItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.description}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
            <div>
              <Label>Probabilidade</Label>
              <Input
                type="number"
                min={1}
                max={4}
                {...riskOpportunityForm.register("likelihood", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              />
            </div>
            <div>
              <Label>Impacto</Label>
              <Input
                type="number"
                min={1}
                max={4}
                {...riskOpportunityForm.register("impact", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              />
            </div>
            <div>
              <Label>Próxima revisão</Label>
              <Input
                type="date"
                {...riskOpportunityForm.register("nextReviewAt")}
              />
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                Score
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {riskScorePreview ?? "—"}
              </p>
            </div>
          </div>
          <div>
            <Label>Estratégia de resposta</Label>
            <Select
              {...riskOpportunityForm.register("responseStrategy", {
                setValueAs: (value) => (value === "" ? null : value),
              })}
            >
              <option value="">Não definida</option>
              <option value="mitigate">Mitigar</option>
              <option value="eliminate">Eliminar</option>
              <option value="accept">Aceitar</option>
              <option value="monitor">Monitorar</option>
              <option value="exploit">Explorar</option>
              <option value="enhance">Potencializar</option>
              <option value="share">Compartilhar</option>
              <option value="avoid">Evitar</option>
              <option value="other">Outra</option>
            </Select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Controles existentes</Label>
              <Textarea
                rows={3}
                {...riskOpportunityForm.register("existingControls")}
              />
            </div>
            <div>
              <Label>Efeito esperado</Label>
              <Textarea
                rows={3}
                {...riskOpportunityForm.register("expectedEffect")}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Referência de origem</Label>
              <Input {...riskOpportunityForm.register("sourceReference")} />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea rows={3} {...riskOpportunityForm.register("notes")} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              riskOpportunityForm.reset(blankRiskOpportunityForm());
              setRiskDialogOpen(false);
              setRiskEditing(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={saveRiskOpportunity}
            isLoading={
              riskOpportunityCrud.createMutation.isPending ||
              riskOpportunityCrud.updateMutation.isPending
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={riskEffectivenessDialogOpen}
        onOpenChange={setRiskEffectivenessDialogOpen}
        title="Verificação de eficácia"
        description={
          riskEffectivenessTarget
            ? `Registrar o resultado da resposta para "${riskEffectivenessTarget.title}".`
            : "Registrar o resultado da resposta."
        }
        size="md"
      >
        <div className="grid gap-4">
          <div>
            <Label>Resultado</Label>
            <Select {...riskEffectivenessForm.register("result")}>
              <option value="effective">Eficaz</option>
              <option value="ineffective">Ineficaz</option>
            </Select>
          </div>
          <div>
            <Label>Comentário</Label>
            <Textarea rows={4} {...riskEffectivenessForm.register("comment")} />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              riskEffectivenessForm.reset(blankRiskEffectivenessReview());
              setRiskEffectivenessDialogOpen(false);
              setRiskEffectivenessTarget(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={saveRiskEffectivenessReview}
            isLoading={riskEffectivenessReviewMutation.isPending}
          >
            Salvar revisão
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        title={actionEditing ? "Editar ação" : "Nova ação"}
        size="lg"
      >
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
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Não definido</option>
                {users.map((user: UserOption) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Co-responsável</Label>
              <Select
                {...actionForm.register("secondaryResponsibleUserId", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Não definido</option>
                {users.map((user: UserOption) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
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
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Item SWOT vinculado</Label>
              <Select
                {...actionForm.register("swotItemId", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Sem vínculo</option>
                {plan.swotItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.description}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Objetivo vinculado</Label>
              <Select
                {...actionForm.register("objectiveId", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Sem vínculo</option>
                {plan.objectives.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.description}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Risco ou oportunidade vinculado</Label>
              <Select
                {...actionForm.register("riskOpportunityItemId", {
                  setValueAs: (value) =>
                    value === "" || value == null ? null : Number(value),
                })}
              >
                <option value="">Sem vínculo</option>
                {plan.riskOpportunityItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{getRiskTypeLabel(item.type)}] {item.title}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Prazo reprogramado</Label>
              <Input
                type="date"
                {...actionForm.register("rescheduledDueDate")}
              />
            </div>
            <div>
              <Label>Data de conclusão</Label>
              <Input type="date" {...actionForm.register("completedAt")} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Motivo da reprogramação</Label>
              <Textarea rows={3} {...actionForm.register("rescheduleReason")} />
            </div>
            <div>
              <Label>Notas de conclusão</Label>
              <Textarea rows={3} {...actionForm.register("completionNotes")} />
            </div>
          </div>
          <div>
            <Label>Unidades impactadas</Label>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {units.map((unit) => (
                <label
                  key={unit.id}
                  className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
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
          <Button
            onClick={saveAction}
            isLoading={
              actionCrud.createMutation.isPending ||
              actionCrud.updateMutation.isPending
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
