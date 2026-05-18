import { useQueryClient } from "@tanstack/react-query";
import {
  getGetActionPlanQueryKey,
  getListActionPlansQueryKey,
  getListKpiYearDataQueryKey,
  useAddActionPlanEvidence,
  useCreateActionPlan,
  useDeleteActionPlan,
  useDeleteActionPlanEvidence,
  useGetActionPlan,
  useListActionPlans,
  useUpdateActionPlan,
  useUpsertKpiMonthJustification,
  type ActionPlan,
  type ActionPlanEvidence,
  type ActionPlanListItem,
  type ActionPlanPriority,
  type ActionPlanSourceModule,
  type ActionPlanStatus,
  type CreateActionPlanBody,
  type ListActionPlansParams,
  type UpdateActionPlanBody,
} from "@workspace/api-client-react";

export type {
  ActionPlan,
  ActionPlanEvidence,
  ActionPlanListItem,
  ActionPlanPriority,
  ActionPlanSourceModule,
  ActionPlanStatus,
  CreateActionPlanBody,
  ListActionPlansParams,
  UpdateActionPlanBody,
};

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
      },
    },
  });
}

export function useUpsertKpiMonthJustificationWithInvalidation(orgId: number, year: number) {
  const queryClient = useQueryClient();
  return useUpsertKpiMonthJustification({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListKpiYearDataQueryKey(orgId, year) });
      },
    },
  });
}
