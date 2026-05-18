import { index, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export type ActionPlanStatus = "open" | "in_progress" | "completed" | "cancelled";
export type ActionPlanPriority = "low" | "medium" | "high";
export type ActionPlanSourceModule = "kpi";

export type ActionPlanSourceRef = {
  kpiMonthlyValueId?: number;
  kpiIndicatorId?: number;
  kpiYear?: number;
  kpiMonth?: number;
};

export const actionPlansTable = pgTable(
  "action_plans",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    sourceModule: varchar("source_module", { length: 32 }).notNull(),
    sourceRef: jsonb("source_ref").$type<ActionPlanSourceRef>().notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    priority: varchar("priority", { length: 10 }).notNull().default("medium"),
    responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    correctiveActionDescription: text("corrective_action_description"),
    correctiveActionCompletedAt: timestamp("corrective_action_completed_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("action_plans_org_source_idx").on(table.organizationId, table.sourceModule),
    index("action_plans_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const actionPlanEvidencesTable = pgTable("action_plan_evidences", {
  id: serial("id").primaryKey(),
  actionPlanId: integer("action_plan_id").notNull().references(() => actionPlansTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActionPlanSchema = createInsertSchema(actionPlansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertActionPlan = z.infer<typeof insertActionPlanSchema>;
export type ActionPlan = typeof actionPlansTable.$inferSelect;

export const insertActionPlanEvidenceSchema = createInsertSchema(actionPlanEvidencesTable).omit({
  id: true,
  uploadedAt: true,
});
export type InsertActionPlanEvidence = z.infer<typeof insertActionPlanEvidenceSchema>;
export type ActionPlanEvidence = typeof actionPlanEvidencesTable.$inferSelect;
