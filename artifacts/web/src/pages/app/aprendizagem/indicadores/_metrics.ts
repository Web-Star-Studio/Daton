/**
 * Definição dos indicadores da tela "Indicadores LMS".
 *
 * Vive fora do `index.tsx` porque a tela E o export (PDF/Excel) precisam da
 * MESMA lista, na mesma ordem, com os mesmos rótulos e as mesmas regras de
 * semáforo — auditor tem que receber exatamente o que vê na tela.
 *
 * Meta/direção/tolerância NÃO são constantes daqui: vêm de `summary.targets`,
 * que o backend resolve a partir da configuração do módulo KPI da organização
 * (com fallback para o padrão do sistema). Duplicar as metas aqui faria a tela
 * mentir para quem editou a própria meta no módulo Indicadores.
 */
import type {
  LearningSummaryCards,
  LearningSummaryTarget,
} from "@workspace/api-client-react";
import {
  formatKpiNumber,
  getTrafficLight,
  type TrafficLight,
} from "@/lib/kpi-client";

export type LmsMetricKey = LearningSummaryTarget["metric"];

/** Como o valor é apresentado — muda sufixo e se a barra de progresso faz sentido. */
export type LmsMetricFormat = "percent" | "hours" | "count";

export interface LmsMetricDef {
  key: LmsMetricKey;
  label: string;
  /** Cláusula normativa exibida sob o nome do indicador. */
  isoRef: string;
  format: LmsMetricFormat;
  read: (cards: LearningSummaryCards) => number | null;
}

/**
 * Os 4 primeiros compõem o bloco "Cumprimento e cobertura" (2×2), na ordem do
 * mockup aprovado. Os 2 últimos aparecem em contextos próprios na tela
 * (eficácia e pendências), mas entram inteiros no relatório exportado.
 */
export const LMS_PRIMARY_METRICS: LmsMetricDef[] = [
  {
    key: "pat_completion",
    label: "% cumprimento PAT",
    isoRef: "ISO 10015 §4.4",
    format: "percent",
    read: (c) => c.patCompletion,
  },
  {
    key: "hours_per_employee",
    label: "Horas / colaborador",
    isoRef: "ISO 10015 §4.3",
    format: "hours",
    read: (c) => c.hoursPerEmployee,
  },
  {
    key: "mandatory_coverage",
    label: "% cobertura treinamentos obrigatórios",
    isoRef: "ISO 9001 §7.2",
    format: "percent",
    read: (c) => c.mandatoryCoverage,
  },
  {
    key: "critical_gaps",
    label: "Colaboradores com gap",
    isoRef: "ISO 10015 §4.2",
    format: "count",
    read: (c) => c.criticalGaps,
  },
];

export const LMS_SECONDARY_METRICS: LmsMetricDef[] = [
  {
    key: "effectiveness_overall",
    label: "Eficácia geral",
    isoRef: "ISO 10015 §4.1",
    format: "percent",
    read: (c) => c.effectiveness,
  },
  {
    key: "expired_trainings",
    label: "Treinamentos vencidos",
    isoRef: "ISO 9001 §7.2",
    format: "count",
    read: (c) => c.expiredTrainings,
  },
];

export const LMS_ALL_METRICS: LmsMetricDef[] = [
  ...LMS_PRIMARY_METRICS,
  ...LMS_SECONDARY_METRICS,
];

export function findTarget(
  targets: LearningSummaryTarget[] | undefined,
  key: LmsMetricKey,
): LearningSummaryTarget | undefined {
  return (targets ?? []).find((t) => t.metric === key);
}

/** Valor formatado com a unidade do indicador ("74%", "18h", "38"). */
export function formatMetricValue(
  value: number | null | undefined,
  format: LmsMetricFormat,
): string {
  if (value === null || value === undefined) return "—";
  const n = formatKpiNumber(value);
  if (format === "percent") return `${n}%`;
  if (format === "hours") return `${n}h`;
  return n;
}

/**
 * Semáforo do card. Delega ao `getTrafficLight` do módulo KPI para que a
 * mesma meta produza a mesma cor nas duas telas — regra de semáforo divergente
 * entre módulos é bug de auditoria, não detalhe estético.
 */
export function metricStatus(
  value: number | null | undefined,
  target: LearningSummaryTarget | undefined,
): TrafficLight | null {
  if (!target) return null;
  return getTrafficLight(value, target.goal, target.direction, target.tolerance);
}

export const STATUS_LABEL: Record<TrafficLight, string> = {
  green: "OK",
  yellow: "Atenção",
  red: "Crítico",
};

/**
 * Quanto da meta já foi cumprido (0–100), para a barra de progresso.
 * Em indicadores "quanto menor melhor" com meta 0 (gaps, vencidos) não existe
 * proporção honesta — a barra vira "cheia quando há desvio", sinalizando
 * severidade em vez de progresso.
 */
export function metricProgress(
  value: number | null | undefined,
  target: LearningSummaryTarget | undefined,
): number | null {
  if (value === null || value === undefined || !target) return null;
  if (target.direction === "down") {
    if (target.goal <= 0) return value > 0 ? 100 : 0;
    return Math.min(100, (value / target.goal) * 100);
  }
  if (target.goal <= 0) return null;
  return Math.min(100, Math.max(0, (value / target.goal) * 100));
}
