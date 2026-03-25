import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { organizationContactGroupsTable } from "./organization-contacts";
import { usersTable } from "./users";
import { employeesTable } from "./employees";

export const documentsTable = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    title: text("title").notNull(),
    type: text("type").notNull().default("manual"),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: integer("source_entity_id"),
    status: text("status").notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    pendingVersionDescription: text("pending_version_description"),
    normativeRequirements: text("normative_requirements")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    validityDate: date("validity_date"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("documents_org_id_unique").on(table.organizationId, table.id),
  ],
);

export type Document = typeof documentsTable.$inferSelect;

export const documentUnitsTable = pgTable("document_units", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentElaboratorsTable = pgTable("document_elaborators", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  // TODO(schema): rename legacy DB column `user_id` -> `employee_id` in a dedicated rollout.
  // It remains as `user_id` for now to preserve existing environments without forcing an immediate migration.
  employeeId: integer("user_id")
    .notNull()
    .references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentApproversTable = pgTable("document_approvers", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  status: text("status").notNull().default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  comment: text("comment"),
  approvalCycle: integer("approval_cycle").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentCriticalReviewersTable = pgTable(
  "document_critical_reviewers",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("document_critical_reviewers_document_user_unique").on(
      table.documentId,
      table.userId,
    ),
  ],
);

export const documentCriticalAnalysisTable = pgTable(
  "document_critical_analysis",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    analysisCycle: integer("analysis_cycle").notNull().default(1),
    status: text("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: integer("completed_by_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("document_critical_analysis_document_user_cycle_unique").on(
      table.documentId,
      table.userId,
      table.analysisCycle,
    ),
  ],
);

export const documentRecipientsTable = pgTable("document_recipients", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentRecipientUserLinksTable = pgTable(
  "document_recipient_user_links",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("document_recipient_user_links_document_user_unique").on(
      table.documentId,
      table.userId,
    ),
  ],
);

export const documentRecipientGroupsTable = pgTable("document_recipient_groups", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const documentRecipientGroupMembersTable = pgTable(
  "document_recipient_group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => documentRecipientGroupsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("document_recipient_group_members_group_user_unique").on(
      table.groupId,
      table.userId,
    ),
  ],
);

export const documentRecipientGroupLinksTable = pgTable(
  "document_recipient_group_links",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => organizationContactGroupsTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("document_recipient_group_links_document_group_unique").on(
      table.documentId,
      table.groupId,
    ),
  ],
);

export const documentReferencesTable = pgTable("document_references", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  referencedDocumentId: integer("referenced_document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentAttachmentsTable = pgTable("document_attachments", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull().default(1),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedById: integer("uploaded_by_id")
    .notNull()
    .references(() => usersTable.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentVersionsTable = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  changeDescription: text("change_description").notNull(),
  changedById: integer("changed_by_id")
    .notNull()
    .references(() => usersTable.id),
  changedFields: text("changed_fields"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
