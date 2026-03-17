import React, { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getListUnitsQueryKey,
  getListUserOptionsQueryKey,
  useListUnits,
  useListUserOptions,
  type UserOption,
} from "@workspace/api-client-react";
import {
  useGovernanceActionRegisterMutations,
  useGovernancePlan,
  useGovernancePlans,
  useGovernanceRiskOpportunityItems,
  useGovernanceRiskOpportunityRegisterMutations,
  type GovernanceActionBody,
  type GovernanceRiskOpportunityFilters,
  type GovernancePlanSummary,
  type GovernanceRiskOpportunityBody,
  type GovernanceRiskOpportunityEffectivenessReviewBody,
  type GovernanceRiskOpportunityListEntry,
} from "@/lib/governance-client";
import {
  dateToIso,
  formatGovernanceDate,
  isoToDateInput,
} from "@/lib/governance-ui";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";

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

function getRiskTypeLabel(type: GovernanceRiskOpportunityListEntry["type"]) {
  return type === "risk" ? "Risco" : "Oportunidade";
}

function getRiskStatusLabel(status: GovernanceRiskOpportunityListEntry["status"]) {
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
  sourceType: GovernanceRiskOpportunityListEntry["sourceType"],
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
  strategy?: GovernanceRiskOpportunityListEntry["responseStrategy"] | null,
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

function isEditablePlan(plan?: GovernancePlanSummary | null) {
  return !!plan && ["draft", "rejected"].includes(plan.status);
}

export default function GovernanceRiskOpportunityPage() {
  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization?.id;
  const [location, navigate] = useLocation();
  const basePath = location.startsWith("/app/")
    ? "/app/governanca/riscos-oportunidades"
    : "/governanca/riscos-oportunidades";
  const planDetailBase = location.startsWith("/app/")
    ? "/app/governanca/planejamento"
    : "/governanca/planejamento";
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const planIdFilter = queryParams.get("planId") ? Number(queryParams.get("planId")) : undefined;
  const createFromQuery = queryParams.get("create") === "1";
  const swotItemIdFromQuery = queryParams.get("swotItemId")
    ? Number(queryParams.get("swotItemId"))
    : undefined;
  const objectiveIdFromQuery = queryParams.get("objectiveId")
    ? Number(queryParams.get("objectiveId"))
    : undefined;
  const typeFromQuery = queryParams.get("type");

  const [riskTypeFilter, setRiskTypeFilter] = useState<string>("all");
  const [riskStatusFilter, setRiskStatusFilter] = useState<string>("all");
  const [riskPriorityFilter, setRiskPriorityFilter] = useState<string>("all");
  const [riskUnitFilter, setRiskUnitFilter] = useState<string>("all");
  const [riskOwnerFilter, setRiskOwnerFilter] = useState<string>("all");
  const [riskSourceFilter, setRiskSourceFilter] = useState<string>("all");
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskEditing, setRiskEditing] =
    useState<GovernanceRiskOpportunityListEntry | null>(null);
  const [riskDeletingId, setRiskDeletingId] = useState<number | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionContextItem, setActionContextItem] =
    useState<GovernanceRiskOpportunityListEntry | null>(null);
  const [riskEffectivenessDialogOpen, setRiskEffectivenessDialogOpen] =
    useState(false);
  const [riskEffectivenessTarget, setRiskEffectivenessTarget] =
    useState<GovernanceRiskOpportunityListEntry | null>(null);
  const [dialogPlanId, setDialogPlanId] = useState<number | null>(
    planIdFilter ?? null,
  );
  const [didConsumeCreateQuery, setDidConsumeCreateQuery] = useState(false);

  const { data: plans = [], isLoading: isPlansLoading } = useGovernancePlans(orgId);
  const editablePlans = useMemo(
    () => plans.filter((plan) => isEditablePlan(plan)),
    [plans],
  );
  const plansById = useMemo(
    () => new Map(plans.map((plan) => [plan.id, plan])),
    [plans],
  );
  const listFilters = useMemo<GovernanceRiskOpportunityFilters>(
    () => ({
      planId: planIdFilter,
      type:
        riskTypeFilter === "all"
          ? undefined
          : (riskTypeFilter as GovernanceRiskOpportunityFilters["type"]),
      status:
        riskStatusFilter === "all"
          ? undefined
          : (riskStatusFilter as GovernanceRiskOpportunityFilters["status"]),
      priority:
        riskPriorityFilter === "all"
          ? undefined
          : (riskPriorityFilter as GovernanceRiskOpportunityFilters["priority"]),
      ownerUserId:
        riskOwnerFilter === "all" ? undefined : Number(riskOwnerFilter),
      unitId: riskUnitFilter === "all" ? undefined : Number(riskUnitFilter),
      sourceType:
        riskSourceFilter === "all"
          ? undefined
          : (riskSourceFilter as GovernanceRiskOpportunityFilters["sourceType"]),
    }),
    [
      planIdFilter,
      riskOwnerFilter,
      riskPriorityFilter,
      riskSourceFilter,
      riskStatusFilter,
      riskTypeFilter,
      riskUnitFilter,
    ],
  );
  const { data: items = [], isLoading } = useGovernanceRiskOpportunityItems(
    orgId,
    listFilters,
  );
  const riskMutations = useGovernanceRiskOpportunityRegisterMutations(orgId);
  const actionMutations = useGovernanceActionRegisterMutations(orgId);
  const { data: units = [] } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });
  const { data: users = [] } = useListUserOptions(orgId!, {
    query: { queryKey: getListUserOptionsQueryKey(orgId!), enabled: !!orgId },
  });
  const { data: dialogPlan } = useGovernancePlan(orgId, dialogPlanId || undefined);

  const riskOpportunityForm = useForm<GovernanceRiskOpportunityBody>({
    resolver: zodResolver(governanceRiskOpportunitySchema),
    defaultValues: blankRiskOpportunityForm(),
  });
  const actionForm = useForm<GovernanceActionBody & { unitIds: number[] }>({
    resolver: zodResolver(governanceActionSchema),
    defaultValues: blankActionForm(),
  });
  const riskEffectivenessForm =
    useForm<GovernanceRiskOpportunityEffectivenessReviewBody>({
      defaultValues: blankRiskEffectivenessReview(),
    });

  const actionUnitIds = actionForm.watch("unitIds");
  const riskLikelihood = riskOpportunityForm.watch("likelihood");
  const riskImpact = riskOpportunityForm.watch("impact");

  usePageTitle("Riscos e Oportunidades");
  usePageSubtitle(
    "Registro operacional corporativo do requisito ISO 9001:2015 §6.1, com avaliação, resposta e eficácia por plano.",
  );

  const updateQuery = (updates: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    const nextSearch = next.toString();
    navigate(nextSearch ? `${basePath}?${nextSearch}` : basePath);
  };

  const metrics = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (!["effective", "canceled"].includes(item.status)) {
          acc.open += 1;
        }
        if (
          item.nextReviewAt &&
          new Date(item.nextReviewAt).getTime() < Date.now() &&
          !["effective", "canceled"].includes(item.status)
        ) {
          acc.overdue += 1;
        }
        acc.byType[item.type] = (acc.byType[item.type] || 0) + 1;
        acc.byPriority[item.priority] = (acc.byPriority[item.priority] || 0) + 1;
        return acc;
      },
      {
        total: 0,
        open: 0,
        overdue: 0,
        byType: {} as Record<string, number>,
        byPriority: {} as Record<string, number>,
      },
    );
  }, [items]);

  const riskScorePreview =
    typeof riskLikelihood === "number" && typeof riskImpact === "number"
      ? riskLikelihood * riskImpact
      : null;

  const canCreate = canWriteModule("governance") && editablePlans.length > 0;

  const resetCreateQueryParams = () => {
    updateQuery({
      create: null,
      swotItemId: null,
      objectiveId: null,
      type: null,
    });
  };

  const openRiskOpportunityDialog = (
    item?: GovernanceRiskOpportunityListEntry,
    planIdOverride?: number,
  ) => {
    const nextPlanId = planIdOverride ?? item?.planId ?? planIdFilter ?? editablePlans[0]?.id ?? null;
    setDialogPlanId(nextPlanId);
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

  const openActionDialog = (item: GovernanceRiskOpportunityListEntry) => {
    setDialogPlanId(item.planId);
    setActionContextItem(item);
    actionForm.reset({
      ...blankActionForm(),
      objectiveId: item.objectiveId || null,
      riskOpportunityItemId: item.id,
      responsibleUserId: item.ownerUserId || null,
      secondaryResponsibleUserId: item.coOwnerUserId || null,
      swotItemId: item.swotItemId || null,
      unitIds: item.unitId ? [item.unitId] : [],
    });
    setActionDialogOpen(true);
  };

  const openRiskEffectivenessDialog = (item: GovernanceRiskOpportunityListEntry) => {
    setRiskEffectivenessTarget(item);
    riskEffectivenessForm.reset({
      result: item.latestEffectivenessReview?.result || "effective",
      comment: item.latestEffectivenessReview?.comment || "",
    });
    setRiskEffectivenessDialogOpen(true);
  };

  useEffect(() => {
    if (createFromQuery) {
      setDidConsumeCreateQuery(false);
    }
  }, [createFromQuery, objectiveIdFromQuery, swotItemIdFromQuery, typeFromQuery]);

  useEffect(() => {
    if (!createFromQuery || didConsumeCreateQuery) return;
    const initialPlanId = planIdFilter ?? editablePlans[0]?.id;
    if (!initialPlanId) return;
    setDialogPlanId(initialPlanId);
  }, [createFromQuery, didConsumeCreateQuery, editablePlans, planIdFilter]);

  useEffect(() => {
    if (!createFromQuery || didConsumeCreateQuery || !dialogPlan) return;

    const swotItem = swotItemIdFromQuery
      ? dialogPlan.swotItems.find((item) => item.id === swotItemIdFromQuery)
      : null;
    const inferredType =
      typeFromQuery === "risk" || typeFromQuery === "opportunity"
        ? typeFromQuery
        : swotItem
          ? swotItem.swotType === "strength" || swotItem.swotType === "opportunity"
            ? "opportunity"
            : "risk"
          : "risk";

    riskOpportunityForm.reset({
      ...blankRiskOpportunityForm(),
      type: inferredType,
      sourceType: swotItem ? "swot" : "meeting",
      sourceReference:
        swotItem?.matrixLabel || swotItem?.importedActionReference || "",
      title: swotItem?.description.slice(0, 120) || "",
      description: swotItem?.description || "",
      swotItemId: swotItem?.id || null,
      objectiveId: objectiveIdFromQuery || null,
      likelihood: swotItem?.performance || null,
      impact: swotItem?.relevance || null,
      notes: swotItem?.treatmentDecision || "",
    });
    setRiskEditing(null);
    setRiskDialogOpen(true);
    setDidConsumeCreateQuery(true);
  }, [
    createFromQuery,
    dialogPlan,
    didConsumeCreateQuery,
    objectiveIdFromQuery,
    riskOpportunityForm,
    swotItemIdFromQuery,
    typeFromQuery,
  ]);

  useHeaderActions(
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() =>
          openRiskOpportunityDialog(undefined, planIdFilter ?? editablePlans[0]?.id)
        }
        disabled={!canCreate}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Novo item
      </Button>
    </div>,
  );

  const saveRiskOpportunity = riskOpportunityForm.handleSubmit(async (values) => {
    if (!dialogPlanId) {
      toast({
        title: "Plano obrigatório",
        description: "Selecione um plano antes de salvar o item.",
      });
      return;
    }

    const targetPlan = plansById.get(dialogPlanId);
    if (!isEditablePlan(targetPlan)) {
      toast({
        title: "Plano bloqueado",
        description:
          "Somente planos em rascunho ou rejeitados podem receber alterações.",
      });
      return;
    }

    const payload = {
      ...values,
      sourceReference: values.sourceReference || null,
      ownerUserId: values.ownerUserId || null,
      coOwnerUserId: values.coOwnerUserId || null,
      unitId: values.unitId || null,
      objectiveId: values.objectiveId || null,
      swotItemId: values.swotItemId || null,
      responseStrategy: values.responseStrategy || undefined,
      nextReviewAt: values.nextReviewAt ? dateToIso(values.nextReviewAt) : null,
      existingControls: values.existingControls || null,
      expectedEffect: values.expectedEffect || null,
      notes: values.notes || null,
    };

    try {
      if (riskEditing) {
        await riskMutations.updateMutation.mutateAsync({
          planId: dialogPlanId,
          itemId: riskEditing.id,
          body: payload,
        });
      } else {
        await riskMutations.createMutation.mutateAsync({
          planId: dialogPlanId,
          body: payload,
        });
      }
      riskOpportunityForm.reset(blankRiskOpportunityForm());
      setRiskDialogOpen(false);
      setRiskEditing(null);
      resetCreateQueryParams();
    } catch (error) {
      toast({
        title: "Falha ao salvar risco ou oportunidade",
        description: error instanceof Error ? error.message : "Erro ao salvar.",
      });
    }
  });

  const saveAction = actionForm.handleSubmit(async (values) => {
    if (!dialogPlanId) return;

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
      await actionMutations.createMutation.mutateAsync({
        planId: dialogPlanId,
        body: payload,
      });
      actionForm.reset(blankActionForm());
      setActionDialogOpen(false);
      setActionContextItem(null);
    } catch (error) {
      toast({
        title: "Falha ao salvar ação",
        description: error instanceof Error ? error.message : "Erro ao salvar.",
      });
    }
  });

  const saveRiskEffectivenessReview = riskEffectivenessForm.handleSubmit(
    async (values) => {
      if (!riskEffectivenessTarget) return;
      try {
        await riskMutations.effectivenessReviewMutation.mutateAsync({
          planId: riskEffectivenessTarget.planId,
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

  const deleteRiskOpportunity = async (item: GovernanceRiskOpportunityListEntry) => {
    setRiskDeletingId(item.id);
    try {
      await riskMutations.deleteMutation.mutateAsync({
        planId: item.planId,
        itemId: item.id,
      });
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

  if (isPlansLoading || isLoading) {
    return (
      <div className="px-6 py-6 text-sm text-muted-foreground">
        Carregando registro de riscos e oportunidades...
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="px-6 py-12">
        <div className="flex flex-col items-center justify-center rounded-3xl border border-border/60 bg-card px-8 py-16 text-center">
          <Landmark className="h-10 w-10 text-muted-foreground/40" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            Nenhum plano disponível para registrar riscos e oportunidades
          </h2>
          <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
            O registro ISO 6.1 continua vinculado a um planejamento estratégico.
            Crie um plano em Governança antes de usar este submódulo.
          </p>
          <Button
            className="mt-5"
            onClick={() => navigate(planDetailBase)}
          >
            Abrir Planejamento
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-8">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div>
          <Label>Plano</Label>
          <Select
            value={planIdFilter ? String(planIdFilter) : "all"}
            onChange={(event) =>
              updateQuery({
                planId: event.target.value === "all" ? null : event.target.value,
              })
            }
          >
            <option value="all">Todos</option>
            {plans.map((plan) => (
              <option key={plan.id} value={String(plan.id)}>
                {plan.title}
              </option>
            ))}
          </Select>
        </div>
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
            <option value="awaiting_effectiveness">Aguardando eficácia</option>
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
        <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
            Total
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {metrics.total}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
            Abertos
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {metrics.open}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
            Revisão vencida
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {metrics.overdue}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
            Riscos
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {metrics.byType.risk || 0}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
            Oportunidades
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {metrics.byType.opportunity || 0}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["critical", "high", "medium", "low", "na"] as const).map((priority) => (
          <Badge
            key={priority}
            variant="outline"
            className={cn("border", getRiskPriorityTone(priority))}
          >
            {getRiskPriorityLabel(priority)}: {metrics.byPriority[priority] || 0}
          </Badge>
        ))}
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const parentPlan = plansById.get(item.planId);
          const canEditItem = canWriteModule("governance") && isEditablePlan(parentPlan);

          return (
            <div
              key={item.id}
              className="rounded-2xl border border-border/60 bg-card px-5 py-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{getRiskTypeLabel(item.type)}</Badge>
                    <Badge
                      variant="outline"
                      className={cn("border", getRiskPriorityTone(item.priority))}
                    >
                      {getRiskPriorityLabel(item.priority)}
                    </Badge>
                    <Badge variant="outline">{getRiskStatusLabel(item.status)}</Badge>
                    <Badge variant="outline">{getRiskSourceLabel(item.sourceType)}</Badge>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                      <span>Plano</span>
                      <Link
                        href={`${planDetailBase}/${item.planId}`}
                        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                      >
                        {item.planTitle}
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <h4 className="mt-2 text-[15px] font-semibold text-foreground">
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
                        {item.likelihood ?? "—"} x {item.impact ?? "—"} = {item.score ?? "—"}
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
                  <div className="rounded-xl bg-muted/30 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                          Ações vinculadas
                        </p>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {item.actions.length} ação(ões) associada(s) ao tratamento.
                        </p>
                      </div>
                      {canEditItem && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openActionDialog(item)}
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
                              <p className="font-medium text-foreground">{action.title}</p>
                              <p className="text-muted-foreground">
                                {action.responsibleUserName || "Sem responsável"} · prazo{" "}
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
                {canEditItem && (
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
                      onClick={() => void deleteRiskOpportunity(item)}
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
          );
        })}

        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/80 px-6 py-14 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-4 text-[14px] font-medium text-foreground">
              Nenhum item encontrado
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Ajuste os filtros ou crie o primeiro risco ou oportunidade do registro.
            </p>
          </div>
        )}
      </div>

      <Dialog
        open={riskDialogOpen}
        onOpenChange={(open) => {
          setRiskDialogOpen(open);
          if (!open) {
            setRiskEditing(null);
            resetCreateQueryParams();
          }
        }}
        title={riskEditing ? "Editar risco ou oportunidade" : "Novo risco ou oportunidade"}
        description="Registro ISO 9001:2015 §6.1 com avaliação, resposta e revisão."
        size="lg"
      >
        <div className="grid gap-4">
          <div>
            <Label>Plano</Label>
            <Select
              value={dialogPlanId ? String(dialogPlanId) : ""}
              onChange={(event) => setDialogPlanId(Number(event.target.value))}
              disabled={!!riskEditing}
            >
              <option value="">Selecione</option>
              {editablePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </Select>
          </div>
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
                <option value="awaiting_effectiveness">Aguardando eficácia</option>
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
            <Textarea rows={4} {...riskOpportunityForm.register("description")} />
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
                {(dialogPlan?.objectives || []).map((item) => (
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
                {(dialogPlan?.swotItems || []).map((item) => (
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
              <Input type="date" {...riskOpportunityForm.register("nextReviewAt")} />
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
              <Textarea rows={3} {...riskOpportunityForm.register("existingControls")} />
            </div>
            <div>
              <Label>Efeito esperado</Label>
              <Textarea rows={3} {...riskOpportunityForm.register("expectedEffect")} />
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
              resetCreateQueryParams();
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={saveRiskOpportunity}
            isLoading={
              riskMutations.createMutation.isPending ||
              riskMutations.updateMutation.isPending
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
            isLoading={riskMutations.effectivenessReviewMutation.isPending}
          >
            Salvar revisão
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        title="Nova ação"
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
                {(dialogPlan?.swotItems || []).map((item) => (
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
                {(dialogPlan?.objectives || []).map((item) => (
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
                {(dialogPlan?.riskOpportunityItems || []).map((item) => (
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
              <Input type="date" {...actionForm.register("rescheduledDueDate")} />
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
          {actionContextItem && (
            <p className="text-[12px] text-muted-foreground">
              Esta ação será criada dentro do plano "{actionContextItem.planTitle}"
              e vinculada ao item "{actionContextItem.title}".
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              actionForm.reset(blankActionForm());
              setActionDialogOpen(false);
              setActionContextItem(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={saveAction}
            isLoading={actionMutations.createMutation.isPending}
          >
            Salvar
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
