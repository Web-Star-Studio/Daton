import { sql } from "drizzle-orm";
import {
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
import { sgqProcessesTable } from "./governance-system";
import { unitsTable } from "./units";
import { usersTable } from "./users";

export type CustomerAttachment = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export type CustomerRequirementSnapshot = {
  unitId: number | null;
  processId: number | null;
  responsibleUserId: number | null;
  serviceType: string;
  title: string;
  description: string;
  source: string | null;
  status: string;
  currentVersion: number;
};

export const customersTable = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    personType: text("person_type").notNull().default("pj"),
    legalIdentifier: text("legal_identifier").notNull(),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    responsibleName: text("responsible_name"),
    email: text("email"),
    phone: text("phone"),
    status: text("status").notNull().default("active"),
    criticality: text("criticality").notNull().default("medium"),
    notes: text("notes"),
    createdById: integer("created_by_id")
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
    unique("customer_org_identifier_unique").on(
      table.organizationId,
      table.legalIdentifier,
    ),
  ],
);

export const customerRequirementsTable = pgTable("customer_requirements", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customersTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").references(() => unitsTable.id, {
    onDelete: "set null",
  }),
  processId: integer("process_id").references(() => sgqProcessesTable.id, {
    onDelete: "set null",
  }),
  responsibleUserId: integer("responsible_user_id").references(
    () => usersTable.id,
    { onDelete: "set null" },
  ),
  serviceType: text("service_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source"),
  status: text("status").notNull().default("draft"),
  currentVersion: integer("current_version").notNull().default(1),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
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
});

export const customerRequirementReviewsTable = pgTable(
  "customer_requirement_reviews",
  {
    id: serial("id").primaryKey(),
    requirementId: integer("requirement_id")
      .notNull()
      .references(() => customerRequirementsTable.id, { onDelete: "cascade" }),
    reviewedById: integer("reviewed_by_id")
      .notNull()
      .references(() => usersTable.id),
    decision: text("decision").notNull(),
    capacityAnalysis: text("capacity_analysis").notNull(),
    restrictions: text("restrictions"),
    justification: text("justification"),
    decisionDate: timestamp("decision_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    attachments: jsonb("attachments")
      .$type<CustomerAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const customerRequirementHistoryTable = pgTable(
  "customer_requirement_history",
  {
    id: serial("id").primaryKey(),
    requirementId: integer("requirement_id")
      .notNull()
      .references(() => customerRequirementsTable.id, { onDelete: "cascade" }),
    changedById: integer("changed_by_id")
      .notNull()
      .references(() => usersTable.id),
    changeType: text("change_type").notNull(),
    changeSummary: text("change_summary"),
    version: integer("version").notNull(),
    previousSnapshot: jsonb(
      "previous_snapshot",
    ).$type<CustomerRequirementSnapshot | null>(),
    snapshot: jsonb("snapshot").$type<CustomerRequirementSnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCustomerRequirementSchema = createInsertSchema(
  customerRequirementsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCustomerRequirementReviewSchema = createInsertSchema(
  customerRequirementReviewsTable,
).omit({ id: true, createdAt: true });
export const insertCustomerRequirementHistorySchema = createInsertSchema(
  customerRequirementHistoryTable,
).omit({ id: true, createdAt: true });

export type Customer = typeof customersTable.$inferSelect;
export type CustomerRequirement = typeof customerRequirementsTable.$inferSelect;
export type CustomerRequirementReview =
  typeof customerRequirementReviewsTable.$inferSelect;
export type CustomerRequirementHistory =
  typeof customerRequirementHistoryTable.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
