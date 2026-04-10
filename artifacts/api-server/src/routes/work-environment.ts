import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  workEnvironmentControlsTable,
  workEnvironmentVerificationsTable,
  workEnvironmentAttachmentsTable,
  employeesTable,
  unitsTable,
} from "@workspace/db";
import {
  ListWorkEnvironmentControlsParams,
  ListWorkEnvironmentControlsQueryParams,
  CreateWorkEnvironmentControlParams,
  CreateWorkEnvironmentControlBody,
  UpdateWorkEnvironmentControlParams,
  UpdateWorkEnvironmentControlBody,
  DeleteWorkEnvironmentControlParams,
  ListWorkEnvironmentVerificationsParams,
  CreateWorkEnvironmentVerificationParams,
  CreateWorkEnvironmentVerificationBody,
  DeleteWorkEnvironmentVerificationParams,
  ListWorkEnvironmentAttachmentsParams,
  AddWorkEnvironmentAttachmentParams,
  AddWorkEnvironmentAttachmentBody,
  DeleteWorkEnvironmentAttachmentParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

// --- Serializers ---

function serializeControl(
  ctrl: typeof workEnvironmentControlsTable.$inferSelect,
  responsibleName: string | null,
  unitName: string | null,
  verificationCount: number,
  lastResult: string | null,
  lastActionTaken: string | null,
  lastVerifiedAt: Date | null,
) {
  return {
    id: ctrl.id,
    organizationId: ctrl.organizationId,
    unitId: ctrl.unitId,
    unitName,
    factorType: ctrl.factorType,
    title: ctrl.title,
    description: ctrl.description,
    responsibleId: ctrl.responsibleId,
    responsibleName,
    frequency: ctrl.frequency,
    status: ctrl.status,
    verificationCount,
    lastResult,
    lastActionTaken,
    lastVerifiedAt: lastVerifiedAt ? lastVerifiedAt.toISOString() : null,
    createdAt: ctrl.createdAt.toISOString(),
    updatedAt: ctrl.updatedAt.toISOString(),
  };
}

function serializeVerification(
  v: typeof workEnvironmentVerificationsTable.$inferSelect,
  verifiedByName: string | null,
) {
  return {
    id: v.id,
    organizationId: v.organizationId,
    controlId: v.controlId,
    verifiedAt: v.verifiedAt.toISOString(),
    verifiedById: v.verifiedById,
    verifiedByName,
    result: v.result,
    notes: v.notes,
    actionTaken: v.actionTaken,
    createdAt: v.createdAt.toISOString(),
  };
}

// --- Controls ---

router.get(
  "/organizations/:orgId/work-environment/controls",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListWorkEnvironmentControlsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const query = ListWorkEnvironmentControlsQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

    // Subquery: last verification result, actionTaken and verifiedAt per control
    const lastResultSq = db
      .select({
        controlId: workEnvironmentVerificationsTable.controlId,
        result: workEnvironmentVerificationsTable.result,
        actionTaken: workEnvironmentVerificationsTable.actionTaken,
        verifiedAt: workEnvironmentVerificationsTable.verifiedAt,
      })
      .from(workEnvironmentVerificationsTable)
      .where(
        sql`(${workEnvironmentVerificationsTable.controlId}, ${workEnvironmentVerificationsTable.verifiedAt}) in (
          select control_id, max(verified_at)
          from work_environment_verifications
          group by control_id
        )`,
      )
      .as("last_verif");

    const conditions = [eq(workEnvironmentControlsTable.organizationId, params.data.orgId)];
    if (query.data.unitId) conditions.push(eq(workEnvironmentControlsTable.unitId, query.data.unitId));
    if (query.data.factorType) conditions.push(eq(workEnvironmentControlsTable.factorType, query.data.factorType));

    const rows = await db
      .select({
        ctrl: workEnvironmentControlsTable,
        responsibleName: employeesTable.name,
        unitName: unitsTable.name,
        verificationCount: sql<number>`cast(count(distinct ${workEnvironmentVerificationsTable.id}) as int)`,
        lastResult: lastResultSq.result,
        lastActionTaken: lastResultSq.actionTaken,
        lastVerifiedAt: lastResultSq.verifiedAt,
      })
      .from(workEnvironmentControlsTable)
      .leftJoin(employeesTable, eq(workEnvironmentControlsTable.responsibleId, employeesTable.id))
      .leftJoin(unitsTable, eq(workEnvironmentControlsTable.unitId, unitsTable.id))
      .leftJoin(workEnvironmentVerificationsTable, eq(workEnvironmentControlsTable.id, workEnvironmentVerificationsTable.controlId))
      .leftJoin(lastResultSq, eq(workEnvironmentControlsTable.id, lastResultSq.controlId))
      .where(and(...conditions))
      .groupBy(workEnvironmentControlsTable.id, employeesTable.name, unitsTable.name, lastResultSq.result, lastResultSq.actionTaken, lastResultSq.verifiedAt)
      .orderBy(workEnvironmentControlsTable.createdAt);

    res.json(rows.map((r) => serializeControl(r.ctrl, r.responsibleName ?? null, r.unitName ?? null, r.verificationCount, r.lastResult ?? null, r.lastActionTaken ?? null, r.lastVerifiedAt ?? null)));
  },
);

router.post(
  "/organizations/:orgId/work-environment/controls",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateWorkEnvironmentControlParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = CreateWorkEnvironmentControlBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [ctrl] = await db
      .insert(workEnvironmentControlsTable)
      .values({
        organizationId: params.data.orgId,
        unitId: body.data.unitId ?? null,
        factorType: body.data.factorType ?? "fisico",
        title: body.data.title,
        description: body.data.description ?? null,
        responsibleId: body.data.responsibleId ?? null,
        frequency: body.data.frequency ?? "mensal",
      })
      .returning();

    res.status(201).json(serializeControl(ctrl, null, null, 0, null, null, null));
  },
);

router.patch(
  "/organizations/:orgId/work-environment/controls/:controlId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateWorkEnvironmentControlParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateWorkEnvironmentControlBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [ctrl] = await db
      .update(workEnvironmentControlsTable)
      .set(body.data)
      .where(and(eq(workEnvironmentControlsTable.id, params.data.controlId), eq(workEnvironmentControlsTable.organizationId, params.data.orgId)))
      .returning();

    if (!ctrl) { res.status(404).json({ error: "Controle não encontrado" }); return; }

    res.json(serializeControl(ctrl, null, null, 0, null, null, null));
  },
);

router.delete(
  "/organizations/:orgId/work-environment/controls/:controlId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteWorkEnvironmentControlParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(workEnvironmentControlsTable)
      .where(and(eq(workEnvironmentControlsTable.id, params.data.controlId), eq(workEnvironmentControlsTable.organizationId, params.data.orgId)));

    res.sendStatus(204);
  },
);

// --- Verifications ---

router.get(
  "/organizations/:orgId/work-environment/controls/:controlId/verifications",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListWorkEnvironmentVerificationsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select({ v: workEnvironmentVerificationsTable, verifiedByName: employeesTable.name })
      .from(workEnvironmentVerificationsTable)
      .leftJoin(employeesTable, eq(workEnvironmentVerificationsTable.verifiedById, employeesTable.id))
      .where(
        and(
          eq(workEnvironmentVerificationsTable.controlId, params.data.controlId),
          eq(workEnvironmentVerificationsTable.organizationId, params.data.orgId),
        ),
      )
      .orderBy(desc(workEnvironmentVerificationsTable.verifiedAt));

    res.json(rows.map((r) => serializeVerification(r.v, r.verifiedByName ?? null)));
  },
);

router.post(
  "/organizations/:orgId/work-environment/controls/:controlId/verifications",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateWorkEnvironmentVerificationParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [ctrl] = await db
      .select({ id: workEnvironmentControlsTable.id })
      .from(workEnvironmentControlsTable)
      .where(and(eq(workEnvironmentControlsTable.id, params.data.controlId), eq(workEnvironmentControlsTable.organizationId, params.data.orgId)));

    if (!ctrl) { res.status(404).json({ error: "Controle não encontrado" }); return; }

    const body = CreateWorkEnvironmentVerificationBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [v] = await db
      .insert(workEnvironmentVerificationsTable)
      .values({
        organizationId: params.data.orgId,
        controlId: params.data.controlId,
        verifiedAt: new Date(body.data.verifiedAt),
        verifiedById: body.data.verifiedById ?? null,
        result: body.data.result,
        notes: body.data.notes ?? null,
        actionTaken: body.data.actionTaken ?? null,
      })
      .returning();

    res.status(201).json(serializeVerification(v, null));
  },
);

router.delete(
  "/organizations/:orgId/work-environment/controls/:controlId/verifications/:verificationId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteWorkEnvironmentVerificationParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(workEnvironmentVerificationsTable)
      .where(
        and(
          eq(workEnvironmentVerificationsTable.id, params.data.verificationId),
          eq(workEnvironmentVerificationsTable.controlId, params.data.controlId),
          eq(workEnvironmentVerificationsTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

// --- Attachments ---

router.get(
  "/organizations/:orgId/work-environment/controls/:controlId/verifications/:verificationId/attachments",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListWorkEnvironmentAttachmentsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select()
      .from(workEnvironmentAttachmentsTable)
      .where(
        and(
          eq(workEnvironmentAttachmentsTable.verificationId, params.data.verificationId),
          eq(workEnvironmentAttachmentsTable.organizationId, params.data.orgId),
        ),
      )
      .orderBy(workEnvironmentAttachmentsTable.uploadedAt);

    res.json(rows.map((a) => ({ ...a, uploadedAt: a.uploadedAt.toISOString() })));
  },
);

router.post(
  "/organizations/:orgId/work-environment/controls/:controlId/verifications/:verificationId/attachments",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = AddWorkEnvironmentAttachmentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [verif] = await db
      .select({ id: workEnvironmentVerificationsTable.id })
      .from(workEnvironmentVerificationsTable)
      .where(
        and(
          eq(workEnvironmentVerificationsTable.id, params.data.verificationId),
          eq(workEnvironmentVerificationsTable.controlId, params.data.controlId),
          eq(workEnvironmentVerificationsTable.organizationId, params.data.orgId),
        ),
      );

    if (!verif) { res.status(404).json({ error: "Verificação não encontrada" }); return; }

    const body = AddWorkEnvironmentAttachmentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [attachment] = await db
      .insert(workEnvironmentAttachmentsTable)
      .values({
        organizationId: params.data.orgId,
        verificationId: params.data.verificationId,
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
  "/organizations/:orgId/work-environment/controls/:controlId/verifications/:verificationId/attachments/:attachmentId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteWorkEnvironmentAttachmentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(workEnvironmentAttachmentsTable)
      .where(
        and(
          eq(workEnvironmentAttachmentsTable.id, params.data.attachmentId),
          eq(workEnvironmentAttachmentsTable.verificationId, params.data.verificationId),
          eq(workEnvironmentAttachmentsTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

export default router;
