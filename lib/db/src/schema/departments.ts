import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  education: text("education"),
  experience: text("experience"),
  requirements: text("requirements"),
  responsibilities: text("responsibilities"),
  level: text("level"),
  minSalary: integer("min_salary"),
  maxSalary: integer("max_salary"),
  // Setor do cargo. LEGADO em texto livre — mantido para não perder o histórico
  // já importado; a fonte atual é o catálogo `areas` via `areaId`. Backfill em
  // scripts/src/migrate/areas-backfill.ts liga cada cargo à sua área.
  area: text("area"),
  // Área (setor) do cargo — catálogo `areas.id`. DEPRECADO: o conceito correto é
  // Departamento (departments), então a fonte atual é `departmentId`. Mantido
  // dormente para não perder o vínculo até o backfill area→departamento.
  areaId: integer("area_id"),
  // Departamento do cargo — `departments.id`. Integer simples aqui; a FK
  // (ON DELETE SET NULL) é adicionada por DDL, mesma convenção de principalNormId.
  departmentId: integer("department_id"),
  // Norma ISO principal do cargo (regulatory_norms.id). Integer simples aqui — a FK
  // (ON DELETE SET NULL) é adicionada por DDL, seguindo a convenção do repo de evitar
  // referência no schema Drizzle.
  principalNormId: integer("principal_norm_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departmentsTable.$inferSelect;

export const insertPositionSchema = createInsertSchema(positionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positionsTable.$inferSelect;
