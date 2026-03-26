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
import { departmentsTable } from "./departments";
import { legislationsTable } from "./legislations";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";
import { usersTable } from "./users";

export type LaiaSurveyStatus =
  | "nao_levantado"
  | "em_levantamento"
  | "levantado";

export type LaiaMethodologyStatus = "draft" | "active" | "archived";
export type LaiaAssessmentMode = "quick" | "complete";
export type LaiaAssessmentStatus =
  | "draft"
  | "active"
  | "archived";
export type LaiaAssessmentCategory =
  | "desprezivel"
  | "moderado"
  | "critico";
export type LaiaSignificance = "significant" | "not_significant";
export type LaiaRequirementType =
  | "legal"
  | "other"
  | "stakeholder"
  | "strategic";
export type LaiaControlLevel = "direct_control" | "influence" | "none";
export type LaiaMonitoringStatus =
  | "draft"
  | "active"
  | "overdue"
  | "completed"
  | "canceled";
export type LaiaMonitoringRecordResult =
  | "within_limit"
  | "out_of_limit"
  | "informational";
export type LaiaRevisionStatus = "draft" | "finalized";
export type LaiaImportJobStatus =
  | "draft"
  | "processing"
  | "completed"
  | "failed";

export interface LaiaReminderFlags {
  d30?: boolean;
  d7?: boolean;
  d0?: boolean;
  staleDraft?: boolean;
  missingResponsible?: boolean;
}

export interface LaiaScoreThresholds {
  negligibleMax: number;
  moderateMax: number;
}

export interface LaiaAssessmentSnapshot {
  aspectCode: string;
  activityOperation: string;
  environmentalAspect: string;
  environmentalImpact: string;
  totalScore: number | null;
  category: LaiaAssessmentCategory | null;
  significance: LaiaSignificance | null;
  methodologyVersionId: number | null;
}

export const laiaBranchConfigsTable = pgTable(
  "laia_branch_configs",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    surveyStatus: text("survey_status")
      .notNull()
      .default("nao_levantado")
      .$type<LaiaSurveyStatus>(),
    createdById: integer("created_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    updatedById: integer("updated_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("laia_branch_config_org_unit_unique").on(
      table.organizationId,
      table.unitId,
    ),
  ],
);

export const laiaSectorsTable = pgTable(
  "laia_sectors",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    unitId: integer("unit_id").references(() => unitsTable.id, {
      onDelete: "set null",
    }),
    departmentId: integer("department_id").references(() => departmentsTable.id, {
      onDelete: "set null",
    }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: integer("created_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    updatedById: integer("updated_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("laia_sector_org_unit_code_unique").on(
      table.organizationId,
      table.unitId,
      table.code,
    ),
  ],
);

export const laiaMethodologiesTable = pgTable("laia_methodologies", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Metodologia LAIA"),
  status: text("status")
    .notNull()
    .default("active")
    .$type<LaiaMethodologyStatus>(),
  activeVersionId: integer("active_version_id"),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  updatedById: integer("updated_by_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const laiaMethodologyVersionsTable = pgTable(
  "laia_methodology_versions",
  {
    id: serial("id").primaryKey(),
    methodologyId: integer("methodology_id")
      .notNull()
      .references(() => laiaMethodologiesTable.id, { onDelete: "cascade" }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    consequenceMatrix: jsonb("consequence_matrix").notNull(),
    frequencyProbabilityMatrix: jsonb("frequency_probability_matrix").notNull(),
    scoreThresholds: jsonb("score_thresholds")
      .$type<LaiaScoreThresholds>()
      .notNull(),
    moderateSignificanceRule: text("moderate_significance_rule").notNull(),
    notes: text("notes"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("laia_methodology_version_unique").on(
      table.methodologyId,
      table.versionNumber,
    ),
  ],
);

export const laiaAssessmentsTable = pgTable(
  "laia_assessments",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    unitId: integer("unit_id").references(() => unitsTable.id, {
      onDelete: "set null",
    }),
    sectorId: integer("sector_id").references(() => laiaSectorsTable.id, {
      onDelete: "set null",
    }),
    methodologyVersionId: integer("methodology_version_id").references(
      () => laiaMethodologyVersionsTable.id,
      {
        onDelete: "set null",
      },
    ),
    aspectCode: text("aspect_code").notNull(),
    mode: text("mode").notNull().default("quick").$type<LaiaAssessmentMode>(),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<LaiaAssessmentStatus>(),
    activityOperation: text("activity_operation").notNull(),
    environmentalAspect: text("environmental_aspect").notNull(),
    environmentalImpact: text("environmental_impact").notNull(),
    temporality: text("temporality"),
    operationalSituation: text("operational_situation"),
    incidence: text("incidence"),
    impactClass: text("impact_class"),
    scope: text("scope"),
    severity: text("severity"),
    consequenceScore: integer("consequence_score"),
    frequencyProbability: text("frequency_probability"),
    frequencyProbabilityScore: integer("frequency_probability_score"),
    totalScore: integer("total_score"),
    category: text("category").$type<LaiaAssessmentCategory>(),
    significance: text("significance").$type<LaiaSignificance>(),
    significanceReason: text("significance_reason"),
    hasLegalRequirements: boolean("has_legal_requirements")
      .notNull()
      .default(false),
    hasStakeholderDemand: boolean("has_stakeholder_demand")
      .notNull()
      .default(false),
    hasStrategicOption: boolean("has_strategic_option")
      .notNull()
      .default(false),
    normalCondition: boolean("normal_condition").notNull().default(true),
    abnormalCondition: boolean("abnormal_condition").notNull().default(false),
    startupShutdown: boolean("startup_shutdown").notNull().default(false),
    emergencyScenario: text("emergency_scenario"),
    changeContext: text("change_context"),
    lifecycleStages: text("lifecycle_stages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    controlLevel: text("control_level")
      .notNull()
      .default("direct_control")
      .$type<LaiaControlLevel>(),
    influenceLevel: text("influence_level"),
    outsourcedProcess: text("outsourced_process"),
    supplierReference: text("supplier_reference"),
    controlTypes: text("control_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    existingControls: text("existing_controls"),
    controlRequired: text("control_required"),
    controlResponsibleUserId: integer("control_responsible_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    controlDueAt: timestamp("control_due_at", { withTimezone: true }),
    communicationRequired: boolean("communication_required")
      .notNull()
      .default(false),
    communicationNotes: text("communication_notes"),
    reviewFrequencyDays: integer("review_frequency_days"),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    reviewReminderFlags: jsonb("review_reminder_flags")
      .$type<LaiaReminderFlags>()
      .notNull()
      .default({}),
    draftReminderSentAt: timestamp("draft_reminder_sent_at", {
      withTimezone: true,
    }),
    notes: text("notes"),
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
    unique("laia_assessment_org_code_unique").on(
      table.organizationId,
      table.aspectCode,
    ),
  ],
);

export const laiaRequirementLinksTable = pgTable("laia_requirement_links", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id")
    .notNull()
    .references(() => laiaAssessmentsTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<LaiaRequirementType>(),
  legislationId: integer("legislation_id").references(() => legislationsTable.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  requirementReference: text("requirement_reference"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface LaiaMonitoringEvidence {
  fileName: string;
  objectPath: string;
  contentType?: string;
}

export const laiaMonitoringPlansTable = pgTable("laia_monitoring_plans", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  assessmentId: integer("assessment_id")
    .notNull()
    .references(() => laiaAssessmentsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  method: text("method").notNull(),
  indicator: text("indicator"),
  frequency: text("frequency").notNull(),
  delayCriteria: text("delay_criteria"),
  responsibleUserId: integer("responsible_user_id").references(
    () => usersTable.id,
    { onDelete: "set null" },
  ),
  status: text("status")
    .notNull()
    .default("draft")
    .$type<LaiaMonitoringStatus>(),
  nextDueAt: timestamp("next_due_at", { withTimezone: true }),
  lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
  reminderFlags: jsonb("reminder_flags")
    .$type<LaiaReminderFlags>()
    .notNull()
    .default({}),
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

export const laiaMonitoringRecordsTable = pgTable("laia_monitoring_records", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => laiaMonitoringPlansTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
  result: text("result")
    .notNull()
    .default("informational")
    .$type<LaiaMonitoringRecordResult>(),
  measuredValue: text("measured_value"),
  notes: text("notes"),
  evidence: jsonb("evidence")
    .$type<LaiaMonitoringEvidence[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const laiaRevisionsTable = pgTable("laia_revisions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  assessmentId: integer("assessment_id").references(() => laiaAssessmentsTable.id, {
    onDelete: "set null",
  }),
  title: text("title"),
  description: text("description"),
  revisionNumber: integer("revision_number").notNull(),
  status: text("status").notNull().default("draft").$type<LaiaRevisionStatus>(),
  snapshot: jsonb("snapshot").$type<LaiaAssessmentSnapshot>(),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  finalizedById: integer("finalized_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
});

export const laiaRevisionChangesTable = pgTable("laia_revision_changes", {
  id: serial("id").primaryKey(),
  revisionId: integer("revision_id")
    .notNull()
    .references(() => laiaRevisionsTable.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const laiaImportJobsTable = pgTable("laia_import_jobs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").references(() => unitsTable.id, {
    onDelete: "set null",
  }),
  workbookName: text("workbook_name"),
  status: text("status")
    .notNull()
    .default("draft")
    .$type<LaiaImportJobStatus>(),
  summary: jsonb("summary").notNull().default(sql`'{}'::jsonb`),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
