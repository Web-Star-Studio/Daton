import { Router, type IRouter, type Response } from "express";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  documentsTable,
  nonconformitiesTable,
  organizationContactsTable,
  serviceExecutionCycleCheckpointsTable,
  serviceExecutionCycleDocumentsTable,
  serviceExecutionCyclesTable,
  serviceExecutionModelCheckpointsTable,
  serviceExecutionModelDocumentsTable,
  serviceExecutionModelsTable,
  serviceNonconformingOutputsTable,
  servicePostDeliveryEventsTable,
  servicePreservationDeliveryRecordsTable,
  serviceReleaseRecordsTable,
  serviceSpecialValidationEventsTable,
  serviceSpecialValidationProfilesTable,
  serviceThirdPartyPropertiesTable,
  sgqProcessesTable,
  unitsTable,
  usersTable,
  type GovernanceSystemAttachment,
} from "@workspace/db";
import { requireWriteAccess } from "../../middlewares/auth";
import { validateOrgContactIds } from "../organization-contacts.shared";

const router: IRouter = Router();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().optional(),
});

const orgParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
});

const modelParamsSchema = orgParamsSchema.extend({
  modelId: z.coerce.number().int().positive(),
});

const cycleParamsSchema = orgParamsSchema.extend({
  cycleId: z.coerce.number().int().positive(),
});

const outputParamsSchema = cycleParamsSchema.extend({
  outputId: z.coerce.number().int().positive(),
});

const propertyParamsSchema = cycleParamsSchema.extend({
  propertyId: z.coerce.number().int().positive(),
});

const postDeliveryEventParamsSchema = cycleParamsSchema.extend({
  eventId: z.coerce.number().int().positive(),
});

const modelValidationParamsSchema = modelParamsSchema.extend({
  profileId: z.coerce.number().int().positive(),
});

const attachmentSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().min(0),
  contentType: z.string().min(1),
  objectPath: z.string().min(1),
});

const checkpointInputSchema = z.object({
  id: z.number().int().positive().optional(),
  kind: z.enum(["checkpoint", "preventive_control"]).default("checkpoint"),
  label: z.string().trim().min(1),
  acceptanceCriteria: z.string().trim().optional().nullable(),
  guidance: z.string().trim().optional().nullable(),
  isRequired: z.boolean().default(true),
  requiresEvidence: z.boolean().default(false),
  sortOrder: z.number().int().min(0).optional(),
});

const listModelsQuerySchema = paginationSchema.extend({
  status: z.enum(["active", "inactive"]).optional(),
  processId: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
});

const createModelBodySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  processId: z.number().int().positive().optional().nullable(),
  unitId: z.number().int().positive().optional().nullable(),
  requiresSpecialValidation: z.boolean().default(false),
  status: z.enum(["active", "inactive"]).default("active"),
  documentIds: z.array(z.number().int().positive()).default([]),
  checkpoints: z.array(checkpointInputSchema).min(1),
});

const updateModelBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  processId: z.number().int().positive().optional().nullable(),
  unitId: z.number().int().positive().optional().nullable(),
  requiresSpecialValidation: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  documentIds: z.array(z.number().int().positive()).optional(),
  checkpoints: z.array(checkpointInputSchema).min(1).optional(),
});

const listCyclesQuerySchema = paginationSchema.extend({
  status: z.enum(["in_progress", "awaiting_release", "released", "blocked"]).optional(),
  modelId: z.coerce.number().int().positive().optional(),
});

const createCycleBodySchema = z.object({
  modelId: z.number().int().positive(),
  title: z.string().trim().min(1),
  serviceOrderRef: z.string().trim().optional().nullable(),
  outputIdentifier: z.string().trim().optional().nullable(),
  processId: z.number().int().positive().optional().nullable(),
  unitId: z.number().int().positive().optional().nullable(),
  customerContactId: z.number().int().positive().optional().nullable(),
  documentIds: z.array(z.number().int().positive()).optional(),
});

const cycleCheckpointUpdateSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["pending", "passed", "failed", "waived"]),
  notes: z.string().trim().optional().nullable(),
  evidenceAttachments: z.array(attachmentSchema).default([]),
});

const updateCycleBodySchema = z.object({
  title: z.string().trim().min(1).optional(),
  serviceOrderRef: z.string().trim().optional().nullable(),
  outputIdentifier: z.string().trim().optional().nullable(),
  processId: z.number().int().positive().optional().nullable(),
  unitId: z.number().int().positive().optional().nullable(),
  customerContactId: z.number().int().positive().optional().nullable(),
  documentIds: z.array(z.number().int().positive()).optional(),
  checkpoints: z.array(cycleCheckpointUpdateSchema).optional(),
});

const releaseBodySchema = z.object({
  decision: z.enum(["approved", "blocked"]),
  decisionNotes: z.string().trim().optional().nullable(),
  blockingIssues: z.array(z.string().trim().min(1)).default([]),
  evidenceAttachments: z.array(attachmentSchema).min(1),
});

const nonconformingOutputStatusSchema = z.enum([
  "open",
  "in_treatment",
  "resolved",
  "closed",
]);

const nonconformingOutputDispositionSchema = z.enum([
  "blocked",
  "reworked",
  "reclassified",
  "accepted_under_concession",
  "scrapped",
]);

const nonconformingOutputBodySchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    status: nonconformingOutputStatusSchema.default("open"),
    disposition: nonconformingOutputDispositionSchema.optional().nullable(),
    dispositionNotes: z.string().trim().optional().nullable(),
    responsibleUserId: z.number().int().positive().optional().nullable(),
    linkedNonconformityId: z.number().int().positive().optional().nullable(),
    evidenceAttachments: z.array(attachmentSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.status !== "open" && !value.disposition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A disposição é obrigatória quando a saída já está em tratamento ou encerrada",
        path: ["disposition"],
      });
    }
  });

const thirdPartyPropertyBodySchema = z.object({
  title: z.string().trim().min(1),
  ownerName: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  conditionOnReceipt: z.string().trim().optional().nullable(),
  handlingRequirements: z.string().trim().optional().nullable(),
  status: z.enum(["received", "in_use", "returned", "lost_or_damaged"]).default("received"),
  responsibleUserId: z.number().int().positive().optional().nullable(),
  evidenceAttachments: z.array(attachmentSchema).default([]),
});

const preservationDeliveryBodySchema = z.object({
  preservationNotes: z.string().trim().optional().nullable(),
  preservationMethod: z.string().trim().optional().nullable(),
  packagingNotes: z.string().trim().optional().nullable(),
  deliveryNotes: z.string().trim().optional().nullable(),
  deliveryRecipient: z.string().trim().optional().nullable(),
  deliveryMethod: z.string().trim().optional().nullable(),
  deliveredById: z.number().int().positive().optional().nullable(),
  preservationEvidenceAttachments: z.array(attachmentSchema).default([]),
  deliveryEvidenceAttachments: z.array(attachmentSchema).default([]),
  preservedAt: z.string().datetime().optional().nullable(),
  deliveredAt: z.string().datetime().optional().nullable(),
});

const postDeliveryEventBodySchema = z.object({
  eventType: z
    .enum(["monitoring", "complaint", "assistance", "adjustment", "feedback", "other"])
    .default("other"),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  status: z.enum(["open", "in_follow_up", "closed"]).default("open"),
  followUpNotes: z.string().trim().optional().nullable(),
  responsibleUserId: z.number().int().positive().optional().nullable(),
  evidenceAttachments: z.array(attachmentSchema).default([]),
  occurredAt: z.string().datetime().optional().nullable(),
});

const specialValidationProfileBodySchema = z.object({
  title: z.string().trim().min(1),
  criteria: z.string().trim().min(1),
  method: z.string().trim().optional().nullable(),
  status: z.enum(["draft", "valid", "expired", "suspended"]).default("draft"),
  responsibleUserId: z.number().int().positive().optional().nullable(),
  currentValidUntil: z.string().datetime().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const specialValidationEventBodySchema = z.object({
  eventType: z.enum(["initial_validation", "revalidation"]).default("revalidation"),
  result: z.enum(["approved", "rejected"]).default("approved"),
  criteriaSnapshot: z.string().trim().min(1),
  notes: z.string().trim().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  evidenceAttachments: z.array(attachmentSchema).default([]),
  validatedById: z.number().int().positive().optional().nullable(),
});

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function buildPaginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function buildCycleBlockingIssues(
  checkpoints: Array<{
    label: string;
    status: string;
    isRequired: boolean;
    requiresEvidence: boolean;
    evidenceAttachments: GovernanceSystemAttachment[];
  }>,
) {
  return checkpoints.flatMap((checkpoint) => {
    if (!checkpoint.isRequired) {
      return [];
    }

    const issues: string[] = [];
    if (checkpoint.status === "pending") {
      issues.push(`Checkpoint obrigatório pendente: ${checkpoint.label}`);
    }
    if (checkpoint.status === "failed") {
      issues.push(`Checkpoint obrigatório reprovado: ${checkpoint.label}`);
    }
    if (
      checkpoint.status !== "pending" &&
      checkpoint.requiresEvidence &&
      checkpoint.evidenceAttachments.length === 0
    ) {
      issues.push(`Checkpoint obrigatório sem evidência: ${checkpoint.label}`);
    }

    return issues;
  });
}

async function validateDocumentIds(documentIds: number[], orgId: number) {
  const uniqueIds = [...new Set(documentIds)];
  if (uniqueIds.length === 0) return true;

  const rows = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.organizationId, orgId),
        inArray(documentsTable.id, uniqueIds),
      ),
    );

  return rows.length === uniqueIds.length;
}

async function validateUnitId(unitId: number | null | undefined, orgId: number) {
  if (!unitId) return true;

  const [row] = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(and(eq(unitsTable.id, unitId), eq(unitsTable.organizationId, orgId)));

  return Boolean(row);
}

async function validateProcessId(processId: number | null | undefined, orgId: number) {
  if (!processId) return true;

  const [row] = await db
    .select({ id: sgqProcessesTable.id })
    .from(sgqProcessesTable)
    .where(
      and(
        eq(sgqProcessesTable.id, processId),
        eq(sgqProcessesTable.organizationId, orgId),
      ),
    );

  return Boolean(row);
}

async function validateNonconformityId(nonconformityId: number | null | undefined, orgId: number) {
  if (!nonconformityId) return true;

  const [row] = await db
    .select({ id: nonconformitiesTable.id })
    .from(nonconformitiesTable)
    .where(
      and(
        eq(nonconformitiesTable.id, nonconformityId),
        eq(nonconformitiesTable.organizationId, orgId),
      ),
    );

  return Boolean(row);
}

async function getServiceExecutionModelDetail(orgId: number, modelId: number) {
  const [model] = await db
    .select({
      id: serviceExecutionModelsTable.id,
      organizationId: serviceExecutionModelsTable.organizationId,
      name: serviceExecutionModelsTable.name,
      description: serviceExecutionModelsTable.description,
      processId: serviceExecutionModelsTable.processId,
      processName: sgqProcessesTable.name,
      unitId: serviceExecutionModelsTable.unitId,
      unitName: unitsTable.name,
      requiresSpecialValidation:
        serviceExecutionModelsTable.requiresSpecialValidation,
      status: serviceExecutionModelsTable.status,
      createdAt: serviceExecutionModelsTable.createdAt,
      updatedAt: serviceExecutionModelsTable.updatedAt,
    })
    .from(serviceExecutionModelsTable)
    .leftJoin(
      sgqProcessesTable,
      eq(serviceExecutionModelsTable.processId, sgqProcessesTable.id),
    )
    .leftJoin(unitsTable, eq(serviceExecutionModelsTable.unitId, unitsTable.id))
    .where(
      and(
        eq(serviceExecutionModelsTable.id, modelId),
        eq(serviceExecutionModelsTable.organizationId, orgId),
      ),
    );

  if (!model) {
    return null;
  }

  const [checkpoints, documents, specialValidationProfile] = await Promise.all([
    db
      .select({
        id: serviceExecutionModelCheckpointsTable.id,
        kind: serviceExecutionModelCheckpointsTable.kind,
        label: serviceExecutionModelCheckpointsTable.label,
        acceptanceCriteria:
          serviceExecutionModelCheckpointsTable.acceptanceCriteria,
        guidance: serviceExecutionModelCheckpointsTable.guidance,
        isRequired: serviceExecutionModelCheckpointsTable.isRequired,
        requiresEvidence: serviceExecutionModelCheckpointsTable.requiresEvidence,
        sortOrder: serviceExecutionModelCheckpointsTable.sortOrder,
      })
      .from(serviceExecutionModelCheckpointsTable)
      .where(eq(serviceExecutionModelCheckpointsTable.modelId, modelId))
      .orderBy(
        asc(serviceExecutionModelCheckpointsTable.sortOrder),
        asc(serviceExecutionModelCheckpointsTable.id),
      ),
    db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        status: documentsTable.status,
      })
      .from(serviceExecutionModelDocumentsTable)
      .innerJoin(
        documentsTable,
        eq(serviceExecutionModelDocumentsTable.documentId, documentsTable.id),
      )
      .where(eq(serviceExecutionModelDocumentsTable.modelId, modelId))
      .orderBy(asc(documentsTable.title)),
    getServiceSpecialValidationProfile(orgId, modelId),
  ]);

  return {
    ...model,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
    checkpoints,
    documents,
    specialValidationProfile,
    checkpointCount: checkpoints.length,
    requiredCheckpointCount: checkpoints.filter((item) => item.isRequired).length,
  };
}

async function listServiceNonconformingOutputs(orgId: number, cycleId: number) {
  const outputs = await db
    .select({
      id: serviceNonconformingOutputsTable.id,
      organizationId: serviceNonconformingOutputsTable.organizationId,
      cycleId: serviceNonconformingOutputsTable.cycleId,
      title: serviceNonconformingOutputsTable.title,
      description: serviceNonconformingOutputsTable.description,
      status: serviceNonconformingOutputsTable.status,
      disposition: serviceNonconformingOutputsTable.disposition,
      dispositionNotes: serviceNonconformingOutputsTable.dispositionNotes,
      responsibleUserId: serviceNonconformingOutputsTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      linkedNonconformityId: serviceNonconformingOutputsTable.linkedNonconformityId,
      linkedNonconformityTitle: nonconformitiesTable.title,
      evidenceAttachments: serviceNonconformingOutputsTable.evidenceAttachments,
      detectedById: serviceNonconformingOutputsTable.detectedById,
      detectedAt: serviceNonconformingOutputsTable.detectedAt,
      resolvedAt: serviceNonconformingOutputsTable.resolvedAt,
      createdAt: serviceNonconformingOutputsTable.createdAt,
      updatedAt: serviceNonconformingOutputsTable.updatedAt,
    })
    .from(serviceNonconformingOutputsTable)
    .leftJoin(
      usersTable,
      eq(serviceNonconformingOutputsTable.responsibleUserId, usersTable.id),
    )
    .leftJoin(
      nonconformitiesTable,
      eq(serviceNonconformingOutputsTable.linkedNonconformityId, nonconformitiesTable.id),
    )
    .where(
      and(
        eq(serviceNonconformingOutputsTable.organizationId, orgId),
        eq(serviceNonconformingOutputsTable.cycleId, cycleId),
      ),
    )
    .orderBy(desc(serviceNonconformingOutputsTable.updatedAt), desc(serviceNonconformingOutputsTable.id));

  const detectedByIds = [...new Set(outputs.map((output) => output.detectedById))];
  const detectedByUsers =
    detectedByIds.length > 0
      ? await db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, detectedByIds))
      : [];
  const detectedByNameById = new Map(
    detectedByUsers.map((user) => [user.id, user.name] as const),
  );

  return outputs.map((output) => ({
    ...output,
    detectedByName: detectedByNameById.get(output.detectedById) ?? null,
    detectedAt: output.detectedAt.toISOString(),
    resolvedAt: toIso(output.resolvedAt),
    createdAt: output.createdAt.toISOString(),
    updatedAt: output.updatedAt.toISOString(),
  }));
}

async function listServiceThirdPartyProperties(orgId: number, cycleId: number) {
  const rows = await db
    .select({
      id: serviceThirdPartyPropertiesTable.id,
      organizationId: serviceThirdPartyPropertiesTable.organizationId,
      cycleId: serviceThirdPartyPropertiesTable.cycleId,
      title: serviceThirdPartyPropertiesTable.title,
      ownerName: serviceThirdPartyPropertiesTable.ownerName,
      description: serviceThirdPartyPropertiesTable.description,
      conditionOnReceipt: serviceThirdPartyPropertiesTable.conditionOnReceipt,
      handlingRequirements: serviceThirdPartyPropertiesTable.handlingRequirements,
      status: serviceThirdPartyPropertiesTable.status,
      responsibleUserId: serviceThirdPartyPropertiesTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      evidenceAttachments: serviceThirdPartyPropertiesTable.evidenceAttachments,
      registeredById: serviceThirdPartyPropertiesTable.registeredById,
      receivedAt: serviceThirdPartyPropertiesTable.receivedAt,
      returnedAt: serviceThirdPartyPropertiesTable.returnedAt,
      createdAt: serviceThirdPartyPropertiesTable.createdAt,
      updatedAt: serviceThirdPartyPropertiesTable.updatedAt,
    })
    .from(serviceThirdPartyPropertiesTable)
    .leftJoin(usersTable, eq(serviceThirdPartyPropertiesTable.responsibleUserId, usersTable.id))
    .where(
      and(
        eq(serviceThirdPartyPropertiesTable.organizationId, orgId),
        eq(serviceThirdPartyPropertiesTable.cycleId, cycleId),
      ),
    )
    .orderBy(desc(serviceThirdPartyPropertiesTable.updatedAt), desc(serviceThirdPartyPropertiesTable.id));

  return rows.map((row) => ({
    ...row,
    receivedAt: row.receivedAt.toISOString(),
    returnedAt: toIso(row.returnedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function getServicePreservationDeliveryRecord(orgId: number, cycleId: number) {
  const [record] = await db
    .select({
      id: servicePreservationDeliveryRecordsTable.id,
      organizationId: servicePreservationDeliveryRecordsTable.organizationId,
      cycleId: servicePreservationDeliveryRecordsTable.cycleId,
      preservationNotes: servicePreservationDeliveryRecordsTable.preservationNotes,
      preservationMethod: servicePreservationDeliveryRecordsTable.preservationMethod,
      packagingNotes: servicePreservationDeliveryRecordsTable.packagingNotes,
      deliveryNotes: servicePreservationDeliveryRecordsTable.deliveryNotes,
      deliveryRecipient: servicePreservationDeliveryRecordsTable.deliveryRecipient,
      deliveryMethod: servicePreservationDeliveryRecordsTable.deliveryMethod,
      deliveredById: servicePreservationDeliveryRecordsTable.deliveredById,
      deliveredByName: usersTable.name,
      preservationEvidenceAttachments:
        servicePreservationDeliveryRecordsTable.preservationEvidenceAttachments,
      deliveryEvidenceAttachments:
        servicePreservationDeliveryRecordsTable.deliveryEvidenceAttachments,
      preservedAt: servicePreservationDeliveryRecordsTable.preservedAt,
      deliveredAt: servicePreservationDeliveryRecordsTable.deliveredAt,
      createdAt: servicePreservationDeliveryRecordsTable.createdAt,
      updatedAt: servicePreservationDeliveryRecordsTable.updatedAt,
    })
    .from(servicePreservationDeliveryRecordsTable)
    .leftJoin(usersTable, eq(servicePreservationDeliveryRecordsTable.deliveredById, usersTable.id))
    .where(
      and(
        eq(servicePreservationDeliveryRecordsTable.organizationId, orgId),
        eq(servicePreservationDeliveryRecordsTable.cycleId, cycleId),
      ),
    );

  if (!record) {
    return null;
  }

  return {
    ...record,
    preservedAt: toIso(record.preservedAt),
    deliveredAt: toIso(record.deliveredAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function listServicePostDeliveryEvents(orgId: number, cycleId: number) {
  const rows = await db
    .select({
      id: servicePostDeliveryEventsTable.id,
      organizationId: servicePostDeliveryEventsTable.organizationId,
      cycleId: servicePostDeliveryEventsTable.cycleId,
      eventType: servicePostDeliveryEventsTable.eventType,
      title: servicePostDeliveryEventsTable.title,
      description: servicePostDeliveryEventsTable.description,
      status: servicePostDeliveryEventsTable.status,
      followUpNotes: servicePostDeliveryEventsTable.followUpNotes,
      responsibleUserId: servicePostDeliveryEventsTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      evidenceAttachments: servicePostDeliveryEventsTable.evidenceAttachments,
      occurredAt: servicePostDeliveryEventsTable.occurredAt,
      closedAt: servicePostDeliveryEventsTable.closedAt,
      createdAt: servicePostDeliveryEventsTable.createdAt,
      updatedAt: servicePostDeliveryEventsTable.updatedAt,
    })
    .from(servicePostDeliveryEventsTable)
    .leftJoin(usersTable, eq(servicePostDeliveryEventsTable.responsibleUserId, usersTable.id))
    .where(
      and(
        eq(servicePostDeliveryEventsTable.organizationId, orgId),
        eq(servicePostDeliveryEventsTable.cycleId, cycleId),
      ),
    )
    .orderBy(desc(servicePostDeliveryEventsTable.occurredAt), desc(servicePostDeliveryEventsTable.id));

  return rows.map((row) => ({
    ...row,
    occurredAt: row.occurredAt.toISOString(),
    closedAt: toIso(row.closedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function getServiceSpecialValidationProfile(orgId: number, modelId: number) {
  const [profile] = await db
    .select({
      id: serviceSpecialValidationProfilesTable.id,
      organizationId: serviceSpecialValidationProfilesTable.organizationId,
      modelId: serviceSpecialValidationProfilesTable.modelId,
      processId: serviceSpecialValidationProfilesTable.processId,
      processName: sgqProcessesTable.name,
      title: serviceSpecialValidationProfilesTable.title,
      criteria: serviceSpecialValidationProfilesTable.criteria,
      method: serviceSpecialValidationProfilesTable.method,
      status: serviceSpecialValidationProfilesTable.status,
      responsibleUserId: serviceSpecialValidationProfilesTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      currentValidUntil: serviceSpecialValidationProfilesTable.currentValidUntil,
      notes: serviceSpecialValidationProfilesTable.notes,
      createdAt: serviceSpecialValidationProfilesTable.createdAt,
      updatedAt: serviceSpecialValidationProfilesTable.updatedAt,
    })
    .from(serviceSpecialValidationProfilesTable)
    .leftJoin(
      sgqProcessesTable,
      eq(serviceSpecialValidationProfilesTable.processId, sgqProcessesTable.id),
    )
    .leftJoin(usersTable, eq(serviceSpecialValidationProfilesTable.responsibleUserId, usersTable.id))
    .where(
      and(
        eq(serviceSpecialValidationProfilesTable.organizationId, orgId),
        eq(serviceSpecialValidationProfilesTable.modelId, modelId),
      ),
    );

  if (!profile) {
    return null;
  }

  const events = await db
    .select({
      id: serviceSpecialValidationEventsTable.id,
      profileId: serviceSpecialValidationEventsTable.profileId,
      eventType: serviceSpecialValidationEventsTable.eventType,
      result: serviceSpecialValidationEventsTable.result,
      criteriaSnapshot: serviceSpecialValidationEventsTable.criteriaSnapshot,
      notes: serviceSpecialValidationEventsTable.notes,
      validUntil: serviceSpecialValidationEventsTable.validUntil,
      evidenceAttachments: serviceSpecialValidationEventsTable.evidenceAttachments,
      validatedById: serviceSpecialValidationEventsTable.validatedById,
      validatedByName: usersTable.name,
      validatedAt: serviceSpecialValidationEventsTable.validatedAt,
      createdAt: serviceSpecialValidationEventsTable.createdAt,
      updatedAt: serviceSpecialValidationEventsTable.updatedAt,
    })
    .from(serviceSpecialValidationEventsTable)
    .leftJoin(usersTable, eq(serviceSpecialValidationEventsTable.validatedById, usersTable.id))
    .where(eq(serviceSpecialValidationEventsTable.profileId, profile.id))
    .orderBy(desc(serviceSpecialValidationEventsTable.validatedAt), desc(serviceSpecialValidationEventsTable.id));

  return {
    ...profile,
    currentValidUntil: toIso(profile.currentValidUntil),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    events: events.map((event) => ({
      ...event,
      validUntil: toIso(event.validUntil),
      validatedAt: event.validatedAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    })),
  };
}

async function getServiceExecutionCycleDetail(orgId: number, cycleId: number) {
  const [cycle] = await db
    .select({
      id: serviceExecutionCyclesTable.id,
      organizationId: serviceExecutionCyclesTable.organizationId,
      modelId: serviceExecutionCyclesTable.modelId,
      modelName: serviceExecutionModelsTable.name,
      title: serviceExecutionCyclesTable.title,
      serviceOrderRef: serviceExecutionCyclesTable.serviceOrderRef,
      outputIdentifier: serviceExecutionCyclesTable.outputIdentifier,
      processId: serviceExecutionCyclesTable.processId,
      processName: sgqProcessesTable.name,
      unitId: serviceExecutionCyclesTable.unitId,
      unitName: unitsTable.name,
      customerContactId: serviceExecutionCyclesTable.customerContactId,
      customerName: organizationContactsTable.name,
      customerOrganizationName: organizationContactsTable.organizationName,
      requiresSpecialValidation: serviceExecutionModelsTable.requiresSpecialValidation,
      status: serviceExecutionCyclesTable.status,
      openedById: serviceExecutionCyclesTable.openedById,
      openedByName: usersTable.name,
      startedAt: serviceExecutionCyclesTable.startedAt,
      completedAt: serviceExecutionCyclesTable.completedAt,
      createdAt: serviceExecutionCyclesTable.createdAt,
      updatedAt: serviceExecutionCyclesTable.updatedAt,
    })
    .from(serviceExecutionCyclesTable)
    .innerJoin(
      serviceExecutionModelsTable,
      eq(serviceExecutionCyclesTable.modelId, serviceExecutionModelsTable.id),
    )
    .leftJoin(
      sgqProcessesTable,
      eq(serviceExecutionCyclesTable.processId, sgqProcessesTable.id),
    )
    .leftJoin(unitsTable, eq(serviceExecutionCyclesTable.unitId, unitsTable.id))
    .leftJoin(
      organizationContactsTable,
      eq(serviceExecutionCyclesTable.customerContactId, organizationContactsTable.id),
    )
    .leftJoin(usersTable, eq(serviceExecutionCyclesTable.openedById, usersTable.id))
    .where(
      and(
        eq(serviceExecutionCyclesTable.id, cycleId),
        eq(serviceExecutionCyclesTable.organizationId, orgId),
      ),
    );

  if (!cycle) {
    return null;
  }

  const [
    checkpoints,
    documents,
    releases,
    nonconformingOutputs,
    thirdPartyProperties,
    preservationDeliveryRecord,
    postDeliveryEvents,
    specialValidationProfile,
  ] = await Promise.all([
    db
      .select({
        id: serviceExecutionCycleCheckpointsTable.id,
        modelCheckpointId: serviceExecutionCycleCheckpointsTable.modelCheckpointId,
        kind: serviceExecutionCycleCheckpointsTable.kind,
        label: serviceExecutionCycleCheckpointsTable.label,
        acceptanceCriteria:
          serviceExecutionCycleCheckpointsTable.acceptanceCriteria,
        guidance: serviceExecutionCycleCheckpointsTable.guidance,
        isRequired: serviceExecutionCycleCheckpointsTable.isRequired,
        requiresEvidence: serviceExecutionCycleCheckpointsTable.requiresEvidence,
        sortOrder: serviceExecutionCycleCheckpointsTable.sortOrder,
        status: serviceExecutionCycleCheckpointsTable.status,
        notes: serviceExecutionCycleCheckpointsTable.notes,
        evidenceAttachments:
          serviceExecutionCycleCheckpointsTable.evidenceAttachments,
        checkedById: serviceExecutionCycleCheckpointsTable.checkedById,
        checkedByName: usersTable.name,
        checkedAt: serviceExecutionCycleCheckpointsTable.checkedAt,
      })
      .from(serviceExecutionCycleCheckpointsTable)
      .leftJoin(
        usersTable,
        eq(serviceExecutionCycleCheckpointsTable.checkedById, usersTable.id),
      )
      .where(eq(serviceExecutionCycleCheckpointsTable.cycleId, cycleId))
      .orderBy(
        asc(serviceExecutionCycleCheckpointsTable.sortOrder),
        asc(serviceExecutionCycleCheckpointsTable.id),
      ),
    db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        status: documentsTable.status,
      })
      .from(serviceExecutionCycleDocumentsTable)
      .innerJoin(
        documentsTable,
        eq(serviceExecutionCycleDocumentsTable.documentId, documentsTable.id),
      )
      .where(eq(serviceExecutionCycleDocumentsTable.cycleId, cycleId))
      .orderBy(asc(documentsTable.title)),
    db
      .select({
        id: serviceReleaseRecordsTable.id,
        decision: serviceReleaseRecordsTable.decision,
        decisionNotes: serviceReleaseRecordsTable.decisionNotes,
        blockingIssues: serviceReleaseRecordsTable.blockingIssues,
        evidenceAttachments: serviceReleaseRecordsTable.evidenceAttachments,
        decidedById: serviceReleaseRecordsTable.decidedById,
        decidedByName: usersTable.name,
        decidedAt: serviceReleaseRecordsTable.decidedAt,
        createdAt: serviceReleaseRecordsTable.createdAt,
        updatedAt: serviceReleaseRecordsTable.updatedAt,
      })
      .from(serviceReleaseRecordsTable)
      .leftJoin(usersTable, eq(serviceReleaseRecordsTable.decidedById, usersTable.id))
      .where(eq(serviceReleaseRecordsTable.cycleId, cycleId)),
    listServiceNonconformingOutputs(orgId, cycleId),
    listServiceThirdPartyProperties(orgId, cycleId),
    getServicePreservationDeliveryRecord(orgId, cycleId),
    listServicePostDeliveryEvents(orgId, cycleId),
    getServiceSpecialValidationProfile(orgId, cycle.modelId),
  ]);

  const checkpointBlockingIssues = buildCycleBlockingIssues(
    checkpoints.map((checkpoint) => ({
      label: checkpoint.label,
      status: checkpoint.status,
      isRequired: checkpoint.isRequired,
      requiresEvidence: checkpoint.requiresEvidence,
      evidenceAttachments: checkpoint.evidenceAttachments,
    })),
  );
  const outputBlockingIssues = nonconformingOutputs
    .filter((output) => output.status === "open" || output.status === "in_treatment")
    .map((output) => `Saída não conforme em aberto: ${output.title}`);
  const preservationBlockingIssues: string[] = [];
  if (!preservationDeliveryRecord) {
    preservationBlockingIssues.push("Preservação e entrega ainda não registradas");
  } else {
    if (!preservationDeliveryRecord.preservedAt) {
      preservationBlockingIssues.push("Preservação da saída sem data registrada");
    }
    if (!preservationDeliveryRecord.deliveredAt) {
      preservationBlockingIssues.push("Entrega da saída sem data registrada");
    }
  }
  const specialValidationBlockingIssues: string[] = [];
  if (cycle.requiresSpecialValidation) {
    if (!specialValidationProfile) {
      specialValidationBlockingIssues.push("Processo especial sem validação cadastrada");
    } else if (specialValidationProfile.status !== "valid") {
      specialValidationBlockingIssues.push("Validação especial fora de condição válida");
    } else if (!specialValidationProfile.events.some((event) => event.result === "approved")) {
      specialValidationBlockingIssues.push("Validação especial sem evidência aprovada");
    }
  }

  return {
    ...cycle,
    startedAt: cycle.startedAt.toISOString(),
    completedAt: toIso(cycle.completedAt),
    createdAt: cycle.createdAt.toISOString(),
    updatedAt: cycle.updatedAt.toISOString(),
    checkpoints: checkpoints.map((checkpoint) => ({
      ...checkpoint,
      checkedAt: toIso(checkpoint.checkedAt),
    })),
    documents,
    releaseRecord: releases[0]
      ? {
          ...releases[0],
          decidedAt: releases[0].decidedAt.toISOString(),
          createdAt: releases[0].createdAt.toISOString(),
          updatedAt: releases[0].updatedAt.toISOString(),
        }
      : null,
    thirdPartyProperties,
    preservationDeliveryRecord,
    postDeliveryEvents,
    specialValidationProfile,
    nonconformingOutputs,
    pendingBlockingIssues: [
      ...checkpointBlockingIssues,
      ...outputBlockingIssues,
      ...preservationBlockingIssues,
      ...specialValidationBlockingIssues,
    ],
  };
}

router.get("/organizations/:orgId/governance/service-execution-models", async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const query = listModelsQuerySchema.safeParse(req.query);

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { orgId } = params.data;
  const { page, pageSize, search, status, processId, unitId } = query.data;

  const conditions = [eq(serviceExecutionModelsTable.organizationId, orgId)];
  if (status) {
    conditions.push(eq(serviceExecutionModelsTable.status, status));
  }
  if (processId) {
    conditions.push(eq(serviceExecutionModelsTable.processId, processId));
  }
  if (unitId) {
    conditions.push(eq(serviceExecutionModelsTable.unitId, unitId));
  }
  if (search) {
    const escaped = escapeLikePattern(search);
    conditions.push(
      or(
        ilike(serviceExecutionModelsTable.name, `%${escaped}%`),
        ilike(serviceExecutionModelsTable.description, `%${escaped}%`),
      )!,
    );
  }

  const where = and(...conditions);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: serviceExecutionModelsTable.id,
        organizationId: serviceExecutionModelsTable.organizationId,
        name: serviceExecutionModelsTable.name,
        description: serviceExecutionModelsTable.description,
        processId: serviceExecutionModelsTable.processId,
        processName: sgqProcessesTable.name,
        unitId: serviceExecutionModelsTable.unitId,
        unitName: unitsTable.name,
        requiresSpecialValidation:
          serviceExecutionModelsTable.requiresSpecialValidation,
        status: serviceExecutionModelsTable.status,
        checkpointCount: sql<number>`(
          select count(*)
          from service_execution_model_checkpoints checkpoints
          where checkpoints.model_id = ${serviceExecutionModelsTable.id}
        )`,
        requiredCheckpointCount: sql<number>`(
          select count(*)
          from service_execution_model_checkpoints checkpoints
          where checkpoints.model_id = ${serviceExecutionModelsTable.id}
            and checkpoints.is_required = true
        )`,
        documentCount: sql<number>`(
          select count(*)
          from service_execution_model_documents links
          where links.model_id = ${serviceExecutionModelsTable.id}
        )`,
        createdAt: serviceExecutionModelsTable.createdAt,
        updatedAt: serviceExecutionModelsTable.updatedAt,
      })
      .from(serviceExecutionModelsTable)
      .leftJoin(
        sgqProcessesTable,
        eq(serviceExecutionModelsTable.processId, sgqProcessesTable.id),
      )
      .leftJoin(unitsTable, eq(serviceExecutionModelsTable.unitId, unitsTable.id))
      .where(where)
      .orderBy(desc(serviceExecutionModelsTable.updatedAt), desc(serviceExecutionModelsTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(serviceExecutionModelsTable)
      .where(where),
  ]);

  res.json({
    data: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    pagination: buildPaginationMeta(page, pageSize, totalRows[0]?.total ?? 0),
  });
});

router.post(
  "/organizations/:orgId/governance/service-execution-models",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = orgParamsSchema.safeParse(req.params);
    const body = createModelBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId } = params.data;
    const payload = body.data;

    if (!(await validateProcessId(payload.processId, orgId))) {
      res.status(400).json({ error: "processId inválido para a organização" });
      return;
    }
    if (!(await validateUnitId(payload.unitId, orgId))) {
      res.status(400).json({ error: "unitId inválido para a organização" });
      return;
    }
    if (!(await validateDocumentIds(payload.documentIds, orgId))) {
      res.status(400).json({ error: "documentIds inválidos para a organização" });
      return;
    }

    const created = await db.transaction(async (tx) => {
      const [model] = await tx
        .insert(serviceExecutionModelsTable)
        .values({
          organizationId: orgId,
          name: payload.name,
          description: payload.description ?? null,
          processId: payload.processId ?? null,
          unitId: payload.unitId ?? null,
          requiresSpecialValidation: payload.requiresSpecialValidation,
          status: payload.status,
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        })
        .returning({ id: serviceExecutionModelsTable.id });

      await tx.insert(serviceExecutionModelCheckpointsTable).values(
        payload.checkpoints.map((checkpoint, index) => ({
          modelId: model.id,
          kind: checkpoint.kind,
          label: checkpoint.label,
          acceptanceCriteria: checkpoint.acceptanceCriteria ?? null,
          guidance: checkpoint.guidance ?? null,
          isRequired: checkpoint.isRequired,
          requiresEvidence: checkpoint.requiresEvidence,
          sortOrder: checkpoint.sortOrder ?? index,
        })),
      );

      if (payload.documentIds.length > 0) {
        await tx.insert(serviceExecutionModelDocumentsTable).values(
          [...new Set(payload.documentIds)].map((documentId) => ({
            modelId: model.id,
            documentId,
          })),
        );
      }

      return model;
    });

    const detail = await getServiceExecutionModelDetail(orgId, created.id);
    res.status(201).json(detail);
  },
);

router.get("/organizations/:orgId/governance/service-execution-models/:modelId", async (req, res): Promise<void> => {
  const params = modelParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const detail = await getServiceExecutionModelDetail(
    params.data.orgId,
    params.data.modelId,
  );
  if (!detail) {
    res.status(404).json({ error: "Modelo de execução não encontrado" });
    return;
  }

  res.json(detail);
});

router.patch(
  "/organizations/:orgId/governance/service-execution-models/:modelId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = modelParamsSchema.safeParse(req.params);
    const body = updateModelBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, modelId } = params.data;
    const payload = body.data;

    const [existing] = await db
      .select({ id: serviceExecutionModelsTable.id })
      .from(serviceExecutionModelsTable)
      .where(
        and(
          eq(serviceExecutionModelsTable.id, modelId),
          eq(serviceExecutionModelsTable.organizationId, orgId),
        ),
      );

    if (!existing) {
      res.status(404).json({ error: "Modelo de execução não encontrado" });
      return;
    }

    if (!(await validateProcessId(payload.processId, orgId))) {
      res.status(400).json({ error: "processId inválido para a organização" });
      return;
    }
    if (!(await validateUnitId(payload.unitId, orgId))) {
      res.status(400).json({ error: "unitId inválido para a organização" });
      return;
    }
    if (
      payload.documentIds &&
      !(await validateDocumentIds(payload.documentIds, orgId))
    ) {
      res.status(400).json({ error: "documentIds inválidos para a organização" });
      return;
    }

    await db.transaction(async (tx) => {
      const updateValues: Record<string, unknown> = {
        updatedById: req.auth!.userId,
      };

      if (payload.name !== undefined) updateValues.name = payload.name;
      if (payload.description !== undefined) {
        updateValues.description = payload.description ?? null;
      }
      if (payload.processId !== undefined) updateValues.processId = payload.processId ?? null;
      if (payload.unitId !== undefined) updateValues.unitId = payload.unitId ?? null;
      if (payload.requiresSpecialValidation !== undefined) {
        updateValues.requiresSpecialValidation = payload.requiresSpecialValidation;
      }
      if (payload.status !== undefined) updateValues.status = payload.status;

      await tx
        .update(serviceExecutionModelsTable)
        .set(updateValues)
        .where(eq(serviceExecutionModelsTable.id, modelId));

      if (payload.checkpoints) {
        await tx
          .delete(serviceExecutionModelCheckpointsTable)
          .where(eq(serviceExecutionModelCheckpointsTable.modelId, modelId));

        await tx.insert(serviceExecutionModelCheckpointsTable).values(
          payload.checkpoints.map((checkpoint, index) => ({
            modelId,
            kind: checkpoint.kind,
            label: checkpoint.label,
            acceptanceCriteria: checkpoint.acceptanceCriteria ?? null,
            guidance: checkpoint.guidance ?? null,
            isRequired: checkpoint.isRequired,
            requiresEvidence: checkpoint.requiresEvidence,
            sortOrder: checkpoint.sortOrder ?? index,
          })),
        );
      }

      if (payload.documentIds) {
        await tx
          .delete(serviceExecutionModelDocumentsTable)
          .where(eq(serviceExecutionModelDocumentsTable.modelId, modelId));

        const uniqueIds = [...new Set(payload.documentIds)];
        if (uniqueIds.length > 0) {
          await tx.insert(serviceExecutionModelDocumentsTable).values(
            uniqueIds.map((documentId) => ({
              modelId,
              documentId,
            })),
          );
        }
      }
    });

    const detail = await getServiceExecutionModelDetail(orgId, modelId);
    res.json(detail);
  },
);

router.get("/organizations/:orgId/governance/service-execution-cycles", async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const query = listCyclesQuerySchema.safeParse(req.query);

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { orgId } = params.data;
  const { page, pageSize, search, status, modelId } = query.data;
  const conditions = [eq(serviceExecutionCyclesTable.organizationId, orgId)];

  if (status) {
    conditions.push(eq(serviceExecutionCyclesTable.status, status));
  }
  if (modelId) {
    conditions.push(eq(serviceExecutionCyclesTable.modelId, modelId));
  }
  if (search) {
    const escaped = escapeLikePattern(search);
    conditions.push(
      or(
        ilike(serviceExecutionCyclesTable.title, `%${escaped}%`),
        ilike(serviceExecutionCyclesTable.serviceOrderRef, `%${escaped}%`),
        ilike(serviceExecutionCyclesTable.outputIdentifier, `%${escaped}%`),
      )!,
    );
  }

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: serviceExecutionCyclesTable.id,
        organizationId: serviceExecutionCyclesTable.organizationId,
        modelId: serviceExecutionCyclesTable.modelId,
        modelName: serviceExecutionModelsTable.name,
        title: serviceExecutionCyclesTable.title,
        serviceOrderRef: serviceExecutionCyclesTable.serviceOrderRef,
        outputIdentifier: serviceExecutionCyclesTable.outputIdentifier,
        processId: serviceExecutionCyclesTable.processId,
        processName: sgqProcessesTable.name,
        unitId: serviceExecutionCyclesTable.unitId,
        unitName: unitsTable.name,
        customerContactId: serviceExecutionCyclesTable.customerContactId,
        customerName: organizationContactsTable.name,
        customerOrganizationName: organizationContactsTable.organizationName,
        status: serviceExecutionCyclesTable.status,
        releaseDecision: serviceReleaseRecordsTable.decision,
        pendingRequiredCheckpointCount: sql<number>`(
          select count(*)
          from service_execution_cycle_checkpoints checkpoints
          where checkpoints.cycle_id = ${serviceExecutionCyclesTable.id}
            and checkpoints.is_required = true
            and checkpoints.status = 'pending'
        )`,
        failedRequiredCheckpointCount: sql<number>`(
          select count(*)
          from service_execution_cycle_checkpoints checkpoints
          where checkpoints.cycle_id = ${serviceExecutionCyclesTable.id}
            and checkpoints.is_required = true
            and checkpoints.status = 'failed'
        )`,
        openNonconformingOutputCount: sql<number>`(
          select count(*)
          from service_nonconforming_outputs outputs
          where outputs.cycle_id = ${serviceExecutionCyclesTable.id}
            and outputs.status in ('open', 'in_treatment')
        )`,
        createdAt: serviceExecutionCyclesTable.createdAt,
        updatedAt: serviceExecutionCyclesTable.updatedAt,
      })
      .from(serviceExecutionCyclesTable)
      .innerJoin(
        serviceExecutionModelsTable,
        eq(serviceExecutionCyclesTable.modelId, serviceExecutionModelsTable.id),
      )
      .leftJoin(
        sgqProcessesTable,
        eq(serviceExecutionCyclesTable.processId, sgqProcessesTable.id),
      )
      .leftJoin(unitsTable, eq(serviceExecutionCyclesTable.unitId, unitsTable.id))
      .leftJoin(
        organizationContactsTable,
        eq(serviceExecutionCyclesTable.customerContactId, organizationContactsTable.id),
      )
      .leftJoin(
        serviceReleaseRecordsTable,
        eq(serviceReleaseRecordsTable.cycleId, serviceExecutionCyclesTable.id),
      )
      .where(where)
      .orderBy(desc(serviceExecutionCyclesTable.updatedAt), desc(serviceExecutionCyclesTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(serviceExecutionCyclesTable)
      .where(where),
  ]);

  res.json({
    data: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    pagination: buildPaginationMeta(page, pageSize, totalRows[0]?.total ?? 0),
  });
});

router.post(
  "/organizations/:orgId/governance/service-execution-cycles",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = orgParamsSchema.safeParse(req.params);
    const body = createCycleBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId } = params.data;
    const payload = body.data;

    const [model] = await db
      .select({
        id: serviceExecutionModelsTable.id,
        organizationId: serviceExecutionModelsTable.organizationId,
        processId: serviceExecutionModelsTable.processId,
        unitId: serviceExecutionModelsTable.unitId,
        status: serviceExecutionModelsTable.status,
      })
      .from(serviceExecutionModelsTable)
      .where(
        and(
          eq(serviceExecutionModelsTable.id, payload.modelId),
          eq(serviceExecutionModelsTable.organizationId, orgId),
        ),
      );

    if (!model) {
      res.status(404).json({ error: "Modelo de execução não encontrado" });
      return;
    }

    const effectiveProcessId = payload.processId ?? model.processId;
    const effectiveUnitId = payload.unitId ?? model.unitId;

    if (!(await validateProcessId(effectiveProcessId, orgId))) {
      res.status(400).json({ error: "processId inválido para a organização" });
      return;
    }
    if (!(await validateUnitId(effectiveUnitId, orgId))) {
      res.status(400).json({ error: "unitId inválido para a organização" });
      return;
    }
    if (
      payload.customerContactId &&
      !(await validateOrgContactIds([payload.customerContactId], orgId))
    ) {
      res.status(400).json({ error: "customerContactId inválido para a organização" });
      return;
    }
    if (
      payload.documentIds &&
      !(await validateDocumentIds(payload.documentIds, orgId))
    ) {
      res.status(400).json({ error: "documentIds inválidos para a organização" });
      return;
    }

    const modelCheckpoints = await db
      .select({
        id: serviceExecutionModelCheckpointsTable.id,
        kind: serviceExecutionModelCheckpointsTable.kind,
        label: serviceExecutionModelCheckpointsTable.label,
        acceptanceCriteria: serviceExecutionModelCheckpointsTable.acceptanceCriteria,
        guidance: serviceExecutionModelCheckpointsTable.guidance,
        isRequired: serviceExecutionModelCheckpointsTable.isRequired,
        requiresEvidence: serviceExecutionModelCheckpointsTable.requiresEvidence,
        sortOrder: serviceExecutionModelCheckpointsTable.sortOrder,
      })
      .from(serviceExecutionModelCheckpointsTable)
      .where(eq(serviceExecutionModelCheckpointsTable.modelId, payload.modelId))
      .orderBy(
        asc(serviceExecutionModelCheckpointsTable.sortOrder),
        asc(serviceExecutionModelCheckpointsTable.id),
      );

    const modelDocumentIds = payload.documentIds
      ? [...new Set(payload.documentIds)]
      : (
          await db
            .select({ documentId: serviceExecutionModelDocumentsTable.documentId })
            .from(serviceExecutionModelDocumentsTable)
            .where(eq(serviceExecutionModelDocumentsTable.modelId, payload.modelId))
        ).map((item) => item.documentId);

    const cycle = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(serviceExecutionCyclesTable)
        .values({
          organizationId: orgId,
          modelId: payload.modelId,
          title: payload.title,
          serviceOrderRef: payload.serviceOrderRef ?? null,
          outputIdentifier: payload.outputIdentifier ?? null,
          processId: effectiveProcessId ?? null,
          unitId: effectiveUnitId ?? null,
          customerContactId: payload.customerContactId ?? null,
          status: "in_progress",
          openedById: req.auth!.userId,
        })
        .returning({ id: serviceExecutionCyclesTable.id });

      if (modelCheckpoints.length > 0) {
        await tx.insert(serviceExecutionCycleCheckpointsTable).values(
          modelCheckpoints.map((checkpoint) => ({
            cycleId: created.id,
            modelCheckpointId: checkpoint.id,
            kind: checkpoint.kind,
            label: checkpoint.label,
            acceptanceCriteria: checkpoint.acceptanceCriteria,
            guidance: checkpoint.guidance,
            isRequired: checkpoint.isRequired,
            requiresEvidence: checkpoint.requiresEvidence,
            sortOrder: checkpoint.sortOrder,
            status: "pending" as const,
          })),
        );
      }

      if (modelDocumentIds.length > 0) {
        await tx.insert(serviceExecutionCycleDocumentsTable).values(
          modelDocumentIds.map((documentId) => ({
            cycleId: created.id,
            documentId,
          })),
        );
      }

      return created;
    });

    const detail = await getServiceExecutionCycleDetail(orgId, cycle.id);
    res.status(201).json(detail);
  },
);

router.get("/organizations/:orgId/governance/service-execution-cycles/:cycleId", async (req, res): Promise<void> => {
  const params = cycleParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const detail = await getServiceExecutionCycleDetail(
    params.data.orgId,
    params.data.cycleId,
  );
  if (!detail) {
    res.status(404).json({ error: "Ciclo de execução não encontrado" });
    return;
  }

  res.json(detail);
});

router.patch(
  "/organizations/:orgId/governance/service-execution-cycles/:cycleId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = cycleParamsSchema.safeParse(req.params);
    const body = updateCycleBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, cycleId } = params.data;
    const payload = body.data;

    const [existingCycle] = await db
      .select({
        id: serviceExecutionCyclesTable.id,
        organizationId: serviceExecutionCyclesTable.organizationId,
        processId: serviceExecutionCyclesTable.processId,
        unitId: serviceExecutionCyclesTable.unitId,
        status: serviceExecutionCyclesTable.status,
      })
      .from(serviceExecutionCyclesTable)
      .where(
        and(
          eq(serviceExecutionCyclesTable.id, cycleId),
          eq(serviceExecutionCyclesTable.organizationId, orgId),
        ),
      );

    if (!existingCycle) {
      res.status(404).json({ error: "Ciclo de execução não encontrado" });
      return;
    }

    if (!(await validateProcessId(payload.processId, orgId))) {
      res.status(400).json({ error: "processId inválido para a organização" });
      return;
    }
    if (!(await validateUnitId(payload.unitId, orgId))) {
      res.status(400).json({ error: "unitId inválido para a organização" });
      return;
    }
    if (
      payload.customerContactId &&
      !(await validateOrgContactIds([payload.customerContactId], orgId))
    ) {
      res.status(400).json({ error: "customerContactId inválido para a organização" });
      return;
    }
    if (
      payload.documentIds &&
      !(await validateDocumentIds(payload.documentIds, orgId))
    ) {
      res.status(400).json({ error: "documentIds inválidos para a organização" });
      return;
    }

    if (payload.checkpoints) {
      const checkpointIds = payload.checkpoints.map((item) => item.id);
      const rows = await db
        .select({ id: serviceExecutionCycleCheckpointsTable.id })
        .from(serviceExecutionCycleCheckpointsTable)
        .where(
          and(
            eq(serviceExecutionCycleCheckpointsTable.cycleId, cycleId),
            inArray(serviceExecutionCycleCheckpointsTable.id, checkpointIds),
          ),
        );

      if (rows.length !== checkpointIds.length) {
        res.status(400).json({ error: "Há checkpoints inválidos para este ciclo" });
        return;
      }
    }

    await db.transaction(async (tx) => {
      const updateValues: Record<string, unknown> = {};
      if (payload.title !== undefined) updateValues.title = payload.title;
      if (payload.serviceOrderRef !== undefined) {
        updateValues.serviceOrderRef = payload.serviceOrderRef ?? null;
      }
      if (payload.outputIdentifier !== undefined) {
        updateValues.outputIdentifier = payload.outputIdentifier ?? null;
      }
      if (payload.processId !== undefined) updateValues.processId = payload.processId ?? null;
      if (payload.unitId !== undefined) updateValues.unitId = payload.unitId ?? null;
      if (payload.customerContactId !== undefined) {
        updateValues.customerContactId = payload.customerContactId ?? null;
      }

      if (Object.keys(updateValues).length > 0) {
        await tx
          .update(serviceExecutionCyclesTable)
          .set(updateValues)
          .where(eq(serviceExecutionCyclesTable.id, cycleId));
      }

      if (payload.documentIds) {
        await tx
          .delete(serviceExecutionCycleDocumentsTable)
          .where(eq(serviceExecutionCycleDocumentsTable.cycleId, cycleId));

        const uniqueIds = [...new Set(payload.documentIds)];
        if (uniqueIds.length > 0) {
          await tx.insert(serviceExecutionCycleDocumentsTable).values(
            uniqueIds.map((documentId) => ({
              cycleId,
              documentId,
            })),
          );
        }
      }

      if (payload.checkpoints) {
        for (const checkpoint of payload.checkpoints) {
          await tx
            .update(serviceExecutionCycleCheckpointsTable)
            .set({
              status: checkpoint.status,
              notes: checkpoint.notes ?? null,
              evidenceAttachments: checkpoint.evidenceAttachments,
              checkedById:
                checkpoint.status === "pending" &&
                checkpoint.evidenceAttachments.length === 0 &&
                !checkpoint.notes
                  ? null
                  : req.auth!.userId,
              checkedAt:
                checkpoint.status === "pending" &&
                checkpoint.evidenceAttachments.length === 0 &&
                !checkpoint.notes
                  ? null
                  : new Date(),
            })
            .where(eq(serviceExecutionCycleCheckpointsTable.id, checkpoint.id));
        }
      }

      if (existingCycle.status !== "released" && existingCycle.status !== "blocked") {
        const currentCheckpoints = await tx
          .select({
            label: serviceExecutionCycleCheckpointsTable.label,
            status: serviceExecutionCycleCheckpointsTable.status,
            isRequired: serviceExecutionCycleCheckpointsTable.isRequired,
            requiresEvidence: serviceExecutionCycleCheckpointsTable.requiresEvidence,
            evidenceAttachments:
              serviceExecutionCycleCheckpointsTable.evidenceAttachments,
          })
          .from(serviceExecutionCycleCheckpointsTable)
          .where(eq(serviceExecutionCycleCheckpointsTable.cycleId, cycleId));

        const blockingIssues = buildCycleBlockingIssues(currentCheckpoints);
        await tx
          .update(serviceExecutionCyclesTable)
          .set({
            status: blockingIssues.length === 0 ? "awaiting_release" : "in_progress",
          })
          .where(eq(serviceExecutionCyclesTable.id, cycleId));
      }
    });

    const detail = await getServiceExecutionCycleDetail(orgId, cycleId);
    res.json(detail);
  },
);

router.post(
  "/organizations/:orgId/governance/service-execution-cycles/:cycleId/release",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = cycleParamsSchema.safeParse(req.params);
    const body = releaseBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, cycleId } = params.data;
    const payload = body.data;

    const detail = await getServiceExecutionCycleDetail(orgId, cycleId);
    if (!detail) {
      res.status(404).json({ error: "Ciclo de execução não encontrado" });
      return;
    }

    if (payload.decision === "approved" && detail.pendingBlockingIssues.length > 0) {
      res.status(400).json({
        error: "Ainda existem pendências impeditivas para a liberação",
        blockingIssues: detail.pendingBlockingIssues,
      });
      return;
    }

    await db.transaction(async (tx) => {
      const [existingRelease] = await tx
        .select({ id: serviceReleaseRecordsTable.id })
        .from(serviceReleaseRecordsTable)
        .where(eq(serviceReleaseRecordsTable.cycleId, cycleId));

      if (existingRelease) {
        await tx
          .update(serviceReleaseRecordsTable)
          .set({
            decision: payload.decision,
            decisionNotes: payload.decisionNotes ?? null,
            blockingIssues:
              payload.decision === "approved"
                ? []
                : payload.blockingIssues.length > 0
                  ? payload.blockingIssues
                  : detail.pendingBlockingIssues,
            evidenceAttachments: payload.evidenceAttachments,
            decidedById: req.auth!.userId,
            decidedAt: new Date(),
          })
          .where(eq(serviceReleaseRecordsTable.id, existingRelease.id));
      } else {
        await tx.insert(serviceReleaseRecordsTable).values({
          cycleId,
          decision: payload.decision,
          decisionNotes: payload.decisionNotes ?? null,
          blockingIssues:
            payload.decision === "approved"
              ? []
              : payload.blockingIssues.length > 0
                ? payload.blockingIssues
                : detail.pendingBlockingIssues,
          evidenceAttachments: payload.evidenceAttachments,
          decidedById: req.auth!.userId,
          decidedAt: new Date(),
        });
      }

      await tx
        .update(serviceExecutionCyclesTable)
        .set({
          status: payload.decision === "approved" ? "released" : "blocked",
          completedAt: payload.decision === "approved" ? new Date() : null,
        })
        .where(eq(serviceExecutionCyclesTable.id, cycleId));
    });

    const updated = await getServiceExecutionCycleDetail(orgId, cycleId);
    res.json(updated);
  },
);

router.post(
  "/organizations/:orgId/governance/service-execution-cycles/:cycleId/nonconforming-outputs",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = cycleParamsSchema.safeParse(req.params);
    const body = nonconformingOutputBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, cycleId } = params.data;
    const payload = body.data;

    const [cycle] = await db
      .select({
        id: serviceExecutionCyclesTable.id,
        status: serviceExecutionCyclesTable.status,
      })
      .from(serviceExecutionCyclesTable)
      .where(
        and(
          eq(serviceExecutionCyclesTable.id, cycleId),
          eq(serviceExecutionCyclesTable.organizationId, orgId),
        ),
      );

    if (!cycle) {
      res.status(404).json({ error: "Ciclo de execução não encontrado" });
      return;
    }

    if (!(await validateNonconformityId(payload.linkedNonconformityId, orgId))) {
      res.status(400).json({ error: "linkedNonconformityId inválido para a organização" });
      return;
    }

    const createdOutput = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(serviceNonconformingOutputsTable)
        .values({
          organizationId: orgId,
          cycleId,
          title: payload.title,
          description: payload.description,
          status: payload.status,
          disposition: payload.disposition ?? null,
          dispositionNotes: payload.dispositionNotes ?? null,
          responsibleUserId: payload.responsibleUserId ?? null,
          linkedNonconformityId: payload.linkedNonconformityId ?? null,
          evidenceAttachments: payload.evidenceAttachments,
          detectedById: req.auth!.userId,
          detectedAt: new Date(),
          resolvedAt:
            payload.status === "resolved" || payload.status === "closed" ? new Date() : null,
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        })
        .returning({ id: serviceNonconformingOutputsTable.id });

      if (payload.status === "open" || payload.status === "in_treatment") {
        await tx
          .update(serviceExecutionCyclesTable)
          .set({ status: "blocked" })
          .where(eq(serviceExecutionCyclesTable.id, cycleId));
      } else if (cycle.status !== "released" && cycle.status !== "blocked") {
        const currentCheckpoints = await tx
          .select({
            label: serviceExecutionCycleCheckpointsTable.label,
            status: serviceExecutionCycleCheckpointsTable.status,
            isRequired: serviceExecutionCycleCheckpointsTable.isRequired,
            requiresEvidence: serviceExecutionCycleCheckpointsTable.requiresEvidence,
            evidenceAttachments:
              serviceExecutionCycleCheckpointsTable.evidenceAttachments,
          })
          .from(serviceExecutionCycleCheckpointsTable)
          .where(eq(serviceExecutionCycleCheckpointsTable.cycleId, cycleId));

        const blockingIssues = buildCycleBlockingIssues(currentCheckpoints);
        await tx
          .update(serviceExecutionCyclesTable)
          .set({
            status: blockingIssues.length === 0 ? "awaiting_release" : "in_progress",
          })
          .where(eq(serviceExecutionCyclesTable.id, cycleId));
      }
      return created;
    });

    const outputs = await listServiceNonconformingOutputs(orgId, cycleId);
    const created = outputs.find((output) => output.id === createdOutput.id);
    res.status(201).json(created);
  },
);

router.patch(
  "/organizations/:orgId/governance/service-execution-cycles/:cycleId/nonconforming-outputs/:outputId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = outputParamsSchema.safeParse(req.params);
    const body = nonconformingOutputBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, cycleId, outputId } = params.data;
    const payload = body.data;

    const [existingOutput] = await db
      .select({
        id: serviceNonconformingOutputsTable.id,
        status: serviceNonconformingOutputsTable.status,
      })
      .from(serviceNonconformingOutputsTable)
      .where(
        and(
          eq(serviceNonconformingOutputsTable.id, outputId),
          eq(serviceNonconformingOutputsTable.cycleId, cycleId),
          eq(serviceNonconformingOutputsTable.organizationId, orgId),
        ),
      );

    if (!existingOutput) {
      res.status(404).json({ error: "Saída não conforme não encontrada" });
      return;
    }

    const [cycle] = await db
      .select({
        id: serviceExecutionCyclesTable.id,
        status: serviceExecutionCyclesTable.status,
      })
      .from(serviceExecutionCyclesTable)
      .where(
        and(
          eq(serviceExecutionCyclesTable.id, cycleId),
          eq(serviceExecutionCyclesTable.organizationId, orgId),
        ),
      );

    if (!cycle) {
      res.status(404).json({ error: "Ciclo de execução não encontrado" });
      return;
    }

    if (!(await validateNonconformityId(payload.linkedNonconformityId, orgId))) {
      res.status(400).json({ error: "linkedNonconformityId inválido para a organização" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(serviceNonconformingOutputsTable)
        .set({
          title: payload.title,
          description: payload.description,
          status: payload.status,
          disposition: payload.disposition ?? null,
          dispositionNotes: payload.dispositionNotes ?? null,
          responsibleUserId: payload.responsibleUserId ?? null,
          linkedNonconformityId: payload.linkedNonconformityId ?? null,
          evidenceAttachments: payload.evidenceAttachments,
          resolvedAt:
            payload.status === "resolved" || payload.status === "closed"
              ? existingOutput.status === "resolved" || existingOutput.status === "closed"
                ? undefined
                : new Date()
              : null,
          updatedById: req.auth!.userId,
        })
        .where(eq(serviceNonconformingOutputsTable.id, outputId));

      if (payload.status === "open" || payload.status === "in_treatment") {
        await tx
          .update(serviceExecutionCyclesTable)
          .set({ status: "blocked" })
          .where(eq(serviceExecutionCyclesTable.id, cycleId));
      } else if (cycle.status !== "released" && cycle.status !== "blocked") {
        const currentCheckpoints = await tx
          .select({
            label: serviceExecutionCycleCheckpointsTable.label,
            status: serviceExecutionCycleCheckpointsTable.status,
            isRequired: serviceExecutionCycleCheckpointsTable.isRequired,
            requiresEvidence: serviceExecutionCycleCheckpointsTable.requiresEvidence,
            evidenceAttachments:
              serviceExecutionCycleCheckpointsTable.evidenceAttachments,
          })
          .from(serviceExecutionCycleCheckpointsTable)
          .where(eq(serviceExecutionCycleCheckpointsTable.cycleId, cycleId));

        const activeOutputs = await tx
          .select({ total: count() })
          .from(serviceNonconformingOutputsTable)
          .where(
            and(
              eq(serviceNonconformingOutputsTable.cycleId, cycleId),
              inArray(serviceNonconformingOutputsTable.status, ["open", "in_treatment"]),
            ),
          );

        const blockingIssues = buildCycleBlockingIssues(currentCheckpoints);
        if ((activeOutputs[0]?.total ?? 0) > 0) {
          await tx
            .update(serviceExecutionCyclesTable)
            .set({ status: "blocked" })
            .where(eq(serviceExecutionCyclesTable.id, cycleId));
        } else {
          await tx
            .update(serviceExecutionCyclesTable)
            .set({
              status: blockingIssues.length === 0 ? "awaiting_release" : "in_progress",
            })
            .where(eq(serviceExecutionCyclesTable.id, cycleId));
        }
      }
    });

    const outputs = await listServiceNonconformingOutputs(orgId, cycleId);
    const updated = outputs.find((output) => output.id === outputId);
    res.json(updated);
  },
);

router.post(
  "/organizations/:orgId/governance/service-execution-cycles/:cycleId/third-party-properties",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = cycleParamsSchema.safeParse(req.params);
    const body = thirdPartyPropertyBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, cycleId } = params.data;
    const payload = body.data;

    const [cycle] = await db
      .select({ id: serviceExecutionCyclesTable.id })
      .from(serviceExecutionCyclesTable)
      .where(
        and(
          eq(serviceExecutionCyclesTable.id, cycleId),
          eq(serviceExecutionCyclesTable.organizationId, orgId),
        ),
      );
    if (!cycle) {
      res.status(404).json({ error: "Ciclo de execução não encontrado" });
      return;
    }

    const [created] = await db
      .insert(serviceThirdPartyPropertiesTable)
      .values({
        organizationId: orgId,
        cycleId,
        title: payload.title,
        ownerName: payload.ownerName,
        description: payload.description ?? null,
        conditionOnReceipt: payload.conditionOnReceipt ?? null,
        handlingRequirements: payload.handlingRequirements ?? null,
        status: payload.status,
        responsibleUserId: payload.responsibleUserId ?? null,
        evidenceAttachments: payload.evidenceAttachments,
        registeredById: req.auth!.userId,
        receivedAt: new Date(),
      })
      .returning({ id: serviceThirdPartyPropertiesTable.id });

    const rows = await listServiceThirdPartyProperties(orgId, cycleId);
    res.status(201).json(rows.find((row) => row.id === created.id));
  },
);

router.patch(
  "/organizations/:orgId/governance/service-execution-cycles/:cycleId/third-party-properties/:propertyId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = propertyParamsSchema.safeParse(req.params);
    const body = thirdPartyPropertyBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, cycleId, propertyId } = params.data;
    const payload = body.data;

    const [existing] = await db
      .select({ id: serviceThirdPartyPropertiesTable.id })
      .from(serviceThirdPartyPropertiesTable)
      .where(
        and(
          eq(serviceThirdPartyPropertiesTable.id, propertyId),
          eq(serviceThirdPartyPropertiesTable.organizationId, orgId),
          eq(serviceThirdPartyPropertiesTable.cycleId, cycleId),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Propriedade de terceiros não encontrada" });
      return;
    }

    await db
      .update(serviceThirdPartyPropertiesTable)
      .set({
        title: payload.title,
        ownerName: payload.ownerName,
        description: payload.description ?? null,
        conditionOnReceipt: payload.conditionOnReceipt ?? null,
        handlingRequirements: payload.handlingRequirements ?? null,
        status: payload.status,
        responsibleUserId: payload.responsibleUserId ?? null,
        evidenceAttachments: payload.evidenceAttachments,
        returnedAt: payload.status === "returned" ? new Date() : null,
      })
      .where(eq(serviceThirdPartyPropertiesTable.id, propertyId));

    const rows = await listServiceThirdPartyProperties(orgId, cycleId);
    res.json(rows.find((row) => row.id === propertyId));
  },
);

router.put(
  "/organizations/:orgId/governance/service-execution-cycles/:cycleId/preservation-delivery",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = cycleParamsSchema.safeParse(req.params);
    const body = preservationDeliveryBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, cycleId } = params.data;
    const payload = body.data;

    const [cycle] = await db
      .select({ id: serviceExecutionCyclesTable.id })
      .from(serviceExecutionCyclesTable)
      .where(
        and(
          eq(serviceExecutionCyclesTable.id, cycleId),
          eq(serviceExecutionCyclesTable.organizationId, orgId),
        ),
      );
    if (!cycle) {
      res.status(404).json({ error: "Ciclo de execução não encontrado" });
      return;
    }

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: servicePreservationDeliveryRecordsTable.id })
        .from(servicePreservationDeliveryRecordsTable)
        .where(eq(servicePreservationDeliveryRecordsTable.cycleId, cycleId));

      const values = {
        organizationId: orgId,
        cycleId,
        preservationNotes: payload.preservationNotes ?? null,
        preservationMethod: payload.preservationMethod ?? null,
        packagingNotes: payload.packagingNotes ?? null,
        deliveryNotes: payload.deliveryNotes ?? null,
        deliveryRecipient: payload.deliveryRecipient ?? null,
        deliveryMethod: payload.deliveryMethod ?? null,
        deliveredById: payload.deliveredById ?? null,
        preservationEvidenceAttachments: payload.preservationEvidenceAttachments,
        deliveryEvidenceAttachments: payload.deliveryEvidenceAttachments,
        preservedAt: payload.preservedAt ? new Date(payload.preservedAt) : null,
        deliveredAt: payload.deliveredAt ? new Date(payload.deliveredAt) : null,
        updatedById: req.auth!.userId,
      };

      if (existing) {
        await tx
          .update(servicePreservationDeliveryRecordsTable)
          .set(values)
          .where(eq(servicePreservationDeliveryRecordsTable.id, existing.id));
      } else {
        await tx.insert(servicePreservationDeliveryRecordsTable).values({
          ...values,
          createdById: req.auth!.userId,
        });
      }
    });

    const record = await getServicePreservationDeliveryRecord(orgId, cycleId);
    res.json(record);
  },
);

router.post(
  "/organizations/:orgId/governance/service-execution-cycles/:cycleId/post-delivery-events",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = cycleParamsSchema.safeParse(req.params);
    const body = postDeliveryEventBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, cycleId } = params.data;
    const payload = body.data;

    const [cycle] = await db
      .select({ id: serviceExecutionCyclesTable.id })
      .from(serviceExecutionCyclesTable)
      .where(
        and(
          eq(serviceExecutionCyclesTable.id, cycleId),
          eq(serviceExecutionCyclesTable.organizationId, orgId),
        ),
      );
    if (!cycle) {
      res.status(404).json({ error: "Ciclo de execução não encontrado" });
      return;
    }

    const [created] = await db
      .insert(servicePostDeliveryEventsTable)
      .values({
        organizationId: orgId,
        cycleId,
        eventType: payload.eventType,
        title: payload.title,
        description: payload.description,
        status: payload.status,
        followUpNotes: payload.followUpNotes ?? null,
        responsibleUserId: payload.responsibleUserId ?? null,
        evidenceAttachments: payload.evidenceAttachments,
        occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
        closedAt: payload.status === "closed" ? new Date() : null,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning({ id: servicePostDeliveryEventsTable.id });

    const rows = await listServicePostDeliveryEvents(orgId, cycleId);
    res.status(201).json(rows.find((row) => row.id === created.id));
  },
);

router.patch(
  "/organizations/:orgId/governance/service-execution-cycles/:cycleId/post-delivery-events/:eventId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = postDeliveryEventParamsSchema.safeParse(req.params);
    const body = postDeliveryEventBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, cycleId, eventId } = params.data;
    const payload = body.data;

    const [existing] = await db
      .select({ id: servicePostDeliveryEventsTable.id })
      .from(servicePostDeliveryEventsTable)
      .where(
        and(
          eq(servicePostDeliveryEventsTable.id, eventId),
          eq(servicePostDeliveryEventsTable.organizationId, orgId),
          eq(servicePostDeliveryEventsTable.cycleId, cycleId),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Evento de pós-serviço não encontrado" });
      return;
    }

    await db
      .update(servicePostDeliveryEventsTable)
      .set({
        eventType: payload.eventType,
        title: payload.title,
        description: payload.description,
        status: payload.status,
        followUpNotes: payload.followUpNotes ?? null,
        responsibleUserId: payload.responsibleUserId ?? null,
        evidenceAttachments: payload.evidenceAttachments,
        occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
        closedAt: payload.status === "closed" ? new Date() : null,
        updatedById: req.auth!.userId,
      })
      .where(eq(servicePostDeliveryEventsTable.id, eventId));

    const rows = await listServicePostDeliveryEvents(orgId, cycleId);
    res.json(rows.find((row) => row.id === eventId));
  },
);

router.put(
  "/organizations/:orgId/governance/service-execution-models/:modelId/special-validation-profile",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = modelParamsSchema.safeParse(req.params);
    const body = specialValidationProfileBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, modelId } = params.data;
    const payload = body.data;

    const [model] = await db
      .select({
        id: serviceExecutionModelsTable.id,
        processId: serviceExecutionModelsTable.processId,
      })
      .from(serviceExecutionModelsTable)
      .where(
        and(
          eq(serviceExecutionModelsTable.id, modelId),
          eq(serviceExecutionModelsTable.organizationId, orgId),
        ),
      );
    if (!model) {
      res.status(404).json({ error: "Modelo de execução não encontrado" });
      return;
    }

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: serviceSpecialValidationProfilesTable.id })
        .from(serviceSpecialValidationProfilesTable)
        .where(eq(serviceSpecialValidationProfilesTable.modelId, modelId));

      const values = {
        organizationId: orgId,
        modelId,
        processId: model.processId ?? null,
        title: payload.title,
        criteria: payload.criteria,
        method: payload.method ?? null,
        status: payload.status,
        responsibleUserId: payload.responsibleUserId ?? null,
        currentValidUntil: payload.currentValidUntil ? new Date(payload.currentValidUntil) : null,
        notes: payload.notes ?? null,
        updatedById: req.auth!.userId,
      };

      if (existing) {
        await tx
          .update(serviceSpecialValidationProfilesTable)
          .set(values)
          .where(eq(serviceSpecialValidationProfilesTable.id, existing.id));
      } else {
        await tx.insert(serviceSpecialValidationProfilesTable).values({
          ...values,
          createdById: req.auth!.userId,
        });

        await tx
          .update(serviceExecutionModelsTable)
          .set({
            requiresSpecialValidation: true,
            updatedById: req.auth!.userId,
          })
          .where(eq(serviceExecutionModelsTable.id, modelId));
      }
    });

    const profile = await getServiceSpecialValidationProfile(orgId, modelId);
    res.json(profile);
  },
);

router.post(
  "/organizations/:orgId/governance/service-execution-models/:modelId/special-validation-profile/:profileId/events",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = modelValidationParamsSchema.safeParse(req.params);
    const body = specialValidationEventBodySchema.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { orgId, modelId, profileId } = params.data;
    const payload = body.data;

    const [profile] = await db
      .select({
        id: serviceSpecialValidationProfilesTable.id,
        criteria: serviceSpecialValidationProfilesTable.criteria,
      })
      .from(serviceSpecialValidationProfilesTable)
      .where(
        and(
          eq(serviceSpecialValidationProfilesTable.id, profileId),
          eq(serviceSpecialValidationProfilesTable.organizationId, orgId),
          eq(serviceSpecialValidationProfilesTable.modelId, modelId),
        ),
      );
    if (!profile) {
      res.status(404).json({ error: "Perfil de validação especial não encontrado" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.insert(serviceSpecialValidationEventsTable).values({
        profileId,
        eventType: payload.eventType,
        result: payload.result,
        criteriaSnapshot: payload.criteriaSnapshot || profile.criteria,
        notes: payload.notes ?? null,
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
        evidenceAttachments: payload.evidenceAttachments,
        validatedById: payload.validatedById ?? req.auth!.userId,
        validatedAt: new Date(),
      });

      await tx
        .update(serviceSpecialValidationProfilesTable)
        .set({
          status: payload.result === "approved" ? "valid" : "suspended",
          currentValidUntil: payload.validUntil ? new Date(payload.validUntil) : null,
          updatedById: req.auth!.userId,
        })
        .where(eq(serviceSpecialValidationProfilesTable.id, profileId));
    });

    const updated = await getServiceSpecialValidationProfile(orgId, modelId);
    res.status(201).json(updated);
  },
);

export default router;
