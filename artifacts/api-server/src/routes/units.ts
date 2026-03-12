import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, unitsTable } from "@workspace/db";
import {
  ListUnitsParams,
  CreateUnitParams,
  CreateUnitBody,
  GetUnitParams,
  UpdateUnitParams,
  UpdateUnitBody,
  DeleteUnitParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

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

  res.json(units.map(serializeUnit));
});

router.post("/organizations/:orgId/units", requireAuth, async (req, res): Promise<void> => {
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

  res.json(serializeUnit(unit));
});

router.patch("/organizations/:orgId/units/:unitId", requireAuth, async (req, res): Promise<void> => {
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

router.delete("/organizations/:orgId/units/:unitId", requireAuth, async (req, res): Promise<void> => {
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

export default router;
