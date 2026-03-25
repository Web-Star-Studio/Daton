import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  ORGANIZATION_CONTACT_CLASSIFICATION_TYPES,
  ORGANIZATION_CONTACT_SOURCE_TYPES,
  db,
  organizationContactGroupMembersTable,
  organizationContactGroupsTable,
  organizationContactsTable,
} from "@workspace/db";

export const OrganizationContactsParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
  contactId: z.coerce.number().int().positive().optional(),
  groupId: z.coerce.number().int().positive().optional(),
});

export const OrganizationContactSourceTypeEnum = z.enum(
  ORGANIZATION_CONTACT_SOURCE_TYPES,
);
export const OrganizationContactClassificationTypeEnum = z.enum(
  ORGANIZATION_CONTACT_CLASSIFICATION_TYPES,
);

const organizationContactBaseFields = {
  classificationType: OrganizationContactClassificationTypeEnum.default("other"),
  classificationDescription: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  organizationName: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
};

export const OrganizationContactBodySchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("system_user"),
    sourceId: z.coerce.number().int().positive(),
    ...organizationContactBaseFields,
  }),
  z.object({
    sourceType: z.literal("employee"),
    sourceId: z.coerce.number().int().positive(),
    ...organizationContactBaseFields,
  }),
  z.object({
    sourceType: z.literal("external_contact"),
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    sourceId: z.number().int().positive().optional().nullable(),
    ...organizationContactBaseFields,
  }),
]);

export const UpdateOrganizationContactBodySchema = z
  .object({
    sourceType: OrganizationContactSourceTypeEnum.optional(),
    sourceId: z.coerce.number().int().positive().optional().nullable(),
    name: z.string().trim().optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().optional().nullable(),
    organizationName: z.string().trim().optional().nullable(),
    classificationType: OrganizationContactClassificationTypeEnum.optional(),
    classificationDescription: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    archived: z.boolean().optional(),
  })
  .refine(
    (value) => {
      if (value.sourceType === "external_contact") {
        return true;
      }
      if (value.sourceType === "system_user" || value.sourceType === "employee") {
        return value.sourceId != null;
      }
      return true;
    },
    {
      message:
        "Contatos vinculados a usuário ou colaborador precisam informar a origem",
    },
  );

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export const OrganizationContactGroupBodySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  contactIds: z.array(z.coerce.number().int().positive()).min(1),
});

export const UpdateOrganizationContactGroupBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  contactIds: z.array(z.coerce.number().int().positive()).min(1).optional(),
});

export type OrganizationContactRecord = {
  id: number;
  sourceType: (typeof ORGANIZATION_CONTACT_SOURCE_TYPES)[number];
  sourceId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  classificationType: (typeof ORGANIZATION_CONTACT_CLASSIFICATION_TYPES)[number];
  classificationDescription: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationContactGroupRecord = {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  members: OrganizationContactRecord[];
};

export async function validateOrgContactIds(
  contactIds: number[],
  orgId: number,
): Promise<boolean> {
  const uniqueIds = [...new Set(contactIds)];
  if (uniqueIds.length === 0) return true;

  const rows = await db
    .select({ id: organizationContactsTable.id })
    .from(organizationContactsTable)
    .where(
      and(
        inArray(organizationContactsTable.id, uniqueIds),
        eq(organizationContactsTable.organizationId, orgId),
      ),
    );

  return rows.length === uniqueIds.length;
}

export async function validateOrgContactGroupIds(
  groupIds: number[],
  orgId: number,
): Promise<boolean> {
  const uniqueIds = [...new Set(groupIds)];
  if (uniqueIds.length === 0) return true;

  const rows = await db
    .select({ id: organizationContactGroupsTable.id })
    .from(organizationContactGroupsTable)
    .where(
      and(
        inArray(organizationContactGroupsTable.id, uniqueIds),
        eq(organizationContactGroupsTable.organizationId, orgId),
      ),
    );

  return rows.length === uniqueIds.length;
}

function serializeContact(row: {
  id: number;
  sourceType: string;
  sourceUserId: number | null;
  sourceEmployeeId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  classificationType: string;
  classificationDescription: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): OrganizationContactRecord {
  return {
    id: row.id,
    sourceType: row.sourceType as OrganizationContactRecord["sourceType"],
    sourceId: row.sourceUserId ?? row.sourceEmployeeId ?? null,
    name: row.name,
    email: row.email,
    phone: row.phone,
    organizationName: row.organizationName,
    classificationType:
      row.classificationType as OrganizationContactRecord["classificationType"],
    classificationDescription: row.classificationDescription,
    notes: row.notes,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listOrganizationContacts(
  orgId: number,
  options?: {
    search?: string;
    includeArchived?: boolean;
    contactIds?: number[];
  },
): Promise<OrganizationContactRecord[]> {
  const conditions = [eq(organizationContactsTable.organizationId, orgId)];

  if (!options?.includeArchived) {
    conditions.push(isNull(organizationContactsTable.archivedAt));
  }

  if (options?.contactIds && options.contactIds.length > 0) {
    conditions.push(inArray(organizationContactsTable.id, options.contactIds));
  }

  const search = options?.search?.trim();
  if (search) {
    const escapedSearch = escapeLikePattern(search);
    conditions.push(
      or(
        ilike(organizationContactsTable.name, `%${escapedSearch}%`),
        ilike(organizationContactsTable.email, `%${escapedSearch}%`),
        ilike(organizationContactsTable.organizationName, `%${escapedSearch}%`),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(organizationContactsTable)
    .where(and(...conditions))
    .orderBy(organizationContactsTable.name);

  return rows.map(serializeContact);
}

export async function listOrganizationContactGroups(
  orgId: number,
  options?: { groupIds?: number[] },
): Promise<OrganizationContactGroupRecord[]> {
  if (options?.groupIds && options.groupIds.length === 0) {
    return [];
  }

  const conditions = [eq(organizationContactGroupsTable.organizationId, orgId)];
  if (options?.groupIds && options.groupIds.length > 0) {
    conditions.push(inArray(organizationContactGroupsTable.id, options.groupIds));
  }

  const groups = await db
    .select()
    .from(organizationContactGroupsTable)
    .where(and(...conditions))
    .orderBy(organizationContactGroupsTable.name);

  if (groups.length === 0) {
    return [];
  }

  const memberRows = await db
    .select({
      groupId: organizationContactGroupMembersTable.groupId,
      contactId: organizationContactsTable.id,
      sourceType: organizationContactsTable.sourceType,
      sourceUserId: organizationContactsTable.sourceUserId,
      sourceEmployeeId: organizationContactsTable.sourceEmployeeId,
      name: organizationContactsTable.name,
      email: organizationContactsTable.email,
      phone: organizationContactsTable.phone,
      organizationName: organizationContactsTable.organizationName,
      classificationType: organizationContactsTable.classificationType,
      classificationDescription:
        organizationContactsTable.classificationDescription,
      notes: organizationContactsTable.notes,
      archivedAt: organizationContactsTable.archivedAt,
      createdAt: organizationContactsTable.createdAt,
      updatedAt: organizationContactsTable.updatedAt,
    })
    .from(organizationContactGroupMembersTable)
    .innerJoin(
      organizationContactsTable,
      eq(organizationContactGroupMembersTable.contactId, organizationContactsTable.id),
    )
    .where(
      inArray(
        organizationContactGroupMembersTable.groupId,
        groups.map((group) => group.id),
      ),
    );

  const membersByGroup = new Map<number, OrganizationContactRecord[]>();
  for (const row of memberRows) {
    const current = membersByGroup.get(row.groupId) ?? [];
    current.push(
      serializeContact({
        id: row.contactId,
        sourceType: row.sourceType,
        sourceUserId: row.sourceUserId,
        sourceEmployeeId: row.sourceEmployeeId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        organizationName: row.organizationName,
        classificationType: row.classificationType,
        classificationDescription: row.classificationDescription,
        notes: row.notes,
        archivedAt: row.archivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
    membersByGroup.set(row.groupId, current);
  }

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: (membersByGroup.get(group.id) ?? []).length,
    members: membersByGroup.get(group.id) ?? [],
  }));
}
