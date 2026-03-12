import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { unitLegislationsTable } from "./unit-legislations";

export const evidenceAttachmentsTable = pgTable("evidence_attachments", {
  id: serial("id").primaryKey(),
  unitLegislationId: integer("unit_legislation_id").notNull().references(() => unitLegislationsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EvidenceAttachment = typeof evidenceAttachmentsTable.$inferSelect;
