import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, assetsTable, employeesTable } from "@workspace/db";
import {
  ListAssetsParams,
  CreateAssetParams,
  CreateAssetBody,
  GetAssetParams,
  UpdateAssetParams,
  UpdateAssetBody,
  DeleteAssetParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

function serializeAsset(
  a: typeof assetsTable.$inferSelect,
  responsibleName?: string | null,
) {
  return {
    id: a.id,
    organizationId: a.organizationId,
    unitId: a.unitId,
    name: a.name,
    assetType: a.assetType,
    criticality: a.criticality,
    status: a.status,
    location: a.location,
    impactedProcess: a.impactedProcess,
    responsibleId: a.responsibleId,
    responsibleName: responsibleName ?? null,
    description: a.description,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

router.get("/organizations/:orgId/assets", requireAuth, async (req, res): Promise<void> => {
  const params = ListAssetsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const rows = await db
    .select({ asset: assetsTable, responsibleName: employeesTable.name })
    .from(assetsTable)
    .leftJoin(employeesTable, eq(assetsTable.responsibleId, employeesTable.id))
    .where(eq(assetsTable.organizationId, params.data.orgId))
    .orderBy(assetsTable.createdAt);

  res.json(rows.map((r) => serializeAsset(r.asset, r.responsibleName)));
});

router.post("/organizations/:orgId/assets", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = CreateAssetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [asset] = await db.insert(assetsTable).values({
    ...body.data,
    organizationId: params.data.orgId,
  }).returning();

  res.status(201).json(serializeAsset(asset, null));
});

router.get("/organizations/:orgId/assets/:assetId", requireAuth, async (req, res): Promise<void> => {
  const params = GetAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [row] = await db
    .select({ asset: assetsTable, responsibleName: employeesTable.name })
    .from(assetsTable)
    .leftJoin(employeesTable, eq(assetsTable.responsibleId, employeesTable.id))
    .where(and(eq(assetsTable.id, params.data.assetId), eq(assetsTable.organizationId, params.data.orgId)));

  if (!row) {
    res.status(404).json({ error: "Ativo não encontrado" });
    return;
  }

  res.json(serializeAsset(row.asset, row.responsibleName));
});

router.patch("/organizations/:orgId/assets/:assetId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = UpdateAssetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [asset] = await db.update(assetsTable)
    .set(body.data)
    .where(and(eq(assetsTable.id, params.data.assetId), eq(assetsTable.organizationId, params.data.orgId)))
    .returning();

  if (!asset) {
    res.status(404).json({ error: "Ativo não encontrado" });
    return;
  }

  res.json(serializeAsset(asset, null));
});

router.delete("/organizations/:orgId/assets/:assetId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [asset] = await db.delete(assetsTable)
    .where(and(eq(assetsTable.id, params.data.assetId), eq(assetsTable.organizationId, params.data.orgId)))
    .returning();

  if (!asset) {
    res.status(404).json({ error: "Ativo não encontrado" });
    return;
  }

  res.sendStatus(204);
});

export default router;
