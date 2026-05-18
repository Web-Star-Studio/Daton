import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  type ActionPlan as DbActionPlan,
  type ActionPlanEvidence as DbActionPlanEvidence,
} from "@workspace/db";
import type { SourceContext } from "./source-context";

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

export function serializePlan(
  p: DbActionPlan,
  sourceContext: SourceContext,
  extras: {
    responsibleUserName: string | null;
    createdByUserName: string | null;
    evidences: ReturnType<typeof serializeEvidence>[];
  },
) {
  return {
    id: p.id,
    organizationId: p.organizationId,
    sourceModule: p.sourceModule,
    sourceRef: p.sourceRef,
    sourceContext,
    title: p.title,
    description: p.description ?? null,
    status: p.status,
    priority: p.priority,
    responsibleUserId: p.responsibleUserId ?? null,
    responsibleUserName: extras.responsibleUserName,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    correctiveActionDescription: p.correctiveActionDescription ?? null,
    correctiveActionCompletedAt: p.correctiveActionCompletedAt ? p.correctiveActionCompletedAt.toISOString() : null,
    createdByUserId: p.createdByUserId ?? null,
    createdByUserName: extras.createdByUserName,
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    evidences: extras.evidences,
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
