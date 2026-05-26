import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { regulatoryDocumentsTable } from "./regulatory-documents";
import { usersTable } from "./users";

// --- Audit Log for Regulatory Documents ---
//
// Append-only log of every create/update/delete touching a regulatory document,
// its renewals or its attachments. Required for ISO 9001/14001/39001 compliance:
// auditors will ask "who changed this expiration date and when?". The diff is
// stored as JSONB so we can render line-by-line "Validade: X → Y" in the UI
// without reconstructing the state from event sourcing.
//
// `userName` is snapshotted at log time so the audit trail survives user
// deletion. `entityType=document` records reference the parent itself
// (`entityId` is NULL); renewal/attachment events carry the child id.

export type RegulatoryDocumentAuditEntityType =
  | "document"
  | "renewal"
  | "attachment";

export type RegulatoryDocumentAuditAction = "created" | "updated" | "deleted";

// For "updated" entries we store only the fields that changed.
// For "created"/"deleted" we keep a full snapshot so the entry remains
// meaningful even if the related row is gone.
export type RegulatoryDocumentAuditChanges =
  | {
      kind: "diff";
      fields: Record<string, { from: unknown; to: unknown }>;
    }
  | {
      kind: "snapshot";
      snapshot: Record<string, unknown>;
    };

export const regulatoryDocumentAuditLogTable = pgTable(
  "regulatory_document_audit_log",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    documentId: integer("document_id")
      .notNull()
      .references(() => regulatoryDocumentsTable.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    // 'document' | 'renewal' | 'attachment'
    entityId: integer("entity_id"),
    // NULL when entityType='document' (refers to parent itself)
    action: text("action").notNull(),
    // 'created' | 'updated' | 'deleted'
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    userName: text("user_name"),
    // snapshot of user.name at time of action (survives user deletion)
    changes: jsonb("changes")
      .$type<RegulatoryDocumentAuditChanges>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("regulatory_document_audit_doc_created_idx").on(
      table.documentId,
      table.createdAt,
    ),
    index("regulatory_document_audit_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export type RegulatoryDocumentAuditLog =
  typeof regulatoryDocumentAuditLogTable.$inferSelect;
