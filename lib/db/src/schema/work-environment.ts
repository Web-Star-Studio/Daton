import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";
import { employeesTable } from "./employees";

export const workEnvironmentControlsTable = pgTable("work_environment_controls", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  factorType: text("factor_type").notNull().default("fisico"), // fisico | social | psicologico
  title: text("title").notNull(),
  description: text("description"),
  responsibleId: integer("responsible_id").references(() => employeesTable.id, { onDelete: "set null" }),
  frequency: text("frequency").notNull().default("mensal"), // semanal | mensal | trimestral | semestral | anual
  status: text("status").notNull().default("ativo"), // ativo | inativo
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WorkEnvironmentControl = typeof workEnvironmentControlsTable.$inferSelect;

export const workEnvironmentVerificationsTable = pgTable("work_environment_verifications", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  controlId: integer("control_id").notNull().references(() => workEnvironmentControlsTable.id, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  verifiedById: integer("verified_by_id").references(() => employeesTable.id, { onDelete: "set null" }),
  result: text("result").notNull().default("adequado"), // adequado | inadequado | parcial
  notes: text("notes"),
  actionTaken: text("action_taken"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WorkEnvironmentVerification = typeof workEnvironmentVerificationsTable.$inferSelect;

export const workEnvironmentAttachmentsTable = pgTable("work_environment_attachments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  verificationId: integer("verification_id").notNull().references(() => workEnvironmentVerificationsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkEnvironmentAttachment = typeof workEnvironmentAttachmentsTable.$inferSelect;
