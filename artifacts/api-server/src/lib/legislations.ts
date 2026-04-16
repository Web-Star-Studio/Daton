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

function normalizeTags(tags: string[] | null | undefined): string[] {
  return (tags ?? []).map((tag) => tag.toLowerCase());
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

async function hasMatchingUnits(
  organizationId: number,
  tags: string[],
): Promise<boolean> {
  if (tags.length === 0) return false;

  const matching = await db
    .select({ id: unitComplianceTagsTable.unitId })
    .from(unitComplianceTagsTable)
    .innerJoin(unitsTable, eq(unitComplianceTagsTable.unitId, unitsTable.id))
    .where(
      and(
        eq(unitsTable.organizationId, organizationId),
        inArray(unitComplianceTagsTable.tag, tags),
      ),
    )
    .limit(1);

  return matching.length > 0;
}

async function createNotifications(
  organizationId: number,
  leg: Pick<Legislation, "id" | "title" | "tags">,
  payload: { type: string; title: string; description: string },
): Promise<void> {
  const normalizedTags = normalizeTags(leg.tags as string[] | null);
  if (normalizedTags.length === 0) return;

  const isRelevant = await hasMatchingUnits(organizationId, normalizedTags);
  if (!isRelevant) return;

  const userIds = await getLegislationRecipientIds(organizationId);
  if (userIds.length === 0) return;

  await db.insert(notificationsTable).values(
    userIds.map((userId) => ({
      organizationId,
      userId,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      relatedEntityType: "legislation",
      relatedEntityId: leg.id,
    })),
  );
}

export async function notifyLegislationAdded(
  organizationId: number,
  leg: Pick<Legislation, "id" | "title" | "tags">,
): Promise<void> {
  await createNotifications(organizationId, leg, {
    type: "legislation_new",
    title: "Nova legislação relevante",
    description: `"${leg.title}" foi adicionada e pode ser aplicável às unidades da sua organização com base no questionário de compliance.`,
  });
}

export async function notifyLegislationUpdated(
  organizationId: number,
  leg: Pick<Legislation, "id" | "title" | "tags">,
): Promise<void> {
  await createNotifications(organizationId, leg, {
    type: "legislation_updated",
    title: "Legislação relevante atualizada",
    description: `"${leg.title}" foi atualizada e pode impactar as unidades da sua organização com base no questionário de compliance.`,
  });
}

export async function notifyLegislationBecameRelevant(
  organizationId: number,
  leg: Pick<Legislation, "id" | "title" | "tags">,
  previousTags: string[] | null | undefined,
): Promise<void> {
  const previousNormalizedTags = normalizeTags(previousTags);

  if (previousNormalizedTags.length > 0) {
    const wasRelevant = await hasMatchingUnits(organizationId, previousNormalizedTags);
    if (wasRelevant) {
      return;
    }
  }

  await createNotifications(organizationId, leg, {
    type: "legislation_new",
    title: "Nova legislação relevante",
    description: `"${leg.title}" passou a ser aplicável às unidades da sua organização com base no questionário de compliance.`,
  });
}
