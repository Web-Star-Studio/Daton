import { and, eq, inArray, or } from "drizzle-orm";
import {
  db,
  notificationsTable,
  unitComplianceTagsTable,
  unitsTable,
  userModulePermissionsTable,
  usersTable,
  type Legislation,
} from "@workspace/db";

function uniqueNumbers(arr: number[]): number[] {
  return [...new Set(arr)];
}

async function getLegislationRecipientIds(organizationId: number): Promise<number[]> {
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.organizationId, organizationId),
        or(eq(usersTable.role, "org_admin"), eq(usersTable.role, "platform_admin")),
      ),
    );

  const legislationUsers = await db
    .select({ id: userModulePermissionsTable.userId })
    .from(userModulePermissionsTable)
    .innerJoin(usersTable, eq(userModulePermissionsTable.userId, usersTable.id))
    .where(
      and(
        eq(usersTable.organizationId, organizationId),
        eq(userModulePermissionsTable.module, "legislations"),
      ),
    );

  return uniqueNumbers([
    ...admins.map((row) => row.id),
    ...legislationUsers.map((row) => row.id),
  ]);
}

export async function notifyLegislationAdded(
  organizationId: number,
  leg: Pick<Legislation, "id" | "title" | "tags">,
): Promise<void> {
  const tags = (leg.tags as string[] | null) ?? [];
  if (tags.length === 0) return;

  const normalizedTags = tags.map((t) => t.toLowerCase());

  const matching = await db
    .select({ id: unitComplianceTagsTable.unitId })
    .from(unitComplianceTagsTable)
    .innerJoin(unitsTable, eq(unitComplianceTagsTable.unitId, unitsTable.id))
    .where(
      and(
        eq(unitsTable.organizationId, organizationId),
        inArray(unitComplianceTagsTable.tag, normalizedTags),
      ),
    )
    .limit(1);

  if (matching.length === 0) return;

  const userIds = await getLegislationRecipientIds(organizationId);
  if (userIds.length === 0) return;

  await db.insert(notificationsTable).values(
    userIds.map((userId) => ({
      organizationId,
      userId,
      type: "legislation_new",
      title: "Nova legislação relevante",
      description: `"${leg.title}" foi adicionada e pode ser aplicável às unidades da sua organização com base no questionário de compliance.`,
      relatedEntityType: "legislation",
      relatedEntityId: leg.id,
    })),
  );
}
