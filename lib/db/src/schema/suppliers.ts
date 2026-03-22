import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";
import { usersTable } from "./users";

export type SupplierAttachment = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export type SupplierCriteriaSnapshot = {
  requirementId: number;
  requirementName: string;
  weight: number;
  status: string;
  adequacy: string | null;
};

export type SupplierApprovedOfferingSnapshot = {
  offeringId: number;
  name: string;
  offeringType: "product" | "service";
};

export const supplierCategoriesTable = pgTable("supplier_categories", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("supplier_category_org_name_unique").on(table.organizationId, table.name),
]);

export const supplierTypesTable = pgTable("supplier_types", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  categoryId: integer("category_id").references(() => supplierCategoriesTable.id, { onDelete: "set null" }),
  parentTypeId: integer("parent_type_id").references((): AnyPgColumn => supplierTypesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("supplier_type_org_name_unique").on(table.organizationId, table.name),
]);

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  categoryId: integer("category_id").references(() => supplierCategoriesTable.id, { onDelete: "set null" }),
  personType: text("person_type").notNull().default("pj"),
  legalIdentifier: text("legal_identifier").notNull(),
  legalName: text("legal_name").notNull(),
  tradeName: text("trade_name"),
  stateRegistration: text("state_registration"),
  municipalRegistration: text("municipal_registration"),
  rg: text("rg"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  postalCode: text("postal_code"),
  street: text("street"),
  streetNumber: text("street_number"),
  complement: text("complement"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  state: text("state"),
  status: text("status").notNull().default("draft"),
  criticality: text("criticality").notNull().default("medium"),
  notes: text("notes"),
  documentCompliancePercentage: integer("document_compliance_percentage"),
  documentReviewStatus: text("document_review_status"),
  documentReviewNextDate: date("document_review_next_date"),
  lastQualifiedAt: timestamp("last_qualified_at", { withTimezone: true }),
  qualifiedUntil: date("qualified_until"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("supplier_org_identifier_unique").on(table.organizationId, table.legalIdentifier),
]);

export const supplierUnitsTable = pgTable("supplier_units", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("supplier_unit_unique").on(table.supplierId, table.unitId),
]);

export const supplierTypeLinksTable = pgTable("supplier_type_links", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  typeId: integer("type_id").notNull().references(() => supplierTypesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("supplier_type_link_unique").on(table.supplierId, table.typeId),
]);

export const supplierOfferingsTable = pgTable("supplier_offerings", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  offeringType: text("offering_type").notNull().default("service"),
  unitOfMeasure: text("unit_of_measure"),
  description: text("description"),
  status: text("status").notNull().default("active"),
  isApprovedScope: integer("is_approved_scope").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const supplierDocumentRequirementsTable = pgTable("supplier_document_requirements", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  categoryId: integer("category_id").references(() => supplierCategoriesTable.id, { onDelete: "set null" }),
  typeId: integer("type_id").references(() => supplierTypesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  weight: integer("weight").notNull().default(1),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const supplierDocumentSubmissionsTable = pgTable("supplier_document_submissions", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  requirementId: integer("requirement_id").notNull().references(() => supplierDocumentRequirementsTable.id, { onDelete: "cascade" }),
  submissionStatus: text("submission_status").notNull().default("pending"),
  adequacyStatus: text("adequacy_status").notNull().default("under_review"),
  validityDate: date("validity_date"),
  exemptionReason: text("exemption_reason"),
  rejectionReason: text("rejection_reason"),
  observations: text("observations"),
  attachments: jsonb("attachments").$type<SupplierAttachment[]>().notNull().default(sql`'[]'::jsonb`),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("supplier_document_submission_unique").on(table.supplierId, table.requirementId),
]);

export const supplierDocumentReviewsTable = pgTable("supplier_document_reviews", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  compliancePercentage: integer("compliance_percentage").notNull(),
  threshold: integer("threshold").notNull().default(80),
  result: text("result").notNull(),
  nextReviewDate: date("next_review_date"),
  criteriaSnapshot: jsonb("criteria_snapshot").$type<SupplierCriteriaSnapshot[]>().notNull().default(sql`'[]'::jsonb`),
  observations: text("observations"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supplierRequirementTemplatesTable = pgTable("supplier_requirement_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  categoryId: integer("category_id").references(() => supplierCategoriesTable.id, { onDelete: "set null" }),
  typeId: integer("type_id").references(() => supplierTypesTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  content: text("content").notNull(),
  changeSummary: text("change_summary"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const supplierRequirementCommunicationsTable = pgTable("supplier_requirement_communications", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  templateId: integer("template_id").notNull().references(() => supplierRequirementTemplatesTable.id, { onDelete: "cascade" }),
  communicatedById: integer("communicated_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("linked"),
  notes: text("notes"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("supplier_requirement_communication_unique").on(table.supplierId, table.templateId),
]);

export const supplierQualificationReviewsTable = pgTable("supplier_qualification_reviews", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  decision: text("decision").notNull(),
  validUntil: date("valid_until"),
  notes: text("notes"),
  attachments: jsonb("attachments").$type<SupplierAttachment[]>().notNull().default(sql`'[]'::jsonb`),
  approvedOfferings: jsonb("approved_offerings").$type<SupplierApprovedOfferingSnapshot[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supplierPerformanceReviewsTable = pgTable("supplier_performance_reviews", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  offeringId: integer("offering_id").references(() => supplierOfferingsTable.id, { onDelete: "set null" }),
  evaluatedById: integer("evaluated_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  qualityScore: integer("quality_score").notNull(),
  deliveryScore: integer("delivery_score").notNull(),
  communicationScore: integer("communication_score").notNull(),
  complianceScore: integer("compliance_score").notNull(),
  priceScore: integer("price_score"),
  finalScore: integer("final_score").notNull(),
  riskLevel: text("risk_level").notNull().default("medium"),
  conclusion: text("conclusion").notNull(),
  observations: text("observations"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supplierReceiptChecksTable = pgTable("supplier_receipt_checks", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  offeringId: integer("offering_id").references(() => supplierOfferingsTable.id, { onDelete: "set null" }),
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  checkedById: integer("checked_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  authorizedById: integer("authorized_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  receiptDate: date("receipt_date").notNull(),
  description: text("description").notNull(),
  referenceNumber: text("reference_number"),
  quantity: text("quantity"),
  totalValue: integer("total_value"),
  outcome: text("outcome").notNull(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  notes: text("notes"),
  nonConformityStatus: text("non_conformity_status").notNull().default("not_required"),
  nonConformitySummary: text("non_conformity_summary"),
  attachments: jsonb("attachments").$type<SupplierAttachment[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supplierFailuresTable = pgTable("supplier_failures", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  performanceReviewId: integer("performance_review_id").references(() => supplierPerformanceReviewsTable.id, { onDelete: "set null" }),
  receiptCheckId: integer("receipt_check_id").references(() => supplierReceiptChecksTable.id, { onDelete: "set null" }),
  failureType: text("failure_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupplierCategorySchema = createInsertSchema(supplierCategoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupplierTypeSchema = createInsertSchema(supplierTypesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupplierOfferingSchema = createInsertSchema(supplierOfferingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupplierDocumentRequirementSchema = createInsertSchema(supplierDocumentRequirementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupplierDocumentSubmissionSchema = createInsertSchema(supplierDocumentSubmissionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupplierDocumentReviewSchema = createInsertSchema(supplierDocumentReviewsTable).omit({ id: true, createdAt: true });
export const insertSupplierRequirementTemplateSchema = createInsertSchema(supplierRequirementTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupplierRequirementCommunicationSchema = createInsertSchema(supplierRequirementCommunicationsTable).omit({ id: true, createdAt: true });
export const insertSupplierQualificationReviewSchema = createInsertSchema(supplierQualificationReviewsTable).omit({ id: true, createdAt: true });
export const insertSupplierPerformanceReviewSchema = createInsertSchema(supplierPerformanceReviewsTable).omit({ id: true, createdAt: true });
export const insertSupplierReceiptCheckSchema = createInsertSchema(supplierReceiptChecksTable).omit({ id: true, createdAt: true });
export const insertSupplierFailureSchema = createInsertSchema(supplierFailuresTable).omit({ id: true, createdAt: true, occurredAt: true });

export type Supplier = typeof suppliersTable.$inferSelect;
export type SupplierCategory = typeof supplierCategoriesTable.$inferSelect;
export type SupplierType = typeof supplierTypesTable.$inferSelect;
export type SupplierOffering = typeof supplierOfferingsTable.$inferSelect;
export type SupplierDocumentRequirement = typeof supplierDocumentRequirementsTable.$inferSelect;
export type SupplierDocumentSubmission = typeof supplierDocumentSubmissionsTable.$inferSelect;
export type SupplierDocumentReview = typeof supplierDocumentReviewsTable.$inferSelect;
export type SupplierRequirementTemplate = typeof supplierRequirementTemplatesTable.$inferSelect;
export type SupplierRequirementCommunication = typeof supplierRequirementCommunicationsTable.$inferSelect;
export type SupplierQualificationReview = typeof supplierQualificationReviewsTable.$inferSelect;
export type SupplierPerformanceReview = typeof supplierPerformanceReviewsTable.$inferSelect;
export type SupplierReceiptCheck = typeof supplierReceiptChecksTable.$inferSelect;
export type SupplierFailure = typeof supplierFailuresTable.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
