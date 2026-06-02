import { index, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";

// SWOT factor type (rótulos PT-BR aplicados no cliente).
export type SwotFactorType = "strength" | "weakness" | "opportunity" | "threat";
export type SwotEnvironment = "internal" | "external";

export const swotFactorTypeEnum = pgEnum("swot_factor_type", [
  "strength",
  "weakness",
  "opportunity",
  "threat",
]);
export const swotEnvironmentEnum = pgEnum("swot_environment", ["internal", "external"]);

/**
 * Objetivos estratégicos do SWOT — próprios do módulo (separados do KPI) e
 * corporativos (nível organização). Os fatores referenciam um objetivo.
 */
export const swotObjectivesTable = pgTable("swot_objectives", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  code: varchar("code", { length: 20 }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * Fator SWOT. Corporativo por padrão (`unitId` nulo); pode ser atribuído a uma
 * filial específica. Resultado (performance × relevância) e a decisão são
 * derivados em runtime — não persistidos — por função pura compartilhada.
 */
export const swotFactorsTable = pgTable(
  "swot_factors",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    // null = Corporativo; preserva o fator como corporativo se a filial for removida.
    unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    type: swotFactorTypeEnum("type").notNull(),
    environment: swotEnvironmentEnum("environment").notNull(),
    perspective: text("perspective"),
    // Performance e Relevância na escala FPLAN 1–4.
    performance: integer("performance").notNull().default(3),
    relevance: integer("relevance").notNull().default(3),
    objectiveId: integer("objective_id").references(() => swotObjectivesTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("swot_factors_org_unit_idx").on(table.organizationId, table.unitId),
  ],
);

export const insertSwotObjectiveSchema = createInsertSchema(swotObjectivesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSwotObjective = z.infer<typeof insertSwotObjectiveSchema>;
export type SwotObjective = typeof swotObjectivesTable.$inferSelect;

export const insertSwotFactorSchema = createInsertSchema(swotFactorsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSwotFactor = z.infer<typeof insertSwotFactorSchema>;
export type SwotFactor = typeof swotFactorsTable.$inferSelect;
