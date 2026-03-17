import { and, eq, inArray, like } from "drizzle-orm";
import {
  db,
  legislationsTable,
  organizationsTable,
  strategicPlanActionsTable,
  strategicPlanActionUnitsTable,
  strategicPlanInterestedPartiesTable,
  strategicPlanObjectivesTable,
  strategicPlansTable,
  strategicPlanRevisionsTable,
  strategicPlanSwotItemsTable,
  unitLegislationsTable,
  unitsTable,
  userModulePermissionsTable,
  usersTable,
} from "@workspace/db";

export async function cleanupTestData(prefix: string) {
  const orgs = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(like(organizationsTable.name, `E2E ${prefix}%`));

  const prefixedUsers = await db
    .select({ id: usersTable.id, organizationId: usersTable.organizationId })
    .from(usersTable)
    .where(like(usersTable.email, `${prefix}%@e2e.daton.example`));

  const orgIds = Array.from(
    new Set([
      ...orgs.map((org) => org.id),
      ...prefixedUsers.map((user) => user.organizationId),
    ]),
  );

  if (orgIds.length === 0) {
    if (prefixedUsers.length > 0) {
      await db.delete(userModulePermissionsTable).where(
        inArray(
          userModulePermissionsTable.userId,
          prefixedUsers.map((user) => user.id),
        ),
      );
      await db.delete(usersTable).where(
        inArray(
          usersTable.id,
          prefixedUsers.map((user) => user.id),
        ),
      );
    }
    return;
  }

  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.organizationId, orgIds));
  const userIds = users.map((user) => user.id);

  const units = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(inArray(unitsTable.organizationId, orgIds));
  const unitIds = units.map((unit) => unit.id);

  const legislations = await db
    .select({ id: legislationsTable.id })
    .from(legislationsTable)
    .where(inArray(legislationsTable.organizationId, orgIds));
  const legislationIds = legislations.map((legislation) => legislation.id);

  const plans = await db
    .select({ id: strategicPlansTable.id })
    .from(strategicPlansTable)
    .where(inArray(strategicPlansTable.organizationId, orgIds));
  const planIds = plans.map((plan) => plan.id);

  if (planIds.length > 0) {
    const actions = await db
      .select({ id: strategicPlanActionsTable.id })
      .from(strategicPlanActionsTable)
      .where(inArray(strategicPlanActionsTable.planId, planIds));
    const actionIds = actions.map((action) => action.id);

    if (actionIds.length > 0) {
      await db
        .delete(strategicPlanActionUnitsTable)
        .where(inArray(strategicPlanActionUnitsTable.actionId, actionIds));
    }

    await db
      .delete(strategicPlanRevisionsTable)
      .where(inArray(strategicPlanRevisionsTable.planId, planIds));
    await db
      .delete(strategicPlanActionsTable)
      .where(inArray(strategicPlanActionsTable.planId, planIds));
    await db
      .delete(strategicPlanSwotItemsTable)
      .where(inArray(strategicPlanSwotItemsTable.planId, planIds));
    await db
      .delete(strategicPlanInterestedPartiesTable)
      .where(inArray(strategicPlanInterestedPartiesTable.planId, planIds));
    await db
      .delete(strategicPlanObjectivesTable)
      .where(inArray(strategicPlanObjectivesTable.planId, planIds));
    await db
      .delete(strategicPlansTable)
      .where(inArray(strategicPlansTable.id, planIds));
  }

  if (unitIds.length > 0) {
    await db
      .delete(unitLegislationsTable)
      .where(inArray(unitLegislationsTable.unitId, unitIds));
  }

  if (legislationIds.length > 0) {
    await db
      .delete(unitLegislationsTable)
      .where(inArray(unitLegislationsTable.legislationId, legislationIds));
    await db
      .delete(legislationsTable)
      .where(inArray(legislationsTable.id, legislationIds));
  }

  if (unitIds.length > 0) {
    await db.delete(unitsTable).where(inArray(unitsTable.id, unitIds));
  }

  if (userIds.length > 0) {
    await db
      .delete(userModulePermissionsTable)
      .where(inArray(userModulePermissionsTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }

  await db
    .delete(organizationsTable)
    .where(inArray(organizationsTable.id, orgIds));
}
