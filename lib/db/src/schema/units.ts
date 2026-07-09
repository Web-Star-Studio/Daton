import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const unitsTable = pgTable("units", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  code: text("code"),
  type: text("type").notNull().default("filial"),
  cnpj: text("cnpj"),
  status: text("status").notNull().default("ativa"),
  cep: text("cep"),
  address: text("address"),
  streetNumber: text("street_number"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  state: text("state"),
  country: text("country").default("Brasil"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Gestores de uma filial (N:N filial ↔ usuário). Um gestor supervisiona a
// unidade em que está vinculado. userId é integer simples no schema (FK real
// via DDL) para evitar ciclo de import units <-> users.
export const unitManagersTable = pgTable(
  "unit_managers",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("unit_managers_unit_user_uq").on(table.unitId, table.userId),
    index("unit_managers_org_idx").on(table.organizationId),
  ],
);

export const insertUnitSchema = createInsertSchema(unitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type Unit = typeof unitsTable.$inferSelect;
