import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { effectivenessMethodsTable } from "./effectiveness-methods";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export type ActionPlanStatus = "open" | "in_progress" | "completed" | "cancelled";
export type ActionPlanPriority = "low" | "medium" | "high";
/**
 * Origin that spawned the action. The action module is the unified treatment
 * hub, so origins span every SGI source. Origins created inside the module
 * itself (no upstream entity) are the ones the user picks in the "Origem"
 * listbox: `improvement`, `corrective`, `norm_requirement`. `manual` is the
 * legacy value they replaced — still readable, never written by new actions.
 * The enum is append-only — new values must be added at the END of this list
 * (both here and in `actionPlanSourceModuleEnum` below), matching the order of
 * the production `ALTER TYPE ... ADD VALUE` statements. Inserting in the
 * middle desyncs the TS order from the DB order, and the next `drizzle-kit
 * push` will DROP and RECREATE the type to "fix" it — an exclusive lock on
 * the table just to reorder. `improvement`/`corrective`/`norm_requirement`
 * were added this way and live at the end, after `rac`, even though they read
 * more naturally grouped near `manual` above.
 *
 * Careful: `improvement` and `corrective` also exist in `actionPlanTypeEnum`
 * (the "Tipo" field). Different columns, different TS types — the origin only
 * *suggests* the type in the dialog.
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
  | "rac"
  | "improvement"
  | "corrective"
  | "norm_requirement";
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
  | "reopened";

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
  | { kind: "note"; message: string };

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
  "improvement",
  "corrective",
  "norm_requirement",
]);
export const actionPlanTypeEnum = pgEnum("action_plan_type", [
  "corrective",
  "preventive",
  "improvement",
]);
/**
 * @deprecated Legado. O método de verificação virou catálogo por organização
 * (`effectiveness_methods` + `action_plans.effectiveness_method_id`). Mantido
 * para ler planos criados antes da migração — não dropar, não escrever mais.
 */
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
    // ─── Structured planning (5W2H) + root cause (5 whys) ──────────────────────
    plan5w2h: jsonb("plan_5w2h").$type<ActionPlan5W2H>(),
    rootCause: text("root_cause"),
    rootCauseWhys: jsonb("root_cause_whys").$type<string[]>(),
    // ─── Assignment & deadline ─────────────────────────────────────────────────
    /**
     * O **ponto focal** do plano: quem responde por ele. Um só, e opcional (um
     * plano pode nascer sem dono definido). Os demais responsáveis vivem em
     * `action_plan_responsibles` — esta coluna NÃO os inclui.
     */
    responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    correctiveActionDescription: text("corrective_action_description"),
    correctiveActionCompletedAt: timestamp("corrective_action_completed_at", { withTimezone: true }),
    // ─── Effectiveness verification (mirrors governance NC fields) ──────────────
    /** @deprecated legado — só leitura, para planos anteriores ao catálogo. */
    effectivenessMethod: actionPlanEffectivenessMethodEnum("effectiveness_method"),
    effectivenessMethodId: integer("effectiveness_method_id").references(
      () => effectivenessMethodsTable.id,
      { onDelete: "set null" },
    ),
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
 * **Co-responsáveis** de um plano de ação (N:N) — os "outros responsáveis", além
 * do ponto focal. O ponto focal é `action_plans.responsible_user_id` e **não
 * aparece aqui**: as duas coisas juntas formam o conjunto de responsáveis do
 * plano. O servidor rejeita o ponto focal nesta lista (não faria sentido ser
 * responsável duas vezes).
 *
 * Um co-responsável tem o mesmo tratamento operacional do ponto focal: recebe a
 * cobrança automática, vê o plano em "Suas Pendências" e alcança a ficha mesmo
 * sem o módulo `actionPlans`. O que o distingue é a responsabilidade formal pelo
 * plano — essa é do ponto focal.
 *
 * Estrutura espelha `unit_managers`. O índice em `user_id` não é decoração: as
 * consultas quentes (pendências, escalonamento, filtro "Atribuídas a mim") entram
 * por ele.
 *
 * Quando as ações-item existirem, é aqui que o vínculo passa a ser
 * co-responsável↔ação, e não co-responsável↔plano.
 */
export const actionPlanResponsiblesTable = pgTable(
  "action_plan_responsibles",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    actionPlanId: integer("action_plan_id").notNull().references(() => actionPlansTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("action_plan_responsibles_plan_user_uq").on(table.actionPlanId, table.userId),
    index("action_plan_responsibles_user_idx").on(table.userId),
    index("action_plan_responsibles_org_idx").on(table.organizationId),
  ],
);

export type ActionPlanResponsible = typeof actionPlanResponsiblesTable.$inferSelect;

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
