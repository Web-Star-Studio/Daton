import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, unitsTable, unitManagersTable, usersTable } from "@workspace/db";
import {
  ListUnitsParams,
  CreateUnitParams,
  CreateUnitBody,
  GetUnitParams,
  UpdateUnitParams,
  UpdateUnitBody,
  DeleteUnitParams,
} from "@workspace/api-zod";
import { requireAuth, requireModuleAccess, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

function serializeUnit(u: typeof unitsTable.$inferSelect) {
  return {
    id: u.id,
    organizationId: u.organizationId,
    name: u.name,
    code: u.code,
    type: u.type,
    cnpj: u.cnpj,
    status: u.status,
    cep: u.cep,
    address: u.address,
    streetNumber: u.streetNumber,
    neighborhood: u.neighborhood,
    city: u.city,
    state: u.state,
    country: u.country,
    phone: u.phone,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

router.get("/organizations/:orgId/units", requireAuth, async (req, res): Promise<void> => {
  const params = ListUnitsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const units = await db.select().from(unitsTable)
    .where(eq(unitsTable.organizationId, params.data.orgId))
    .orderBy(unitsTable.createdAt);

  // Gestores por filial (N:N), resolvendo o nome do usuário.
  const managerRows = await db
    .select({
      unitId: unitManagersTable.unitId,
      userId: unitManagersTable.userId,
      userName: usersTable.name,
    })
    .from(unitManagersTable)
    .innerJoin(usersTable, eq(unitManagersTable.userId, usersTable.id))
    .where(eq(unitManagersTable.organizationId, params.data.orgId));
  const managersByUnit = new Map<
    number,
    { userId: number; userName: string }[]
  >();
  for (const m of managerRows) {
    const arr = managersByUnit.get(m.unitId) ?? [];
    arr.push({ userId: m.userId, userName: m.userName });
    managersByUnit.set(m.unitId, arr);
  }

  res.json(
    units.map((u) => ({
      ...serializeUnit(u),
      managers: managersByUnit.get(u.id) ?? [],
    })),
  );
});

router.post("/organizations/:orgId/units", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = CreateUnitBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [unit] = await db.insert(unitsTable).values({
    ...body.data,
    organizationId: params.data.orgId,
  }).returning();

  res.status(201).json(serializeUnit(unit));
});

router.get("/organizations/:orgId/units/:unitId", requireAuth, async (req, res): Promise<void> => {
  const params = GetUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [unit] = await db.select().from(unitsTable)
    .where(and(eq(unitsTable.id, params.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));

  if (!unit) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const managers = await db
    .select({ userId: unitManagersTable.userId, userName: usersTable.name })
    .from(unitManagersTable)
    .innerJoin(usersTable, eq(unitManagersTable.userId, usersTable.id))
    .where(eq(unitManagersTable.unitId, params.data.unitId));

  res.json({ ...serializeUnit(unit), managers });
});

router.patch("/organizations/:orgId/units/:unitId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = UpdateUnitBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [unit] = await db.update(unitsTable)
    .set(body.data)
    .where(and(eq(unitsTable.id, params.data.unitId), eq(unitsTable.organizationId, params.data.orgId)))
    .returning();

  if (!unit) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  res.json(serializeUnit(unit));
});

router.delete("/organizations/:orgId/units/:unitId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [unit] = await db.delete(unitsTable)
    .where(and(eq(unitsTable.id, params.data.unitId), eq(unitsTable.organizationId, params.data.orgId)))
    .returning();

  if (!unit) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  res.sendStatus(204);
});

// Define os gestores de uma filial (N:N). Substitui a lista inteira.
router.put(
  "/organizations/:orgId/units/:unitId/managers",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = z
      .object({
        orgId: z.coerce.number().int(),
        unitId: z.coerce.number().int(),
      })
      .safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = z
      .object({ userIds: z.array(z.number().int()) })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [unit] = await db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(
        and(
          eq(unitsTable.id, params.data.unitId),
          eq(unitsTable.organizationId, params.data.orgId),
        ),
      );
    if (!unit) {
      res.status(404).json({ error: "Unidade não encontrada" });
      return;
    }

    const uniqueUserIds = Array.from(new Set(body.data.userIds));
    if (uniqueUserIds.length > 0) {
      const valid = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            inArray(usersTable.id, uniqueUserIds),
            eq(usersTable.organizationId, params.data.orgId),
          ),
        );
      if (valid.length !== uniqueUserIds.length) {
        res.status(400).json({ error: "Um ou mais usuários inválidos" });
        return;
      }
    }

    // Substitui a lista de gestores da unidade.
    await db
      .delete(unitManagersTable)
      .where(eq(unitManagersTable.unitId, params.data.unitId));
    if (uniqueUserIds.length > 0) {
      await db.insert(unitManagersTable).values(
        uniqueUserIds.map((userId) => ({
          organizationId: params.data.orgId,
          unitId: params.data.unitId,
          userId,
        })),
      );
    }

    const rows = await db
      .select({ userId: unitManagersTable.userId, userName: usersTable.name })
      .from(unitManagersTable)
      .innerJoin(usersTable, eq(unitManagersTable.userId, usersTable.id))
      .where(eq(unitManagersTable.unitId, params.data.unitId));
    res.json({ unitId: params.data.unitId, managers: rows });
  },
);

export default router;
