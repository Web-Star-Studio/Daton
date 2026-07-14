import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListRoadSafetyDiagnosesQueryKey,
  getListRoadSafetyFactorsQueryKey,
  getListRoadSafetyMeasurementsQueryKey,
  useCreateRoadSafetyDiagnosis,
  useCreateRoadSafetyFactor,
  useCreateRoadSafetyMeasurement,
  useDeleteRoadSafetyFactor,
  useListRoadSafetyDiagnoses,
  useListRoadSafetyFactors,
  useListRoadSafetyMeasurements,
  useUpdateRoadSafetyFactor,
  type CreateRoadSafetyDiagnosisBody,
  type CreateRoadSafetyFactorBody,
  type CreateRoadSafetyMeasurementBody,
  type KpiYearRow,
  type RoadSafetyFactor,
  type RoadSafetyFactorDiagnosis,
  type RoadSafetyMeasurement,
  type UpdateRoadSafetyFactorBody,
} from "@workspace/api-client-react";
import { useKpiYearData } from "@/lib/kpi-client";

export type {
  CreateRoadSafetyDiagnosisBody,
  CreateRoadSafetyFactorBody,
  CreateRoadSafetyMeasurementBody,
  RoadSafetyFactor,
  RoadSafetyFactorDiagnosis,
  RoadSafetyMeasurement,
  UpdateRoadSafetyFactorBody,
};

// ─── Domain enums + labels (ISO 39001 · 6.3) ─────────────────────────────────

export type FactorType = "exposure" | "intermediate" | "final";
export const FACTOR_TYPES: FactorType[] = ["exposure", "intermediate", "final"];
export const FACTOR_TYPE_LABELS: Record<FactorType, string> = {
  exposure: "Exposição ao Risco",
  intermediate: "Intermediário",
  final: "Final",
};
export const FACTOR_TYPE_SHORT: Record<FactorType, string> = {
  exposure: "Exposição",
  intermediate: "Intermediário",
  final: "Final",
};

export type FactorOrigin =
  | "human"
  | "vehicle"
  | "road"
  | "human_vehicle"
  | "road_human"
  | "emergency_response";
export const FACTOR_ORIGINS: FactorOrigin[] = [
  "human",
  "vehicle",
  "road",
  "human_vehicle",
  "road_human",
  "emergency_response",
];
export const ORIGIN_LABELS: Record<FactorOrigin, string> = {
  human: "Humano",
  vehicle: "Veículo",
  road: "Via",
  human_vehicle: "Humano + Veículo",
  road_human: "Via + Humano",
  emergency_response: "Resposta a Emergências",
};

export type MonitoringForm =
  | "indicator"
  | "report"
  | "internal_audit"
  | "other";
export const MONITORING_FORMS: MonitoringForm[] = [
  "indicator",
  "report",
  "internal_audit",
  "other",
];
export const MONITORING_FORM_LABELS: Record<MonitoringForm, string> = {
  indicator: "Indicador de Desempenho",
  report: "Relatório",
  internal_audit: "Auditoria Interna",
  other: "Outros",
};

export type Periodicity = "monthly" | "quarterly" | "semiannual" | "annual";
export const PERIODICITIES: Periodicity[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
];
export const PERIODICITY_LABELS: Record<Periodicity, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export type ControlStatus =
  | "scheduled"
  | "regularized"
  | "non_conforming"
  | "overdue"
  | "in_progress";
export const CONTROL_STATUSES: ControlStatus[] = [
  "scheduled",
  "regularized",
  "non_conforming",
  "overdue",
  "in_progress",
];
export const CONTROL_STATUS_LABELS: Record<ControlStatus, string> = {
  scheduled: "Programar",
  regularized: "Regularizado",
  non_conforming: "Não-Conforme",
  overdue: "Vencido",
  in_progress: "Em andamento",
};

/** ISO 39001 §6.3 normative items a factor can be linked to. */
export const NORM_ITEMS: { code: string; label: string }[] = [
  { code: "6.3a", label: "Fatores de exposição ao risco" },
  { code: "6.3b", label: "Resultados finais de segurança" },
  { code: "6.3c.1", label: "Projeto e velocidade segura da via" },
  { code: "6.3c.2", label: "Uso de vias apropriadas" },
  { code: "6.3c.3", label: "Uso de equipamentos de segurança pessoal" },
  { code: "6.3c.4", label: "Velocidade de condução segura" },
  { code: "6.3c.5", label: "Estado de saúde dos condutores" },
  { code: "6.3c.6", label: "Planejamento seguro do percurso" },
  { code: "6.3c.7", label: "Segurança dos veículos" },
  { code: "6.3c.8", label: "Autorização para conduzir" },
  { code: "6.3c.9", label: "Remoção de veículos em más condições" },
  { code: "6.3c.10", label: "Resposta pós-acidente e primeiros socorros" },
];

// ─── GUT analysis ────────────────────────────────────────────────────────────

export type GutRelevance = "extrema" | "alta" | "media" | "baixa";

/** Maps a GUT score (gravity × urgency × tendency) to a relevance band. */
export function gutRelevance(score: number): GutRelevance {
  if (score >= 100) return "extrema";
  if (score >= 50) return "alta";
  if (score >= 20) return "media";
  return "baixa";
}

export const GUT_RELEVANCE_LABELS: Record<GutRelevance, string> = {
  extrema: "EXTREMA",
  alta: "ALTA",
  media: "MÉDIA",
  baixa: "BAIXA",
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useRoadSafetyFactors(orgId: number) {
  return useListRoadSafetyFactors(orgId);
}

export function useRoadSafetyMeasurements(
  orgId: number,
  factorId: number,
  enabled = true,
) {
  return useListRoadSafetyMeasurements(orgId, factorId, {
    query: {
      queryKey: getListRoadSafetyMeasurementsQueryKey(orgId, factorId),
      enabled: enabled && factorId > 0,
    },
  });
}

export function useCreateFactorWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useCreateRoadSafetyFactor({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getListRoadSafetyFactorsQueryKey(orgId),
        }),
    },
  });
}

export function useUpdateFactorWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useUpdateRoadSafetyFactor({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getListRoadSafetyFactorsQueryKey(orgId),
        }),
    },
  });
}

export function useDeleteFactorWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useDeleteRoadSafetyFactor({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getListRoadSafetyFactorsQueryKey(orgId),
        }),
    },
  });
}

export function useCreateMeasurementWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useCreateRoadSafetyMeasurement({
    mutation: {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({
          queryKey: getListRoadSafetyFactorsQueryKey(orgId),
        });
        queryClient.invalidateQueries({
          queryKey: getListRoadSafetyMeasurementsQueryKey(
            orgId,
            variables.factorId,
          ),
        });
      },
    },
  });
}

// ─── Vínculo com indicador (KPI) ─────────────────────────────────────────────

export type LinkedIndicatorInfo = {
  id: number;
  name: string;
  unit: string | null;
  measureUnit: string | null;
  direction: "up" | "down";
  latestValue: number | null;
  latestMonth: number | null;
  goal: number | null;
};

/** Mapa indicatorId → info, com o último mês preenchido como "valor atual". */
export function buildLinkedIndicatorMap(
  rows: KpiYearRow[],
): Map<number, LinkedIndicatorInfo> {
  const map = new Map<number, LinkedIndicatorInfo>();
  for (const r of rows) {
    let latestValue: number | null = null;
    let latestMonth: number | null = null;
    for (const m of [...r.monthlyValues].sort((a, b) => a.month - b.month)) {
      if (m.value != null) {
        latestValue = m.value;
        latestMonth = m.month;
      }
    }
    map.set(r.indicator.id, {
      id: r.indicator.id,
      name: r.indicator.name,
      unit: r.indicator.unit ?? null,
      measureUnit: r.indicator.measureUnit ?? null,
      direction: r.indicator.direction,
      latestValue,
      latestMonth,
      goal: r.yearConfig.goal ?? null,
    });
  }
  return map;
}

/** Resolve, no frontend, o valor/meta atuais de cada indicador vinculável. */
export function useLinkedIndicators(
  orgId: number,
  year: number,
): Map<number, LinkedIndicatorInfo> {
  const { data: rows = [] } = useKpiYearData(orgId, year);
  return useMemo(() => buildLinkedIndicatorMap(rows), [rows]);
}

type LinkableFactor = Pick<
  RoadSafetyFactor,
  "kpiIndicatorId" | "latestValue" | "goal" | "measureUnit"
>;

export function isLinkedToIndicator(
  f: Pick<RoadSafetyFactor, "kpiIndicatorId">,
): boolean {
  return f.kpiIndicatorId != null;
}

/** Valor atual efetivo: do indicador vinculado, senão do próprio fator. */
export function factorCurrentValue(
  f: LinkableFactor,
  info?: LinkedIndicatorInfo | null,
): number | null {
  if (f.kpiIndicatorId != null && info) return info.latestValue;
  return f.latestValue ?? null;
}

/** Meta efetiva: do indicador vinculado, senão do próprio fator. */
export function factorGoalValue(
  f: LinkableFactor,
  info?: LinkedIndicatorInfo | null,
): number | null {
  if (f.kpiIndicatorId != null && info) return info.goal;
  return f.goal ?? null;
}

/** Unidade efetiva: do indicador vinculado, senão do próprio fator. */
export function factorMeasureUnit(
  f: LinkableFactor,
  info?: LinkedIndicatorInfo | null,
): string | null {
  if (f.kpiIndicatorId != null && info) return info.measureUnit;
  return f.measureUnit ?? null;
}

// ─── Diagnóstico do fator ────────────────────────────────────────────────────

export type DiagnosisPeriodicity = Periodicity;
export const DIAGNOSIS_PERIODICITIES: DiagnosisPeriodicity[] = [
  ...PERIODICITIES,
];

export const DIAGNOSIS_PERIODICITY_LABELS: Record<
  DiagnosisPeriodicity,
  string
> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export type DiagnosisStatus = "none" | "ok" | "due_soon" | "overdue";

/** Hoje em "YYYY-MM-DD" local — padrão da data de referência no diálogo. */
export function todayDateOnly(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** "31/01/2027" a partir de "2027-01-31". */
export function formatDateOnly(value: string): string {
  const d = parseDateOnly(value);
  if (!d) return value;
  return d.toLocaleDateString("pt-BR");
}

/** Texto do badge de vencimento do diagnóstico no painel e na ficha. */
export function diagnosisBadgeLabel(
  status: DiagnosisStatus,
  nextDate: string | null,
  now: Date = new Date(),
): string {
  if (status === "none" || !nextDate) return "—";
  if (status === "overdue") return "Vencido";
  if (status === "ok") return `Próximo em ${formatDateOnly(nextDate)}`;
  const next = parseDateOnly(nextDate);
  if (!next) return "A vencer";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return "Vence hoje";
  return days === 1 ? "Vence em 1 dia" : `Vence em ${days} dias`;
}

// ─── Hooks do diagnóstico ────────────────────────────────────────────────────

export function useRoadSafetyDiagnoses(
  orgId: number,
  factorId: number,
  enabled = true,
) {
  return useListRoadSafetyDiagnoses(orgId, factorId, {
    query: {
      queryKey: getListRoadSafetyDiagnosesQueryKey(orgId, factorId),
      enabled: enabled && factorId > 0,
    },
  });
}

export function useCreateDiagnosisWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useCreateRoadSafetyDiagnosis({
    mutation: {
      onSuccess: (_data, variables) => {
        // O painel mostra status de vencimento derivado do histórico: os dois
        // caches precisam cair juntos, senão o badge fica mentindo até o reload.
        queryClient.invalidateQueries({
          queryKey: getListRoadSafetyFactorsQueryKey(orgId),
        });
        queryClient.invalidateQueries({
          queryKey: getListRoadSafetyDiagnosesQueryKey(
            orgId,
            variables.factorId,
          ),
        });
      },
    },
  });
}
