import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  documentRecipientGroupLinksTable,
  employeesTable,
  organizationContactGroupMembersTable,
  organizationContactGroupsTable,
  organizationContactsTable,
  usersTable,
} from "@workspace/db";
import {
  listOrganizationContactGroups,
  listOrganizationContacts,
  OrganizationContactBodySchema,
  OrganizationContactsParamsSchema,
  OrganizationContactGroupBodySchema,
  UpdateOrganizationContactBodySchema,
  UpdateOrganizationContactGroupBodySchema,
  validateOrgContactGroupIds,
  validateOrgContactIds,
} from "./organization-contacts.shared";
import {
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccess,
  requireRole,
} from "../middlewares/auth";

const router: IRouter = Router();

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function redactGroupMembersForNonAdmins<
  T extends Awaited<ReturnType<typeof listOrganizationContactGroups>>,
>(groups: T): T {
  return groups.map((group) => ({
    ...group,
    members: group.members.map((member) => ({
      ...member,
      email: null,
      phone: null,
      organizationName: null,
      classificationDescription: null,
      notes: null,
    })),
  })) as T;
}

async function resolveContactValues(
  orgId: number,
  input:
    | typeof OrganizationContactBodySchema._type
    | (typeof UpdateOrganizationContactBodySchema._type & {
        fallbackSourceType: "system_user" | "employee" | "external_contact";
        fallbackSourceId: number | null;
        fallbackName: string;
        fallbackEmail: string | null;
      }),
) {
  const sourceType =
    "fallbackSourceType" in input
      ? input.sourceType ?? input.fallbackSourceType
      : input.sourceType;

  if (sourceType === "system_user") {
    const sourceId =
      input.sourceId ??
      ("fallbackSourceId" in input ? input.fallbackSourceId : null);
    if (!sourceId) {
      return { error: "Selecione um usuário da organização" as const };
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(
        and(eq(usersTable.id, sourceId), eq(usersTable.organizationId, orgId)),
      );

    if (!user) {
      return { error: "Usuário não encontrado nesta organização" as const };
    }

    return {
      values: {
        sourceType,
        sourceUserId: user.id,
        sourceEmployeeId: null,
        name: user.name,
        email: user.email,
      },
    };
  }

  if (sourceType === "employee") {
    const sourceId =
      input.sourceId ??
      ("fallbackSourceId" in input ? input.fallbackSourceId : null);
    if (!sourceId) {
      return { error: "Selecione um colaborador da organização" as const };
    }

    const [employee] = await db
      .select({
        id: employeesTable.id,
        name: employeesTable.name,
        email: employeesTable.email,
        phone: employeesTable.phone,
      })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, sourceId),
          eq(employeesTable.organizationId, orgId),
        ),
      );

    if (!employee) {
      return { error: "Colaborador não encontrado nesta organização" as const };
    }

    return {
      values: {
        sourceType,
        sourceUserId: null,
        sourceEmployeeId: employee.id,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
      },
    };
  }

  const name =
    ("name" in input ? normalizeOptionalText(input.name) : null) ||
    ("fallbackName" in input ? input.fallbackName.trim() : "");
  const email =
    ("email" in input ? normalizeOptionalText(input.email) : null) ??
    ("fallbackEmail" in input ? input.fallbackEmail : null);

  if (!name || !email) {
    return {
      error:
        "Contatos externos precisam informar nome e email válidos" as const,
    };
  }

  return {
    values: {
      sourceType,
      sourceUserId: null,
      sourceEmployeeId: null,
      name,
      email,
    },
  };
}

router.get(
  "/organizations/:orgId/contacts",
  requireAuth,
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = OrganizationContactsParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const search =
      typeof req.query.search === "string" ? req.query.search : undefined;
    const includeArchived = req.query.includeArchived === "true";
    const contacts = await listOrganizationContacts(params.data.orgId, {
      search,
      includeArchived,
    });
    res.json(contacts);
  },
);

router.post(
  "/organizations/:orgId/contacts",
  requireAuth,
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = OrganizationContactsParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = OrganizationContactBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const resolved = await resolveContactValues(params.data.orgId, body.data);
    if ("error" in resolved) {
      res.status(400).json({ error: resolved.error });
      return;
    }

    try {
      const [created] = await db
        .insert(organizationContactsTable)
        .values({
          organizationId: params.data.orgId,
          createdById: req.auth!.userId,
          ...resolved.values,
          phone:
            body.data.sourceType === "external_contact"
              ? normalizeOptionalText(body.data.phone)
              : normalizeOptionalText(body.data.phone) || resolved.values.phone || null,
          organizationName: normalizeOptionalText(body.data.organizationName),
          classificationType: body.data.classificationType,
          classificationDescription:
            normalizeOptionalText(body.data.classificationDescription),
          notes: normalizeOptionalText(body.data.notes),
        })
        .returning({ id: organizationContactsTable.id });

      const [contact] = await listOrganizationContacts(params.data.orgId, {
        includeArchived: true,
        contactIds: [created.id],
      });
      res.status(201).json(contact);
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined;

      if (code === "23505") {
        res.status(400).json({
          error:
            "Já existe um contato reutilizável para este usuário ou colaborador",
        });
        return;
      }

      throw error;
    }
  },
);

router.patch(
  "/organizations/:orgId/contacts/:contactId",
  requireAuth,
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = OrganizationContactsParamsSchema.safeParse(req.params);
    if (!params.success || !params.data.contactId) {
      res.status(400).json({
        error: params.success ? "contactId inválido" : params.error.message,
      });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = UpdateOrganizationContactBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(organizationContactsTable)
      .where(
        and(
          eq(organizationContactsTable.id, params.data.contactId),
          eq(organizationContactsTable.organizationId, params.data.orgId),
        ),
      );

    if (!existing) {
      res.status(404).json({ error: "Contato não encontrado" });
      return;
    }

    const nextSourceType = body.data.sourceType ?? existing.sourceType;
    const existingSourceId =
      existing.sourceType === "system_user"
        ? existing.sourceUserId
        : existing.sourceType === "employee"
          ? existing.sourceEmployeeId
          : null;
    const nextSourceId =
      body.data.sourceId !== undefined ? body.data.sourceId : existingSourceId;
    const shouldRefreshSourceSnapshot =
      existing.sourceType === "external_contact" ||
      nextSourceType === "external_contact" ||
      nextSourceType !== existing.sourceType ||
      nextSourceId !== existingSourceId;

    const resolved = shouldRefreshSourceSnapshot
      ? await resolveContactValues(params.data.orgId, {
          ...body.data,
          fallbackSourceType: existing.sourceType as
            | "system_user"
            | "employee"
            | "external_contact",
          fallbackSourceId: existingSourceId,
          fallbackName: existing.name,
          fallbackEmail: existing.email,
        })
      : {
          values: {
            sourceType: existing.sourceType as
              | "system_user"
              | "employee"
              | "external_contact",
            sourceUserId: existing.sourceUserId,
            sourceEmployeeId: existing.sourceEmployeeId,
            name: existing.name,
            email: existing.email,
            phone: existing.phone,
          },
        };
    if ("error" in resolved) {
      res.status(400).json({ error: resolved.error });
      return;
    }

    try {
      await db
        .update(organizationContactsTable)
        .set({
          ...resolved.values,
          phone:
            resolved.values.sourceType === "external_contact"
              ? normalizeOptionalText(body.data.phone) ?? existing.phone
              : normalizeOptionalText(body.data.phone) ||
                resolved.values.phone ||
                existing.phone,
          organizationName:
            body.data.organizationName !== undefined
              ? normalizeOptionalText(body.data.organizationName)
              : existing.organizationName,
          classificationType:
            body.data.classificationType ?? existing.classificationType,
          classificationDescription:
            body.data.classificationDescription !== undefined
              ? normalizeOptionalText(body.data.classificationDescription)
              : existing.classificationDescription,
          notes:
            body.data.notes !== undefined
              ? normalizeOptionalText(body.data.notes)
              : existing.notes,
          archivedAt:
            body.data.archived === undefined
              ? existing.archivedAt
              : body.data.archived
                ? existing.archivedAt ?? new Date()
                : null,
        })
        .where(eq(organizationContactsTable.id, params.data.contactId));
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined;

      if (code === "23505") {
        res.status(400).json({
          error:
            "Já existe um contato reutilizável para este usuário ou colaborador",
        });
        return;
      }

      throw error;
    }

    const [contact] = await listOrganizationContacts(params.data.orgId, {
      includeArchived: true,
      contactIds: [params.data.contactId],
    });
    res.json(contact);
  },
);

router.delete(
  "/organizations/:orgId/contacts/:contactId",
  requireAuth,
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = OrganizationContactsParamsSchema.safeParse(req.params);
    if (!params.success || !params.data.contactId) {
      res.status(400).json({
        error: params.success ? "contactId inválido" : params.error.message,
      });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [existing] = await db
      .select({ id: organizationContactsTable.id })
      .from(organizationContactsTable)
      .where(
        and(
          eq(organizationContactsTable.id, params.data.contactId),
          eq(organizationContactsTable.organizationId, params.data.orgId),
        ),
      );

    if (!existing) {
      res.status(404).json({ error: "Contato não encontrado" });
      return;
    }

    const [inUse] = await db
      .select({ id: organizationContactGroupMembersTable.id })
      .from(organizationContactGroupMembersTable)
      .where(eq(organizationContactGroupMembersTable.contactId, params.data.contactId))
      .limit(1);

    if (inUse) {
      res.status(400).json({
        error: "Este contato está vinculado a grupos e não pode ser excluído",
      });
      return;
    }

    await db
      .delete(organizationContactsTable)
      .where(eq(organizationContactsTable.id, params.data.contactId));

    res.status(204).send();
  },
);

router.get(
  "/organizations/:orgId/contact-groups",
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccess("documents"),
  async (req, res): Promise<void> => {
    const params = OrganizationContactsParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const groups = await listOrganizationContactGroups(params.data.orgId);
    const visibleGroups =
      req.auth!.role === "org_admin"
        ? groups
        : redactGroupMembersForNonAdmins(groups);
    res.json(visibleGroups);
  },
);

router.post(
  "/organizations/:orgId/contact-groups",
  requireAuth,
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = OrganizationContactsParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = OrganizationContactGroupBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const contactIds = [...new Set(body.data.contactIds)];
    if (!(await validateOrgContactIds(contactIds, params.data.orgId))) {
      res.status(400).json({
        error: "Um ou mais contatos selecionados não pertencem a esta organização",
      });
      return;
    }

    const [created] = await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(organizationContactGroupsTable)
        .values({
          organizationId: params.data.orgId,
          name: body.data.name.trim(),
          description: normalizeOptionalText(body.data.description),
          createdById: req.auth!.userId,
        })
        .returning({ id: organizationContactGroupsTable.id });

      await tx.insert(organizationContactGroupMembersTable).values(
        contactIds.map((contactId) => ({
          groupId: group.id,
          contactId,
        })),
      );

      return [group] as const;
    });

    const [group] = await listOrganizationContactGroups(params.data.orgId, {
      groupIds: [created.id],
    });
    res.status(201).json(group);
  },
);

router.get(
  "/organizations/:orgId/contact-groups/:groupId",
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccess("documents"),
  async (req, res): Promise<void> => {
    const params = OrganizationContactsParamsSchema.safeParse(req.params);
    if (!params.success || !params.data.groupId) {
      res.status(400).json({
        error: params.success ? "groupId inválido" : params.error.message,
      });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [group] = await listOrganizationContactGroups(params.data.orgId, {
      groupIds: [params.data.groupId],
    });

    if (!group) {
      res.status(404).json({ error: "Grupo não encontrado" });
      return;
    }

    const visibleGroup =
      req.auth!.role === "org_admin"
        ? group
        : redactGroupMembersForNonAdmins([group])[0];

    res.json(visibleGroup);
  },
);

router.patch(
  "/organizations/:orgId/contact-groups/:groupId",
  requireAuth,
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = OrganizationContactsParamsSchema.safeParse(req.params);
    if (!params.success || !params.data.groupId) {
      res.status(400).json({
        error: params.success ? "groupId inválido" : params.error.message,
      });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = UpdateOrganizationContactGroupBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    if (!(await validateOrgContactGroupIds([params.data.groupId], params.data.orgId))) {
      res.status(404).json({ error: "Grupo não encontrado" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (body.data.name !== undefined) {
      updates.name = body.data.name.trim();
    }
    if (body.data.description !== undefined) {
      updates.description = normalizeOptionalText(body.data.description);
    }

    if (body.data.contactIds !== undefined) {
      const contactIds = [...new Set(body.data.contactIds)];
      if (!(await validateOrgContactIds(contactIds, params.data.orgId))) {
        res.status(400).json({
          error:
            "Um ou mais contatos selecionados não pertencem a esta organização",
        });
        return;
      }

      await db.transaction(async (tx) => {
        if (Object.keys(updates).length > 0) {
          await tx
            .update(organizationContactGroupsTable)
            .set(updates)
            .where(eq(organizationContactGroupsTable.id, params.data.groupId!));
        }

        await tx
          .delete(organizationContactGroupMembersTable)
          .where(eq(organizationContactGroupMembersTable.groupId, params.data.groupId!));

        await tx.insert(organizationContactGroupMembersTable).values(
          contactIds.map((contactId) => ({
            groupId: params.data.groupId!,
            contactId,
          })),
        );
      });
    } else if (Object.keys(updates).length > 0) {
      await db
        .update(organizationContactGroupsTable)
        .set(updates)
        .where(eq(organizationContactGroupsTable.id, params.data.groupId));
    }

    const [group] = await listOrganizationContactGroups(params.data.orgId, {
      groupIds: [params.data.groupId],
    });
    res.json(group);
  },
);

router.delete(
  "/organizations/:orgId/contact-groups/:groupId",
  requireAuth,
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = OrganizationContactsParamsSchema.safeParse(req.params);
    if (!params.success || !params.data.groupId) {
      res.status(400).json({
        error: params.success ? "groupId inválido" : params.error.message,
      });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    if (!(await validateOrgContactGroupIds([params.data.groupId], params.data.orgId))) {
      res.status(404).json({ error: "Grupo não encontrado" });
      return;
    }

    const [linkedDocument] = await db
      .select({ id: documentRecipientGroupLinksTable.id })
      .from(documentRecipientGroupLinksTable)
      .where(eq(documentRecipientGroupLinksTable.groupId, params.data.groupId))
      .limit(1);

    if (linkedDocument) {
      res.status(400).json({
        error: "Este grupo está vinculado a documentos e não pode ser excluído",
      });
      return;
    }

    await db
      .delete(organizationContactGroupsTable)
      .where(eq(organizationContactGroupsTable.id, params.data.groupId));

    res.status(204).send();
  },
);

export default router;
