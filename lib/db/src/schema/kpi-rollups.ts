import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { kpiIndicatorsTable } from "./kpi";

/**
 * Liga um indicador KPI "pai" (rollup corporativo) aos indicadores "filhos"
 * que o compõem. Cada filho geralmente é a versão filial-level do mesmo
 * conceito (ex.: "% de Avaria - Geral" tem como filhos "% de Avaria - Anápolis",
 * "% de Avaria - Cariacica", etc.).
 *
 * `variable_mapping` resolve o caso comum onde as chaves das variáveis no pai
 * e no filho diferem (acontece sempre em imports Excel — o exemplo concreto da
 * Gabardo: pai usa `veiculos_avariados`, filhos usam `numero_de_veiculos_avariados`).
 * Mapeamento é parent_var_key → child_var_key.
 *
 * Estratégia de agregação fica em `kpi_indicators.rollup_strategy` (no parent).
 */
export const kpiIndicatorRollupsTable = pgTable(
  "kpi_indicator_rollups",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    parentIndicatorId: integer("parent_indicator_id").notNull().references(() => kpiIndicatorsTable.id, { onDelete: "cascade" }),
    childIndicatorId: integer("child_indicator_id").notNull().references(() => kpiIndicatorsTable.id, { onDelete: "cascade" }),
    /** Map parent variable key → child variable key. JSON: { [parentKey]: childKey } */
    variableMapping: jsonb("variable_mapping").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("kpi_rollup_parent_child_unique").on(table.parentIndicatorId, table.childIndicatorId),
  ],
);

export type KpiIndicatorRollup = typeof kpiIndicatorRollupsTable.$inferSelect;

/**
 * Estratégias de agregação suportadas pelo rollup. Default sugerido: `sum_inputs`
 * (matematicamente correto pra razões — soma os inputs/variables das filhas e
 * aplica a fórmula do pai uma vez só).
 */
export type KpiRollupStrategy =
  | "sum_inputs"        // soma cada variável nas filhas → aplica fórmula do pai
  | "sum_values"        // soma os valores calculados das filhas (pra contagens absolutas)
  | "average"           // média simples dos valores das filhas (perde precisão em razões com volumes desiguais)
  | "min"
  | "max";

export const KPI_ROLLUP_STRATEGIES: KpiRollupStrategy[] = [
  "sum_inputs",
  "sum_values",
  "average",
  "min",
  "max",
];
