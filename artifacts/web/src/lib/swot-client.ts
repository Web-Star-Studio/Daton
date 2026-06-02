import { useQueryClient } from "@tanstack/react-query";
import {
  getListSwotFactorsQueryKey,
  getListSwotObjectivesQueryKey,
  useCreateSwotFactor,
  useCreateSwotObjective,
  useDeleteSwotFactor,
  useDeleteSwotObjective,
  useListSwotFactors,
  useListSwotObjectives,
  useUpdateSwotFactor,
  useUpdateSwotObjective,
  type CreateSwotFactorBody,
  type CreateSwotObjectiveBody,
  type SwotEnvironment,
  type SwotFactor,
  type SwotFactorType,
  type SwotObjective,
  type UpdateSwotFactorBody,
  type UpdateSwotObjectiveBody,
} from "@workspace/api-client-react";

export type {
  CreateSwotFactorBody,
  CreateSwotObjectiveBody,
  SwotEnvironment,
  SwotFactor,
  SwotFactorType,
  SwotObjective,
  UpdateSwotFactorBody,
  UpdateSwotObjectiveBody,
};

// ─── Domain labels ───────────────────────────────────────────────────────────

export const SWOT_TYPES: SwotFactorType[] = ["strength", "weakness", "opportunity", "threat"];

export const SWOT_TYPE_LABELS: Record<SwotFactorType, string> = {
  strength: "Força",
  weakness: "Fraqueza",
  opportunity: "Oportunidade",
  threat: "Ameaça",
};

export const SWOT_TYPE_PLURAL: Record<SwotFactorType, string> = {
  strength: "Forças",
  weakness: "Fraquezas",
  opportunity: "Oportunidades",
  threat: "Ameaças",
};

export const SWOT_ENVIRONMENT_LABELS: Record<SwotEnvironment, string> = {
  internal: "Interno",
  external: "Externo",
};

/**
 * Fonte do objetivo vinculado a um fator (polimórfico, extensível).
 * Novas fontes geradoras de objetivos podem ser adicionadas aqui.
 */
export type SwotObjectiveSource = "swot" | "kpi";
export const SWOT_OBJECTIVE_SOURCE_LABELS: Record<SwotObjectiveSource, string> = {
  swot: "SWOT",
  kpi: "KPI",
};

/** Combina fonte + id num valor único para o seletor (ex.: "kpi:5"). */
export function encodeObjectiveRef(source: string, id: number): string {
  return `${source}:${id}`;
}
export function parseObjectiveRef(ref: string): { source: SwotObjectiveSource; id: number } | null {
  if (!ref) return null;
  const idx = ref.indexOf(":");
  if (idx < 0) return null;
  const source = ref.slice(0, idx);
  const idRaw = ref.slice(idx + 1);
  const id = Number(idRaw);
  if (!source || idRaw === "" || !Number.isInteger(id) || id <= 0) return null;
  return { source: source as SwotObjectiveSource, id };
}

/** Perspectivas padrão do SGI (cliente pode reutilizar as já cadastradas). */
export const SWOT_PERSPECTIVES = [
  "Qualidade",
  "SGI",
  "Ambiental",
  "Segurança Viária",
  "ESG",
  "Saúde e Segurança",
];

/** Ambiente padrão sugerido por tipo (Forças/Fraquezas = interno; Oportunidades/Ameaças = externo). */
export function defaultEnvironmentFor(type: SwotFactorType): SwotEnvironment {
  return type === "strength" || type === "weakness" ? "internal" : "external";
}

// ─── Pontuação e decisão (metodologia FPLAN 001) ─────────────────────────────

export type SwotDecision = "positivo" | "requer" | "irrelevante";

/** Resultado = Performance × Relevância (escala 1–4 cada → 1–16). */
export function swotResult(performance: number, relevance: number): number {
  return performance * relevance;
}

/**
 * Decisão quanto ao tratamento, conforme a aba "A0) METODOLOGIA" da planilha:
 * - Força → sempre "já positivo" (facultativo).
 * - Fraqueza/Ameaça/Oportunidade → resultado ≥ 8 requer ações; ≤ 7 irrelevante.
 */
export function swotDecision(type: SwotFactorType, result: number): SwotDecision {
  if (type === "strength") return "positivo";
  return result >= 8 ? "requer" : "irrelevante";
}

export const SWOT_DECISION_LABELS: Record<SwotDecision, string> = {
  positivo: "Fatores já positivos: facultativo o estabelecimento de ações",
  requer: "Relevante: requer ações",
  irrelevante: "Irrelevante: facultativo o estabelecimento de ações",
};

export const SWOT_DECISION_SHORT: Record<SwotDecision, string> = {
  positivo: "Já positivo",
  requer: "Requer ações",
  irrelevante: "Irrelevante",
};

/** Faixa de risco pela pontuação: ≤7 baixo · 8–12 alto · 13–16 extremo. */
export type SwotRiskBand = "baixo" | "alto" | "extremo";
export function swotRiskBand(result: number): SwotRiskBand {
  if (result >= 13) return "extremo";
  if (result >= 8) return "alto";
  return "baixo";
}

// ─── Cores (Tailwind) ────────────────────────────────────────────────────────

export function swotTypeBadgeColor(type: SwotFactorType): string {
  switch (type) {
    case "strength":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "weakness":
      return "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300";
    case "opportunity":
      return "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300";
    case "threat":
      return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  }
}

/** Cor de texto por tipo (para números/títulos). */
export function swotTypeText(type: SwotFactorType): string {
  switch (type) {
    case "strength":
      return "text-emerald-600 dark:text-emerald-400";
    case "weakness":
      return "text-rose-600 dark:text-rose-400";
    case "opportunity":
      return "text-blue-600 dark:text-blue-400";
    case "threat":
      return "text-amber-600 dark:text-amber-400";
  }
}

/** Fundo/borda suave por tipo (para os quadrantes da matriz). */
export function swotTypeTint(type: SwotFactorType): string {
  switch (type) {
    case "strength":
      return "border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/[0.06]";
    case "weakness":
      return "border-rose-200/70 bg-rose-50/50 dark:border-rose-500/20 dark:bg-rose-500/[0.06]";
    case "opportunity":
      return "border-blue-200/70 bg-blue-50/50 dark:border-blue-500/20 dark:bg-blue-500/[0.06]";
    case "threat":
      return "border-amber-200/70 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/[0.06]";
  }
}

export function swotDecisionBadgeColor(decision: SwotDecision): string {
  if (decision === "requer")
    return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  if (decision === "positivo")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300";
}

/** Cor do número do resultado por faixa de risco. */
export function swotResultColor(result: number): string {
  const band = swotRiskBand(result);
  if (band === "extremo") return "text-red-600 dark:text-red-400";
  if (band === "alto") return "text-amber-600 dark:text-amber-400";
  return "text-slate-500 dark:text-slate-400";
}

// ─── Legendas das escalas (imagem da metodologia) ────────────────────────────

export type SwotScaleLegend = { value: number; label: string };

/**
 * Significado da nota de Performance/Consequência (1–4) por tipo de fator.
 * Forças/Fraquezas = "Performance"; Oportunidades/Ameaças = "Consequência".
 */
export function performanceScaleLegend(type: SwotFactorType): SwotScaleLegend[] {
  switch (type) {
    case "strength":
      return [
        { value: 1, label: "Frágil" },
        { value: 2, label: "Razoável" },
        { value: 3, label: "Alta" },
        { value: 4, label: "Excelente" },
      ];
    case "weakness":
      return [
        { value: 1, label: "Excelente" },
        { value: 2, label: "Alta" },
        { value: 3, label: "Razoável" },
        { value: 4, label: "Frágil" },
      ];
    case "opportunity":
      return [
        { value: 1, label: "Pequenos ganhos" },
        { value: 2, label: "Médios ganhos" },
        { value: 3, label: "Muitos ganhos" },
        { value: 4, label: "Excelentes ganhos" },
      ];
    case "threat":
      return [
        { value: 1, label: "Pequenos problemas" },
        { value: 2, label: "Problemas" },
        { value: 3, label: "Muitos problemas" },
        { value: 4, label: "Problemas graves" },
      ];
  }
}

export function performanceAxisLabel(type: SwotFactorType): string {
  return type === "opportunity" || type === "threat" ? "Consequência" : "Performance";
}

/** Relevância/importância (1–4) — escala genérica para todos os tipos. */
export const RELEVANCE_SCALE_LEGEND: SwotScaleLegend[] = [
  { value: 1, label: "Baixa" },
  { value: 2, label: "Média" },
  { value: 3, label: "Alta" },
  { value: 4, label: "Muito alta" },
];

/** Corporativo quando o fator não está atribuído a uma unidade. */
export function isCorporateFactor(unitId: number | null | undefined): boolean {
  return unitId === null || unitId === undefined;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useSwotObjectives(orgId: number) {
  return useListSwotObjectives(orgId, {
    query: { queryKey: getListSwotObjectivesQueryKey(orgId), enabled: !!orgId },
  });
}

export function useSwotFactors(orgId: number) {
  return useListSwotFactors(orgId, {
    query: { queryKey: getListSwotFactorsQueryKey(orgId), enabled: !!orgId },
  });
}

// ─── Mutations com invalidação ───────────────────────────────────────────────

function invalidate(queryClient: ReturnType<typeof useQueryClient>, orgId: number) {
  queryClient.invalidateQueries({ queryKey: getListSwotFactorsQueryKey(orgId) });
  queryClient.invalidateQueries({ queryKey: getListSwotObjectivesQueryKey(orgId) });
}

export function useCreateSwotObjectiveWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useCreateSwotObjective({ mutation: { onSuccess: () => invalidate(queryClient, orgId) } });
}

export function useUpdateSwotObjectiveWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useUpdateSwotObjective({ mutation: { onSuccess: () => invalidate(queryClient, orgId) } });
}

export function useDeleteSwotObjectiveWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useDeleteSwotObjective({ mutation: { onSuccess: () => invalidate(queryClient, orgId) } });
}

export function useCreateSwotFactorWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useCreateSwotFactor({ mutation: { onSuccess: () => invalidate(queryClient, orgId) } });
}

export function useUpdateSwotFactorWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useUpdateSwotFactor({ mutation: { onSuccess: () => invalidate(queryClient, orgId) } });
}

export function useDeleteSwotFactorWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useDeleteSwotFactor({ mutation: { onSuccess: () => invalidate(queryClient, orgId) } });
}
