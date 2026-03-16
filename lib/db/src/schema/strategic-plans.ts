import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";
import { documentsTable } from "./documents";
import { unitsTable } from "./units";

export type StrategicPlanStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "overdue"
  | "archived";

export type StrategicPlanDomain =
  | "sgq"
  | "sga"
  | "sgsv"
  | "esg"
  | "governance";

export type StrategicPlanSwotType =
  | "strength"
  | "weakness"
  | "opportunity"
  | "threat";

export type StrategicPlanSwotEnvironment = "internal" | "external";

export type StrategicPlanActionStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "canceled";

export interface StrategicPlanReminderFlags {
  d30?: boolean;
  d7?: boolean;
  d0?: boolean;
}

export interface StrategicPlanLegacyRevisionEntry {
  date?: string | null;
  reason?: string | null;
  changedItem?: string | null;
  revision?: string | null;
  changedBy?: string | null;
}

export const strategicPlansTable = pgTable("strategic_plans", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft").$type<StrategicPlanStatus>(),
  standards: text("standards").array().notNull().default(["ISO 9001:2015"]),
  executiveSummary: text("executive_summary"),
  reviewFrequencyMonths: integer("review_frequency_months").notNull().default(12),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
  reviewReason: text("review_reason"),
  climateChangeRelevant: boolean("climate_change_relevant"),
  climateChangeJustification: text("climate_change_justification"),
  technicalScope: text("technical_scope"),
  geographicScope: text("geographic_scope"),
  policy: text("policy"),
  mission: text("mission"),
  vision: text("vision"),
  values: text("values"),
  strategicConclusion: text("strategic_conclusion"),
  methodologyNotes: text("methodology_notes"),
  legacyMethodology: text("legacy_methodology"),
  legacyIndicatorsNotes: text("legacy_indicators_notes"),
  legacyRevisionHistory:
    jsonb("legacy_revision_history").$type<StrategicPlanLegacyRevisionEntry[]>(),
  reminderFlags: jsonb("reminder_flags")
    .$type<StrategicPlanReminderFlags>()
    .notNull()
    .default({}),
  activeRevisionNumber: integer("active_revision_number").notNull().default(0),
  importedWorkbookName: text("imported_workbook_name"),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  updatedById: integer("updated_by_id")
    .notNull()
    .references(() => usersTable.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const strategicPlanSwotItemsTable = pgTable("strategic_plan_swot_items", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => strategicPlansTable.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().$type<StrategicPlanDomain>(),
  matrixLabel: text("matrix_label"),
  swotType: text("swot_type").notNull().$type<StrategicPlanSwotType>(),
  environment: text("environment")
    .notNull()
    .$type<StrategicPlanSwotEnvironment>(),
  perspective: text("perspective"),
  description: text("description").notNull(),
  performance: integer("performance"),
  relevance: integer("relevance"),
  result: integer("result"),
  treatmentDecision: text("treatment_decision"),
  linkedObjectiveCode: text("linked_objective_code"),
  linkedObjectiveLabel: text("linked_objective_label"),
  importedActionReference: text("imported_action_reference"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const strategicPlanInterestedPartiesTable = pgTable(
  "strategic_plan_interested_parties",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => strategicPlansTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    expectedRequirements: text("expected_requirements"),
    roleInCompany: text("role_in_company"),
    roleSummary: text("role_summary"),
    relevantToManagementSystem: boolean("relevant_to_management_system"),
    legalRequirementApplicable: boolean("legal_requirement_applicable"),
    monitoringMethod: text("monitoring_method"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const strategicPlanObjectivesTable = pgTable("strategic_plan_objectives", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => strategicPlansTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  systemDomain: text("system_domain"),
  description: text("description").notNull(),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const strategicPlanActionsTable = pgTable("strategic_plan_actions", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => strategicPlansTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  swotItemId: integer("swot_item_id").references(() => strategicPlanSwotItemsTable.id, {
    onDelete: "set null",
  }),
  objectiveId: integer("objective_id").references(() => strategicPlanObjectivesTable.id, {
    onDelete: "set null",
  }),
  responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status").notNull().default("pending").$type<StrategicPlanActionStatus>(),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const strategicPlanActionUnitsTable = pgTable(
  "strategic_plan_action_units",
  {
    id: serial("id").primaryKey(),
    actionId: integer("action_id")
      .notNull()
      .references(() => strategicPlanActionsTable.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("strategic_plan_action_unit_unique").on(table.actionId, table.unitId)],
);

export const strategicPlanRevisionsTable = pgTable("strategic_plan_revisions", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => strategicPlansTable.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  revisionDate: timestamp("revision_date", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason"),
  changeSummary: text("change_summary"),
  approvedById: integer("approved_by_id")
    .notNull()
    .references(() => usersTable.id),
  evidenceDocumentId: integer("evidence_document_id").references(() => documentsTable.id, {
    onDelete: "set null",
  }),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StrategicPlan = typeof strategicPlansTable.$inferSelect;
export type StrategicPlanSwotItem = typeof strategicPlanSwotItemsTable.$inferSelect;
export type StrategicPlanInterestedParty =
  typeof strategicPlanInterestedPartiesTable.$inferSelect;
export type StrategicPlanObjective = typeof strategicPlanObjectivesTable.$inferSelect;
export type StrategicPlanAction = typeof strategicPlanActionsTable.$inferSelect;
export type StrategicPlanActionUnit = typeof strategicPlanActionUnitsTable.$inferSelect;
export type StrategicPlanRevision = typeof strategicPlanRevisionsTable.$inferSelect;
