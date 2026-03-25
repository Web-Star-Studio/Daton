import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";
import { organizationsTable } from "./organizations";
import { strategicPlanRiskOpportunityItemsTable, strategicPlansTable } from "./strategic-plans";
import { usersTable } from "./users";

export type GovernanceSystemAttachment = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export type SgqProcessStatus = "active" | "inactive";
export type SgqProcessInteractionDirection = "upstream" | "downstream";

export type SgqProcessRevisionSnapshot = {
  name: string;
  objective: string;
  ownerUserId: number | null;
  inputs: string[];
  outputs: string[];
  criteria: string | null;
  indicators: string | null;
  status: SgqProcessStatus;
  attachments: GovernanceSystemAttachment[];
  interactions: Array<{
    relatedProcessId: number;
    direction: SgqProcessInteractionDirection;
    notes: string | null;
  }>;
};

export type InternalAuditOriginType = "internal" | "external_manual";
export type InternalAuditStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "canceled";
export type InternalAuditChecklistResult =
  | "conformity"
  | "nonconformity"
  | "observation"
  | "not_evaluated";
export type InternalAuditFindingClassification =
  | "conformity"
  | "observation"
  | "nonconformity";

export type NonconformityOriginType =
  | "audit_finding"
  | "incident"
  | "document"
  | "process"
  | "risk"
  | "other";
export type NonconformityStatus =
  | "open"
  | "under_analysis"
  | "action_in_progress"
  | "awaiting_effectiveness"
  | "closed"
  | "canceled";
export type NonconformityEffectivenessResult = "effective" | "ineffective";
export type CorrectiveActionStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "canceled";

export type ManagementReviewStatus = "draft" | "completed" | "canceled";
export type ManagementReviewInputType =
  | "policy"
  | "audit_summary"
  | "nc_summary"
  | "objective_status"
  | "risk_status"
  | "process_performance"
  | "customer_feedback"
  | "other";
export type ManagementReviewOutputType =
  | "decision"
  | "action"
  | "resource"
  | "priority";
export type ManagementReviewOutputStatus = "open" | "done" | "canceled";

export const sgqProcessesTable = pgTable(
  "sgq_processes",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    objective: text("objective").notNull(),
    ownerUserId: integer("owner_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    inputs: text("inputs").array().notNull().default([]),
    outputs: text("outputs").array().notNull().default([]),
    criteria: text("criteria"),
    indicators: text("indicators"),
    status: text("status").notNull().default("active").$type<SgqProcessStatus>(),
    currentRevisionNumber: integer("current_revision_number").notNull().default(1),
    attachments: jsonb("attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    updatedById: integer("updated_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("sgq_process_org_name_unique").on(table.organizationId, table.name),
  ],
);

export const sgqProcessInteractionsTable = pgTable(
  "sgq_process_interactions",
  {
    id: serial("id").primaryKey(),
    processId: integer("process_id")
      .notNull()
      .references(() => sgqProcessesTable.id, { onDelete: "cascade" }),
    relatedProcessId: integer("related_process_id")
      .notNull()
      .references(() => sgqProcessesTable.id, { onDelete: "cascade" }),
    direction: text("direction")
      .notNull()
      .$type<SgqProcessInteractionDirection>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("sgq_process_interaction_unique").on(
      table.processId,
      table.relatedProcessId,
      table.direction,
    ),
  ],
);

export const sgqProcessRevisionsTable = pgTable(
  "sgq_process_revisions",
  {
    id: serial("id").primaryKey(),
    processId: integer("process_id")
      .notNull()
      .references(() => sgqProcessesTable.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    changeSummary: text("change_summary"),
    approvedById: integer("approved_by_id")
      .notNull()
      .references(() => usersTable.id),
    snapshot: jsonb("snapshot")
      .$type<SgqProcessRevisionSnapshot>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("sgq_process_revision_number_unique").on(table.processId, table.revisionNumber),
  ],
);

export const sgqCommunicationPlansTable = pgTable("sgq_communication_plans", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  documentId: integer("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  audience: text("audience").notNull(),
  periodicity: text("periodicity").notNull(),
  requiresAcknowledgment: boolean("requires_acknowledgment")
    .notNull()
    .default(false),
  notes: text("notes"),
  lastDistributedAt: timestamp("last_distributed_at", { withTimezone: true }),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  updatedById: integer("updated_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const internalAuditsTable = pgTable("internal_audits", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  scope: text("scope").notNull(),
  criteria: text("criteria").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  auditorUserId: integer("auditor_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  originType: text("origin_type")
    .notNull()
    .default("internal")
    .$type<InternalAuditOriginType>(),
  status: text("status")
    .notNull()
    .default("planned")
    .$type<InternalAuditStatus>(),
  attachments: jsonb("attachments")
    .$type<GovernanceSystemAttachment[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  updatedById: integer("updated_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const internalAuditChecklistItemsTable = pgTable("internal_audit_checklist_items", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id")
    .notNull()
    .references(() => internalAuditsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  requirementRef: text("requirement_ref"),
  result: text("result")
    .notNull()
    .default("not_evaluated")
    .$type<InternalAuditChecklistResult>(),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const internalAuditFindingsTable = pgTable("internal_audit_findings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, {
      onDelete: "cascade",
    }),
  auditId: integer("audit_id")
    .notNull()
    .references(() => internalAuditsTable.id, { onDelete: "cascade" }),
  processId: integer("process_id").references(() => sgqProcessesTable.id, {
    onDelete: "set null",
  }),
  requirementRef: text("requirement_ref"),
  classification: text("classification")
    .notNull()
    .$type<InternalAuditFindingClassification>(),
  description: text("description").notNull(),
  responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  dueDate: date("due_date"),
  attachments: jsonb("attachments")
    .$type<GovernanceSystemAttachment[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  correctiveActionId: integer("corrective_action_id").references(
    (): AnyPgColumn => correctiveActionsTable.id,
    { onDelete: "set null" },
  ),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  updatedById: integer("updated_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const nonconformitiesTable = pgTable("nonconformities", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  originType: text("origin_type")
    .notNull()
    .$type<NonconformityOriginType>(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  classification: text("classification"),
  rootCause: text("root_cause"),
  responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  processId: integer("process_id").references(() => sgqProcessesTable.id, {
    onDelete: "set null",
  }),
  documentId: integer("document_id").references(() => documentsTable.id, {
    onDelete: "set null",
  }),
  riskOpportunityItemId: integer("risk_opportunity_item_id").references(
    () => strategicPlanRiskOpportunityItemsTable.id,
    {
      onDelete: "set null",
    },
  ),
  auditFindingId: integer("audit_finding_id").references(
    (): AnyPgColumn => internalAuditFindingsTable.id,
    { onDelete: "set null" },
  ),
  status: text("status")
    .notNull()
    .default("open")
    .$type<NonconformityStatus>(),
  effectivenessResult: text("effectiveness_result").$type<NonconformityEffectivenessResult>(),
  effectivenessComment: text("effectiveness_comment"),
  effectivenessCheckedAt: timestamp("effectiveness_checked_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  attachments: jsonb("attachments")
    .$type<GovernanceSystemAttachment[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  updatedById: integer("updated_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const correctiveActionsTable = pgTable("corrective_actions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  nonconformityId: integer("nonconformity_id")
    .notNull()
    .references(() => nonconformitiesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  dueDate: date("due_date"),
  status: text("status")
    .notNull()
    .default("pending")
    .$type<CorrectiveActionStatus>(),
  executionNotes: text("execution_notes"),
  attachments: jsonb("attachments")
    .$type<GovernanceSystemAttachment[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  updatedById: integer("updated_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const managementReviewsTable = pgTable("management_reviews", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  reviewDate: date("review_date").notNull(),
  chairUserId: integer("chair_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  minutes: text("minutes"),
  status: text("status")
    .notNull()
    .default("draft")
    .$type<ManagementReviewStatus>(),
  attachments: jsonb("attachments")
    .$type<GovernanceSystemAttachment[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  updatedById: integer("updated_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const managementReviewInputsTable = pgTable("management_review_inputs", {
  id: serial("id").primaryKey(),
  reviewId: integer("review_id")
    .notNull()
    .references(() => managementReviewsTable.id, { onDelete: "cascade" }),
  inputType: text("input_type").notNull().$type<ManagementReviewInputType>(),
  summary: text("summary").notNull(),
  documentId: integer("document_id").references(() => documentsTable.id, {
    onDelete: "set null",
  }),
  auditId: integer("audit_id").references(() => internalAuditsTable.id, {
    onDelete: "set null",
  }),
  nonconformityId: integer("nonconformity_id").references(() => nonconformitiesTable.id, {
    onDelete: "set null",
  }),
  strategicPlanId: integer("strategic_plan_id").references(() => strategicPlansTable.id, {
    onDelete: "set null",
  }),
  processId: integer("process_id").references(() => sgqProcessesTable.id, {
    onDelete: "set null",
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const managementReviewOutputsTable = pgTable("management_review_outputs", {
  id: serial("id").primaryKey(),
  reviewId: integer("review_id")
    .notNull()
    .references(() => managementReviewsTable.id, { onDelete: "cascade" }),
  outputType: text("output_type").notNull().$type<ManagementReviewOutputType>(),
  description: text("description").notNull(),
  responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  dueDate: date("due_date"),
  processId: integer("process_id").references(() => sgqProcessesTable.id, {
    onDelete: "set null",
  }),
  nonconformityId: integer("nonconformity_id").references(() => nonconformitiesTable.id, {
    onDelete: "set null",
  }),
  status: text("status")
    .notNull()
    .default("open")
    .$type<ManagementReviewOutputStatus>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SgqProcess = typeof sgqProcessesTable.$inferSelect;
export type SgqProcessInteraction = typeof sgqProcessInteractionsTable.$inferSelect;
export type SgqProcessRevision = typeof sgqProcessRevisionsTable.$inferSelect;
export type SgqCommunicationPlan = typeof sgqCommunicationPlansTable.$inferSelect;
export type InternalAudit = typeof internalAuditsTable.$inferSelect;
export type InternalAuditChecklistItem =
  typeof internalAuditChecklistItemsTable.$inferSelect;
export type InternalAuditFinding = typeof internalAuditFindingsTable.$inferSelect;
export type Nonconformity = typeof nonconformitiesTable.$inferSelect;
export type CorrectiveAction = typeof correctiveActionsTable.$inferSelect;
export type ManagementReview = typeof managementReviewsTable.$inferSelect;
export type ManagementReviewInput = typeof managementReviewInputsTable.$inferSelect;
export type ManagementReviewOutput = typeof managementReviewOutputsTable.$inferSelect;
