import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { DialogStepTabs } from "@/components/ui/dialog-step-tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  createLaiaMonitoringPlan,
  useCreateLaiaAssessment,
  useLaiaAssessment,
  useLaiaAssessments,
  useUpdateLaiaAssessment,
  type LaiaAssessmentDetail,
  type LaiaAssessmentInput,
  type LaiaSector,
} from "@/lib/environmental-laia-client";

type LegislationOption = {
  id: number;
  title: string;
};

type UnitOption = {
  id: number;
  name?: string | null;
};

export type LaiaAssessmentDialogSession = {
  mode: "create" | "edit";
  assessmentId: number | null;
  draftAssessmentId: number | null;
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

type AssessmentDraftCache = {
  form: AssessmentFormState;
  step: number;
  draftAssessmentId: number | null;
};

type LaiaAssessmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId?: number;
  unitId: number;
  session: LaiaAssessmentDialogSession;
  onSessionChange: (session: LaiaAssessmentDialogSession) => void;
  units: UnitOption[];
  sectors: LaiaSector[];
  legislations: LegislationOption[];
  lockUnit?: boolean;
};

const ASSESSMENT_DRAFT_STORAGE_KEY = "laia-assessment-dialog-draft";
const ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY = "laia-assessment-remote-draft-id";

function buildDefaultAssessmentForm(unitId: number): AssessmentFormState {
  return {
    mode: "quick",
    status: "draft",
    unitId: String(unitId),
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
}

function getDraftKey(orgId?: number, unitId?: number) {
  return orgId && unitId ? `${orgId}:${unitId}` : null;
}

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

function normalizeAssessmentPayload(form: AssessmentFormState): LaiaAssessmentInput {
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
  const legalRequirement = detail.requirements.find((item) => item.type === "legal");
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
      detail.reviewFrequencyDays != null ? String(detail.reviewFrequencyDays) : "",
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

function readDraftCache(
  orgId?: number,
  unitId?: number,
): AssessmentDraftCache | null {
  const key = getDraftKey(orgId, unitId);
  if (!key) return null;

  const raw = localStorage.getItem(`${ASSESSMENT_DRAFT_STORAGE_KEY}:${key}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AssessmentDraftCache>;
    return {
      form: {
        ...buildDefaultAssessmentForm(unitId!),
        ...(parsed.form ?? {}),
      },
      step: typeof parsed.step === "number" ? parsed.step : 0,
      draftAssessmentId:
        typeof parsed.draftAssessmentId === "number" ? parsed.draftAssessmentId : null,
    };
  } catch {
    return null;
  }
}

function writeDraftCache(
  orgId: number,
  unitId: number,
  cache: AssessmentDraftCache,
) {
  const key = getDraftKey(orgId, unitId);
  if (!key) return;
  localStorage.setItem(`${ASSESSMENT_DRAFT_STORAGE_KEY}:${key}`, JSON.stringify(cache));
}

function clearDraftCache(orgId?: number, unitId?: number) {
  const key = getDraftKey(orgId, unitId);
  if (!key) return;
  localStorage.removeItem(`${ASSESSMENT_DRAFT_STORAGE_KEY}:${key}`);
  localStorage.removeItem(`${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${key}`);
}

export function LaiaAssessmentDialog({
  open,
  onOpenChange,
  orgId,
  unitId,
  session,
  onSessionChange,
  units,
  sectors,
  legislations,
  lockUnit = true,
}: LaiaAssessmentDialogProps) {
  const [assessmentForm, setAssessmentForm] = useState<AssessmentFormState>(
    () => buildDefaultAssessmentForm(unitId),
  );
  const [assessmentStep, setAssessmentStep] = useState(0);
  const [assessmentMaxStep, setAssessmentMaxStep] = useState(0);

  const isHydratingAssessmentRef = useRef(false);
  const hydratedAssessmentIdRef = useRef<number | null>(null);
  const draftAutosaveErrorShownRef = useRef(false);

  const { data: draftAssessments = [] } = useLaiaAssessments(orgId, {
    status: "draft",
    unitId,
  });
  const { data: assessmentDetail } = useLaiaAssessment(orgId, session.assessmentId);
  const createAssessmentMutation = useCreateLaiaAssessment(orgId);
  const updateAssessmentMutation = useUpdateLaiaAssessment(orgId, session.assessmentId);

  const latestRemoteDraft = useMemo(() => {
    return [...draftAssessments]
      .sort((left, right) => {
        const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
        const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
        return rightTime - leftTime;
      })[0] ?? null;
  }, [draftAssessments]);

  const wizardSteps = useMemo(
    () => getWizardSteps(assessmentForm.mode),
    [assessmentForm.mode],
  );

  const isRemoteDraftSession = Boolean(session.draftAssessmentId);

  useEffect(() => {
    setAssessmentForm((current) => ({
      ...current,
      unitId: String(unitId),
    }));
  }, [unitId]);

  const hydrateLocalDraft = () => {
    if (!orgId) return;
    const cached = readDraftCache(orgId, unitId);
    if (!cached) {
      setAssessmentForm(buildDefaultAssessmentForm(unitId));
      setAssessmentStep(0);
      setAssessmentMaxStep(0);
      return;
    }

    isHydratingAssessmentRef.current = true;
    setAssessmentForm({
      ...buildDefaultAssessmentForm(unitId),
      ...cached.form,
      unitId: String(unitId),
    });
    setAssessmentStep(clampStep(cached.step, cached.form.mode ?? "quick"));
    setAssessmentMaxStep(getWizardSteps(cached.form.mode ?? "quick").length - 1);
    window.setTimeout(() => {
      isHydratingAssessmentRef.current = false;
    }, 0);
  };

  const resetDialog = () => {
    hydratedAssessmentIdRef.current = null;
    onSessionChange({
      mode: "create",
      assessmentId: null,
      draftAssessmentId: null,
    });
    setAssessmentForm(buildDefaultAssessmentForm(unitId));
    setAssessmentStep(0);
    setAssessmentMaxStep(0);
  };

  useEffect(() => {
    if (!open) {
      hydratedAssessmentIdRef.current = null;
      return;
    }

    if (!orgId) return;

    if (session.assessmentId && assessmentDetail) {
      if (hydratedAssessmentIdRef.current === session.assessmentId) {
        return;
      }

      isHydratingAssessmentRef.current = true;
      hydratedAssessmentIdRef.current = session.assessmentId;
      setAssessmentForm({
        ...detailToAssessmentForm(assessmentDetail),
        unitId: String(unitId),
      });

      const cached = readDraftCache(orgId, unitId);
      const cachedStep =
        cached?.draftAssessmentId === session.draftAssessmentId
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

    if (!session.assessmentId) {
      hydratedAssessmentIdRef.current = null;
      hydrateLocalDraft();
    }
  }, [
    assessmentDetail,
    open,
    orgId,
    session.assessmentId,
    session.draftAssessmentId,
    unitId,
  ]);

  useEffect(() => {
    if (!open || !orgId) return;

    writeDraftCache(orgId, unitId, {
      form: assessmentForm,
      step: assessmentStep,
      draftAssessmentId: session.draftAssessmentId,
    });

    const key = getDraftKey(orgId, unitId);
    if (key && session.draftAssessmentId) {
      localStorage.setItem(
        `${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${key}`,
        String(session.draftAssessmentId),
      );
    }
  }, [assessmentForm, assessmentStep, open, orgId, session.draftAssessmentId, unitId]);

  const autosaveDraft = useEffectEvent(async () => {
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
  });

  useEffect(() => {
    if (!open || !orgId || !session.draftAssessmentId) return;
    if (isHydratingAssessmentRef.current) return;

    const timer = window.setTimeout(() => {
      void autosaveDraft();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [assessmentForm, autosaveDraft, open, orgId, session.draftAssessmentId]);

  useEffect(() => {
    setAssessmentStep((current) => clampStep(current, assessmentForm.mode));
    setAssessmentMaxStep((current) =>
      Math.min(current, getWizardSteps(assessmentForm.mode).length - 1),
    );
  }, [assessmentForm.mode]);

  const ensureRemoteDraft = async () => {
    if (!orgId) return null;
    if (session.draftAssessmentId) return session.draftAssessmentId;

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

    onSessionChange({
      mode: "create",
      assessmentId: created.id,
      draftAssessmentId: created.id,
    });
    const key = getDraftKey(orgId, unitId);
    if (key) {
      localStorage.setItem(
        `${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${key}`,
        String(created.id),
      );
    }
    toast({
      title: "Rascunho remoto criado",
      description: "A avaliação foi persistida no servidor e seguirá com autosave.",
    });
    return created.id;
  };

  const handleSaveDraft = async () => {
    if (!orgId) return;

    try {
      if (session.draftAssessmentId) {
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
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const maybeCreateInitialMonitoringPlan = async (
    savedAssessment: LaiaAssessmentDetail,
  ) => {
    if (!orgId) return;
    if (savedAssessment.status !== "active") return;
    if (session.mode === "edit" && assessmentDetail?.status === "active") {
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

    try {
      await createLaiaMonitoringPlan(orgId, savedAssessment.id, {
        title: assessmentForm.monitoringTitle.trim(),
        objective: assessmentForm.monitoringObjective.trim(),
        method: assessmentForm.monitoringMethod.trim(),
        frequency: assessmentForm.monitoringFrequency.trim(),
        nextDueAt: localDateToIso(assessmentForm.monitoringNextDueAt) ?? null,
        status: "active",
      });
    } catch (error) {
      console.error(
        "Failed to create initial monitoring plan:",
        savedAssessment.id,
        error,
      );
      toast({
        title: "Plano de monitoramento pendente",
        description:
          "A avaliação foi salva, mas o plano inicial não pôde ser criado automaticamente.",
      });
    }
  };

  const handleSubmitAssessment = async () => {
    if (!orgId) return;

    try {
      const payload = normalizeAssessmentPayload(assessmentForm);
      const savedAssessment = session.assessmentId
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
        onSessionChange({
          mode: session.mode,
          assessmentId: savedAssessment.id,
          draftAssessmentId: savedAssessment.id,
        });
        const key = getDraftKey(orgId, unitId);
        if (key) {
          localStorage.setItem(
            `${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${key}`,
            String(savedAssessment.id),
          );
        }
        onOpenChange(false);
        toast({
          title: "Rascunho salvo",
          description: "A avaliação pode ser retomada a qualquer momento.",
        });
        return;
      }

      clearDraftCache(orgId, unitId);
      onOpenChange(false);
      resetDialog();
      toast({
        title: session.mode === "edit" ? "Avaliação atualizada" : "Avaliação criada",
        description: "A matriz LAIA foi atualizada com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar avaliação",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleNextStep = async () => {
    if (!session.draftAssessmentId && hasAssessmentMinimumRemoteDraftData(assessmentForm)) {
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
                      status: event.target.value as AssessmentFormState["status"],
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
                  disabled={lockUnit}
                  onChange={(event) =>
                    setAssessmentForm((current) => ({
                      ...current,
                      unitId: event.target.value,
                    }))
                  }
                >
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
                <Label htmlFor="assessment-score">Pontuação</Label>
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
                      category: event.target.value as AssessmentFormState["category"],
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
                      significance: event.target.value as AssessmentFormState["significance"],
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  <option value="significant">Significativo</option>
                  <option value="not_significant">Não significativo</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="review-frequency">Frequência de revisão (dias)</Label>
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
                  <Label htmlFor="frequency-probability">Frequência / probabilidade</Label>
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
              <div className="rounded-2xl border border-border/60 px-4 py-3">
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
              <div className="rounded-2xl border border-border/60 px-4 py-3">
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
              <div className="rounded-2xl border border-border/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="startup-shutdown">Partida / desligamento</Label>
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
                <Label htmlFor="emergency-scenario">Cenário de emergência</Label>
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
                <Label htmlFor="lifecycle-stages">Estágios do ciclo de vida</Label>
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
                      controlLevel: event.target.value as AssessmentFormState["controlLevel"],
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
                <Label htmlFor="outsourced-process">Processo terceirizado</Label>
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
                <Label htmlFor="supplier-reference">Fornecedor / referência</Label>
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
              <div className="rounded-2xl border border-border/60 px-4 py-3">
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
              <div className="rounded-2xl border border-border/60 px-4 py-3">
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
              <div className="rounded-2xl border border-border/60 px-4 py-3">
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

            <div className="rounded-2xl border border-border/60 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Comunicação interna</p>
                  <p className="text-xs text-muted-foreground">
                    Gera um plano mínimo usando a infraestrutura de comunicação existente.
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
                  <Label htmlFor="communication-notes">Notas de comunicação</Label>
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
            {session.mode === "edit" && assessmentDetail?.monitoringPlans.length ? (
              <div className="rounded-2xl border border-border/60 px-4 py-4">
                <p className="text-sm font-medium">Monitoramento existente</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {assessmentDetail.monitoringPlans.length} plano(s) já cadastrado(s).
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/60 px-4 py-4">
                <p className="text-sm font-medium">Plano inicial de monitoramento</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Opcional nesta etapa. Se preenchido, o plano inicial será criado ao salvar uma avaliação ativa.
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
                    <Label htmlFor="monitoring-next-due-at">Próximo vencimento</Label>
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
                  <p>{assessmentDetail?.aspectCode || "Nova avaliação"}</p>
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
                  {sectors.find((sector) => String(sector.id) === assessmentForm.sectorId)?.name ||
                    "Sem setor"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pontuação / categoria</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>{assessmentForm.totalScore || "Sem pontuação"}</p>
                  <p>{assessmentForm.category || "Sem categoria"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Significância</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Badge variant={getSignificanceBadgeVariant(assessmentForm.significance || null)}>
                    {getSignificanceLabel(assessmentForm.significance || null)}
                  </Badge>
                  <p className="text-muted-foreground">
                    {assessmentForm.significanceReason || "Sem justificativa"}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          hydratedAssessmentIdRef.current = null;
        }
      }}
      title={session.mode === "edit" ? "Editar avaliação LAIA" : "Nova avaliação LAIA"}
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
            Este formulário está vinculado a um rascunho remoto e será sincronizado automaticamente.
          </div>
        )}

        {renderWizardStep()}
      </div>

      <DialogFooter className="justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            variant="secondary"
            onClick={handleSaveDraft}
            isLoading={createAssessmentMutation.isPending || updateAssessmentMutation.isPending}
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
                createAssessmentMutation.isPending || updateAssessmentMutation.isPending
              }
            >
              {session.mode === "edit"
                ? "Salvar alterações"
                : assessmentForm.status === "draft"
                  ? "Salvar avaliação"
                  : "Ativar avaliação"}
            </Button>
          )}
        </div>
      </DialogFooter>
    </Dialog>
  );
}

export function getLatestUnitDraftId(
  orgId: number | undefined,
  unitId: number,
  drafts: { id: number }[],
) {
  const key = getDraftKey(orgId, unitId);
  if (!key) return null;
  const storedRemoteDraftId = Number(
    localStorage.getItem(`${ASSESSMENT_REMOTE_DRAFT_STORAGE_KEY}:${key}`) || "",
  );
  if (Number.isFinite(storedRemoteDraftId) && storedRemoteDraftId > 0) {
    return drafts.find((item) => item.id === storedRemoteDraftId)?.id ?? null;
  }
  return drafts[0]?.id ?? null;
}
