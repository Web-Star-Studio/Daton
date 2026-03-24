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

export type StrategicPlanRiskOpportunityType = "risk" | "opportunity";

export type StrategicPlanRiskOpportunitySourceType =
  | "swot"
  | "audit"
  | "meeting"
  | "legislation"
  | "incident"
  | "internal_strategy"
  | "other";

export type StrategicPlanRiskOpportunityStatus =
  | "identified"
  | "assessed"
  | "responding"
  | "awaiting_effectiveness"
  | "effective"
  | "ineffective"
  | "continuous"
  | "canceled";

export type StrategicPlanRiskOpportunityResponseStrategy =
  | "mitigate"
  | "eliminate"
  | "accept"
  | "monitor"
  | "exploit"
  | "enhance"
  | "share"
  | "avoid"
  | "other";

export type StrategicPlanRiskOpportunityEffectivenessResult =
  | "effective"
  | "ineffective";

export type StrategicPlanReviewerStatus =
  | "pending"
  | "approved"
  | "rejected";

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
  reviewerIds: integer("reviewer_ids").array().notNull().default([]),
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
  riskOpportunityItemId: integer("risk_opportunity_item_id").references(
    () => strategicPlanRiskOpportunityItemsTable.id,
    {
      onDelete: "set null",
    },
  ),
  responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  secondaryResponsibleUserId: integer("secondary_responsible_user_id").references(
    () => usersTable.id,
    {
      onDelete: "set null",
    },
  ),
  dueDate: timestamp("due_date", { withTimezone: true }),
  rescheduledDueDate: timestamp("rescheduled_due_date", { withTimezone: true }),
  rescheduleReason: text("reschedule_reason"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completionNotes: text("completion_notes"),
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

export const strategicPlanRiskOpportunityItemsTable = pgTable(
  "strategic_plan_risk_opportunity_items",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => strategicPlansTable.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<StrategicPlanRiskOpportunityType>(),
    sourceType: text("source_type")
      .notNull()
      .$type<StrategicPlanRiskOpportunitySourceType>(),
    sourceReference: text("source_reference"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    ownerUserId: integer("owner_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    coOwnerUserId: integer("co_owner_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    unitId: integer("unit_id").references(() => unitsTable.id, {
      onDelete: "set null",
    }),
    objectiveId: integer("objective_id").references(() => strategicPlanObjectivesTable.id, {
      onDelete: "set null",
    }),
    swotItemId: integer("swot_item_id").references(() => strategicPlanSwotItemsTable.id, {
      onDelete: "set null",
    }),
    likelihood: integer("likelihood"),
    impact: integer("impact"),
    score: integer("score"),
    responseStrategy: text("response_strategy").$type<StrategicPlanRiskOpportunityResponseStrategy>(),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    status: text("status")
      .notNull()
      .default("identified")
      .$type<StrategicPlanRiskOpportunityStatus>(),
    existingControls: text("existing_controls"),
    expectedEffect: text("expected_effect"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("strategic_plan_risk_opportunity_items_org_id_unique").on(
      table.organizationId,
      table.id,
    ),
  ],
);

export const strategicPlanRiskOpportunityEffectivenessReviewsTable = pgTable(
  "strategic_plan_risk_opportunity_effectiveness_reviews",
  {
    id: serial("id").primaryKey(),
    riskOpportunityItemId: integer("risk_opportunity_item_id")
      .notNull()
      .references(() => strategicPlanRiskOpportunityItemsTable.id, {
        onDelete: "cascade",
      }),
    reviewedById: integer("reviewed_by_id")
      .notNull()
      .references(() => usersTable.id),
    result: text("result")
      .notNull()
      .$type<StrategicPlanRiskOpportunityEffectivenessResult>(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const strategicPlanRevisionsTable = pgTable("strategic_plan_revisions", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => strategicPlansTable.id, { onDelete: "cascade" }),
  reviewCycle: integer("review_cycle").notNull().default(1),
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

export const strategicPlanReviewersTable = pgTable(
  "strategic_plan_reviewers",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => strategicPlansTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    reviewCycle: integer("review_cycle").notNull().default(1),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<StrategicPlanReviewerStatus>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueReviewerPerCycle: unique("strategic_plan_reviewer_cycle_unique").on(
      table.planId,
      table.userId,
      table.reviewCycle,
    ),
  }),
);

export type StrategicPlan = typeof strategicPlansTable.$inferSelect;
export type StrategicPlanSwotItem = typeof strategicPlanSwotItemsTable.$inferSelect;
export type StrategicPlanInterestedParty =
  typeof strategicPlanInterestedPartiesTable.$inferSelect;
export type StrategicPlanObjective = typeof strategicPlanObjectivesTable.$inferSelect;
export type StrategicPlanAction = typeof strategicPlanActionsTable.$inferSelect;
export type StrategicPlanActionUnit = typeof strategicPlanActionUnitsTable.$inferSelect;
export type StrategicPlanRiskOpportunityItem =
  typeof strategicPlanRiskOpportunityItemsTable.$inferSelect;
export type StrategicPlanRiskOpportunityEffectivenessReview =
  typeof strategicPlanRiskOpportunityEffectivenessReviewsTable.$inferSelect;
export type StrategicPlanRevision = typeof strategicPlanRevisionsTable.$inferSelect;
export type StrategicPlanReviewer = typeof strategicPlanReviewersTable.$inferSelect;
