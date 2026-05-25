import { pgTable, text, serial, timestamp, integer, boolean, date } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";
import { usersTable } from "./users";

// --- Regulatory Documents (licenças, AVCB, alvarás) ---
//
// Parent record. Each document belongs to exactly one unit (filial) — every
// document is tied to a single CNPJ, per client confirmation. If the same
// physical license needs to apply elsewhere, it's cadastrada separadamente.
// `status` is recomputed server-side from `expirationDate` and persisted to
// keep filter queries cheap (vigente|a_vencer|vencido).

export const regulatoryDocumentsTable = pgTable("regulatory_documents", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id),
  identifierType: text("identifier_type").notNull(),
  // 'licenca_ambiental' | 'avcb' | 'alvara' | 'outorga' | 'certidao' | 'outro'
  identifierOther: text("identifier_other"), // when identifierType='outro'
  documentNumber: text("document_number"),
  issuingBody: text("issuing_body").notNull(),
  processNumber: text("process_number"),
  // Responsável MUST be a user (with login), never just an employee. This is a
  // platform-wide convention — see memory `responsavel-must-be-user`. Pulling
  // from users means alerts (in-app + e-mail) route directly without the
  // fragile employees.email = users.email matching.
  responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  issueDate: date("issue_date"),
  expirationDate: date("expiration_date").notNull(), // canonical current validity
  renewalRequired: boolean("renewal_required").notNull().default(true),
  alertDaysOverride: integer("alert_days_override"), // null = use org default (30d)
  externalSourceProvider: text("external_source_provider"),
  externalSourceReference: text("external_source_reference"),
  externalSourceUrl: text("external_source_url"),
  externalLastSyncAt: timestamp("external_last_sync_at", { withTimezone: true }),
  notes: text("notes"),
  status: text("status").notNull().default("vigente"),
  // 'vigente' | 'a_vencer' | 'vencido' — computed, persisted for fast filtering
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type RegulatoryDocument = typeof regulatoryDocumentsTable.$inferSelect;

// Renewal events — append-only history, preserves past cycles (improvement over v1).
// When status='renovado', server mirrors `newExpirationDate` back to parent
// regulatoryDocumentsTable.expirationDate.
export const regulatoryDocumentRenewalsTable = pgTable("regulatory_document_renewals", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  documentId: integer("document_id").notNull().references(() => regulatoryDocumentsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("nao_iniciado"),
  // 'nao_iniciado' | 'em_andamento' | 'protocolado' | 'renovado' | 'indeferido'
  scheduledStartDate: date("scheduled_start_date"),
  protocolDeadline: date("protocol_deadline"),
  protocolNumber: text("protocol_number"),
  newExpirationDate: date("new_expiration_date"), // only meaningful when status='renovado'
  issuingBody: text("issuing_body"), // snapshot at this cycle (may differ from parent)
  notes: text("notes"),
  // Same convention as the parent: who registered the renovação is a user.
  recordedByUserId: integer("recorded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type RegulatoryDocumentRenewal = typeof regulatoryDocumentRenewalsTable.$inferSelect;

// Attachments — versão de PDF, opcionalmente ligado a uma renovação específica.
// renewalId=null → anexo de nível-documento (ex.: PDF original do cadastro).
export const regulatoryDocumentAttachmentsTable = pgTable("regulatory_document_attachments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  documentId: integer("document_id").notNull().references(() => regulatoryDocumentsTable.id, { onDelete: "cascade" }),
  renewalId: integer("renewal_id").references(() => regulatoryDocumentRenewalsTable.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RegulatoryDocumentAttachment = typeof regulatoryDocumentAttachmentsTable.$inferSelect;
