import { pgTable, text, serial, timestamp, integer, unique, boolean, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";
import { employeesTable } from "./employees";
import { documentsTable } from "./documents";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  name: text("name").notNull(),
  assetType: text("asset_type").notNull(),
  criticality: text("criticality").notNull().default("media"),
  status: text("status").notNull().default("ativo"),
  location: text("location"),
  impactedProcess: text("impacted_process"),
  responsibleId: integer("responsible_id").references(() => employeesTable.id, { onDelete: "set null" }),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;

export const assetMaintenancePlansTable = pgTable("asset_maintenance_plans", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  assetId: integer("asset_id").notNull().references(() => assetsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: text("type").notNull().default("preventiva"), // preventiva | corretiva | inspecao
  periodicity: text("periodicity").notNull().default("mensal"), // semanal | mensal | trimestral | semestral | anual | unica
  checklistItems: text("checklist_items").array().notNull().default(sql`'{}'::text[]`),
  responsibleId: integer("responsible_id").references(() => employeesTable.id, { onDelete: "set null" }),
  nextDueAt: date("next_due_at"),
  originalNextDueAt: date("original_next_due_at"), // preserves the manually-set date; never touched by auto-advance
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AssetMaintenancePlan = typeof assetMaintenancePlansTable.$inferSelect;

export const assetMaintenanceRecordsTable = pgTable("asset_maintenance_records", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  planId: integer("plan_id").notNull().references(() => assetMaintenancePlansTable.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").notNull().references(() => assetsTable.id, { onDelete: "cascade" }),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
  executedById: integer("executed_by_id").references(() => employeesTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("concluida"), // concluida | parcial | cancelada
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AssetMaintenanceRecord = typeof assetMaintenanceRecordsTable.$inferSelect;

export const assetMaintenanceAttachmentsTable = pgTable("asset_maintenance_attachments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  recordId: integer("record_id").notNull().references(() => assetMaintenanceRecordsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssetMaintenanceAttachment = typeof assetMaintenanceAttachmentsTable.$inferSelect;

export const assetDocumentsTable = pgTable(
  "asset_documents",
  {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id").notNull().references(() => assetsTable.id, { onDelete: "cascade" }),
    documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("asset_documents_asset_document_unique").on(table.assetId, table.documentId)],
);

// --- Measurement Resources (ISO §7.1.5) ---

export const measurementResourcesTable = pgTable("measurement_resources", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  name: text("name").notNull(),
  identifier: text("identifier"), // tag / serial / patrimônio
  resourceType: text("resource_type").notNull().default("instrumento"), // instrumento | equipamento | padrao
  responsibleId: integer("responsible_id").references(() => employeesTable.id, { onDelete: "set null" }),
  validUntil: date("valid_until"), // validade da calibração
  status: text("status").notNull().default("ativo"), // ativo | inativo | vencido
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MeasurementResource = typeof measurementResourcesTable.$inferSelect;

export const measurementResourceCalibrationsTable = pgTable("measurement_resource_calibrations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  resourceId: integer("resource_id").notNull().references(() => measurementResourcesTable.id, { onDelete: "cascade" }),
  calibratedAt: date("calibrated_at").notNull(),
  calibratedById: integer("calibrated_by_id").references(() => employeesTable.id, { onDelete: "set null" }),
  certificateNumber: text("certificate_number"),
  result: text("result").notNull().default("apto"), // apto | nao-apto
  nextDueAt: date("next_due_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MeasurementResourceCalibration = typeof measurementResourceCalibrationsTable.$inferSelect;

export const measurementResourceAttachmentsTable = pgTable("measurement_resource_attachments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  calibrationId: integer("calibration_id").notNull().references(() => measurementResourceCalibrationsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MeasurementResourceAttachment = typeof measurementResourceAttachmentsTable.$inferSelect;
