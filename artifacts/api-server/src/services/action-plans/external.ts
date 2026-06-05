import { desc, eq, inArray } from "drizzle-orm";
import {
  correctiveActionsTable,
  db,
  nonconformitiesTable,
  usersTable,
  type ActionPlanStatus,
  type CorrectiveActionStatus,
} from "@workspace/db";

const STATUS_MAP: Record<CorrectiveActionStatus, ActionPlanStatus> = {
  pending: "open",
  in_progress: "in_progress",
  done: "completed",
  canceled: "cancelled",
};

/**
 * Surface other modules' treatment actions in the unified hub, read-only.
 * Currently governance corrective actions (which live under a nonconformity and
 * keep their own lifecycle there — we bridge, we don't migrate).
 */
export async function listExternalActions(orgId: number) {
  const rows = await db
    .select({
      id: correctiveActionsTable.id,
      title: correctiveActionsTable.title,
      status: correctiveActionsTable.status,
      dueDate: correctiveActionsTable.dueDate,
      responsibleUserId: correctiveActionsTable.responsibleUserId,
      createdAt: correctiveActionsTable.createdAt,
      nonconformityId: correctiveActionsTable.nonconformityId,
      ncTitle: nonconformitiesTable.title,
    })
    .from(correctiveActionsTable)
    .innerJoin(nonconformitiesTable, eq(nonconformitiesTable.id, correctiveActionsTable.nonconformityId))
    .where(eq(correctiveActionsTable.organizationId, orgId))
    .orderBy(desc(correctiveActionsTable.createdAt));

  const userIds = [...new Set(rows.map((r) => r.responsibleUserId).filter((v): v is number => typeof v === "number"))];
  let nameMap = new Map<number, string>();
  if (userIds.length > 0) {
    const us = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds));
    nameMap = new Map(us.map((u) => [u.id, u.name]));
  }

  return rows.map((r) => ({
    id: r.id,
    origin: "governance_corrective_action" as const,
    title: r.title,
    status: STATUS_MAP[r.status] ?? "open",
    nonconformityId: r.nonconformityId,
    nonconformityTitle: r.ncTitle ?? null,
    responsibleUserName: r.responsibleUserId != null ? (nameMap.get(r.responsibleUserId) ?? null) : null,
    dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
    link: "/governanca/nao-conformidades",
    createdAt: r.createdAt.toISOString(),
  }));
}
