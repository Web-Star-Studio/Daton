import { sql } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgTable, serial, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export type KpiDirection = "up" | "down";
export type KpiPeriodicity =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "monthly_15d"
  | "monthly_45d";
export type KpiFeedStatus = "fed" | "overdue";

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

/** ISO norm codes an indicator can be tagged with (cláusula 9.1 — monitoramento). */
export type KpiNorm = "9001" | "14001" | "39001";
export const KPI_NORMS: KpiNorm[] = ["9001", "14001", "39001"];

export type KpiFormulaVariable = { key: string; label: string };
export type KpiMonthlyValueInputs = Record<string, number | null>;

export const kpiObjectivesTable = pgTable("kpi_objectives", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  code: varchar("code", { length: 20 }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const kpiIndicatorsTable = pgTable("kpi_indicators", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  measurement: text("measurement").notNull(),
  formulaVariables: jsonb("formula_variables")
    .$type<KpiFormulaVariable[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  formulaExpression: text("formula_expression").notNull().default(""),
  unit: varchar("unit", { length: 200 }),
  responsible: varchar("responsible", { length: 200 }),
  responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  measureUnit: varchar("measure_unit", { length: 50 }),
  direction: varchar("direction", { length: 4 }).notNull(),
  periodicity: varchar("periodicity", { length: 50 }).notNull(),
  /** Mês de referência (1–12) para periodicidades não mensais. */
  referenceMonth: integer("reference_month"),
  category: varchar("category", { length: 50 }),
  norms: jsonb("norms")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const kpiYearConfigsTable = pgTable("kpi_year_configs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  indicatorId: integer("indicator_id").notNull().references(() => kpiIndicatorsTable.id, { onDelete: "cascade" }),
  objectiveId: integer("objective_id").references(() => kpiObjectivesTable.id, { onDelete: "set null" }),
  year: integer("year").notNull(),
  seq: integer("seq"),
  goal: numeric("goal", { precision: 12, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("kpi_year_config_indicator_year_unique").on(table.organizationId, table.indicatorId, table.year),
]);

export const kpiMonthlyValuesTable = pgTable("kpi_monthly_values", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  yearConfigId: integer("year_config_id").notNull().references(() => kpiYearConfigsTable.id, { onDelete: "cascade" }),
  month: integer("month").notNull(),
  value: numeric("value", { precision: 15, scale: 4 }),
  inputs: jsonb("inputs")
    .$type<KpiMonthlyValueInputs>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("kpi_monthly_value_config_month_unique").on(table.yearConfigId, table.month),
]);

// Append-only audit trail for monthly cell justifications.
// Each save creates a new entry; latest entry by createdAt is the "current".
// updatedAt is included to satisfy the schema convention even though entries
// are effectively immutable (in practice it will equal createdAt).
export const kpiMonthlyValueJustificationsTable = pgTable(
  "kpi_monthly_value_justifications",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    monthlyValueId: integer("monthly_value_id").notNull().references(() => kpiMonthlyValuesTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("kpi_mv_justifications_mv_idx").on(table.monthlyValueId, table.createdAt),
  ],
);

export const insertKpiObjectiveSchema = createInsertSchema(kpiObjectivesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKpiObjective = z.infer<typeof insertKpiObjectiveSchema>;
export type KpiObjective = typeof kpiObjectivesTable.$inferSelect;

export const insertKpiIndicatorSchema = createInsertSchema(kpiIndicatorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKpiIndicator = z.infer<typeof insertKpiIndicatorSchema>;
export type KpiIndicator = typeof kpiIndicatorsTable.$inferSelect;

export const insertKpiYearConfigSchema = createInsertSchema(kpiYearConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKpiYearConfig = z.infer<typeof insertKpiYearConfigSchema>;
export type KpiYearConfig = typeof kpiYearConfigsTable.$inferSelect;

export const insertKpiMonthlyValueSchema = createInsertSchema(kpiMonthlyValuesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKpiMonthlyValue = z.infer<typeof insertKpiMonthlyValueSchema>;
export type KpiMonthlyValue = typeof kpiMonthlyValuesTable.$inferSelect;

export const insertKpiMonthlyValueJustificationSchema = createInsertSchema(kpiMonthlyValueJustificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKpiMonthlyValueJustification = z.infer<typeof insertKpiMonthlyValueJustificationSchema>;
export type KpiMonthlyValueJustification = typeof kpiMonthlyValueJustificationsTable.$inferSelect;
