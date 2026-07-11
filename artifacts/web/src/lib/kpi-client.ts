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

/**
 * @deprecated `referenceMonth` agora faz parte do contrato gerado (`KpiIndicator`).
 * Mantido por compatibilidade enquanto callers antigos são migrados.
 */
export type WithReferenceMonth = { referenceMonth?: number | null };

/** Periodicidades não mensais — precisam de um mês de referência definido. */
export const NON_MONTHLY_PERIODICITIES = new Set<string>([
  "quarterly",
  "semiannual",
  "annual",
]);

/**
 * Meses (1–12) em que um indicador não-mensal deve ser lançado, conforme a
 * periodicidade e o mês de referência. Vazio para mensal ou quando não há
 * referência válida definida.
 */
export function expectedMonths(
  periodicity: string,
  ref: number | null | undefined,
): Set<number> {
  if (!ref || ref < 1 || ref > 12) return new Set();
  const at = (offset: number) => ((ref - 1 + offset) % 12) + 1;
  if (periodicity === "annual") return new Set([at(0)]);
  if (periodicity === "semiannual") return new Set([at(0), at(6)]);
  if (periodicity === "quarterly") return new Set([at(0), at(3), at(6), at(9)]);
  return new Set();
}

/**
 * Conjunto de meses que CONTAM para um indicador (cálculos, preenchimento) —
 * ou `null` quando não há restrição (mensal, ou não-mensal sem referência),
 * significando "todos os 12 meses contam". Para não-mensal com referência,
 * retorna o subconjunto esperado. Contrato de uso:
 *   const r = restrictedMonths(p, ref); const counts = (m) => !r || r.has(m);
 */
export function restrictedMonths(
  periodicity: string,
  ref: number | null | undefined,
): Set<number> | null {
  const e = expectedMonths(periodicity, ref);
  return e.size > 0 ? e : null;
}

// ─── Semaphore logic ────────────────────────────────────────────────────────

export function getTrafficLight(
  value: number | null | undefined,
  goal: number | null | undefined,
  direction: KpiDirection,
  tolerance?: number | null,
): TrafficLight | null {
  if (value === null || value === undefined) return null;
  if (goal === null || goal === undefined) return null;
  const tol = tolerance ?? 0.01;
  if (direction === "up") {
    if (value >= goal) return "green";
    if (value >= goal - tol) return "yellow";
    return "red";
  } else {
    if (value <= goal) return "green";
    if (value <= goal + tol) return "yellow";
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

export type KpiTreatmentKind = "resolved" | "in_treatment" | "untreated";
export type KpiTreatment = { kind: KpiTreatmentKind; label: string | null };

/**
 * Estado de tratamento de um desvio (mês vermelho), pela regra ISO 9.1.3 · 10.1
 * onde **justificativa OU plano de ação** trata o desvio — porém distinguindo um
 * plano ainda **em aberto** (em andamento) de um desvio **resolvido**:
 *
 * - `resolved`  → há justificativa OU plano **concluído** (verde). `label` diz o quê.
 * - `in_treatment` → só há plano(s) **aberto/em andamento** (azul), sem justificativa
 *   nem plano concluído. Desvio sendo tratado, ainda não encerrado.
 * - `untreated` → nada trata o desvio (vermelho). Plano **cancelado** não conta.
 *
 * Os contadores de plano devem excluir cancelados.
 */
export function kpiTreatmentState(
  justificationsCount: number,
  openActionPlansCount: number,
  completedActionPlansCount: number,
): KpiTreatment {
  const hasJust = justificationsCount > 0;
  const hasCompleted = completedActionPlansCount > 0;
  const hasOpen = openActionPlansCount > 0;
  if (hasJust || hasCompleted) {
    let label: string;
    if (hasJust && (hasCompleted || hasOpen))
      label = "com justificativa e plano de ação";
    else if (hasJust) label = "com justificativa";
    else label = "com plano de ação concluído";
    return { kind: "resolved", label };
  }
  if (hasOpen) return { kind: "in_treatment", label: null };
  return { kind: "untreated", label: null };
}

/**
 * Normaliza texto para busca: minúsculas e **sem acento** (NFD + remoção de
 * diacríticos), para que "oleo" encontre "Óleo Usado". Usar nos dois lados da
 * comparação (query e alvo).
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// ─── Computed aggregates ───────────────────────────────────────────────────

export function computeMonthlyStats(
  monthValues: (number | null)[],
  goal: number | null | undefined,
  direction: KpiDirection,
  /**
   * Quando fornecido, só os meses neste conjunto contam (média/acumulado/RAC).
   * Meses fora dele são ignorados — usado p/ indicadores não-mensais, onde
   * valores fora do mês de referência não devem entrar na conta.
   */
  restrict?: Set<number> | null,
) {
  // Zera (ignora) os meses fora da restrição antes de qualquer agregação.
  const considered = restrict
    ? monthValues.map((v, i) => (restrict.has(i + 1) ? v : null))
    : monthValues;
  const filled = considered.filter((v): v is number => v !== null && v !== undefined);
  const average = filled.length > 0 ? filled.reduce((a, b) => a + b, 0) / filled.length : null;
  const accumulated = filled.length > 0 ? filled.reduce((a, b) => a + b, 0) : null;
  // Progresso da tolerância: % atingido em relação à meta, respeitando direction.
  // Clampado em 100% — atingir OU superar a meta = 100% (a métrica é "quanto da
  // meta foi cumprido", não "quão folgado"). Sem o teto, "down" com realizado
  // muito abaixo do goal explodia (ex: avaria 0,02% vs teto 1,20% → 7579%),
  // poluindo a coluna sem agregar leitura.
  // - "up" (maior é melhor): avg/goal*100 — 100% = bateu/superou
  // - "down" (menor é melhor): inverte — goal/avg*100, com avg=0 = 100% (perfeito,
  //   "zero do problema"). Antes, a fórmula uniforme dava 0% pra avaria=0 com
  //   goal>0, opondo a leitura natural ("Atendido 0%" parecia péssimo).
  const progress = (() => {
    if (average === null || goal === null || goal === undefined || goal === 0) return null;
    if (direction === "down") {
      if (average <= 0) return 100;
      return Math.min(100, (goal / average) * 100);
    }
    return Math.min(100, (average / goal) * 100);
  })();
  const overallStatus = getTrafficLight(average, goal, direction);
  const rac1 = getRac(considered, [1, 2, 3, 4, 5, 6], goal, direction);
  const rac2 = getRac(considered, [7, 8, 9, 10, 11, 12], goal, direction);
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

/** Número com casas fixas (zeros à direita preservados), SEM unidade. */
function formatKpiNumberFixedRaw(value: number): string {
  const decimals = pickKpiDecimals(value);
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Detecta unidade de moeda (BRL). Retorna o sufixo de taxa preservado
 * (ex.: "/Km", "/1000 Km", "/mês") ou "" quando é moeda pura; `null` quando
 * NÃO é moeda. Cobre "R$", "real", "reais", "BRL", "$" e taxas "R$/algo".
 */
function currencyRateSuffix(measureUnit: string): string | null {
  const norm = measureUnit
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!/^(r\$|reais|real|brl|\$)(\s*\/.*)?$/.test(norm)) return null;
  // Remove o token de moeda do início, preservando o sufixo de taxa original.
  return measureUnit.trim().replace(/^\s*(r\$|reais|real|brl|\$)\s*/i, "");
}

/** A unidade representa moeda (BRL)? Útil pra UI (ex.: esconder chip redundante). */
export function isCurrencyUnit(measureUnit?: string | null): boolean {
  return measureUnit != null && currencyRateSuffix(measureUnit) !== null;
}

/**
 * Formata um valor de KPI conforme a unidade de medida — fonte única de
 * verdade para exibição de valores. Regras:
 * - Moeda (R$, real, reais, BRL, $, inclusive taxas "R$/Km"): prefixo
 *   "R$ " + 2 casas decimais (ex.: "R$ 1.234,56", "R$ 1.234,56/Km").
 * - Percentual e demais unidades: número + " unidade" (ex.: "12,5 %", "27 KG").
 * - Sem unidade: só o número.
 * `opts.fixed` = casas fixas (cards/dashboards) vs adaptativas (tabelas).
 */
export function formatKpiValue(
  value: number | null | undefined,
  measureUnit?: string | null,
  opts?: { fixed?: boolean },
): string {
  if (value === null || value === undefined) return "—";
  if (measureUnit) {
    const rateSuffix = currencyRateSuffix(measureUnit);
    if (rateSuffix !== null) {
      // Sinal antes do símbolo (pt-BR): "-R$ 1.234,56", não "R$ -1.234,56".
      const neg = value < 0;
      const money = Math.abs(value).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${neg ? "-" : ""}R$ ${money}${rateSuffix}`;
    }
  }
  const num = opts?.fixed ? formatKpiNumberFixedRaw(value) : formatKpiNumber(value);
  return measureUnit ? `${num} ${measureUnit}` : num;
}

/** Formata número para cards/dashboards (casas fixas), ciente da unidade. */
export function formatKpiNumberFixed(
  value: number | null | undefined,
  measureUnit?: string | null,
): string {
  return formatKpiValue(value, measureUnit, { fixed: true });
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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListKpiIndicatorsQueryKey(orgId) });
        // Mudar fórmula recalcula `value` das células no servidor (rota PATCH).
        // Invalida o year-data de TODOS os anos pra que o histórico/Média/
        // Acumulado/Dashboard reflitam o recompute na mesma hora.
        queryClient.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey[0];
            return (
              typeof key === "string" &&
              key.startsWith(`/api/organizations/${orgId}/kpi/years/`)
            );
          },
        });
      },
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
