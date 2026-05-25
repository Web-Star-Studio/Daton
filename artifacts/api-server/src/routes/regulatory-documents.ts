import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import {
  db,
  regulatoryDocumentAttachmentsTable,
  regulatoryDocumentRenewalsTable,
  regulatoryDocumentsTable,
  unitsTable,
  usersTable,
} from "@workspace/db";
import {
  ListRegulatoryDocumentsParams,
  ListRegulatoryDocumentsQueryParams,
  CreateRegulatoryDocumentParams,
  CreateRegulatoryDocumentBody,
  GetRegulatoryDocumentParams,
  UpdateRegulatoryDocumentParams,
  UpdateRegulatoryDocumentBody,
  DeleteRegulatoryDocumentParams,
  ProcessRegulatoryDocumentAlertsParams,
  ListRegulatoryDocumentRenewalsParams,
  CreateRegulatoryDocumentRenewalParams,
  CreateRegulatoryDocumentRenewalBody,
  UpdateRegulatoryDocumentRenewalParams,
  UpdateRegulatoryDocumentRenewalBody,
  DeleteRegulatoryDocumentRenewalParams,
  ListRegulatoryDocumentAttachmentsParams,
  ListRegulatoryDocumentAttachmentsQueryParams,
  AddRegulatoryDocumentAttachmentParams,
  AddRegulatoryDocumentAttachmentBody,
  DeleteRegulatoryDocumentAttachmentParams,
  ImportRegulatoryDocumentsParams,
  ImportRegulatoryDocumentsBody,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";
import { runRegulatoryDocumentAlertsPass } from "../services/regulatory-documents/alerts";
import { computeStatus } from "../services/regulatory-documents/status";
import { importRegulatoryDocuments } from "../services/regulatory-documents/import";

const router: IRouter = Router();

// --- Helpers ---

const AUTO_RENEWAL_OFFSET_DAYS = 60;

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(isoDateStr: string, days: number): string {
  const [y, m, d] = isoDateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

// --- Serializers ---

function serializeDocument(
  d: typeof regulatoryDocumentsTable.$inferSelect,
  unitName: string | null,
  responsibleUserName: string | null,
  responsibleUserEmail: string | null,
  attachmentCount: number,
  latestRenewalStatus: string | null,
) {
  return {
    id: d.id,
    organizationId: d.organizationId,
    unitId: d.unitId,
    unitName,
    identifierType: d.identifierType,
    identifierOther: d.identifierOther,
    documentNumber: d.documentNumber,
    issuingBody: d.issuingBody,
    processNumber: d.processNumber,
    responsibleUserId: d.responsibleUserId,
    responsibleUserName,
    responsibleUserEmail,
    issueDate: d.issueDate,
    expirationDate: d.expirationDate,
    renewalRequired: d.renewalRequired,
    alertDaysOverride: d.alertDaysOverride,
    externalSourceProvider: d.externalSourceProvider,
    externalSourceReference: d.externalSourceReference,
    externalSourceUrl: d.externalSourceUrl,
    externalLastSyncAt: d.externalLastSyncAt ? d.externalLastSyncAt.toISOString() : null,
    notes: d.notes,
    status: d.status,
    attachmentCount,
    latestRenewalStatus,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function serializeRenewal(
  r: typeof regulatoryDocumentRenewalsTable.$inferSelect,
  recordedByUserName: string | null,
  attachmentCount: number,
) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    documentId: r.documentId,
    status: r.status,
    scheduledStartDate: r.scheduledStartDate,
    protocolDeadline: r.protocolDeadline,
    protocolNumber: r.protocolNumber,
    newExpirationDate: r.newExpirationDate,
    issuingBody: r.issuingBody,
    notes: r.notes,
    recordedByUserId: r.recordedByUserId,
    recordedByUserName,
    attachmentCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeAttachment(a: typeof regulatoryDocumentAttachmentsTable.$inferSelect) {
  return {
    ...a,
    uploadedAt: a.uploadedAt.toISOString(),
  };
}

async function loadDocumentSerialized(orgId: number, docId: number) {
  const [doc] = await db
    .select({
      d: regulatoryDocumentsTable,
      unitName: unitsTable.name,
      responsibleUserName: usersTable.name,
      responsibleUserEmail: usersTable.email,
    })
    .from(regulatoryDocumentsTable)
    .leftJoin(unitsTable, eq(regulatoryDocumentsTable.unitId, unitsTable.id))
    .leftJoin(usersTable, eq(regulatoryDocumentsTable.responsibleUserId, usersTable.id))
    .where(
      and(
        eq(regulatoryDocumentsTable.id, docId),
        eq(regulatoryDocumentsTable.organizationId, orgId),
      ),
    );
  if (!doc) return null;

  const [{ value: attachmentCount }] = await db
    .select({ value: count() })
    .from(regulatoryDocumentAttachmentsTable)
    .where(eq(regulatoryDocumentAttachmentsTable.documentId, docId));

  const [latestRenewal] = await db
    .select({ status: regulatoryDocumentRenewalsTable.status })
    .from(regulatoryDocumentRenewalsTable)
    .where(eq(regulatoryDocumentRenewalsTable.documentId, docId))
    .orderBy(desc(regulatoryDocumentRenewalsTable.createdAt))
    .limit(1);

  return serializeDocument(
    doc.d,
    doc.unitName ?? null,
    doc.responsibleUserName ?? null,
    doc.responsibleUserEmail ?? null,
    Number(attachmentCount),
    latestRenewal?.status ?? null,
  );
}

// --- Documents CRUD ---

router.get(
  "/organizations/:orgId/regulatory-documents",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListRegulatoryDocumentsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const query = ListRegulatoryDocumentsQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

    const conditions = [eq(regulatoryDocumentsTable.organizationId, params.data.orgId)];
    if (query.data.unitId) conditions.push(eq(regulatoryDocumentsTable.unitId, query.data.unitId));
    if (query.data.identifierType) conditions.push(eq(regulatoryDocumentsTable.identifierType, query.data.identifierType));
    if (query.data.status) conditions.push(eq(regulatoryDocumentsTable.status, query.data.status));
    if (query.data.search) {
      const term = `%${query.data.search.toLowerCase()}%`;
      conditions.push(sql`(
        lower(${regulatoryDocumentsTable.documentNumber}) like ${term}
        or lower(${regulatoryDocumentsTable.issuingBody}) like ${term}
        or lower(${regulatoryDocumentsTable.processNumber}) like ${term}
      )`);
    }

    // Subquery: latest renewal status per document.
    const latestRenewalSq = db
      .select({
        documentId: regulatoryDocumentRenewalsTable.documentId,
        status: regulatoryDocumentRenewalsTable.status,
      })
      .from(regulatoryDocumentRenewalsTable)
      .where(
        sql`(${regulatoryDocumentRenewalsTable.documentId}, ${regulatoryDocumentRenewalsTable.createdAt}) in (
          select document_id, max(created_at)
          from regulatory_document_renewals
          group by document_id
        )`,
      )
      .as("latest_renewal");

    const rows = await db
      .select({
        d: regulatoryDocumentsTable,
        unitName: unitsTable.name,
        responsibleUserName: usersTable.name,
        responsibleUserEmail: usersTable.email,
        attachmentCount: sql<number>`cast(count(distinct ${regulatoryDocumentAttachmentsTable.id}) as int)`,
        latestRenewalStatus: latestRenewalSq.status,
      })
      .from(regulatoryDocumentsTable)
      .leftJoin(unitsTable, eq(regulatoryDocumentsTable.unitId, unitsTable.id))
      .leftJoin(usersTable, eq(regulatoryDocumentsTable.responsibleUserId, usersTable.id))
      .leftJoin(regulatoryDocumentAttachmentsTable, eq(regulatoryDocumentsTable.id, regulatoryDocumentAttachmentsTable.documentId))
      .leftJoin(latestRenewalSq, eq(regulatoryDocumentsTable.id, latestRenewalSq.documentId))
      .where(and(...conditions))
      .groupBy(regulatoryDocumentsTable.id, unitsTable.name, usersTable.name, usersTable.email, latestRenewalSq.status)
      .orderBy(asc(regulatoryDocumentsTable.expirationDate));

    res.json(rows.map((row) =>
      serializeDocument(
        row.d,
        row.unitName ?? null,
        row.responsibleUserName ?? null,
        row.responsibleUserEmail ?? null,
        row.attachmentCount,
        row.latestRenewalStatus ?? null,
      ),
    ));
  },
);

router.post(
  "/organizations/:orgId/regulatory-documents",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateRegulatoryDocumentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = CreateRegulatoryDocumentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    // Validate unit belongs to org (security + integrity)
    const [unit] = await db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(and(eq(unitsTable.id, body.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));
    if (!unit) { res.status(400).json({ error: "Filial não encontrada" }); return; }

    const computedStatus = computeStatus(body.data.expirationDate, body.data.alertDaysOverride ?? null);

    const [doc] = await db
      .insert(regulatoryDocumentsTable)
      .values({
        organizationId: params.data.orgId,
        unitId: body.data.unitId,
        identifierType: body.data.identifierType,
        identifierOther: body.data.identifierOther ?? null,
        documentNumber: body.data.documentNumber ?? null,
        issuingBody: body.data.issuingBody,
        processNumber: body.data.processNumber ?? null,
        responsibleUserId: body.data.responsibleUserId ?? null,
        issueDate: body.data.issueDate ?? null,
        expirationDate: body.data.expirationDate,
        renewalRequired: body.data.renewalRequired ?? true,
        alertDaysOverride: body.data.alertDaysOverride ?? null,
        notes: body.data.notes ?? null,
        status: computedStatus,
      })
      .returning();

    // Q2 decision: when renewalRequired, auto-schedule the first renewal cycle.
    if (doc.renewalRequired) {
      const scheduledStartDate = addDays(doc.expirationDate, -AUTO_RENEWAL_OFFSET_DAYS);
      await db.insert(regulatoryDocumentRenewalsTable).values({
        organizationId: params.data.orgId,
        documentId: doc.id,
        status: "nao_iniciado",
        scheduledStartDate,
      });
    }

    const serialized = await loadDocumentSerialized(params.data.orgId, doc.id);
    res.status(201).json(serialized);
  },
);

router.get(
  "/organizations/:orgId/regulatory-documents/:docId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetRegulatoryDocumentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const doc = await loadDocumentSerialized(params.data.orgId, params.data.docId);
    if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }
    res.json(doc);
  },
);

router.patch(
  "/organizations/:orgId/regulatory-documents/:docId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateRegulatoryDocumentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateRegulatoryDocumentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    if (body.data.unitId) {
      const [unit] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(and(eq(unitsTable.id, body.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));
      if (!unit) { res.status(400).json({ error: "Filial não encontrada" }); return; }
    }

    // Recompute status if expirationDate or alertDaysOverride changed.
    const updates: Record<string, unknown> = { ...body.data, updatedAt: new Date() };
    if (body.data.expirationDate !== undefined || body.data.alertDaysOverride !== undefined) {
      // Need the existing record to fill the field that was not supplied.
      const [existing] = await db
        .select({ expirationDate: regulatoryDocumentsTable.expirationDate, alertDaysOverride: regulatoryDocumentsTable.alertDaysOverride })
        .from(regulatoryDocumentsTable)
        .where(and(eq(regulatoryDocumentsTable.id, params.data.docId), eq(regulatoryDocumentsTable.organizationId, params.data.orgId)));
      if (!existing) { res.status(404).json({ error: "Documento não encontrado" }); return; }

      const nextExp = body.data.expirationDate ?? existing.expirationDate;
      const nextAlert = body.data.alertDaysOverride !== undefined ? body.data.alertDaysOverride : existing.alertDaysOverride;
      updates.status = computeStatus(nextExp, nextAlert);
    }

    const [doc] = await db
      .update(regulatoryDocumentsTable)
      .set(updates)
      .where(and(eq(regulatoryDocumentsTable.id, params.data.docId), eq(regulatoryDocumentsTable.organizationId, params.data.orgId)))
      .returning();
    if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

    const serialized = await loadDocumentSerialized(params.data.orgId, doc.id);
    res.json(serialized);
  },
);

router.delete(
  "/organizations/:orgId/regulatory-documents/:docId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteRegulatoryDocumentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(regulatoryDocumentsTable)
      .where(and(eq(regulatoryDocumentsTable.id, params.data.docId), eq(regulatoryDocumentsTable.organizationId, params.data.orgId)));

    res.sendStatus(204);
  },
);

// --- Process alerts ---

router.post(
  "/organizations/:orgId/regulatory-documents/process-alerts",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = ProcessRegulatoryDocumentAlertsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const result = await runRegulatoryDocumentAlertsPass(params.data.orgId);
    res.json(result);
  },
);

// --- Bulk import (CSV/Excel) ---
//
// Não-transacional: linhas válidas são gravadas e linhas inválidas vão para a
// lista de erros com o número da linha (1-based, com header na linha 1). A
// alternativa transacional foi descartada porque, na UX, o cliente quer
// revisar e corrigir o que falhou — não recomeçar do zero.

router.post(
  "/organizations/:orgId/regulatory-documents/import",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = ImportRegulatoryDocumentsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = ImportRegulatoryDocumentsBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const result = await importRegulatoryDocuments(params.data.orgId, body.data.rows);
    res.json(result);
  },
);

// --- Renewals ---

router.get(
  "/organizations/:orgId/regulatory-documents/:docId/renewals",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListRegulatoryDocumentRenewalsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select({
        r: regulatoryDocumentRenewalsTable,
        recordedByUserName: usersTable.name,
        attachmentCount: sql<number>`cast(count(distinct ${regulatoryDocumentAttachmentsTable.id}) as int)`,
      })
      .from(regulatoryDocumentRenewalsTable)
      .leftJoin(usersTable, eq(regulatoryDocumentRenewalsTable.recordedByUserId, usersTable.id))
      .leftJoin(regulatoryDocumentAttachmentsTable, eq(regulatoryDocumentRenewalsTable.id, regulatoryDocumentAttachmentsTable.renewalId))
      .where(
        and(
          eq(regulatoryDocumentRenewalsTable.documentId, params.data.docId),
          eq(regulatoryDocumentRenewalsTable.organizationId, params.data.orgId),
        ),
      )
      .groupBy(regulatoryDocumentRenewalsTable.id, usersTable.name)
      .orderBy(desc(regulatoryDocumentRenewalsTable.createdAt));

    res.json(rows.map((row) => serializeRenewal(row.r, row.recordedByUserName ?? null, row.attachmentCount)));
  },
);

router.post(
  "/organizations/:orgId/regulatory-documents/:docId/renewals",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateRegulatoryDocumentRenewalParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = CreateRegulatoryDocumentRenewalBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    // Parent must exist within this org.
    const [doc] = await db
      .select({ id: regulatoryDocumentsTable.id, alertDaysOverride: regulatoryDocumentsTable.alertDaysOverride })
      .from(regulatoryDocumentsTable)
      .where(and(eq(regulatoryDocumentsTable.id, params.data.docId), eq(regulatoryDocumentsTable.organizationId, params.data.orgId)));
    if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

    if (body.data.status === "renovado" && !body.data.newExpirationDate) {
      res.status(400).json({ error: "newExpirationDate é obrigatória quando status='renovado'" });
      return;
    }

    const [renewal] = await db
      .insert(regulatoryDocumentRenewalsTable)
      .values({
        organizationId: params.data.orgId,
        documentId: params.data.docId,
        status: body.data.status,
        scheduledStartDate: body.data.scheduledStartDate ?? null,
        protocolDeadline: body.data.protocolDeadline ?? null,
        protocolNumber: body.data.protocolNumber ?? null,
        newExpirationDate: body.data.newExpirationDate ?? null,
        issuingBody: body.data.issuingBody ?? null,
        notes: body.data.notes ?? null,
        recordedByUserId: body.data.recordedByUserId ?? null,
      })
      .returning();

    // When renovado, mirror the new validity to parent + recompute status.
    if (renewal.status === "renovado" && renewal.newExpirationDate) {
      await db
        .update(regulatoryDocumentsTable)
        .set({
          expirationDate: renewal.newExpirationDate,
          status: computeStatus(renewal.newExpirationDate, doc.alertDaysOverride),
          updatedAt: new Date(),
        })
        .where(eq(regulatoryDocumentsTable.id, params.data.docId));
    }

    res.status(201).json(serializeRenewal(renewal, null, 0));
  },
);

router.patch(
  "/organizations/:orgId/regulatory-documents/:docId/renewals/:renewalId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateRegulatoryDocumentRenewalParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateRegulatoryDocumentRenewalBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [renewal] = await db
      .update(regulatoryDocumentRenewalsTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(
        and(
          eq(regulatoryDocumentRenewalsTable.id, params.data.renewalId),
          eq(regulatoryDocumentRenewalsTable.documentId, params.data.docId),
          eq(regulatoryDocumentRenewalsTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!renewal) { res.status(404).json({ error: "Renovação não encontrada" }); return; }

    if (renewal.status === "renovado" && renewal.newExpirationDate) {
      const [doc] = await db
        .select({ alertDaysOverride: regulatoryDocumentsTable.alertDaysOverride })
        .from(regulatoryDocumentsTable)
        .where(eq(regulatoryDocumentsTable.id, params.data.docId));
      await db
        .update(regulatoryDocumentsTable)
        .set({
          expirationDate: renewal.newExpirationDate,
          status: computeStatus(renewal.newExpirationDate, doc?.alertDaysOverride ?? null),
          updatedAt: new Date(),
        })
        .where(eq(regulatoryDocumentsTable.id, params.data.docId));
    }

    res.json(serializeRenewal(renewal, null, 0));
  },
);

router.delete(
  "/organizations/:orgId/regulatory-documents/:docId/renewals/:renewalId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteRegulatoryDocumentRenewalParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(regulatoryDocumentRenewalsTable)
      .where(
        and(
          eq(regulatoryDocumentRenewalsTable.id, params.data.renewalId),
          eq(regulatoryDocumentRenewalsTable.documentId, params.data.docId),
          eq(regulatoryDocumentRenewalsTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

// --- Attachments ---

router.get(
  "/organizations/:orgId/regulatory-documents/:docId/attachments",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListRegulatoryDocumentAttachmentsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const query = ListRegulatoryDocumentAttachmentsQueryParams.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

    const conditions = [
      eq(regulatoryDocumentAttachmentsTable.documentId, params.data.docId),
      eq(regulatoryDocumentAttachmentsTable.organizationId, params.data.orgId),
    ];
    if (query.data.renewalId !== undefined) {
      conditions.push(eq(regulatoryDocumentAttachmentsTable.renewalId, query.data.renewalId));
    }

    const rows = await db
      .select()
      .from(regulatoryDocumentAttachmentsTable)
      .where(and(...conditions))
      .orderBy(asc(regulatoryDocumentAttachmentsTable.uploadedAt));

    res.json(rows.map(serializeAttachment));
  },
);

router.post(
  "/organizations/:orgId/regulatory-documents/:docId/attachments",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = AddRegulatoryDocumentAttachmentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [doc] = await db
      .select({ id: regulatoryDocumentsTable.id })
      .from(regulatoryDocumentsTable)
      .where(and(eq(regulatoryDocumentsTable.id, params.data.docId), eq(regulatoryDocumentsTable.organizationId, params.data.orgId)));
    if (!doc) { res.status(404).json({ error: "Documento não encontrado" }); return; }

    const body = AddRegulatoryDocumentAttachmentBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    // If renewalId provided, validate ownership.
    if (body.data.renewalId !== undefined) {
      const [renewal] = await db
        .select({ id: regulatoryDocumentRenewalsTable.id })
        .from(regulatoryDocumentRenewalsTable)
        .where(
          and(
            eq(regulatoryDocumentRenewalsTable.id, body.data.renewalId),
            eq(regulatoryDocumentRenewalsTable.documentId, params.data.docId),
          ),
        );
      if (!renewal) { res.status(400).json({ error: "Renovação não encontrada" }); return; }
    }

    const [attachment] = await db
      .insert(regulatoryDocumentAttachmentsTable)
      .values({
        organizationId: params.data.orgId,
        documentId: params.data.docId,
        renewalId: body.data.renewalId ?? null,
        fileName: body.data.fileName,
        fileSize: body.data.fileSize,
        contentType: body.data.contentType,
        objectPath: body.data.objectPath,
      })
      .returning();

    res.status(201).json(serializeAttachment(attachment));
  },
);

router.delete(
  "/organizations/:orgId/regulatory-documents/:docId/attachments/:attachmentId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteRegulatoryDocumentAttachmentParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    await db
      .delete(regulatoryDocumentAttachmentsTable)
      .where(
        and(
          eq(regulatoryDocumentAttachmentsTable.id, params.data.attachmentId),
          eq(regulatoryDocumentAttachmentsTable.documentId, params.data.docId),
          eq(regulatoryDocumentAttachmentsTable.organizationId, params.data.orgId),
        ),
      );

    res.sendStatus(204);
  },
);

export default router;
