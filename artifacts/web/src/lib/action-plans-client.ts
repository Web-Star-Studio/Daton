import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActionPlanQueryKey,
  getListActionPlanActivityQueryKey,
  getListActionPlanCommentsQueryKey,
  getListActionPlansQueryKey,
  getGetActionPlansSummaryQueryKey,
  getListKpiMonthJustificationsQueryKey,
  getListKpiYearDataQueryKey,
  useAddActionPlanComment,
  useAddActionPlanEvidence,
  useAddKpiMonthJustification,
  useCreateActionPlan,
  useDeleteActionPlan,
  useDeleteActionPlanEvidence,
  useGetActionPlan,
  getListExternalActionsQueryKey,
  useGetActionPlansSummary,
  useListActionPlanActivity,
  useListActionPlanComments,
  useListActionPlans,
  useListExternalActions,
  useListKpiMonthJustifications,
  useSuggestActionPlanDraft,
  useUpdateActionPlan,
  type ActionPlan,
  type ActionPlan5W2H,
  type ActionPlanActivityLogEntry,
  type ActionPlanComment,
  type ActionPlanEffectivenessMethod,
  type ActionPlanEffectivenessResult,
  type ActionPlanEvidence,
  type ActionPlanListItem,
  type ActionPlanNormRef,
  type ActionPlanPriority,
  type ActionPlanSourceModule,
  type ActionPlanSourceRef,
  type ActionPlanStatus,
  type ActionPlanSummary,
  type ActionPlanType,
  type CreateActionPlanBody,
  type ExternalActionItem,
  type KpiMonthlyValueJustification,
  type ListActionPlansParams,
  type SuggestActionPlanDraftBody,
  type SuggestActionPlanDraftResponse,
  type UpdateActionPlanBody,
} from "@workspace/api-client-react";
// GUT relevance bands are shared with the road-safety module (single source of truth).
import { GUT_RELEVANCE_LABELS, gutRelevance, type GutRelevance } from "@/lib/road-safety-client";

export type {
  ActionPlan,
  ActionPlan5W2H,
  ActionPlanActivityLogEntry,
  ActionPlanComment,
  ActionPlanEffectivenessMethod,
  ActionPlanEffectivenessResult,
  ActionPlanEvidence,
  ActionPlanListItem,
  ActionPlanNormRef,
  ActionPlanPriority,
  ActionPlanSourceModule,
  ActionPlanSourceRef,
  ActionPlanStatus,
  ActionPlanSummary,
  ActionPlanType,
  CreateActionPlanBody,
  ExternalActionItem,
  KpiMonthlyValueJustification,
  ListActionPlansParams,
  SuggestActionPlanDraftBody,
  SuggestActionPlanDraftResponse,
  UpdateActionPlanBody,
};
export { GUT_RELEVANCE_LABELS, gutRelevance, type GutRelevance };

// ─── AI draft (opt-in "Sugerir plano") ───────────────────────────────────────
// Pass-through over the generated mutation. No cache invalidation: the draft is
// never persisted — it only pre-fills the editable form, and the user saves via
// the existing PATCH. Keeping it here lets the page import every action-plans
// hook from one client module.
export { useSuggestActionPlanDraft };

export const ACTION_PLAN_STATUS_LABELS: Record<ActionPlanStatus, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const ACTION_PLAN_PRIORITY_LABELS: Record<ActionPlanPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export const ACTION_TYPE_LABELS: Record<ActionPlanType, string> = {
  corrective: "Corretiva",
  preventive: "Preventiva",
  improvement: "Melhoria",
};

export const SOURCE_MODULE_LABELS: Record<string, string> = {
  kpi: "Indicador (KPI)",
  swot: "SWOT",
  improvement: "Melhoria de Processo",
  corrective: "Corretiva",
  norm_requirement: "Não atendimento a requisito da norma",
  manual: "Manual",
  nonconformity: "Não conformidade",
  audit_finding: "Auditoria",
  risk: "Risco/oportunidade",
  training: "Treinamento",
  environmental: "Ambiental (LAIA)",
  road_safety: "Segurança viária",
  incident: "Incidente",
  rac: "Análise Crítica",
};

// Canonical ordered list of action-plan origins (filters, menus) — derived from the
// label map so it never drifts as new source modules are added.
export const SOURCE_MODULE_OPTIONS = Object.keys(SOURCE_MODULE_LABELS);

/**
 * Back-link from an action plan to its origin entity's page. Returns a RELATIVE
 * path (no `/app` prefix — the caller prepends the current base) with a label,
 * or `null` when the origin has no navigable destination (manual / incident have
 * no entity; training's detail route keys by title, not id). SWOT reuses the
 * existing `#fator-N` deep-link receiver on the SWOT page; the other modules
 * link to their module page (no per-row anchor yet).
 */
export function originLink(plan: Pick<ActionPlan, "sourceModule" | "sourceRef">): { path: string; label: string } | null {
  const ref = plan.sourceRef ?? {};
  switch (plan.sourceModule) {
    case "kpi":
      return { path: "/kpi/lancamentos", label: "Abrir KPI" };
    case "swot":
      return {
        path: typeof ref.swotFactorId === "number" ? `/organizacao/swot#fator-${ref.swotFactorId}` : "/organizacao/swot",
        label: "Abrir SWOT",
      };
    case "nonconformity":
      return { path: "/governanca/nao-conformidades", label: "Abrir não conformidade" };
    case "audit_finding":
      return { path: "/governanca/auditorias", label: "Abrir auditoria" };
    case "risk":
      return { path: "/governanca/riscos-oportunidades", label: "Abrir risco/oportunidade" };
    case "environmental":
      return { path: "/ambiental/laia", label: "Abrir LAIA" };
    case "road_safety":
      return { path: "/fatores-desempenho", label: "Abrir fator de desempenho" };
    case "rac":
      return { path: "/kpi/indicadores", label: "Abrir análise crítica" };
    case "training":
    case "incident":
    case "manual":
    default:
      return null;
  }
}

export const EFFECTIVENESS_METHOD_LABELS: Record<ActionPlanEffectivenessMethod, string> = {
  indicator: "Verificação por indicador",
  internal_audit: "Auditoria interna",
  field_inspection: "Inspeção física (campo)",
  training: "Verificação por treinamento",
  sampling: "Verificação por amostragem",
  risk_reduction: "Redução de risco",
};

export const EFFECTIVENESS_RESULT_LABELS: Record<ActionPlanEffectivenessResult, string> = {
  effective: "Eficaz",
  ineffective: "Não eficaz",
  pending: "Aguardando",
};

export function actionPlanStatusColor(status: ActionPlanStatus): string {
  if (status === "open")
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  if (status === "in_progress")
    return "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300";
  if (status === "completed")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  return "bg-muted text-muted-foreground";
}

export function actionPlanPriorityColor(priority: ActionPlanPriority): string {
  if (priority === "high")
    return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  if (priority === "medium")
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  return "bg-slate-100 text-slate-800 dark:bg-slate-500/15 dark:text-slate-300";
}

export function effectivenessResultColor(result: ActionPlanEffectivenessResult | null | undefined): string {
  if (result === "effective")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (result === "ineffective")
    return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  if (result === "pending")
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

// ─── GUT ─────────────────────────────────────────────────────────────────────

/** G×U×T, each axis 1–5 (→ 1–125). Null when any axis is unset. */
export function gutScore(
  g: number | null | undefined,
  u: number | null | undefined,
  t: number | null | undefined,
): number | null {
  if (g == null || u == null || t == null) return null;
  return g * u * t;
}

/** Derive the action priority suggested by a GUT score (used to prefill forms). */
export function priorityFromGut(score: number | null): ActionPlanPriority | null {
  if (score == null) return null;
  const band = gutRelevance(score);
  if (band === "extrema" || band === "alta") return "high";
  if (band === "media") return "medium";
  return "low";
}

/** Tailwind text color for a GUT score, by relevance band. */
export function gutScoreColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  const band = gutRelevance(score);
  if (band === "extrema") return "text-red-600 dark:text-red-400";
  if (band === "alta") return "text-amber-600 dark:text-amber-400";
  if (band === "media") return "text-blue-600 dark:text-blue-400";
  return "text-emerald-600 dark:text-emerald-400";
}

// ─── Workflow timeline (derived from status + effectiveness state) ───────────

export const ACTION_PLAN_STAGES = [
  "Identificação",
  "Planejamento",
  "Execução",
  "Evidência",
  "Eficácia",
  "Encerramento",
] as const;

/**
 * Anchor element ids for each stage (index-aligned with `ACTION_PLAN_STAGES`) so
 * the timeline stepper can scroll to the matching section on the detail page.
 * Execução has no dedicated section → points to the activity history (andamento);
 * Encerramento points to the top header (closure status / Reabrir).
 */
export const ACTION_PLAN_STAGE_ANCHORS = [
  "etapa-identificacao",
  "etapa-planejamento",
  "etapa-execucao",
  "etapa-evidencia",
  "etapa-eficacia",
  "etapa-encerramento",
] as const;

/** Highest reached stage (1–6) for the timeline, derived from the plan state so
 * we never store a stage column that could drift. */
export function actionPlanStageLevel(plan: ActionPlan): number {
  const hasPlan =
    (plan.plan5w2h != null && Object.values(plan.plan5w2h).some((v) => typeof v === "string" && v.trim() !== "")) ||
    (plan.rootCause != null && plan.rootCause.trim() !== "") ||
    (plan.responsibleUserId != null && plan.dueDate != null);
  const hasEvidence = (plan.evidences?.length ?? 0) > 0;
  const evaluated = plan.effectivenessResult === "effective" || plan.effectivenessResult === "ineffective";
  const completed = plan.status === "completed";

  let level = 1; // Identificação
  if (hasPlan) level = 2; // Planejamento
  if (plan.status === "in_progress" || completed) level = Math.max(level, 3); // Execução
  if (hasEvidence || completed) level = Math.max(level, 4); // Evidência
  if (evaluated) level = Math.max(level, 5); // Eficácia
  if (completed && evaluated) level = 6; // Encerramento
  return level;
}

/**
 * "Encerrado" = the plan reached the final Encerramento stage and is locked for
 * any change. Closes by full completion (status `completed` AND an effectiveness
 * verdict) or by cancellation. Mere `completed` is NOT locked — the effectiveness
 * (Eficácia) is verified between concluding and closing. Only an admin (SGI) may
 * reopen it. Mirror of `isActionPlanEncerrado` in `@workspace/db` — keep in sync.
 */
export function isActionPlanEncerrado(
  plan: Pick<ActionPlan, "status" | "effectivenessResult">,
): boolean {
  if (plan.status === "cancelled") return true;
  return (
    plan.status === "completed" &&
    (plan.effectivenessResult === "effective" || plan.effectivenessResult === "ineffective")
  );
}

// ─── Date helpers (calendar dates, TZ-safe) ────────────────────────────────
// dueDate and correctiveActionCompletedAt are calendar dates, not instants.
// We anchor them at noon UTC so the YYYY-MM-DD survives round-trip in any
// timezone from UTC-11 to UTC+12 (covers all common business timezones).

/** YYYY-MM-DD (from <input type="date">) → ISO at noon UTC for storage. */
export function calendarDateToStorageIso(localDate: string): string {
  return `${localDate}T12:00:00.000Z`;
}

/** ISO timestamp → YYYY-MM-DD for <input type="date"> values. */
export function storageIsoToCalendarDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** YYYY-MM-DD of today in the user's local timezone. */
export function todayCalendarDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO timestamp of a calendar date → display string "dd/mm/yyyy" using the
 * stored YYYY-MM-DD prefix directly (no Date parse, no TZ shift). */
export function formatCalendarDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// ─── Queries ───────────────────────────────────────────────────────────────

export function useActionPlans(orgId: number, params?: ListActionPlansParams) {
  return useListActionPlans(orgId, params);
}

export function useActionPlansForKpiCell(orgId: number, monthlyValueId: number | null) {
  const params: ListActionPlansParams | undefined = monthlyValueId !== null
    ? { sourceModule: "kpi", sourceKpiMonthlyValueId: monthlyValueId }
    : undefined;
  return useListActionPlans(orgId, params, {
    query: {
      queryKey: getListActionPlansQueryKey(orgId, params),
      enabled: monthlyValueId !== null,
    },
  });
}

/** Maps a source module to the sourceRef field that identifies its origin entity. */
const SOURCE_REF_ID_FIELD: Partial<Record<ActionPlanSourceModule, keyof ActionPlanSourceRef>> = {
  kpi: "kpiMonthlyValueId",
  swot: "swotFactorId",
  nonconformity: "nonconformityId",
  audit_finding: "auditFindingId",
  risk: "riskOpportunityItemId",
  training: "trainingId",
  environmental: "laiaAssessmentId",
  road_safety: "roadSafetyFactorId",
  rac: "criticalReviewId",
};

/**
 * Lists the action plans spawned from ONE origin entity (e.g. a single SWOT
 * factor, one nonconformity). Fetches the module's plans, then filters by the
 * entity id carried in sourceRef. Disabled (returns []) when refId is null —
 * so it's safe to mount before the entity is selected.
 */
export function useActionsForSource(
  orgId: number,
  sourceModule: ActionPlanSourceModule,
  refId: number | null | undefined,
) {
  const field = SOURCE_REF_ID_FIELD[sourceModule];
  const enabled = refId != null && field != null;
  const params: ListActionPlansParams | undefined = enabled ? { sourceModule } : undefined;
  const query = useListActionPlans(orgId, params, {
    query: {
      queryKey: getListActionPlansQueryKey(orgId, params),
      enabled,
    },
  });
  const data = useMemo(
    () => (enabled && field ? (query.data ?? []).filter((p) => p.sourceRef?.[field] === refId) : []),
    [query.data, enabled, field, refId],
  );
  return { ...query, data };
}

export function useActionPlan(orgId: number, planId: number | null) {
  return useGetActionPlan(orgId, planId ?? 0, {
    query: {
      queryKey: getGetActionPlanQueryKey(orgId, planId ?? 0),
      enabled: planId !== null,
    },
  });
}

// ─── Mutations w/ invalidation ─────────────────────────────────────────────

function invalidateAllPlanListings(queryClient: ReturnType<typeof useQueryClient>, orgId: number, year: number | null) {
  queryClient.invalidateQueries({ queryKey: getListActionPlansQueryKey(orgId) });
  queryClient.invalidateQueries({ queryKey: getGetActionPlansSummaryQueryKey(orgId) });
  if (year !== null) {
    queryClient.invalidateQueries({ queryKey: getListKpiYearDataQueryKey(orgId, year) });
  }
}

export function useCreateActionPlanWithInvalidation(orgId: number, year: number | null = null) {
  const queryClient = useQueryClient();
  return useCreateActionPlan({
    mutation: {
      onSuccess: () => invalidateAllPlanListings(queryClient, orgId, year),
    },
  });
}

export function useUpdateActionPlanWithInvalidation(orgId: number, year: number | null = null) {
  const queryClient = useQueryClient();
  return useUpdateActionPlan({
    mutation: {
      onSuccess: (_data, variables) => {
        invalidateAllPlanListings(queryClient, orgId, year);
        queryClient.invalidateQueries({ queryKey: getGetActionPlanQueryKey(orgId, variables.planId) });
        queryClient.invalidateQueries({ queryKey: getListActionPlanActivityQueryKey(orgId, variables.planId) });
      },
    },
  });
}

export function useDeleteActionPlanWithInvalidation(orgId: number, year: number | null = null) {
  const queryClient = useQueryClient();
  return useDeleteActionPlan({
    mutation: {
      onSuccess: () => invalidateAllPlanListings(queryClient, orgId, year),
    },
  });
}

export function useAddActionPlanEvidenceWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useAddActionPlanEvidence({
    mutation: {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: getGetActionPlanQueryKey(orgId, variables.planId) });
        queryClient.invalidateQueries({ queryKey: getListActionPlanActivityQueryKey(orgId, variables.planId) });
      },
    },
  });
}

export function useDeleteActionPlanEvidenceWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useDeleteActionPlanEvidence({
    mutation: {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: getGetActionPlanQueryKey(orgId, variables.planId) });
        queryClient.invalidateQueries({ queryKey: getListActionPlanActivityQueryKey(orgId, variables.planId) });
      },
    },
  });
}

// ─── Summary / comments / activity ───────────────────────────────────────────

export function useActionPlansSummary(orgId: number) {
  return useGetActionPlansSummary(orgId, {
    query: { queryKey: getGetActionPlansSummaryQueryKey(orgId), staleTime: 30_000 },
  });
}

/** Read-only treatment actions owned by other modules (governance corrective
 * actions), surfaced in the hub for a unified view. */
export function useExternalActions(orgId: number) {
  return useListExternalActions(orgId, {
    query: { queryKey: getListExternalActionsQueryKey(orgId), staleTime: 30_000 },
  });
}

export function useActionPlanComments(orgId: number, planId: number | null) {
  return useListActionPlanComments(orgId, planId ?? 0, {
    query: {
      queryKey: getListActionPlanCommentsQueryKey(orgId, planId ?? 0),
      enabled: planId !== null,
    },
  });
}

export function useAddActionPlanCommentWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useAddActionPlanComment({
    mutation: {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: getListActionPlanCommentsQueryKey(orgId, variables.planId) });
      },
    },
  });
}

export function useActionPlanActivity(orgId: number, planId: number | null) {
  return useListActionPlanActivity(orgId, planId ?? 0, {
    query: {
      queryKey: getListActionPlanActivityQueryKey(orgId, planId ?? 0),
      enabled: planId !== null,
    },
  });
}

export function useKpiMonthJustifications(
  orgId: number,
  indicatorId: number | null,
  year: number,
  month: number | null,
) {
  const enabled = indicatorId !== null && month !== null;
  return useListKpiMonthJustifications(
    orgId,
    indicatorId ?? 0,
    year,
    month ?? 0,
    {
      query: {
        queryKey: getListKpiMonthJustificationsQueryKey(orgId, indicatorId ?? 0, year, month ?? 0),
        enabled,
      },
    },
  );
}

export function useAddKpiMonthJustificationWithInvalidation(orgId: number, year: number) {
  const queryClient = useQueryClient();
  return useAddKpiMonthJustification({
    mutation: {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: getListKpiYearDataQueryKey(orgId, year) });
        queryClient.invalidateQueries({
          queryKey: getListKpiMonthJustificationsQueryKey(orgId, variables.indicatorId, variables.year, variables.month),
        });
      },
    },
  });
}
