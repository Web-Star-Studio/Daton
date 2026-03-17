import { Router, type IRouter } from "express";
import { eq, and, ilike, or, desc, inArray, sql, max } from "drizzle-orm";
import {
  db,
  documentsTable,
  documentUnitsTable,
  documentElaboratorsTable,
  documentApproversTable,
  documentRecipientsTable,
  documentReferencesTable,
  documentAttachmentsTable,
  documentVersionsTable,
  usersTable,
  unitsTable,
  notificationsTable,
} from "@workspace/db";
import {
  ListDocumentsParams,
  ListDocumentsQueryParams,
  CreateDocumentParams,
  CreateDocumentBody,
  GetDocumentParams,
  UpdateDocumentParams,
  UpdateDocumentBody,
  SubmitDocumentForReviewParams,
  ApproveDocumentParams,
  ApproveDocumentBody,
  RejectDocumentParams,
  RejectDocumentBody,
  DistributeDocumentParams,
  AcknowledgeDocumentParams,
  ListDocumentVersionsParams,
  AddDocumentAttachmentParams,
  AddDocumentAttachmentBody,
  DeleteDocumentAttachmentParams,
  DeleteDocumentParams,
} from "@workspace/api-zod";
import { requireAuth, requireModuleAccess, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

async function validateOrgUsers(userIds: number[], orgId: number): Promise<boolean> {
  if (userIds.length === 0) return true;
  const rows = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(inArray(usersTable.id, userIds), eq(usersTable.organizationId, orgId)));
  return rows.length === userIds.length;
}

async function validateOrgUnits(unitIds: number[], orgId: number): Promise<boolean> {
  if (unitIds.length === 0) return true;
  const rows = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(and(inArray(unitsTable.id, unitIds), eq(unitsTable.organizationId, orgId)));
  return rows.length === unitIds.length;
}

async function validateOrgDocuments(docIds: number[], orgId: number): Promise<boolean> {
  if (docIds.length === 0) return true;
  const rows = await db.select({ id: documentsTable.id }).from(documentsTable)
    .where(and(inArray(documentsTable.id, docIds), eq(documentsTable.organizationId, orgId)));
  return rows.length === docIds.length;
}

async function createNotification(orgId: number, userId: number, type: string, title: string, description: string, entityType?: string, entityId?: number) {
  await db.insert(notificationsTable).values({
    organizationId: orgId,
    userId,
    type,
    title,
    description,
    relatedEntityType: entityType || null,
    relatedEntityId: entityId || null,
  });
}

async function getDocumentParticipantUserIds(docId: number): Promise<number[]> {
  const [elaborators, approvers, recipients] = await Promise.all([
    db
      .selectDistinct({ userId: documentElaboratorsTable.userId })
      .from(documentElaboratorsTable)
      .where(eq(documentElaboratorsTable.documentId, docId)),
    db
      .selectDistinct({ userId: documentApproversTable.userId })
      .from(documentApproversTable)
      .where(eq(documentApproversTable.documentId, docId)),
    db
      .selectDistinct({ userId: documentRecipientsTable.userId })
      .from(documentRecipientsTable)
      .where(eq(documentRecipientsTable.documentId, docId)),
  ]);

  return [...new Set([
    ...elaborators.map((row) => row.userId),
    ...approvers.map((row) => row.userId),
    ...recipients.map((row) => row.userId),
  ])];
}

async function notifyUsers({
  orgId,
  userIds,
  actorUserId,
  type,
  title,
  description,
  docId,
}: {
  orgId: number;
  userIds: number[];
  actorUserId?: number;
  type: string;
  title: string;
  description: string;
  docId?: number;
}): Promise<void> {
  const recipientIds = [...new Set(userIds)].filter((userId) => userId !== actorUserId);
  if (recipientIds.length === 0) return;

  const results = await Promise.allSettled(
    recipientIds.map((userId) =>
      createNotification(
        orgId,
        userId,
        type,
        title,
        description,
        "document",
        docId,
      ),
    ),
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    console.error("Failed to create some document notifications", {
      orgId,
      docId,
      type,
      failedCount: failures.length,
    });
  }
}

async function notifyDocumentParticipants({
  orgId,
  docId,
  actorUserId,
  type,
  title,
  description,
}: {
  orgId: number;
  docId: number;
  actorUserId?: number;
  type: string;
  title: string;
  description: string;
}): Promise<void> {
  const participantIds = await getDocumentParticipantUserIds(docId);
  await notifyUsers({
    orgId,
    userIds: participantIds,
    actorUserId,
    type,
    title,
    description,
    docId,
  });
}

async function getDocumentDetail(docId: number, orgId: number) {
  const [doc] = await db.select({
    id: documentsTable.id,
    title: documentsTable.title,
    type: documentsTable.type,
    status: documentsTable.status,
    currentVersion: documentsTable.currentVersion,
    validityDate: documentsTable.validityDate,
    createdById: documentsTable.createdById,
    createdByName: usersTable.name,
    createdAt: documentsTable.createdAt,
    updatedAt: documentsTable.updatedAt,
  })
    .from(documentsTable)
    .leftJoin(usersTable, eq(documentsTable.createdById, usersTable.id))
    .where(and(eq(documentsTable.id, docId), eq(documentsTable.organizationId, orgId)));

  if (!doc) return null;

  const unitRows = await db.select({ id: unitsTable.id, name: unitsTable.name })
    .from(documentUnitsTable)
    .innerJoin(unitsTable, eq(documentUnitsTable.unitId, unitsTable.id))
    .where(eq(documentUnitsTable.documentId, docId));

  const elaboratorRows = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(documentElaboratorsTable)
    .innerJoin(usersTable, eq(documentElaboratorsTable.userId, usersTable.id))
    .where(eq(documentElaboratorsTable.documentId, docId));

  const maxCycleResult = await db.select({ maxCycle: sql<number>`COALESCE(MAX(${documentApproversTable.approvalCycle}), 1)` })
    .from(documentApproversTable)
    .where(eq(documentApproversTable.documentId, docId));
  const currentCycle = maxCycleResult[0]?.maxCycle ?? 1;

  const approverRows = await db.select({
    id: documentApproversTable.id,
    userId: documentApproversTable.userId,
    name: usersTable.name,
    status: documentApproversTable.status,
    approvedAt: documentApproversTable.approvedAt,
    comment: documentApproversTable.comment,
  })
    .from(documentApproversTable)
    .innerJoin(usersTable, eq(documentApproversTable.userId, usersTable.id))
    .where(and(eq(documentApproversTable.documentId, docId), eq(documentApproversTable.approvalCycle, currentCycle)));

  const recipientRows = await db.select({
    id: documentRecipientsTable.id,
    userId: documentRecipientsTable.userId,
    name: usersTable.name,
    receivedAt: documentRecipientsTable.receivedAt,
    readAt: documentRecipientsTable.readAt,
  })
    .from(documentRecipientsTable)
    .innerJoin(usersTable, eq(documentRecipientsTable.userId, usersTable.id))
    .where(eq(documentRecipientsTable.documentId, docId));

  const refRows = await db.select({
    id: documentReferencesTable.id,
    documentId: documentReferencesTable.referencedDocumentId,
    title: documentsTable.title,
  })
    .from(documentReferencesTable)
    .innerJoin(documentsTable, eq(documentReferencesTable.referencedDocumentId, documentsTable.id))
    .where(eq(documentReferencesTable.documentId, docId));

  const attachmentRows = await db.select({
    id: documentAttachmentsTable.id,
    documentId: documentAttachmentsTable.documentId,
    versionNumber: documentAttachmentsTable.versionNumber,
    fileName: documentAttachmentsTable.fileName,
    fileSize: documentAttachmentsTable.fileSize,
    contentType: documentAttachmentsTable.contentType,
    objectPath: documentAttachmentsTable.objectPath,
    uploadedByName: usersTable.name,
    uploadedAt: documentAttachmentsTable.uploadedAt,
  })
    .from(documentAttachmentsTable)
    .leftJoin(usersTable, eq(documentAttachmentsTable.uploadedById, usersTable.id))
    .where(eq(documentAttachmentsTable.documentId, docId))
    .orderBy(desc(documentAttachmentsTable.uploadedAt));

  const versionRows = await db.select({
    id: documentVersionsTable.id,
    versionNumber: documentVersionsTable.versionNumber,
    changeDescription: documentVersionsTable.changeDescription,
    changedByName: usersTable.name,
    changedFields: documentVersionsTable.changedFields,
    createdAt: documentVersionsTable.createdAt,
  })
    .from(documentVersionsTable)
    .leftJoin(usersTable, eq(documentVersionsTable.changedById, usersTable.id))
    .where(eq(documentVersionsTable.documentId, docId))
    .orderBy(desc(documentVersionsTable.versionNumber));

  return {
    ...doc,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
    units: unitRows,
    elaborators: elaboratorRows,
    approvers: approverRows.map(a => ({
      ...a,
      approvedAt: a.approvedAt instanceof Date ? a.approvedAt.toISOString() : a.approvedAt,
    })),
    recipients: recipientRows.map(r => ({
      ...r,
      receivedAt: r.receivedAt instanceof Date ? r.receivedAt.toISOString() : r.receivedAt,
      readAt: r.readAt instanceof Date ? r.readAt.toISOString() : r.readAt,
    })),
    references: refRows,
    attachments: attachmentRows.map(a => ({
      ...a,
      uploadedAt: a.uploadedAt instanceof Date ? a.uploadedAt.toISOString() : a.uploadedAt,
    })),
    versions: versionRows.map(v => ({
      ...v,
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
    })),
  };
}

router.get("/organizations/:orgId/documents", requireAuth, async (req, res): Promise<void> => {
  const params = ListDocumentsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const query = ListDocumentsQueryParams.safeParse(req.query);
  const conditions = [eq(documentsTable.organizationId, params.data.orgId)];

  if (query.success && query.data.search) {
    conditions.push(ilike(documentsTable.title, `%${query.data.search}%`));
  }
  if (query.success && query.data.type) {
    conditions.push(eq(documentsTable.type, query.data.type));
  }
  if (query.success && query.data.status) {
    conditions.push(eq(documentsTable.status, query.data.status));
  }

  if (query.success && query.data.unitId) {
    const unitDocIds = await db.select({ documentId: documentUnitsTable.documentId })
      .from(documentUnitsTable)
      .where(eq(documentUnitsTable.unitId, query.data.unitId));
    const ids = unitDocIds.map(r => r.documentId);
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(documentsTable.id, ids));
  }

  const rows = await db.select({
    id: documentsTable.id,
    title: documentsTable.title,
    type: documentsTable.type,
    status: documentsTable.status,
    currentVersion: documentsTable.currentVersion,
    validityDate: documentsTable.validityDate,
    createdByName: usersTable.name,
    createdAt: documentsTable.createdAt,
    updatedAt: documentsTable.updatedAt,
    approvedByName: sql<string | null>`(
      SELECT u2.name FROM document_approvers da
      JOIN users u2 ON da.user_id = u2.id
      WHERE da.document_id = ${documentsTable.id}
        AND da.status = 'approved'
      ORDER BY da.approved_at DESC
      LIMIT 1
    )`.as("approved_by_name"),
  })
    .from(documentsTable)
    .leftJoin(usersTable, eq(documentsTable.createdById, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(documentsTable.updatedAt));

  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    approvedByName: r.approvedByName || null,
  })));
});

router.post("/organizations/:orgId/documents", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateDocumentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const userId = req.auth!.userId;
  const orgId = params.data.orgId;

  const allUserIds = [...new Set([
    ...(body.data.elaboratorIds || []),
    ...(body.data.approverIds || []),
    ...(body.data.recipientIds || []),
  ])];
  if (allUserIds.length > 0 && !(await validateOrgUsers(allUserIds, orgId))) {
    res.status(400).json({ error: "Um ou mais usuários selecionados não pertencem a esta organização" });
    return;
  }
  if (body.data.unitIds?.length && !(await validateOrgUnits(body.data.unitIds, orgId))) {
    res.status(400).json({ error: "Uma ou mais filiais selecionadas não pertencem a esta organização" });
    return;
  }
  if (body.data.referenceIds?.length && !(await validateOrgDocuments(body.data.referenceIds, orgId))) {
    res.status(400).json({ error: "Um ou mais documentos referenciados não pertencem a esta organização" });
    return;
  }

  const [doc] = await db.insert(documentsTable).values({
    organizationId: orgId,
    title: body.data.title,
    type: body.data.type,
    validityDate: body.data.validityDate || null,
    createdById: userId,
    status: "draft",
    currentVersion: 1,
  }).returning();

  if (body.data.unitIds?.length) {
    await db.insert(documentUnitsTable).values(
      body.data.unitIds.map(unitId => ({ documentId: doc.id, unitId }))
    );
  }

  if (body.data.elaboratorIds?.length) {
    await db.insert(documentElaboratorsTable).values(
      body.data.elaboratorIds.map(uid => ({ documentId: doc.id, userId: uid }))
    );
  }

  if (body.data.approverIds?.length) {
    await db.insert(documentApproversTable).values(
      body.data.approverIds.map(uid => ({ documentId: doc.id, userId: uid }))
    );
  }

  if (body.data.recipientIds?.length) {
    await db.insert(documentRecipientsTable).values(
      body.data.recipientIds.map(uid => ({ documentId: doc.id, userId: uid }))
    );
  }

  if (body.data.referenceIds?.length) {
    await db.insert(documentReferencesTable).values(
      body.data.referenceIds.map(refId => ({ documentId: doc.id, referencedDocumentId: refId }))
    );
  }

  if (body.data.attachments?.length) {
    await db.insert(documentAttachmentsTable).values(
      body.data.attachments.map(att => ({
        documentId: doc.id,
        versionNumber: 1,
        fileName: att.fileName,
        fileSize: att.fileSize,
        contentType: att.contentType,
        objectPath: att.objectPath,
        uploadedById: userId,
      }))
    );
  }

  await db.insert(documentVersionsTable).values({
    documentId: doc.id,
    versionNumber: 1,
    changeDescription: "Documento criado",
    changedById: userId,
    changedFields: "all",
  });

  const detail = await getDocumentDetail(doc.id, orgId);
  res.status(201).json(detail);
});

router.get("/organizations/:orgId/documents/:docId", requireAuth, async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const detail = await getDocumentDetail(params.data.docId, params.data.orgId);
  if (!detail) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  res.json(detail);
});

router.patch("/organizations/:orgId/documents/:docId", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateDocumentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const userId = req.auth!.userId;
  const orgId = params.data.orgId;
  const docId = params.data.docId;

  const [existing] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, docId), eq(documentsTable.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  if (existing.status !== "draft" && existing.status !== "rejected") {
    res.status(400).json({ error: "Apenas documentos em rascunho ou rejeitados podem ser editados" });
    return;
  }

  const allUserIds = [...new Set([
    ...(body.data.elaboratorIds || []),
    ...(body.data.approverIds || []),
    ...(body.data.recipientIds || []),
  ])];
  if (allUserIds.length > 0 && !(await validateOrgUsers(allUserIds, orgId))) {
    res.status(400).json({ error: "Um ou mais usuários selecionados não pertencem a esta organização" });
    return;
  }
  if (body.data.unitIds?.length && !(await validateOrgUnits(body.data.unitIds, orgId))) {
    res.status(400).json({ error: "Uma ou mais filiais selecionadas não pertencem a esta organização" });
    return;
  }
  if (body.data.referenceIds?.length && !(await validateOrgDocuments(body.data.referenceIds, orgId))) {
    res.status(400).json({ error: "Um ou mais documentos referenciados não pertencem a esta organização" });
    return;
  }

  const changedFields: string[] = [];
  const updates: Record<string, unknown> = {};

  if (body.data.title && body.data.title !== existing.title) {
    updates.title = body.data.title;
    changedFields.push("título");
  }
  if (body.data.type && body.data.type !== existing.type) {
    updates.type = body.data.type;
    changedFields.push("tipo");
  }
  if (body.data.validityDate !== undefined) {
    updates.validityDate = body.data.validityDate || null;
    changedFields.push("data de validade");
  }

  const newVersion = existing.currentVersion + 1;
  updates.currentVersion = newVersion;

  await db.update(documentsTable).set(updates).where(eq(documentsTable.id, docId));

  if (body.data.unitIds) {
    await db.delete(documentUnitsTable).where(eq(documentUnitsTable.documentId, docId));
    if (body.data.unitIds.length) {
      await db.insert(documentUnitsTable).values(body.data.unitIds.map(uid => ({ documentId: docId, unitId: uid })));
    }
    changedFields.push("filiais");
  }

  if (body.data.elaboratorIds) {
    await db.delete(documentElaboratorsTable).where(eq(documentElaboratorsTable.documentId, docId));
    if (body.data.elaboratorIds.length) {
      await db.insert(documentElaboratorsTable).values(body.data.elaboratorIds.map(uid => ({ documentId: docId, userId: uid })));
    }
    changedFields.push("elaboradores");
  }

  if (body.data.approverIds) {
    await db.delete(documentApproversTable).where(eq(documentApproversTable.documentId, docId));
    if (body.data.approverIds.length) {
      await db.insert(documentApproversTable).values(body.data.approverIds.map(uid => ({ documentId: docId, userId: uid })));
    }
    changedFields.push("aprovadores");
  }

  if (body.data.recipientIds) {
    await db.delete(documentRecipientsTable).where(eq(documentRecipientsTable.documentId, docId));
    if (body.data.recipientIds.length) {
      await db.insert(documentRecipientsTable).values(body.data.recipientIds.map(uid => ({ documentId: docId, userId: uid })));
    }
    changedFields.push("destinatários");
  }

  if (body.data.referenceIds) {
    await db.delete(documentReferencesTable).where(eq(documentReferencesTable.documentId, docId));
    if (body.data.referenceIds.length) {
      await db.insert(documentReferencesTable).values(body.data.referenceIds.map(refId => ({ documentId: docId, referencedDocumentId: refId })));
    }
    changedFields.push("referências");
  }

  const changeDesc = body.data.changeDescription || `Alterações: ${changedFields.join(", ") || "metadados"}`;
  await db.insert(documentVersionsTable).values({
    documentId: docId,
    versionNumber: newVersion,
    changeDescription: changeDesc,
    changedById: userId,
    changedFields: changedFields.join(", ") || null,
  });

  const detail = await getDocumentDetail(docId, orgId);
  await notifyDocumentParticipants({
    orgId,
    docId,
    actorUserId: userId,
    type: "document_updated",
    title: "Documento atualizado",
    description: `O documento "${detail?.title || existing.title}" recebeu uma nova revisão: ${changeDesc}.`,
  });
  res.json(detail);
});

router.delete("/organizations/:orgId/documents/:docId", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [existing] = await db.select({ id: documentsTable.id, status: documentsTable.status }).from(documentsTable)
    .where(and(eq(documentsTable.id, params.data.docId), eq(documentsTable.organizationId, params.data.orgId)));
  if (!existing) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (existing.status !== "draft" && existing.status !== "rejected") {
    res.status(400).json({ error: "Apenas documentos em rascunho ou rejeitados podem ser excluídos" });
    return;
  }

  await db.delete(documentsTable).where(eq(documentsTable.id, params.data.docId));
  res.sendStatus(204);
});

router.get("/organizations/:orgId/documents/:docId/versions", requireAuth, async (req, res): Promise<void> => {
  const params = ListDocumentVersionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [doc] = await db.select({ id: documentsTable.id }).from(documentsTable)
    .where(and(eq(documentsTable.id, params.data.docId), eq(documentsTable.organizationId, params.data.orgId)));
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  const rows = await db.select({
    id: documentVersionsTable.id,
    versionNumber: documentVersionsTable.versionNumber,
    changeDescription: documentVersionsTable.changeDescription,
    changedByName: usersTable.name,
    changedFields: documentVersionsTable.changedFields,
    createdAt: documentVersionsTable.createdAt,
  })
    .from(documentVersionsTable)
    .leftJoin(usersTable, eq(documentVersionsTable.changedById, usersTable.id))
    .where(eq(documentVersionsTable.documentId, params.data.docId))
    .orderBy(desc(documentVersionsTable.versionNumber));

  res.json(rows.map(v => ({
    ...v,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
  })));
});

router.post("/organizations/:orgId/documents/:docId/attachments", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = AddDocumentAttachmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = AddDocumentAttachmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, params.data.docId), eq(documentsTable.organizationId, params.data.orgId)));
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  if (doc.status !== "draft" && doc.status !== "rejected") {
    res.status(400).json({ error: "Anexos só podem ser adicionados em documentos em rascunho ou rejeitados" });
    return;
  }

  const userId = req.auth!.userId;
  const newVersion = doc.currentVersion + 1;

  const [att] = await db.insert(documentAttachmentsTable).values({
    documentId: doc.id,
    versionNumber: newVersion,
    fileName: body.data.fileName,
    fileSize: body.data.fileSize,
    contentType: body.data.contentType,
    objectPath: body.data.objectPath,
    uploadedById: userId,
  }).returning();

  await db.update(documentsTable).set({ currentVersion: newVersion }).where(eq(documentsTable.id, doc.id));

  await db.insert(documentVersionsTable).values({
    documentId: doc.id,
    versionNumber: newVersion,
    changeDescription: `Anexo adicionado: ${body.data.fileName}`,
    changedById: userId,
    changedFields: "anexos",
  });

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await notifyDocumentParticipants({
    orgId: params.data.orgId,
    docId: doc.id,
    actorUserId: userId,
    type: "document_updated",
    title: "Anexo adicionado",
    description: `${userName?.name || "Um usuário"} adicionou o anexo "${body.data.fileName}" ao documento "${doc.title}".`,
  });

  res.status(201).json({
    ...att,
    uploadedByName: userName?.name || "",
    uploadedAt: att.uploadedAt instanceof Date ? att.uploadedAt.toISOString() : att.uploadedAt,
  });
});

router.delete("/organizations/:orgId/documents/:docId/attachments/:attachId", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteDocumentAttachmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [doc] = await db.select({
    id: documentsTable.id,
    status: documentsTable.status,
    title: documentsTable.title,
    currentVersion: documentsTable.currentVersion,
  }).from(documentsTable)
    .where(and(eq(documentsTable.id, params.data.docId), eq(documentsTable.organizationId, params.data.orgId)));
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  if (doc.status !== "draft" && doc.status !== "rejected") {
    res.status(400).json({ error: "Anexos só podem ser removidos em documentos em rascunho ou rejeitados" });
    return;
  }

  const userId = req.auth!.userId;

  const [att] = await db.delete(documentAttachmentsTable)
    .where(and(eq(documentAttachmentsTable.id, params.data.attachId), eq(documentAttachmentsTable.documentId, params.data.docId)))
    .returning();

  if (!att) { res.status(404).json({ error: "Anexo não encontrado" }); return; }

  const newVersion = doc.currentVersion + 1;
  await db.update(documentsTable).set({ currentVersion: newVersion }).where(eq(documentsTable.id, doc.id));

  await db.insert(documentVersionsTable).values({
    documentId: doc.id,
    versionNumber: newVersion,
    changeDescription: `Anexo removido: ${att.fileName}`,
    changedById: userId,
    changedFields: "anexos",
  });

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await notifyDocumentParticipants({
    orgId: params.data.orgId,
    docId: doc.id,
    actorUserId: userId,
    type: "document_updated",
    title: "Anexo removido",
    description: `${userName?.name || "Um usuário"} removeu o anexo "${att.fileName}" do documento "${doc.title}".`,
  });

  res.sendStatus(204);
});

router.post("/organizations/:orgId/documents/:docId/submit", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = SubmitDocumentForReviewParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const orgId = params.data.orgId;
  const docId = params.data.docId;

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, docId), eq(documentsTable.organizationId, orgId)));
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  if (doc.status !== "draft" && doc.status !== "rejected") {
    res.status(400).json({ error: "Documento não pode ser submetido neste estado" });
    return;
  }

  const maxCycleResult = await db.select({ maxCycle: sql<number>`COALESCE(MAX(${documentApproversTable.approvalCycle}), 0)` })
    .from(documentApproversTable)
    .where(eq(documentApproversTable.documentId, docId));
  const newCycle = (maxCycleResult[0]?.maxCycle ?? 0) + 1;

  const distinctApprovers = await db.selectDistinct({ userId: documentApproversTable.userId })
    .from(documentApproversTable)
    .where(eq(documentApproversTable.documentId, docId));

  if (distinctApprovers.length === 0) {
    res.status(400).json({ error: "O documento deve ter pelo menos um aprovador antes de ser enviado para revisão" });
    return;
  }

  for (const a of distinctApprovers) {
    await db.insert(documentApproversTable).values({
      documentId: docId,
      userId: a.userId,
      status: "pending",
      approvalCycle: newCycle,
    });
  }

  await db.update(documentsTable).set({ status: "in_review" }).where(eq(documentsTable.id, docId));

  await db.insert(documentVersionsTable).values({
    documentId: docId,
    versionNumber: doc.currentVersion,
    changeDescription: doc.status === "rejected" ? "Documento reenviado para revisão" : "Documento enviado para revisão",
    changedById: req.auth!.userId,
    changedFields: "status:in_review",
  });

  await notifyUsers({
    orgId,
    userIds: distinctApprovers.map((approver) => approver.userId),
    actorUserId: req.auth!.userId,
    type: "document_review",
    title: "Documento em revisão",
    description: `O documento "${doc.title}" foi enviado para revisão.`,
    docId,
  });

  const detail = await getDocumentDetail(docId, orgId);
  res.json(detail);
});

router.post("/organizations/:orgId/documents/:docId/approve", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = ApproveDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = ApproveDocumentBody.safeParse(req.body || {});
  const orgId = params.data.orgId;
  const docId = params.data.docId;
  const userId = req.auth!.userId;

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, docId), eq(documentsTable.organizationId, orgId)));
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc.status !== "in_review") { res.status(400).json({ error: "Documento não está em revisão" }); return; }

  const maxCycleResult = await db.select({ maxCycle: sql<number>`COALESCE(MAX(${documentApproversTable.approvalCycle}), 1)` })
    .from(documentApproversTable)
    .where(eq(documentApproversTable.documentId, docId));
  const currentCycle = maxCycleResult[0]?.maxCycle ?? 1;

  const [approver] = await db.select().from(documentApproversTable)
    .where(and(
      eq(documentApproversTable.documentId, docId),
      eq(documentApproversTable.userId, userId),
      eq(documentApproversTable.approvalCycle, currentCycle),
      eq(documentApproversTable.status, "pending")
    ));
  if (!approver) { res.status(403).json({ error: "Você não é um aprovador pendente deste documento" }); return; }

  await db.update(documentApproversTable)
    .set({ status: "approved", approvedAt: new Date(), comment: body.success ? body.data.comment || null : null })
    .where(eq(documentApproversTable.id, approver.id));

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await db.insert(documentVersionsTable).values({
    documentId: docId,
    versionNumber: doc.currentVersion,
    changeDescription: `Aprovado por usuário`,
    changedById: userId,
    changedFields: "approval:approved",
  });

  await notifyDocumentParticipants({
    orgId,
    docId,
    actorUserId: userId,
    type: "document_approval_recorded",
    title: "Aprovação registrada",
    description: `${userName?.name || "Um participante"} aprovou o documento "${doc.title}".`,
  });

  const pending = await db.select().from(documentApproversTable)
    .where(and(
      eq(documentApproversTable.documentId, docId),
      eq(documentApproversTable.approvalCycle, currentCycle),
      eq(documentApproversTable.status, "pending")
    ));

  if (pending.length === 0) {
    await db.update(documentsTable).set({ status: "approved" }).where(eq(documentsTable.id, docId));

    await db.insert(documentVersionsTable).values({
      documentId: docId,
      versionNumber: doc.currentVersion,
      changeDescription: "Documento aprovado por todos os aprovadores",
      changedById: userId,
      changedFields: "status:approved",
    });

    await notifyDocumentParticipants({
      orgId,
      docId,
      actorUserId: userId,
      type: "document_approved",
      title: "Documento aprovado",
      description: `O documento "${doc.title}" foi aprovado por todos os aprovadores.`,
    });

    const recipients = await db.select().from(documentRecipientsTable)
      .where(eq(documentRecipientsTable.documentId, docId));

    if (recipients.length > 0) {
      await db.update(documentsTable).set({ status: "distributed" }).where(eq(documentsTable.id, docId));

      await db.insert(documentVersionsTable).values({
        documentId: docId,
        versionNumber: doc.currentVersion,
        changeDescription: "Documento distribuído automaticamente aos destinatários",
        changedById: userId,
        changedFields: "status:distributed",
      });

      await notifyUsers({
        orgId,
        userIds: recipients.map((recipient) => recipient.userId),
        actorUserId: userId,
        type: "document_distributed",
        title: "Documento distribuído",
        description: `O documento "${doc.title}" foi distribuído para você. Confirme o recebimento.`,
        docId,
      });
    }
  }

  const detail = await getDocumentDetail(docId, orgId);
  res.json(detail);
});

router.post("/organizations/:orgId/documents/:docId/reject", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = RejectDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = RejectDocumentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const orgId = params.data.orgId;
  const docId = params.data.docId;
  const userId = req.auth!.userId;

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, docId), eq(documentsTable.organizationId, orgId)));
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc.status !== "in_review") { res.status(400).json({ error: "Documento não está em revisão" }); return; }

  const maxCycleResult = await db.select({ maxCycle: sql<number>`COALESCE(MAX(${documentApproversTable.approvalCycle}), 1)` })
    .from(documentApproversTable)
    .where(eq(documentApproversTable.documentId, docId));
  const currentCycle = maxCycleResult[0]?.maxCycle ?? 1;

  const [approver] = await db.select().from(documentApproversTable)
    .where(and(
      eq(documentApproversTable.documentId, docId),
      eq(documentApproversTable.userId, userId),
      eq(documentApproversTable.approvalCycle, currentCycle),
      eq(documentApproversTable.status, "pending")
    ));
  if (!approver) { res.status(403).json({ error: "Você não é um aprovador pendente deste documento" }); return; }

  await db.update(documentApproversTable)
    .set({ status: "rejected", approvedAt: new Date(), comment: body.data.comment })
    .where(eq(documentApproversTable.id, approver.id));

  await db.update(documentsTable).set({ status: "rejected" }).where(eq(documentsTable.id, docId));

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await db.insert(documentVersionsTable).values({
    documentId: docId,
    versionNumber: doc.currentVersion,
    changeDescription: `Rejeitado por ${userName?.name || "aprovador"}: ${body.data.comment}`,
    changedById: userId,
    changedFields: "status:rejected",
  });

  await notifyDocumentParticipants({
    orgId,
    docId,
    actorUserId: userId,
    type: "document_rejected",
    title: "Documento rejeitado",
    description: `O documento "${doc.title}" foi rejeitado por ${userName?.name || "um aprovador"}. Motivo: ${body.data.comment}`,
  });

  const detail = await getDocumentDetail(docId, orgId);
  res.json(detail);
});

router.post("/organizations/:orgId/documents/:docId/distribute", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DistributeDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const orgId = params.data.orgId;
  const docId = params.data.docId;

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, docId), eq(documentsTable.organizationId, orgId)));
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc.status !== "approved") { res.status(400).json({ error: "Documento precisa estar aprovado para ser distribuído" }); return; }

  await db.update(documentsTable).set({ status: "distributed" }).where(eq(documentsTable.id, docId));

  await db.insert(documentVersionsTable).values({
    documentId: docId,
    versionNumber: doc.currentVersion,
    changeDescription: "Documento distribuído manualmente aos destinatários",
    changedById: req.auth!.userId,
    changedFields: "status:distributed",
  });

  const recipients = await db
    .select({ userId: documentRecipientsTable.userId })
    .from(documentRecipientsTable)
    .where(eq(documentRecipientsTable.documentId, docId));

  await notifyUsers({
    orgId,
    userIds: recipients.map((recipient) => recipient.userId),
    actorUserId: req.auth!.userId,
    type: "document_distributed",
    title: "Documento distribuído",
    description: `O documento "${doc.title}" foi distribuído para você. Acuse o recebimento e a leitura.`,
    docId,
  });

  const detail = await getDocumentDetail(docId, orgId);
  res.json(detail);
});

router.post("/organizations/:orgId/documents/:docId/acknowledge", requireAuth, async (req, res): Promise<void> => {
  const params = AcknowledgeDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const orgId = params.data.orgId;
  const docId = params.data.docId;
  const userId = req.auth!.userId;

  const [doc2] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, docId), eq(documentsTable.organizationId, orgId)));
  if (!doc2) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc2.status !== "distributed") { res.status(400).json({ error: "Documento não está distribuído" }); return; }

  const [recipient] = await db.select().from(documentRecipientsTable)
    .where(and(eq(documentRecipientsTable.documentId, docId), eq(documentRecipientsTable.userId, userId)));
  if (!recipient) { res.status(403).json({ error: "Você não é um destinatário deste documento" }); return; }

  const now = new Date();
  await db.update(documentRecipientsTable)
    .set({ receivedAt: recipient.receivedAt || now, readAt: now })
    .where(eq(documentRecipientsTable.id, recipient.id));

  const [doc] = await db.select().from(documentsTable)
    .where(eq(documentsTable.id, docId));

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  if (doc) {
    await db.insert(documentVersionsTable).values({
      documentId: docId,
      versionNumber: doc.currentVersion,
      changeDescription: `Recebimento confirmado por ${userName?.name || "destinatário"}`,
      changedById: userId,
      changedFields: "acknowledgment",
    });

    await notifyDocumentParticipants({
      orgId,
      docId,
      actorUserId: userId,
      type: "document_acknowledged",
      title: "Leitura confirmada",
      description: `${userName?.name || "Um destinatário"} confirmou o recebimento e a leitura do documento "${doc.title}".`,
    });
  }

  res.json({ message: "Recebimento confirmado" });
});

router.get("/organizations/:orgId/user-options", requireAuth, requireModuleAccess("documents"), async (req, res): Promise<void> => {
  const orgId = parseInt(Array.isArray(req.params.orgId) ? req.params.orgId[0] ?? "" : req.params.orgId ?? "", 10);
  if (isNaN(orgId)) { res.status(400).json({ error: "orgId inválido" }); return; }
  if (orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const rows = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.organizationId, orgId))
    .orderBy(usersTable.name);

  res.json(rows);
});

export default router;
