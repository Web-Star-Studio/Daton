import { sql } from "drizzle-orm";
import {
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
import type { GovernanceSystemAttachment } from "./governance-system";
import { employeesTable } from "./employees";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export type RequirementApplicabilityStatus =
  | "pending"
  | "approved"
  | "superseded";

export type DevelopmentProjectStatus =
  | "draft"
  | "active"
  | "under_review"
  | "completed"
  | "canceled";

export type DevelopmentProjectStageStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "blocked"
  | "canceled";

export type DevelopmentProjectOutputStatus = "draft" | "approved" | "released";

export type DevelopmentProjectReviewType =
  | "review"
  | "verification"
  | "validation";

export type DevelopmentProjectReviewOutcome =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_changes";

export type DevelopmentProjectChangeStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "implemented";

export const requirementApplicabilityDecisionsTable = pgTable(
  "requirement_applicability_decisions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    requirementCode: text("requirement_code").notNull().default("8.3"),
    isApplicable: boolean("is_applicable").notNull(),
    scopeSummary: text("scope_summary"),
    justification: text("justification").notNull(),
    responsibleEmployeeId: integer("responsible_employee_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    approvalStatus: text("approval_status")
      .notNull()
      .default("pending")
      .$type<RequirementApplicabilityStatus>(),
    approvedById: integer("approved_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    updatedById: integer("updated_by_id")
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
);

export const developmentProjectsTable = pgTable(
  "development_projects",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    applicabilityDecisionId: integer("applicability_decision_id").references(
      () => requirementApplicabilityDecisionsTable.id,
      { onDelete: "set null" },
    ),
    projectCode: text("project_code"),
    title: text("title").notNull(),
    scope: text("scope").notNull(),
    objective: text("objective"),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<DevelopmentProjectStatus>(),
    responsibleEmployeeId: integer("responsible_employee_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    plannedStartDate: date("planned_start_date"),
    plannedEndDate: date("planned_end_date"),
    actualEndDate: date("actual_end_date"),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("development_project_org_title_unique").on(
      table.organizationId,
      table.title,
    ),
  ],
);

export const developmentProjectInputsTable = pgTable(
  "development_project_inputs",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => developmentProjectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    source: text("source"),
    attachments: jsonb("attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const developmentProjectStagesTable = pgTable(
  "development_project_stages",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => developmentProjectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    responsibleEmployeeId: integer("responsible_employee_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    status: text("status")
      .notNull()
      .default("planned")
      .$type<DevelopmentProjectStageStatus>(),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    evidenceNote: text("evidence_note"),
    attachments: jsonb("attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const developmentProjectOutputsTable = pgTable(
  "development_project_outputs",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => developmentProjectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    outputType: text("output_type").notNull().default("other"),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<DevelopmentProjectOutputStatus>(),
    attachments: jsonb("attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const developmentProjectReviewsTable = pgTable(
  "development_project_reviews",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => developmentProjectsTable.id, { onDelete: "cascade" }),
    reviewType: text("review_type")
      .notNull()
      .$type<DevelopmentProjectReviewType>(),
    title: text("title").notNull(),
    notes: text("notes"),
    outcome: text("outcome")
      .notNull()
      .default("pending")
      .$type<DevelopmentProjectReviewOutcome>(),
    responsibleEmployeeId: integer("responsible_employee_id").references(
      () => employeesTable.id,
      { onDelete: "set null" },
    ),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    attachments: jsonb("attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const developmentProjectChangesTable = pgTable(
  "development_project_changes",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => developmentProjectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    changeDescription: text("change_description").notNull(),
    reason: text("reason").notNull(),
    impactDescription: text("impact_description"),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<DevelopmentProjectChangeStatus>(),
    decidedById: integer("decided_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);
