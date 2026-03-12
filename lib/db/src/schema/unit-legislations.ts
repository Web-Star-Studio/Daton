import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { legislationsTable } from "./legislations";

export const unitLegislationsTable = pgTable("unit_legislations", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  legislationId: integer("legislation_id").notNull().references(() => legislationsTable.id, { onDelete: "cascade" }),
  complianceStatus: text("compliance_status").notNull().default("nao_avaliado"),
  notes: text("notes"),
  evidenceUrl: text("evidence_url"),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("unit_legislation_unique").on(table.unitId, table.legislationId),
]);

export const insertUnitLegislationSchema = createInsertSchema(unitLegislationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUnitLegislation = z.infer<typeof insertUnitLegislationSchema>;
export type UnitLegislation = typeof unitLegislationsTable.$inferSelect;
