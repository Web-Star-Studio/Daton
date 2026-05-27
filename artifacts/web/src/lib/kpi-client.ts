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

/** Indicator categories — drive the "Semáforo por categoria" dashboard widget. */
export type KpiCategory =
  | "Qualidade"
  | "Ambiental"
  | "Seg. Viária"
  | "RH"
  | "Frota"
  | "Financeiro";
export const KPI_CATEGORIES: KpiCategory[] = [
  "Qualidade",
  "Ambiental",
  "Seg. Viária",
  "RH",
  "Frota",
  "Financeiro",
];

/** ISO norm codes an indicator can attend (cláusula 9.1 — monitoramento e medição). */
export type KpiNorm = "9001" | "14001" | "39001";
export const KPI_NORMS: { code: KpiNorm; label: string }[] = [
  { code: "9001", label: "ISO 9001 · cl. 9.1" },
  { code: "14001", label: "ISO 14001 · cl. 9.1" },
  { code: "39001", label: "ISO 39001 · cl. 9.1" },
];

/** Campo `referenceMonth` (1–12) ainda fora do contrato gerado da API. */
export type WithReferenceMonth = { referenceMonth?: number | null };

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
  if (status === "green")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (status === "yellow")
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  if (status === "red")
    return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
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
  if (status === "no_action")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (status === "needs_action")
    return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  return "bg-muted text-muted-foreground";
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

// ─── Number formatting ─────────────────────────────────────────────────────

function pickKpiDecimals(value: number): number {
  if (value === 0) return 0;
  const abs = Math.abs(value);
  if (abs >= 100) return 0;
  if (abs >= 10) return 1;
  if (abs >= 0.01) return 2;
  // Para frações pequenas (ex.: 8/9483 = 0,000843) preserva casas suficientes
  // para mostrar ~2 dígitos significativos — evita arredondar para "0".
  return Math.min(6, 2 - Math.floor(Math.log10(abs)));
}

/** Formata número para tabelas/tooltips: casas decimais adaptativas, sem zeros à direita. */
export function formatKpiNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", {
    maximumFractionDigits: pickKpiDecimals(value),
  });
}

/** Formata número para cards/dashboards: casas decimais adaptativas, com zeros à direita preservados. */
export function formatKpiNumberFixed(
  value: number | null | undefined,
  measureUnit?: string | null,
): string {
  if (value === null || value === undefined) return "—";
  const decimals = pickKpiDecimals(value);
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return measureUnit ? `${formatted} ${measureUnit}` : formatted;
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
