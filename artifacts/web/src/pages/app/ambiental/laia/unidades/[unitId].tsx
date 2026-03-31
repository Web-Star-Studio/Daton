import { useMemo, useState } from "react";
import {
  getListLegislationsQueryKey,
  getListUnitsQueryKey,
  useListLegislations,
  useListUnits,
} from "@workspace/api-client-react";
import { useLocation, useParams } from "wouter";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ArrowLeft, Plus } from "lucide-react";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
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
import { useAuth } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import {
  LaiaAssessmentDialog,
  getLatestUnitDraftId,
  type LaiaAssessmentDialogSession,
} from "@/components/environmental/laia/assessment-dialog";
import { LaiaSectorDialog } from "@/components/environmental/laia/sector-dialog";
import { toast } from "@/hooks/use-toast";
import {
  useLaiaAssessments,
  useLaiaBranchConfigs,
  useLaiaSectors,
  useLaiaUnitOverview,
  useUpdateLaiaBranchConfig,
  useUpdateLaiaSector,
  type LaiaAssessmentListItem,
} from "@/lib/environmental-laia-client";

const SURVEY_STATUS_OPTIONS = [
  { value: "nao_levantado", label: "Não levantado" },
  { value: "em_levantamento", label: "Em levantamento" },
  { value: "levantado", label: "Levantado" },
] as const;

const DISTRIBUTION_META = {
  byTemporality: {
    title: "Temporalidade",
    order: ["futura", "atual", "passada", "nao_informado"],
    labels: {
      futura: "Futura",
      atual: "Atual",
      passada: "Passada",
      nao_informado: "Não informado",
    },
    colors: ["#0f766e", "#2563eb", "#a16207", "#94a3b8"],
  },
  byOperationalSituation: {
    title: "Situação operacional",
    order: ["anormal", "normal", "emergencia", "nao_informado"],
    labels: {
      anormal: "Anormal",
      normal: "Normal",
      emergencia: "Emergência",
      nao_informado: "Não informado",
    },
    colors: ["#dc2626", "#16a34a", "#7c3aed", "#94a3b8"],
  },
  byIncidence: {
    title: "Incidência",
    order: ["direto", "indireto", "nao_informado"],
    labels: {
      direto: "Direto",
      indireto: "Indireto",
      nao_informado: "Não informado",
    },
    colors: ["#0284c7", "#f97316", "#94a3b8"],
  },
  byImpactClass: {
    title: "Classe de impacto",
    order: ["adverso", "benefico", "nao_informado"],
    labels: {
      adverso: "Adverso",
      benefico: "Benéfico",
      nao_informado: "Não informado",
    },
    colors: ["#ef4444", "#22c55e", "#94a3b8"],
  },
} as const;

function getSurveyStatusLabel(status: string | null | undefined) {
  return (
    SURVEY_STATUS_OPTIONS.find((option) => option.value === status)?.label ||
    "Não levantado"
  );
}

function getSurveyStatusBadgeVariant(status: string | null | undefined) {
  if (status === "levantado") return "success";
  if (status === "em_levantamento") return "warning";
  return "secondary";
}

function getCategoryLabel(category: string | null) {
  if (category === "critico") return "Crítico";
  if (category === "moderado") return "Moderado";
  if (category === "desprezivel") return "Desprezível";
  return "Não avaliada";
}

function getCategoryBadgeVariant(category: string | null) {
  if (category === "critico") return "destructive";
  if (category === "moderado") return "warning";
  if (category === "desprezivel") return "secondary";
  return "outline";
}

function getSignificanceLabel(significance: string | null) {
  if (significance === "significant") return "Significativo";
  if (significance === "not_significant") return "Não significativo";
  return "Não avaliada";
}

function getSignificanceBadgeVariant(significance: string | null) {
  if (significance === "significant") return "destructive";
  if (significance === "not_significant") return "secondary";
  return "outline";
}

function buildDistributionData(
  counts: Record<string, number>,
  meta: (typeof DISTRIBUTION_META)[keyof typeof DISTRIBUTION_META],
) {
  return meta.order.map((key, index) => ({
    key,
    label: meta.labels[key as keyof typeof meta.labels] || key,
    total: counts[key] || 0,
    fill: meta.colors[index] || "#94a3b8",
  }));
}

function DistributionChartCard({
  title,
  data,
}: {
  title: string;
  data: { key: string; label: string; total: number; fill: string }[];
}) {
  const config = useMemo(
    () =>
      Object.fromEntries(
        data.map((item) => [
          item.key,
          {
            label: item.label,
            color: item.fill,
          },
        ]),
      ),
    [data],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartContainer config={config} className="h-[260px] w-full">
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={56}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideIndicator />}
            />
            <Bar dataKey="total" radius={[8, 8, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.key} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>

        <div className="grid gap-2">
          {data.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.fill }}
                />
                <span>{item.label}</span>
              </div>
              <span className="font-medium">{item.total}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function EnvironmentalLaiaUnitDetailPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const { unitId: unitIdParam } = useParams<{ unitId: string }>();
  const [, navigate] = useLocation();
  const unitId = Number(unitIdParam || "0");

  const [assessmentDialogOpen, setAssessmentDialogOpen] = useState(false);
  const [sectorDialogOpen, setSectorDialogOpen] = useState(false);
  const [assessmentSession, setAssessmentSession] =
    useState<LaiaAssessmentDialogSession>({
      mode: "create",
      assessmentId: null,
      draftAssessmentId: null,
    });
  const [pendingSectorId, setPendingSectorId] = useState<number | null>(null);

  const { data: overview } = useLaiaUnitOverview(orgId, unitId);
  const { data: branchConfigs = [] } = useLaiaBranchConfigs(orgId);
  const { data: assessments = [] } = useLaiaAssessments(orgId, { unitId });
  const { data: draftAssessments = [] } = useLaiaAssessments(orgId, {
    unitId,
    status: "draft",
  });
  const { data: sectors = [] } = useLaiaSectors(orgId, unitId);
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

  const updateBranchConfigMutation = useUpdateLaiaBranchConfig(orgId);
  const updateSectorMutation = useUpdateLaiaSector(orgId);

  const unit = units.find((item) => item.id === unitId);
  const unitName = overview?.unitName || unit?.name || `Unidade ${unitId}`;
  const currentStatus =
    overview?.surveyStatus ||
    branchConfigs.find((item) => item.unitId === unitId)?.surveyStatus ||
    "nao_levantado";

  usePageTitle(`LAIA · ${unitName}`);
  usePageSubtitle(
    "Painel operacional da unidade com visão geral, avaliações ambientais e setores vinculados.",
  );

  const detailBasePath = window.location.pathname.startsWith("/app/")
    ? "/app/ambiental/laia"
    : "/ambiental/laia";

  const handleOpenNewAssessment = () => {
    const draftId = getLatestUnitDraftId(orgId, unitId, draftAssessments);
    if (draftId) {
      setAssessmentSession({
        mode: "create",
        assessmentId: draftId,
        draftAssessmentId: draftId,
      });
      setAssessmentDialogOpen(true);
      toast({
        title: "Rascunho retomado",
        description: "Existe um rascunho remoto em aberto para esta unidade.",
      });
      return;
    }

    setAssessmentSession({
      mode: "create",
      assessmentId: null,
      draftAssessmentId: null,
    });
    setAssessmentDialogOpen(true);
  };

  const handleOpenEditAssessment = (assessment: LaiaAssessmentListItem) => {
    setAssessmentSession({
      mode: "edit",
      assessmentId: assessment.id,
      draftAssessmentId: assessment.status === "draft" ? assessment.id : null,
    });
    setAssessmentDialogOpen(true);
  };

  const handleSurveyStatusChange = async (nextStatus: string) => {
    if (!orgId) return;

    try {
      await updateBranchConfigMutation.mutateAsync({
        unitId,
        surveyStatus: nextStatus as
          | "nao_levantado"
          | "em_levantamento"
          | "levantado",
      });
      toast({
        title: "Status atualizado",
        description: "O levantamento da unidade foi atualizado.",
      });
    } catch (error) {
      toast({
        title: "Falha ao atualizar status",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleSectorToggle = async (sectorId: number, checked: boolean) => {
    setPendingSectorId(sectorId);
    try {
      await updateSectorMutation.mutateAsync({
        sectorId,
        isActive: checked,
      });
      toast({
        title: "Setor atualizado",
        description: "O status do setor foi atualizado.",
      });
    } catch (error) {
      toast({
        title: "Falha ao atualizar setor",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setPendingSectorId(null);
    }
  };

  useHeaderActions(
    <div className="flex items-center gap-2">
      <HeaderActionButton
        variant="outline"
        size="sm"
        onClick={() => navigate(detailBasePath)}
        label="Voltar para LAIA"
        icon={<ArrowLeft className="h-3.5 w-3.5" />}
      />
      <HeaderActionButton
        variant="outline"
        size="sm"
        onClick={() => setSectorDialogOpen(true)}
        label="Novo setor"
        icon={<Plus className="h-3.5 w-3.5" />}
      />
      <HeaderActionButton
        size="sm"
        onClick={handleOpenNewAssessment}
        label="Nova avaliação"
        icon={<Plus className="h-3.5 w-3.5" />}
      />
    </div>,
  );

  const overviewCards = useMemo(
    () => [
      {
        title: "Total de avaliações",
        value: overview?.totalAssessments ?? assessments.length,
      },
      {
        title: "Críticas",
        value: assessments.filter((item) => item.category === "critico").length,
      },
      {
        title: "Significativas",
        value: assessments.filter((item) => item.significance === "significant")
          .length,
      },
      {
        title: "Não significativas",
        value: assessments.filter(
          (item) => item.significance === "not_significant",
        ).length,
      },
    ],
    [assessments, overview?.totalAssessments],
  );

  const temporalityData = buildDistributionData(
    overview?.byTemporality ?? {},
    DISTRIBUTION_META.byTemporality,
  );
  const operationalSituationData = buildDistributionData(
    overview?.byOperationalSituation ?? {},
    DISTRIBUTION_META.byOperationalSituation,
  );
  const incidenceData = buildDistributionData(
    overview?.byIncidence ?? {},
    DISTRIBUTION_META.byIncidence,
  );
  const impactClassData = buildDistributionData(
    overview?.byImpactClass ?? {},
    DISTRIBUTION_META.byImpactClass,
  );

  return (
    <div className="space-y-8 px-6 py-6">
      <Card>
        <CardHeader className="gap-4 md:flex md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl">{unitName}</CardTitle>
            <div className="flex items-center gap-3">
              <Badge variant={getSurveyStatusBadgeVariant(currentStatus)}>
                {getSurveyStatusLabel(currentStatus)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Unidade ambiental em foco
              </span>
            </div>
          </div>
          <div className="w-full md:max-w-xs">
            <label
              htmlFor="survey-status"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              Status de levantamento
            </label>
            <Select
              id="survey-status"
              value={currentStatus}
              onChange={(event) => handleSurveyStatusChange(event.target.value)}
            >
              {SURVEY_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-4"
              >
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  {card.title}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="visao-geral">
        <TabsList>
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="avaliacoes">Avaliações</TabsTrigger>
          <TabsTrigger value="setores">Setores</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <DistributionChartCard
              title={DISTRIBUTION_META.byTemporality.title}
              data={temporalityData}
            />
            <DistributionChartCard
              title={DISTRIBUTION_META.byOperationalSituation.title}
              data={operationalSituationData}
            />
            <DistributionChartCard
              title={DISTRIBUTION_META.byIncidence.title}
              data={incidenceData}
            />
            <DistributionChartCard
              title={DISTRIBUTION_META.byImpactClass.title}
              data={impactClassData}
            />
          </div>
        </TabsContent>

        <TabsContent value="avaliacoes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avaliações da unidade</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Aspecto Ambiental</TableHead>
                    <TableHead>Impacto</TableHead>
                    <TableHead>Pontuação</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Significância</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((assessment) => (
                    <TableRow key={assessment.id}>
                      <TableCell className="font-medium">
                        {assessment.aspectCode}
                      </TableCell>
                      <TableCell>
                        {assessment.sectorName || "Sem setor"}
                      </TableCell>
                      <TableCell>{assessment.activityOperation}</TableCell>
                      <TableCell>{assessment.environmentalAspect}</TableCell>
                      <TableCell>{assessment.environmentalImpact}</TableCell>
                      <TableCell>{assessment.totalScore ?? "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={getCategoryBadgeVariant(assessment.category)}
                        >
                          {getCategoryLabel(assessment.category)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getSignificanceBadgeVariant(
                            assessment.significance,
                          )}
                        >
                          {getSignificanceLabel(assessment.significance)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditAssessment(assessment)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {assessments.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Nenhuma avaliação cadastrada para esta unidade.
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
              <CardTitle className="text-base">Setores da unidade</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectors.map((sector) => (
                    <TableRow key={sector.id}>
                      <TableCell>{sector.code}</TableCell>
                      <TableCell>{sector.name}</TableCell>
                      <TableCell>{sector.description || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={sector.isActive}
                            disabled={pendingSectorId === sector.id}
                            aria-label={`Alternar status do setor ${sector.name}`}
                            onCheckedChange={(checked) =>
                              handleSectorToggle(sector.id, checked)
                            }
                          />
                          <span className="text-sm">
                            {sector.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {sectors.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Nenhum setor cadastrado para esta unidade.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LaiaSectorDialog
        open={sectorDialogOpen}
        onOpenChange={setSectorDialogOpen}
        orgId={orgId}
        unitId={unitId}
        unitName={unitName}
      />

      <LaiaAssessmentDialog
        open={assessmentDialogOpen}
        onOpenChange={setAssessmentDialogOpen}
        orgId={orgId}
        unitId={unitId}
        session={assessmentSession}
        onSessionChange={setAssessmentSession}
        units={units}
        sectors={sectors}
        legislations={legislations}
        lockUnit
      />
    </div>
  );
}
