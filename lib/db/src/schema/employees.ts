import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  name: text("name").notNull(),
  cpf: text("cpf"),
  email: text("email"),
  phone: text("phone"),
  position: text("position"),
  department: text("department"),
  contractType: text("contract_type").notNull().default("clt"),
  admissionDate: date("admission_date"),
  terminationDate: date("termination_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const employeeProfileItemsTable = pgTable("employee_profile_items", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const employeeProfileItemAttachmentsTable = pgTable("employee_profile_item_attachments", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => employeeProfileItemsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeeCompetenciesTable = pgTable("employee_competencies", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("formacao"),
  requiredLevel: integer("required_level").notNull().default(1),
  acquiredLevel: integer("acquired_level").notNull().default(0),
  evidence: text("evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const employeeTrainingsTable = pgTable("employee_trainings", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  institution: text("institution"),
  workloadHours: integer("workload_hours"),
  completionDate: date("completion_date"),
  expirationDate: date("expiration_date"),
  status: text("status").notNull().default("pendente"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const employeeAwarenessTable = pgTable("employee_awareness_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  description: text("description"),
  date: date("date").notNull(),
  verificationMethod: text("verification_method"),
  result: text("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const employeeUnitsTable = pgTable("employee_units", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
export type EmployeeProfileItem = typeof employeeProfileItemsTable.$inferSelect;
export type EmployeeProfileItemAttachment = typeof employeeProfileItemAttachmentsTable.$inferSelect;

export const insertCompetencySchema = createInsertSchema(employeeCompetenciesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompetency = z.infer<typeof insertCompetencySchema>;
export type EmployeeCompetency = typeof employeeCompetenciesTable.$inferSelect;

export const insertTrainingSchema = createInsertSchema(employeeTrainingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTraining = z.infer<typeof insertTrainingSchema>;
export type EmployeeTraining = typeof employeeTrainingsTable.$inferSelect;

export const insertAwarenessSchema = createInsertSchema(employeeAwarenessTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAwareness = z.infer<typeof insertAwarenessSchema>;
export type EmployeeAwareness = typeof employeeAwarenessTable.$inferSelect;
