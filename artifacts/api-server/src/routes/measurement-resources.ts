import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  measurementResourcesTable,
  measurementResourceCalibrationsTable,
  measurementResourceAttachmentsTable,
  employeesTable,
  unitsTable,
} from "@workspace/db";
import {
  ListMeasurementResourcesParams,
  ListMeasurementResourcesQueryParams,
  CreateMeasurementResourceParams,
  CreateMeasurementResourceBody,
  UpdateMeasurementResourceParams,
  UpdateMeasurementResourceBody,
  DeleteMeasurementResourceParams,
  ListMeasurementResourceCalibrationsParams,
  CreateMeasurementResourceCalibrationParams,
  CreateMeasurementResourceCalibrationBody,
  DeleteMeasurementResourceCalibrationParams,
  ListMeasurementResourceAttachmentsParams,
  AddMeasurementResourceAttachmentParams,
  AddMeasurementResourceAttachmentBody,
  DeleteMeasurementResourceAttachmentParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

// --- Serializers ---

function serializeResource(
  r: typeof measurementResourcesTable.$inferSelect,
  responsibleName: string | null,
  unitName: string | null,
  calibrationCount: number,
  lastCalibrationAt: string | null,
  lastCalibrationResult: string | null,
) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    unitId: r.unitId,
    unitName,
    name: r.name,
    identifier: r.identifier,
    resourceType: r.resourceType,
    responsibleId: r.responsibleId,
    responsibleName,
    validUntil: r.validUntil,
    status: r.status,
    notes: r.notes,
    calibrationCount,
    lastCalibrationAt,
    lastCalibrationResult,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeCalibration(
  c: typeof measurementResourceCalibrationsTable.$inferSelect,
  calibratedByName: string | null,
) {
  return {
    id: c.id,
    organizationId: c.organizationId,
    resourceId: c.resourceId,
    calibratedAt: c.calibratedAt,
    calibratedById: c.calibratedById,
    calibratedByName,
    certificateNumber: c.certificateNumber,
    result: c.result,
    nextDueAt: c.nextDueAt,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
  };
}

// --- Resources ---

router.get(
  "/organizations/:orgId/measurement-resources",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListMeasurementResourcesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const query = ListMeasurementResourcesQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

    // Subquery: last calibration per resource
    const lastCalibSq = db
      .select({
        resourceId: measurementResourceCalibrationsTable.resourceId,
        calibratedAt: measurementResourceCalibrationsTable.calibratedAt,
        result: measurementResourceCalibrationsTable.result,
      })
      .from(measurementResourceCalibrationsTable)
      .where(
        sql`(${measurementResourceCalibrationsTable.resourceId}, ${measurementResourceCalibrationsTable.calibratedAt}) in (
          select resource_id, max(calibrated_at)
          from measurement_resource_calibrations
          group by resource_id
        )`,
      )
      .as("last_calib");

    const conditions = [eq(measurementResourcesTable.organizationId, params.data.orgId)];
    if (query.data.unitId) conditions.push(eq(measurementResourcesTable.unitId, query.data.unitId));
    if (query.data.resourceType) conditions.push(eq(measurementResourcesTable.resourceType, query.data.resourceType));
    if (query.data.status) conditions.push(eq(measurementResourcesTable.status, query.data.status));

    const rows = await db
      .select({
        r: measurementResourcesTable,
        responsibleName: employeesTable.name,
        unitName: unitsTable.name,
        calibrationCount: sql<number>`cast(count(distinct ${measurementResourceCalibrationsTable.id}) as int)`,
        lastCalibrationAt: lastCalibSq.calibratedAt,
        lastCalibrationResult: lastCalibSq.result,
      })
      .from(measurementResourcesTable)
      .leftJoin(employeesTable, eq(measurementResourcesTable.responsibleId, employeesTable.id))
      .leftJoin(unitsTable, eq(measurementResourcesTable.unitId, unitsTable.id))
      .leftJoin(measurementResourceCalibrationsTable, eq(measurementResourcesTable.id, measurementResourceCalibrationsTable.resourceId))
      .leftJoin(lastCalibSq, eq(measurementResourcesTable.id, lastCalibSq.resourceId))
      .where(and(...conditions))
      .groupBy(measurementResourcesTable.id, employeesTable.name, unitsTable.name, lastCalibSq.calibratedAt, lastCalibSq.result)
      .orderBy(measurementResourcesTable.createdAt);

    res.json(rows.map((row) =>
      serializeResource(
        row.r,
        row.responsibleName ?? null,
        row.unitName ?? null,
        row.calibrationCount,
        row.lastCalibrationAt ?? null,
        row.lastCalibrationResult ?? null,
      )
    ));
  },
);

router.post(
  "/organizations/:orgId/measurement-resources",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateMeasurementResourceParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = CreateMeasurementResourceBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [resource] = await db
      .insert(measurementResourcesTable)
      .values({
        organizationId: params.data.orgId,
        unitId: body.data.unitId ?? null,
        name: body.data.name,
        identifier: body.data.identifier ?? null,
        resourceType: body.data.resourceType ?? "instrumento",
        responsibleId: body.data.responsibleId ?? null,
        validUntil: body.data.validUntil ?? null,
        notes: body.data.notes ?? null,
      })
      .returning();

    res.status(201).json(serializeResource(resource, null, null, 0, null, null));
  },
);

router.patch(
  "/organizations/:orgId/measurement-resources/:resourceId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateMeasurementResourceParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateMeasurementResourceBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [resource] = await db
      .update(measurementResourcesTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(and(eq(measurementResourcesTable.id, params.data.resourceId), eq(measurementResourcesTable.organizationId, params.data.orgId)))
      .returning();

    if (!resource) { res.status(404).json({ error: "Recurso não encontrado" }); return; }

    res.json(serializeResource(resource, null, null, 0, null, null));
  },
);

router.delete(
  "/organizations/:orgId/measurement-resources/:resourceId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteMeasurementResourceParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(measurementResourcesTable)
      .where(and(eq(measurementResourcesTable.id, params.data.resourceId), eq(measurementResourcesTable.organizationId, params.data.orgId)));

    res.sendStatus(204);
  },
);

// --- Calibrations ---

router.get(
  "/organizations/:orgId/measurement-resources/:resourceId/calibrations",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListMeasurementResourceCalibrationsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select({ c: measurementResourceCalibrationsTable, calibratedByName: employeesTable.name })
      .from(measurementResourceCalibrationsTable)
      .leftJoin(employeesTable, eq(measurementResourceCalibrationsTable.calibratedById, employeesTable.id))
      .where(
        and(
          eq(measurementResourceCalibrationsTable.resourceId, params.data.resourceId),
          eq(measurementResourceCalibrationsTable.organizationId, params.data.orgId),
        ),
      )
      .orderBy(desc(measurementResourceCalibrationsTable.calibratedAt));

    res.json(rows.map((r) => serializeCalibration(r.c, r.calibratedByName ?? null)));
  },
);

router.post(
  "/organizations/:orgId/measurement-resources/:resourceId/calibrations",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateMeasurementResourceCalibrationParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [resource] = await db
      .select({ id: measurementResourcesTable.id })
      .from(measurementResourcesTable)
      .where(and(eq(measurementResourcesTable.id, params.data.resourceId), eq(measurementResourcesTable.organizationId, params.data.orgId)));

    if (!resource) { res.status(404).json({ error: "Recurso não encontrado" }); return; }

    const body = CreateMeasurementResourceCalibrationBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [calibration] = await db
      .insert(measurementResourceCalibrationsTable)
      .values({
        organizationId: params.data.orgId,
        resourceId: params.data.resourceId,
        calibratedAt: body.data.calibratedAt,
        calibratedById: body.data.calibratedById ?? null,
        certificateNumber: body.data.certificateNumber ?? null,
        result: body.data.result,
        nextDueAt: body.data.nextDueAt ?? null,
        notes: body.data.notes ?? null,
      })
      .returning();

    // Update resource validUntil and status based on latest calibration
    const newValidUntil = body.data.nextDueAt ?? null;
    const newStatus = body.data.result === "apto" ? "ativo" : "inativo";
    await db
      .update(measurementResourcesTable)
      .set({ validUntil: newValidUntil, status: newStatus, updatedAt: new Date() })
      .where(eq(measurementResourcesTable.id, params.data.resourceId));

    res.status(201).json(serializeCalibration(calibration, null));
  },
);

router.delete(
  "/organizations/:orgId/measurement-resources/:resourceId/calibrations/:calibrationId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteMeasurementResourceCalibrationParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(measurementResourceCalibrationsTable)
      .where(
        and(
          eq(measurementResourceCalibrationsTable.id, params.data.calibrationId),
          eq(measurementResourceCalibrationsTable.resourceId, params.data.resourceId),
          eq(measurementResourceCalibrationsTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

// --- Attachments ---

router.get(
  "/organizations/:orgId/measurement-resources/:resourceId/calibrations/:calibrationId/attachments",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListMeasurementResourceAttachmentsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select()
      .from(measurementResourceAttachmentsTable)
      .where(
        and(
          eq(measurementResourceAttachmentsTable.calibrationId, params.data.calibrationId),
          eq(measurementResourceAttachmentsTable.organizationId, params.data.orgId),
        ),
      )
      .orderBy(measurementResourceAttachmentsTable.uploadedAt);

    res.json(rows.map((a) => ({ ...a, uploadedAt: a.uploadedAt.toISOString() })));
  },
);

router.post(
  "/organizations/:orgId/measurement-resources/:resourceId/calibrations/:calibrationId/attachments",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = AddMeasurementResourceAttachmentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [calib] = await db
      .select({ id: measurementResourceCalibrationsTable.id })
      .from(measurementResourceCalibrationsTable)
      .where(
        and(
          eq(measurementResourceCalibrationsTable.id, params.data.calibrationId),
          eq(measurementResourceCalibrationsTable.resourceId, params.data.resourceId),
          eq(measurementResourceCalibrationsTable.organizationId, params.data.orgId),
        ),
      );

    if (!calib) { res.status(404).json({ error: "Calibração não encontrada" }); return; }

    const body = AddMeasurementResourceAttachmentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [attachment] = await db
      .insert(measurementResourceAttachmentsTable)
      .values({
        organizationId: params.data.orgId,
        calibrationId: params.data.calibrationId,
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
  "/organizations/:orgId/measurement-resources/:resourceId/calibrations/:calibrationId/attachments/:attachmentId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteMeasurementResourceAttachmentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(measurementResourceAttachmentsTable)
      .where(
        and(
          eq(measurementResourceAttachmentsTable.id, params.data.attachmentId),
          eq(measurementResourceAttachmentsTable.calibrationId, params.data.calibrationId),
          eq(measurementResourceAttachmentsTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

export default router;
