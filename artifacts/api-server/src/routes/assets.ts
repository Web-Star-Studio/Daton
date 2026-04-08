import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, assetsTable, employeesTable, assetDocumentsTable, documentsTable, assetMaintenancePlansTable } from "@workspace/db";
import {
  ListAssetsParams,
  CreateAssetParams,
  CreateAssetBody,
  GetAssetParams,
  UpdateAssetParams,
  UpdateAssetBody,
  DeleteAssetParams,
  ListAssetDocumentsParams,
  AddAssetDocumentParams,
  AddAssetDocumentBody,
  RemoveAssetDocumentParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

function serializeAsset(
  a: typeof assetsTable.$inferSelect,
  responsibleName?: string | null,
  activePlanCount = 0,
  overdueCount = 0,
  nearestDueAt: string | null = null,
  hasPartialExecution = false,
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
    activePlanCount,
    overdueCount,
    nearestDueAt,
    hasPartialExecution,
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

  const today = new Date().toISOString().slice(0, 10);

  // Subquery: aggregate plan stats per asset (only active plans)
  const planStatsSq = db
    .select({
      assetId: assetMaintenancePlansTable.assetId,
      activePlanCount: sql<number>`cast(count(*) as int)`.as("active_plan_count"),
      overdueCount: sql<number>`cast(count(case when next_due_at is not null and next_due_at < ${today} then 1 end) as int)`.as("overdue_count"),
      nearestDueAt: sql<string | null>`min(next_due_at)`.as("nearest_due_at"),
    })
    .from(assetMaintenancePlansTable)
    .where(eq(assetMaintenancePlansTable.isActive, true))
    .groupBy(assetMaintenancePlansTable.assetId)
    .as("plan_stats");

  const rows = await db
    .select({
      asset: assetsTable,
      responsibleName: employeesTable.name,
      activePlanCount: planStatsSq.activePlanCount,
      overdueCount: planStatsSq.overdueCount,
      nearestDueAt: planStatsSq.nearestDueAt,
      hasPartialExecution: sql<boolean>`exists(
        select 1 from asset_maintenance_plans p
        join asset_maintenance_records r on r.plan_id = p.id
        where p.asset_id = ${assetsTable.id}
          and p.is_active = true
          and r.status = 'parcial'
          and r.executed_at = (
            select max(r2.executed_at) from asset_maintenance_records r2
            where r2.plan_id = p.id
          )
      )`,
    })
    .from(assetsTable)
    .leftJoin(employeesTable, eq(assetsTable.responsibleId, employeesTable.id))
    .leftJoin(planStatsSq, eq(assetsTable.id, planStatsSq.assetId))
    .where(eq(assetsTable.organizationId, params.data.orgId))
    .orderBy(assetsTable.createdAt, assetsTable.id);

  res.json(rows.map((r) => serializeAsset(
    r.asset,
    r.responsibleName,
    r.activePlanCount ?? 0,
    r.overdueCount ?? 0,
    r.nearestDueAt ?? null,
    r.hasPartialExecution ?? false,
  )));
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

// --- Asset document links ---

router.get("/organizations/:orgId/assets/:assetId/documents", requireAuth, async (req, res): Promise<void> => {
  const params = ListAssetDocumentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const rows = await db
    .select({
      id: assetDocumentsTable.id,
      assetId: assetDocumentsTable.assetId,
      documentId: assetDocumentsTable.documentId,
      documentTitle: documentsTable.title,
      documentType: documentsTable.type,
      documentStatus: documentsTable.status,
      createdAt: assetDocumentsTable.createdAt,
    })
    .from(assetDocumentsTable)
    .innerJoin(documentsTable, eq(assetDocumentsTable.documentId, documentsTable.id))
    .where(
      and(
        eq(assetDocumentsTable.assetId, params.data.assetId),
        eq(documentsTable.organizationId, params.data.orgId),
      ),
    )
    .orderBy(documentsTable.title);

  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/organizations/:orgId/assets/:assetId/documents", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = AddAssetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = AddAssetDocumentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // Verify document belongs to org
  const [doc] = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(and(eq(documentsTable.id, body.data.documentId), eq(documentsTable.organizationId, params.data.orgId)));

  if (!doc) {
    res.status(404).json({ error: "Documento não encontrado" });
    return;
  }

  const [link] = await db
    .insert(assetDocumentsTable)
    .values({ assetId: params.data.assetId, documentId: body.data.documentId })
    .onConflictDoNothing()
    .returning();

  if (!link) {
    res.status(409).json({ error: "Documento já vinculado a este ativo" });
    return;
  }

  res.status(201).json({ ...link, createdAt: link.createdAt.toISOString() });
});

router.delete("/organizations/:orgId/assets/:assetId/documents/:documentId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = RemoveAssetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  await db
    .delete(assetDocumentsTable)
    .where(
      and(
        eq(assetDocumentsTable.assetId, params.data.assetId),
        eq(assetDocumentsTable.documentId, params.data.documentId),
      ),
    );

  res.sendStatus(204);
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
