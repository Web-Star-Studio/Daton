import { sql } from "drizzle-orm";
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
import type { GovernanceSystemAttachment } from "./governance-system";
import { sgqProcessesTable } from "./governance-system";
import { documentsTable } from "./documents";
import { employeesTable } from "./employees";
import { organizationsTable } from "./organizations";
import { strategicPlanRiskOpportunityItemsTable } from "./strategic-plans";
import { unitsTable } from "./units";
import { usersTable } from "./users";

export type OperationalPlanStatus = "draft" | "active" | "archived";
export type OperationalReadinessStatus = "pending" | "ok" | "failed" | "waived";
export type OperationalCycleStatus =
  | "planned"
  | "ready"
  | "in_execution"
  | "completed"
  | "blocked"
  | "canceled";
export type OperationalChangeImpactLevel = "low" | "medium" | "high" | "critical";
export type OperationalChangeDecision = "pending" | "approved" | "rejected";

export type OperationalPlanRevisionSnapshot = {
  title: string;
  planCode: string | null;
  processId: number | null;
  unitId: number | null;
  responsibleId: number | null;
  serviceType: string | null;
  scope: string | null;
  sequenceDescription: string | null;
  executionCriteria: string | null;
  requiredResources: string[];
  inputs: string[];
  outputs: string[];
  esgConsiderations: string | null;
  readinessBlockingEnabled: boolean;
  status: OperationalPlanStatus;
  documentIds: number[];
  riskOpportunityItemIds: number[];
  checklistItems: Array<{
    title: string;
    instructions: string | null;
    isCritical: boolean;
    sortOrder: number;
  }>;
};

export const operationalPlansTable = pgTable(
  "operational_plans",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    planCode: text("plan_code"),
    processId: integer("process_id").references(() => sgqProcessesTable.id, {
      onDelete: "set null",
    }),
    unitId: integer("unit_id").references(() => unitsTable.id, {
      onDelete: "set null",
    }),
    responsibleId: integer("responsible_id").references(() => employeesTable.id, {
      onDelete: "set null",
    }),
    serviceType: text("service_type"),
    scope: text("scope"),
    sequenceDescription: text("sequence_description"),
    executionCriteria: text("execution_criteria"),
    requiredResources: text("required_resources").array().notNull().default([]),
    inputs: text("inputs").array().notNull().default([]),
    outputs: text("outputs").array().notNull().default([]),
    esgConsiderations: text("esg_considerations"),
    readinessBlockingEnabled: boolean("readiness_blocking_enabled")
      .notNull()
      .default(true),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<OperationalPlanStatus>(),
    currentRevisionNumber: integer("current_revision_number").notNull().default(1),
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
    unique("operational_plan_org_title_unique").on(
      table.organizationId,
      table.title,
    ),
  ],
);

export const operationalPlanDocumentsTable = pgTable(
  "operational_plan_documents",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => operationalPlansTable.id, { onDelete: "cascade" }),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("operational_plan_document_unique").on(table.planId, table.documentId),
  ],
);

export const operationalPlanRiskLinksTable = pgTable(
  "operational_plan_risk_links",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => operationalPlansTable.id, { onDelete: "cascade" }),
    riskOpportunityItemId: integer("risk_opportunity_item_id")
      .notNull()
      .references(() => strategicPlanRiskOpportunityItemsTable.id, {
        onDelete: "cascade",
      }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("operational_plan_risk_link_unique").on(
      table.planId,
      table.riskOpportunityItemId,
    ),
  ],
);

export const operationalReadinessChecklistsTable = pgTable(
  "operational_readiness_checklists",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => operationalPlansTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    instructions: text("instructions"),
    isCritical: boolean("is_critical").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const operationalPlanRevisionsTable = pgTable(
  "operational_plan_revisions",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => operationalPlansTable.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    changeSummary: text("change_summary"),
    changedById: integer("changed_by_id")
      .notNull()
      .references(() => usersTable.id),
    snapshot: jsonb("snapshot")
      .$type<OperationalPlanRevisionSnapshot>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("operational_plan_revision_number_unique").on(
      table.planId,
      table.revisionNumber,
    ),
  ],
);

export const operationalCycleEvidencesTable = pgTable(
  "operational_cycle_evidences",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => operationalPlansTable.id, { onDelete: "cascade" }),
    cycleCode: text("cycle_code").notNull(),
    cycleDate: timestamp("cycle_date", { withTimezone: true }),
    status: text("status")
      .notNull()
      .default("planned")
      .$type<OperationalCycleStatus>(),
    evidenceSummary: text("evidence_summary"),
    externalReference: text("external_reference"),
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
    unique("operational_cycle_code_unique").on(
      table.planId,
      table.cycleCode,
    ),
  ],
);

export const operationalReadinessExecutionsTable = pgTable(
  "operational_readiness_executions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    cycleEvidenceId: integer("cycle_evidence_id")
      .notNull()
      .references(() => operationalCycleEvidencesTable.id, { onDelete: "cascade" }),
    checklistItemId: integer("checklist_item_id")
      .notNull()
      .references(() => operationalReadinessChecklistsTable.id, {
        onDelete: "cascade",
      }),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<OperationalReadinessStatus>(),
    executedById: integer("executed_by_id").references(() => employeesTable.id, {
      onDelete: "set null",
    }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    evidenceNote: text("evidence_note"),
    attachments: jsonb("attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("operational_readiness_execution_unique").on(
      table.cycleEvidenceId,
      table.checklistItemId,
    ),
  ],
);

export const operationalChangesTable = pgTable("operational_changes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id")
    .notNull()
    .references(() => operationalPlansTable.id, { onDelete: "cascade" }),
  cycleEvidenceId: integer("cycle_evidence_id").references(
    () => operationalCycleEvidencesTable.id,
    { onDelete: "set null" },
  ),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  impactLevel: text("impact_level")
    .notNull()
    .default("medium")
    .$type<OperationalChangeImpactLevel>(),
  impactDescription: text("impact_description"),
  mitigationAction: text("mitigation_action"),
  decision: text("decision")
    .notNull()
    .default("pending")
    .$type<OperationalChangeDecision>(),
  requestedById: integer("requested_by_id")
    .notNull()
    .references(() => usersTable.id),
  approvedById: integer("approved_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const operationalChangeRiskLinksTable = pgTable(
  "operational_change_risk_links",
  {
    id: serial("id").primaryKey(),
    changeId: integer("change_id")
      .notNull()
      .references(() => operationalChangesTable.id, { onDelete: "cascade" }),
    riskOpportunityItemId: integer("risk_opportunity_item_id")
      .notNull()
      .references(() => strategicPlanRiskOpportunityItemsTable.id, {
        onDelete: "cascade",
      }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("operational_change_risk_link_unique").on(
      table.changeId,
      table.riskOpportunityItemId,
    ),
  ],
);

export type OperationalPlan = typeof operationalPlansTable.$inferSelect;
export type OperationalPlanDocument = typeof operationalPlanDocumentsTable.$inferSelect;
export type OperationalPlanRiskLink = typeof operationalPlanRiskLinksTable.$inferSelect;
export type OperationalReadinessChecklist =
  typeof operationalReadinessChecklistsTable.$inferSelect;
export type OperationalPlanRevision = typeof operationalPlanRevisionsTable.$inferSelect;
export type OperationalCycleEvidence = typeof operationalCycleEvidencesTable.$inferSelect;
export type OperationalReadinessExecution =
  typeof operationalReadinessExecutionsTable.$inferSelect;
export type OperationalChange = typeof operationalChangesTable.$inferSelect;
export type OperationalChangeRiskLink =
  typeof operationalChangeRiskLinksTable.$inferSelect;
