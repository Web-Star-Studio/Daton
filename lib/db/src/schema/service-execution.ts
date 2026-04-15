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
import { documentsTable } from "./documents";
import {
  nonconformitiesTable,
  sgqProcessesTable,
  type GovernanceSystemAttachment,
} from "./governance-system";
import { organizationContactsTable } from "./organization-contacts";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";
import { usersTable } from "./users";

export type ServiceExecutionModelStatus = "active" | "inactive";
export type ServiceExecutionCheckpointKind =
  | "checkpoint"
  | "preventive_control";
export type ServiceExecutionCycleStatus =
  | "in_progress"
  | "awaiting_release"
  | "released"
  | "blocked";
export type ServiceExecutionCheckpointStatus =
  | "pending"
  | "passed"
  | "failed"
  | "waived";
export type ServiceReleaseDecision = "approved" | "blocked";
export type ServiceNonconformingOutputStatus =
  | "open"
  | "in_treatment"
  | "resolved"
  | "closed";
export type ServiceNonconformingOutputDisposition =
  | "blocked"
  | "reworked"
  | "reclassified"
  | "accepted_under_concession"
  | "scrapped";
export type ServiceThirdPartyPropertyStatus =
  | "received"
  | "in_use"
  | "returned"
  | "lost_or_damaged";
export type ServicePostDeliveryEventStatus = "open" | "in_follow_up" | "closed";
export type ServicePostDeliveryEventType =
  | "monitoring"
  | "complaint"
  | "assistance"
  | "adjustment"
  | "feedback"
  | "other";
export type ServiceSpecialValidationStatus =
  | "draft"
  | "valid"
  | "expired"
  | "suspended";
export type ServiceSpecialValidationEventType =
  | "initial_validation"
  | "revalidation";
export type ServiceSpecialValidationResult = "approved" | "rejected";

export const serviceExecutionModelsTable = pgTable(
  "service_execution_models",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    processId: integer("process_id").references(() => sgqProcessesTable.id, {
      onDelete: "set null",
    }),
    unitId: integer("unit_id").references(() => unitsTable.id, {
      onDelete: "set null",
    }),
    requiresSpecialValidation: boolean("requires_special_validation")
      .notNull()
      .default(false),
    status: text("status")
      .notNull()
      .default("active")
      .$type<ServiceExecutionModelStatus>(),
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
    unique("service_execution_models_org_name_unique").on(
      table.organizationId,
      table.name,
    ),
  ],
);

export const serviceExecutionModelCheckpointsTable = pgTable(
  "service_execution_model_checkpoints",
  {
    id: serial("id").primaryKey(),
    modelId: integer("model_id")
      .notNull()
      .references(() => serviceExecutionModelsTable.id, {
        onDelete: "cascade",
      }),
    kind: text("kind")
      .notNull()
      .default("checkpoint")
      .$type<ServiceExecutionCheckpointKind>(),
    label: text("label").notNull(),
    acceptanceCriteria: text("acceptance_criteria"),
    guidance: text("guidance"),
    isRequired: boolean("is_required").notNull().default(true),
    requiresEvidence: boolean("requires_evidence").notNull().default(false),
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

export const serviceExecutionModelDocumentsTable = pgTable(
  "service_execution_model_documents",
  {
    id: serial("id").primaryKey(),
    modelId: integer("model_id")
      .notNull()
      .references(() => serviceExecutionModelsTable.id, {
        onDelete: "cascade",
      }),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("service_execution_model_documents_unique").on(
      table.modelId,
      table.documentId,
    ),
  ],
);

export const serviceExecutionCyclesTable = pgTable("service_execution_cycles", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  modelId: integer("model_id")
    .notNull()
    .references(() => serviceExecutionModelsTable.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  serviceOrderRef: text("service_order_ref"),
  outputIdentifier: text("output_identifier"),
  processId: integer("process_id").references(() => sgqProcessesTable.id, {
    onDelete: "set null",
  }),
  unitId: integer("unit_id").references(() => unitsTable.id, {
    onDelete: "set null",
  }),
  customerContactId: integer("customer_contact_id").references(
    () => organizationContactsTable.id,
    { onDelete: "set null" },
  ),
  status: text("status")
    .notNull()
    .default("in_progress")
    .$type<ServiceExecutionCycleStatus>(),
  openedById: integer("opened_by_id")
    .notNull()
    .references(() => usersTable.id),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const serviceExecutionCycleDocumentsTable = pgTable(
  "service_execution_cycle_documents",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => serviceExecutionCyclesTable.id, {
        onDelete: "cascade",
      }),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("service_execution_cycle_documents_unique").on(
      table.cycleId,
      table.documentId,
    ),
  ],
);

export const serviceExecutionCycleCheckpointsTable = pgTable(
  "service_execution_cycle_checkpoints",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => serviceExecutionCyclesTable.id, {
        onDelete: "cascade",
      }),
    modelCheckpointId: integer("model_checkpoint_id").references(
      () => serviceExecutionModelCheckpointsTable.id,
      { onDelete: "set null" },
    ),
    kind: text("kind")
      .notNull()
      .default("checkpoint")
      .$type<ServiceExecutionCheckpointKind>(),
    label: text("label").notNull(),
    acceptanceCriteria: text("acceptance_criteria"),
    guidance: text("guidance"),
    isRequired: boolean("is_required").notNull().default(true),
    requiresEvidence: boolean("requires_evidence").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<ServiceExecutionCheckpointStatus>(),
    notes: text("notes"),
    evidenceAttachments: jsonb("evidence_attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    checkedById: integer("checked_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const serviceReleaseRecordsTable = pgTable(
  "service_release_records",
  {
    id: serial("id").primaryKey(),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => serviceExecutionCyclesTable.id, {
        onDelete: "cascade",
      }),
    decision: text("decision").notNull().$type<ServiceReleaseDecision>(),
    decisionNotes: text("decision_notes"),
    blockingIssues: text("blocking_issues")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    evidenceAttachments: jsonb("evidence_attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    decidedById: integer("decided_by_id")
      .notNull()
      .references(() => usersTable.id),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("service_release_records_cycle_unique").on(table.cycleId)],
);

export const serviceNonconformingOutputsTable = pgTable(
  "service_nonconforming_outputs",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => serviceExecutionCyclesTable.id, {
        onDelete: "cascade",
      }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    impact: text("impact").notNull().default(""),
    status: text("status")
      .notNull()
      .default("open")
      .$type<ServiceNonconformingOutputStatus>(),
    disposition:
      text("disposition").$type<ServiceNonconformingOutputDisposition>(),
    dispositionNotes: text("disposition_notes"),
    responsibleUserId: integer("responsible_user_id").references(
      () => usersTable.id,
      {
        onDelete: "set null",
      },
    ),
    linkedNonconformityId: integer("linked_nonconformity_id").references(
      () => nonconformitiesTable.id,
      { onDelete: "set null" },
    ),
    evidenceAttachments: jsonb("evidence_attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    detectedById: integer("detected_by_id")
      .notNull()
      .references(() => usersTable.id),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
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

export const serviceThirdPartyPropertiesTable = pgTable(
  "service_third_party_properties",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => serviceExecutionCyclesTable.id, {
        onDelete: "cascade",
      }),
    title: text("title").notNull(),
    ownerName: text("owner_name").notNull(),
    description: text("description"),
    conditionOnReceipt: text("condition_on_receipt"),
    handlingRequirements: text("handling_requirements"),
    status: text("status")
      .notNull()
      .default("received")
      .$type<ServiceThirdPartyPropertyStatus>(),
    responsibleUserId: integer("responsible_user_id").references(
      () => usersTable.id,
      {
        onDelete: "set null",
      },
    ),
    evidenceAttachments: jsonb("evidence_attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    registeredById: integer("registered_by_id")
      .notNull()
      .references(() => usersTable.id),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const servicePreservationDeliveryRecordsTable = pgTable(
  "service_preservation_delivery_records",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => serviceExecutionCyclesTable.id, {
        onDelete: "cascade",
      }),
    preservationNotes: text("preservation_notes"),
    preservationMethod: text("preservation_method"),
    packagingNotes: text("packaging_notes"),
    deliveryNotes: text("delivery_notes"),
    deliveryRecipient: text("delivery_recipient"),
    deliveryMethod: text("delivery_method"),
    deliveredById: integer("delivered_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    preservationEvidenceAttachments: jsonb("preservation_evidence_attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    deliveryEvidenceAttachments: jsonb("delivery_evidence_attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    preservedAt: timestamp("preserved_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
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
    unique("service_preservation_delivery_cycle_unique").on(table.cycleId),
  ],
);

export const servicePostDeliveryEventsTable = pgTable(
  "service_post_delivery_events",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => serviceExecutionCyclesTable.id, {
        onDelete: "cascade",
      }),
    eventType: text("event_type")
      .notNull()
      .default("other")
      .$type<ServicePostDeliveryEventType>(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status")
      .notNull()
      .default("open")
      .$type<ServicePostDeliveryEventStatus>(),
    followUpNotes: text("follow_up_notes"),
    responsibleUserId: integer("responsible_user_id").references(
      () => usersTable.id,
      {
        onDelete: "set null",
      },
    ),
    evidenceAttachments: jsonb("evidence_attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
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

export const serviceSpecialValidationProfilesTable = pgTable(
  "service_special_validation_profiles",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    modelId: integer("model_id")
      .notNull()
      .references(() => serviceExecutionModelsTable.id, {
        onDelete: "cascade",
      }),
    processId: integer("process_id").references(() => sgqProcessesTable.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    criteria: text("criteria").notNull(),
    method: text("method"),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<ServiceSpecialValidationStatus>(),
    responsibleUserId: integer("responsible_user_id").references(
      () => usersTable.id,
      {
        onDelete: "set null",
      },
    ),
    currentValidUntil: timestamp("current_valid_until", { withTimezone: true }),
    notes: text("notes"),
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
    unique("service_special_validation_profile_model_unique").on(table.modelId),
  ],
);

export const serviceSpecialValidationEventsTable = pgTable(
  "service_special_validation_events",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => serviceSpecialValidationProfilesTable.id, {
        onDelete: "cascade",
      }),
    eventType: text("event_type")
      .notNull()
      .default("initial_validation")
      .$type<ServiceSpecialValidationEventType>(),
    result: text("result")
      .notNull()
      .default("approved")
      .$type<ServiceSpecialValidationResult>(),
    criteriaSnapshot: text("criteria_snapshot").notNull(),
    notes: text("notes"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    evidenceAttachments: jsonb("evidence_attachments")
      .$type<GovernanceSystemAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    validatedById: integer("validated_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    validatedAt: timestamp("validated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);
