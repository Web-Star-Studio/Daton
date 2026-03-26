import React, { useEffect, useMemo, useState } from "react";
import {
  getListLegislationsQueryKey,
  getListUnitsQueryKey,
  useListLegislations,
  useListUnits,
} from "@workspace/api-client-react";
import { FileWarning, Leaf, Plus, Radar, Workflow } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  createLaiaMonitoringPlan,
  useCreateLaiaAssessment,
  useCreateLaiaSector,
  useLaiaAssessments,
  useLaiaBranchConfigs,
  useLaiaDashboard,
  useLaiaMethodology,
  useLaiaRevisions,
  useLaiaSectors,
  usePublishLaiaMethodology,
  type LaiaAssessmentInput,
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
};

type AssessmentFormState = {
  mode: "quick" | "complete";
  status: "draft" | "active";
  unitId: string;
  sectorId: string;
  activityOperation: string;
  environmentalAspect: string;
  environmentalImpact: string;
  operationalSituation: string;
  totalScore: string;
  category: "desprezivel" | "moderado" | "critico" | "";
  significance: "significant" | "not_significant" | "";
  significanceReason: string;
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
  monitoringTitle: string;
  monitoringObjective: string;
  monitoringMethod: string;
  monitoringFrequency: string;
  monitoringNextDueAt: string;
};

const DEFAULT_METHODOLOGY_FORM: MethodologyFormState = {
  name: "Metodologia LAIA",
  title: "Metodologia LAIA v1",
  negligibleMax: "49",
  moderateMax: "70",
  moderateSignificanceRule:
    "Moderado é significativo quando houver requisito legal, parte interessada ou opção estratégica.",
  notes: "",
};

const DEFAULT_ASSESSMENT_FORM: AssessmentFormState = {
  mode: "quick",
  status: "draft",
  unitId: "",
  sectorId: "",
  activityOperation: "",
  environmentalAspect: "",
  environmentalImpact: "",
  operationalSituation: "",
  totalScore: "",
  category: "",
  significance: "",
  significanceReason: "",
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
  monitoringTitle: "",
  monitoringObjective: "",
  monitoringMethod: "",
  monitoringFrequency: "",
  monitoringNextDueAt: "",
};

const ASSESSMENT_DRAFT_STORAGE_KEY = "laia-assessment-dialog-draft";

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
    operationalSituation: form.operationalSituation.trim() || null,
    totalScore: parseOptionalNumber(form.totalScore) ?? null,
    category: form.category || null,
    significance: form.significance || null,
    significanceReason: form.significanceReason.trim() || null,
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

export default function EnvironmentalLaiaPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;

  const { data: dashboard } = useLaiaDashboard(orgId);
  const { data: branchConfigs = [] } = useLaiaBranchConfigs(orgId);
  const { data: sectors = [] } = useLaiaSectors(orgId);
  const { data: methodology } = useLaiaMethodology(orgId);
  const { data: assessments = [] } = useLaiaAssessments(orgId);
  const { data: revisions = [] } = useLaiaRevisions(orgId);
  const { data: units = [] } = useListUnits(orgId || 0, {
    query: { enabled: !!orgId, queryKey: getListUnitsQueryKey(orgId || 0) },
  });
  const { data: legislations = [] } = useListLegislations(orgId || 0, undefined, {
    query: {
      enabled: !!orgId,
      queryKey: getListLegislationsQueryKey(orgId || 0, undefined),
    },
  });

  const createSectorMutation = useCreateLaiaSector(orgId);
  const publishMethodologyMutation = usePublishLaiaMethodology(orgId);
  const createAssessmentMutation = useCreateLaiaAssessment(orgId);

  const [sectorDialogOpen, setSectorDialogOpen] = useState(false);
  const [methodologyDialogOpen, setMethodologyDialogOpen] = useState(false);
  const [assessmentDialogOpen, setAssessmentDialogOpen] = useState(false);
  const [sectorForm, setSectorForm] = useState<SectorFormState>({
    code: "",
    name: "",
    unitId: "",
    description: "",
  });
  const [methodologyForm, setMethodologyForm] =
    useState<MethodologyFormState>(DEFAULT_METHODOLOGY_FORM);
  const [assessmentForm, setAssessmentForm] =
    useState<AssessmentFormState>(DEFAULT_ASSESSMENT_FORM);

  usePageTitle("LAIA");
  usePageSubtitle(
    "Levantamento e avaliação dos aspectos e impactos ambientais com metodologia versionada, rastreabilidade e pendências operacionais.",
  );

  useHeaderActions(
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setMethodologyDialogOpen(true)}>
        <Radar className="mr-1.5 h-3.5 w-3.5" />
        Metodologia
      </Button>
      <Button variant="outline" size="sm" onClick={() => setSectorDialogOpen(true)}>
        <Workflow className="mr-1.5 h-3.5 w-3.5" />
        Novo setor
      </Button>
      <Button size="sm" onClick={() => setAssessmentDialogOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Nova avaliação
      </Button>
    </div>,
  );

  useEffect(() => {
    if (!orgId) return;
    const savedDraft = localStorage.getItem(`${ASSESSMENT_DRAFT_STORAGE_KEY}:${orgId}`);
    if (!savedDraft) return;

    try {
      setAssessmentForm({
        ...DEFAULT_ASSESSMENT_FORM,
        ...(JSON.parse(savedDraft) as Partial<AssessmentFormState>),
      });
    } catch {
      // Ignore invalid draft payload.
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !assessmentDialogOpen) return;
    localStorage.setItem(
      `${ASSESSMENT_DRAFT_STORAGE_KEY}:${orgId}`,
      JSON.stringify(assessmentForm),
    );
  }, [assessmentDialogOpen, assessmentForm, orgId]);

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
        description: error instanceof Error ? error.message : "Tente novamente.",
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
          negligibleMax: parseOptionalNumber(methodologyForm.negligibleMax) ?? 49,
          moderateMax: parseOptionalNumber(methodologyForm.moderateMax) ?? 70,
        },
        moderateSignificanceRule: methodologyForm.moderateSignificanceRule.trim(),
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
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const handleCreateAssessment = async () => {
    if (!orgId) return;

    try {
      const payload = normalizeAssessmentPayload(assessmentForm);
      const created = await createAssessmentMutation.mutateAsync(payload);
      let monitoringCreationFailed = false;
      let monitoringFailureMessage: string | null = null;

      if (
        assessmentForm.monitoringTitle.trim() &&
        assessmentForm.monitoringObjective.trim() &&
        assessmentForm.monitoringMethod.trim() &&
        assessmentForm.monitoringFrequency.trim()
      ) {
        try {
          await createLaiaMonitoringPlan(orgId, created.id, {
            title: assessmentForm.monitoringTitle.trim(),
            objective: assessmentForm.monitoringObjective.trim(),
            method: assessmentForm.monitoringMethod.trim(),
            frequency: assessmentForm.monitoringFrequency.trim(),
            nextDueAt: localDateToIso(assessmentForm.monitoringNextDueAt) ?? null,
            status: "active",
          });
        } catch (monitoringError) {
          monitoringCreationFailed = true;
          monitoringFailureMessage =
            monitoringError instanceof Error
              ? monitoringError.message
              : "Falha ao criar o plano de monitoramento.";
        }
      }

      if (monitoringCreationFailed) {
        toast({
          title: "Avaliação criada, mas o monitoramento falhou",
          description:
            monitoringFailureMessage ||
            "Cadastre o plano de monitoramento manualmente.",
          variant: "destructive",
        });
        localStorage.removeItem(`${ASSESSMENT_DRAFT_STORAGE_KEY}:${orgId}`);
        setAssessmentForm(DEFAULT_ASSESSMENT_FORM);
        setAssessmentDialogOpen(false);
        return;
      }

      localStorage.removeItem(`${ASSESSMENT_DRAFT_STORAGE_KEY}:${orgId}`);
      setAssessmentForm(DEFAULT_ASSESSMENT_FORM);
      setAssessmentDialogOpen(false);
      toast({
        title: "Avaliação criada",
        description: "A matriz LAIA foi atualizada com a nova avaliação.",
      });
    } catch (error) {
      toast({
        title: "Falha ao criar avaliação",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
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

      <Tabs defaultValue="matriz">
        <TabsList>
          <TabsTrigger value="matriz">Matriz</TabsTrigger>
          <TabsTrigger value="setores">Setores</TabsTrigger>
          <TabsTrigger value="metodologia">Metodologia</TabsTrigger>
          <TabsTrigger value="revisoes">Revisões</TabsTrigger>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
        </TabsList>

        <TabsContent value="matriz" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avaliações LAIA</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Aspecto</TableHead>
                    <TableHead>Impacto</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Significância</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((assessment) => (
                    <TableRow key={assessment.id}>
                      <TableCell>{assessment.aspectCode}</TableCell>
                      <TableCell>{assessment.sectorName || "Sem setor"}</TableCell>
                      <TableCell>{assessment.activityOperation}</TableCell>
                      <TableCell>{assessment.environmentalAspect}</TableCell>
                      <TableCell>{assessment.environmentalImpact}</TableCell>
                      <TableCell>{assessment.totalScore ?? "-"}</TableCell>
                      <TableCell>
                        {assessment.significance === "significant"
                          ? "Significativo"
                          : assessment.significance === "not_significant"
                            ? "Não significativo"
                            : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {assessments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Nenhuma avaliação cadastrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setores">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Setores operacionais</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectors.map((sector) => (
                    <TableRow key={sector.id}>
                      <TableCell>{sector.code}</TableCell>
                      <TableCell>{sector.name}</TableCell>
                      <TableCell>
                        {units.find((unit) => unit.id === sector.unitId)?.name || "Todas"}
                      </TableCell>
                      <TableCell>{sector.isActive ? "Ativo" : "Inativo"}</TableCell>
                    </TableRow>
                  ))}
                  {sectors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Nenhum setor LAIA configurado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metodologia">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metodologia vigente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {methodology ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Nome
                      </p>
                      <p className="mt-1 text-sm font-medium">{methodology.name}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Versão ativa
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {methodology.versions[0]?.versionNumber ?? "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Regra moderada
                      </p>
                      <p className="mt-1 text-sm">
                        {methodology.versions[0]?.moderateSignificanceRule || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {methodology.versions.map((version) => (
                      <div
                        key={version.id}
                        className="rounded-xl border border-border/60 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium">{version.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Versão {version.versionNumber} · publicada em{" "}
                              {version.publishedAt
                                ? new Date(version.publishedAt).toLocaleDateString("pt-BR")
                                : "sem data"}
                            </p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            Desprezível até {version.scoreThresholds.negligibleMax}
                            <br />
                            Moderado até {version.scoreThresholds.moderateMax}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma metodologia publicada ainda.
                </p>
              )}
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
                  className="rounded-xl border border-border/60 px-4 py-3"
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status por unidade</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Status do levantamento</TableHead>
                    <TableHead>Última atualização</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchConfigs.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell>{config.unitName || `Unidade ${config.unitId}`}</TableCell>
                      <TableCell>{config.surveyStatus}</TableCell>
                      <TableCell>
                        {config.updatedAt
                          ? new Date(config.updatedAt).toLocaleDateString("pt-BR")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {branchConfigs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                        Nenhuma unidade configurada para LAIA.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
                  setSectorForm((current) => ({ ...current, code: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="sector-name">Nome</Label>
              <Input
                id="sector-name"
                value={sectorForm.name}
                onChange={(event) =>
                  setSectorForm((current) => ({ ...current, name: event.target.value }))
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
                setSectorForm((current) => ({ ...current, unitId: event.target.value }))
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
          >
            Salvar setor
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={methodologyDialogOpen}
        onOpenChange={setMethodologyDialogOpen}
        title="Publicar metodologia"
        description="Crie uma nova versão da metodologia LAIA sem recalcular avaliações antigas."
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="methodology-name">Nome</Label>
              <Input
                id="methodology-name"
                value={methodologyForm.name}
                onChange={(event) =>
                  setMethodologyForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="methodology-title">Título da versão</Label>
              <Input
                id="methodology-title"
                value={methodologyForm.title}
                onChange={(event) =>
                  setMethodologyForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="negligible-max">Limite desprezível</Label>
              <Input
                id="negligible-max"
                value={methodologyForm.negligibleMax}
                onChange={(event) =>
                  setMethodologyForm((current) => ({
                    ...current,
                    negligibleMax: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="moderate-max">Limite moderado</Label>
              <Input
                id="moderate-max"
                value={methodologyForm.moderateMax}
                onChange={(event) =>
                  setMethodologyForm((current) => ({
                    ...current,
                    moderateMax: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="moderate-rule">Regra para moderado significativo</Label>
            <Textarea
              id="moderate-rule"
              value={methodologyForm.moderateSignificanceRule}
              onChange={(event) =>
                setMethodologyForm((current) => ({
                  ...current,
                  moderateSignificanceRule: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="methodology-notes">Notas</Label>
            <Textarea
              id="methodology-notes"
              value={methodologyForm.notes}
              onChange={(event) =>
                setMethodologyForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setMethodologyDialogOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handlePublishMethodology}>Publicar versão</Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={assessmentDialogOpen}
        onOpenChange={setAssessmentDialogOpen}
        title="Nova avaliação LAIA"
        description="Cadastro com rascunho local automático e modo rápido/completo."
        size="xl"
      >
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
              <Label htmlFor="assessment-operational-situation">Situação operacional</Label>
              <Input
                id="assessment-operational-situation"
                placeholder="Normal, anormal, manutenção..."
                value={assessmentForm.operationalSituation}
                onChange={(event) =>
                  setAssessmentForm((current) => ({
                    ...current,
                    operationalSituation: event.target.value,
                  }))
                }
              />
            </div>
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

          <div className="rounded-2xl border border-border/60 px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Comunicação interna</p>
                <p className="text-xs text-muted-foreground">
                  Gere um plano mínimo reaproveitando a infraestrutura de comunicação.
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

          {assessmentForm.mode === "complete" && (
            <>
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
                  <Label htmlFor="next-review">Próxima revisão</Label>
                  <Input
                    id="next-review"
                    type="date"
                    value={assessmentForm.nextReviewAt}
                    onChange={(event) =>
                      setAssessmentForm((current) => ({
                        ...current,
                        nextReviewAt: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 px-4 py-4">
                <p className="text-sm font-medium">Plano inicial de monitoramento</p>
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
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAssessmentDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreateAssessment}
            disabled={
              !assessmentForm.activityOperation.trim() ||
              !assessmentForm.environmentalAspect.trim() ||
              !assessmentForm.environmentalImpact.trim()
            }
          >
            Salvar avaliação
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
