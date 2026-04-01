import { useQueryClient } from "@tanstack/react-query";
import {
  getListKpiObjectivesQueryKey,
  getListKpiIndicatorsQueryKey,
  getListKpiYearDataQueryKey,
  useListKpiObjectives,
  useCreateKpiObjective,
  useUpdateKpiObjective,
  useDeleteKpiObjective,
  useListKpiIndicators,
  useCreateKpiIndicator,
  useUpdateKpiIndicator,
  useDeleteKpiIndicator,
  useListKpiYearData,
  useUpsertKpiYearConfig,
  useUpsertKpiValues,
  type KpiObjective,
  type KpiIndicator,
  type KpiYearConfig,
  type KpiYearRow,
  type KpiMonthlyValue,
  type CreateKpiObjectiveBody,
  type UpdateKpiObjectiveBody,
  type CreateKpiIndicatorBody,
  type UpdateKpiIndicatorBody,
  type UpsertKpiYearConfigBody,
  type UpsertKpiValuesBody,
} from "@workspace/api-client-react";

export type {
  KpiObjective,
  KpiIndicator,
  KpiYearConfig,
  KpiYearRow,
  KpiMonthlyValue,
  CreateKpiObjectiveBody,
  UpdateKpiObjectiveBody,
  CreateKpiIndicatorBody,
  UpdateKpiIndicatorBody,
  UpsertKpiYearConfigBody,
  UpsertKpiValuesBody,
};

export type KpiDirection = "up" | "down";
export type KpiPeriodicity = "monthly" | "quarterly" | "semiannual" | "annual" | "monthly_15d" | "monthly_45d";
export type TrafficLight = "green" | "yellow" | "red";
export type RacStatus = "needs_action" | "no_action" | "no_data";

// ─── Semaphore logic ────────────────────────────────────────────────────────

export function getTrafficLight(
  value: number | null | undefined,
  goal: number | null | undefined,
  direction: KpiDirection,
): TrafficLight | null {
  if (value === null || value === undefined) return null;
  if (goal === null || goal === undefined) return null;
  const tolerance = 0.01;
  if (direction === "up") {
    if (value >= goal) return "green";
    if (value >= goal - tolerance) return "yellow";
    return "red";
  } else {
    if (value <= goal) return "green";
    if (value <= goal + tolerance) return "yellow";
    return "red";
  }
}

export function trafficLightColor(status: TrafficLight | null): string {
  if (status === "green") return "bg-green-100 text-green-800";
  if (status === "yellow") return "bg-yellow-100 text-yellow-800";
  if (status === "red") return "bg-red-100 text-red-800";
  return "";
}

export function trafficLightDotColor(status: TrafficLight | null): string {
  if (status === "green") return "bg-green-500";
  if (status === "yellow") return "bg-yellow-500";
  if (status === "red") return "bg-red-500";
  return "bg-gray-300";
}

export function trafficLightBarColor(status: TrafficLight | null): string {
  if (status === "green") return "#22c55e";
  if (status === "yellow") return "#eab308";
  if (status === "red") return "#ef4444";
  return "#94a3b8";
}

// ─── RAC logic ─────────────────────────────────────────────────────────────

export function getRac(
  monthValues: (number | null)[],
  semesterMonths: number[],
  goal: number | null | undefined,
  direction: KpiDirection,
): RacStatus {
  if (goal === null || goal === undefined) return "no_data";
  const filled = semesterMonths
    .map((m) => monthValues[m - 1])
    .filter((v): v is number => v !== null && v !== undefined);
  if (filled.length === 0) return "no_data";
  const avg = filled.reduce((a, b) => a + b, 0) / filled.length;
  return direction === "up"
    ? avg > goal ? "no_action" : "needs_action"
    : avg < goal ? "no_action" : "needs_action";
}

export function racLabel(status: RacStatus): string {
  if (status === "no_action") return "Não precisa de plano de ação";
  if (status === "needs_action") return "Precisa de plano de ação";
  return "Sem dados";
}

export function racColor(status: RacStatus): string {
  if (status === "no_action") return "bg-green-100 text-green-800";
  if (status === "needs_action") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

// ─── Computed aggregates ───────────────────────────────────────────────────

export function computeMonthlyStats(
  monthValues: (number | null)[],
  goal: number | null | undefined,
  direction: KpiDirection,
) {
  const filled = monthValues.filter((v): v is number => v !== null && v !== undefined);
  const average = filled.length > 0 ? filled.reduce((a, b) => a + b, 0) / filled.length : null;
  const accumulated = filled.length > 0 ? filled.reduce((a, b) => a + b, 0) : null;
  const progress = average !== null && goal !== null && goal !== undefined && goal !== 0
    ? (average / goal) * 100
    : null;
  const overallStatus = getTrafficLight(average, goal, direction);
  const rac1 = getRac(monthValues, [1, 2, 3, 4, 5, 6], goal, direction);
  const rac2 = getRac(monthValues, [7, 8, 9, 10, 11, 12], goal, direction);
  return { average, accumulated, progress, overallStatus, rac1, rac2 };
}

// ─── Periodicity label ─────────────────────────────────────────────────────

export const PERIODICITY_LABELS: Record<KpiPeriodicity, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
  monthly_15d: "Mensal - 15 dias",
  monthly_45d: "Mensal - 45 dias",
};

export const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ─── Objectives hooks ──────────────────────────────────────────────────────

export function useKpiObjectives(orgId: number) {
  return useListKpiObjectives(orgId);
}

export function useCreateKpiObjectiveWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useCreateKpiObjective({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListKpiObjectivesQueryKey(orgId) }),
    },
  });
}

export function useUpdateKpiObjectiveWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useUpdateKpiObjective({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListKpiObjectivesQueryKey(orgId) }),
    },
  });
}

export function useDeleteKpiObjectiveWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useDeleteKpiObjective({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListKpiObjectivesQueryKey(orgId) }),
    },
  });
}

// ─── Indicators hooks ──────────────────────────────────────────────────────

export function useKpiIndicators(orgId: number, unit?: string) {
  return useListKpiIndicators(orgId, unit ? { unit } : {});
}

export function useCreateKpiIndicatorWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useCreateKpiIndicator({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListKpiIndicatorsQueryKey(orgId) }),
    },
  });
}

export function useUpdateKpiIndicatorWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useUpdateKpiIndicator({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListKpiIndicatorsQueryKey(orgId) }),
    },
  });
}

export function useDeleteKpiIndicatorWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useDeleteKpiIndicator({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListKpiIndicatorsQueryKey(orgId) }),
    },
  });
}

// ─── Year data hooks ───────────────────────────────────────────────────────

export function useKpiYearData(orgId: number, year: number, unit?: string) {
  return useListKpiYearData(orgId, year, unit ? { unit } : {});
}

export function useUpsertKpiYearConfigWithInvalidation(orgId: number, year: number) {
  const queryClient = useQueryClient();
  return useUpsertKpiYearConfig({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListKpiYearDataQueryKey(orgId, year) }),
    },
  });
}

export function useUpsertKpiValuesWithInvalidation(orgId: number, year: number) {
  const queryClient = useQueryClient();
  return useUpsertKpiValues({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListKpiYearDataQueryKey(orgId, year) }),
    },
  });
}
