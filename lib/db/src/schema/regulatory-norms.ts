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
 * Catálogo de normas por organização. `label` é livre (a empresa decide a
 * granularidade: "ISO 9001 · cl. 9.1", "PR 2030"). Consumidores referenciam por
 * id; `active=false` tira da seleção sem quebrar o que já referencia.
 */
export const regulatoryNormsTable = pgTable(
  "regulatory_norms",
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
    uniqueIndex("regulatory_norm_org_lower_label_unique").on(
      table.organizationId,
      sql`lower(${table.label})`,
    ),
  ],
);

export const insertRegulatoryNormSchema = createInsertSchema(
  regulatoryNormsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRegulatoryNorm = z.infer<typeof insertRegulatoryNormSchema>;
export type RegulatoryNorm = typeof regulatoryNormsTable.$inferSelect;
