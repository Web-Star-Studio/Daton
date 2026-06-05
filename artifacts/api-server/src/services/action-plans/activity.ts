import {
  actionPlanActivityLogTable,
  db,
  type ActionPlanActivityAction,
  type ActionPlanActivityChanges,
} from "@workspace/db";

export { buildDiff } from "./activity-diff";

/** Append one entry to an action plan's audit/activity log. `userName` is a
 * snapshot so the trail survives user deletion (auditors ask who & when). */
export async function logActionPlanActivity(params: {
  orgId: number;
  actionPlanId: number;
  action: ActionPlanActivityAction;
  userId: number | null;
  userName: string | null;
  changes?: ActionPlanActivityChanges | null;
}): Promise<void> {
  await db.insert(actionPlanActivityLogTable).values({
    organizationId: params.orgId,
    actionPlanId: params.actionPlanId,
    action: params.action,
    userId: params.userId ?? null,
    userName: params.userName ?? null,
    changes: params.changes ?? null,
  });
}
