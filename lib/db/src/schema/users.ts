import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Nullable: usuários criados pelo admin sem senha definem a própria via link
  // por e-mail (fluxo password-reset). O login bloqueia contas sem senha.
  passwordHash: text("password_hash"),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  role: text("role").notNull().default("analyst"),
  theme: text("theme").notNull().default("light"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // Filial do usuário. Obrigatório (na camada de app) só para role "manager";
  // opcional para os demais (usada também na identidade/escopo das Pendências).
  // onDelete set null: apagar a filial não apaga o usuário.
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  // Colaborador (RH) vinculado a este usuário — vínculo persistente users↔employees
  // que substitui o casamento frágil por e-mail/nome. Mantido como integer simples
  // (sem .references) de propósito: declarar a FK aqui criaria import/inferência de
  // tipo circular com employeesTable (que já referencia usersTable). A constraint
  // FK (employee_id -> employees.id, ON DELETE SET NULL) existe no banco, aplicada
  // via DDL no backfill (scripts/src/migrate/backfill-user-employee-link.ts).
  employeeId: integer("employee_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const userModulePermissionsTable = pgTable("user_module_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  module: text("module").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("user_module_unique").on(table.userId, table.module),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type UserModulePermission = typeof userModulePermissionsTable.$inferSelect;
