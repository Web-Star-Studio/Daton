import { Readable } from "stream";
import { Router, type IRouter } from "express";
import { eq, and, ilike, or, desc, inArray, sql, max } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  pool,
  documentsTable,
  documentUnitsTable,
  documentElaboratorsTable,
  documentApproversTable,
  documentCriticalAnalysisTable,
  documentCriticalReviewersTable,
  documentRecipientsTable,
  documentReferencesTable,
  documentAttachmentsTable,
  documentVersionsTable,
  usersTable,
  unitsTable,
  employeesTable,
  notificationsTable,
  sgqCommunicationPlansTable,
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
  ListDocumentVersionsParams,
  AddDocumentAttachmentParams,
  AddDocumentAttachmentBody,
  DeleteDocumentAttachmentParams,
  DeleteDocumentParams,
  ListUserOptionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireModuleAccess, requireWriteAccess } from "../middlewares/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
let supportsPendingVersionDescriptionColumnCache: boolean | null = null;
type DocumentsMutationTx = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;
const CreateDocumentBodySchema = CreateDocumentBody.extend({
  criticalReviewerIds: z.array(z.number()).min(1),
});
const UpdateDocumentBodySchema = UpdateDocumentBody.extend({
  criticalReviewerIds: z.array(z.number()).min(1).optional(),
});
const CompleteDocumentCriticalAnalysisParamsSchema = z.object({
  orgId: z.coerce.number(),
  docId: z.coerce.number(),
});
const DocumentCommunicationPlanParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
  docId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive().optional(),
});
const DocumentCommunicationPlanBodySchema = z.object({
  channel: z.string().min(1),
  audience: z.string().min(1),
  periodicity: z.string().min(1),
  requiresAcknowledgment: z.boolean().default(false),
  notes: z.string().nullable().optional(),
});

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

async function getDocumentCriticalReviewerUserIds(docId: number): Promise<number[]> {
  const rows = await db
    .selectDistinct({ userId: documentCriticalReviewersTable.userId })
    .from(documentCriticalReviewersTable)
    .where(eq(documentCriticalReviewersTable.documentId, docId));

  return rows.map((row) => row.userId);
}

async function getCurrentCriticalAnalysisCycle(docId: number): Promise<number> {
  const result = await db
    .select({
      maxCycle: sql<number>`COALESCE(MAX(${documentCriticalAnalysisTable.analysisCycle}), 0)`,
    })
    .from(documentCriticalAnalysisTable)
    .where(eq(documentCriticalAnalysisTable.documentId, docId));

  return result[0]?.maxCycle ?? 0;
}

async function lockDocumentForCriticalAnalysisMutation(
  tx: DocumentsMutationTx,
  docId: number,
): Promise<void> {
  await tx.execute(sql`SELECT 1 FROM documents WHERE id = ${docId} FOR UPDATE`);
}

async function startCriticalAnalysisCycle(
  tx: DocumentsMutationTx,
  docId: number,
  reviewerIds: number[],
): Promise<number> {
  await lockDocumentForCriticalAnalysisMutation(tx, docId);

  const maxCycleResult = await tx
    .select({
      maxCycle: sql<number>`COALESCE(MAX(${documentCriticalAnalysisTable.analysisCycle}), 0)`,
    })
    .from(documentCriticalAnalysisTable)
    .where(eq(documentCriticalAnalysisTable.documentId, docId));

  if (reviewerIds.length === 0) {
    return maxCycleResult[0]?.maxCycle ?? 0;
  }

  const nextCycle = (maxCycleResult[0]?.maxCycle ?? 0) + 1;

  await tx.insert(documentCriticalAnalysisTable).values(
    reviewerIds.map((userId) => ({
      documentId: docId,
      userId,
      analysisCycle: nextCycle,
      status: "pending",
    })),
  );

  return nextCycle;
}

async function syncDocumentCriticalReviewers(
  tx: DocumentsMutationTx,
  docId: number,
  reviewerIds: number[],
): Promise<void> {
  await lockDocumentForCriticalAnalysisMutation(tx, docId);

  await tx
    .delete(documentCriticalReviewersTable)
    .where(eq(documentCriticalReviewersTable.documentId, docId));

  if (reviewerIds.length > 0) {
    await tx.insert(documentCriticalReviewersTable).values(
      reviewerIds.map((userId) => ({
        documentId: docId,
        userId,
      })),
    );
  }
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
  const [doc, elaborators, criticalReviewers, approvers, recipients] = await Promise.all([
    db
      .select({ createdById: documentsTable.createdById })
      .from(documentsTable)
      .where(eq(documentsTable.id, docId)),
    db
      .selectDistinct({ employeeId: documentElaboratorsTable.employeeId })
      .from(documentElaboratorsTable)
      .where(eq(documentElaboratorsTable.documentId, docId)),
    db
      .selectDistinct({ userId: documentCriticalReviewersTable.userId })
      .from(documentCriticalReviewersTable)
      .where(eq(documentCriticalReviewersTable.documentId, docId)),
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
    ...criticalReviewers.map((row) => row.userId),
    ...approvers.map((row) => row.userId),
    ...recipients.map((row) => row.userId),
  ])];
}

async function getDocumentReviewStakeholderUserIds(docId: number, orgId: number): Promise<number[]> {
  const [doc, elaborators, criticalReviewers, approvers] = await Promise.all([
    db
      .select({ createdById: documentsTable.createdById })
      .from(documentsTable)
      .where(eq(documentsTable.id, docId)),
    db
      .selectDistinct({ employeeId: documentElaboratorsTable.employeeId })
      .from(documentElaboratorsTable)
      .where(eq(documentElaboratorsTable.documentId, docId)),
    db
      .selectDistinct({ userId: documentCriticalReviewersTable.userId })
      .from(documentCriticalReviewersTable)
      .where(eq(documentCriticalReviewersTable.documentId, docId)),
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
    ...criticalReviewers.map((row) => row.userId),
    ...approvers.map((row) => row.userId),
  ])];
}

async function getDocumentDraftStakeholderUserIds(docId: number, orgId: number): Promise<number[]> {
  const [doc, elaborators, criticalReviewers, recipients] = await Promise.all([
    db
      .select({ createdById: documentsTable.createdById })
      .from(documentsTable)
      .where(eq(documentsTable.id, docId)),
    db
      .selectDistinct({ employeeId: documentElaboratorsTable.employeeId })
      .from(documentElaboratorsTable)
      .where(eq(documentElaboratorsTable.documentId, docId)),
    db
      .selectDistinct({ userId: documentCriticalReviewersTable.userId })
      .from(documentCriticalReviewersTable)
      .where(eq(documentCriticalReviewersTable.documentId, docId)),
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
    ...criticalReviewers.map((row) => row.userId),
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

async function notifyDocumentDraftStakeholders({
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
  const stakeholderIds = await getDocumentDraftStakeholderUserIds(docId, orgId);
  await notifyUsers({
    orgId,
    userIds: stakeholderIds,
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
      createdById: documentsTable.createdById,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
    })
    .from(documentsTable)
    .where(and(eq(documentsTable.id, docId), eq(documentsTable.organizationId, orgId)));

  return doc ?? null;
}

async function assertPolicyDocument(docId: number, orgId: number) {
  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) return { error: "DOCUMENT_NOT_FOUND" as const };
  if (doc.type !== "politica") return { error: "DOCUMENT_NOT_POLICY" as const };
  return { doc };
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

  const maxCriticalAnalysisCycleResult = await db
    .select({
      maxCycle: sql<number>`COALESCE(MAX(${documentCriticalAnalysisTable.analysisCycle}), 0)`,
    })
    .from(documentCriticalAnalysisTable)
    .where(eq(documentCriticalAnalysisTable.documentId, docId));
  const currentCriticalAnalysisCycle = maxCriticalAnalysisCycleResult[0]?.maxCycle ?? 0;

  const criticalReviewerRows =
    currentCriticalAnalysisCycle > 0
      ? await db
          .select({
            id: documentCriticalAnalysisTable.id,
            userId: documentCriticalAnalysisTable.userId,
            name: usersTable.name,
            status: documentCriticalAnalysisTable.status,
            completedAt: documentCriticalAnalysisTable.completedAt,
          })
          .from(documentCriticalAnalysisTable)
          .innerJoin(usersTable, eq(documentCriticalAnalysisTable.userId, usersTable.id))
          .where(
            and(
              eq(documentCriticalAnalysisTable.documentId, docId),
              eq(documentCriticalAnalysisTable.analysisCycle, currentCriticalAnalysisCycle),
            ),
          )
      : await db
          .select({
            id: documentCriticalReviewersTable.id,
            userId: documentCriticalReviewersTable.userId,
            name: usersTable.name,
            status: sql<string>`'pending'`,
            completedAt: sql<Date | null>`NULL`,
          })
          .from(documentCriticalReviewersTable)
          .innerJoin(usersTable, eq(documentCriticalReviewersTable.userId, usersTable.id))
          .where(eq(documentCriticalReviewersTable.documentId, docId));

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

  const communicationPlanRows = await db
    .select({
      id: sgqCommunicationPlansTable.id,
      channel: sgqCommunicationPlansTable.channel,
      audience: sgqCommunicationPlansTable.audience,
      periodicity: sgqCommunicationPlansTable.periodicity,
      requiresAcknowledgment: sgqCommunicationPlansTable.requiresAcknowledgment,
      notes: sgqCommunicationPlansTable.notes,
      lastDistributedAt: sgqCommunicationPlansTable.lastDistributedAt,
      createdById: sgqCommunicationPlansTable.createdById,
      createdByName: usersTable.name,
      createdAt: sgqCommunicationPlansTable.createdAt,
      updatedAt: sgqCommunicationPlansTable.updatedAt,
    })
    .from(sgqCommunicationPlansTable)
    .leftJoin(usersTable, eq(sgqCommunicationPlansTable.createdById, usersTable.id))
    .where(eq(sgqCommunicationPlansTable.documentId, docId))
    .orderBy(desc(sgqCommunicationPlansTable.updatedAt));

  return {
    ...doc,
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
    criticalReviewers: criticalReviewerRows.map((reviewer) => ({
      ...reviewer,
      completedAt:
        reviewer.completedAt instanceof Date
          ? reviewer.completedAt.toISOString()
          : reviewer.completedAt,
    })),
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
    communicationPlans: communicationPlanRows.map((plan) => ({
      ...plan,
      createdAt: plan.createdAt instanceof Date ? plan.createdAt.toISOString() : plan.createdAt,
      updatedAt: plan.updatedAt instanceof Date ? plan.updatedAt.toISOString() : plan.updatedAt,
      lastDistributedAt:
        plan.lastDistributedAt instanceof Date
          ? plan.lastDistributedAt.toISOString()
          : plan.lastDistributedAt,
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

  const conditions = [eq(documentsTable.organizationId, params.data.orgId)];

  if (query.data.search) {
    conditions.push(ilike(documentsTable.title, `%${query.data.search}%`));
  }
  if (query.data.type) {
    conditions.push(eq(documentsTable.type, query.data.type));
  }
  if (query.data.status) {
    conditions.push(eq(documentsTable.status, query.data.status));
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

  const body = CreateDocumentBodySchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const userId = req.auth!.userId;
  const orgId = params.data.orgId;
  const elaboratorIds = body.data.elaboratorIds;
  const criticalReviewerIds = [...new Set(body.data.criticalReviewerIds)];

  const allUserIds = [...new Set([
    ...criticalReviewerIds,
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

  const [doc] = await db.transaction(async (tx) => {
    const [createdDoc] = await tx.insert(documentsTable).values({
      organizationId: orgId,
      title: body.data.title,
      type: body.data.type,
      validityDate: body.data.validityDate || null,
      createdById: userId,
      status: "draft",
      currentVersion: 0,
    }).returning();

    if (body.data.unitIds?.length) {
      await tx.insert(documentUnitsTable).values(
        body.data.unitIds.map((unitId) => ({ documentId: createdDoc.id, unitId })),
      );
    }

    if (elaboratorIds.length > 0) {
      await tx.insert(documentElaboratorsTable).values(
        elaboratorIds.map((employeeId) => ({ documentId: createdDoc.id, employeeId })),
      );
    }

    await syncDocumentCriticalReviewers(tx, createdDoc.id, criticalReviewerIds);
    await startCriticalAnalysisCycle(tx, createdDoc.id, criticalReviewerIds);

    if (body.data.approverIds?.length) {
      await tx.insert(documentApproversTable).values(
        body.data.approverIds.map((uid) => ({ documentId: createdDoc.id, userId: uid })),
      );
    }

    if (body.data.recipientIds?.length) {
      await tx.insert(documentRecipientsTable).values(
        body.data.recipientIds.map((uid) => ({ documentId: createdDoc.id, userId: uid })),
      );
    }

    if (body.data.referenceIds?.length) {
      await tx.insert(documentReferencesTable).values(
        body.data.referenceIds.map((refId) => ({ documentId: createdDoc.id, referencedDocumentId: refId })),
      );
    }

    if (body.data.attachments?.length) {
      await tx.insert(documentAttachmentsTable).values(
        body.data.attachments.map((att) => ({
          documentId: createdDoc.id,
          versionNumber: 1,
          fileName: att.fileName,
          fileSize: att.fileSize,
          contentType: att.contentType,
          objectPath: att.objectPath,
          uploadedById: userId,
        })),
      );
    }

    return [createdDoc] as const;
  });

  await notifyUsers({
    orgId,
    userIds: criticalReviewerIds,
    actorUserId: userId,
    type: "document_critical_analysis_requested",
    title: "Documento aguardando análise crítica",
    description: `O documento "${body.data.title}" foi criado e aguarda sua análise crítica.`,
    docId: doc.id,
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

router.get(
  "/organizations/:orgId/documents/:docId/communication-plans",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DocumentCommunicationPlanParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const policyCheck = await assertPolicyDocument(params.data.docId, params.data.orgId);
    if ("error" in policyCheck) {
      if (policyCheck.error === "DOCUMENT_NOT_FOUND") {
        res.status(404).json({ error: "Documento não encontrado" });
        return;
      }
      res.status(400).json({ error: "Apenas políticas aceitam planos de comunicação SGQ" });
      return;
    }

    const detail = await getDocumentDetail(params.data.docId, params.data.orgId);
    res.json(detail?.communicationPlans ?? []);
  },
);

router.post(
  "/organizations/:orgId/documents/:docId/communication-plans",
  requireAuth,
  requireModuleAccess("documents"),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DocumentCommunicationPlanParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = DocumentCommunicationPlanBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const policyCheck = await assertPolicyDocument(params.data.docId, params.data.orgId);
    if ("error" in policyCheck) {
      if (policyCheck.error === "DOCUMENT_NOT_FOUND") {
        res.status(404).json({ error: "Documento não encontrado" });
        return;
      }
      res.status(400).json({ error: "Apenas políticas aceitam planos de comunicação SGQ" });
      return;
    }

    await db.insert(sgqCommunicationPlansTable).values({
      organizationId: params.data.orgId,
      documentId: params.data.docId,
      channel: body.data.channel,
      audience: body.data.audience,
      periodicity: body.data.periodicity,
      requiresAcknowledgment: body.data.requiresAcknowledgment,
      notes: body.data.notes ?? null,
      createdById: req.auth!.userId,
      updatedById: req.auth!.userId,
    });

    const detail = await getDocumentDetail(params.data.docId, params.data.orgId);
    res.status(201).json(detail?.communicationPlans ?? []);
  },
);

router.patch(
  "/organizations/:orgId/documents/:docId/communication-plans/:planId",
  requireAuth,
  requireModuleAccess("documents"),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DocumentCommunicationPlanParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = DocumentCommunicationPlanBodySchema.partial().safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (!params.data.planId) {
      res.status(400).json({ error: "Plano de comunicação inválido" });
      return;
    }

    const policyCheck = await assertPolicyDocument(params.data.docId, params.data.orgId);
    if ("error" in policyCheck) {
      if (policyCheck.error === "DOCUMENT_NOT_FOUND") {
        res.status(404).json({ error: "Documento não encontrado" });
        return;
      }
      res.status(400).json({ error: "Apenas políticas aceitam planos de comunicação SGQ" });
      return;
    }

    const [plan] = await db
      .select({ id: sgqCommunicationPlansTable.id })
      .from(sgqCommunicationPlansTable)
      .where(
        and(
          eq(sgqCommunicationPlansTable.id, params.data.planId),
          eq(sgqCommunicationPlansTable.documentId, params.data.docId),
          eq(sgqCommunicationPlansTable.organizationId, params.data.orgId),
        ),
      );

    if (!plan) {
      res.status(404).json({ error: "Plano de comunicação não encontrado" });
      return;
    }

    const updateData: Record<string, unknown> = {
      updatedById: req.auth!.userId,
    };
    if (body.data.channel !== undefined) updateData.channel = body.data.channel;
    if (body.data.audience !== undefined) updateData.audience = body.data.audience;
    if (body.data.periodicity !== undefined) updateData.periodicity = body.data.periodicity;
    if (body.data.requiresAcknowledgment !== undefined) {
      updateData.requiresAcknowledgment = body.data.requiresAcknowledgment;
    }
    if (body.data.notes !== undefined) updateData.notes = body.data.notes ?? null;

    await db
      .update(sgqCommunicationPlansTable)
      .set(updateData)
      .where(eq(sgqCommunicationPlansTable.id, params.data.planId));

    const detail = await getDocumentDetail(params.data.docId, params.data.orgId);
    res.json(detail?.communicationPlans ?? []);
  },
);

router.delete(
  "/organizations/:orgId/documents/:docId/communication-plans/:planId",
  requireAuth,
  requireModuleAccess("documents"),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DocumentCommunicationPlanParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (!params.data.planId) {
      res.status(400).json({ error: "Plano de comunicação inválido" });
      return;
    }

    const policyCheck = await assertPolicyDocument(params.data.docId, params.data.orgId);
    if ("error" in policyCheck) {
      if (policyCheck.error === "DOCUMENT_NOT_FOUND") {
        res.status(404).json({ error: "Documento não encontrado" });
        return;
      }
      res.status(400).json({ error: "Apenas políticas aceitam planos de comunicação SGQ" });
      return;
    }

    await db
      .delete(sgqCommunicationPlansTable)
      .where(
        and(
          eq(sgqCommunicationPlansTable.id, params.data.planId),
          eq(sgqCommunicationPlansTable.documentId, params.data.docId),
          eq(sgqCommunicationPlansTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

router.patch("/organizations/:orgId/documents/:docId", requireAuth, requireModuleAccess("documents"), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateDocumentBodySchema.safeParse(req.body);
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

  const nextCriticalReviewerIds = await db.transaction(async (tx) => {
    const reviewerIds =
      body.data.criticalReviewerIds !== undefined
        ? [...new Set(body.data.criticalReviewerIds)]
        : (
            await tx
              .selectDistinct({ userId: documentCriticalReviewersTable.userId })
              .from(documentCriticalReviewersTable)
              .where(eq(documentCriticalReviewersTable.documentId, docId))
          ).map((row) => row.userId);

    await tx
      .update(documentsTable)
      .set({
        ...updates,
        status: "draft",
      })
      .where(eq(documentsTable.id, docId));

    if (body.data.unitIds) {
      await tx.delete(documentUnitsTable).where(eq(documentUnitsTable.documentId, docId));
      if (body.data.unitIds.length) {
        await tx.insert(documentUnitsTable).values(
          body.data.unitIds.map((uid) => ({ documentId: docId, unitId: uid })),
        );
      }
    }

    if (body.data.elaboratorIds !== undefined) {
      await tx
        .delete(documentElaboratorsTable)
        .where(eq(documentElaboratorsTable.documentId, docId));
      if (body.data.elaboratorIds.length > 0) {
        await tx.insert(documentElaboratorsTable).values(
          body.data.elaboratorIds.map((employeeId) => ({ documentId: docId, employeeId })),
        );
      }
    }

    if (body.data.criticalReviewerIds !== undefined) {
      await syncDocumentCriticalReviewers(tx, docId, reviewerIds);
    }

    if (body.data.approverIds) {
      await tx.delete(documentApproversTable).where(eq(documentApproversTable.documentId, docId));
      if (body.data.approverIds.length) {
        await tx.insert(documentApproversTable).values(
          body.data.approverIds.map((uid) => ({ documentId: docId, userId: uid })),
        );
      }
    }

    if (body.data.recipientIds) {
      await tx.delete(documentRecipientsTable).where(eq(documentRecipientsTable.documentId, docId));
      if (body.data.recipientIds.length) {
        await tx.insert(documentRecipientsTable).values(
          body.data.recipientIds.map((uid) => ({ documentId: docId, userId: uid })),
        );
      }
    }

    if (body.data.referenceIds) {
      await tx.delete(documentReferencesTable).where(eq(documentReferencesTable.documentId, docId));
      if (body.data.referenceIds.length) {
        await tx.insert(documentReferencesTable).values(
          body.data.referenceIds.map((refId) => ({ documentId: docId, referencedDocumentId: refId })),
        );
      }
    }

    await startCriticalAnalysisCycle(tx, docId, reviewerIds);

    return reviewerIds;
  });

  const detail = await getDocumentDetail(docId, orgId);
  await notifyUsers({
    orgId,
    userIds: nextCriticalReviewerIds,
    actorUserId: userId,
    type: "document_critical_analysis_requested",
    title: "Documento reenviado para análise crítica",
    description: `O documento "${detail?.title || existing.title}" foi atualizado e precisa de nova análise crítica.`,
    docId,
  });
  await notifyDocumentDraftStakeholders({
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
  const criticalReviewerIds = await getDocumentCriticalReviewerUserIds(doc.id);

  const [att] = await db.transaction(async (tx) => {
    const [createdAttachment] = await tx.insert(documentAttachmentsTable).values({
      documentId: doc.id,
      versionNumber: doc.currentVersion + 1,
      fileName: body.data.fileName,
      fileSize: body.data.fileSize,
      contentType: body.data.contentType,
      objectPath: body.data.objectPath,
      uploadedById: userId,
    }).returning();

    await tx
      .update(documentsTable)
      .set({ status: "draft" })
      .where(eq(documentsTable.id, doc.id));
    await startCriticalAnalysisCycle(tx, doc.id, criticalReviewerIds);

    return [createdAttachment] as const;
  });

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await notifyUsers({
    orgId: params.data.orgId,
    userIds: criticalReviewerIds,
    actorUserId: userId,
    type: "document_critical_analysis_requested",
    title: "Documento reenviado para análise crítica",
    description: `O documento "${doc.title}" recebeu um novo anexo e precisa de nova análise crítica.`,
    docId: doc.id,
  });
  await notifyDocumentDraftStakeholders({
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
  const criticalReviewerIds = await getDocumentCriticalReviewerUserIds(doc.id);
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

      await tx
        .update(documentsTable)
        .set({ status: "draft" })
        .where(eq(documentsTable.id, doc.id));
      await startCriticalAnalysisCycle(tx, doc.id, criticalReviewerIds);

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

  await notifyUsers({
    orgId: params.data.orgId,
    userIds: criticalReviewerIds,
    actorUserId: userId,
    type: "document_critical_analysis_requested",
    title: "Documento reenviado para análise crítica",
    description: `O documento "${doc.title}" teve anexos alterados e precisa de nova análise crítica.`,
    docId: doc.id,
  });
  await notifyDocumentDraftStakeholders({
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

router.post("/organizations/:orgId/documents/:docId/critical-analysis/complete", requireAuth, requireModuleAccess("documents"), async (req, res): Promise<void> => {
  const params = CompleteDocumentCriticalAnalysisParamsSchema.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const orgId = params.data.orgId;
  const docId = params.data.docId;
  const userId = req.auth!.userId;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc.status !== "draft") { res.status(400).json({ error: "A análise crítica só pode ser concluída para documentos em análise crítica" }); return; }

  const currentCriticalAnalysisCycle = await getCurrentCriticalAnalysisCycle(docId);
  if (currentCriticalAnalysisCycle === 0) {
    res.status(400).json({ error: "O documento não possui uma análise crítica ativa" });
    return;
  }

  const [criticalReview] = await db
    .select()
    .from(documentCriticalAnalysisTable)
    .where(
      and(
        eq(documentCriticalAnalysisTable.documentId, docId),
        eq(documentCriticalAnalysisTable.userId, userId),
        eq(documentCriticalAnalysisTable.analysisCycle, currentCriticalAnalysisCycle),
      ),
    );

  if (!criticalReview) {
    res.status(403).json({ error: "Você não é um responsável ativo pela análise crítica deste documento" });
    return;
  }
  if (criticalReview.status === "completed") {
    res.status(400).json({ error: "Sua análise crítica já foi concluída neste ciclo" });
    return;
  }

  await db
    .update(documentCriticalAnalysisTable)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedById: userId,
    })
    .where(eq(documentCriticalAnalysisTable.id, criticalReview.id));

  const detail = await getDocumentDetail(docId, orgId);
  res.json(detail);
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

  const criticalReviewerIds = await getDocumentCriticalReviewerUserIds(docId);
  if (criticalReviewerIds.length === 0) {
    res.status(400).json({ error: "O documento deve ter pelo menos um responsável pela análise crítica" });
    return;
  }

  const currentCriticalAnalysisCycle = await getCurrentCriticalAnalysisCycle(docId);
  if (currentCriticalAnalysisCycle === 0) {
    res.status(400).json({ error: "A análise crítica do documento ainda não foi iniciada" });
    return;
  }

  const pendingCriticalReviewers = await db
    .select({ id: documentCriticalAnalysisTable.id })
    .from(documentCriticalAnalysisTable)
    .where(
      and(
        eq(documentCriticalAnalysisTable.documentId, docId),
        eq(documentCriticalAnalysisTable.analysisCycle, currentCriticalAnalysisCycle),
        eq(documentCriticalAnalysisTable.status, "pending"),
      ),
    );

  if (pendingCriticalReviewers.length > 0) {
    res.status(400).json({ error: "Conclua a análise crítica antes de enviar o documento para revisão" });
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

  const submitUpdates: Record<string, unknown> = {
    status: "in_review",
  };
  if (await supportsPendingVersionDescriptionColumn()) {
    submitUpdates.pendingVersionDescription = body.data.changeDescription.trim();
  }

  await db.update(documentsTable)
    .set(submitUpdates)
    .where(eq(documentsTable.id, docId));

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

    const pendingApprovers = await tx.select().from(documentApproversTable)
      .where(and(
        eq(documentApproversTable.documentId, docId),
        eq(documentApproversTable.approvalCycle, currentCycle),
        eq(documentApproversTable.status, "pending")
      ));

    if (pendingApprovers.length > 0) {
      return {
        fullyApproved: false,
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

  if (approvalResult.fullyApproved) {
    await notifyDocumentParticipants({
      orgId,
      docId,
      actorUserId: userId,
      type: "document_approved",
      title: "Documento aprovado",
      description: `O documento "${doc.title}" foi aprovado por todos os aprovadores e formalizou a versão ${approvalResult.newVersion}.`,
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
  const criticalReviewerIds = await getDocumentCriticalReviewerUserIds(docId);

  await db.transaction(async (tx) => {
    await tx.update(documentApproversTable)
      .set({ status: "rejected", approvedAt: new Date(), comment: body.data.comment })
      .where(eq(documentApproversTable.id, approver.id));

    await tx
      .update(documentsTable)
      .set({ status: "draft" })
      .where(eq(documentsTable.id, docId));

    await startCriticalAnalysisCycle(tx, docId, criticalReviewerIds);
  });

  const [userName] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));

  await notifyUsers({
    orgId,
    userIds: criticalReviewerIds,
    actorUserId: userId,
    type: "document_critical_analysis_requested",
    title: "Documento reenviado para análise crítica",
    description: `O documento "${doc.title}" retornou para análise crítica após rejeição na aprovação.`,
    docId,
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
  const actorUserId = req.auth!.userId;

  const doc = await getDocumentRecord(docId, orgId);
  if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
  if (doc.status !== "approved") { res.status(400).json({ error: "Documento precisa estar aprovado para ser distribuído" }); return; }

  const recipients = await db.transaction(async (tx) => {
    await tx
      .update(documentsTable)
      .set({ status: "distributed" })
      .where(eq(documentsTable.id, docId));

    await tx
      .update(sgqCommunicationPlansTable)
      .set({
        lastDistributedAt: new Date(),
        updatedById: actorUserId,
      })
      .where(
        and(
          eq(sgqCommunicationPlansTable.documentId, docId),
          eq(sgqCommunicationPlansTable.organizationId, orgId),
        ),
      );

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
  await db.update(documentRecipientsTable)
    .set({ receivedAt: recipient.receivedAt || now, readAt: now })
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

export default router;
