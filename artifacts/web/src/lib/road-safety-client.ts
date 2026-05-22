import { useQueryClient } from "@tanstack/react-query";
import {
  getListRoadSafetyFactorsQueryKey,
  getListRoadSafetyMeasurementsQueryKey,
  useCreateRoadSafetyFactor,
  useCreateRoadSafetyMeasurement,
  useDeleteRoadSafetyFactor,
  useListRoadSafetyFactors,
  useListRoadSafetyMeasurements,
  useUpdateRoadSafetyFactor,
  type CreateRoadSafetyFactorBody,
  type CreateRoadSafetyMeasurementBody,
  type RoadSafetyFactor,
  type RoadSafetyMeasurement,
  type UpdateRoadSafetyFactorBody,
} from "@workspace/api-client-react";

export type {
  CreateRoadSafetyFactorBody,
  CreateRoadSafetyMeasurementBody,
  RoadSafetyFactor,
  RoadSafetyMeasurement,
  UpdateRoadSafetyFactorBody,
};

/**
 * "Diagnóstico atual" (FPLAN 005 · §6.3) — campo já gravado/retornado pela API,
 * ainda fora do contrato gerado. Use até a próxima rodada de codegen.
 */
export type WithCurrentDiagnosis = { currentDiagnosis?: string | null };

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

export type MonitoringForm = "indicator" | "report" | "internal_audit" | "other";
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
          queryKey: getListRoadSafetyMeasurementsQueryKey(orgId, variables.factorId),
        });
      },
    },
  });
}
