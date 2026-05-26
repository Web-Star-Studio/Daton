import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  kpiIndicatorRollupsTable,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiYearConfigsTable,
  type KpiFormulaVariable,
  type KpiMonthlyValueInputs,
  type KpiRollupStrategy,
} from "@workspace/db";
import { evaluateFormula } from "../../lib/formula-evaluator";

/**
 * Resultado do compute. Quando `computed` é null, a célula deve aparecer
 * como "pendente" ou "manual override". Quando não-null, é o valor agregado
 * pronto pra renderizar.
 *
 * `breakdown` expõe quais filhas contribuíram pra debug/UI ("calculado a
 * partir de 8/10 filiais; falta Anápolis e Cariacica").
 */
export interface RollupComputeResult {
  computed: number | null;
  strategy: KpiRollupStrategy;
  /** Quantos filhos foram considerados (com dados no mês). */
  childrenWithData: number;
  /** Total de filhos configurados como rollup children. */
  childrenTotal: number;
  /** Por filho: contribuição + dados crus pra UI explicar. */
  breakdown: Array<{
    childIndicatorId: number;
    childUnit: string | null;
    inputs: KpiMonthlyValueInputs;
    value: number | null;
  }>;
}

/**
 * Aplica a fórmula do pai sobre inputs agregados. Retorna null se a fórmula
 * falhar (ex: divisão por zero) ou se os inputs estiverem incompletos.
 */
function applyParentFormula(
  parentVars: KpiFormulaVariable[],
  parentExpression: string,
  inputs: Record<string, number>,
): number | null {
  // Todos os vars do pai precisam ter algum valor pra fórmula resolver
  for (const v of parentVars) {
    if (!(v.key in inputs)) return null;
  }
  try {
    // evaluateFormula só usa expression + inputs (variables são pra UI/validação)
    void parentVars;
    const result = evaluateFormula(parentExpression, inputs);
    if (typeof result !== "number" || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * Calcula o valor de rollup de um indicador pai para um (year, month).
 *
 * Retorna { computed: null } quando:
 * - Indicador não tem rollup configurado (rollupStrategy = NULL ou sem filhos)
 * - Estratégia é incompatível com os dados disponíveis
 * - Nenhuma filha reportou dados naquele mês
 *
 * Para `sum_inputs` (default e mais comum):
 * 1. Para cada filha, lê o `inputs` JSON do mês
 * 2. Renomeia chaves filha → chaves pai usando o `variable_mapping`
 * 3. Soma todos os inputs do pai
 * 4. Aplica a fórmula do pai sobre o input agregado
 *
 * Para `sum_values`/`average`/`min`/`max`:
 * 1. Lê o `value` de cada filha no mês
 * 2. Aplica a função de agregação
 */
export async function computeRollupValue(
  orgId: number,
  parentIndicatorId: number,
  year: number,
  month: number,
): Promise<RollupComputeResult | null> {
  // 1. Carrega o indicador pai (precisa de fórmula + strategy)
  const [parent] = await db
    .select()
    .from(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, parentIndicatorId), eq(kpiIndicatorsTable.organizationId, orgId)));
  if (!parent) return null;

  const strategy = (parent.rollupStrategy ?? "sum_inputs") as KpiRollupStrategy;

  // 2. Carrega rollup children + mapeamentos
  const childLinks = await db
    .select()
    .from(kpiIndicatorRollupsTable)
    .where(and(
      eq(kpiIndicatorRollupsTable.parentIndicatorId, parentIndicatorId),
      eq(kpiIndicatorRollupsTable.organizationId, orgId),
    ));
  if (childLinks.length === 0) return null;

  const childIds = childLinks.map((l) => l.childIndicatorId);

  // 3. Carrega year configs dos filhos (pra year/indicatorId → yearConfigId)
  const childYearConfigs = await db
    .select({
      id: kpiYearConfigsTable.id,
      indicatorId: kpiYearConfigsTable.indicatorId,
    })
    .from(kpiYearConfigsTable)
    .where(and(
      eq(kpiYearConfigsTable.organizationId, orgId),
      eq(kpiYearConfigsTable.year, year),
      inArray(kpiYearConfigsTable.indicatorId, childIds),
    ));

  const yearConfigByChild = new Map(childYearConfigs.map((c) => [c.indicatorId, c.id]));

  // 4. Carrega monthly values dos filhos no mês alvo
  const yearConfigIds = childYearConfigs.map((c) => c.id);
  const monthValues = yearConfigIds.length > 0
    ? await db
        .select()
        .from(kpiMonthlyValuesTable)
        .where(and(
          inArray(kpiMonthlyValuesTable.yearConfigId, yearConfigIds),
          eq(kpiMonthlyValuesTable.month, month),
        ))
    : [];

  const monthlyValueByConfig = new Map(monthValues.map((mv) => [mv.yearConfigId, mv]));

  // 5. Carrega unit + variables dos filhos pra breakdown
  const childIndicators = await db
    .select({
      id: kpiIndicatorsTable.id,
      unit: kpiIndicatorsTable.unit,
      formulaVariables: kpiIndicatorsTable.formulaVariables,
    })
    .from(kpiIndicatorsTable)
    .where(inArray(kpiIndicatorsTable.id, childIds));
  const childMeta = new Map(childIndicators.map((c) => [c.id, c]));

  // 6. Monta o breakdown
  const breakdown: RollupComputeResult["breakdown"] = childLinks.map((link) => {
    const meta = childMeta.get(link.childIndicatorId);
    const yearConfigId = yearConfigByChild.get(link.childIndicatorId);
    const mv = yearConfigId ? monthlyValueByConfig.get(yearConfigId) : undefined;
    return {
      childIndicatorId: link.childIndicatorId,
      childUnit: meta?.unit ?? null,
      inputs: mv?.inputs ?? {},
      value: mv?.value !== undefined && mv?.value !== null ? parseFloat(mv.value as unknown as string) : null,
    };
  });

  const withData = breakdown.filter((b) => {
    if (strategy === "sum_inputs") return Object.keys(b.inputs).length > 0;
    return b.value !== null;
  });

  const baseResult: Omit<RollupComputeResult, "computed"> = {
    strategy,
    childrenWithData: withData.length,
    childrenTotal: breakdown.length,
    breakdown,
  };

  if (withData.length === 0) {
    return { ...baseResult, computed: null };
  }

  // 7. Aplica a estratégia
  if (strategy === "sum_inputs") {
    // Agrega inputs por chave-pai usando os mapeamentos
    const aggregated: Record<string, number> = {};
    for (const link of childLinks) {
      const yearConfigId = yearConfigByChild.get(link.childIndicatorId);
      if (!yearConfigId) continue;
      const mv = monthlyValueByConfig.get(yearConfigId);
      if (!mv) continue;
      for (const [parentKey, childKey] of Object.entries(link.variableMapping)) {
        const raw = mv.inputs[childKey];
        if (typeof raw === "number" && Number.isFinite(raw)) {
          aggregated[parentKey] = (aggregated[parentKey] ?? 0) + raw;
        }
      }
    }
    const value = applyParentFormula(parent.formulaVariables, parent.formulaExpression, aggregated);
    return { ...baseResult, computed: value };
  }

  // Estratégias baseadas em `value` das filhas
  const values = withData.map((b) => b.value!).filter((v): v is number => Number.isFinite(v));
  if (values.length === 0) return { ...baseResult, computed: null };

  let computed: number;
  switch (strategy) {
    case "sum_values":
      computed = values.reduce((acc, v) => acc + v, 0);
      break;
    case "average":
      computed = values.reduce((acc, v) => acc + v, 0) / values.length;
      break;
    case "min":
      computed = Math.min(...values);
      break;
    case "max":
      computed = Math.max(...values);
      break;
    default:
      return { ...baseResult, computed: null };
  }

  return { ...baseResult, computed };
}
