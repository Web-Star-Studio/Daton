import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getListLegislationsQueryKey,
  getListUnitsQueryKey,
  useListLegislations,
  useListUnits,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import {
  FileWarning,
  Leaf,
  Pencil,
  Plus,
  Radar,
  Save,
  Trash2,
  Workflow,
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
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { DialogStepTabs } from "@/components/ui/dialog-step-tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  createLaiaMonitoringPlan,
  useCreateLaiaAssessment,
  useCreateLaiaSector,
  useLaiaAssessment,
  useLaiaAssessments,
  useLaiaBranchConfigs,
  useLaiaDashboard,
  useLaiaMethodology,
  useLaiaRevisions,
  useLaiaSectors,
  usePublishLaiaMethodology,
  useUpdateLaiaAssessment,
  type LaiaAssessmentDetail,
  type LaiaAssessmentInput,
  type LaiaAssessmentListFilters,
} from "@/lib/environmental-laia-client";

type SectorFormState = {
  code: string;
  name: string;
  unitId: string;
  description: string;
};

type MethodologyFormState = {
  name: string;
  title: string;
  negligibleMax: string;
  moderateMax: string;
  moderateSignificanceRule: string;
  notes: string;
  objetivo: string;
  aplicacao: string;
  generalidades: string;
  definicoes: Array<{ termo: string; descricao: string }>;
  responsabilidades: Array<{ cargo: string; atribuicoes: string }>;
  procedimentoLevantamento: string;
  procedimentoAnalise: string;
  classificacaoAssuntos: string[];
  classificacaoAplicabilidade: Array<{
    codigo: string;
    nome: string;
    descricao: string;
  }>;
  niveisAtendimento: Array<{ nivel: string; nome: string; descricao: string }>;
  outrosRequisitos: string;
};

type AssessmentFormState = {
  mode: "quick" | "complete";
  status: "draft" | "active";
  unitId: string;
  sectorId: string;
  activityOperation: string;
  environmentalAspect: string;
  environmentalImpact: string;
  temporality: string;
  operationalSituation: string;
  incidence: string;
  impactClass: string;
  scope: string;
  severity: string;
  consequenceScore: string;
  frequencyProbability: string;
  frequencyProbabilityScore: string;
  totalScore: string;
  category: "desprezivel" | "moderado" | "critico" | "";
  significance: "significant" | "not_significant" | "";
  significanceReason: string;
  hasLegalRequirements: boolean;
  hasStakeholderDemand: boolean;
  hasStrategicOption: boolean;
  existingControls: string;
  controlRequired: string;
  communicationRequired: boolean;
  communicationNotes: string;
  reviewFrequencyDays: string;
  nextReviewAt: string;
  normalCondition: boolean;
  abnormalCondition: boolean;
  startupShutdown: boolean;
  emergencyScenario: string;
  changeContext: string;
  lifecycleStagesText: string;
  controlLevel: "direct_control" | "influence" | "none";
  influenceLevel: string;
  outsourcedProcess: string;
  supplierReference: string;
  legalRequirementId: string;
  legalRequirementTitle: string;
  legalRequirementReference: string;
  legalRequirementDescription: string;
  monitoringTitle: string;
  monitoringObjective: string;
  monitoringMethod: string;
  monitoringFrequency: string;
  monitoringNextDueAt: string;
};

type AssessmentDialogSession = {
  mode: "create" | "edit";
  assessmentId: number | null;
  draftAssessmentId: number | null;
};

type AssessmentDraftCache = {
  form: AssessmentFormState;
  step: number;
  draftAssessmentId: number | null;
};

type MatrixFiltersState = {
  q: string;
  unitId: string;
  sectorId: string;
  status: "" | "draft" | "active" | "archived";
  category: "" | "desprezivel" | "moderado" | "critico";
  significance: "" | "significant" | "not_significant";
};

const DEFAULT_METHODOLOGY_FORM: MethodologyFormState = {
  name: "Metodologia LAIA",
  title: "Metodologia LAIA v1",
  negligibleMax: "49",
  moderateMax: "70",
  moderateSignificanceRule:
    "Moderado é significativo quando houver requisito legal, parte interessada ou opção estratégica.",
  notes: "",
  objetivo:
    "Estabelecer e manter uma sistematica para o levantamento, atualizacao, analise e controle de atendimento aos requisitos legais aplicaveis a empresa, nas esferas Federal, Estadual e Municipal, e demais requisitos aplicaveis, baseando-se nos aspectos e impactos identificados nas atividades, produtos e servicos da organizacao.\n\nEstabelecer, implementar e manter as condicoes para a verificacao periodica do atendimento a conformidade legal.",
  aplicacao:
    "Este documento aplica-se a todas as atividades e servicos a ser executado na organizacao, em todas as suas filiais e unidades operacionais.",
  generalidades:
    "Assegurar que os requisitos legais aplicaveis e outros requisitos sejam controlados e levados em consideracao pela Organizacao.",
  definicoes: [
    {
      termo: "Outros Requisitos",
      descricao:
        "Obrigacoes dos Produtos/Servicos da organizacao, decorrentes de compromissos formalmente estabelecidos com partes interessadas relativos a Qualidade, Seguranca Viaria e Meio Ambiente.",
    },
    {
      termo: "Legislacao Aplicavel",
      descricao:
        "Conjunto de documentos legais relativos a Qualidade, Seguranca Viaria e Meio Ambiente relacionados com as atividades dos produtos/servicos da organizacao.",
    },
    {
      termo: "Requisitos Legais",
      descricao:
        "Requisitos contidos na legislacao, atos normativos e regulamentares emitidos pela autoridade publica aplicaveis aos produtos/servicos da organizacao.",
    },
  ],
  responsabilidades: [
    {
      cargo: "Coordenador do SGI",
      atribuicoes:
        "Gerenciar o processo de levantamento, e realizar a atualizacao e analise de atendimento dos requisitos legais aplicaveis.",
    },
    {
      cargo: "Gerencias",
      atribuicoes:
        "Fazer com que os requisitos legais aplicaveis sejam cumpridos.",
    },
    {
      cargo: "Diretoria",
      atribuicoes:
        "Deliberar recursos e condicoes para o cumprimento dos requisitos legais aplicaveis.",
    },
    {
      cargo: "Fornecedor de Assessoria em Legislacao Ambiental",
      atribuicoes:
        "Efetuar o levantamento de requisitos legais ambientais aplicaveis, nos niveis Federal, Estadual e Municipal.",
    },
  ],
  procedimentoLevantamento:
    "Utilizando-se da base de dados contendo os requisitos legais nos niveis Federal, Estadual e Municipal, segregar e enviar as legislacoes ambientais a Empresa. Com posse das novas legislacoes, sera verificada a aplicacao em relacao a Empresa. Caso as legislacoes sejam aplicaveis, efetuar a verificacao atraves do nivel de atendimento. Caso nao sejam aplicaveis, identifica-las na planilha como 'para conhecimento' para consultas futuras.",
  procedimentoAnalise:
    "Para legislacoes conformes: 1) Checar a(s) evidencia(s); 2) Verificar pertinencia de prazo de validade; 3) Verificar a possibilidade de novas acoes para melhoria. Para legislacoes nao conformes: Determinar acoes para o atendimento aos requisitos legais. A verificacao de atendimento sera trimestral.",
  classificacaoAssuntos: [
    "Licenciamento e Documentacao",
    "Recursos Naturais",
    "Residuos",
    "Efluentes",
    "Emissoes Atmosfericas",
    "Ruido Ambiental",
    "Inflamaveis",
    "Emergencias",
    "Produtos Quimicos",
    "Crime Ambiental",
    "Ar Condicionado",
    "Transporte de Residuos Perigosos",
    "Poluicao das Aguas",
    "Responsabilidade Tecnica",
  ],
  classificacaoAplicabilidade: [
    {
      codigo: "S",
      nome: "Aplicavel",
      descricao: "Relacao direta com os processos da empresa.",
    },
    {
      codigo: "E",
      nome: "Especifica",
      descricao:
        "Aplicavel em situacoes especificas, aplicacao restrita a determinados periodos.",
    },
    {
      codigo: "N",
      nome: "Nao Aplicavel",
      descricao: "Apenas para consulta: legislacao armazenada para referencia.",
    },
  ],
  niveisAtendimento: [
    {
      nivel: "1",
      nome: "Atendido",
      descricao:
        "Todos os requisitos sao pertinentes e possuem evidencias do atendimento.",
    },
    {
      nivel: "2",
      nome: "Parcial",
      descricao:
        "Parte dos requisitos sao atendidos e alguns itens estao em adequacao.",
    },
    {
      nivel: "3",
      nome: "Nao atendido",
      descricao: "Requisito legal nao atendido.",
    },
  ],
  outrosRequisitos:
    "A identificacao de outras obrigacoes (autorizacoes, outorgas, alvaras, licencas e suas condicionantes) ocorre como consequencia de solicitacoes de orgaos publicos competentes e outras partes interessadas. Para o atendimento a essas solicitacoes podem ser formalizados contratos, convenios, termos de compromisso, ou outros acordos com as partes interessadas.",
};

const DEFAULT_ASSESSMENT_FORM: AssessmentFormState = {
  mode: "quick",
  status: "draft",
  unitId: "",
  sectorId: "",
  activityOperation: "",
  environmentalAspect: "",
  environmentalImpact: "",
  temporality: "",
  operationalSituation: "",
  incidence: "",
  impactClass: "",
  scope: "",
  severity: "",
  consequenceScore: "",
  frequencyProbability: "",
  frequencyProbabilityScore: "",
  totalScore: "",
  category: "",
  significance: "",
  significanceReason: "",
  hasLegalRequirements: false,
  hasStakeholderDemand: false,
  hasStrategicOption: false,
  existingControls: "",
  controlRequired: "",
  communicationRequired: false,
  communicationNotes: "",
  reviewFrequencyDays: "",
  nextReviewAt: "",
  normalCondition: true,
  abnormalCondition: false,
  startupShutdown: false,
  emergencyScenario: "",
  changeContext: "",
  lifecycleStagesText: "",
  controlLevel: "direct_control",
  influenceLevel: "",
  outsourcedProcess: "",
  supplierReference: "",
  legalRequirementId: "",
  legalRequirementTitle: "",
  legalRequirementReference: "",
  legalRequirementDescription: "",
  monitoringTitle: "",
  monitoringObjective: "",
  monitoringMethod: "",
  monitoringFrequency: "",
  monitoringNextDueAt: "",
};

const DEFAULT_MATRIX_FILTERS: MatrixFiltersState = {
  q: "",
  unitId: "",
  sectorId: "",
  status: "",
  category: "",
  significance: "",
};

const ASSESSMENT_DRAFT_STORAGE_KEY = "laia-assessment-dialog-draft";
const ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY = "laia-assessment-remote-draft-id";

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function localDateToIso(value: string): string | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
}

function isoToLocalDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function normalizeAssessmentPayload(
  form: AssessmentFormState,
): LaiaAssessmentInput {
  const requirements =
    form.legalRequirementTitle.trim() || form.legalRequirementId
      ? [
          {
            type: "legal" as const,
            title:
              form.legalRequirementTitle.trim() ||
              `Legislação #${form.legalRequirementId}`,
            legislationId: parseOptionalNumber(form.legalRequirementId) ?? null,
            requirementReference: form.legalRequirementReference.trim() || null,
            description: form.legalRequirementDescription.trim() || null,
          },
        ]
      : undefined;

  const communicationPlans =
    form.communicationRequired && form.communicationNotes.trim()
      ? [
          {
            channel: "interna",
            audience: "colaboradores impactados",
            periodicity: "sob_demanda",
            notes: form.communicationNotes.trim(),
          },
        ]
      : undefined;

  return {
    unitId: parseOptionalNumber(form.unitId) ?? null,
    sectorId: parseOptionalNumber(form.sectorId) ?? null,
    mode: form.mode,
    status: form.status,
    activityOperation: form.activityOperation.trim(),
    environmentalAspect: form.environmentalAspect.trim(),
    environmentalImpact: form.environmentalImpact.trim(),
    temporality: form.temporality.trim() || null,
    operationalSituation: form.operationalSituation.trim() || null,
    incidence: form.incidence.trim() || null,
    impactClass: form.impactClass.trim() || null,
    scope: form.scope.trim() || null,
    severity: form.severity.trim() || null,
    consequenceScore: parseOptionalNumber(form.consequenceScore) ?? null,
    frequencyProbability: form.frequencyProbability.trim() || null,
    frequencyProbabilityScore:
      parseOptionalNumber(form.frequencyProbabilityScore) ?? null,
    totalScore: parseOptionalNumber(form.totalScore) ?? null,
    category: form.category || null,
    significance: form.significance || null,
    significanceReason: form.significanceReason.trim() || null,
    hasLegalRequirements: form.hasLegalRequirements,
    hasStakeholderDemand: form.hasStakeholderDemand,
    hasStrategicOption: form.hasStrategicOption,
    existingControls: form.existingControls.trim() || null,
    controlRequired: form.controlRequired.trim() || null,
    communicationRequired: form.communicationRequired,
    communicationNotes: form.communicationNotes.trim() || null,
    reviewFrequencyDays: parseOptionalNumber(form.reviewFrequencyDays) ?? null,
    nextReviewAt: localDateToIso(form.nextReviewAt) ?? null,
    normalCondition: form.normalCondition,
    abnormalCondition: form.abnormalCondition,
    startupShutdown: form.startupShutdown,
    emergencyScenario: form.emergencyScenario.trim() || null,
    changeContext: form.changeContext.trim() || null,
    lifecycleStages: form.lifecycleStagesText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    controlLevel: form.controlLevel,
    influenceLevel: form.influenceLevel.trim() || null,
    outsourcedProcess: form.outsourcedProcess.trim() || null,
    supplierReference: form.supplierReference.trim() || null,
    requirements,
    communicationPlans,
  };
}

function detailToAssessmentForm(
  detail: LaiaAssessmentDetail,
): AssessmentFormState {
  const legalRequirement = detail.requirements.find(
    (item) => item.type === "legal",
  );
  const communicationPlan = detail.communicationPlans[0];
  const monitoringPlan = detail.monitoringPlans[0];

  return {
    mode: detail.mode,
    status: detail.status === "archived" ? "active" : detail.status,
    unitId: detail.unitId ? String(detail.unitId) : "",
    sectorId: detail.sectorId ? String(detail.sectorId) : "",
    activityOperation: detail.activityOperation,
    environmentalAspect: detail.environmentalAspect,
    environmentalImpact: detail.environmentalImpact,
    temporality: detail.temporality ?? "",
    operationalSituation: detail.operationalSituation ?? "",
    incidence: detail.incidence ?? "",
    impactClass: detail.impactClass ?? "",
    scope: detail.scope ?? "",
    severity: detail.severity ?? "",
    consequenceScore:
      detail.consequenceScore != null ? String(detail.consequenceScore) : "",
    frequencyProbability: detail.frequencyProbability ?? "",
    frequencyProbabilityScore:
      detail.frequencyProbabilityScore != null
        ? String(detail.frequencyProbabilityScore)
        : "",
    totalScore: detail.totalScore != null ? String(detail.totalScore) : "",
    category: detail.category ?? "",
    significance: detail.significance ?? "",
    significanceReason: detail.significanceReason ?? "",
    hasLegalRequirements: detail.hasLegalRequirements,
    hasStakeholderDemand: detail.hasStakeholderDemand,
    hasStrategicOption: detail.hasStrategicOption,
    existingControls: detail.existingControls ?? "",
    controlRequired: detail.controlRequired ?? "",
    communicationRequired: detail.communicationRequired,
    communicationNotes:
      detail.communicationNotes ?? communicationPlan?.notes ?? "",
    reviewFrequencyDays:
      detail.reviewFrequencyDays != null
        ? String(detail.reviewFrequencyDays)
        : "",
    nextReviewAt: isoToLocalDate(detail.nextReviewAt),
    normalCondition: detail.normalCondition,
    abnormalCondition: detail.abnormalCondition,
    startupShutdown: detail.startupShutdown,
    emergencyScenario: detail.emergencyScenario ?? "",
    changeContext: detail.changeContext ?? "",
    lifecycleStagesText: detail.lifecycleStages.join(", "),
    controlLevel: detail.controlLevel,
    influenceLevel: detail.influenceLevel ?? "",
    outsourcedProcess: detail.outsourcedProcess ?? "",
    supplierReference: detail.supplierReference ?? "",
    legalRequirementId: legalRequirement?.legislationId
      ? String(legalRequirement.legislationId)
      : "",
    legalRequirementTitle:
      legalRequirement?.legislationTitle || legalRequirement?.title || "",
    legalRequirementReference: legalRequirement?.requirementReference ?? "",
    legalRequirementDescription: legalRequirement?.description ?? "",
    monitoringTitle: monitoringPlan?.title ?? "",
    monitoringObjective: monitoringPlan?.objective ?? "",
    monitoringMethod: monitoringPlan?.method ?? "",
    monitoringFrequency: monitoringPlan?.frequency ?? "",
    monitoringNextDueAt: isoToLocalDate(monitoringPlan?.nextDueAt),
  };
}

function hasAssessmentMinimumRemoteDraftData(form: AssessmentFormState) {
  return Boolean(
    form.activityOperation.trim() &&
    form.environmentalAspect.trim() &&
    form.environmentalImpact.trim(),
  );
}

function getWizardSteps(mode: "quick" | "complete") {
  if (mode === "quick") {
    return ["Identificação", "Avaliação", "Controles", "Revisão"];
  }

  return [
    "Identificação",
    "Avaliação",
    "Contexto",
    "Ciclo de vida",
    "Controles",
    "Monitoramento",
    "Revisão",
  ];
}

function getStatusBadgeVariant(status: "draft" | "active" | "archived") {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "secondary";
}

function getStatusLabel(status: "draft" | "active" | "archived") {
  if (status === "active") return "Ativa";
  if (status === "draft") return "Rascunho";
  return "Arquivada";
}

function getSignificanceBadgeVariant(significance: string | null) {
  if (significance === "significant") return "destructive";
  if (significance === "not_significant") return "secondary";
  return "outline";
}

function getSignificanceLabel(significance: string | null) {
  if (significance === "significant") return "Significativo";
  if (significance === "not_significant") return "Não significativo";
  return "Não avaliado";
}

function clampStep(step: number, mode: "quick" | "complete") {
  return Math.min(step, getWizardSteps(mode).length - 1);
}

function buildAssessmentFilters(
  filters: MatrixFiltersState,
): LaiaAssessmentListFilters {
  return {
    q: filters.q.trim() || undefined,
    unitId: parseOptionalNumber(filters.unitId),
    sectorId: parseOptionalNumber(filters.sectorId),
    status: filters.status || undefined,
    category: filters.category || undefined,
    significance: filters.significance || undefined,
  };
}

function readDraftCache(orgId?: number): AssessmentDraftCache | null {
  if (!orgId) return null;

  const raw = localStorage.getItem(`${ASSESSMENT_DRAFT_STORAGE_KEY}:${orgId}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AssessmentDraftCache>;
    return {
      form: {
        ...DEFAULT_ASSESSMENT_FORM,
        ...(parsed.form ?? {}),
      },
      step: typeof parsed.step === "number" ? parsed.step : 0,
      draftAssessmentId:
        typeof parsed.draftAssessmentId === "number"
          ? parsed.draftAssessmentId
          : null,
    };
  } catch {
    return null;
  }
}

function writeDraftCache(orgId: number, cache: AssessmentDraftCache) {
  localStorage.setItem(
    `${ASSESSMENT_DRAFT_STORAGE_KEY}:${orgId}`,
    JSON.stringify(cache),
  );
}

function clearDraftCache(orgId?: number) {
  if (!orgId) return;
  localStorage.removeItem(`${ASSESSMENT_DRAFT_STORAGE_KEY}:${orgId}`);
  localStorage.removeItem(`${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${orgId}`);
}

export default function EnvironmentalLaiaPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [location, navigate] = useLocation();

  const [matrixFilters, setMatrixFilters] = useState<MatrixFiltersState>(
    DEFAULT_MATRIX_FILTERS,
  );
  const [sectorDialogOpen, setSectorDialogOpen] = useState(false);
  const [methodologyDialogOpen, setMethodologyDialogOpen] = useState(false);
  const [assessmentDialogOpen, setAssessmentDialogOpen] = useState(false);
  const [assessmentStep, setAssessmentStep] = useState(0);
  const [assessmentMaxStep, setAssessmentMaxStep] = useState(0);
  const [assessmentSession, setAssessmentSession] =
    useState<AssessmentDialogSession>({
      mode: "create",
      assessmentId: null,
      draftAssessmentId: null,
    });
  const [sectorForm, setSectorForm] = useState<SectorFormState>({
    code: "",
    name: "",
    unitId: "",
    description: "",
  });
  const [methodologyForm, setMethodologyForm] = useState<MethodologyFormState>(
    DEFAULT_METHODOLOGY_FORM,
  );
  const [assessmentForm, setAssessmentForm] = useState<AssessmentFormState>(
    DEFAULT_ASSESSMENT_FORM,
  );

  const isHydratingAssessmentRef = useRef(false);
  const hydratedAssessmentIdRef = useRef<number | null>(null);
  const draftAutosaveErrorShownRef = useRef(false);

  const assessmentFilters = useMemo(
    () => buildAssessmentFilters(matrixFilters),
    [matrixFilters],
  );

  const { data: dashboard } = useLaiaDashboard(orgId);
  const { data: branchConfigs = [] } = useLaiaBranchConfigs(orgId);
  const { data: sectors = [] } = useLaiaSectors(orgId);
  const { data: methodology } = useLaiaMethodology(orgId);
  const { data: assessments = [] } = useLaiaAssessments(
    orgId,
    assessmentFilters,
  );
  const { data: draftAssessments = [] } = useLaiaAssessments(orgId, {
    status: "draft",
  });
  const { data: revisions = [] } = useLaiaRevisions(orgId);

  // Hydrate methodology form from existing data
  useEffect(() => {
    if (!methodology?.versions[0]) return;
    if (methodologyDialogOpen) return;
    const v = methodology.versions[0];
    const dc = v.documentContent;
    setMethodologyForm((prev) => ({
      ...prev,
      name: methodology.name,
      title: v.title,
      negligibleMax: String(v.scoreThresholds.negligibleMax),
      moderateMax: String(v.scoreThresholds.moderateMax),
      moderateSignificanceRule: v.moderateSignificanceRule || "",
      notes: v.notes || "",
      ...(dc
        ? {
            objetivo: dc.objetivo,
            aplicacao: dc.aplicacao,
            generalidades: dc.generalidades,
            definicoes: dc.definicoes,
            responsabilidades: dc.responsabilidades,
            procedimentoLevantamento: dc.procedimentoLevantamento,
            procedimentoAnalise: dc.procedimentoAnalise,
            classificacaoAssuntos: dc.classificacaoAssuntos,
            classificacaoAplicabilidade: dc.classificacaoAplicabilidade,
            niveisAtendimento: dc.niveisAtendimento,
            outrosRequisitos: dc.outrosRequisitos,
          }
        : {}),
    }));
  }, [methodology, methodologyDialogOpen]);
  const { data: units = [] } = useListUnits(orgId || 0, {
    query: { enabled: !!orgId, queryKey: getListUnitsQueryKey(orgId || 0) },
  });
  const { data: legislations = [] } = useListLegislations(
    orgId || 0,
    undefined,
    {
      query: {
        enabled: !!orgId,
        queryKey: getListLegislationsQueryKey(orgId || 0, undefined),
      },
    },
  );
  const { data: assessmentDetail } = useLaiaAssessment(
    orgId,
    assessmentSession.assessmentId,
  );

  const createSectorMutation = useCreateLaiaSector(orgId);
  const publishMethodologyMutation = usePublishLaiaMethodology(orgId);
  const createAssessmentMutation = useCreateLaiaAssessment(orgId);
  const updateAssessmentMutation = useUpdateLaiaAssessment(
    orgId,
    assessmentSession.assessmentId,
  );

  const latestRemoteDraft = useMemo(() => {
    return (
      [...draftAssessments].sort((left, right) => {
        const leftTime = left.updatedAt
          ? new Date(left.updatedAt).getTime()
          : 0;
        const rightTime = right.updatedAt
          ? new Date(right.updatedAt).getTime()
          : 0;
        return rightTime - leftTime;
      })[0] ?? null
    );
  }, [draftAssessments]);

  const wizardSteps = useMemo(
    () => getWizardSteps(assessmentForm.mode),
    [assessmentForm.mode],
  );

  const isRemoteDraftSession = Boolean(assessmentSession.draftAssessmentId);
  const isEditingActiveAssessment =
    assessmentSession.mode === "edit" &&
    assessmentDetail?.status === "active" &&
    !assessmentSession.draftAssessmentId;
  const hasActiveFilters = useMemo(
    () => Object.values(matrixFilters).some((value) => value.trim() !== ""),
    [matrixFilters],
  );

  usePageTitle("LAIA");
  usePageSubtitle(
    "Levantamento e avaliação dos aspectos e impactos ambientais com matriz operacional, rascunhos retomáveis e revisão contínua.",
  );

  const openAssessmentDialog = (session: AssessmentDialogSession) => {
    hydratedAssessmentIdRef.current = null;
    setAssessmentSession(session);
    setAssessmentDialogOpen(true);
  };

  const hydrateLocalDraft = () => {
    if (!orgId) return;
    const cached = readDraftCache(orgId);
    if (!cached) {
      setAssessmentForm(DEFAULT_ASSESSMENT_FORM);
      setAssessmentStep(0);
      setAssessmentMaxStep(0);
      return;
    }

    isHydratingAssessmentRef.current = true;
    setAssessmentForm({
      ...DEFAULT_ASSESSMENT_FORM,
      ...cached.form,
    });
    setAssessmentStep(clampStep(cached.step, cached.form.mode ?? "quick"));
    setAssessmentMaxStep(
      getWizardSteps(cached.form.mode ?? "quick").length - 1,
    );
    window.setTimeout(() => {
      isHydratingAssessmentRef.current = false;
    }, 0);
  };

  const resetAssessmentDialog = () => {
    hydratedAssessmentIdRef.current = null;
    setAssessmentSession({
      mode: "create",
      assessmentId: null,
      draftAssessmentId: null,
    });
    setAssessmentForm(DEFAULT_ASSESSMENT_FORM);
    setAssessmentStep(0);
    setAssessmentMaxStep(0);
  };

  const handleOpenNewAssessment = () => {
    if (!orgId) return;

    const storedRemoteDraftId = Number(
      localStorage.getItem(`${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${orgId}`) ||
        "",
    );
    const resumableDraft =
      draftAssessments.find((item) => item.id === storedRemoteDraftId) ||
      latestRemoteDraft;

    if (resumableDraft) {
      openAssessmentDialog({
        mode: "create",
        assessmentId: resumableDraft.id,
        draftAssessmentId: resumableDraft.id,
      });
      toast({
        title: "Rascunho retomado",
        description:
          "Existe um rascunho remoto em aberto para esta organização.",
      });
      return;
    }

    resetAssessmentDialog();
    hydrateLocalDraft();
    openAssessmentDialog({
      mode: "create",
      assessmentId: null,
      draftAssessmentId: null,
    });
  };

  const handleOpenEditAssessment = (
    assessmentId: number,
    status: "draft" | "active" | "archived",
  ) => {
    openAssessmentDialog({
      mode: "edit",
      assessmentId,
      draftAssessmentId: status === "draft" ? assessmentId : null,
    });
  };

  useHeaderActions(
    <div className="flex items-center gap-2">
      <HeaderActionButton
        variant="outline"
        size="sm"
        onClick={() => setMethodologyDialogOpen(true)}
        label="Editar metodologia"
        icon={<Pencil className="h-3.5 w-3.5" />}
      />
    </div>,
  );

  useEffect(() => {
    if (!assessmentDialogOpen) {
      hydratedAssessmentIdRef.current = null;
      return;
    }

    if (!orgId || !assessmentDialogOpen) return;

    if (assessmentSession.assessmentId && assessmentDetail) {
      if (hydratedAssessmentIdRef.current === assessmentSession.assessmentId) {
        return;
      }

      isHydratingAssessmentRef.current = true;
      hydratedAssessmentIdRef.current = assessmentSession.assessmentId;
      setAssessmentForm(detailToAssessmentForm(assessmentDetail));

      const cached = readDraftCache(orgId);
      const cachedStep =
        cached?.draftAssessmentId === assessmentSession.draftAssessmentId
          ? cached.step
          : 0;
      const maxStep = getWizardSteps(assessmentDetail.mode).length - 1;
      setAssessmentStep(clampStep(cachedStep, assessmentDetail.mode));
      setAssessmentMaxStep(maxStep);
      window.setTimeout(() => {
        isHydratingAssessmentRef.current = false;
      }, 0);
      return;
    }

    if (!assessmentSession.assessmentId) {
      hydratedAssessmentIdRef.current = null;
      hydrateLocalDraft();
    }
  }, [
    assessmentDetail,
    assessmentDialogOpen,
    assessmentSession.assessmentId,
    assessmentSession.draftAssessmentId,
    orgId,
  ]);

  useEffect(() => {
    if (!assessmentDialogOpen || !orgId) return;

    writeDraftCache(orgId, {
      form: assessmentForm,
      step: assessmentStep,
      draftAssessmentId: assessmentSession.draftAssessmentId,
    });

    if (assessmentSession.draftAssessmentId) {
      localStorage.setItem(
        `${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${orgId}`,
        String(assessmentSession.draftAssessmentId),
      );
    }
  }, [
    assessmentDialogOpen,
    assessmentForm,
    assessmentSession.draftAssessmentId,
    assessmentStep,
    orgId,
  ]);

  useEffect(() => {
    if (!assessmentDialogOpen || !orgId || !assessmentSession.draftAssessmentId)
      return;
    if (isHydratingAssessmentRef.current) return;

    const timer = window.setTimeout(async () => {
      try {
        await updateAssessmentMutation.mutateAsync({
          ...normalizeAssessmentPayload(assessmentForm),
          status: "draft",
        });
        draftAutosaveErrorShownRef.current = false;
      } catch (error) {
        if (!draftAutosaveErrorShownRef.current) {
          draftAutosaveErrorShownRef.current = true;
          toast({
            title: "Falha no autosave do rascunho",
            description:
              error instanceof Error
                ? error.message
                : "Não foi possível sincronizar o rascunho remoto.",
            variant: "destructive",
          });
        }
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    assessmentDialogOpen,
    assessmentForm,
    assessmentSession.draftAssessmentId,
    orgId,
    updateAssessmentMutation,
  ]);

  useEffect(() => {
    setAssessmentStep((current) => clampStep(current, assessmentForm.mode));
    setAssessmentMaxStep((current) =>
      Math.min(current, getWizardSteps(assessmentForm.mode).length - 1),
    );
  }, [assessmentForm.mode]);

  const topCards = useMemo(
    () => [
      {
        title: "Aspectos avaliados",
        value: dashboard?.totalAssessments ?? assessments.length,
        icon: Leaf,
      },
      {
        title: "Significativos",
        value: dashboard?.significantAssessments ?? 0,
        icon: FileWarning,
      },
      {
        title: "Sem responsável",
        value: dashboard?.withoutControlResponsible ?? 0,
        icon: Workflow,
      },
      {
        title: "Monitoramento pendente",
        value: dashboard?.withMonitoringPending ?? 0,
        icon: Radar,
      },
    ],
    [assessments.length, dashboard],
  );

  const handleCreateSector = async () => {
    if (!orgId) return;

    try {
      await createSectorMutation.mutateAsync({
        code: sectorForm.code.trim(),
        name: sectorForm.name.trim(),
        unitId: parseOptionalNumber(sectorForm.unitId) ?? null,
        description: sectorForm.description.trim() || null,
      });
      setSectorDialogOpen(false);
      setSectorForm({ code: "", name: "", unitId: "", description: "" });
      toast({
        title: "Setor criado",
        description: "O setor LAIA foi registrado com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Falha ao criar setor",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handlePublishMethodology = async () => {
    if (!orgId) return;

    try {
      await publishMethodologyMutation.mutateAsync({
        name: methodologyForm.name.trim(),
        title: methodologyForm.title.trim(),
        consequenceMatrix: {
          local: { baixa: 20, media: 40, alta: 60 },
          regional: { baixa: 25, media: 45, alta: 65 },
          global: { baixa: 30, media: 50, alta: 70 },
        },
        frequencyProbabilityMatrix: {
          baixa: 10,
          media: 20,
          alta: 30,
        },
        scoreThresholds: {
          negligibleMax:
            parseOptionalNumber(methodologyForm.negligibleMax) ?? 49,
          moderateMax: parseOptionalNumber(methodologyForm.moderateMax) ?? 70,
        },
        moderateSignificanceRule:
          methodologyForm.moderateSignificanceRule.trim(),
        documentContent: {
          objetivo: methodologyForm.objetivo,
          aplicacao: methodologyForm.aplicacao,
          generalidades: methodologyForm.generalidades,
          definicoes: methodologyForm.definicoes,
          responsabilidades: methodologyForm.responsabilidades,
          procedimentoLevantamento: methodologyForm.procedimentoLevantamento,
          procedimentoAnalise: methodologyForm.procedimentoAnalise,
          classificacaoAssuntos: methodologyForm.classificacaoAssuntos,
          classificacaoAplicabilidade:
            methodologyForm.classificacaoAplicabilidade,
          niveisAtendimento: methodologyForm.niveisAtendimento,
          outrosRequisitos: methodologyForm.outrosRequisitos,
        },
        notes: methodologyForm.notes.trim() || null,
      });
      setMethodologyDialogOpen(false);
      toast({
        title: "Metodologia publicada",
        description: "Uma nova versão da metodologia LAIA foi registrada.",
      });
    } catch (error) {
      toast({
        title: "Falha ao publicar metodologia",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const ensureRemoteDraft = async () => {
    if (!orgId) return null;
    if (assessmentSession.draftAssessmentId)
      return assessmentSession.draftAssessmentId;

    if (!hasAssessmentMinimumRemoteDraftData(assessmentForm)) {
      toast({
        title: "Rascunho salvo apenas localmente",
        description:
          "Preencha atividade, aspecto e impacto para persistir o rascunho no servidor.",
      });
      return null;
    }

    const created = await createAssessmentMutation.mutateAsync({
      ...normalizeAssessmentPayload(assessmentForm),
      status: "draft",
    });

    setAssessmentSession({
      mode: "create",
      assessmentId: created.id,
      draftAssessmentId: created.id,
    });
    localStorage.setItem(
      `${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${orgId}`,
      String(created.id),
    );
    toast({
      title: "Rascunho remoto criado",
      description:
        "A avaliação foi persistida no servidor e seguirá com autosave.",
    });
    return created.id;
  };

  const handleSaveDraft = async () => {
    if (!orgId) return;

    try {
      if (assessmentSession.draftAssessmentId) {
        await updateAssessmentMutation.mutateAsync({
          ...normalizeAssessmentPayload(assessmentForm),
          status: "draft",
        });
        toast({
          title: "Rascunho atualizado",
          description: "As alterações foram persistidas no servidor.",
        });
        return;
      }

      await ensureRemoteDraft();
    } catch (error) {
      toast({
        title: "Falha ao salvar rascunho",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const maybeCreateInitialMonitoringPlan = async (
    savedAssessment: LaiaAssessmentDetail,
  ) => {
    if (!orgId) return;
    if (savedAssessment.status !== "active") return;
    if (
      assessmentSession.mode === "edit" &&
      assessmentDetail?.status === "active"
    ) {
      return;
    }
    if (savedAssessment.monitoringPlans.length > 0) return;
    if (
      !assessmentForm.monitoringTitle.trim() ||
      !assessmentForm.monitoringObjective.trim() ||
      !assessmentForm.monitoringMethod.trim() ||
      !assessmentForm.monitoringFrequency.trim()
    ) {
      return;
    }

    await createLaiaMonitoringPlan(orgId, savedAssessment.id, {
      title: assessmentForm.monitoringTitle.trim(),
      objective: assessmentForm.monitoringObjective.trim(),
      method: assessmentForm.monitoringMethod.trim(),
      frequency: assessmentForm.monitoringFrequency.trim(),
      nextDueAt: localDateToIso(assessmentForm.monitoringNextDueAt) ?? null,
      status: "active",
    });
  };

  const handleSubmitAssessment = async () => {
    if (!orgId) return;

    try {
      const payload = normalizeAssessmentPayload(assessmentForm);
      const savedAssessment = assessmentSession.assessmentId
        ? await updateAssessmentMutation.mutateAsync({
            ...payload,
            status: assessmentForm.status,
          })
        : await createAssessmentMutation.mutateAsync({
            ...payload,
            status: assessmentForm.status,
          });

      await maybeCreateInitialMonitoringPlan(savedAssessment);

      if (savedAssessment.status === "draft") {
        setAssessmentSession({
          mode: assessmentSession.mode,
          assessmentId: savedAssessment.id,
          draftAssessmentId: savedAssessment.id,
        });
        if (orgId) {
          localStorage.setItem(
            `${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${orgId}`,
            String(savedAssessment.id),
          );
        }
        setAssessmentDialogOpen(false);
        toast({
          title: "Rascunho salvo",
          description: "A avaliação pode ser retomada a qualquer momento.",
        });
        return;
      }

      clearDraftCache(orgId);
      setAssessmentDialogOpen(false);
      resetAssessmentDialog();
      toast({
        title:
          assessmentSession.mode === "edit"
            ? "Avaliação atualizada"
            : "Avaliação criada",
        description: "A matriz LAIA foi atualizada com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar avaliação",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleCloseAssessmentDialog = (open: boolean) => {
    if (!open) {
      setAssessmentDialogOpen(false);
      return;
    }

    setAssessmentDialogOpen(true);
  };

  const handleNextStep = async () => {
    if (
      !assessmentSession.draftAssessmentId &&
      hasAssessmentMinimumRemoteDraftData(assessmentForm)
    ) {
      await ensureRemoteDraft();
    }

    setAssessmentStep((current) => {
      const next = Math.min(current + 1, wizardSteps.length - 1);
      setAssessmentMaxStep((maxStep) => Math.max(maxStep, next));
      return next;
    });
  };

  const handlePreviousStep = () => {
    setAssessmentStep((current) => Math.max(current - 1, 0));
  };

  const renderWizardStep = () => {
    const showAdvanced = assessmentForm.mode === "complete";

    switch (wizardSteps[assessmentStep]) {
      case "Identificação":
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="assessment-mode">Modo</Label>
                <Select
                  id="assessment-mode"
                  value={assessmentForm.mode}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      mode: event.target.value as AssessmentFormState["mode"],
                    }))
                  }
                >
                  <option value="quick">Rápido</option>
                  <option value="complete">Completo</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="assessment-status">Status</Label>
                <Select
                  id="assessment-status"
                  value={assessmentForm.status}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      status: event.target
                        .value as AssessmentFormState["status"],
                    }))
                  }
                >
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativa</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="assessment-unit">Unidade</Label>
                <Select
                  id="assessment-unit"
                  value={assessmentForm.unitId}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      unitId: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={String(unit.id)}>
                      {unit.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="assessment-sector">Setor</Label>
                <Select
                  id="assessment-sector"
                  value={assessmentForm.sectorId}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      sectorId: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {sectors.map((sector) => (
                    <option key={sector.id} value={String(sector.id)}>
                      {sector.code} · {sector.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="activity-operation">Atividade / operação</Label>
                <Input
                  id="activity-operation"
                  value={assessmentForm.activityOperation}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      activityOperation: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="environmental-aspect">Aspecto ambiental</Label>
                <Textarea
                  id="environmental-aspect"
                  value={assessmentForm.environmentalAspect}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      environmentalAspect: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="environmental-impact">Impacto ambiental</Label>
                <Textarea
                  id="environmental-impact"
                  value={assessmentForm.environmentalImpact}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      environmentalImpact: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {showAdvanced && (
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="temporality">Temporalidade</Label>
                  <Input
                    id="temporality"
                    value={assessmentForm.temporality}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        temporality: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="assessment-operational-situation">
                    Situação operacional
                  </Label>
                  <Input
                    id="assessment-operational-situation"
                    value={assessmentForm.operationalSituation}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        operationalSituation: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="incidence">Incidência</Label>
                  <Input
                    id="incidence"
                    value={assessmentForm.incidence}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        incidence: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        );
      case "Avaliação":
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <Label htmlFor="assessment-score">Score total</Label>
                <Input
                  id="assessment-score"
                  value={assessmentForm.totalScore}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      totalScore: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="assessment-category">Categoria</Label>
                <Select
                  id="assessment-category"
                  value={assessmentForm.category}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      category: event.target
                        .value as AssessmentFormState["category"],
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  <option value="desprezivel">Desprezível</option>
                  <option value="moderado">Moderado</option>
                  <option value="critico">Crítico</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="assessment-significance">Significância</Label>
                <Select
                  id="assessment-significance"
                  value={assessmentForm.significance}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      significance: event.target
                        .value as AssessmentFormState["significance"],
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  <option value="significant">Significativo</option>
                  <option value="not_significant">Não significativo</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="review-frequency">
                  Frequência de revisão (dias)
                </Label>
                <Input
                  id="review-frequency"
                  value={assessmentForm.reviewFrequencyDays}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      reviewFrequencyDays: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="assessment-reason">Justificativa</Label>
              <Textarea
                id="assessment-reason"
                value={assessmentForm.significanceReason}
                onChange={(event) =>
                  setAssessmentForm((current) => ({
                    ...current,
                    significanceReason: event.target.value,
                  }))
                }
              />
            </div>

            {assessmentForm.mode === "complete" && (
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <Label htmlFor="impact-class">Classe do impacto</Label>
                  <Input
                    id="impact-class"
                    value={assessmentForm.impactClass}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        impactClass: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="scope">Abrangência</Label>
                  <Input
                    id="scope"
                    value={assessmentForm.scope}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        scope: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="severity">Severidade</Label>
                  <Input
                    id="severity"
                    value={assessmentForm.severity}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        severity: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="frequency-probability">
                    Frequência / probabilidade
                  </Label>
                  <Input
                    id="frequency-probability"
                    value={assessmentForm.frequencyProbability}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        frequencyProbability: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="consequence-score">Score consequência</Label>
                  <Input
                    id="consequence-score"
                    value={assessmentForm.consequenceScore}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        consequenceScore: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="frequency-score">Score frequência</Label>
                  <Input
                    id="frequency-score"
                    value={assessmentForm.frequencyProbabilityScore}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        frequencyProbabilityScore: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        );
      case "Contexto":
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <Label htmlFor="normal-condition">Condição normal</Label>
                  <Switch
                    id="normal-condition"
                    checked={assessmentForm.normalCondition}
                    onCheckedChange={(checked) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        normalCondition: checked,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <Label htmlFor="abnormal-condition">Condição anormal</Label>
                  <Switch
                    id="abnormal-condition"
                    checked={assessmentForm.abnormalCondition}
                    onCheckedChange={(checked) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        abnormalCondition: checked,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <Label htmlFor="startup-shutdown">
                    Partida / desligamento
                  </Label>
                  <Switch
                    id="startup-shutdown"
                    checked={assessmentForm.startupShutdown}
                    onCheckedChange={(checked) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        startupShutdown: checked,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="emergency-scenario">
                  Cenário de emergência
                </Label>
                <Textarea
                  id="emergency-scenario"
                  value={assessmentForm.emergencyScenario}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      emergencyScenario: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="change-context">Contexto de mudança</Label>
                <Textarea
                  id="change-context"
                  value={assessmentForm.changeContext}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      changeContext: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
        );
      case "Ciclo de vida":
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="lifecycle-stages">
                  Estágios do ciclo de vida
                </Label>
                <Input
                  id="lifecycle-stages"
                  placeholder="aquisição, operação, transporte..."
                  value={assessmentForm.lifecycleStagesText}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      lifecycleStagesText: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="control-level">Nível de controle</Label>
                <Select
                  id="control-level"
                  value={assessmentForm.controlLevel}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      controlLevel: event.target
                        .value as AssessmentFormState["controlLevel"],
                    }))
                  }
                >
                  <option value="direct_control">Controle direto</option>
                  <option value="influence">Influência</option>
                  <option value="none">Sem controle</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="influence-level">Nível de influência</Label>
                <Input
                  id="influence-level"
                  value={assessmentForm.influenceLevel}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      influenceLevel: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="outsourced-process">
                  Processo terceirizado
                </Label>
                <Input
                  id="outsourced-process"
                  value={assessmentForm.outsourcedProcess}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      outsourcedProcess: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="supplier-reference">
                  Fornecedor / referência
                </Label>
                <Input
                  id="supplier-reference"
                  value={assessmentForm.supplierReference}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      supplierReference: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
        );
      case "Controles":
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="existing-controls">Controles existentes</Label>
                <Textarea
                  id="existing-controls"
                  value={assessmentForm.existingControls}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      existingControls: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="required-controls">Controles requeridos</Label>
                <Textarea
                  id="required-controls"
                  value={assessmentForm.controlRequired}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      controlRequired: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Requisito legal</p>
                    <p className="text-xs text-muted-foreground">
                      Marca o aspecto com obrigação formal.
                    </p>
                  </div>
                  <Switch
                    checked={assessmentForm.hasLegalRequirements}
                    onCheckedChange={(checked) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        hasLegalRequirements: checked,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Parte interessada</p>
                    <p className="text-xs text-muted-foreground">
                      Pressão externa ou interna relevante.
                    </p>
                  </div>
                  <Switch
                    checked={assessmentForm.hasStakeholderDemand}
                    onCheckedChange={(checked) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        hasStakeholderDemand: checked,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Opção estratégica</p>
                    <p className="text-xs text-muted-foreground">
                      Conecta o aspecto à estratégia do SGA.
                    </p>
                  </div>
                  <Switch
                    checked={assessmentForm.hasStrategicOption}
                    onCheckedChange={(checked) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        hasStrategicOption: checked,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="legal-requirement">Legislação vinculada</Label>
                <Select
                  id="legal-requirement"
                  value={assessmentForm.legalRequirementId}
                  onChange={(event) => {
                    const selectedId = event.target.value;
                    const selected = legislations.find(
                      (item) => String(item.id) === selectedId,
                    );
                    setAssessmentForm((current) => ({
                      ...current,
                      legalRequirementId: selectedId,
                      legalRequirementTitle: selected?.title || "",
                    }));
                  }}
                >
                  <option value="">Selecione</option>
                  {legislations.map((legislation) => (
                    <option key={legislation.id} value={String(legislation.id)}>
                      {legislation.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="legal-reference">Referência do requisito</Label>
                <Input
                  id="legal-reference"
                  value={assessmentForm.legalRequirementReference}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      legalRequirementReference: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="legal-description">Descrição do requisito</Label>
              <Textarea
                id="legal-description"
                value={assessmentForm.legalRequirementDescription}
                onChange={(event) =>
                  setAssessmentForm((current) => ({
                    ...current,
                    legalRequirementDescription: event.target.value,
                  }))
                }
              />
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Comunicação interna</p>
                  <p className="text-xs text-muted-foreground">
                    Gera um plano mínimo usando a infraestrutura de comunicação
                    existente.
                  </p>
                </div>
                <Switch
                  checked={assessmentForm.communicationRequired}
                  onCheckedChange={(checked) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      communicationRequired: checked,
                    }))
                  }
                />
              </div>
              {assessmentForm.communicationRequired && (
                <div className="mt-4">
                  <Label htmlFor="communication-notes">
                    Notas de comunicação
                  </Label>
                  <Textarea
                    id="communication-notes"
                    value={assessmentForm.communicationNotes}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        communicationNotes: event.target.value,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          </div>
        );
      case "Monitoramento":
        return (
          <div className="space-y-6">
            {assessmentSession.mode === "edit" &&
            assessmentDetail?.monitoringPlans.length ? (
              <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-4 backdrop-blur-md">
                <p className="text-sm font-medium">Monitoramento existente</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {assessmentDetail.monitoringPlans.length} plano(s) já
                  cadastrado(s). A edição detalhada de monitoramento fica para a
                  issue `WEB-56`.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-4 backdrop-blur-md">
                <p className="text-sm font-medium">
                  Plano inicial de monitoramento
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Opcional nesta etapa. Se preenchido, o plano inicial será
                  criado ao salvar uma avaliação ativa.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="monitoring-title">Título</Label>
                    <Input
                      id="monitoring-title"
                      value={assessmentForm.monitoringTitle}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          monitoringTitle: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="monitoring-frequency">Frequência</Label>
                    <Input
                      id="monitoring-frequency"
                      value={assessmentForm.monitoringFrequency}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          monitoringFrequency: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="monitoring-objective">Objetivo</Label>
                    <Textarea
                      id="monitoring-objective"
                      value={assessmentForm.monitoringObjective}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          monitoringObjective: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="monitoring-method">Método</Label>
                    <Textarea
                      id="monitoring-method"
                      value={assessmentForm.monitoringMethod}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          monitoringMethod: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="monitoring-next-due-at">
                      Próximo vencimento
                    </Label>
                    <Input
                      id="monitoring-next-due-at"
                      type="date"
                      value={assessmentForm.monitoringNextDueAt}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          monitoringNextDueAt: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case "Revisão":
      default:
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Código / status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>{assessmentDetail?.aspectCode || "Novo assessment"}</p>
                  <Badge variant={getStatusBadgeVariant(assessmentForm.status)}>
                    {getStatusLabel(assessmentForm.status)}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Setor</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {sectors.find(
                    (sector) => String(sector.id) === assessmentForm.sectorId,
                  )?.name || "Sem setor"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Score / categoria</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>{assessmentForm.totalScore || "Sem score"}</p>
                  <p>{assessmentForm.category || "Sem categoria"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Significância</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Badge
                    variant={getSignificanceBadgeVariant(
                      assessmentForm.significance || null,
                    )}
                  >
                    {getSignificanceLabel(assessmentForm.significance || null)}
                  </Badge>
                  <p className="text-muted-foreground">
                    {assessmentForm.significanceReason || "Sem justificativa"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/42 px-4 py-4 backdrop-blur-md">
              <p className="text-sm font-medium">Resumo do preenchimento</p>
              <dl className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Atividade
                  </dt>
                  <dd className="mt-1 text-sm">
                    {assessmentForm.activityOperation || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Aspecto / impacto
                  </dt>
                  <dd className="mt-1 text-sm">
                    {assessmentForm.environmentalAspect || "-"} /{" "}
                    {assessmentForm.environmentalImpact || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Controles
                  </dt>
                  <dd className="mt-1 text-sm">
                    {assessmentForm.existingControls || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Requisito legal
                  </dt>
                  <dd className="mt-1 text-sm">
                    {assessmentForm.legalRequirementTitle || "-"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-8 px-6 py-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {topCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tracking-tight">
                {card.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="metodologia">
        <TabsList>
          <TabsTrigger value="metodologia">Metodologia</TabsTrigger>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="revisoes">Revisões</TabsTrigger>
        </TabsList>

        <TabsContent value="metodologia" className="space-y-6">
          {/* Save bar */}
          {methodologyDialogOpen && (
            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-[13px] text-muted-foreground">
                Editando metodologia. Salvar publicara uma nova versao.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMethodologyDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handlePublishMethodology}
                  isLoading={publishMethodologyMutation.isPending}
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Salvar e publicar
                </Button>
              </div>
            </div>
          )}

          {/* 1. Objetivo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">1. Objetivo</CardTitle>
            </CardHeader>
            <CardContent>
              {methodologyDialogOpen ? (
                <Textarea
                  value={methodologyForm.objetivo}
                  onChange={(e) =>
                    setMethodologyForm((p) => ({
                      ...p,
                      objetivo: e.target.value,
                    }))
                  }
                  rows={4}
                  className="text-[13px]"
                />
              ) : (
                <p className="text-[13px] text-muted-foreground whitespace-pre-line">
                  {methodologyForm.objetivo}
                </p>
              )}
            </CardContent>
          </Card>

          {/* 2. Aplicacao */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">2. Aplicacao</CardTitle>
            </CardHeader>
            <CardContent>
              {methodologyDialogOpen ? (
                <Textarea
                  value={methodologyForm.aplicacao}
                  onChange={(e) =>
                    setMethodologyForm((p) => ({
                      ...p,
                      aplicacao: e.target.value,
                    }))
                  }
                  rows={2}
                  className="text-[13px]"
                />
              ) : (
                <p className="text-[13px] text-muted-foreground whitespace-pre-line">
                  {methodologyForm.aplicacao}
                </p>
              )}
            </CardContent>
          </Card>

          {/* 3. Generalidades */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">3. Generalidades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {methodologyDialogOpen ? (
                <Textarea
                  value={methodologyForm.generalidades}
                  onChange={(e) =>
                    setMethodologyForm((p) => ({
                      ...p,
                      generalidades: e.target.value,
                    }))
                  }
                  rows={2}
                  className="text-[13px]"
                />
              ) : (
                <p className="text-[13px] text-muted-foreground whitespace-pre-line">
                  {methodologyForm.generalidades}
                </p>
              )}
              <div>
                <p className="text-[13px] font-medium text-foreground mb-2">
                  Definicoes e Referencias
                </p>
                <div className="space-y-2">
                  {methodologyForm.definicoes.map((def, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md"
                    >
                      {methodologyDialogOpen ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={def.termo}
                              onChange={(e) => {
                                const next = [...methodologyForm.definicoes];
                                next[i] = { ...next[i], termo: e.target.value };
                                setMethodologyForm((p) => ({
                                  ...p,
                                  definicoes: next,
                                }));
                              }}
                              className="h-8 text-[13px] font-medium"
                              placeholder="Termo"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                const next = methodologyForm.definicoes.filter(
                                  (_, idx) => idx !== i,
                                );
                                setMethodologyForm((p) => ({
                                  ...p,
                                  definicoes: next,
                                }));
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <Textarea
                            value={def.descricao}
                            onChange={(e) => {
                              const next = [...methodologyForm.definicoes];
                              next[i] = {
                                ...next[i],
                                descricao: e.target.value,
                              };
                              setMethodologyForm((p) => ({
                                ...p,
                                definicoes: next,
                              }));
                            }}
                            rows={2}
                            className="text-[13px]"
                            placeholder="Descricao"
                          />
                        </div>
                      ) : (
                        <>
                          <p className="text-[13px] font-medium text-foreground">
                            {def.termo}
                          </p>
                          <p className="mt-1 text-[13px] text-muted-foreground">
                            {def.descricao}
                          </p>
                        </>
                      )}
                    </div>
                  ))}
                  {methodologyDialogOpen && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setMethodologyForm((p) => ({
                          ...p,
                          definicoes: [
                            ...p.definicoes,
                            { termo: "", descricao: "" },
                          ],
                        }))
                      }
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Adicionar definicao
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. Responsabilidades */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">4. Responsabilidades</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Cargo
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Atribuicoes
                    </th>
                    {methodologyDialogOpen && <th className="w-10"></th>}
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {methodologyForm.responsabilidades.map((resp, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {methodologyDialogOpen ? (
                          <Input
                            value={resp.cargo}
                            onChange={(e) => {
                              const next = [
                                ...methodologyForm.responsabilidades,
                              ];
                              next[i] = { ...next[i], cargo: e.target.value };
                              setMethodologyForm((p) => ({
                                ...p,
                                responsabilidades: next,
                              }));
                            }}
                            className="h-8 text-[13px]"
                          />
                        ) : (
                          resp.cargo
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {methodologyDialogOpen ? (
                          <Input
                            value={resp.atribuicoes}
                            onChange={(e) => {
                              const next = [
                                ...methodologyForm.responsabilidades,
                              ];
                              next[i] = {
                                ...next[i],
                                atribuicoes: e.target.value,
                              };
                              setMethodologyForm((p) => ({
                                ...p,
                                responsabilidades: next,
                              }));
                            }}
                            className="h-8 text-[13px]"
                          />
                        ) : (
                          resp.atribuicoes
                        )}
                      </td>
                      {methodologyDialogOpen && (
                        <td className="px-2 py-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const next =
                                methodologyForm.responsabilidades.filter(
                                  (_, idx) => idx !== i,
                                );
                              setMethodologyForm((p) => ({
                                ...p,
                                responsabilidades: next,
                              }));
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {methodologyDialogOpen && (
                <div className="px-4 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMethodologyForm((p) => ({
                        ...p,
                        responsabilidades: [
                          ...p.responsabilidades,
                          { cargo: "", atribuicoes: "" },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Adicionar responsabilidade
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 5. Procedimento */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">5. Procedimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-[13px] font-medium text-foreground mb-2">
                  5.1 Levantamento e Atualizacao
                </p>
                {methodologyDialogOpen ? (
                  <Textarea
                    value={methodologyForm.procedimentoLevantamento}
                    onChange={(e) =>
                      setMethodologyForm((p) => ({
                        ...p,
                        procedimentoLevantamento: e.target.value,
                      }))
                    }
                    rows={4}
                    className="text-[13px]"
                  />
                ) : (
                  <p className="text-[13px] text-muted-foreground whitespace-pre-line">
                    {methodologyForm.procedimentoLevantamento}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[13px] font-medium text-foreground mb-2">
                  5.2 Analise de Atendimento aos Requisitos Legais
                </p>
                {methodologyDialogOpen ? (
                  <Textarea
                    value={methodologyForm.procedimentoAnalise}
                    onChange={(e) =>
                      setMethodologyForm((p) => ({
                        ...p,
                        procedimentoAnalise: e.target.value,
                      }))
                    }
                    rows={4}
                    className="text-[13px]"
                  />
                ) : (
                  <p className="text-[13px] text-muted-foreground whitespace-pre-line">
                    {methodologyForm.procedimentoAnalise}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[13px] font-medium text-foreground mb-2">
                  5.3 Classificacao dos Requisitos Legais
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                    <p className="text-xs font-semibold text-foreground mb-2">
                      Por assunto
                    </p>
                    {methodologyDialogOpen ? (
                      <div className="space-y-1.5">
                        {methodologyForm.classificacaoAssuntos.map(
                          (item, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-5 shrink-0">
                                {i + 1}.
                              </span>
                              <Input
                                value={item}
                                onChange={(e) => {
                                  const next = [
                                    ...methodologyForm.classificacaoAssuntos,
                                  ];
                                  next[i] = e.target.value;
                                  setMethodologyForm((p) => ({
                                    ...p,
                                    classificacaoAssuntos: next,
                                  }));
                                }}
                                className="h-7 text-[13px]"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  const next =
                                    methodologyForm.classificacaoAssuntos.filter(
                                      (_, idx) => idx !== i,
                                    );
                                  setMethodologyForm((p) => ({
                                    ...p,
                                    classificacaoAssuntos: next,
                                  }));
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ),
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-1"
                          onClick={() =>
                            setMethodologyForm((p) => ({
                              ...p,
                              classificacaoAssuntos: [
                                ...p.classificacaoAssuntos,
                                "",
                              ],
                            }))
                          }
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Adicionar
                        </Button>
                      </div>
                    ) : (
                      <ol className="list-decimal ml-4 text-[13px] text-muted-foreground space-y-0.5">
                        {methodologyForm.classificacaoAssuntos.map(
                          (item, i) => (
                            <li key={i}>{item}</li>
                          ),
                        )}
                      </ol>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                      <p className="text-xs font-semibold text-foreground mb-2">
                        Por aplicabilidade
                      </p>
                      <div className="space-y-2">
                        {methodologyForm.classificacaoAplicabilidade.map(
                          (item, i) => (
                            <div key={i}>
                              {methodologyDialogOpen ? (
                                <div className="flex items-start gap-2">
                                  <Input
                                    value={item.codigo}
                                    onChange={(e) => {
                                      const n = [
                                        ...methodologyForm.classificacaoAplicabilidade,
                                      ];
                                      n[i] = {
                                        ...n[i],
                                        codigo: e.target.value,
                                      };
                                      setMethodologyForm((p) => ({
                                        ...p,
                                        classificacaoAplicabilidade: n,
                                      }));
                                    }}
                                    className="h-7 text-[13px] w-12 shrink-0"
                                  />
                                  <Input
                                    value={item.nome}
                                    onChange={(e) => {
                                      const n = [
                                        ...methodologyForm.classificacaoAplicabilidade,
                                      ];
                                      n[i] = { ...n[i], nome: e.target.value };
                                      setMethodologyForm((p) => ({
                                        ...p,
                                        classificacaoAplicabilidade: n,
                                      }));
                                    }}
                                    className="h-7 text-[13px] w-28 shrink-0"
                                  />
                                  <Input
                                    value={item.descricao}
                                    onChange={(e) => {
                                      const n = [
                                        ...methodologyForm.classificacaoAplicabilidade,
                                      ];
                                      n[i] = {
                                        ...n[i],
                                        descricao: e.target.value,
                                      };
                                      setMethodologyForm((p) => ({
                                        ...p,
                                        classificacaoAplicabilidade: n,
                                      }));
                                    }}
                                    className="h-7 text-[13px] flex-1"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <p className="text-[13px] font-medium text-foreground">
                                    {item.codigo} = {item.nome}
                                  </p>
                                  <p className="text-[13px] text-muted-foreground">
                                    {item.descricao}
                                  </p>
                                </div>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
                      <p className="text-xs font-semibold text-foreground mb-2">
                        Nivel de Atendimento
                      </p>
                      <div className="space-y-2">
                        {methodologyForm.niveisAtendimento.map((item, i) => (
                          <div key={i}>
                            {methodologyDialogOpen ? (
                              <div className="flex items-start gap-2">
                                <Input
                                  value={item.nivel}
                                  onChange={(e) => {
                                    const n = [
                                      ...methodologyForm.niveisAtendimento,
                                    ];
                                    n[i] = { ...n[i], nivel: e.target.value };
                                    setMethodologyForm((p) => ({
                                      ...p,
                                      niveisAtendimento: n,
                                    }));
                                  }}
                                  className="h-7 text-[13px] w-12 shrink-0"
                                />
                                <Input
                                  value={item.nome}
                                  onChange={(e) => {
                                    const n = [
                                      ...methodologyForm.niveisAtendimento,
                                    ];
                                    n[i] = { ...n[i], nome: e.target.value };
                                    setMethodologyForm((p) => ({
                                      ...p,
                                      niveisAtendimento: n,
                                    }));
                                  }}
                                  className="h-7 text-[13px] w-28 shrink-0"
                                />
                                <Input
                                  value={item.descricao}
                                  onChange={(e) => {
                                    const n = [
                                      ...methodologyForm.niveisAtendimento,
                                    ];
                                    n[i] = {
                                      ...n[i],
                                      descricao: e.target.value,
                                    };
                                    setMethodologyForm((p) => ({
                                      ...p,
                                      niveisAtendimento: n,
                                    }));
                                  }}
                                  className="h-7 text-[13px] flex-1"
                                />
                              </div>
                            ) : (
                              <div>
                                <p
                                  className={`text-[13px] font-medium ${item.nivel === "1" ? "text-emerald-600" : item.nivel === "2" ? "text-amber-600" : "text-red-600"}`}
                                >
                                  {item.nivel}. {item.nome}
                                </p>
                                <p className="text-[13px] text-muted-foreground">
                                  {item.descricao}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[13px] font-medium text-foreground mb-2">
                  5.4 Outros Requisitos Aplicaveis
                </p>
                {methodologyDialogOpen ? (
                  <Textarea
                    value={methodologyForm.outrosRequisitos}
                    onChange={(e) =>
                      setMethodologyForm((p) => ({
                        ...p,
                        outrosRequisitos: e.target.value,
                      }))
                    }
                    rows={3}
                    className="text-[13px]"
                  />
                ) : (
                  <p className="text-[13px] text-muted-foreground whitespace-pre-line">
                    {methodologyForm.outrosRequisitos}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Parametros de pontuacao */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Parametros de pontuacao</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Limite desprezivel
                  </Label>
                  {methodologyDialogOpen ? (
                    <Input
                      value={methodologyForm.negligibleMax}
                      onChange={(e) =>
                        setMethodologyForm((p) => ({
                          ...p,
                          negligibleMax: e.target.value,
                        }))
                      }
                      className="mt-1 text-[13px]"
                    />
                  ) : (
                    <p className="mt-1 text-[13px] font-medium">
                      {methodologyForm.negligibleMax} pontos
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Limite moderado
                  </Label>
                  {methodologyDialogOpen ? (
                    <Input
                      value={methodologyForm.moderateMax}
                      onChange={(e) =>
                        setMethodologyForm((p) => ({
                          ...p,
                          moderateMax: e.target.value,
                        }))
                      }
                      className="mt-1 text-[13px]"
                    />
                  ) : (
                    <p className="mt-1 text-[13px] font-medium">
                      {methodologyForm.moderateMax} pontos
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs text-muted-foreground">
                    Regra de significancia (moderado)
                  </Label>
                  {methodologyDialogOpen ? (
                    <Textarea
                      value={methodologyForm.moderateSignificanceRule}
                      onChange={(e) =>
                        setMethodologyForm((p) => ({
                          ...p,
                          moderateSignificanceRule: e.target.value,
                        }))
                      }
                      rows={2}
                      className="mt-1 text-[13px]"
                    />
                  ) : (
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {methodologyForm.moderateSignificanceRule}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revisoes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de revisões</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {revisions.map((revision) => (
                <div
                  key={revision.id}
                  className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {revision.title || "Revisão LAIA"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Revisão #{revision.revisionNumber} ·{" "}
                        {revision.createdAt
                          ? new Date(revision.createdAt).toLocaleString("pt-BR")
                          : "sem data"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {revision.changes.length} alteração(ões)
                    </div>
                  </div>
                </div>
              ))}
              {revisions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma revisão registrada até o momento.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unidades">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {branchConfigs.map((config) => (
              <button
                key={config.unitId}
                type="button"
                onClick={() =>
                  navigate(
                    `${location.startsWith("/app/") ? "/app" : ""}/ambiental/laia/unidades/${config.unitId}`,
                  )
                }
                className="text-left"
              >
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">
                        {config.unitName || `Unidade ${config.unitId}`}
                      </CardTitle>
                      <Badge variant="outline">
                        {config.surveyStatus === "levantado"
                          ? "Levantado"
                          : config.surveyStatus === "em_levantamento"
                            ? "Em levantamento"
                            : "Não levantado"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {config.updatedAt
                        ? `Atualizado em ${new Date(config.updatedAt).toLocaleDateString("pt-BR")}`
                        : "Sem atualização registrada"}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/60 bg-card/42 px-3 py-3 backdrop-blur-md">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          Avaliações
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {config.totalAssessments}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card/42 px-3 py-3 backdrop-blur-md">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          Críticas
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {config.criticalAssessments}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card/42 px-3 py-3 backdrop-blur-md">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          Significativas
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {config.significantAssessments}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card/42 px-3 py-3 backdrop-blur-md">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          Não significativas
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {config.notSignificantAssessments}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
            {branchConfigs.length === 0 && (
              <Card className="md:col-span-2 xl:col-span-3">
                <CardContent className="py-10 text-center text-muted-foreground">
                  Nenhuma unidade configurada para LAIA.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={sectorDialogOpen}
        onOpenChange={setSectorDialogOpen}
        title="Novo setor LAIA"
        description="Cadastre o setor operacional vinculado à unidade ambiental."
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="sector-code">Código</Label>
              <Input
                id="sector-code"
                value={sectorForm.code}
                onChange={(event) =>
                  setSectorForm((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="sector-name">Nome</Label>
              <Input
                id="sector-name"
                value={sectorForm.name}
                onChange={(event) =>
                  setSectorForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="sector-unit">Unidade</Label>
            <Select
              id="sector-unit"
              value={sectorForm.unitId}
              onChange={(event) =>
                setSectorForm((current) => ({
                  ...current,
                  unitId: event.target.value,
                }))
              }
            >
              <option value="">Todas as unidades</option>
              {units.map((unit) => (
                <option key={unit.id} value={String(unit.id)}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sector-description">Descrição</Label>
            <Textarea
              id="sector-description"
              value={sectorForm.description}
              onChange={(event) =>
                setSectorForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSectorDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreateSector}
            disabled={!sectorForm.code.trim() || !sectorForm.name.trim()}
            isLoading={createSectorMutation.isPending}
          >
            Salvar setor
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={assessmentDialogOpen}
        onOpenChange={handleCloseAssessmentDialog}
        title={
          assessmentSession.mode === "edit"
            ? "Editar avaliação LAIA"
            : "Nova avaliação LAIA"
        }
        description="Criação e edição de rascunhos editáveis."
        size="xl"
      >
        <div className="space-y-6">
          <DialogStepTabs
            steps={wizardSteps}
            step={assessmentStep}
            onStepChange={(step) => setAssessmentStep(step)}
            maxAccessibleStep={assessmentMaxStep}
          />

          {isRemoteDraftSession && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
              Este formulário está vinculado a um rascunho remoto e será
              sincronizado automaticamente.
            </div>
          )}

          {renderWizardStep()}
        </div>

        <DialogFooter className="justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setAssessmentDialogOpen(false)}
            >
              Fechar
            </Button>
            <Button
              variant="secondary"
              onClick={handleSaveDraft}
              isLoading={
                createAssessmentMutation.isPending ||
                updateAssessmentMutation.isPending
              }
            >
              Salvar rascunho
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handlePreviousStep}
              disabled={assessmentStep === 0}
            >
              Voltar
            </Button>
            {assessmentStep < wizardSteps.length - 1 ? (
              <Button onClick={handleNextStep}>Próximo</Button>
            ) : (
              <Button
                onClick={handleSubmitAssessment}
                disabled={
                  !assessmentForm.activityOperation.trim() ||
                  !assessmentForm.environmentalAspect.trim() ||
                  !assessmentForm.environmentalImpact.trim()
                }
                isLoading={
                  createAssessmentMutation.isPending ||
                  updateAssessmentMutation.isPending
                }
              >
                {assessmentSession.mode === "edit"
                  ? "Salvar alterações"
                  : assessmentForm.status === "draft"
                    ? "Salvar avaliação"
                    : "Ativar avaliação"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
