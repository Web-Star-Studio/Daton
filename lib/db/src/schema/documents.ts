import { pgTable, text, serial, timestamp, integer, date, unique } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";
import { employeesTable } from "./employees";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  title: text("title").notNull(),
  type: text("type").notNull().default("manual"),
  sourceEntityType: text("source_entity_type"),
  sourceEntityId: integer("source_entity_id"),
  status: text("status").notNull().default("draft"),
  currentVersion: integer("current_version").notNull().default(0),
  pendingVersionDescription: text("pending_version_description"),
  validityDate: date("validity_date"),
  normReference: text("norm_reference"),
  responsibleDepartment: text("responsible_department"),
  createdById: integer("created_by_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Document = typeof documentsTable.$inferSelect;

export const documentUnitsTable = pgTable("document_units", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentElaboratorsTable = pgTable("document_elaborators", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  // TODO(schema): rename legacy DB column `user_id` -> `employee_id` in a dedicated rollout.
  // It remains as `user_id` for now to preserve existing environments without forcing an immediate migration.
  employeeId: integer("user_id").notNull().references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentApproversTable = pgTable("document_approvers", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  // role: 'approver' (default) | 'critical_reviewer' (must act before final approvers)
  role: text("role").notNull().default("approver"),
  status: text("status").notNull().default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  comment: text("comment"),
  approvalCycle: integer("approval_cycle").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentRecipientsTable = pgTable("document_recipients", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  confirmationNote: text("confirmation_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentReferencesTable = pgTable("document_references", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  referencedDocumentId: integer("referenced_document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentAttachmentsTable = pgTable("document_attachments", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull().default(1),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedById: integer("uploaded_by_id").notNull().references(() => usersTable.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentVersionsTable = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  changeDescription: text("change_description").notNull(),
  changedById: integer("changed_by_id").notNull().references(() => usersTable.id),
  changedFields: text("changed_fields"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentRevisionRequestsTable = pgTable("document_revision_requests", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  requestedById: integer("requested_by_id").notNull().references(() => usersTable.id),
  reviewerUserId: integer("reviewer_user_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  changeDescription: text("change_description").notNull(),
  attachmentFileName: text("attachment_file_name"),
  attachmentFileSize: integer("attachment_file_size"),
  attachmentContentType: text("attachment_content_type"),
  attachmentObjectPath: text("attachment_object_path"),
  reviewerNotes: text("reviewer_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentRevisionRequest = typeof documentRevisionRequestsTable.$inferSelect;

export const documentSettingsTable = pgTable("document_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  defaultExpiringDays: integer("default_expiring_days").notNull().default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.organizationId)]);

export type DocumentSettings = typeof documentSettingsTable.$inferSelect;
