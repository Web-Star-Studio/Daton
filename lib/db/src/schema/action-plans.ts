import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";
import type { ActionPlanAnalysis } from "./action-plan-analysis-methods";

export type ActionPlanStatus = "open" | "in_progress" | "completed" | "cancelled";
export type ActionPlanPriority = "low" | "medium" | "high";
/**
 * Origin that spawned the action. `manual` = created directly in the action
 * module (no upstream entity). The action module is the unified treatment hub,
 * so origins span every SGI source. The enum is append-only — adding values is
 * a safe `push`.
 */
export type ActionPlanSourceModule =
  | "kpi"
  | "swot"
  | "manual"
  | "nonconformity"
  | "audit_finding"
  | "risk"
  | "training"
  | "environmental"
  | "road_safety"
  | "incident"
  | "rac";
export type ActionPlanType = "corrective" | "preventive" | "improvement";
export type ActionPlanEffectivenessMethod =
  | "indicator"
  | "internal_audit"
  | "field_inspection"
  | "training"
  | "sampling"
  | "risk_reduction";
export type ActionPlanEffectivenessResult = "effective" | "ineffective" | "pending";
export type ActionPlanActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "evidence_added"
  | "evidence_removed"
  | "effectiveness_evaluated"
  | "escalated"
  | "reopened"
  | "action_added"
  | "action_updated"
  | "action_removed";

/** Structured 5W2H plan. "howMuch" carries estimated cost (free text). */
export type ActionPlan5W2H = {
  what?: string;
  why?: string;
  where?: string;
  who?: string;
  when?: string;
  how?: string;
  howMuch?: string;
};

/** A normative reference the action addresses, e.g. { code: "ISO 45001", clause: "8.1" }. */
export type ActionPlanNormRef = {
  code: string;
  clause?: string;
  description?: string;
};

/** Activity-log payload. Diff for field changes, snapshot on create, note for
 * system events (escalation, etc.). Mirrors the regulatory-documents audit log. */
export type ActionPlanActivityChanges =
  | { kind: "snapshot"; data: Record<string, unknown> }
  | {
      kind: "diff";
      fields: Record<string, { from: unknown; to: unknown }>;
      /** Set when the entry came from restoring an older planning version. */
      restoredFrom?: { activityId: number; at: string };
    }
  | { kind: "note"; message: string }
  | {
      kind: "action";
      actionId: number;
      /** Snapshotado: o log precisa sobreviver à remoção da linha (mesma razão do `userName`). */
      what: string;
      fields?: Record<string, { from: unknown; to: unknown }>;
    };

/**
 * Polymorphic source reference. The relevant fields depend on `sourceModule`
 * (validated server-side at create time): kpi → kpiMonthlyValueId; swot →
 * swotFactorId; manual → none. Kept as a single optional-field object (not a
 * union) so the existing `typeof` guards in source-context resolution stay simple.
 */
export type ActionPlanSourceRef = {
  // kpi origin
  kpiMonthlyValueId?: number;
  kpiIndicatorId?: number;
  kpiYear?: number;
  kpiMonth?: number;
  // swot origin
  swotFactorId?: number;
  swotFactorDescription?: string;
  // manual origin (optional free context)
  manualContext?: string;
  // governance: nonconformity / audit finding / strategic-plan risk
  nonconformityId?: number;
  auditFindingId?: number;
  riskOpportunityItemId?: number;
  // people: training
  trainingId?: number;
  // environmental: LAIA assessment
  laiaAssessmentId?: number;
  // road safety factor
  roadSafetyFactorId?: number;
  // incident (no dedicated entity — free description)
  incidentDescription?: string;
  // rac (análise crítica / management review) — links back to a critical review
  criticalReviewId?: number;
  racLabel?: string;
};

export const actionPlanStatusEnum = pgEnum("action_plan_status", [
  "open",
  "in_progress",
  "completed",
  "cancelled",
]);
export const actionPlanPriorityEnum = pgEnum("action_plan_priority", [
  "low",
  "medium",
  "high",
]);
export const actionPlanSourceModuleEnum = pgEnum("action_plan_source_module", [
  "kpi",
  "swot",
  "manual",
  "nonconformity",
  "audit_finding",
  "risk",
  "training",
  "environmental",
  "road_safety",
  "incident",
  "rac",
]);
export const actionPlanTypeEnum = pgEnum("action_plan_type", [
  "corrective",
  "preventive",
  "improvement",
]);
export const actionPlanEffectivenessMethodEnum = pgEnum("action_plan_effectiveness_method", [
  "indicator",
  "internal_audit",
  "field_inspection",
  "training",
  "sampling",
  "risk_reduction",
]);
export const actionPlanEffectivenessResultEnum = pgEnum("action_plan_effectiveness_result", [
  "effective",
  "ineffective",
  "pending",
]);
export const actionPlanActivityActionEnum = pgEnum("action_plan_activity_action", [
  "created",
  "updated",
  "status_changed",
  "evidence_added",
  "evidence_removed",
  "effectiveness_evaluated",
  "escalated",
  "reopened",
  "action_added",
  "action_updated",
  "action_removed",
]);

export const actionPlansTable = pgTable(
  "action_plans",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    /** Human-readable per-org code, e.g. "AC-2026-047". Generated at create time. */
    code: text("code"),
    sourceModule: actionPlanSourceModuleEnum("source_module").notNull(),
    sourceRef: jsonb("source_ref").$type<ActionPlanSourceRef>().notNull(),
    actionType: actionPlanTypeEnum("action_type").notNull().default("corrective"),
    title: text("title").notNull(),
    description: text("description"),
    status: actionPlanStatusEnum("status").notNull().default("open"),
    priority: actionPlanPriorityEnum("priority").notNull().default("medium"),
    // ─── GUT prioritization (each axis 1–5; relevância = G × U × T, 1–125) ──────
    gutGravity: integer("gut_gravity"),
    gutUrgency: integer("gut_urgency"),
    gutTendency: integer("gut_tendency"),
    // ─── Análise de causa ──────────────────────────────────────────────────────
    /** A conclusão da análise — uma só, qualquer que seja a tratativa usada. */
    rootCause: text("root_cause"),
    /** As tratativas aplicadas a este plano (união discriminada por `key`). */
    analyses: jsonb("analyses").$type<ActionPlanAnalysis[]>(),
    /** @deprecated Migradas para `analyses` / `action_plan_actions` em 2026-07.
     *  Mantidas sem leitura nem escrita como rede de rollback; derrubar em follow-up. */
    plan5w2h: jsonb("plan_5w2h").$type<ActionPlan5W2H>(),
    rootCauseWhys: jsonb("root_cause_whys").$type<string[]>(),
    // ─── Assignment & deadline ─────────────────────────────────────────────────
    responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    correctiveActionDescription: text("corrective_action_description"),
    correctiveActionCompletedAt: timestamp("corrective_action_completed_at", { withTimezone: true }),
    // ─── Effectiveness verification (mirrors governance NC fields) ──────────────
    effectivenessMethod: actionPlanEffectivenessMethodEnum("effectiveness_method"),
    effectivenessDueDate: timestamp("effectiveness_due_date", { withTimezone: true }),
    effectivenessEvaluatorUserId: integer("effectiveness_evaluator_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    effectivenessResult: actionPlanEffectivenessResultEnum("effectiveness_result"),
    effectivenessBefore: text("effectiveness_before"),
    effectivenessAfter: text("effectiveness_after"),
    effectivenessComment: text("effectiveness_comment"),
    effectivenessCheckedAt: timestamp("effectiveness_checked_at", { withTimezone: true }),
    // ─── Strategic / normative links ───────────────────────────────────────────
    odsNumbers: jsonb("ods_numbers").$type<number[]>(),
    normRefs: jsonb("norm_refs").$type<ActionPlanNormRef[]>(),
    relatedIndicatorIds: jsonb("related_indicator_ids").$type<number[]>(),
    relatedRiskIds: jsonb("related_risk_ids").$type<number[]>(),
    // ─── Bookkeeping ───────────────────────────────────────────────────────────
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("action_plans_org_source_idx").on(table.organizationId, table.sourceModule),
    index("action_plans_org_status_idx").on(table.organizationId, table.status),
    index("action_plans_org_code_idx").on(table.organizationId, table.code),
  ],
);

/**
 * As ações do plano — o que antes era o bloco `plan5w2h` único.
 *
 * Cada linha é um 5W2H rastreável: "Quem" é um usuário do sistema (não texto), "Quando"
 * é uma data (não texto) e há status por ação. É isso que permite cobrar: a ação entra
 * em "Suas Pendências" do responsável dela e vence sozinha.
 *
 * Tabela, e não um jsonb no plano, justamente porque precisa ser CONSULTÁVEL por
 * responsável e por prazo — um array jsonb não indexa.
 */
export const actionPlanActionsTable = pgTable(
  "action_plan_actions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    actionPlanId: integer("action_plan_id").notNull().references(() => actionPlansTable.id, { onDelete: "cascade" }),
    // ─── 5W2H da ação ──────────────────────────────────────────────────────────
    // Todos anuláveis: a ficha salva parcial o tempo todo. "+ Incluir ação" cria a
    // linha vazia na hora, e o usuário volta para preencher.
    what: text("what"),
    why: text("why"),
    /** Onde. `where` é palavra reservada em SQL — não usar como nome de coluna. */
    whereAt: text("where_at"),
    how: text("how"),
    howMuch: text("how_much"),
    responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    // ─── Execução ──────────────────────────────────────────────────────────────
    status: actionPlanStatusEnum("status").notNull().default("open"),
    /** Gravado pelo servidor quando o status vira `completed`; limpo ao reabrir. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("action_plan_actions_plan_idx").on(table.actionPlanId, table.sortOrder),
    // Serve "Suas Pendências" e o cálculo de atraso.
    index("action_plan_actions_org_responsible_idx").on(
      table.organizationId,
      table.responsibleUserId,
      table.status,
    ),
  ],
);

export const insertActionPlanActionSchema = createInsertSchema(actionPlanActionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertActionPlanAction = z.infer<typeof insertActionPlanActionSchema>;
export type ActionPlanAction = typeof actionPlanActionsTable.$inferSelect;

/** Ação atrasada = venceu e não foi concluída nem cancelada. Derivado, nunca persistido. */
export function isActionPlanActionOverdue(
  action: Pick<ActionPlanAction, "status" | "dueDate">,
  now: Date,
): boolean {
  if (action.status === "completed" || action.status === "cancelled") return false;
  if (!action.dueDate) return false;
  return action.dueDate.getTime() < now.getTime();
}

export const actionPlanEvidencesTable = pgTable("action_plan_evidences", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  actionPlanId: integer("action_plan_id").notNull().references(() => actionPlansTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentType: text("content_type").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Append-only comment thread, one row per comment (mirrors kpi_monthly_value_justifications). */
export const actionPlanCommentsTable = pgTable(
  "action_plan_comments",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    actionPlanId: integer("action_plan_id").notNull().references(() => actionPlansTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("action_plan_comments_plan_idx").on(table.actionPlanId, table.createdAt),
  ],
);

/** Append-only audit trail. `userName` is snapshotted so the log survives user
 * deletion (auditors will ask who did what and when). */
export const actionPlanActivityLogTable = pgTable(
  "action_plan_activity_log",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    actionPlanId: integer("action_plan_id").notNull().references(() => actionPlansTable.id, { onDelete: "cascade" }),
    action: actionPlanActivityActionEnum("action").notNull(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    userName: text("user_name"),
    changes: jsonb("changes").$type<ActionPlanActivityChanges>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("action_plan_activity_plan_idx").on(table.actionPlanId, table.createdAt),
  ],
);

export const insertActionPlanSchema = createInsertSchema(actionPlansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertActionPlan = z.infer<typeof insertActionPlanSchema>;
export type ActionPlan = typeof actionPlansTable.$inferSelect;

/**
 * "Encerrado" = the plan reached the final **Encerramento** stage and is locked
 * for any change. A plan closes either by full completion (status `completed`
 * AND an effectiveness verdict recorded — `effective`/`ineffective`) or by
 * cancellation. Mere `completed` is NOT locked: the effectiveness (Eficácia
 * stage) is verified *between* concluding the action and closing the plan.
 * Only an admin (SGI) may reopen an encerrado plan. Mirrored on the web in
 * `action-plans-client.ts` — keep both in sync.
 */
export function isActionPlanEncerrado(
  plan: Pick<ActionPlan, "status" | "effectivenessResult">,
): boolean {
  if (plan.status === "cancelled") return true;
  return (
    plan.status === "completed" &&
    (plan.effectivenessResult === "effective" || plan.effectivenessResult === "ineffective")
  );
}

export const insertActionPlanEvidenceSchema = createInsertSchema(actionPlanEvidencesTable).omit({
  id: true,
  uploadedAt: true,
});
export type InsertActionPlanEvidence = z.infer<typeof insertActionPlanEvidenceSchema>;
export type ActionPlanEvidence = typeof actionPlanEvidencesTable.$inferSelect;

export const insertActionPlanCommentSchema = createInsertSchema(actionPlanCommentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActionPlanComment = z.infer<typeof insertActionPlanCommentSchema>;
export type ActionPlanComment = typeof actionPlanCommentsTable.$inferSelect;

export const insertActionPlanActivityLogSchema = createInsertSchema(actionPlanActivityLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActionPlanActivityLog = z.infer<typeof insertActionPlanActivityLogSchema>;
export type ActionPlanActivityLogEntry = typeof actionPlanActivityLogTable.$inferSelect;
