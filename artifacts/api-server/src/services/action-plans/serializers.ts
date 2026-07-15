import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  type ActionPlan as DbActionPlan,
  type ActionPlanAction as DbActionPlanAction,
  type ActionPlanActivityLogEntry as DbActionPlanActivity,
  type ActionPlanComment as DbActionPlanComment,
  type ActionPlanEvidence as DbActionPlanEvidence,
} from "@workspace/db";
import type { SourceContext } from "./source-context";
import { gutScore } from "./gut";

export function serializeEvidence(
  e: DbActionPlanEvidence,
  uploadedByUserName: string | null = null,
) {
  return {
    id: e.id,
    actionPlanId: e.actionPlanId,
    fileName: e.fileName,
    fileSize: e.fileSize,
    contentType: e.contentType,
    objectPath: e.objectPath,
    uploadedByUserId: e.uploadedByUserId ?? null,
    uploadedByUserName,
    uploadedAt: e.uploadedAt.toISOString(),
  };
}

export function serializeComment(
  c: DbActionPlanComment,
  createdByUserName: string | null = null,
) {
  return {
    id: c.id,
    actionPlanId: c.actionPlanId,
    body: c.body,
    createdByUserId: c.createdByUserId ?? null,
    createdByUserName,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Uma linha do 5W2H rastreável (ver `action_plan_actions` no schema). */
export function serializeAction(
  a: DbActionPlanAction,
  responsibleUserName: string | null = null,
) {
  return {
    id: a.id,
    actionPlanId: a.actionPlanId,
    what: a.what ?? null,
    why: a.why ?? null,
    whereAt: a.whereAt ?? null,
    how: a.how ?? null,
    howMuch: a.howMuch ?? null,
    responsibleUserId: a.responsibleUserId ?? null,
    responsibleUserName,
    dueDate: a.dueDate ? a.dueDate.toISOString() : null,
    status: a.status,
    completedAt: a.completedAt ? a.completedAt.toISOString() : null,
    notes: a.notes ?? null,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt.toISOString(),
  };
}

export function serializeActivityEntry(e: DbActionPlanActivity) {
  return {
    id: e.id,
    actionPlanId: e.actionPlanId,
    action: e.action,
    userId: e.userId ?? null,
    userName: e.userName ?? null,
    changes: e.changes ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

export function serializePlan(
  p: DbActionPlan,
  sourceContext: SourceContext,
  extras: {
    responsibleUserName: string | null;
    createdByUserName: string | null;
    effectivenessEvaluatorUserName: string | null;
    evidences: ReturnType<typeof serializeEvidence>[];
    actionsTotal: number;
    actionsDone: number;
  },
) {
  return {
    id: p.id,
    organizationId: p.organizationId,
    code: p.code ?? null,
    sourceModule: p.sourceModule,
    sourceRef: p.sourceRef,
    sourceContext,
    actionType: p.actionType,
    title: p.title,
    description: p.description ?? null,
    status: p.status,
    priority: p.priority,
    gutGravity: p.gutGravity ?? null,
    gutUrgency: p.gutUrgency ?? null,
    gutTendency: p.gutTendency ?? null,
    gutScore: gutScore(p.gutGravity, p.gutUrgency, p.gutTendency),
    rootCause: p.rootCause ?? null,
    analyses: p.analyses ?? null,
    responsibleUserId: p.responsibleUserId ?? null,
    responsibleUserName: extras.responsibleUserName,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    correctiveActionDescription: p.correctiveActionDescription ?? null,
    correctiveActionCompletedAt: p.correctiveActionCompletedAt ? p.correctiveActionCompletedAt.toISOString() : null,
    effectivenessMethod: p.effectivenessMethod ?? null,
    effectivenessDueDate: p.effectivenessDueDate ? p.effectivenessDueDate.toISOString() : null,
    effectivenessEvaluatorUserId: p.effectivenessEvaluatorUserId ?? null,
    effectivenessEvaluatorUserName: extras.effectivenessEvaluatorUserName,
    effectivenessResult: p.effectivenessResult ?? null,
    effectivenessBefore: p.effectivenessBefore ?? null,
    effectivenessAfter: p.effectivenessAfter ?? null,
    effectivenessComment: p.effectivenessComment ?? null,
    effectivenessCheckedAt: p.effectivenessCheckedAt ? p.effectivenessCheckedAt.toISOString() : null,
    odsNumbers: p.odsNumbers ?? null,
    normRefs: p.normRefs ?? null,
    relatedIndicatorIds: p.relatedIndicatorIds ?? null,
    relatedRiskIds: p.relatedRiskIds ?? null,
    createdByUserId: p.createdByUserId ?? null,
    createdByUserName: extras.createdByUserName,
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    evidences: extras.evidences,
    actionsTotal: extras.actionsTotal,
    actionsDone: extras.actionsDone,
  };
}

/** Batch-resolve user display names by id. Skips null/undefined. */
export async function resolveUserNames(userIds: (number | null | undefined)[]): Promise<Map<number, string>> {
  const ids = [...new Set(userIds.filter((v): v is number => typeof v === "number"))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Returns true when the user belongs to the given org. Used to guard
 * cross-tenant assignment via responsibleUserId. */
export async function assertUserBelongsToOrg(userId: number, orgId: number): Promise<boolean> {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, orgId)));
  return Boolean(user);
}

/** Analysts are read-only and can't PATCH, so they can never issue a verdict —
 * designating one as evaluator would dead-end the effectiveness verification. */
export async function userIsAnalyst(userId: number, orgId: number): Promise<boolean> {
  const [user] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, orgId)));
  return user?.role === "analyst";
}
