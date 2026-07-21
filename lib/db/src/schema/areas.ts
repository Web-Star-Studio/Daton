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
 * Catálogo de áreas (setores) de cargo, por organização. Substitui a lista fixa
 * que ficava hardcoded no formulário de cargo. Cargos referenciam por id
 * (`positions.area_id`); `active=false` tira do seletor sem quebrar o que já
 * referencia — espelha `regulatory_norms` / `effectiveness_methods`.
 */
export const areasTable = pgTable(
  "areas",
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
    uniqueIndex("area_org_lower_label_unique").on(
      table.organizationId,
      sql`lower(${table.label})`,
    ),
  ],
);

export const insertAreaSchema = createInsertSchema(areasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertArea = z.infer<typeof insertAreaSchema>;
export type Area = typeof areasTable.$inferSelect;
