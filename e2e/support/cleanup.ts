import { inArray, like } from "drizzle-orm";
import {
  db,
  legislationsTable,
  organizationsTable,
  strategicPlanActionsTable,
  strategicPlanActionUnitsTable,
  strategicPlanInterestedPartiesTable,
  strategicPlanObjectivesTable,
  strategicPlanRiskOpportunityEffectivenessReviewsTable,
  strategicPlanRiskOpportunityItemsTable,
  strategicPlansTable,
  strategicPlanRevisionsTable,
  strategicPlanSwotItemsTable,
  unitLegislationsTable,
  unitsTable,
  userModulePermissionsTable,
  usersTable,
} from "@workspace/db";

type CleanupTransaction = Pick<typeof db, "delete">;

async function deleteStandaloneUsers(
  tx: CleanupTransaction,
  userIds: number[],
) {
  if (userIds.length === 0) {
    return;
  }

  await tx
    .delete(userModulePermissionsTable)
    .where(inArray(userModulePermissionsTable.userId, userIds));
  await tx.delete(usersTable).where(inArray(usersTable.id, userIds));
}

export async function cleanupTestData(prefix: string) {
  await db.transaction(async (tx) => {
    const orgs = await tx
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(like(organizationsTable.name, `E2E ${prefix}%`));

    const prefixedUsers = await tx
      .select({ id: usersTable.id, organizationId: usersTable.organizationId })
      .from(usersTable)
      .where(like(usersTable.email, `${prefix}%@e2e.daton.example`));

    const orgIds = Array.from(new Set(orgs.map((org) => org.id)));
    const standalonePrefixedUsers = prefixedUsers.filter(
      (user) => !orgIds.includes(user.organizationId),
    );
    const standaloneUserIds = standalonePrefixedUsers.map((user) => user.id);

    if (orgIds.length === 0) {
      await deleteStandaloneUsers(tx, standaloneUserIds);
      return;
    }

    const users = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.organizationId, orgIds));
    const userIds = users.map((user) => user.id);

    const units = await tx
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(inArray(unitsTable.organizationId, orgIds));
    const unitIds = units.map((unit) => unit.id);

    const legislations = await tx
      .select({ id: legislationsTable.id })
      .from(legislationsTable)
      .where(inArray(legislationsTable.organizationId, orgIds));
    const legislationIds = legislations.map((legislation) => legislation.id);

    const plans = await tx
      .select({ id: strategicPlansTable.id })
      .from(strategicPlansTable)
      .where(inArray(strategicPlansTable.organizationId, orgIds));
    const planIds = plans.map((plan) => plan.id);

    if (planIds.length > 0) {
      const actions = await tx
        .select({ id: strategicPlanActionsTable.id })
        .from(strategicPlanActionsTable)
        .where(inArray(strategicPlanActionsTable.planId, planIds));
      const actionIds = actions.map((action) => action.id);
      const riskItems = await tx
        .select({ id: strategicPlanRiskOpportunityItemsTable.id })
        .from(strategicPlanRiskOpportunityItemsTable)
        .where(inArray(strategicPlanRiskOpportunityItemsTable.planId, planIds));
      const riskItemIds = riskItems.map((item) => item.id);

      if (actionIds.length > 0) {
        await tx
          .delete(strategicPlanActionUnitsTable)
          .where(inArray(strategicPlanActionUnitsTable.actionId, actionIds));
      }
      if (riskItemIds.length > 0) {
        await tx
          .delete(strategicPlanRiskOpportunityEffectivenessReviewsTable)
          .where(
            inArray(
              strategicPlanRiskOpportunityEffectivenessReviewsTable.riskOpportunityItemId,
              riskItemIds,
            ),
          );
      }

      await tx
        .delete(strategicPlanRevisionsTable)
        .where(inArray(strategicPlanRevisionsTable.planId, planIds));
      await tx
        .delete(strategicPlanActionsTable)
        .where(inArray(strategicPlanActionsTable.planId, planIds));
      await tx
        .delete(strategicPlanRiskOpportunityItemsTable)
        .where(inArray(strategicPlanRiskOpportunityItemsTable.planId, planIds));
      await tx
        .delete(strategicPlanSwotItemsTable)
        .where(inArray(strategicPlanSwotItemsTable.planId, planIds));
      await tx
        .delete(strategicPlanInterestedPartiesTable)
        .where(inArray(strategicPlanInterestedPartiesTable.planId, planIds));
      await tx
        .delete(strategicPlanObjectivesTable)
        .where(inArray(strategicPlanObjectivesTable.planId, planIds));
      await tx
        .delete(strategicPlansTable)
        .where(inArray(strategicPlansTable.id, planIds));
    }

    if (unitIds.length > 0) {
      await tx
        .delete(unitLegislationsTable)
        .where(inArray(unitLegislationsTable.unitId, unitIds));
    }

    if (legislationIds.length > 0) {
      await tx
        .delete(unitLegislationsTable)
        .where(inArray(unitLegislationsTable.legislationId, legislationIds));
      await tx
        .delete(legislationsTable)
        .where(inArray(legislationsTable.id, legislationIds));
    }

    if (unitIds.length > 0) {
      await tx.delete(unitsTable).where(inArray(unitsTable.id, unitIds));
    }

    if (userIds.length > 0) {
      await tx
        .delete(userModulePermissionsTable)
        .where(inArray(userModulePermissionsTable.userId, userIds));
      await tx.delete(usersTable).where(inArray(usersTable.id, userIds));
    }

    await deleteStandaloneUsers(tx, standaloneUserIds);

    await tx
      .delete(organizationsTable)
      .where(inArray(organizationsTable.id, orgIds));
  });
}
