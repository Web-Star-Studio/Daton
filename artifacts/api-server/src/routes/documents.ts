import { Readable } from "stream";
import { Router, type IRouter } from "express";
import { eq, and, ilike, or, desc, inArray, sql, max } from "drizzle-orm";
import {
  db,
  pool,
  documentsTable,
  documentUnitsTable,
  documentElaboratorsTable,
  documentApproversTable,
  documentRecipientsTable,
  documentReferencesTable,
  documentAttachmentsTable,
  documentVersionsTable,
  documentSettingsTable,
  documentRevisionRequestsTable,
  usersTable,
  unitsTable,
  employeesTable,
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
  SubmitDocumentForReviewBody,
  ApproveDocumentParams,
  ApproveDocumentBody,
  RejectDocumentParams,
  RejectDocumentBody,
  DistributeDocumentParams,
  AcknowledgeDocumentParams,
  AcknowledgeDocumentBody,
  ListDocumentVersionsParams,
  AddDocumentAttachmentParams,
  AddDocumentAttachmentBody,
  DeleteDocumentAttachmentParams,
  DeleteDocumentParams,
  ListUserOptionsQueryParams,
  GetDocumentSettingsParams,
  UpdateDocumentSettingsParams,
  UpdateDocumentSettingsBody,
  ListDocumentRevisionRequestsParams,
  CreateDocumentRevisionRequestParams,
  CreateDocumentRevisionRequestBody,
  ApproveDocumentRevisionRequestParams,
  ApproveDocumentRevisionRequestBody,
  RejectDocumentRevisionRequestParams,
  RejectDocumentRevisionRequestBody,
  ListMyRevisionRequestsParams,
  BatchImportDocumentVersionsParams,
  BatchImportDocumentVersionsBody,
} from "@workspace/api-zod";
import { requireAuth, requireModuleAccess, requireWriteAccess } from "../middlewares/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
let supportsPendingVersionDescriptionColumnCache: boolean | null = null;

function computeExpiryStatus(
  status: string,
  validityDate: string | null,
  defaultExpiringDays: number,
): { expiryStatus: string; daysRemaining: number | null } {
  const isActive = status === "approved" || status === "distributed";
  if (!isActive) return { expiryStatus: "em_aprovacao", daysRemaining: null };
  if (!validityDate) return { expiryStatus: "vigente", daysRemaining: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(validityDate);
  expiry.setHours(0, 0, 0, 0);
  const daysRemaining = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let expiryStatus: string;
  if (daysRemaining < 0) expiryStatus = "vencido";
  else if (daysRemaining <= defaultExpiringDays) expiryStatus = "a_vencer";
  else expiryStatus = "vigente";

  return { expiryStatus, daysRemaining };
}

async function getOrgDocumentSettings(orgId: number): Promise<{ defaultExpiringDays: number }> {
  const [settings] = await db
    .select({ defaultExpiringDays: documentSettingsTable.defaultExpiringDays })
    .from(documentSettingsTable)
    .where(eq(documentSettingsTable.organizationId, orgId));
  return settings ?? { defaultExpiringDays: 30 };
}

async function supportsPendingVersionDescriptionColumn(): Promise<boolean> {
  if (supportsPendingVersionDescriptionColumnCache !== null) {
    return supportsPendingVersionDescriptionColumnCache;
  }

  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'documents'
        AND column_name = 'pending_version_description'
      LIMIT 1
    `,
  );

  supportsPendingVersionDescriptionColumnCache = (result.rowCount ?? 0) > 0;
  return supportsPendingVersionDescriptionColumnCache;
}

async function validateOrgUsers(userIds: number[], orgId: number): Promise<boolean> {
  if (userIds.length === 0) return true;
  const rows = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(inArray(usersTable.id, userIds), eq(usersTable.organizationId, orgId)));
  return rows.length === userIds.length;
}

async function validateOrgEmployees(employeeIds: number[], orgId: number): Promise<boolean> {
  if (employeeIds.length === 0) return true;
  const rows = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(
      and(
        inArray(employeesTable.id, employeeIds),
        eq(employeesTable.organizationId, orgId),
      ),
    );

  return rows.length === employeeIds.length;
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

async function getEmployeeLinkedUserIds(employeeIds: number[], orgId: number): Promise<number[]> {
  if (employeeIds.length === 0) return [];

  const rows = await db
    .selectDistinct({ id: usersTable.id })
    .from(usersTable)
    .innerJoin(
      employeesTable,
      sql`lower(trim(${employeesTable.email})) = lower(trim(${usersTable.email}))`,
    )
    .where(
      and(
        inArray(employeesTable.id, employeeIds),
        eq(employeesTable.organizationId, orgId),
        eq(usersTable.organizationId, orgId),
        sql`${employeesTable.email} is not null`,
        sql`${usersTable.email} is not null`,
      ),
    );

  return rows.map((row) => row.id);
}

async function getDocumentParticipantUserIds(docId: number, orgId: number): Promise<number[]> {
  const [doc, elaborators, approvers, recipients] = await Promise.all([
    db
      .select({ createdById: documentsTable.createdById })
      .from(documentsTable)
      .where(eq(documentsTable.id, docId)),
    db
      .selectDistinct({ employeeId: documentElaboratorsTable.employeeId })
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
  const elaboratorUserIds = await getEmployeeLinkedUserIds(
    elaborators.map((row) => row.employeeId),
    orgId,
  );

  return [...new Set([
    ...doc.map((row) => row.createdById),
    ...elaboratorUserIds,
    ...approvers.map((row) => row.userId),
    ...recipients.map((row) => row.userId),
  ])];
}

async function getDocumentReviewStakeholderUserIds(docId: number, orgId: number): Promise<number[]> {
  const [doc, elaborators, approvers] = await Promise.all([
    db
      .select({ createdById: documentsTable.createdById })
      .from(documentsTable)
      .where(eq(documentsTable.id, docId)),
    db
      .selectDistinct({ employeeId: documentElaboratorsTable.employeeId })
      .from(documentElaboratorsTable)
      .where(eq(documentElaboratorsTable.documentId, docId)),
    db
      .selectDistinct({ userId: documentApproversTable.userId })
      .from(documentApproversTable)
      .where(eq(documentApproversTable.documentId, docId)),
  ]);
  const elaboratorUserIds = await getEmployeeLinkedUserIds(
    elaborators.map((row) => row.employeeId),
    orgId,
  );

  return [...new Set([
    ...doc.map((row) => row.createdById),
    ...elaboratorUserIds,
    ...approvers.map((row) => row.userId),
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
  docId: number;
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
  const participantIds = await getDocumentParticipantUserIds(docId, orgId);
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

async function getDocumentRecord(docId: number, orgId: number) {
  const [doc] = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      type: documentsTable.type,
      status: documentsTable.status,
      currentVersion: documentsTable.currentVersion,
      validityDate: documentsTable.validityDate,
      normReference: documentsTable.normReference,
      responsibleDepartment: documentsTable.responsibleDepartment,
      createdById: documentsTable.createdById,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
    })
    .from(documentsTable)
    .where(and(eq(documentsTable.id, docId), eq(documentsTable.organizationId, orgId)));

  return doc ?? null;
}

async function getDocumentDetail(docId: number, orgId: number) {
  const [doc] = await db.select({
    id: documentsTable.id,
    title: documentsTable.title,
    type: documentsTable.type,
    status: documentsTable.status,
    currentVersion: documentsTable.currentVersion,
    validityDate: documentsTable.validityDate,
    normReference: documentsTable.normReference,
    responsibleDepartment: documentsTable.responsibleDepartment,
    createdById: documentsTable.createdById,
    createdByName: usersTable.name,
    createdByEmail: usersTable.email,
    createdByRole: usersTable.role,
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

  const elaboratorRows = await db.select({
    id: employeesTable.id,
    organizationId: employeesTable.organizationId,
    unitId: employeesTable.unitId,
    name: employeesTable.name,
    cpf: employeesTable.cpf,
    email: employeesTable.email,
    phone: employeesTable.phone,
    position: employeesTable.position,
    department: employeesTable.department,
    contractType: employeesTable.contractType,
    admissionDate: employeesTable.admissionDate,
    terminationDate: employeesTable.terminationDate,
    status: employeesTable.status,
    createdAt: employeesTable.createdAt,
    updatedAt: employeesTable.updatedAt,
    unitName: unitsTable.name,
  })
    .from(documentElaboratorsTable)
    .innerJoin(employeesTable, eq(documentElaboratorsTable.employeeId, employeesTable.id))
    .leftJoin(unitsTable, eq(employeesTable.unitId, unitsTable.id))
    .where(eq(documentElaboratorsTable.documentId, docId));

  const maxCycleResult = await db.select({ maxCycle: sql<number>`COALESCE(MAX(${documentApproversTable.approvalCycle}), 1)` })
    .from(documentApproversTable)
    .where(eq(documentApproversTable.documentId, docId));
  const currentCycle = maxCycleResult[0]?.maxCycle ?? 1;

  const approverRows = await db.select({
    id: documentApproversTable.id,
    userId: documentApproversTable.userId,
    name: usersTable.name,
    role: documentApproversTable.role,
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
    confirmationNote: documentRecipientsTable.confirmationNote,
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

  const settings = await getOrgDocumentSettings(orgId);
  const { expiryStatus, daysRemaining } = computeExpiryStatus(doc.status, doc.validityDate, settings.defaultExpiringDays);
  const pendingConfirmations = recipientRows.filter(r => !r.readAt).length;

  return {
    ...doc,
    expiryStatus,
    daysRemaining,
    pendingConfirmations,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
    units: unitRows,
    elaborators: elaboratorRows.length > 0
      ? elaboratorRows.map((elaborator) => ({
        ...elaborator,
        createdAt:
          elaborator.createdAt instanceof Date
            ? elaborator.createdAt.toISOString()
            : elaborator.createdAt,
        updatedAt:
          elaborator.updatedAt instanceof Date
            ? elaborator.updatedAt.toISOString()
            : elaborator.updatedAt,
      }))
      : doc.createdById
        ? [{
          id: doc.createdById,
          organizationId: orgId,
          unitId: null,
          name: doc.createdByName ?? "Usuário da organização",
          cpf: null,
          email: doc.createdByEmail ?? null,
          phone: null,
          position: null,
          department: null,
          contractType: "clt",
          admissionDate: null,
          terminationDate: null,
          status: "active",
          unitName: null,
          createdAt:
            doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
          updatedAt:
            doc.updatedAt instanceof Date
              ? doc.updatedAt.toISOString()
              : (doc.updatedAt ?? (doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt)),
        }]
        : [],
    approvers: approverRows.map(a => ({
      ...a,
      approvedAt: a.approvedAt instanceof Date ? a.approvedAt.toISOString() : a.approvedAt,
    })),
    recipients: recipientRows.map(r => ({
      ...r,
      receivedAt: r.receivedAt instanceof Date ? r.receivedAt.toISOString() : r.receivedAt,
      readAt: r.readAt instanceof Date ? r.readAt.toISOString() : r.readAt,
      confirmationNote: r.confirmationNote ?? null,
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
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const userId = req.auth!.userId;
  const conditions = [
    eq(documentsTable.organizationId, params.data.orgId),
    // in_review docs are only visible to: creator, or users with a pending approver entry in the current cycle
    sql`(
      ${documentsTable.status} != 'in_review'
      OR ${documentsTable.createdById} = ${userId}
      OR EXISTS (
        SELECT 1 FROM document_approvers da
        WHERE da.document_id = ${documentsTable.id}
          AND da.user_id = ${userId}
          AND da.approval_cycle = (SELECT MAX(da2.approval_cycle) FROM document_approvers da2 WHERE da2.document_id = ${documentsTable.id})
          AND da.status = 'pending'
      )
    )`,
  ];

  if (query.data.search) {
    conditions.push(ilike(documentsTable.title, `%${query.data.search}%`));
  }
  if (query.data.type) {
    conditions.push(eq(documentsTable.type, query.data.type));
  }
  if (query.data.status) {
    conditions.push(eq(documentsTable.status, query.data.status));
  }

  // expiryStatus filter maps to DB-level conditions (pre-filter before computing in JS)
  if (query.data.expiryStatus === "em_aprovacao") {
    conditions.push(sql`${documentsTable.status} NOT IN ('approved', 'distributed')`);
  } else if (query.data.expiryStatus === "vencido") {
    conditions.push(sql`${documentsTable.status} IN ('approved', 'distributed')`);
    conditions.push(sql`${documentsTable.validityDate} < CURRENT_DATE`);
  } else if (query.data.expiryStatus === "a_vencer") {
    const [settingsForFilter] = await db
      .select({ defaultExpiringDays: documentSettingsTable.defaultExpiringDays })
      .from(documentSettingsTable)
      .where(eq(documentSettingsTable.organizationId, params.data.orgId));
    const threshold = settingsForFilter?.defaultExpiringDays ?? 30;
    conditions.push(sql`${documentsTable.status} IN ('approved', 'distributed')`);
    conditions.push(sql`${documentsTable.validityDate} >= CURRENT_DATE`);
    conditions.push(sql`${documentsTable.validityDate} <= CURRENT_DATE + INTERVAL '${sql.raw(String(threshold))} days'`);
  } else if (query.data.expiryStatus === "vigente") {
    const [settingsForFilter] = await db
      .select({ defaultExpiringDays: documentSettingsTable.defaultExpiringDays })
      .from(documentSettingsTable)
      .where(eq(documentSettingsTable.organizationId, params.data.orgId));
    const threshold = settingsForFilter?.defaultExpiringDays ?? 30;
    conditions.push(sql`${documentsTable.status} IN ('approved', 'distributed')`);
    conditions.push(sql`(${documentsTable.validityDate} IS NULL OR ${documentsTable.validityDate} > CURRENT_DATE + INTERVAL '${sql.raw(String(threshold))} days')`);
  }

  if (query.data.unitId) {
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

  let dbQuery = db.select({
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
    pendingConfirmations: sql<number>`(
      SELECT COUNT(*) FROM document_recipients dr
      WHERE dr.document_id = ${documentsTable.id}
        AND dr.read_at IS NULL
    )`.as("pending_confirmations"),
  })
    .from(documentsTable)
    .leftJoin(usersTable, eq(documentsTable.createdById, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(documentsTable.updatedAt))
    .$dynamic();

  if (query.data.page && query.data.pageSize) {
    const offset = (query.data.page - 1) * query.data.pageSize;
    dbQuery = dbQuery.limit(query.data.pageSize).offset(offset);
  }

  const rows = await dbQuery;
  const settings = await getOrgDocumentSettings(params.data.orgId);

  res.json(rows.map(r => {
    const { expiryStatus, daysRemaining } = computeExpiryStatus(r.status, r.validityDate, settings.defaultExpiringDays);
    return {
      ...r,
      expiryStatus,
      daysRemaining,
      pendingConfirmations: Number(r.pendingConfirmations),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      approvedByName: r.approvedByName || null,
    };
  }));
});

router.post("/organizations/:orgId/documents", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateDocumentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const userId = req.auth!.userId;
  const orgId = params.data.orgId;
  const elaboratorIds = body.data.elaboratorIds;

  const allUserIds = [...new Set([
    ...(body.data.approverIds || []),
    ...(body.data.recipientIds || []),
  ])];
  if (allUserIds.length > 0 && !(await validateOrgUsers(allUserIds, orgId))) {
    res.status(400).json({ error: "Um ou mais usuários selecionados não pertencem a esta organização" });
    return;
  }
  if (!(await validateOrgEmployees(elaboratorIds, orgId))) {
    res.status(400).json({ error: "Um ou mais elaboradores não pertencem a esta organização" });
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
    normReference: body.data.normReference || null,
    responsibleDepartment: body.data.responsibleDepartment || null,
    createdById: userId,
    status: "draft",
    currentVersion: 0,
  }).returning();

  if (body.data.unitIds?.length) {
    await db.insert(documentUnitsTable).values(
      body.data.unitIds.map(unitId => ({ documentId: doc.id, unitId }))
    );
  }

  if (elaboratorIds.length > 0) {
    await db.insert(documentElaboratorsTable).values(
      elaboratorIds.map(employeeId => ({ documentId: doc.id, employeeId }))
    );
  }

  if (body.data.criticalReviewerIds?.length) {
    await db.insert(documentApproversTable).values(
      body.data.criticalReviewerIds.map(uid => ({ documentId: doc.id, userId: uid, role: "critical_reviewer" }))
    );
  }

  if (body.data.approverIds?.length) {
    await db.insert(documentApproversTable).values(
      body.data.approverIds.map(uid => ({ documentId: doc.id, userId: uid, role: "approver" }))
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

  const detail = await getDocumentDetail(doc.id, orgId);
  res.status(201).json(detail);
});

router.get("/organizations/:orgId/documents/settings", requireAuth, requireModuleAccess("documents"), async (req, res): Promise<void> => {
  const params = GetDocumentSettingsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const orgId = params.data.orgId;
  const [settings] = await db
    .select()
    .from(documentSettingsTable)
    .where(eq(documentSettingsTable.organizationId, orgId));

  if (!settings) {
    const [created] = await db.insert(documentSettingsTable).values({ organizationId: orgId }).returning();
    res.json({ organizationId: created.organizationId, defaultExpiringDays: created.defaultExpiringDays, updatedAt: created.updatedAt.toISOString() });
    return;
  }

  res.json({ organizationId: settings.organizationId, defaultExpiringDays: settings.defaultExpiringDays, updatedAt: settings.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings.updatedAt });
});

router.patch("/organizations/:orgId/documents/settings", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateDocumentSettingsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateDocumentSettingsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const orgId = params.data.orgId;

  const [existing] = await db
    .select({ id: documentSettingsTable.id })
    .from(documentSettingsTable)
    .where(eq(documentSettingsTable.organizationId, orgId));

  let updated;
  if (existing) {
    [updated] = await db
      .update(documentSettingsTable)
      .set({ defaultExpiringDays: body.data.defaultExpiringDays })
      .where(eq(documentSettingsTable.organizationId, orgId))
      .returning();
  } else {
    [updated] = await db
      .insert(documentSettingsTable)
      .values({ organizationId: orgId, defaultExpiringDays: body.data.defaultExpiringDays })
      .returning();
  }

  res.json({ organizationId: updated.organizationId, defaultExpiringDays: updated.defaultExpiringDays, updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt });
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

  const existing = await getDocumentRecord(docId, orgId);
  if (!existing) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  if (existing.status !== "draft" && existing.status !== "rejected") {
    res.status(400).json({ error: "Apenas documentos em rascunho ou rejeitados podem ser editados" });
    return;
  }

  const allUserIds = [...new Set([
    ...(body.data.criticalReviewerIds || []),
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
  if (body.data.elaboratorIds?.length && !(await validateOrgEmployees(body.data.elaboratorIds, orgId))) {
    res.status(400).json({ error: "Um ou mais elaboradores não pertencem a esta organização" });
    return;
  }

  const updates: Record<string, unknown> = {};

  if (body.data.title && body.data.title !== existing.title) {
    updates.title = body.data.title;
  }
  if (body.data.type && body.data.type !== existing.type) {
    updates.type = body.data.type;
  }
  if (body.data.validityDate !== undefined) {
    updates.validityDate = body.data.validityDate || null;
  }
  if (body.data.normReference !== undefined) {
    updates.normReference = body.data.normReference || null;
  }
  if (body.data.responsibleDepartment !== undefined) {
    updates.responsibleDepartment = body.data.responsibleDepartment || null;
  }

  await db.update(documentsTable).set(updates).where(eq(documentsTable.id, docId));

  if (body.data.unitIds) {
    await db.delete(documentUnitsTable).where(eq(documentUnitsTable.documentId, docId));
    if (body.data.unitIds.length) {
      await db.insert(documentUnitsTable).values(body.data.unitIds.map(uid => ({ documentId: docId, unitId: uid })));
    }
  }

  if (body.data.elaboratorIds !== undefined) {
    await db.transaction(async (tx) => {
      await tx
        .delete(documentElaboratorsTable)
        .where(eq(documentElaboratorsTable.documentId, docId));
      if (body.data.elaboratorIds!.length > 0) {
        await tx.insert(documentElaboratorsTable).values(
          body.data.elaboratorIds!.map(employeeId => ({ documentId: docId, employeeId }))
        );
      }
    });
  }

  // When either approverIds or criticalReviewerIds is provided, replace the full approver list
  if (body.data.approverIds !== undefined || body.data.criticalReviewerIds !== undefined) {
    await db.delete(documentApproversTable).where(eq(documentApproversTable.documentId, docId));
    const newEntries = [
      ...(body.data.criticalReviewerIds ?? []).map(uid => ({ documentId: docId, userId: uid, role: "critical_reviewer" as const })),
      ...(body.data.approverIds ?? []).map(uid => ({ documentId: docId, userId: uid, role: "approver" as const })),
    ];
    if (newEntries.length) {
      await db.insert(documentApproversTable).values(newEntries);
    }
  }

  if (body.data.recipientIds) {
    await db.delete(documentRecipientsTable).where(eq(documentRecipientsTable.documentId, docId));
    if (body.data.recipientIds.length) {
      await db.insert(documentRecipientsTable).values(body.data.recipientIds.map(uid => ({ documentId: docId, userId: uid })));
    }
  }

  if (body.data.referenceIds) {
    await db.delete(documentReferencesTable).where(eq(documentReferencesTable.documentId, docId));
    if (body.data.referenceIds.length) {
      await db.insert(documentReferencesTable).values(body.data.referenceIds.map(refId => ({ documentId: docId, referencedDocumentId: refId })));
    }
  }

  const detail = await getDocumentDetail(docId, orgId);
  await notifyDocumentParticipants({
    orgId,
    docId,
    actorUserId: userId,
    type: "document_updated",
    title: "Documento atualizado",
    description: `O documento "${detail?.title || existing.title}" foi atualizado em rascunho.`,
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

router.delete("/organizations/:orgId/documents/:docId/versions", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = ListDocumentVersionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [doc] = await db.select({
    id: documentsTable.id,
    status: documentsTable.status,
  }).from(documentsTable)
    .where(and(eq(documentsTable.id, params.data.docId), eq(documentsTable.organizationId, params.data.orgId)));
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  if (doc.status !== "draft" && doc.status !== "rejected") {
    res.status(400).json({ error: "O histórico de versões só pode ser resetado em documentos em rascunho ou rejeitados" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(documentVersionsTable).where(eq(documentVersionsTable.documentId, params.data.docId));
    await tx.update(documentsTable).set({ currentVersion: 0 }).where(eq(documentsTable.id, params.data.docId));
  });

  res.sendStatus(204);
});

router.post("/organizations/:orgId/documents/:docId/versions/batch-import", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = BatchImportDocumentVersionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = BatchImportDocumentVersionsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { orgId, docId } = params.data;
  const userId = req.auth!.userId;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  // Parse the plain-text version history
  const lineRegex = /^(\d+)\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(.+)$/;
  const batchEntries: Array<{ versionNumber: number; createdAt: Date; changeDescription: string }> = [];

  for (const raw of body.data.text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(lineRegex);
    if (match) {
      const [day, month, year] = match[2].split("/");
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      batchEntries.push({
        versionNumber: parseInt(match[1], 10),
        createdAt: date,
        changeDescription: match[3].trim(),
      });
    } else if (batchEntries.length > 0) {
      // Continuation line — append to last entry
      batchEntries[batchEntries.length - 1].changeDescription += " " + line;
    }
  }

  if (batchEntries.length === 0) {
    res.status(400).json({ error: "Nenhuma versão reconhecida no texto. Use o formato: N - DD/MM/AAAA - Descrição" });
    return;
  }

  const maxBatchVersion = Math.max(...batchEntries.map((e) => e.versionNumber));

  await db.transaction(async (tx) => {
    // Fetch existing versions to re-number them after the batch
    const existing = await tx
      .select({ id: documentVersionsTable.id, versionNumber: documentVersionsTable.versionNumber })
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.documentId, docId))
      .orderBy(documentVersionsTable.versionNumber);

    // Delete all existing versions
    await tx.delete(documentVersionsTable).where(eq(documentVersionsTable.documentId, docId));

    // Insert batch entries (use their own version numbers)
    await tx.insert(documentVersionsTable).values(
      batchEntries.map((e) => ({
        documentId: docId,
        versionNumber: e.versionNumber,
        changeDescription: e.changeDescription,
        changedById: userId,
        changedFields: "batch_import",
        createdAt: e.createdAt,
      })),
    );

    // Re-insert pre-existing versions with numbers offset after batch
    if (existing.length > 0) {
      await tx.insert(documentVersionsTable).values(
        existing.map((e, i) => ({
          documentId: docId,
          versionNumber: maxBatchVersion + i + 1,
          changeDescription: "Versão migrada",
          changedById: userId,
          changedFields: "batch_import_migrated",
        })),
      );
    }

    const totalVersions = maxBatchVersion + existing.length;
    await tx.update(documentsTable)
      .set({ currentVersion: totalVersions })
      .where(eq(documentsTable.id, docId));
  });

  const total = await db.select({ count: sql<number>`count(*)` })
    .from(documentVersionsTable)
    .where(eq(documentVersionsTable.documentId, docId));

  res.json({ imported: batchEntries.length, total: Number(total[0]?.count ?? 0) });
});

router.post("/organizations/:orgId/documents/:docId/attachments", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = AddDocumentAttachmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = AddDocumentAttachmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const doc = await getDocumentRecord(params.data.docId, params.data.orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  if (doc.status !== "draft" && doc.status !== "rejected") {
    res.status(400).json({ error: "Anexos só podem ser adicionados em documentos em rascunho ou rejeitados" });
    return;
  }

  const userId = req.auth!.userId;

  const [att] = await db.insert(documentAttachmentsTable).values({
    documentId: doc.id,
    versionNumber: doc.currentVersion + 1,
    fileName: body.data.fileName,
    fileSize: body.data.fileSize,
    contentType: body.data.contentType,
    objectPath: body.data.objectPath,
    uploadedById: userId,
  }).returning();

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
  let deletedAttachment: typeof documentAttachmentsTable.$inferSelect;

  try {
    deletedAttachment = await db.transaction(async (tx) => {
      const [attachment] = await tx
        .delete(documentAttachmentsTable)
        .where(and(eq(documentAttachmentsTable.id, params.data.attachId), eq(documentAttachmentsTable.documentId, params.data.docId)))
        .returning();

      if (!attachment) {
        throw new Error("DOCUMENT_ATTACHMENT_NOT_FOUND");
      }

      return attachment;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DOCUMENT_ATTACHMENT_NOT_FOUND") {
      res.status(404).json({ error: "Anexo não encontrado" });
      return;
    }

    throw error;
  }

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await notifyDocumentParticipants({
    orgId: params.data.orgId,
    docId: doc.id,
    actorUserId: userId,
    type: "document_updated",
    title: "Anexo removido",
    description: `${userName?.name || "Um usuário"} removeu o anexo "${deletedAttachment.fileName}" do documento "${doc.title}".`,
  });

  res.sendStatus(204);
});

router.get("/organizations/:orgId/documents/:docId/attachments/:attachId/file", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteDocumentAttachmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [attachment] = await db.select({
    id: documentAttachmentsTable.id,
    fileName: documentAttachmentsTable.fileName,
    contentType: documentAttachmentsTable.contentType,
    objectPath: documentAttachmentsTable.objectPath,
  })
    .from(documentAttachmentsTable)
    .innerJoin(documentsTable, eq(documentAttachmentsTable.documentId, documentsTable.id))
    .where(and(
      eq(documentAttachmentsTable.id, params.data.attachId),
      eq(documentAttachmentsTable.documentId, params.data.docId),
      eq(documentsTable.organizationId, params.data.orgId),
    ));

  if (!attachment) {
    res.status(404).json({ error: "Anexo não encontrado" });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(attachment.objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    const disposition = req.query.disposition === "attachment" ? "attachment" : "inline";

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    if (!res.getHeader("Content-Type") && attachment.contentType) {
      res.setHeader("Content-Type", attachment.contentType);
    }

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
      return;
    }

    res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Arquivo do anexo não encontrado" });
      return;
    }
    console.error("Error serving document attachment:", error);
    res.status(500).json({ error: "Falha ao servir anexo" });
  }
});

router.post("/organizations/:orgId/documents/:docId/submit", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = SubmitDocumentForReviewParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = SubmitDocumentForReviewBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const orgId = params.data.orgId;
  const docId = params.data.docId;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  if (doc.status !== "draft" && doc.status !== "rejected") {
    res.status(400).json({ error: "Documento não pode ser submetido neste estado" });
    return;
  }
  // Business rule: any document-writing admin or operator may advance a draft to review.
  if (req.auth!.role !== "org_admin" && req.auth!.role !== "operator") {
    res.status(403).json({ error: "Apenas administradores e operadores podem enviar o documento para revisão" });
    return;
  }

  const maxCycleResult = await db.select({ maxCycle: sql<number>`COALESCE(MAX(${documentApproversTable.approvalCycle}), 0)` })
    .from(documentApproversTable)
    .where(eq(documentApproversTable.documentId, docId));
  const newCycle = (maxCycleResult[0]?.maxCycle ?? 0) + 1;

  // Template = cycle 1 entries (always reflect current draft config after edit)
  const templateApprovers = await db
    .select({ userId: documentApproversTable.userId, role: documentApproversTable.role })
    .from(documentApproversTable)
    .where(and(eq(documentApproversTable.documentId, docId), eq(documentApproversTable.approvalCycle, 1)));

  if (templateApprovers.length === 0) {
    res.status(400).json({ error: "O documento deve ter pelo menos um aprovador antes de ser enviado para revisão" });
    return;
  }

  const criticalReviewers = templateApprovers.filter(a => a.role === "critical_reviewer");
  const finalApprovers = templateApprovers.filter(a => a.role !== "critical_reviewer");

  // If there are critical reviewers, only activate them first
  const firstWave = criticalReviewers.length > 0 ? criticalReviewers : finalApprovers;
  await db.insert(documentApproversTable).values(
    firstWave.map(a => ({ documentId: docId, userId: a.userId, role: a.role, status: "pending", approvalCycle: newCycle }))
  );

  const submitUpdates: Record<string, unknown> = { status: "in_review" };
  if (await supportsPendingVersionDescriptionColumn()) {
    submitUpdates.pendingVersionDescription = body.data.changeDescription.trim();
  }

  await db.update(documentsTable).set(submitUpdates).where(eq(documentsTable.id, docId));

  const notifyLabel = criticalReviewers.length > 0 ? "Análise crítica pendente" : "Documento em revisão";
  const notifyDesc = criticalReviewers.length > 0
    ? `O documento "${doc.title}" aguarda sua análise crítica antes de ir para aprovação final.`
    : `O documento "${doc.title}" foi enviado para revisão.`;

  await notifyUsers({
    orgId,
    userIds: firstWave.map(a => a.userId),
    actorUserId: req.auth!.userId,
    type: "document_review",
    title: notifyLabel,
    description: notifyDesc,
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

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc.status !== "in_review") { res.status(400).json({ error: "Documento não está em revisão" }); return; }

  const canPersistPendingVersionDescription = await supportsPendingVersionDescriptionColumn();

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

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  const approvalComment = body.success ? body.data.comment || null : null;

  const approvalResult = await db.transaction(async (tx) => {
    await tx.update(documentApproversTable)
      .set({ status: "approved", approvedAt: new Date(), comment: approvalComment })
      .where(eq(documentApproversTable.id, approver.id));

    // Check if there are still pending approvers in this cycle
    const pendingInCycle = await tx.select({ role: documentApproversTable.role })
      .from(documentApproversTable)
      .where(and(
        eq(documentApproversTable.documentId, docId),
        eq(documentApproversTable.approvalCycle, currentCycle),
        eq(documentApproversTable.status, "pending")
      ));

    // If current approver was a critical_reviewer and all critical_reviewers are now done,
    // activate the final approvers from the template
    if (approver.role === "critical_reviewer" && pendingInCycle.filter(a => a.role === "critical_reviewer").length === 0) {
      const templateFinalApprovers = await tx
        .select({ userId: documentApproversTable.userId })
        .from(documentApproversTable)
        .where(and(
          eq(documentApproversTable.documentId, docId),
          eq(documentApproversTable.approvalCycle, 1),
          eq(documentApproversTable.role, "approver")
        ));

      if (templateFinalApprovers.length > 0) {
        await tx.insert(documentApproversTable).values(
          templateFinalApprovers.map(a => ({
            documentId: docId,
            userId: a.userId,
            role: "approver",
            status: "pending",
            approvalCycle: currentCycle,
          }))
        );
        return {
          fullyApproved: false,
          criticalReviewDone: true,
          finalApproverIds: templateFinalApprovers.map(a => a.userId),
          newVersion: null as number | null,
          distributedToUserIds: [] as number[],
        };
      }
      // No final approvers defined — critical reviewers alone are sufficient
    }

    // Still pending approvers (of any role) — not done yet
    if (pendingInCycle.length > 0) {
      return {
        fullyApproved: false,
        criticalReviewDone: false,
        finalApproverIds: [] as number[],
        newVersion: null as number | null,
        distributedToUserIds: [] as number[],
      };
    }

    const newVersion = doc.currentVersion + 1;
    const nextStatus = (await tx.select({ userId: documentRecipientsTable.userId }).from(documentRecipientsTable)
      .where(eq(documentRecipientsTable.documentId, docId))).length > 0
      ? "distributed"
      : "approved";
    let changeDescription = `Versão ${newVersion} aprovada`;

    if (canPersistPendingVersionDescription) {
      const [docWithPendingDescription] = await tx
        .select({
          pendingVersionDescription: documentsTable.pendingVersionDescription,
        })
        .from(documentsTable)
        .where(eq(documentsTable.id, docId));

      if (docWithPendingDescription?.pendingVersionDescription?.trim()) {
        changeDescription = docWithPendingDescription.pendingVersionDescription.trim();
      }
    }

    const documentApprovalUpdates: Record<string, unknown> = {
      status: nextStatus,
      currentVersion: newVersion,
    };
    if (canPersistPendingVersionDescription) {
      documentApprovalUpdates.pendingVersionDescription = null;
    }

    await tx.update(documentsTable)
      .set(documentApprovalUpdates)
      .where(eq(documentsTable.id, docId));

    await tx.insert(documentVersionsTable).values({
      documentId: docId,
      versionNumber: newVersion,
      changeDescription,
      changedById: userId,
      changedFields: "version_approved",
    });

    const recipients = await tx.select({ userId: documentRecipientsTable.userId }).from(documentRecipientsTable)
      .where(eq(documentRecipientsTable.documentId, docId));

    return {
      fullyApproved: true,
      criticalReviewDone: false,
      finalApproverIds: [] as number[],
      newVersion,
      distributedToUserIds: recipients.map((recipient) => recipient.userId),
    };
  });

  await notifyDocumentParticipants({
    orgId,
    docId,
    actorUserId: userId,
    type: "document_approval_recorded",
    title: "Aprovação registrada",
    description: `${userName?.name || "Um participante"} aprovou o documento "${doc.title}".`,
  });

  // Critical review completed — notify final approvers
  if (approvalResult.criticalReviewDone && approvalResult.finalApproverIds.length > 0) {
    await notifyUsers({
      orgId,
      userIds: approvalResult.finalApproverIds,
      actorUserId: userId,
      type: "document_review",
      title: "Aprovação final pendente",
      description: `A análise crítica do documento "${doc.title}" foi concluída. Sua aprovação final é necessária.`,
      docId,
    });
  }

  if (approvalResult.fullyApproved) {
    await notifyDocumentParticipants({
      orgId,
      docId,
      actorUserId: userId,
      type: "document_approved",
      title: "Documento aprovado",
      description: `O documento "${doc.title}" foi aprovado e formalizou a versão ${approvalResult.newVersion}.`,
    });

    if (approvalResult.distributedToUserIds.length > 0) {
      await notifyUsers({
        orgId,
        userIds: approvalResult.distributedToUserIds,
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

  const doc = await getDocumentRecord(docId, orgId);
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
  const actorUserId = req.auth!.userId;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc.status !== "approved") { res.status(400).json({ error: "Documento precisa estar aprovado para ser distribuído" }); return; }

  const recipients = await db.transaction(async (tx) => {
    await tx
      .update(documentsTable)
      .set({ status: "distributed" })
      .where(eq(documentsTable.id, docId));

    return tx
      .select({ userId: documentRecipientsTable.userId })
      .from(documentRecipientsTable)
      .where(eq(documentRecipientsTable.documentId, docId));
  });

  await notifyUsers({
    orgId,
    userIds: recipients.map((recipient) => recipient.userId),
    actorUserId,
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

  const body = AcknowledgeDocumentBody.safeParse(req.body || {});
  const orgId = params.data.orgId;
  const docId = params.data.docId;
  const userId = req.auth!.userId;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc.status !== "distributed") { res.status(400).json({ error: "Documento não está distribuído" }); return; }

  const [recipient] = await db.select().from(documentRecipientsTable)
    .where(and(eq(documentRecipientsTable.documentId, docId), eq(documentRecipientsTable.userId, userId)));
  if (!recipient) { res.status(403).json({ error: "Você não é um destinatário deste documento" }); return; }

  const now = new Date();
  const confirmationNote = body.success ? (body.data.confirmationNote || null) : null;
  await db.update(documentRecipientsTable)
    .set({ receivedAt: recipient.receivedAt || now, readAt: now, confirmationNote })
    .where(eq(documentRecipientsTable.id, recipient.id));

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  const acknowledgmentAudience = await getDocumentReviewStakeholderUserIds(docId, orgId);
  await notifyUsers({
    orgId,
    userIds: acknowledgmentAudience,
    actorUserId: userId,
    type: "document_acknowledged",
    title: "Leitura confirmada",
    description: `${userName?.name || "Um destinatário"} confirmou o recebimento e a leitura do documento "${doc.title}".`,
    docId,
  });

  res.json({ message: "Recebimento confirmado" });
});

router.get("/organizations/:orgId/user-options", requireAuth, requireModuleAccess("documents"), async (req, res): Promise<void> => {
  const orgId = parseInt(Array.isArray(req.params.orgId) ? req.params.orgId[0] ?? "" : req.params.orgId ?? "", 10);
  if (isNaN(orgId)) { res.status(400).json({ error: "orgId inválido" }); return; }
  if (orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const queryParams = ListUserOptionsQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  const conditions = [eq(usersTable.organizationId, orgId)];

  if (queryParams.data.search) {
    const term = `%${queryParams.data.search}%`;
    conditions.push(or(ilike(usersTable.name, term), ilike(usersTable.email, term))!);
  }

  let dbQuery = db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(and(...conditions))
    .orderBy(usersTable.name)
    .$dynamic();

  if (queryParams.data.page && queryParams.data.pageSize) {
    const offset = (queryParams.data.page - 1) * queryParams.data.pageSize;
    dbQuery = dbQuery.limit(queryParams.data.pageSize).offset(offset);
  }

  const rows = await dbQuery;
  res.json(rows);
});

// ─── Revision Requests ────────────────────────────────────────────────────────

function formatRevisionRequest(req: {
  id: number;
  documentId: number;
  documentTitle?: string | null;
  requestedById: number;
  requestedByName?: string | null;
  reviewerUserId: number;
  reviewerName?: string | null;
  status: string;
  changeDescription: string;
  attachmentFileName?: string | null;
  attachmentFileSize?: number | null;
  attachmentContentType?: string | null;
  attachmentObjectPath?: string | null;
  reviewerNotes?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
}) {
  return {
    id: req.id,
    documentId: req.documentId,
    documentTitle: req.documentTitle ?? undefined,
    requestedById: req.requestedById,
    requestedByName: req.requestedByName ?? undefined,
    reviewerUserId: req.reviewerUserId,
    reviewerName: req.reviewerName ?? undefined,
    status: req.status,
    changeDescription: req.changeDescription,
    attachmentFileName: req.attachmentFileName ?? null,
    attachmentFileSize: req.attachmentFileSize ?? null,
    attachmentContentType: req.attachmentContentType ?? null,
    attachmentObjectPath: req.attachmentObjectPath ?? null,
    reviewerNotes: req.reviewerNotes ?? null,
    reviewedAt: req.reviewedAt ? req.reviewedAt.toISOString() : null,
    createdAt: req.createdAt.toISOString(),
  };
}

router.get("/organizations/:orgId/documents/:docId/revision-requests", requireAuth, requireModuleAccess("documents"), async (req, res): Promise<void> => {
  const params = ListDocumentRevisionRequestsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const { orgId, docId } = params.data;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  const requestedByAlias = usersTable;
  const reviewerAlias = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).as("reviewer_user");

  const rows = await db
    .select({
      id: documentRevisionRequestsTable.id,
      documentId: documentRevisionRequestsTable.documentId,
      documentTitle: documentsTable.title,
      requestedById: documentRevisionRequestsTable.requestedById,
      requestedByName: requestedByAlias.name,
      reviewerUserId: documentRevisionRequestsTable.reviewerUserId,
      reviewerName: reviewerAlias.name,
      status: documentRevisionRequestsTable.status,
      changeDescription: documentRevisionRequestsTable.changeDescription,
      attachmentFileName: documentRevisionRequestsTable.attachmentFileName,
      attachmentFileSize: documentRevisionRequestsTable.attachmentFileSize,
      attachmentContentType: documentRevisionRequestsTable.attachmentContentType,
      attachmentObjectPath: documentRevisionRequestsTable.attachmentObjectPath,
      reviewerNotes: documentRevisionRequestsTable.reviewerNotes,
      reviewedAt: documentRevisionRequestsTable.reviewedAt,
      createdAt: documentRevisionRequestsTable.createdAt,
    })
    .from(documentRevisionRequestsTable)
    .leftJoin(documentsTable, eq(documentRevisionRequestsTable.documentId, documentsTable.id))
    .leftJoin(requestedByAlias, eq(documentRevisionRequestsTable.requestedById, requestedByAlias.id))
    .leftJoin(reviewerAlias, eq(documentRevisionRequestsTable.reviewerUserId, reviewerAlias.id))
    .where(
      and(
        eq(documentRevisionRequestsTable.documentId, docId),
        eq(documentRevisionRequestsTable.organizationId, orgId),
      ),
    )
    .orderBy(desc(documentRevisionRequestsTable.createdAt));

  res.json(rows.map(formatRevisionRequest));
});

router.post("/organizations/:orgId/documents/:docId/revision-requests", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateDocumentRevisionRequestParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateDocumentRevisionRequestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { orgId, docId } = params.data;
  const userId = req.auth!.userId;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc.status !== "approved" && doc.status !== "distributed") {
    res.status(400).json({ error: "Apenas documentos aprovados ou distribuídos podem receber solicitações de revisão" });
    return;
  }

  const reviewerValid = await validateOrgUsers([body.data.reviewerUserId], orgId);
  if (!reviewerValid) { res.status(400).json({ error: "Revisor inválido para esta organização" }); return; }

  const [created] = await db.insert(documentRevisionRequestsTable).values({
    documentId: docId,
    organizationId: orgId,
    requestedById: userId,
    reviewerUserId: body.data.reviewerUserId,
    status: "pending",
    changeDescription: body.data.changeDescription,
    attachmentFileName: body.data.attachmentFileName || null,
    attachmentFileSize: body.data.attachmentFileSize || null,
    attachmentContentType: body.data.attachmentContentType || null,
    attachmentObjectPath: body.data.attachmentObjectPath || null,
  }).returning();

  const [requesterName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await createNotification(
    orgId,
    body.data.reviewerUserId,
    "revision_request_created",
    "Nova solicitação de revisão",
    `${requesterName?.name || "Um usuário"} solicitou uma revisão para o documento "${doc.title}": ${body.data.changeDescription}`,
    "document",
    docId,
  );

  res.status(201).json(formatRevisionRequest({ ...created, documentTitle: doc.title }));
});

router.post("/organizations/:orgId/documents/:docId/revision-requests/:reqId/approve", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = ApproveDocumentRevisionRequestParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = ApproveDocumentRevisionRequestBody.safeParse(req.body || {});
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { orgId, docId, reqId } = params.data;
  const userId = req.auth!.userId;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  const [revReq] = await db.select().from(documentRevisionRequestsTable)
    .where(
      and(
        eq(documentRevisionRequestsTable.id, reqId),
        eq(documentRevisionRequestsTable.documentId, docId),
        eq(documentRevisionRequestsTable.organizationId, orgId),
      ),
    );
  if (!revReq) { res.status(404).json({ error: "Solicitação de revisão não encontrada" }); return; }
  if (revReq.reviewerUserId !== userId) { res.status(403).json({ error: "Você não é o revisor desta solicitação" }); return; }
  if (revReq.status !== "pending") { res.status(400).json({ error: "Esta solicitação já foi processada" }); return; }

  const now = new Date();
  const newVersion = doc.currentVersion + 1;

  await db.transaction(async (tx) => {
    await tx.update(documentRevisionRequestsTable)
      .set({ status: "approved", reviewerNotes: body.data.notes || null, reviewedAt: now })
      .where(eq(documentRevisionRequestsTable.id, reqId));

    await tx.update(documentsTable)
      .set({ currentVersion: newVersion, status: doc.status })
      .where(eq(documentsTable.id, docId));

    await tx.insert(documentVersionsTable).values({
      documentId: docId,
      versionNumber: newVersion,
      changeDescription: revReq.changeDescription,
      changedById: userId,
      changedFields: "revision_request_approved",
    });

    // Reset recipients so they must re-confirm the new version
    await tx.update(documentRecipientsTable)
      .set({ receivedAt: null, readAt: null })
      .where(eq(documentRecipientsTable.documentId, docId));
  });

  const [reviewerName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  // Notify requester
  await createNotification(
    orgId,
    revReq.requestedById,
    "revision_request_approved",
    "Solicitação de revisão aprovada",
    `Sua solicitação de revisão para "${doc.title}" foi aprovada por ${reviewerName?.name || "o revisor"}. Nova versão: ${newVersion}.`,
    "document",
    docId,
  );

  // Notify current recipients
  const recipients = await db.select({ userId: documentRecipientsTable.userId })
    .from(documentRecipientsTable)
    .where(eq(documentRecipientsTable.documentId, docId));

  if (recipients.length > 0) {
    await notifyUsers({
      orgId,
      userIds: recipients.map((r) => r.userId),
      actorUserId: userId,
      type: "document_distributed",
      title: "Nova versão do documento disponível",
      description: `O documento "${doc.title}" foi revisado (v${newVersion}). Confirme o recebimento.`,
      docId,
    });
  }

  const [updated] = await db.select().from(documentRevisionRequestsTable).where(eq(documentRevisionRequestsTable.id, reqId));
  res.json(formatRevisionRequest({ ...updated!, documentTitle: doc.title }));
});

router.post("/organizations/:orgId/documents/:docId/revision-requests/:reqId/reject", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = RejectDocumentRevisionRequestParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = RejectDocumentRevisionRequestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { orgId, docId, reqId } = params.data;
  const userId = req.auth!.userId;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

  const [revReq] = await db.select().from(documentRevisionRequestsTable)
    .where(
      and(
        eq(documentRevisionRequestsTable.id, reqId),
        eq(documentRevisionRequestsTable.documentId, docId),
        eq(documentRevisionRequestsTable.organizationId, orgId),
      ),
    );
  if (!revReq) { res.status(404).json({ error: "Solicitação de revisão não encontrada" }); return; }
  if (revReq.reviewerUserId !== userId) { res.status(403).json({ error: "Você não é o revisor desta solicitação" }); return; }
  if (revReq.status !== "pending") { res.status(400).json({ error: "Esta solicitação já foi processada" }); return; }

  const now = new Date();
  await db.update(documentRevisionRequestsTable)
    .set({ status: "rejected", reviewerNotes: body.data.notes, reviewedAt: now })
    .where(eq(documentRevisionRequestsTable.id, reqId));

  const [reviewerName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await createNotification(
    orgId,
    revReq.requestedById,
    "revision_request_rejected",
    "Solicitação de revisão rejeitada",
    `Sua solicitação de revisão para "${doc.title}" foi rejeitada por ${reviewerName?.name || "o revisor"}. Motivo: ${body.data.notes}`,
    "document",
    docId,
  );

  const [updated] = await db.select().from(documentRevisionRequestsTable).where(eq(documentRevisionRequestsTable.id, reqId));
  res.json(formatRevisionRequest({ ...updated!, documentTitle: doc.title }));
});

router.get("/organizations/:orgId/revision-requests", requireAuth, requireModuleAccess("documents"), async (req, res): Promise<void> => {
  const params = ListMyRevisionRequestsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const { orgId } = params.data;
  const userId = req.auth!.userId;

  const requestedByAlias = usersTable;
  const reviewerAlias = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).as("reviewer_user");

  const rows = await db
    .select({
      id: documentRevisionRequestsTable.id,
      documentId: documentRevisionRequestsTable.documentId,
      documentTitle: documentsTable.title,
      requestedById: documentRevisionRequestsTable.requestedById,
      requestedByName: requestedByAlias.name,
      reviewerUserId: documentRevisionRequestsTable.reviewerUserId,
      reviewerName: reviewerAlias.name,
      status: documentRevisionRequestsTable.status,
      changeDescription: documentRevisionRequestsTable.changeDescription,
      attachmentFileName: documentRevisionRequestsTable.attachmentFileName,
      attachmentFileSize: documentRevisionRequestsTable.attachmentFileSize,
      attachmentContentType: documentRevisionRequestsTable.attachmentContentType,
      attachmentObjectPath: documentRevisionRequestsTable.attachmentObjectPath,
      reviewerNotes: documentRevisionRequestsTable.reviewerNotes,
      reviewedAt: documentRevisionRequestsTable.reviewedAt,
      createdAt: documentRevisionRequestsTable.createdAt,
    })
    .from(documentRevisionRequestsTable)
    .leftJoin(documentsTable, eq(documentRevisionRequestsTable.documentId, documentsTable.id))
    .leftJoin(requestedByAlias, eq(documentRevisionRequestsTable.requestedById, requestedByAlias.id))
    .leftJoin(reviewerAlias, eq(documentRevisionRequestsTable.reviewerUserId, reviewerAlias.id))
    .where(
      and(
        eq(documentRevisionRequestsTable.organizationId, orgId),
        eq(documentRevisionRequestsTable.reviewerUserId, userId),
        eq(documentRevisionRequestsTable.status, "pending"),
      ),
    )
    .orderBy(desc(documentRevisionRequestsTable.createdAt));

  res.json(rows.map(formatRevisionRequest));
});

export default router;
