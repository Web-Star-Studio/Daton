import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * Catálogo de métodos de verificação de eficácia, por organização. Substitui a
 * lista fixa do enum `action_plan_effectiveness_method` (mantido como legado).
 * Planos referenciam por id; `active=false` tira do seletor sem quebrar o que
 * já referencia — espelha `regulatory_norms`.
 */
export const effectivenessMethodsTable = pgTable(
  "effectiveness_methods",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("effectiveness_method_org_lower_label_unique").on(
      table.organizationId,
      sql`lower(${table.label})`,
    ),
  ],
);

export const insertEffectivenessMethodSchema = createInsertSchema(
  effectivenessMethodsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEffectivenessMethod = z.infer<
  typeof insertEffectivenessMethodSchema
>;
export type EffectivenessMethod = typeof effectivenessMethodsTable.$inferSelect;
