import { Router, type IRouter, type Response } from "express";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  correctiveActionsTable,
  db,
  documentsTable,
  internalAuditChecklistItemsTable,
  internalAuditFindingsTable,
  internalAuditsTable,
  knowledgeAssetsTable,
  knowledgeAssetLinksTable,
  managementReviewInputsTable,
  managementReviewOutputsTable,
  managementReviewsTable,
  nonconformitiesTable,
  positionsTable,
  sgqProcessesTable,
  sgqProcessInteractionsTable,
  sgqProcessRevisionsTable,
  strategicPlanRiskOpportunityItemsTable,
  strategicPlansTable,
  type GovernanceSystemAttachment,
} from "@workspace/db";
import { usersTable } from "@workspace/db";
import { requireWriteAccess } from "../../middlewares/auth";

const router: IRouter = Router();

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().optional(),
});
const orgParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
});
const processParamsSchema = orgParamsSchema.extend({
  processId: z.coerce.number().int().positive(),
});
const auditParamsSchema = orgParamsSchema.extend({
  auditId: z.coerce.number().int().positive(),
});
const findingParamsSchema = auditParamsSchema.extend({
  findingId: z.coerce.number().int().positive(),
});
const ncParamsSchema = orgParamsSchema.extend({
  ncId: z.coerce.number().int().positive(),
});
const actionParamsSchema = ncParamsSchema.extend({
  actionId: z.coerce.number().int().positive(),
});
const reviewParamsSchema = orgParamsSchema.extend({
  reviewId: z.coerce.number().int().positive(),
});
const reviewInputParamsSchema = reviewParamsSchema.extend({
  inputId: z.coerce.number().int().positive(),
});
const reviewOutputParamsSchema = reviewParamsSchema.extend({
  outputId: z.coerce.number().int().positive(),
});
const knowledgeAssetParamsSchema = orgParamsSchema.extend({
  assetId: z.coerce.number().int().positive(),
});

const attachmentSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().min(0),
  contentType: z.string().min(1),
  objectPath: z.string().min(1),
});

const processInteractionInputSchema = z.object({
  relatedProcessId: z.number().int().positive(),
  direction: z.enum(["upstream", "downstream"]),
  notes: z.string().nullable().optional(),
});

const processCreateBodySchema = z.object({
  name: z.string().min(1),
  objective: z.string().min(1),
  ownerUserId: z.number().int().positive().nullable().optional(),
  inputs: z.array(z.string().min(1)).default([]),
  outputs: z.array(z.string().min(1)).default([]),
  criteria: z.string().nullable().optional(),
  indicators: z.string().nullable().optional(),
  attachments: z.array(attachmentSchema).default([]),
  changeSummary: z.string().nullable().optional(),
  interactions: z.array(processInteractionInputSchema).default([]),
});

const processUpdateBodySchema = z.object({
  name: z.string().min(1).optional(),
  objective: z.string().min(1).optional(),
  ownerUserId: z.number().int().positive().nullable().optional(),
  inputs: z.array(z.string().min(1)).optional(),
  outputs: z.array(z.string().min(1)).optional(),
  criteria: z.string().nullable().optional(),
  indicators: z.string().nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  changeSummary: z.string().nullable().optional(),
  interactions: z.array(processInteractionInputSchema).optional(),
});

const listProcessesQuerySchema = paginationSchema.extend({
  status: z.enum(["active", "inactive"]).optional(),
  ownerUserId: z.coerce.number().int().positive().optional(),
});

const listAuditsQuerySchema = paginationSchema.extend({
  status: z.enum(["planned", "in_progress", "completed", "canceled"]).optional(),
  auditorUserId: z.coerce.number().int().positive().optional(),
  originType: z.enum(["internal", "external_manual"]).optional(),
});

const auditCreateBodySchema = z.object({
  title: z.string().min(1),
  scope: z.string().min(1),
  criteria: z.string().min(1),
  periodStart: dateStringSchema,
  periodEnd: dateStringSchema,
  auditorUserId: z.number().int().positive().nullable().optional(),
  originType: z.enum(["internal", "external_manual"]).default("internal"),
  status: z.enum(["planned", "in_progress", "completed", "canceled"]).default("planned"),
  attachments: z.array(attachmentSchema).default([]),
});

const auditUpdateBodySchema = z.object({
  title: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  criteria: z.string().min(1).optional(),
  periodStart: dateStringSchema.optional(),
  periodEnd: dateStringSchema.optional(),
  auditorUserId: z.number().int().positive().nullable().optional(),
  originType: z.enum(["internal", "external_manual"]).optional(),
  status: z.enum(["planned", "in_progress", "completed", "canceled"]).optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const checklistItemInputSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().min(1),
  requirementRef: z.string().nullable().optional(),
  result: z
    .enum(["conformity", "nonconformity", "observation", "not_evaluated"])
    .default("not_evaluated"),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const checklistSyncBodySchema = z.object({
  items: z.array(checklistItemInputSchema),
});

const findingCreateBodySchema = z.object({
  processId: z.number().int().positive().nullable().optional(),
  requirementRef: z.string().nullable().optional(),
  classification: z.enum(["conformity", "observation", "nonconformity"]),
  description: z.string().min(1),
  responsibleUserId: z.number().int().positive().nullable().optional(),
  dueDate: dateStringSchema.nullable().optional(),
  attachments: z.array(attachmentSchema).default([]),
});

const findingUpdateBodySchema = findingCreateBodySchema.partial();

const listNonconformitiesQuerySchema = paginationSchema.extend({
  status: z
    .enum([
      "open",
      "under_analysis",
      "action_in_progress",
      "awaiting_effectiveness",
      "closed",
      "canceled",
    ])
    .optional(),
  originType: z
    .enum(["audit_finding", "incident", "document", "process", "risk", "other"])
    .optional(),
  responsibleUserId: z.coerce.number().int().positive().optional(),
});

const nonconformityCreateBodySchema = z.object({
  originType: z.enum(["audit_finding", "incident", "document", "process", "risk", "other"]),
  title: z.string().min(1),
  description: z.string().min(1),
  classification: z.string().nullable().optional(),
  rootCause: z.string().nullable().optional(),
  responsibleUserId: z.number().int().positive().nullable().optional(),
  processId: z.number().int().positive().nullable().optional(),
  documentId: z.number().int().positive().nullable().optional(),
  riskOpportunityItemId: z.number().int().positive().nullable().optional(),
  auditFindingId: z.number().int().positive().nullable().optional(),
  attachments: z.array(attachmentSchema).default([]),
});

const nonconformityUpdateBodySchema = z.object({
  originType: z.enum(["audit_finding", "incident", "document", "process", "risk", "other"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  classification: z.string().nullable().optional(),
  rootCause: z.string().nullable().optional(),
  responsibleUserId: z.number().int().positive().nullable().optional(),
  processId: z.number().int().positive().nullable().optional(),
  documentId: z.number().int().positive().nullable().optional(),
  riskOpportunityItemId: z.number().int().positive().nullable().optional(),
  auditFindingId: z.number().int().positive().nullable().optional(),
  status: z
    .enum([
      "open",
      "under_analysis",
      "action_in_progress",
      "awaiting_effectiveness",
      "closed",
      "canceled",
    ])
    .optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const effectivenessReviewBodySchema = z.object({
  result: z.enum(["effective", "ineffective"]),
  comment: z.string().nullable().optional(),
});

const correctiveActionCreateBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  responsibleUserId: z.number().int().positive().nullable().optional(),
  dueDate: dateStringSchema.nullable().optional(),
  status: z.enum(["pending", "in_progress", "done", "canceled"]).default("pending"),
  executionNotes: z.string().nullable().optional(),
  attachments: z.array(attachmentSchema).default([]),
});

const correctiveActionUpdateBodySchema = correctiveActionCreateBodySchema.partial();

const listManagementReviewsQuerySchema = paginationSchema.extend({
  status: z.enum(["draft", "completed", "canceled"]).optional(),
  chairUserId: z.coerce.number().int().positive().optional(),
});

const managementReviewCreateBodySchema = z.object({
  title: z.string().min(1),
  reviewDate: dateStringSchema,
  chairUserId: z.number().int().positive().nullable().optional(),
  minutes: z.string().nullable().optional(),
  status: z.enum(["draft", "completed", "canceled"]).default("draft"),
  attachments: z.array(attachmentSchema).default([]),
});

const managementReviewUpdateBodySchema = managementReviewCreateBodySchema.partial();

const managementReviewInputBodySchema = z.object({
  inputType: z.enum([
    "policy",
    "audit_summary",
    "nc_summary",
    "objective_status",
    "risk_status",
    "process_performance",
    "customer_feedback",
    "other",
  ]),
  summary: z.string().min(1),
  documentId: z.number().int().positive().nullable().optional(),
  auditId: z.number().int().positive().nullable().optional(),
  nonconformityId: z.number().int().positive().nullable().optional(),
  strategicPlanId: z.number().int().positive().nullable().optional(),
  processId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const managementReviewOutputBodySchema = z.object({
  outputType: z.enum(["decision", "action", "resource", "priority"]),
  description: z.string().min(1),
  responsibleUserId: z.number().int().positive().nullable().optional(),
  dueDate: dateStringSchema.nullable().optional(),
  processId: z.number().int().positive().nullable().optional(),
  nonconformityId: z.number().int().positive().nullable().optional(),
  status: z.enum(["open", "done", "canceled"]).default("open"),
});

const knowledgeAssetLinkInputSchema = z
  .object({
    processId: z.number().int().positive().nullable().optional(),
    positionId: z.number().int().positive().nullable().optional(),
    documentId: z.number().int().positive().nullable().optional(),
    riskOpportunityItemId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const populatedCount = [
      value.processId,
      value.positionId,
      value.documentId,
      value.riskOpportunityItemId,
    ].filter((item) => item != null).length;

    if (populatedCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cada vínculo deve apontar para exatamente um contexto: processo, cargo, documento ou risco/oportunidade",
      });
    }
  });

const knowledgeAssetCreateBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  lossRiskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  retentionMethod: z.string().nullable().optional(),
  successionPlan: z.string().nullable().optional(),
  evidenceAttachments: z.array(attachmentSchema).default([]),
  evidenceValidUntil: dateStringSchema.nullable().optional(),
  links: z.array(knowledgeAssetLinkInputSchema).min(1),
});

const knowledgeAssetUpdateBodySchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  lossRiskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  retentionMethod: z.string().nullable().optional(),
  successionPlan: z.string().nullable().optional(),
  evidenceAttachments: z.array(attachmentSchema).optional(),
  evidenceValidUntil: dateStringSchema.nullable().optional(),
  links: z.array(knowledgeAssetLinkInputSchema).min(1).optional(),
});

const listKnowledgeAssetsQuerySchema = paginationSchema.extend({
  processId: z.coerce.number().int().positive().optional(),
  positionId: z.coerce.number().int().positive().optional(),
  documentId: z.coerce.number().int().positive().optional(),
  riskOpportunityItemId: z.coerce.number().int().positive().optional(),
  lossRiskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  evidenceStatus: z.enum(["missing", "expired", "valid"]).optional(),
});

type MutationTx = Pick<typeof db, "select" | "insert" | "update" | "delete">;
type ProcessUpdateValues = Partial<typeof sgqProcessesTable.$inferInsert>;
type AuditUpdateValues = Partial<typeof internalAuditsTable.$inferInsert>;
type FindingUpdateValues = Partial<typeof internalAuditFindingsTable.$inferInsert>;
type NonconformityUpdateValues = Partial<typeof nonconformitiesTable.$inferInsert>;
type CorrectiveActionUpdateValues = Partial<typeof correctiveActionsTable.$inferInsert>;
type ManagementReviewUpdateValues = Partial<typeof managementReviewsTable.$inferInsert>;
type ManagementReviewInputUpdateValues = Partial<typeof managementReviewInputsTable.$inferInsert>;
type ManagementReviewOutputUpdateValues = Partial<typeof managementReviewOutputsTable.$inferInsert>;
type KnowledgeAssetUpdateValues = Partial<typeof knowledgeAssetsTable.$inferInsert>;
type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;
type ProcessInteractionState = {
  relatedProcessId: number;
  direction: "upstream" | "downstream";
  notes: string | null;
};
type ProcessSnapshotState = {
  name: string;
  objective: string;
  ownerUserId: number | null;
  inputs: string[];
  outputs: string[];
  criteria: string | null;
  indicators: string | null;
  status: "active" | "inactive";
  attachments: GovernanceSystemAttachment[];
  interactions: ProcessInteractionState[];
};
type KnowledgeAssetLinkInput = z.infer<typeof knowledgeAssetLinkInputSchema>;
type KnowledgeAssetLinkDetail = {
  id: number;
  processId: number | null;
  processName: string | null;
  positionId: number | null;
  positionName: string | null;
  documentId: number | null;
  documentTitle: string | null;
  riskOpportunityItemId: number | null;
  riskOpportunityItemLabel: string | null;
  riskOpportunityPlanTitle: string | null;
};

function isoDateTime(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function normalizeAttachments(
  attachments?: GovernanceSystemAttachment[] | null,
): GovernanceSystemAttachment[] {
  return attachments ?? [];
}

function normalizeDate(value: string | null | undefined) {
  return value ?? null;
}

function escapeIlikeSearchPattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildContainsPattern(value: string) {
  return `%${escapeIlikeSearchPattern(value)}%`;
}

function normalizeNullableText(value: string | null | undefined) {
  return value ?? null;
}

function normalizeDateOnlyValue(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString().slice(0, 10);
}

function computeKnowledgeAssetEvidenceStatus(
  attachments?: GovernanceSystemAttachment[] | null,
  evidenceValidUntil?: Date | string | null,
) {
  if (!attachments || attachments.length === 0) {
    return "missing" as const;
  }

  const normalizedValidUntil = normalizeDateOnlyValue(evidenceValidUntil);
  const today = new Date().toISOString().slice(0, 10);

  if (normalizedValidUntil && normalizedValidUntil < today) {
    return "expired" as const;
  }

  return "valid" as const;
}

function normalizeProcessInteractionsForComparison(
  interactions: Array<{
    relatedProcessId: number;
    direction: "upstream" | "downstream";
    notes?: string | null;
  }>,
): ProcessInteractionState[] {
  return interactions
    .map((interaction) => ({
      relatedProcessId: interaction.relatedProcessId,
      direction: interaction.direction,
      notes: interaction.notes ?? null,
    }))
    .sort((left, right) => {
      if (left.relatedProcessId !== right.relatedProcessId) {
        return left.relatedProcessId - right.relatedProcessId;
      }
      if (left.direction !== right.direction) {
        return left.direction.localeCompare(right.direction);
      }
      return (left.notes ?? "").localeCompare(right.notes ?? "");
    });
}

function processSnapshotsEqual(left: ProcessSnapshotState, right: ProcessSnapshotState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function validateOrgUsers(userIds: number[], orgId: number): Promise<boolean> {
  if (userIds.length === 0) return true;
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(inArray(usersTable.id, userIds), eq(usersTable.organizationId, orgId)));
  return rows.length === userIds.length;
}

async function validateOrgDocuments(docIds: number[], orgId: number): Promise<boolean> {
  if (docIds.length === 0) return true;
  const rows = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(and(inArray(documentsTable.id, docIds), eq(documentsTable.organizationId, orgId)));
  return rows.length === docIds.length;
}

async function validateOrgProcesses(processIds: number[], orgId: number): Promise<boolean> {
  const uniqueProcessIds = [...new Set(processIds)];
  if (uniqueProcessIds.length === 0) return true;
  const rows = await db
    .select({ id: sgqProcessesTable.id })
    .from(sgqProcessesTable)
    .where(
      and(
        inArray(sgqProcessesTable.id, uniqueProcessIds),
        eq(sgqProcessesTable.organizationId, orgId),
      ),
    );
  return rows.length === uniqueProcessIds.length;
}

async function validateOrgAudits(auditIds: number[], orgId: number): Promise<boolean> {
  if (auditIds.length === 0) return true;
  const rows = await db
    .select({ id: internalAuditsTable.id })
    .from(internalAuditsTable)
    .where(and(inArray(internalAuditsTable.id, auditIds), eq(internalAuditsTable.organizationId, orgId)));
  return rows.length === auditIds.length;
}

async function validateOrgAuditFindings(findingIds: number[], orgId: number): Promise<boolean> {
  if (findingIds.length === 0) return true;
  const rows = await db
    .select({ id: internalAuditFindingsTable.id })
    .from(internalAuditFindingsTable)
    .innerJoin(internalAuditsTable, eq(internalAuditFindingsTable.auditId, internalAuditsTable.id))
    .where(
      and(
        inArray(internalAuditFindingsTable.id, findingIds),
        eq(internalAuditsTable.organizationId, orgId),
      ),
    );
  return rows.length === findingIds.length;
}

async function validateOrgNonconformities(ncIds: number[], orgId: number): Promise<boolean> {
  if (ncIds.length === 0) return true;
  const rows = await db
    .select({ id: nonconformitiesTable.id })
    .from(nonconformitiesTable)
    .where(and(inArray(nonconformitiesTable.id, ncIds), eq(nonconformitiesTable.organizationId, orgId)));
  return rows.length === ncIds.length;
}

async function validateOrgStrategicPlans(planIds: number[], orgId: number): Promise<boolean> {
  if (planIds.length === 0) return true;
  const rows = await db
    .select({ id: strategicPlansTable.id })
    .from(strategicPlansTable)
    .where(and(inArray(strategicPlansTable.id, planIds), eq(strategicPlansTable.organizationId, orgId)));
  return rows.length === planIds.length;
}

async function validateOrgRiskItems(itemIds: number[], orgId: number): Promise<boolean> {
  if (itemIds.length === 0) return true;
  const rows = await db
    .select({ id: strategicPlanRiskOpportunityItemsTable.id })
    .from(strategicPlanRiskOpportunityItemsTable)
    .innerJoin(
      strategicPlansTable,
      eq(strategicPlanRiskOpportunityItemsTable.planId, strategicPlansTable.id),
    )
    .where(
      and(
        inArray(strategicPlanRiskOpportunityItemsTable.id, itemIds),
        eq(strategicPlansTable.organizationId, orgId),
      ),
    );
  return rows.length === itemIds.length;
}

async function validateOrgPositions(positionIds: number[], orgId: number): Promise<boolean> {
  if (positionIds.length === 0) return true;
  const rows = await db
    .select({ id: positionsTable.id })
    .from(positionsTable)
    .where(and(inArray(positionsTable.id, positionIds), eq(positionsTable.organizationId, orgId)));
  return rows.length === positionIds.length;
}

async function validateKnowledgeAssetLinks(links: KnowledgeAssetLinkInput[], orgId: number) {
  const processIds = links
    .map((link) => link.processId)
    .filter((value): value is number => !!value);
  const positionIds = links
    .map((link) => link.positionId)
    .filter((value): value is number => !!value);
  const documentIds = links
    .map((link) => link.documentId)
    .filter((value): value is number => !!value);
  const riskItemIds = links
    .map((link) => link.riskOpportunityItemId)
    .filter((value): value is number => !!value);

  if (!(await validateOrgProcesses(processIds, orgId))) {
    throw new Error("INVALID_KNOWLEDGE_ASSET_PROCESS");
  }
  if (!(await validateOrgPositions(positionIds, orgId))) {
    throw new Error("INVALID_KNOWLEDGE_ASSET_POSITION");
  }
  if (!(await validateOrgDocuments(documentIds, orgId))) {
    throw new Error("INVALID_KNOWLEDGE_ASSET_DOCUMENT");
  }
  if (!(await validateOrgRiskItems(riskItemIds, orgId))) {
    throw new Error("INVALID_KNOWLEDGE_ASSET_RISK_ITEM");
  }
}

async function syncKnowledgeAssetLinks(
  tx: MutationTx,
  assetId: number,
  links: KnowledgeAssetLinkInput[],
) {
  await tx
    .delete(knowledgeAssetLinksTable)
    .where(eq(knowledgeAssetLinksTable.knowledgeAssetId, assetId));

  if (links.length === 0) return;

  await tx.insert(knowledgeAssetLinksTable).values(
    links.map((link) => ({
      knowledgeAssetId: assetId,
      processId: link.processId ?? null,
      positionId: link.positionId ?? null,
      documentId: link.documentId ?? null,
      riskOpportunityItemId: link.riskOpportunityItemId ?? null,
    })),
  );
}

async function listKnowledgeAssetLinkDetails(assetIds: number[]) {
  const uniqueAssetIds = [...new Set(assetIds)];
  if (uniqueAssetIds.length === 0) {
    return new Map<number, KnowledgeAssetLinkDetail[]>();
  }

  const linkRows = await db
    .select()
    .from(knowledgeAssetLinksTable)
    .where(inArray(knowledgeAssetLinksTable.knowledgeAssetId, uniqueAssetIds))
    .orderBy(asc(knowledgeAssetLinksTable.id));

  const processIds = linkRows
    .map((row) => row.processId)
    .filter((value): value is number => value != null);
  const positionIds = linkRows
    .map((row) => row.positionId)
    .filter((value): value is number => value != null);
  const documentIds = linkRows
    .map((row) => row.documentId)
    .filter((value): value is number => value != null);
  const riskItemIds = linkRows
    .map((row) => row.riskOpportunityItemId)
    .filter((value): value is number => value != null);

  const [processes, positions, documents, riskItems] = await Promise.all([
    processIds.length > 0
      ? db
          .select({ id: sgqProcessesTable.id, name: sgqProcessesTable.name })
          .from(sgqProcessesTable)
          .where(inArray(sgqProcessesTable.id, [...new Set(processIds)]))
      : Promise.resolve([]),
    positionIds.length > 0
      ? db
          .select({ id: positionsTable.id, name: positionsTable.name })
          .from(positionsTable)
          .where(inArray(positionsTable.id, [...new Set(positionIds)]))
      : Promise.resolve([]),
    documentIds.length > 0
      ? db
          .select({ id: documentsTable.id, title: documentsTable.title })
          .from(documentsTable)
          .where(inArray(documentsTable.id, [...new Set(documentIds)]))
      : Promise.resolve([]),
    riskItemIds.length > 0
      ? db
          .select({
            id: strategicPlanRiskOpportunityItemsTable.id,
            description: strategicPlanRiskOpportunityItemsTable.description,
            type: strategicPlanRiskOpportunityItemsTable.type,
            planTitle: strategicPlansTable.title,
          })
          .from(strategicPlanRiskOpportunityItemsTable)
          .innerJoin(
            strategicPlansTable,
            eq(strategicPlanRiskOpportunityItemsTable.planId, strategicPlansTable.id),
          )
          .where(
            inArray(
              strategicPlanRiskOpportunityItemsTable.id,
              [...new Set(riskItemIds)],
            ),
          )
      : Promise.resolve([]),
  ]);

  const processMap = new Map(processes.map((item) => [item.id, item.name]));
  const positionMap = new Map(positions.map((item) => [item.id, item.name]));
  const documentMap = new Map(documents.map((item) => [item.id, item.title]));
  const riskItemMap = new Map(
    riskItems.map((item) => [
      item.id,
      {
        label: `${item.type === "opportunity" ? "Oportunidade" : "Risco"} · ${item.description}`,
        planTitle: item.planTitle,
      },
    ]),
  );

  const grouped = new Map<number, KnowledgeAssetLinkDetail[]>();
  for (const row of linkRows) {
    const current = grouped.get(row.knowledgeAssetId) ?? [];
    const riskItem = row.riskOpportunityItemId
      ? riskItemMap.get(row.riskOpportunityItemId) ?? null
      : null;
    current.push({
      id: row.id,
      processId: row.processId ?? null,
      processName: row.processId ? processMap.get(row.processId) ?? null : null,
      positionId: row.positionId ?? null,
      positionName: row.positionId ? positionMap.get(row.positionId) ?? null : null,
      documentId: row.documentId ?? null,
      documentTitle: row.documentId ? documentMap.get(row.documentId) ?? null : null,
      riskOpportunityItemId: row.riskOpportunityItemId ?? null,
      riskOpportunityItemLabel: riskItem?.label ?? null,
      riskOpportunityPlanTitle: riskItem?.planTitle ?? null,
    });
    grouped.set(row.knowledgeAssetId, current);
  }

  return grouped;
}

async function getKnowledgeAssetRecord(assetId: number, orgId: number) {
  const [asset] = await db
    .select()
    .from(knowledgeAssetsTable)
    .where(and(eq(knowledgeAssetsTable.id, assetId), eq(knowledgeAssetsTable.organizationId, orgId)));
  return asset ?? null;
}

async function getKnowledgeAssetDetail(assetId: number, orgId: number) {
  const [asset] = await db
    .select({
      id: knowledgeAssetsTable.id,
      organizationId: knowledgeAssetsTable.organizationId,
      title: knowledgeAssetsTable.title,
      description: knowledgeAssetsTable.description,
      lossRiskLevel: knowledgeAssetsTable.lossRiskLevel,
      retentionMethod: knowledgeAssetsTable.retentionMethod,
      successionPlan: knowledgeAssetsTable.successionPlan,
      evidenceAttachments: knowledgeAssetsTable.evidenceAttachments,
      evidenceValidUntil: knowledgeAssetsTable.evidenceValidUntil,
      createdById: knowledgeAssetsTable.createdById,
      updatedById: knowledgeAssetsTable.updatedById,
      createdAt: knowledgeAssetsTable.createdAt,
      updatedAt: knowledgeAssetsTable.updatedAt,
    })
    .from(knowledgeAssetsTable)
    .where(and(eq(knowledgeAssetsTable.id, assetId), eq(knowledgeAssetsTable.organizationId, orgId)));

  if (!asset) return null;

  const userIds = [...new Set([asset.createdById, asset.updatedById])];
  const [linksByAsset, users] = await Promise.all([
    listKnowledgeAssetLinkDetails([asset.id]),
    db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds)),
  ]);
  const userMap = new Map(users.map((user) => [user.id, user.name]));
  const evidenceAttachments = normalizeAttachments(asset.evidenceAttachments);
  const evidenceValidUntil = normalizeDateOnlyValue(asset.evidenceValidUntil);

  return {
    ...asset,
    createdByName: userMap.get(asset.createdById) ?? null,
    updatedByName: userMap.get(asset.updatedById) ?? null,
    createdAt: isoDateTime(asset.createdAt),
    updatedAt: isoDateTime(asset.updatedAt),
    evidenceAttachments,
    evidenceValidUntil,
    evidenceStatus: computeKnowledgeAssetEvidenceStatus(
      evidenceAttachments,
      evidenceValidUntil,
    ),
    links: linksByAsset.get(asset.id) ?? [],
  };
}

async function getProcessRecord(processId: number, orgId: number) {
  const [process] = await db
    .select()
    .from(sgqProcessesTable)
    .where(and(eq(sgqProcessesTable.id, processId), eq(sgqProcessesTable.organizationId, orgId)));
  return process ?? null;
}

async function getProcessComparisonState(
  processId: number,
  orgId: number,
): Promise<ProcessSnapshotState | null> {
  const process = await getProcessRecord(processId, orgId);
  if (!process) return null;

  const interactions = await db
    .select({
      relatedProcessId: sgqProcessInteractionsTable.relatedProcessId,
      direction: sgqProcessInteractionsTable.direction,
      notes: sgqProcessInteractionsTable.notes,
    })
    .from(sgqProcessInteractionsTable)
    .where(eq(sgqProcessInteractionsTable.processId, processId));

  return {
    name: process.name,
    objective: process.objective,
    ownerUserId: process.ownerUserId ?? null,
    inputs: process.inputs ?? [],
    outputs: process.outputs ?? [],
    criteria: process.criteria ?? null,
    indicators: process.indicators ?? null,
    status: process.status,
    attachments: normalizeAttachments(process.attachments),
    interactions: normalizeProcessInteractionsForComparison(interactions),
  };
}

async function syncProcessInteractions(
  tx: MutationTx,
  orgId: number,
  processId: number,
  interactions: Array<{
    relatedProcessId: number;
    direction: "upstream" | "downstream";
    notes?: string | null;
  }>,
) {
  const uniqueKey = new Set<string>();
  for (const interaction of interactions) {
    if (interaction.relatedProcessId === processId) {
      throw new Error("SELF_PROCESS_INTERACTION");
    }
    const key = `${interaction.relatedProcessId}:${interaction.direction}`;
    if (uniqueKey.has(key)) {
      throw new Error("DUPLICATE_PROCESS_INTERACTION");
    }
    uniqueKey.add(key);
  }

  if (!(await validateOrgProcesses(interactions.map((item) => item.relatedProcessId), orgId))) {
    throw new Error("INVALID_PROCESS_INTERACTION_REFERENCE");
  }

  await tx
    .delete(sgqProcessInteractionsTable)
    .where(eq(sgqProcessInteractionsTable.processId, processId));

  if (interactions.length > 0) {
    await tx.insert(sgqProcessInteractionsTable).values(
      interactions.map((interaction) => ({
        processId,
        relatedProcessId: interaction.relatedProcessId,
        direction: interaction.direction,
        notes: interaction.notes ?? null,
      })),
    );
  }
}

async function createProcessRevision(
  tx: MutationTx,
  processId: number,
  approvedById: number,
  changeSummary?: string | null,
) {
  const [process] = await tx
    .select()
    .from(sgqProcessesTable)
    .where(eq(sgqProcessesTable.id, processId));
  if (!process) return;

  const interactions = await tx
    .select({
      relatedProcessId: sgqProcessInteractionsTable.relatedProcessId,
      direction: sgqProcessInteractionsTable.direction,
      notes: sgqProcessInteractionsTable.notes,
    })
    .from(sgqProcessInteractionsTable)
    .where(eq(sgqProcessInteractionsTable.processId, processId))
    .orderBy(asc(sgqProcessInteractionsTable.id));

  await tx.insert(sgqProcessRevisionsTable).values({
    processId,
    revisionNumber: process.currentRevisionNumber,
    changeSummary: changeSummary ?? null,
    approvedById,
    snapshot: {
      name: process.name,
      objective: process.objective,
      ownerUserId: process.ownerUserId ?? null,
      inputs: process.inputs ?? [],
      outputs: process.outputs ?? [],
      criteria: process.criteria ?? null,
      indicators: process.indicators ?? null,
      status: process.status,
      attachments: normalizeAttachments(process.attachments),
      interactions: interactions.map((interaction) => ({
        relatedProcessId: interaction.relatedProcessId,
        direction: interaction.direction,
        notes: interaction.notes ?? null,
      })),
    },
  });
}

async function getProcessDetail(processId: number, orgId: number) {
  const [process] = await db
    .select({
      id: sgqProcessesTable.id,
      organizationId: sgqProcessesTable.organizationId,
      name: sgqProcessesTable.name,
      objective: sgqProcessesTable.objective,
      ownerUserId: sgqProcessesTable.ownerUserId,
      ownerName: usersTable.name,
      inputs: sgqProcessesTable.inputs,
      outputs: sgqProcessesTable.outputs,
      criteria: sgqProcessesTable.criteria,
      indicators: sgqProcessesTable.indicators,
      status: sgqProcessesTable.status,
      currentRevisionNumber: sgqProcessesTable.currentRevisionNumber,
      attachments: sgqProcessesTable.attachments,
      createdById: sgqProcessesTable.createdById,
      updatedById: sgqProcessesTable.updatedById,
      createdAt: sgqProcessesTable.createdAt,
      updatedAt: sgqProcessesTable.updatedAt,
    })
    .from(sgqProcessesTable)
    .leftJoin(usersTable, eq(sgqProcessesTable.ownerUserId, usersTable.id))
    .where(and(eq(sgqProcessesTable.id, processId), eq(sgqProcessesTable.organizationId, orgId)));

  if (!process) return null;

  const [interactions, revisions] = await Promise.all([
    db
      .select({
        id: sgqProcessInteractionsTable.id,
        relatedProcessId: sgqProcessInteractionsTable.relatedProcessId,
        relatedProcessName: sgqProcessesTable.name,
        direction: sgqProcessInteractionsTable.direction,
        notes: sgqProcessInteractionsTable.notes,
        createdAt: sgqProcessInteractionsTable.createdAt,
      })
      .from(sgqProcessInteractionsTable)
      .innerJoin(
        sgqProcessesTable,
        eq(sgqProcessInteractionsTable.relatedProcessId, sgqProcessesTable.id),
      )
      .where(eq(sgqProcessInteractionsTable.processId, processId))
      .orderBy(asc(sgqProcessInteractionsTable.id)),
    db
      .select({
        id: sgqProcessRevisionsTable.id,
        revisionNumber: sgqProcessRevisionsTable.revisionNumber,
        changeSummary: sgqProcessRevisionsTable.changeSummary,
        approvedById: sgqProcessRevisionsTable.approvedById,
        approvedByName: usersTable.name,
        snapshot: sgqProcessRevisionsTable.snapshot,
        createdAt: sgqProcessRevisionsTable.createdAt,
      })
      .from(sgqProcessRevisionsTable)
      .leftJoin(usersTable, eq(sgqProcessRevisionsTable.approvedById, usersTable.id))
      .where(eq(sgqProcessRevisionsTable.processId, processId))
      .orderBy(desc(sgqProcessRevisionsTable.revisionNumber)),
  ]);

  return {
    ...process,
    attachments: normalizeAttachments(process.attachments),
    createdAt: isoDateTime(process.createdAt),
    updatedAt: isoDateTime(process.updatedAt),
    interactions: interactions.map((interaction) => ({
      ...interaction,
      createdAt: isoDateTime(interaction.createdAt),
    })),
    revisions: revisions.map((revision) => ({
      ...revision,
      createdAt: isoDateTime(revision.createdAt),
    })),
  };
}

async function getAuditRecord(auditId: number, orgId: number) {
  const [audit] = await db
    .select()
    .from(internalAuditsTable)
    .where(and(eq(internalAuditsTable.id, auditId), eq(internalAuditsTable.organizationId, orgId)));
  return audit ?? null;
}

async function getAuditDetail(auditId: number, orgId: number) {
  const [audit] = await db
    .select({
      id: internalAuditsTable.id,
      organizationId: internalAuditsTable.organizationId,
      title: internalAuditsTable.title,
      scope: internalAuditsTable.scope,
      criteria: internalAuditsTable.criteria,
      periodStart: internalAuditsTable.periodStart,
      periodEnd: internalAuditsTable.periodEnd,
      auditorUserId: internalAuditsTable.auditorUserId,
      auditorName: usersTable.name,
      originType: internalAuditsTable.originType,
      status: internalAuditsTable.status,
      attachments: internalAuditsTable.attachments,
      createdAt: internalAuditsTable.createdAt,
      updatedAt: internalAuditsTable.updatedAt,
    })
    .from(internalAuditsTable)
    .leftJoin(usersTable, eq(internalAuditsTable.auditorUserId, usersTable.id))
    .where(and(eq(internalAuditsTable.id, auditId), eq(internalAuditsTable.organizationId, orgId)));

  if (!audit) return null;

  const [checklistItems, findings] = await Promise.all([
    db
      .select()
      .from(internalAuditChecklistItemsTable)
      .where(eq(internalAuditChecklistItemsTable.auditId, auditId))
      .orderBy(asc(internalAuditChecklistItemsTable.sortOrder), asc(internalAuditChecklistItemsTable.id)),
    db
      .select({
        id: internalAuditFindingsTable.id,
        processId: internalAuditFindingsTable.processId,
        processName: sgqProcessesTable.name,
        requirementRef: internalAuditFindingsTable.requirementRef,
        classification: internalAuditFindingsTable.classification,
        description: internalAuditFindingsTable.description,
        responsibleUserId: internalAuditFindingsTable.responsibleUserId,
        responsibleUserName: usersTable.name,
        dueDate: internalAuditFindingsTable.dueDate,
        attachments: internalAuditFindingsTable.attachments,
        correctiveActionId: internalAuditFindingsTable.correctiveActionId,
        createdAt: internalAuditFindingsTable.createdAt,
        updatedAt: internalAuditFindingsTable.updatedAt,
      })
      .from(internalAuditFindingsTable)
      .leftJoin(sgqProcessesTable, eq(internalAuditFindingsTable.processId, sgqProcessesTable.id))
      .leftJoin(usersTable, eq(internalAuditFindingsTable.responsibleUserId, usersTable.id))
      .where(eq(internalAuditFindingsTable.auditId, auditId))
      .orderBy(desc(internalAuditFindingsTable.createdAt)),
  ]);

  return {
    ...audit,
    attachments: normalizeAttachments(audit.attachments),
    checklistItems: checklistItems.map((item) => ({
      ...item,
      createdAt: isoDateTime(item.createdAt),
      updatedAt: isoDateTime(item.updatedAt),
    })),
    findings: findings.map((finding) => ({
      ...finding,
      attachments: normalizeAttachments(finding.attachments),
      createdAt: isoDateTime(finding.createdAt),
      updatedAt: isoDateTime(finding.updatedAt),
    })),
    createdAt: isoDateTime(audit.createdAt),
    updatedAt: isoDateTime(audit.updatedAt),
  };
}

async function getNonconformityRecord(ncId: number, orgId: number) {
  const [nc] = await db
    .select()
    .from(nonconformitiesTable)
    .where(and(eq(nonconformitiesTable.id, ncId), eq(nonconformitiesTable.organizationId, orgId)));
  return nc ?? null;
}

async function recomputeNonconformityStatus(
  ncId: number,
  orgId: number,
  updatedById: number,
) {
  const nc = await getNonconformityRecord(ncId, orgId);
  if (!nc || nc.status === "closed" || nc.status === "canceled") return;

  const [actionStatusSummary] = await db
    .select({
      total: count(),
      done: count(sql<number>`case when ${correctiveActionsTable.status} = 'done' then 1 end`),
    })
    .from(correctiveActionsTable)
    .where(eq(correctiveActionsTable.nonconformityId, ncId));

  const total = actionStatusSummary?.total ?? 0;
  const done = actionStatusSummary?.done ?? 0;
  if (total === 0) return;

  const nextStatus = done === total ? "awaiting_effectiveness" : "action_in_progress";
  if (nc.status === nextStatus) return;

  await db
    .update(nonconformitiesTable)
    .set({
      status: nextStatus,
      updatedById,
      closedAt: null,
    })
    .where(eq(nonconformitiesTable.id, ncId));
}

async function getNonconformityDetail(ncId: number, orgId: number) {
  const [nc] = await db
    .select({
      id: nonconformitiesTable.id,
      organizationId: nonconformitiesTable.organizationId,
      originType: nonconformitiesTable.originType,
      title: nonconformitiesTable.title,
      description: nonconformitiesTable.description,
      classification: nonconformitiesTable.classification,
      rootCause: nonconformitiesTable.rootCause,
      responsibleUserId: nonconformitiesTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      processId: nonconformitiesTable.processId,
      processName: sgqProcessesTable.name,
      documentId: nonconformitiesTable.documentId,
      auditFindingId: nonconformitiesTable.auditFindingId,
      riskOpportunityItemId: nonconformitiesTable.riskOpportunityItemId,
      status: nonconformitiesTable.status,
      effectivenessResult: nonconformitiesTable.effectivenessResult,
      effectivenessComment: nonconformitiesTable.effectivenessComment,
      effectivenessCheckedAt: nonconformitiesTable.effectivenessCheckedAt,
      closedAt: nonconformitiesTable.closedAt,
      attachments: nonconformitiesTable.attachments,
      createdAt: nonconformitiesTable.createdAt,
      updatedAt: nonconformitiesTable.updatedAt,
    })
    .from(nonconformitiesTable)
    .leftJoin(usersTable, eq(nonconformitiesTable.responsibleUserId, usersTable.id))
    .leftJoin(sgqProcessesTable, eq(nonconformitiesTable.processId, sgqProcessesTable.id))
    .where(and(eq(nonconformitiesTable.id, ncId), eq(nonconformitiesTable.organizationId, orgId)));

  if (!nc) return null;

  const correctiveActions = await db
    .select({
      id: correctiveActionsTable.id,
      title: correctiveActionsTable.title,
      description: correctiveActionsTable.description,
      responsibleUserId: correctiveActionsTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      dueDate: correctiveActionsTable.dueDate,
      status: correctiveActionsTable.status,
      executionNotes: correctiveActionsTable.executionNotes,
      attachments: correctiveActionsTable.attachments,
      createdAt: correctiveActionsTable.createdAt,
      updatedAt: correctiveActionsTable.updatedAt,
    })
    .from(correctiveActionsTable)
    .leftJoin(usersTable, eq(correctiveActionsTable.responsibleUserId, usersTable.id))
    .where(eq(correctiveActionsTable.nonconformityId, ncId))
    .orderBy(desc(correctiveActionsTable.createdAt));

  return {
    ...nc,
    attachments: normalizeAttachments(nc.attachments),
    correctiveActions: correctiveActions.map((action) => ({
      ...action,
      attachments: normalizeAttachments(action.attachments),
      createdAt: isoDateTime(action.createdAt),
      updatedAt: isoDateTime(action.updatedAt),
    })),
    createdAt: isoDateTime(nc.createdAt),
    updatedAt: isoDateTime(nc.updatedAt),
    effectivenessCheckedAt: isoDateTime(nc.effectivenessCheckedAt),
    closedAt: isoDateTime(nc.closedAt),
  };
}

async function getManagementReviewRecord(reviewId: number, orgId: number) {
  const [review] = await db
    .select()
    .from(managementReviewsTable)
    .where(and(eq(managementReviewsTable.id, reviewId), eq(managementReviewsTable.organizationId, orgId)));
  return review ?? null;
}

async function getManagementReviewDetail(reviewId: number, orgId: number) {
  const [review] = await db
    .select({
      id: managementReviewsTable.id,
      organizationId: managementReviewsTable.organizationId,
      title: managementReviewsTable.title,
      reviewDate: managementReviewsTable.reviewDate,
      chairUserId: managementReviewsTable.chairUserId,
      chairUserName: usersTable.name,
      minutes: managementReviewsTable.minutes,
      status: managementReviewsTable.status,
      attachments: managementReviewsTable.attachments,
      createdAt: managementReviewsTable.createdAt,
      updatedAt: managementReviewsTable.updatedAt,
    })
    .from(managementReviewsTable)
    .leftJoin(usersTable, eq(managementReviewsTable.chairUserId, usersTable.id))
    .where(and(eq(managementReviewsTable.id, reviewId), eq(managementReviewsTable.organizationId, orgId)));

  if (!review) return null;

  const [inputs, outputs] = await Promise.all([
    db
      .select()
      .from(managementReviewInputsTable)
      .where(eq(managementReviewInputsTable.reviewId, reviewId))
      .orderBy(asc(managementReviewInputsTable.sortOrder), asc(managementReviewInputsTable.id)),
    db
      .select({
        id: managementReviewOutputsTable.id,
        outputType: managementReviewOutputsTable.outputType,
        description: managementReviewOutputsTable.description,
        responsibleUserId: managementReviewOutputsTable.responsibleUserId,
        responsibleUserName: usersTable.name,
        dueDate: managementReviewOutputsTable.dueDate,
        processId: managementReviewOutputsTable.processId,
        nonconformityId: managementReviewOutputsTable.nonconformityId,
        status: managementReviewOutputsTable.status,
        createdAt: managementReviewOutputsTable.createdAt,
        updatedAt: managementReviewOutputsTable.updatedAt,
      })
      .from(managementReviewOutputsTable)
      .leftJoin(usersTable, eq(managementReviewOutputsTable.responsibleUserId, usersTable.id))
      .where(eq(managementReviewOutputsTable.reviewId, reviewId))
      .orderBy(desc(managementReviewOutputsTable.createdAt)),
  ]);

  return {
    ...review,
    attachments: normalizeAttachments(review.attachments),
    inputs: inputs.map((input) => ({
      ...input,
      createdAt: isoDateTime(input.createdAt),
      updatedAt: isoDateTime(input.updatedAt),
    })),
    outputs: outputs.map((output) => ({
      ...output,
      createdAt: isoDateTime(output.createdAt),
      updatedAt: isoDateTime(output.updatedAt),
    })),
    createdAt: isoDateTime(review.createdAt),
    updatedAt: isoDateTime(review.updatedAt),
  };
}

async function assertManagementReviewCanComplete(reviewId: number) {
  const [inputCount, outputCount] = await Promise.all([
    db
      .select({ total: count() })
      .from(managementReviewInputsTable)
      .where(eq(managementReviewInputsTable.reviewId, reviewId)),
    db
      .select({ total: count() })
      .from(managementReviewOutputsTable)
      .where(eq(managementReviewOutputsTable.reviewId, reviewId)),
  ]);

  return (inputCount[0]?.total ?? 0) > 0 && (outputCount[0]?.total ?? 0) > 0;
}

async function assertAuditCanComplete(auditId: number) {
  const [totalChecklist, openChecklist] = await Promise.all([
    db
      .select({ total: count() })
      .from(internalAuditChecklistItemsTable)
      .where(eq(internalAuditChecklistItemsTable.auditId, auditId)),
    db
      .select({ total: count() })
      .from(internalAuditChecklistItemsTable)
      .where(
        and(
          eq(internalAuditChecklistItemsTable.auditId, auditId),
          eq(internalAuditChecklistItemsTable.result, "not_evaluated"),
        ),
      ),
  ]);

  return (totalChecklist[0]?.total ?? 0) > 0 && (openChecklist[0]?.total ?? 0) === 0;
}

function parseOrReject<T extends z.ZodTypeAny>(
  schema: T,
  payload: unknown,
  res: Response,
) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return null;
  }
  return parsed.data;
}

router.get("/organizations/:orgId/governance/knowledge-assets", async (req, res): Promise<void> => {
  const params = parseOrReject(orgParamsSchema, req.params, res);
  if (!params) return;
  if (params.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const query = parseOrReject(listKnowledgeAssetsQuerySchema, req.query, res);
  if (!query) return;

  if (query.processId && !(await validateOrgProcesses([query.processId], params.orgId))) {
    res.status(400).json({ error: "Processo SGQ inválido" });
    return;
  }
  if (query.positionId && !(await validateOrgPositions([query.positionId], params.orgId))) {
    res.status(400).json({ error: "Cargo inválido" });
    return;
  }
  if (query.documentId && !(await validateOrgDocuments([query.documentId], params.orgId))) {
    res.status(400).json({ error: "Documento inválido" });
    return;
  }
  if (
    query.riskOpportunityItemId &&
    !(await validateOrgRiskItems([query.riskOpportunityItemId], params.orgId))
  ) {
    res.status(400).json({ error: "Risco/Oportunidade inválido" });
    return;
  }

  const assetIdFilters: number[][] = [];

  if (query.processId) {
    const rows = await db
      .select({ knowledgeAssetId: knowledgeAssetLinksTable.knowledgeAssetId })
      .from(knowledgeAssetLinksTable)
      .where(eq(knowledgeAssetLinksTable.processId, query.processId));
    assetIdFilters.push(rows.map((row) => row.knowledgeAssetId));
  }
  if (query.positionId) {
    const rows = await db
      .select({ knowledgeAssetId: knowledgeAssetLinksTable.knowledgeAssetId })
      .from(knowledgeAssetLinksTable)
      .where(eq(knowledgeAssetLinksTable.positionId, query.positionId));
    assetIdFilters.push(rows.map((row) => row.knowledgeAssetId));
  }
  if (query.documentId) {
    const rows = await db
      .select({ knowledgeAssetId: knowledgeAssetLinksTable.knowledgeAssetId })
      .from(knowledgeAssetLinksTable)
      .where(eq(knowledgeAssetLinksTable.documentId, query.documentId));
    assetIdFilters.push(rows.map((row) => row.knowledgeAssetId));
  }
  if (query.riskOpportunityItemId) {
    const rows = await db
      .select({ knowledgeAssetId: knowledgeAssetLinksTable.knowledgeAssetId })
      .from(knowledgeAssetLinksTable)
      .where(eq(knowledgeAssetLinksTable.riskOpportunityItemId, query.riskOpportunityItemId));
    assetIdFilters.push(rows.map((row) => row.knowledgeAssetId));
  }

  if (assetIdFilters.some((item) => item.length === 0)) {
    res.json({
      data: [],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 0,
      },
    });
    return;
  }

  const intersectedAssetIds =
    assetIdFilters.length === 0
      ? null
      : assetIdFilters.reduce<number[]>((accumulator, current) => {
          if (accumulator.length === 0) return [...new Set(current)];
          const currentSet = new Set(current);
          return accumulator.filter((id) => currentSet.has(id));
        }, []);

  if (intersectedAssetIds && intersectedAssetIds.length === 0) {
    res.json({
      data: [],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 0,
      },
    });
    return;
  }

  const conditions = [eq(knowledgeAssetsTable.organizationId, params.orgId)];
  if (query.search) {
    const pattern = buildContainsPattern(query.search);
    conditions.push(
      or(
        ilike(knowledgeAssetsTable.title, pattern),
        ilike(knowledgeAssetsTable.description, pattern),
      )!,
    );
  }
  if (query.lossRiskLevel) {
    conditions.push(eq(knowledgeAssetsTable.lossRiskLevel, query.lossRiskLevel));
  }
  if (intersectedAssetIds) {
    conditions.push(inArray(knowledgeAssetsTable.id, intersectedAssetIds));
  }
  if (query.evidenceStatus === "missing") {
    conditions.push(sql`${knowledgeAssetsTable.evidenceAttachments} = '[]'::jsonb`);
  } else if (query.evidenceStatus === "expired") {
    conditions.push(sql`${knowledgeAssetsTable.evidenceAttachments} <> '[]'::jsonb`);
    conditions.push(sql`${knowledgeAssetsTable.evidenceValidUntil} < CURRENT_DATE`);
  } else if (query.evidenceStatus === "valid") {
    conditions.push(sql`${knowledgeAssetsTable.evidenceAttachments} <> '[]'::jsonb`);
    conditions.push(
      sql`(${knowledgeAssetsTable.evidenceValidUntil} IS NULL OR ${knowledgeAssetsTable.evidenceValidUntil} >= CURRENT_DATE)`,
    );
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.pageSize;

  const [totalResult] = await db
    .select({ total: count() })
    .from(knowledgeAssetsTable)
    .where(whereClause);

  const rows = await db
    .select({
      id: knowledgeAssetsTable.id,
      organizationId: knowledgeAssetsTable.organizationId,
      title: knowledgeAssetsTable.title,
      description: knowledgeAssetsTable.description,
      lossRiskLevel: knowledgeAssetsTable.lossRiskLevel,
      retentionMethod: knowledgeAssetsTable.retentionMethod,
      successionPlan: knowledgeAssetsTable.successionPlan,
      evidenceAttachments: knowledgeAssetsTable.evidenceAttachments,
      evidenceValidUntil: knowledgeAssetsTable.evidenceValidUntil,
      createdAt: knowledgeAssetsTable.createdAt,
      updatedAt: knowledgeAssetsTable.updatedAt,
    })
    .from(knowledgeAssetsTable)
    .where(whereClause)
    .orderBy(desc(knowledgeAssetsTable.updatedAt), desc(knowledgeAssetsTable.id))
    .limit(query.pageSize)
    .offset(offset);

  const linksByAsset = await listKnowledgeAssetLinkDetails(rows.map((row) => row.id));

  res.json({
    data: rows.map((row) => {
      const evidenceAttachments = normalizeAttachments(row.evidenceAttachments);
      const evidenceValidUntil = normalizeDateOnlyValue(row.evidenceValidUntil);
      return {
        ...row,
        createdAt: isoDateTime(row.createdAt),
        updatedAt: isoDateTime(row.updatedAt),
        evidenceAttachments,
        evidenceValidUntil,
        evidenceStatus: computeKnowledgeAssetEvidenceStatus(
          evidenceAttachments,
          evidenceValidUntil,
        ),
        links: linksByAsset.get(row.id) ?? [],
      };
    }),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: totalResult.total,
      totalPages: Math.ceil(totalResult.total / query.pageSize),
    },
  });
});

router.post(
  "/organizations/:orgId/governance/knowledge-assets",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(knowledgeAssetCreateBodySchema, req.body, res);
    if (!body) return;

    try {
      await validateKnowledgeAssetLinks(body.links, params.orgId);

      const [asset] = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(knowledgeAssetsTable)
          .values({
            organizationId: params.orgId,
            title: body.title.trim(),
            description: normalizeNullableText(body.description),
            lossRiskLevel: body.lossRiskLevel,
            retentionMethod: normalizeNullableText(body.retentionMethod),
            successionPlan: normalizeNullableText(body.successionPlan),
            evidenceAttachments: body.evidenceAttachments,
            evidenceValidUntil: normalizeDate(body.evidenceValidUntil),
            createdById: req.auth!.userId,
            updatedById: req.auth!.userId,
          })
          .returning();

        await syncKnowledgeAssetLinks(tx, created.id, body.links);
        return [created] as const;
      });

      res.status(201).json(await getKnowledgeAssetDetail(asset.id, params.orgId));
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "INVALID_KNOWLEDGE_ASSET_PROCESS") {
          res.status(400).json({ error: "Processo SGQ inválido" });
          return;
        }
        if (error.message === "INVALID_KNOWLEDGE_ASSET_POSITION") {
          res.status(400).json({ error: "Cargo inválido" });
          return;
        }
        if (error.message === "INVALID_KNOWLEDGE_ASSET_DOCUMENT") {
          res.status(400).json({ error: "Documento inválido" });
          return;
        }
        if (error.message === "INVALID_KNOWLEDGE_ASSET_RISK_ITEM") {
          res.status(400).json({ error: "Risco/Oportunidade inválido" });
          return;
        }
      }
      throw error;
    }
  },
);

router.get(
  "/organizations/:orgId/governance/knowledge-assets/:assetId",
  async (req, res): Promise<void> => {
    const params = parseOrReject(knowledgeAssetParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const detail = await getKnowledgeAssetDetail(params.assetId, params.orgId);
    if (!detail) {
      res.status(404).json({ error: "Conhecimento crítico não encontrado" });
      return;
    }

    res.json(detail);
  },
);

router.patch(
  "/organizations/:orgId/governance/knowledge-assets/:assetId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(knowledgeAssetParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(knowledgeAssetUpdateBodySchema, req.body, res);
    if (!body) return;

    const asset = await getKnowledgeAssetRecord(params.assetId, params.orgId);
    if (!asset) {
      res.status(404).json({ error: "Conhecimento crítico não encontrado" });
      return;
    }

    try {
      if (body.links) {
        await validateKnowledgeAssetLinks(body.links, params.orgId);
      }

      const updateData: KnowledgeAssetUpdateValues = {
        updatedById: req.auth!.userId,
      };
      if (body.title !== undefined) updateData.title = body.title.trim();
      if (body.description !== undefined) {
        updateData.description = normalizeNullableText(body.description);
      }
      if (body.lossRiskLevel !== undefined) {
        updateData.lossRiskLevel = body.lossRiskLevel;
      }
      if (body.retentionMethod !== undefined) {
        updateData.retentionMethod = normalizeNullableText(body.retentionMethod);
      }
      if (body.successionPlan !== undefined) {
        updateData.successionPlan = normalizeNullableText(body.successionPlan);
      }
      if (body.evidenceAttachments !== undefined) {
        updateData.evidenceAttachments = body.evidenceAttachments;
      }
      if (body.evidenceValidUntil !== undefined) {
        updateData.evidenceValidUntil = normalizeDate(body.evidenceValidUntil);
      }

      await db.transaction(async (tx) => {
        await tx
          .update(knowledgeAssetsTable)
          .set(updateData)
          .where(eq(knowledgeAssetsTable.id, params.assetId));

        if (body.links) {
          await syncKnowledgeAssetLinks(tx, params.assetId, body.links);
        }
      });

      res.json(await getKnowledgeAssetDetail(params.assetId, params.orgId));
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "INVALID_KNOWLEDGE_ASSET_PROCESS") {
          res.status(400).json({ error: "Processo SGQ inválido" });
          return;
        }
        if (error.message === "INVALID_KNOWLEDGE_ASSET_POSITION") {
          res.status(400).json({ error: "Cargo inválido" });
          return;
        }
        if (error.message === "INVALID_KNOWLEDGE_ASSET_DOCUMENT") {
          res.status(400).json({ error: "Documento inválido" });
          return;
        }
        if (error.message === "INVALID_KNOWLEDGE_ASSET_RISK_ITEM") {
          res.status(400).json({ error: "Risco/Oportunidade inválido" });
          return;
        }
      }
      throw error;
    }
  },
);

router.delete(
  "/organizations/:orgId/governance/knowledge-assets/:assetId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(knowledgeAssetParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const asset = await getKnowledgeAssetRecord(params.assetId, params.orgId);
    if (!asset) {
      res.status(404).json({ error: "Conhecimento crítico não encontrado" });
      return;
    }

    await db
      .delete(knowledgeAssetsTable)
      .where(eq(knowledgeAssetsTable.id, params.assetId));
    res.sendStatus(204);
  },
);

router.get("/organizations/:orgId/governance/sgq-processes", async (req, res): Promise<void> => {
  const params = parseOrReject(orgParamsSchema, req.params, res);
  if (!params) return;
  if (params.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const query = parseOrReject(listProcessesQuerySchema, req.query, res);
  if (!query) return;

  const conditions = [eq(sgqProcessesTable.organizationId, params.orgId)];
  if (query.status) conditions.push(eq(sgqProcessesTable.status, query.status));
  if (query.ownerUserId) conditions.push(eq(sgqProcessesTable.ownerUserId, query.ownerUserId));
  if (query.search) {
    const pattern = buildContainsPattern(query.search);
    conditions.push(
      or(
        ilike(sgqProcessesTable.name, pattern),
        ilike(sgqProcessesTable.objective, pattern),
      )!,
    );
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.pageSize;

  const [totalResult] = await db
    .select({ total: count() })
    .from(sgqProcessesTable)
    .where(whereClause);

  const rows = await db
    .select({
      id: sgqProcessesTable.id,
      organizationId: sgqProcessesTable.organizationId,
      name: sgqProcessesTable.name,
      objective: sgqProcessesTable.objective,
      ownerUserId: sgqProcessesTable.ownerUserId,
      ownerName: usersTable.name,
      status: sgqProcessesTable.status,
      currentRevisionNumber: sgqProcessesTable.currentRevisionNumber,
      createdAt: sgqProcessesTable.createdAt,
      updatedAt: sgqProcessesTable.updatedAt,
    })
    .from(sgqProcessesTable)
    .leftJoin(usersTable, eq(sgqProcessesTable.ownerUserId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(sgqProcessesTable.updatedAt))
    .limit(query.pageSize)
    .offset(offset);

  res.json({
    data: rows.map((row) => ({
      ...row,
      createdAt: isoDateTime(row.createdAt),
      updatedAt: isoDateTime(row.updatedAt),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: totalResult.total,
      totalPages: Math.ceil(totalResult.total / query.pageSize),
    },
  });
});

router.post(
  "/organizations/:orgId/governance/sgq-processes",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(processCreateBodySchema, req.body, res);
    if (!body) return;

    if (
      body.ownerUserId &&
      !(await validateOrgUsers([body.ownerUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável do processo inválido" });
      return;
    }

    try {
      const [created] = await db.transaction(async (tx) => {
        const [process] = await tx
          .insert(sgqProcessesTable)
          .values({
            organizationId: params.orgId,
            name: body.name,
            objective: body.objective,
            ownerUserId: body.ownerUserId ?? null,
            inputs: body.inputs,
            outputs: body.outputs,
            criteria: body.criteria ?? null,
            indicators: body.indicators ?? null,
            attachments: body.attachments,
            createdById: req.auth!.userId,
            updatedById: req.auth!.userId,
            currentRevisionNumber: 1,
          })
          .returning();

        await syncProcessInteractions(tx, params.orgId, process.id, body.interactions);
        await createProcessRevision(tx, process.id, req.auth!.userId, body.changeSummary);
        return [process] as const;
      });

      res.status(201).json(await getProcessDetail(created.id, params.orgId));
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "SELF_PROCESS_INTERACTION") {
          res.status(400).json({ error: "Um processo não pode se relacionar com ele mesmo" });
          return;
        }
        if (error.message === "DUPLICATE_PROCESS_INTERACTION") {
          res.status(400).json({ error: "Há interações duplicadas para o processo" });
          return;
        }
        if (error.message === "INVALID_PROCESS_INTERACTION_REFERENCE") {
          res.status(400).json({ error: "Uma ou mais interações referenciam processos inválidos" });
          return;
        }
      }
      throw error;
    }
  },
);

router.get("/organizations/:orgId/governance/sgq-processes/:processId", async (req, res): Promise<void> => {
  const params = parseOrReject(processParamsSchema, req.params, res);
  if (!params) return;
  if (params.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const detail = await getProcessDetail(params.processId, params.orgId);
  if (!detail) {
    res.status(404).json({ error: "Processo SGQ não encontrado" });
    return;
  }

  res.json(detail);
});

router.patch(
  "/organizations/:orgId/governance/sgq-processes/:processId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(processParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(processUpdateBodySchema, req.body, res);
    if (!body) return;

    const currentState = await getProcessComparisonState(params.processId, params.orgId);
    if (!currentState) {
      res.status(404).json({ error: "Processo SGQ não encontrado" });
      return;
    }

    if (
      body.ownerUserId &&
      !(await validateOrgUsers([body.ownerUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável do processo inválido" });
      return;
    }

    const nextState: ProcessSnapshotState = {
      name: body.name ?? currentState.name,
      objective: body.objective ?? currentState.objective,
      ownerUserId: body.ownerUserId !== undefined ? body.ownerUserId ?? null : currentState.ownerUserId,
      inputs: body.inputs ?? currentState.inputs,
      outputs: body.outputs ?? currentState.outputs,
      criteria:
        body.criteria !== undefined ? normalizeNullableText(body.criteria) : currentState.criteria,
      indicators:
        body.indicators !== undefined
          ? normalizeNullableText(body.indicators)
          : currentState.indicators,
      status: body.status ?? currentState.status,
      attachments:
        body.attachments !== undefined
          ? normalizeAttachments(body.attachments)
          : currentState.attachments,
      interactions:
        body.interactions !== undefined
          ? normalizeProcessInteractionsForComparison(body.interactions)
          : currentState.interactions,
    };

    if (processSnapshotsEqual(currentState, nextState)) {
      res.json(await getProcessDetail(params.processId, params.orgId));
      return;
    }

    try {
      await db.transaction(async (tx) => {
        const updateData: ProcessUpdateValues = {
          updatedById: req.auth!.userId,
        };

        if (body.name !== undefined) updateData.name = body.name;
        if (body.objective !== undefined) updateData.objective = body.objective;
        if (body.ownerUserId !== undefined) updateData.ownerUserId = body.ownerUserId ?? null;
        if (body.inputs !== undefined) updateData.inputs = body.inputs;
        if (body.outputs !== undefined) updateData.outputs = body.outputs;
        if (body.criteria !== undefined) updateData.criteria = body.criteria ?? null;
        if (body.indicators !== undefined) updateData.indicators = body.indicators ?? null;
        if (body.attachments !== undefined) updateData.attachments = body.attachments;
        if (body.status !== undefined) updateData.status = body.status;

        const [updatedProcess] = await tx
          .update(sgqProcessesTable)
          .set({
            ...updateData,
            currentRevisionNumber: sql`${sgqProcessesTable.currentRevisionNumber} + 1`,
          })
          .where(
            and(
              eq(sgqProcessesTable.id, params.processId),
              eq(sgqProcessesTable.organizationId, params.orgId),
            ),
          )
          .returning({ id: sgqProcessesTable.id });

        if (!updatedProcess) {
          throw new Error("PROCESS_NOT_FOUND");
        }

        if (body.interactions !== undefined) {
          await syncProcessInteractions(tx, params.orgId, params.processId, body.interactions);
        }

        await createProcessRevision(tx, params.processId, req.auth!.userId, body.changeSummary);
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "PROCESS_NOT_FOUND") {
          res.status(404).json({ error: "Processo SGQ não encontrado" });
          return;
        }
        if (error.message === "SELF_PROCESS_INTERACTION") {
          res.status(400).json({ error: "Um processo não pode se relacionar com ele mesmo" });
          return;
        }
        if (error.message === "DUPLICATE_PROCESS_INTERACTION") {
          res.status(400).json({ error: "Há interações duplicadas para o processo" });
          return;
        }
        if (error.message === "INVALID_PROCESS_INTERACTION_REFERENCE") {
          res.status(400).json({ error: "Uma ou mais interações referenciam processos inválidos" });
          return;
        }
      }
      throw error;
    }

    res.json(await getProcessDetail(params.processId, params.orgId));
  },
);

router.post(
  "/organizations/:orgId/governance/sgq-processes/:processId/inactivate",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(processParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const process = await getProcessRecord(params.processId, params.orgId);
    if (!process) {
      res.status(404).json({ error: "Processo SGQ não encontrado" });
      return;
    }

    await db.transaction(async (tx) => {
      const [updatedProcess] = await tx
        .update(sgqProcessesTable)
        .set({
          status: "inactive",
          currentRevisionNumber: sql`${sgqProcessesTable.currentRevisionNumber} + 1`,
          updatedById: req.auth!.userId,
        })
        .where(
          and(
            eq(sgqProcessesTable.id, params.processId),
            eq(sgqProcessesTable.organizationId, params.orgId),
          ),
        )
        .returning({ id: sgqProcessesTable.id });
      if (!updatedProcess) {
        throw new Error("PROCESS_NOT_FOUND");
      }
      await createProcessRevision(tx, params.processId, req.auth!.userId, "Processo inativado");
    });

    res.json(await getProcessDetail(params.processId, params.orgId));
  },
);

router.post(
  "/organizations/:orgId/governance/sgq-processes/:processId/reactivate",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(processParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const process = await getProcessRecord(params.processId, params.orgId);
    if (!process) {
      res.status(404).json({ error: "Processo SGQ não encontrado" });
      return;
    }

    await db.transaction(async (tx) => {
      const [updatedProcess] = await tx
        .update(sgqProcessesTable)
        .set({
          status: "active",
          currentRevisionNumber: sql`${sgqProcessesTable.currentRevisionNumber} + 1`,
          updatedById: req.auth!.userId,
        })
        .where(
          and(
            eq(sgqProcessesTable.id, params.processId),
            eq(sgqProcessesTable.organizationId, params.orgId),
          ),
        )
        .returning({ id: sgqProcessesTable.id });
      if (!updatedProcess) {
        throw new Error("PROCESS_NOT_FOUND");
      }
      await createProcessRevision(tx, params.processId, req.auth!.userId, "Processo reativado");
    });

    res.json(await getProcessDetail(params.processId, params.orgId));
  },
);

router.get(
  "/organizations/:orgId/governance/sgq-processes/:processId/revisions",
  async (req, res): Promise<void> => {
    const params = parseOrReject(processParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const process = await getProcessRecord(params.processId, params.orgId);
    if (!process) {
      res.status(404).json({ error: "Processo SGQ não encontrado" });
      return;
    }

    const revisions = await db
      .select({
        id: sgqProcessRevisionsTable.id,
        revisionNumber: sgqProcessRevisionsTable.revisionNumber,
        changeSummary: sgqProcessRevisionsTable.changeSummary,
        approvedById: sgqProcessRevisionsTable.approvedById,
        approvedByName: usersTable.name,
        snapshot: sgqProcessRevisionsTable.snapshot,
        createdAt: sgqProcessRevisionsTable.createdAt,
      })
      .from(sgqProcessRevisionsTable)
      .leftJoin(usersTable, eq(sgqProcessRevisionsTable.approvedById, usersTable.id))
      .where(eq(sgqProcessRevisionsTable.processId, params.processId))
      .orderBy(desc(sgqProcessRevisionsTable.revisionNumber));

    res.json(
      revisions.map((revision) => ({
        ...revision,
        createdAt: isoDateTime(revision.createdAt),
      })),
    );
  },
);

router.get("/organizations/:orgId/governance/internal-audits", async (req, res): Promise<void> => {
  const params = parseOrReject(orgParamsSchema, req.params, res);
  if (!params) return;
  if (params.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const query = parseOrReject(listAuditsQuerySchema, req.query, res);
  if (!query) return;

  const conditions = [eq(internalAuditsTable.organizationId, params.orgId)];
  if (query.status) conditions.push(eq(internalAuditsTable.status, query.status));
  if (query.auditorUserId) conditions.push(eq(internalAuditsTable.auditorUserId, query.auditorUserId));
  if (query.originType) conditions.push(eq(internalAuditsTable.originType, query.originType));
  if (query.search) {
    const pattern = buildContainsPattern(query.search);
    conditions.push(
      or(
        ilike(internalAuditsTable.title, pattern),
        ilike(internalAuditsTable.scope, pattern),
      )!,
    );
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.pageSize;

  const [totalResult] = await db
    .select({ total: count() })
    .from(internalAuditsTable)
    .where(whereClause);

  const rows = await db
    .select({
      id: internalAuditsTable.id,
      organizationId: internalAuditsTable.organizationId,
      title: internalAuditsTable.title,
      scope: internalAuditsTable.scope,
      criteria: internalAuditsTable.criteria,
      periodStart: internalAuditsTable.periodStart,
      periodEnd: internalAuditsTable.periodEnd,
      auditorUserId: internalAuditsTable.auditorUserId,
      auditorName: usersTable.name,
      originType: internalAuditsTable.originType,
      status: internalAuditsTable.status,
      createdAt: internalAuditsTable.createdAt,
      updatedAt: internalAuditsTable.updatedAt,
    })
    .from(internalAuditsTable)
    .leftJoin(usersTable, eq(internalAuditsTable.auditorUserId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(internalAuditsTable.periodStart), desc(internalAuditsTable.createdAt))
    .limit(query.pageSize)
    .offset(offset);

  res.json({
    data: rows.map((row) => ({
      ...row,
      createdAt: isoDateTime(row.createdAt),
      updatedAt: isoDateTime(row.updatedAt),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: totalResult.total,
      totalPages: Math.ceil(totalResult.total / query.pageSize),
    },
  });
});

router.post(
  "/organizations/:orgId/governance/internal-audits",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(auditCreateBodySchema, req.body, res);
    if (!body) return;

    if (
      body.auditorUserId &&
      !(await validateOrgUsers([body.auditorUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Auditor inválido" });
      return;
    }
    if (body.status === "completed") {
      res.status(400).json({ error: "Uma auditoria sem checklist avaliado não pode ser concluída" });
      return;
    }

    const [audit] = await db
      .insert(internalAuditsTable)
      .values({
        organizationId: params.orgId,
        title: body.title,
        scope: body.scope,
        criteria: body.criteria,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        auditorUserId: body.auditorUserId ?? null,
        originType: body.originType,
        status: body.status,
        attachments: body.attachments,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning();

    res.status(201).json(await getAuditDetail(audit.id, params.orgId));
  },
);

router.get("/organizations/:orgId/governance/internal-audits/:auditId", async (req, res): Promise<void> => {
  const params = parseOrReject(auditParamsSchema, req.params, res);
  if (!params) return;
  if (params.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const detail = await getAuditDetail(params.auditId, params.orgId);
  if (!detail) {
    res.status(404).json({ error: "Auditoria não encontrada" });
    return;
  }

  res.json(detail);
});

router.patch(
  "/organizations/:orgId/governance/internal-audits/:auditId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(auditParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(auditUpdateBodySchema, req.body, res);
    if (!body) return;

    const audit = await getAuditRecord(params.auditId, params.orgId);
    if (!audit) {
      res.status(404).json({ error: "Auditoria não encontrada" });
      return;
    }
    if (
      body.auditorUserId &&
      !(await validateOrgUsers([body.auditorUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Auditor inválido" });
      return;
    }
    if (body.status === "completed" && !(await assertAuditCanComplete(params.auditId))) {
      res.status(400).json({ error: "A auditoria possui itens de checklist não avaliados" });
      return;
    }

    const updateData: AuditUpdateValues = {
      updatedById: req.auth!.userId,
    };
    if (body.title !== undefined) updateData.title = body.title;
    if (body.scope !== undefined) updateData.scope = body.scope;
    if (body.criteria !== undefined) updateData.criteria = body.criteria;
    if (body.periodStart !== undefined) updateData.periodStart = body.periodStart;
    if (body.periodEnd !== undefined) updateData.periodEnd = body.periodEnd;
    if (body.auditorUserId !== undefined) updateData.auditorUserId = body.auditorUserId ?? null;
    if (body.originType !== undefined) updateData.originType = body.originType;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.attachments !== undefined) updateData.attachments = body.attachments;

    await db
      .update(internalAuditsTable)
      .set(updateData)
      .where(eq(internalAuditsTable.id, params.auditId));

    res.json(await getAuditDetail(params.auditId, params.orgId));
  },
);

router.put(
  "/organizations/:orgId/governance/internal-audits/:auditId/checklist-items",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(auditParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(checklistSyncBodySchema, req.body, res);
    if (!body) return;

    const audit = await getAuditRecord(params.auditId, params.orgId);
    if (!audit) {
      res.status(404).json({ error: "Auditoria não encontrada" });
      return;
    }
    if (audit.status === "completed") {
      res.status(400).json({ error: "Auditorias concluídas não podem ter o checklist alterado" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(internalAuditChecklistItemsTable)
        .where(eq(internalAuditChecklistItemsTable.auditId, params.auditId));

      if (body.items.length > 0) {
        await tx.insert(internalAuditChecklistItemsTable).values(
          body.items.map((item: ChecklistItemInput, index: number) => ({
            auditId: params.auditId,
            label: item.label,
            requirementRef: item.requirementRef ?? null,
            result: item.result,
            notes: item.notes ?? null,
            sortOrder: item.sortOrder ?? index,
          })),
        );
      }
    });

    res.json(await getAuditDetail(params.auditId, params.orgId));
  },
);

router.get(
  "/organizations/:orgId/governance/internal-audits/:auditId/findings",
  async (req, res): Promise<void> => {
    const params = parseOrReject(auditParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const audit = await getAuditRecord(params.auditId, params.orgId);
    if (!audit) {
      res.status(404).json({ error: "Auditoria não encontrada" });
      return;
    }

    const detail = await getAuditDetail(params.auditId, params.orgId);
    res.json(detail?.findings ?? []);
  },
);

router.post(
  "/organizations/:orgId/governance/internal-audits/:auditId/findings",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(auditParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(findingCreateBodySchema, req.body, res);
    if (!body) return;
    const audit = await getAuditRecord(params.auditId, params.orgId);
    if (!audit) {
      res.status(404).json({ error: "Auditoria não encontrada" });
      return;
    }
    if (body.processId && !(await validateOrgProcesses([body.processId], params.orgId))) {
      res.status(400).json({ error: "Processo SGQ inválido" });
      return;
    }
    if (
      body.responsibleUserId &&
      !(await validateOrgUsers([body.responsibleUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável inválido" });
      return;
    }

    const [finding] = await db
      .insert(internalAuditFindingsTable)
      .values({
        organizationId: params.orgId,
        auditId: params.auditId,
        processId: body.processId ?? null,
        requirementRef: body.requirementRef ?? null,
        classification: body.classification,
        description: body.description,
        responsibleUserId: body.responsibleUserId ?? null,
        dueDate: normalizeDate(body.dueDate),
        attachments: body.attachments,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning();

    const detail = await getAuditDetail(params.auditId, params.orgId);
    res.status(201).json(
      detail?.findings.find((item) => item.id === finding.id) ?? finding,
    );
  },
);

router.patch(
  "/organizations/:orgId/governance/internal-audits/:auditId/findings/:findingId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(findingParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(findingUpdateBodySchema, req.body, res);
    if (!body) return;
    const audit = await getAuditRecord(params.auditId, params.orgId);
    if (!audit) {
      res.status(404).json({ error: "Auditoria não encontrada" });
      return;
    }
    const [finding] = await db
      .select()
      .from(internalAuditFindingsTable)
      .where(
        and(
          eq(internalAuditFindingsTable.id, params.findingId),
          eq(internalAuditFindingsTable.auditId, params.auditId),
        ),
      );
    if (!finding) {
      res.status(404).json({ error: "Achado não encontrado" });
      return;
    }
    if (body.processId && !(await validateOrgProcesses([body.processId], params.orgId))) {
      res.status(400).json({ error: "Processo SGQ inválido" });
      return;
    }
    if (
      body.responsibleUserId &&
      !(await validateOrgUsers([body.responsibleUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável inválido" });
      return;
    }

    const updateData: FindingUpdateValues = { updatedById: req.auth!.userId };
    if (body.processId !== undefined) updateData.processId = body.processId ?? null;
    if (body.requirementRef !== undefined) updateData.requirementRef = body.requirementRef ?? null;
    if (body.classification !== undefined) updateData.classification = body.classification;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.responsibleUserId !== undefined) {
      updateData.responsibleUserId = body.responsibleUserId ?? null;
    }
    if (body.dueDate !== undefined) updateData.dueDate = normalizeDate(body.dueDate);
    if (body.attachments !== undefined) updateData.attachments = body.attachments;

    await db
      .update(internalAuditFindingsTable)
      .set(updateData)
      .where(eq(internalAuditFindingsTable.id, params.findingId));

    const detail = await getAuditDetail(params.auditId, params.orgId);
    res.json(detail?.findings.find((item) => item.id === params.findingId));
  },
);

router.get("/organizations/:orgId/governance/nonconformities", async (req, res): Promise<void> => {
  const params = parseOrReject(orgParamsSchema, req.params, res);
  if (!params) return;
  if (params.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const query = parseOrReject(listNonconformitiesQuerySchema, req.query, res);
  if (!query) return;

  const conditions = [eq(nonconformitiesTable.organizationId, params.orgId)];
  if (query.status) conditions.push(eq(nonconformitiesTable.status, query.status));
  if (query.originType) conditions.push(eq(nonconformitiesTable.originType, query.originType));
  if (query.responsibleUserId) {
    conditions.push(eq(nonconformitiesTable.responsibleUserId, query.responsibleUserId));
  }
  if (query.search) {
    const pattern = buildContainsPattern(query.search);
    conditions.push(
      or(
        ilike(nonconformitiesTable.title, pattern),
        ilike(nonconformitiesTable.description, pattern),
      )!,
    );
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.pageSize;
  const [totalResult] = await db
    .select({ total: count() })
    .from(nonconformitiesTable)
    .where(whereClause);

  const rows = await db
    .select({
      id: nonconformitiesTable.id,
      organizationId: nonconformitiesTable.organizationId,
      originType: nonconformitiesTable.originType,
      title: nonconformitiesTable.title,
      description: nonconformitiesTable.description,
      responsibleUserId: nonconformitiesTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      status: nonconformitiesTable.status,
      effectivenessResult: nonconformitiesTable.effectivenessResult,
      createdAt: nonconformitiesTable.createdAt,
      updatedAt: nonconformitiesTable.updatedAt,
    })
    .from(nonconformitiesTable)
    .leftJoin(usersTable, eq(nonconformitiesTable.responsibleUserId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(nonconformitiesTable.updatedAt))
    .limit(query.pageSize)
    .offset(offset);

  res.json({
    data: rows.map((row) => ({
      ...row,
      createdAt: isoDateTime(row.createdAt),
      updatedAt: isoDateTime(row.updatedAt),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: totalResult.total,
      totalPages: Math.ceil(totalResult.total / query.pageSize),
    },
  });
});

router.post(
  "/organizations/:orgId/governance/nonconformities",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(nonconformityCreateBodySchema, req.body, res);
    if (!body) return;

    const userIds = body.responsibleUserId ? [body.responsibleUserId] : [];
    if (userIds.length > 0 && !(await validateOrgUsers(userIds, params.orgId))) {
      res.status(400).json({ error: "Responsável inválido" });
      return;
    }
    if (body.processId && !(await validateOrgProcesses([body.processId], params.orgId))) {
      res.status(400).json({ error: "Processo SGQ inválido" });
      return;
    }
    if (body.documentId && !(await validateOrgDocuments([body.documentId], params.orgId))) {
      res.status(400).json({ error: "Documento inválido" });
      return;
    }
    if (
      body.riskOpportunityItemId &&
      !(await validateOrgRiskItems([body.riskOpportunityItemId], params.orgId))
    ) {
      res.status(400).json({ error: "Risco/Oportunidade inválido" });
      return;
    }
    if (body.auditFindingId && !(await validateOrgAuditFindings([body.auditFindingId], params.orgId))) {
        res.status(400).json({ error: "Achado de auditoria inválido" });
        return;
    }

    const [nc] = await db
      .insert(nonconformitiesTable)
      .values({
        organizationId: params.orgId,
        originType: body.originType,
        title: body.title,
        description: body.description,
        classification: body.classification ?? null,
        rootCause: body.rootCause ?? null,
        responsibleUserId: body.responsibleUserId ?? null,
        processId: body.processId ?? null,
        documentId: body.documentId ?? null,
        riskOpportunityItemId: body.riskOpportunityItemId ?? null,
        auditFindingId: body.auditFindingId ?? null,
        status: "open",
        attachments: body.attachments,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning();

    res.status(201).json(await getNonconformityDetail(nc.id, params.orgId));
  },
);

router.get("/organizations/:orgId/governance/nonconformities/:ncId", async (req, res): Promise<void> => {
  const params = parseOrReject(ncParamsSchema, req.params, res);
  if (!params) return;
  if (params.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const detail = await getNonconformityDetail(params.ncId, params.orgId);
  if (!detail) {
    res.status(404).json({ error: "Não conformidade não encontrada" });
    return;
  }

  res.json(detail);
});

router.patch(
  "/organizations/:orgId/governance/nonconformities/:ncId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(ncParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(nonconformityUpdateBodySchema, req.body, res);
    if (!body) return;
    const nc = await getNonconformityRecord(params.ncId, params.orgId);
    if (!nc) {
      res.status(404).json({ error: "Não conformidade não encontrada" });
      return;
    }
    if (
      body.status === "closed" &&
      nc.effectivenessResult !== "effective"
    ) {
      res.status(400).json({ error: "Não conformidades só podem ser encerradas após a verificação de eficácia" });
      return;
    }
    if (
      body.status === "awaiting_effectiveness" ||
      body.status === "closed"
    ) {
      res.status(400).json({ error: "Use os fluxos dedicados para avançar o ciclo de vida da não conformidade" });
      return;
    }
    if (
      body.responsibleUserId &&
      !(await validateOrgUsers([body.responsibleUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável inválido" });
      return;
    }
    if (body.processId && !(await validateOrgProcesses([body.processId], params.orgId))) {
      res.status(400).json({ error: "Processo SGQ inválido" });
      return;
    }
    if (body.documentId && !(await validateOrgDocuments([body.documentId], params.orgId))) {
      res.status(400).json({ error: "Documento inválido" });
      return;
    }
    if (
      body.riskOpportunityItemId &&
      !(await validateOrgRiskItems([body.riskOpportunityItemId], params.orgId))
    ) {
      res.status(400).json({ error: "Risco/Oportunidade inválido" });
      return;
    }
    if (
      body.auditFindingId &&
      !(await validateOrgAuditFindings([body.auditFindingId], params.orgId))
    ) {
      res.status(400).json({ error: "Achado de auditoria inválido" });
      return;
    }

    const updateData: NonconformityUpdateValues = { updatedById: req.auth!.userId };
    if (body.originType !== undefined) updateData.originType = body.originType;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.classification !== undefined) updateData.classification = body.classification ?? null;
    if (body.rootCause !== undefined) updateData.rootCause = body.rootCause ?? null;
    if (body.responsibleUserId !== undefined) {
      updateData.responsibleUserId = body.responsibleUserId ?? null;
    }
    if (body.processId !== undefined) updateData.processId = body.processId ?? null;
    if (body.documentId !== undefined) updateData.documentId = body.documentId ?? null;
    if (body.riskOpportunityItemId !== undefined) {
      updateData.riskOpportunityItemId = body.riskOpportunityItemId ?? null;
    }
    if (body.auditFindingId !== undefined) updateData.auditFindingId = body.auditFindingId ?? null;
    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    if (body.attachments !== undefined) updateData.attachments = body.attachments;

    await db
      .update(nonconformitiesTable)
      .set(updateData)
      .where(eq(nonconformitiesTable.id, params.ncId));

    res.json(await getNonconformityDetail(params.ncId, params.orgId));
  },
);

router.post(
  "/organizations/:orgId/governance/nonconformities/:ncId/effectiveness-review",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(ncParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(effectivenessReviewBodySchema, req.body, res);
    if (!body) return;
    const nc = await getNonconformityRecord(params.ncId, params.orgId);
    if (!nc) {
      res.status(404).json({ error: "Não conformidade não encontrada" });
      return;
    }
    if (nc.status !== "awaiting_effectiveness") {
      res.status(400).json({ error: "A não conformidade deve estar aguardando eficácia para ser encerrada" });
      return;
    }

    await db
      .update(nonconformitiesTable)
      .set({
        effectivenessResult: body.result,
        effectivenessComment: body.comment ?? null,
        effectivenessCheckedAt: new Date(),
        status: body.result === "ineffective" ? "action_in_progress" : "closed",
        closedAt: body.result === "effective" ? new Date() : null,
        updatedById: req.auth!.userId,
      })
      .where(eq(nonconformitiesTable.id, params.ncId));

    res.json(await getNonconformityDetail(params.ncId, params.orgId));
  },
);

router.get(
  "/organizations/:orgId/governance/nonconformities/:ncId/corrective-actions",
  async (req, res): Promise<void> => {
    const params = parseOrReject(ncParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const detail = await getNonconformityDetail(params.ncId, params.orgId);
    if (!detail) {
      res.status(404).json({ error: "Não conformidade não encontrada" });
      return;
    }
    res.json(detail.correctiveActions);
  },
);

router.post(
  "/organizations/:orgId/governance/nonconformities/:ncId/corrective-actions",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(ncParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(correctiveActionCreateBodySchema, req.body, res);
    if (!body) return;
    const nc = await getNonconformityRecord(params.ncId, params.orgId);
    if (!nc) {
      res.status(404).json({ error: "Não conformidade não encontrada" });
      return;
    }
    if (
      body.responsibleUserId &&
      !(await validateOrgUsers([body.responsibleUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável inválido" });
      return;
    }
    if (
      body.status === "done" &&
      body.attachments.length === 0 &&
      !body.executionNotes?.trim()
    ) {
      res.status(400).json({ error: "Ações concluídas exigem evidência ou notas de execução" });
      return;
    }

    const [action] = await db
      .insert(correctiveActionsTable)
      .values({
        organizationId: params.orgId,
        nonconformityId: params.ncId,
        title: body.title,
        description: body.description,
        responsibleUserId: body.responsibleUserId ?? null,
        dueDate: normalizeDate(body.dueDate),
        status: body.status,
        executionNotes: body.executionNotes ?? null,
        attachments: body.attachments,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning();

    if (nc.auditFindingId) {
      await db
        .update(internalAuditFindingsTable)
        .set({ correctiveActionId: action.id, updatedById: req.auth!.userId })
        .where(eq(internalAuditFindingsTable.id, nc.auditFindingId));
    }

    await recomputeNonconformityStatus(params.ncId, params.orgId, req.auth!.userId);

    res.status(201).json(await getNonconformityDetail(params.ncId, params.orgId));
  },
);

router.patch(
  "/organizations/:orgId/governance/nonconformities/:ncId/corrective-actions/:actionId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(actionParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(correctiveActionUpdateBodySchema, req.body, res);
    if (!body) return;
    const nc = await getNonconformityRecord(params.ncId, params.orgId);
    if (!nc) {
      res.status(404).json({ error: "Não conformidade não encontrada" });
      return;
    }
    const [action] = await db
      .select()
      .from(correctiveActionsTable)
      .where(
        and(
          eq(correctiveActionsTable.id, params.actionId),
          eq(correctiveActionsTable.nonconformityId, params.ncId),
        ),
      );
    if (!action) {
      res.status(404).json({ error: "Ação corretiva não encontrada" });
      return;
    }
    if (
      body.responsibleUserId &&
      !(await validateOrgUsers([body.responsibleUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável inválido" });
      return;
    }

    const nextAttachments = body.attachments ?? action.attachments ?? [];
    const nextNotes = body.executionNotes ?? action.executionNotes;
    const nextStatus = body.status ?? action.status;
    if (nextStatus === "done" && nextAttachments.length === 0 && !nextNotes?.trim()) {
      res.status(400).json({ error: "Ações concluídas exigem evidência ou notas de execução" });
      return;
    }

    const updateData: CorrectiveActionUpdateValues = { updatedById: req.auth!.userId };
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.responsibleUserId !== undefined) {
      updateData.responsibleUserId = body.responsibleUserId ?? null;
    }
    if (body.dueDate !== undefined) updateData.dueDate = normalizeDate(body.dueDate);
    if (body.status !== undefined) updateData.status = body.status;
    if (body.executionNotes !== undefined) updateData.executionNotes = body.executionNotes ?? null;
    if (body.attachments !== undefined) updateData.attachments = body.attachments;

    await db
      .update(correctiveActionsTable)
      .set(updateData)
      .where(eq(correctiveActionsTable.id, params.actionId));

    await recomputeNonconformityStatus(params.ncId, params.orgId, req.auth!.userId);

    res.json(await getNonconformityDetail(params.ncId, params.orgId));
  },
);

router.get("/organizations/:orgId/governance/management-reviews", async (req, res): Promise<void> => {
  const params = parseOrReject(orgParamsSchema, req.params, res);
  if (!params) return;
  if (params.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const query = parseOrReject(listManagementReviewsQuerySchema, req.query, res);
  if (!query) return;

  const conditions = [eq(managementReviewsTable.organizationId, params.orgId)];
  if (query.status) conditions.push(eq(managementReviewsTable.status, query.status));
  if (query.chairUserId) conditions.push(eq(managementReviewsTable.chairUserId, query.chairUserId));
  if (query.search) {
    const pattern = buildContainsPattern(query.search);
    conditions.push(
      or(
        ilike(managementReviewsTable.title, pattern),
        ilike(managementReviewsTable.minutes, pattern),
      )!,
    );
  }

  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.pageSize;
  const [totalResult] = await db
    .select({ total: count() })
    .from(managementReviewsTable)
    .where(whereClause);

  const rows = await db
    .select({
      id: managementReviewsTable.id,
      organizationId: managementReviewsTable.organizationId,
      title: managementReviewsTable.title,
      reviewDate: managementReviewsTable.reviewDate,
      chairUserId: managementReviewsTable.chairUserId,
      chairUserName: usersTable.name,
      status: managementReviewsTable.status,
      createdAt: managementReviewsTable.createdAt,
      updatedAt: managementReviewsTable.updatedAt,
    })
    .from(managementReviewsTable)
    .leftJoin(usersTable, eq(managementReviewsTable.chairUserId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(managementReviewsTable.reviewDate))
    .limit(query.pageSize)
    .offset(offset);

  res.json({
    data: rows.map((row) => ({
      ...row,
      createdAt: isoDateTime(row.createdAt),
      updatedAt: isoDateTime(row.updatedAt),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: totalResult.total,
      totalPages: Math.ceil(totalResult.total / query.pageSize),
    },
  });
});

router.post(
  "/organizations/:orgId/governance/management-reviews",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(managementReviewCreateBodySchema, req.body, res);
    if (!body) return;
    if (
      body.chairUserId &&
      !(await validateOrgUsers([body.chairUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável da análise crítica inválido" });
      return;
    }

    const [review] = await db
      .insert(managementReviewsTable)
      .values({
        organizationId: params.orgId,
        title: body.title,
        reviewDate: body.reviewDate,
        chairUserId: body.chairUserId ?? null,
        minutes: body.minutes ?? null,
        status: body.status === "completed" ? "draft" : body.status,
        attachments: body.attachments,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning();

    res.status(201).json(await getManagementReviewDetail(review.id, params.orgId));
  },
);

router.get(
  "/organizations/:orgId/governance/management-reviews/:reviewId",
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const detail = await getManagementReviewDetail(params.reviewId, params.orgId);
    if (!detail) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }
    res.json(detail);
  },
);

router.patch(
  "/organizations/:orgId/governance/management-reviews/:reviewId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(managementReviewUpdateBodySchema, req.body, res);
    if (!body) return;
    const review = await getManagementReviewRecord(params.reviewId, params.orgId);
    if (!review) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }
    if (
      body.chairUserId &&
      !(await validateOrgUsers([body.chairUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável da análise crítica inválido" });
      return;
    }
    if (body.status === "completed" && !(await assertManagementReviewCanComplete(params.reviewId))) {
      res.status(400).json({ error: "A análise crítica precisa de ao menos uma entrada e uma saída para ser concluída" });
      return;
    }

    const updateData: ManagementReviewUpdateValues = { updatedById: req.auth!.userId };
    if (body.title !== undefined) updateData.title = body.title;
    if (body.reviewDate !== undefined) updateData.reviewDate = body.reviewDate;
    if (body.chairUserId !== undefined) updateData.chairUserId = body.chairUserId ?? null;
    if (body.minutes !== undefined) updateData.minutes = body.minutes ?? null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.attachments !== undefined) updateData.attachments = body.attachments;

    await db
      .update(managementReviewsTable)
      .set(updateData)
      .where(eq(managementReviewsTable.id, params.reviewId));

    res.json(await getManagementReviewDetail(params.reviewId, params.orgId));
  },
);

router.get(
  "/organizations/:orgId/governance/management-reviews/:reviewId/inputs",
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const detail = await getManagementReviewDetail(params.reviewId, params.orgId);
    if (!detail) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }
    res.json(detail.inputs);
  },
);

router.post(
  "/organizations/:orgId/governance/management-reviews/:reviewId/inputs",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(managementReviewInputBodySchema, req.body, res);
    if (!body) return;
    const review = await getManagementReviewRecord(params.reviewId, params.orgId);
    if (!review) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }

    if (body.documentId && !(await validateOrgDocuments([body.documentId], params.orgId))) {
      res.status(400).json({ error: "Documento inválido" });
      return;
    }
    if (body.auditId && !(await validateOrgAudits([body.auditId], params.orgId))) {
      res.status(400).json({ error: "Auditoria inválida" });
      return;
    }
    if (
      body.nonconformityId &&
      !(await validateOrgNonconformities([body.nonconformityId], params.orgId))
    ) {
      res.status(400).json({ error: "Não conformidade inválida" });
      return;
    }
    if (
      body.strategicPlanId &&
      !(await validateOrgStrategicPlans([body.strategicPlanId], params.orgId))
    ) {
      res.status(400).json({ error: "Planejamento estratégico inválido" });
      return;
    }
    if (body.processId && !(await validateOrgProcesses([body.processId], params.orgId))) {
      res.status(400).json({ error: "Processo SGQ inválido" });
      return;
    }

    await db.insert(managementReviewInputsTable).values({
      reviewId: params.reviewId,
      inputType: body.inputType,
      summary: body.summary,
      documentId: body.documentId ?? null,
      auditId: body.auditId ?? null,
      nonconformityId: body.nonconformityId ?? null,
      strategicPlanId: body.strategicPlanId ?? null,
      processId: body.processId ?? null,
      sortOrder: body.sortOrder ?? 0,
    });

    res.status(201).json(await getManagementReviewDetail(params.reviewId, params.orgId));
  },
);

router.patch(
  "/organizations/:orgId/governance/management-reviews/:reviewId/inputs/:inputId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewInputParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(managementReviewInputBodySchema.partial(), req.body, res);
    if (!body) return;
    const review = await getManagementReviewRecord(params.reviewId, params.orgId);
    if (!review) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }
    const [existingInput] = await db
      .select()
      .from(managementReviewInputsTable)
      .where(
        and(
          eq(managementReviewInputsTable.id, params.inputId),
          eq(managementReviewInputsTable.reviewId, params.reviewId),
        ),
      );
    if (!existingInput) {
      res.status(404).json({ error: "Entrada não encontrada" });
      return;
    }
    if (body.documentId && !(await validateOrgDocuments([body.documentId], params.orgId))) {
      res.status(400).json({ error: "Documento inválido" });
      return;
    }
    if (body.auditId && !(await validateOrgAudits([body.auditId], params.orgId))) {
      res.status(400).json({ error: "Auditoria inválida" });
      return;
    }
    if (
      body.nonconformityId &&
      !(await validateOrgNonconformities([body.nonconformityId], params.orgId))
    ) {
      res.status(400).json({ error: "Não conformidade inválida" });
      return;
    }
    if (
      body.strategicPlanId &&
      !(await validateOrgStrategicPlans([body.strategicPlanId], params.orgId))
    ) {
      res.status(400).json({ error: "Planejamento estratégico inválido" });
      return;
    }
    if (body.processId && !(await validateOrgProcesses([body.processId], params.orgId))) {
      res.status(400).json({ error: "Processo SGQ inválido" });
      return;
    }

    const updateData: ManagementReviewInputUpdateValues = {};
    if (body.inputType !== undefined) updateData.inputType = body.inputType;
    if (body.summary !== undefined) updateData.summary = body.summary;
    if (body.documentId !== undefined) updateData.documentId = body.documentId ?? null;
    if (body.auditId !== undefined) updateData.auditId = body.auditId ?? null;
    if (body.nonconformityId !== undefined) {
      updateData.nonconformityId = body.nonconformityId ?? null;
    }
    if (body.strategicPlanId !== undefined) {
      updateData.strategicPlanId = body.strategicPlanId ?? null;
    }
    if (body.processId !== undefined) updateData.processId = body.processId ?? null;
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;

    await db
      .update(managementReviewInputsTable)
      .set(updateData)
      .where(
        and(
          eq(managementReviewInputsTable.id, params.inputId),
          eq(managementReviewInputsTable.reviewId, params.reviewId),
        ),
      );

    res.json(await getManagementReviewDetail(params.reviewId, params.orgId));
  },
);

router.delete(
  "/organizations/:orgId/governance/management-reviews/:reviewId/inputs/:inputId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewInputParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const review = await getManagementReviewRecord(params.reviewId, params.orgId);
    if (!review) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }
    await db
      .delete(managementReviewInputsTable)
      .where(
        and(
          eq(managementReviewInputsTable.id, params.inputId),
          eq(managementReviewInputsTable.reviewId, params.reviewId),
        ),
      );
    res.sendStatus(204);
  },
);

router.get(
  "/organizations/:orgId/governance/management-reviews/:reviewId/outputs",
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const detail = await getManagementReviewDetail(params.reviewId, params.orgId);
    if (!detail) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }
    res.json(detail.outputs);
  },
);

router.post(
  "/organizations/:orgId/governance/management-reviews/:reviewId/outputs",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(managementReviewOutputBodySchema, req.body, res);
    if (!body) return;
    const review = await getManagementReviewRecord(params.reviewId, params.orgId);
    if (!review) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }
    if (
      body.responsibleUserId &&
      !(await validateOrgUsers([body.responsibleUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável inválido" });
      return;
    }
    if (body.processId && !(await validateOrgProcesses([body.processId], params.orgId))) {
      res.status(400).json({ error: "Processo SGQ inválido" });
      return;
    }
    if (
      body.nonconformityId &&
      !(await validateOrgNonconformities([body.nonconformityId], params.orgId))
    ) {
      res.status(400).json({ error: "Não conformidade inválida" });
      return;
    }

    await db.insert(managementReviewOutputsTable).values({
      reviewId: params.reviewId,
      outputType: body.outputType,
      description: body.description,
      responsibleUserId: body.responsibleUserId ?? null,
      dueDate: normalizeDate(body.dueDate),
      processId: body.processId ?? null,
      nonconformityId: body.nonconformityId ?? null,
      status: body.outputType === "action" && body.status === "done" ? "open" : body.status,
    });

    res.status(201).json(await getManagementReviewDetail(params.reviewId, params.orgId));
  },
);

router.patch(
  "/organizations/:orgId/governance/management-reviews/:reviewId/outputs/:outputId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewOutputParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = parseOrReject(managementReviewOutputBodySchema.partial(), req.body, res);
    if (!body) return;
    const review = await getManagementReviewRecord(params.reviewId, params.orgId);
    if (!review) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }

    const [existingOutput] = await db
      .select()
      .from(managementReviewOutputsTable)
      .where(
        and(
          eq(managementReviewOutputsTable.id, params.outputId),
          eq(managementReviewOutputsTable.reviewId, params.reviewId),
        ),
      );
    if (!existingOutput) {
      res.status(404).json({ error: "Saída não encontrada" });
      return;
    }
    if (
      body.responsibleUserId &&
      !(await validateOrgUsers([body.responsibleUserId], params.orgId))
    ) {
      res.status(400).json({ error: "Responsável inválido" });
      return;
    }
    if (body.processId && !(await validateOrgProcesses([body.processId], params.orgId))) {
      res.status(400).json({ error: "Processo SGQ inválido" });
      return;
    }
    if (
      body.nonconformityId &&
      !(await validateOrgNonconformities([body.nonconformityId], params.orgId))
    ) {
      res.status(400).json({ error: "Não conformidade inválida" });
      return;
    }

    const nextType = body.outputType ?? existingOutput.outputType;
    const nextStatus = body.status ?? existingOutput.status;
    const updateData: ManagementReviewOutputUpdateValues = {};
    if (body.outputType !== undefined) updateData.outputType = body.outputType;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.responsibleUserId !== undefined) {
      updateData.responsibleUserId = body.responsibleUserId ?? null;
    }
    if (body.dueDate !== undefined) updateData.dueDate = normalizeDate(body.dueDate);
    if (body.processId !== undefined) updateData.processId = body.processId ?? null;
    if (body.nonconformityId !== undefined) {
      updateData.nonconformityId = body.nonconformityId ?? null;
    }
    if (body.status !== undefined) {
      updateData.status = nextType === "action" && nextStatus === "done" ? "open" : nextStatus;
    } else if (body.outputType !== undefined && nextType === "action" && nextStatus === "done") {
      updateData.status = "open";
    }

    await db
      .update(managementReviewOutputsTable)
      .set(updateData)
      .where(
        and(
          eq(managementReviewOutputsTable.id, params.outputId),
          eq(managementReviewOutputsTable.reviewId, params.reviewId),
        ),
      );

    res.json(await getManagementReviewDetail(params.reviewId, params.orgId));
  },
);

router.delete(
  "/organizations/:orgId/governance/management-reviews/:reviewId/outputs/:outputId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewOutputParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const review = await getManagementReviewRecord(params.reviewId, params.orgId);
    if (!review) {
      res.status(404).json({ error: "Análise crítica não encontrada" });
      return;
    }
    await db
      .delete(managementReviewOutputsTable)
      .where(
        and(
          eq(managementReviewOutputsTable.id, params.outputId),
          eq(managementReviewOutputsTable.reviewId, params.reviewId),
        ),
      );
    res.sendStatus(204);
  },
);

export default router;
