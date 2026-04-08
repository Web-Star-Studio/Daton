import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import {
  db,
  assetsTable,
  assetMaintenancePlansTable,
  assetMaintenanceRecordsTable,
  assetMaintenanceAttachmentsTable,
  employeesTable,
} from "@workspace/db";
import {
  ListAssetMaintenancePlansParams,
  CreateAssetMaintenancePlanParams,
  CreateAssetMaintenancePlanBody,
  UpdateAssetMaintenancePlanParams,
  UpdateAssetMaintenancePlanBody,
  DeleteAssetMaintenancePlanParams,
  ListAssetMaintenanceRecordsParams,
  CreateAssetMaintenanceRecordParams,
  CreateAssetMaintenanceRecordBody,
  DeleteAssetMaintenanceRecordParams,
  ListMaintenanceRecordAttachmentsParams,
  AddMaintenanceRecordAttachmentParams,
  AddMaintenanceRecordAttachmentBody,
  DeleteMaintenanceRecordAttachmentParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

// --- Helpers ---

const PERIODICITY_DAYS: Record<string, number | null> = {
  semanal: 7,
  mensal: 30,
  trimestral: 90,
  semestral: 180,
  anual: 365,
  unica: null,
};

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function serializePlan(
  plan: typeof assetMaintenancePlansTable.$inferSelect,
  responsibleName?: string | null,
  recordCount = 0,
) {
  return {
    id: plan.id,
    organizationId: plan.organizationId,
    assetId: plan.assetId,
    title: plan.title,
    type: plan.type,
    periodicity: plan.periodicity,
    checklistItems: plan.checklistItems,
    responsibleId: plan.responsibleId,
    responsibleName: responsibleName ?? null,
    nextDueAt: plan.nextDueAt ?? null,
    isActive: plan.isActive,
    recordCount,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function serializeRecord(
  rec: typeof assetMaintenanceRecordsTable.$inferSelect,
  executedByName?: string | null,
) {
  return {
    id: rec.id,
    organizationId: rec.organizationId,
    planId: rec.planId,
    assetId: rec.assetId,
    executedAt: rec.executedAt.toISOString(),
    executedById: rec.executedById,
    executedByName: executedByName ?? null,
    status: rec.status,
    notes: rec.notes,
    createdAt: rec.createdAt.toISOString(),
  };
}

async function verifyAssetOwnership(orgId: number, assetId: number): Promise<boolean> {
  const [asset] = await db
    .select({ id: assetsTable.id })
    .from(assetsTable)
    .where(and(eq(assetsTable.id, assetId), eq(assetsTable.organizationId, orgId)));
  return !!asset;
}

async function verifyPlanOwnership(orgId: number, assetId: number, planId: number): Promise<boolean> {
  const [plan] = await db
    .select({ id: assetMaintenancePlansTable.id })
    .from(assetMaintenancePlansTable)
    .where(
      and(
        eq(assetMaintenancePlansTable.id, planId),
        eq(assetMaintenancePlansTable.assetId, assetId),
        eq(assetMaintenancePlansTable.organizationId, orgId),
      ),
    );
  return !!plan;
}

// --- Maintenance plans ---

router.get(
  "/organizations/:orgId/assets/:assetId/maintenance-plans",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListAssetMaintenancePlansParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select({
        plan: assetMaintenancePlansTable,
        responsibleName: employeesTable.name,
        recordCount: sql<number>`cast(count(${assetMaintenanceRecordsTable.id}) as int)`,
      })
      .from(assetMaintenancePlansTable)
      .leftJoin(employeesTable, eq(assetMaintenancePlansTable.responsibleId, employeesTable.id))
      .leftJoin(assetMaintenanceRecordsTable, eq(assetMaintenancePlansTable.id, assetMaintenanceRecordsTable.planId))
      .where(
        and(
          eq(assetMaintenancePlansTable.assetId, params.data.assetId),
          eq(assetMaintenancePlansTable.organizationId, params.data.orgId),
        ),
      )
      .groupBy(assetMaintenancePlansTable.id, employeesTable.name)
      .orderBy(assetMaintenancePlansTable.createdAt);

    res.json(rows.map((r) => serializePlan(r.plan, r.responsibleName, r.recordCount)));
  },
);

router.post(
  "/organizations/:orgId/assets/:assetId/maintenance-plans",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateAssetMaintenancePlanParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    if (!(await verifyAssetOwnership(params.data.orgId, params.data.assetId))) {
      res.status(404).json({ error: "Ativo não encontrado" }); return;
    }

    const body = CreateAssetMaintenancePlanBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [plan] = await db
      .insert(assetMaintenancePlansTable)
      .values({
        organizationId: params.data.orgId,
        assetId: params.data.assetId,
        title: body.data.title,
        type: body.data.type ?? "preventiva",
        periodicity: body.data.periodicity ?? "mensal",
        checklistItems: body.data.checklistItems ?? [],
        responsibleId: body.data.responsibleId ?? null,
        nextDueAt: body.data.nextDueAt ?? null,
      })
      .returning();

    res.status(201).json(serializePlan(plan, null));
  },
);

router.patch(
  "/organizations/:orgId/assets/:assetId/maintenance-plans/:planId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateAssetMaintenancePlanParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateAssetMaintenancePlanBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [plan] = await db
      .update(assetMaintenancePlansTable)
      .set(body.data)
      .where(
        and(
          eq(assetMaintenancePlansTable.id, params.data.planId),
          eq(assetMaintenancePlansTable.assetId, params.data.assetId),
          eq(assetMaintenancePlansTable.organizationId, params.data.orgId),
        ),
      )
      .returning();

    if (!plan) { res.status(404).json({ error: "Plano não encontrado" }); return; }

    res.json(serializePlan(plan, null));
  },
);

router.delete(
  "/organizations/:orgId/assets/:assetId/maintenance-plans/:planId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteAssetMaintenancePlanParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(assetMaintenancePlansTable)
      .where(
        and(
          eq(assetMaintenancePlansTable.id, params.data.planId),
          eq(assetMaintenancePlansTable.assetId, params.data.assetId),
          eq(assetMaintenancePlansTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

// --- Maintenance records ---

router.get(
  "/organizations/:orgId/assets/:assetId/maintenance-plans/:planId/records",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListAssetMaintenanceRecordsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select({ record: assetMaintenanceRecordsTable, executedByName: employeesTable.name })
      .from(assetMaintenanceRecordsTable)
      .leftJoin(employeesTable, eq(assetMaintenanceRecordsTable.executedById, employeesTable.id))
      .where(
        and(
          eq(assetMaintenanceRecordsTable.planId, params.data.planId),
          eq(assetMaintenanceRecordsTable.assetId, params.data.assetId),
          eq(assetMaintenanceRecordsTable.organizationId, params.data.orgId),
        ),
      )
      .orderBy(desc(assetMaintenanceRecordsTable.executedAt));

    res.json(rows.map((r) => serializeRecord(r.record, r.executedByName)));
  },
);

router.post(
  "/organizations/:orgId/assets/:assetId/maintenance-plans/:planId/records",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateAssetMaintenanceRecordParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    if (!(await verifyPlanOwnership(params.data.orgId, params.data.assetId, params.data.planId))) {
      res.status(404).json({ error: "Plano não encontrado" }); return;
    }

    const body = CreateAssetMaintenanceRecordBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const executedAt = new Date(body.data.executedAt);

    const [record] = await db
      .insert(assetMaintenanceRecordsTable)
      .values({
        organizationId: params.data.orgId,
        planId: params.data.planId,
        assetId: params.data.assetId,
        executedAt,
        executedById: body.data.executedById ?? null,
        status: body.data.status,
        notes: body.data.notes ?? null,
      })
      .returning();

    // Recalculate nextDueAt on the plan when execution is conclusive
    if (body.data.status === "concluida" || body.data.status === "parcial") {
      const [plan] = await db
        .select({ periodicity: assetMaintenancePlansTable.periodicity })
        .from(assetMaintenancePlansTable)
        .where(eq(assetMaintenancePlansTable.id, params.data.planId));

      if (plan) {
        const days = PERIODICITY_DAYS[plan.periodicity];
        const nextDueAt = days != null ? addDays(executedAt, days) : null;
        await db
          .update(assetMaintenancePlansTable)
          .set({ nextDueAt })
          .where(eq(assetMaintenancePlansTable.id, params.data.planId));
      }
    }

    res.status(201).json(serializeRecord(record, null));
  },
);

router.delete(
  "/organizations/:orgId/assets/:assetId/maintenance-plans/:planId/records/:recordId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteAssetMaintenanceRecordParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(assetMaintenanceRecordsTable)
      .where(
        and(
          eq(assetMaintenanceRecordsTable.id, params.data.recordId),
          eq(assetMaintenanceRecordsTable.planId, params.data.planId),
          eq(assetMaintenanceRecordsTable.assetId, params.data.assetId),
          eq(assetMaintenanceRecordsTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

// --- Maintenance record attachments ---

router.get(
  "/organizations/:orgId/assets/:assetId/maintenance-plans/:planId/records/:recordId/attachments",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListMaintenanceRecordAttachmentsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select()
      .from(assetMaintenanceAttachmentsTable)
      .where(
        and(
          eq(assetMaintenanceAttachmentsTable.recordId, params.data.recordId),
          eq(assetMaintenanceAttachmentsTable.organizationId, params.data.orgId),
        ),
      )
      .orderBy(assetMaintenanceAttachmentsTable.uploadedAt);

    res.json(rows.map((a) => ({ ...a, uploadedAt: a.uploadedAt.toISOString() })));
  },
);

router.post(
  "/organizations/:orgId/assets/:assetId/maintenance-plans/:planId/records/:recordId/attachments",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = AddMaintenanceRecordAttachmentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    // Verify record belongs to org/plan/asset
    const [record] = await db
      .select({ id: assetMaintenanceRecordsTable.id })
      .from(assetMaintenanceRecordsTable)
      .where(
        and(
          eq(assetMaintenanceRecordsTable.id, params.data.recordId),
          eq(assetMaintenanceRecordsTable.planId, params.data.planId),
          eq(assetMaintenanceRecordsTable.assetId, params.data.assetId),
          eq(assetMaintenanceRecordsTable.organizationId, params.data.orgId),
        ),
      );

    if (!record) { res.status(404).json({ error: "Registro não encontrado" }); return; }

    const body = AddMaintenanceRecordAttachmentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [attachment] = await db
      .insert(assetMaintenanceAttachmentsTable)
      .values({
        organizationId: params.data.orgId,
        recordId: params.data.recordId,
        fileName: body.data.fileName,
        fileSize: body.data.fileSize,
        contentType: body.data.contentType,
        objectPath: body.data.objectPath,
      })
      .returning();

    res.status(201).json({ ...attachment, uploadedAt: attachment.uploadedAt.toISOString() });
  },
);

router.delete(
  "/organizations/:orgId/assets/:assetId/maintenance-plans/:planId/records/:recordId/attachments/:attachmentId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteMaintenanceRecordAttachmentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(assetMaintenanceAttachmentsTable)
      .where(
        and(
          eq(assetMaintenanceAttachmentsTable.id, params.data.attachmentId),
          eq(assetMaintenanceAttachmentsTable.recordId, params.data.recordId),
          eq(assetMaintenanceAttachmentsTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

export default router;
