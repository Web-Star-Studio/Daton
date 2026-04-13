import { Router, type IRouter, type Response } from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  documentsTable,
  employeesTable,
  operationalChangesTable,
  operationalChangeRiskLinksTable,
  operationalCycleEvidencesTable,
  operationalPlanDocumentsTable,
  operationalPlanRevisionsTable,
  operationalPlansTable,
  operationalPlanRiskLinksTable,
  operationalReadinessChecklistsTable,
  operationalReadinessExecutionsTable,
  sgqProcessesTable,
  strategicPlanRiskOpportunityItemsTable,
  strategicPlansTable,
  unitsTable,
  usersTable,
} from "@workspace/db/schema";
import { requireWriteAccess } from "../../middlewares/auth";

const router: IRouter = Router();

const attachmentSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  contentType: z.string().min(1),
  objectPath: z.string().min(1),
});

const listPlansQuerySchema = z.object({
  status: z.enum(["draft", "active", "archived"]).optional(),
  unitId: z.coerce.number().int().positive().optional(),
  processId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().min(1).optional(),
});

const orgParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
});

const planParamsSchema = orgParamsSchema.extend({
  planId: z.coerce.number().int().positive(),
});

const checklistParamsSchema = planParamsSchema.extend({
  checklistItemId: z.coerce.number().int().positive(),
});

const cycleParamsSchema = planParamsSchema.extend({
  cycleId: z.coerce.number().int().positive(),
});

const readinessExecutionParamsSchema = cycleParamsSchema.extend({
  checklistItemId: z.coerce.number().int().positive(),
});

const changeParamsSchema = planParamsSchema.extend({
  changeId: z.coerce.number().int().positive(),
});

const basePlanBodySchema = z.object({
  title: z.string().trim().min(1).optional(),
  planCode: z.string().trim().min(1).nullable().optional(),
  processId: z.number().int().positive().nullable().optional(),
  unitId: z.number().int().positive().nullable().optional(),
  responsibleId: z.number().int().positive().nullable().optional(),
  serviceType: z.string().trim().min(1).nullable().optional(),
  scope: z.string().trim().min(1).nullable().optional(),
  sequenceDescription: z.string().trim().min(1).nullable().optional(),
  executionCriteria: z.string().trim().min(1).nullable().optional(),
  requiredResources: z.array(z.string().trim().min(1)).optional(),
  inputs: z.array(z.string().trim().min(1)).optional(),
  outputs: z.array(z.string().trim().min(1)).optional(),
  esgConsiderations: z.string().trim().min(1).nullable().optional(),
  readinessBlockingEnabled: z.boolean().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  documentIds: z.array(z.number().int().positive()).optional(),
  riskOpportunityItemIds: z.array(z.number().int().positive()).optional(),
  changeSummary: z.string().trim().min(1).nullable().optional(),
});

const createPlanBodySchema = basePlanBodySchema.extend({
  title: z.string().trim().min(1),
});

const checklistBodySchema = z.object({
  title: z.string().trim().min(1),
  instructions: z.string().trim().min(1).nullable().optional(),
  isCritical: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  changeSummary: z.string().trim().min(1).nullable().optional(),
});

const updateChecklistBodySchema = checklistBodySchema.partial();

const cycleBodySchema = z.object({
  cycleCode: z.string().trim().min(1),
  cycleDate: z.string().datetime().nullable().optional(),
  status: z
    .enum(["planned", "ready", "in_execution", "completed", "blocked", "canceled"])
    .optional(),
  evidenceSummary: z.string().trim().min(1).nullable().optional(),
  externalReference: z.string().trim().min(1).nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const updateCycleBodySchema = cycleBodySchema.partial();

const readinessExecutionBodySchema = z.object({
  status: z.enum(["pending", "ok", "failed", "waived"]),
  executedById: z.number().int().positive().nullable().optional(),
  executedAt: z.string().datetime().nullable().optional(),
  evidenceNote: z.string().trim().min(1).nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const changeBodySchema = z.object({
  title: z.string().trim().min(1),
  cycleEvidenceId: z.number().int().positive().nullable().optional(),
  reason: z.string().trim().min(1),
  impactLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  impactDescription: z.string().trim().min(1).nullable().optional(),
  mitigationAction: z.string().trim().min(1).nullable().optional(),
  decision: z.enum(["pending", "approved", "rejected"]).optional(),
  riskOpportunityItemIds: z.array(z.number().int().positive()).optional(),
});

const updateChangeBodySchema = changeBodySchema.partial();

function parseOrReject<T>(
  schema: z.ZodSchema<T>,
  raw: unknown,
  res: Response,
) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return null;
  }
  return parsed.data;
}

function normalizeTextArray(values?: string[]) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

async function ensurePlan(orgId: number, planId: number) {
  const [plan] = await db
    .select()
    .from(operationalPlansTable)
    .where(
      and(
        eq(operationalPlansTable.id, planId),
        eq(operationalPlansTable.organizationId, orgId),
      ),
    );

  return plan ?? null;
}

async function ensureCycleBelongsToPlan(
  orgId: number,
  planId: number,
  cycleId: number,
) {
  const [cycle] = await db
    .select({ id: operationalCycleEvidencesTable.id })
    .from(operationalCycleEvidencesTable)
    .where(
      and(
        eq(operationalCycleEvidencesTable.id, cycleId),
        eq(operationalCycleEvidencesTable.organizationId, orgId),
        eq(operationalCycleEvidencesTable.planId, planId),
      ),
    );

  return cycle ?? null;
}

async function assertDocumentIds(orgId: number, documentIds: number[]) {
  if (documentIds.length === 0) return;

  const rows = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.organizationId, orgId),
        inArray(documentsTable.id, documentIds),
      ),
    );

  if (rows.length !== documentIds.length) {
    throw new Error("Há documentos inválidos para esta organização");
  }
}

async function assertRiskIds(orgId: number, riskIds: number[]) {
  if (riskIds.length === 0) return;

  const rows = await db
    .select({ id: strategicPlanRiskOpportunityItemsTable.id })
    .from(strategicPlanRiskOpportunityItemsTable)
    .where(
      and(
        eq(strategicPlanRiskOpportunityItemsTable.organizationId, orgId),
        inArray(strategicPlanRiskOpportunityItemsTable.id, riskIds),
      ),
    );

  if (rows.length !== riskIds.length) {
    throw new Error("Há riscos ou oportunidades inválidos para esta organização");
  }
}

async function assertPlanReferences(orgId: number, body: z.infer<typeof basePlanBodySchema>) {
  const documentIds = [...new Set(body.documentIds ?? [])];
  const riskIds = [...new Set(body.riskOpportunityItemIds ?? [])];

  if (body.processId) {
    const [process] = await db
      .select({ id: sgqProcessesTable.id })
      .from(sgqProcessesTable)
      .where(
        and(
          eq(sgqProcessesTable.id, body.processId),
          eq(sgqProcessesTable.organizationId, orgId),
        ),
      );
    if (!process) throw new Error("Processo SGQ inválido para esta organização");
  }

  if (body.unitId) {
    const [unit] = await db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(and(eq(unitsTable.id, body.unitId), eq(unitsTable.organizationId, orgId)));
    if (!unit) throw new Error("Unidade inválida para esta organização");
  }

  if (body.responsibleId) {
    const [employee] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, body.responsibleId),
          eq(employeesTable.organizationId, orgId),
        ),
      );
    if (!employee) throw new Error("Responsável inválido para esta organização");
  }

  await assertDocumentIds(orgId, documentIds);
  await assertRiskIds(orgId, riskIds);
}

async function syncPlanDocuments(planId: number, documentIds: number[]) {
  await db
    .delete(operationalPlanDocumentsTable)
    .where(eq(operationalPlanDocumentsTable.planId, planId));

  if (documentIds.length === 0) return;

  await db.insert(operationalPlanDocumentsTable).values(
    documentIds.map((documentId) => ({
      planId,
      documentId,
    })),
  );
}

async function syncPlanRiskLinks(planId: number, riskIds: number[]) {
  await db
    .delete(operationalPlanRiskLinksTable)
    .where(eq(operationalPlanRiskLinksTable.planId, planId));

  if (riskIds.length === 0) return;

  await db.insert(operationalPlanRiskLinksTable).values(
    riskIds.map((riskOpportunityItemId) => ({
      planId,
      riskOpportunityItemId,
    })),
  );
}

async function syncChangeRiskLinks(changeId: number, riskIds: number[]) {
  await db
    .delete(operationalChangeRiskLinksTable)
    .where(eq(operationalChangeRiskLinksTable.changeId, changeId));

  if (riskIds.length === 0) return;

  await db.insert(operationalChangeRiskLinksTable).values(
    riskIds.map((riskOpportunityItemId) => ({
      changeId,
      riskOpportunityItemId,
    })),
  );
}

async function buildPlanRevisionSnapshot(planId: number) {
  const [plan] = await db
    .select()
    .from(operationalPlansTable)
    .where(eq(operationalPlansTable.id, planId));

  if (!plan) {
    throw new Error("Plano operacional não encontrado");
  }

  const [documents, risks, checklistItems] = await Promise.all([
    db
      .select({ documentId: operationalPlanDocumentsTable.documentId })
      .from(operationalPlanDocumentsTable)
      .where(eq(operationalPlanDocumentsTable.planId, planId)),
    db
      .select({
        riskOpportunityItemId: operationalPlanRiskLinksTable.riskOpportunityItemId,
      })
      .from(operationalPlanRiskLinksTable)
      .where(eq(operationalPlanRiskLinksTable.planId, planId)),
    db
      .select({
        title: operationalReadinessChecklistsTable.title,
        instructions: operationalReadinessChecklistsTable.instructions,
        isCritical: operationalReadinessChecklistsTable.isCritical,
        sortOrder: operationalReadinessChecklistsTable.sortOrder,
      })
      .from(operationalReadinessChecklistsTable)
      .where(eq(operationalReadinessChecklistsTable.planId, planId))
      .orderBy(
        operationalReadinessChecklistsTable.sortOrder,
        operationalReadinessChecklistsTable.id,
      ),
  ]);

  return {
    title: plan.title,
    planCode: plan.planCode,
    processId: plan.processId,
    unitId: plan.unitId,
    responsibleId: plan.responsibleId,
    serviceType: plan.serviceType,
    scope: plan.scope,
    sequenceDescription: plan.sequenceDescription,
    executionCriteria: plan.executionCriteria,
    requiredResources: plan.requiredResources ?? [],
    inputs: plan.inputs ?? [],
    outputs: plan.outputs ?? [],
    esgConsiderations: plan.esgConsiderations,
    readinessBlockingEnabled: plan.readinessBlockingEnabled,
    status: plan.status,
    documentIds: documents.map((item) => item.documentId),
    riskOpportunityItemIds: risks.map((item) => item.riskOpportunityItemId),
    checklistItems,
  };
}

async function createPlanRevision(planId: number, changedById: number, changeSummary?: string | null) {
  const [plan] = await db
    .select({
      currentRevisionNumber: operationalPlansTable.currentRevisionNumber,
    })
    .from(operationalPlansTable)
    .where(eq(operationalPlansTable.id, planId));

  if (!plan) {
    throw new Error("Plano operacional não encontrado");
  }

  const snapshot = await buildPlanRevisionSnapshot(planId);

  await db.insert(operationalPlanRevisionsTable).values({
    planId,
    revisionNumber: plan.currentRevisionNumber,
    changeSummary: changeSummary ?? null,
    changedById,
    snapshot,
  });
}

async function seedReadinessExecutionsForCycle(
  orgId: number,
  cycleEvidenceId: number,
  planId: number,
) {
  const checklistItems = await db
    .select({ id: operationalReadinessChecklistsTable.id })
    .from(operationalReadinessChecklistsTable)
    .where(eq(operationalReadinessChecklistsTable.planId, planId));

  if (checklistItems.length === 0) return;

  await db.insert(operationalReadinessExecutionsTable).values(
    checklistItems.map((item) => ({
      organizationId: orgId,
      cycleEvidenceId,
      checklistItemId: item.id,
      status: "pending" as const,
      attachments: [],
    })),
  );
}

async function seedChecklistExecutionsForExistingCycles(
  orgId: number,
  planId: number,
  checklistItemId: number,
) {
  const cycles = await db
    .select({ id: operationalCycleEvidencesTable.id })
    .from(operationalCycleEvidencesTable)
    .where(
      and(
        eq(operationalCycleEvidencesTable.organizationId, orgId),
        eq(operationalCycleEvidencesTable.planId, planId),
      ),
    );

  if (cycles.length === 0) return;

  await db.insert(operationalReadinessExecutionsTable).values(
    cycles.map((cycle) => ({
      organizationId: orgId,
      cycleEvidenceId: cycle.id,
      checklistItemId,
      status: "pending" as const,
      attachments: [],
    })),
  );
}

async function getCriticalPendingCount(planId: number, cycleId: number) {
  const rows = await db
    .select({
      checklistItemId: operationalReadinessChecklistsTable.id,
      isCritical: operationalReadinessChecklistsTable.isCritical,
      status: operationalReadinessExecutionsTable.status,
    })
    .from(operationalReadinessChecklistsTable)
    .leftJoin(
      operationalReadinessExecutionsTable,
      and(
        eq(
          operationalReadinessExecutionsTable.checklistItemId,
          operationalReadinessChecklistsTable.id,
        ),
        eq(operationalReadinessExecutionsTable.cycleEvidenceId, cycleId),
      ),
    )
    .where(eq(operationalReadinessChecklistsTable.planId, planId));

  return rows.filter(
    (row) =>
      row.isCritical &&
      row.status !== "ok" &&
      row.status !== "waived",
  ).length;
}

async function serializePlanDetail(orgId: number, planId: number) {
  const [planRow] = await db
    .select({
      plan: operationalPlansTable,
      unitName: unitsTable.name,
      responsibleName: employeesTable.name,
      processName: sgqProcessesTable.name,
    })
    .from(operationalPlansTable)
    .leftJoin(unitsTable, eq(operationalPlansTable.unitId, unitsTable.id))
    .leftJoin(
      employeesTable,
      eq(operationalPlansTable.responsibleId, employeesTable.id),
    )
    .leftJoin(
      sgqProcessesTable,
      eq(operationalPlansTable.processId, sgqProcessesTable.id),
    )
    .where(
      and(
        eq(operationalPlansTable.id, planId),
        eq(operationalPlansTable.organizationId, orgId),
      ),
    );

  if (!planRow) return null;

  const [documents, risks, checklistItems, revisions, cycles, changes] =
    await Promise.all([
      db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          status: documentsTable.status,
        })
        .from(operationalPlanDocumentsTable)
        .innerJoin(
          documentsTable,
          eq(operationalPlanDocumentsTable.documentId, documentsTable.id),
        )
        .where(eq(operationalPlanDocumentsTable.planId, planId))
        .orderBy(documentsTable.title),
      db
        .select({
          id: strategicPlanRiskOpportunityItemsTable.id,
          title: strategicPlanRiskOpportunityItemsTable.title,
          type: strategicPlanRiskOpportunityItemsTable.type,
          status: strategicPlanRiskOpportunityItemsTable.status,
          planTitle: strategicPlansTable.title,
        })
        .from(operationalPlanRiskLinksTable)
        .innerJoin(
          strategicPlanRiskOpportunityItemsTable,
          eq(
            operationalPlanRiskLinksTable.riskOpportunityItemId,
            strategicPlanRiskOpportunityItemsTable.id,
          ),
        )
        .leftJoin(
          strategicPlansTable,
          eq(
            strategicPlanRiskOpportunityItemsTable.planId,
            strategicPlansTable.id,
          ),
        )
        .where(eq(operationalPlanRiskLinksTable.planId, planId))
        .orderBy(strategicPlanRiskOpportunityItemsTable.title),
      db
        .select()
        .from(operationalReadinessChecklistsTable)
        .where(eq(operationalReadinessChecklistsTable.planId, planId))
        .orderBy(
          operationalReadinessChecklistsTable.sortOrder,
          operationalReadinessChecklistsTable.id,
        ),
      db
        .select({
          revision: operationalPlanRevisionsTable,
          changedByName: usersTable.name,
        })
        .from(operationalPlanRevisionsTable)
        .leftJoin(
          usersTable,
          eq(operationalPlanRevisionsTable.changedById, usersTable.id),
        )
        .where(eq(operationalPlanRevisionsTable.planId, planId))
        .orderBy(desc(operationalPlanRevisionsTable.revisionNumber)),
      db
        .select()
        .from(operationalCycleEvidencesTable)
        .where(
          and(
            eq(operationalCycleEvidencesTable.organizationId, orgId),
            eq(operationalCycleEvidencesTable.planId, planId),
          ),
        )
        .orderBy(
          desc(operationalCycleEvidencesTable.cycleDate),
          desc(operationalCycleEvidencesTable.createdAt),
        ),
      db
        .select()
        .from(operationalChangesTable)
        .where(
          and(
            eq(operationalChangesTable.organizationId, orgId),
            eq(operationalChangesTable.planId, planId),
          ),
        )
        .orderBy(desc(operationalChangesTable.createdAt)),
    ]);

  const cycleIds = cycles.map((cycle) => cycle.id);
  const changeIds = changes.map((item) => item.id);
  const userIds = [...new Set(
    changes
      .flatMap((item) => [item.requestedById, item.approvedById])
      .filter((value): value is number => typeof value === "number"),
  )];

  const [executions, changeRisks, users] = await Promise.all([
    cycleIds.length
      ? db
          .select({
            execution: operationalReadinessExecutionsTable,
            checklistTitle: operationalReadinessChecklistsTable.title,
            checklistIsCritical: operationalReadinessChecklistsTable.isCritical,
            executedByName: employeesTable.name,
          })
          .from(operationalReadinessExecutionsTable)
          .innerJoin(
            operationalReadinessChecklistsTable,
            eq(
              operationalReadinessExecutionsTable.checklistItemId,
              operationalReadinessChecklistsTable.id,
            ),
          )
          .leftJoin(
            employeesTable,
            eq(
              operationalReadinessExecutionsTable.executedById,
              employeesTable.id,
            ),
          )
          .where(
            and(
              eq(operationalReadinessExecutionsTable.organizationId, orgId),
              inArray(
                operationalReadinessExecutionsTable.cycleEvidenceId,
                cycleIds,
              ),
            ),
          )
      : Promise.resolve([]),
    changeIds.length
      ? db
          .select({
            changeId: operationalChangeRiskLinksTable.changeId,
            id: strategicPlanRiskOpportunityItemsTable.id,
            title: strategicPlanRiskOpportunityItemsTable.title,
            type: strategicPlanRiskOpportunityItemsTable.type,
          })
          .from(operationalChangeRiskLinksTable)
          .innerJoin(
            strategicPlanRiskOpportunityItemsTable,
            eq(
              operationalChangeRiskLinksTable.riskOpportunityItemId,
              strategicPlanRiskOpportunityItemsTable.id,
            ),
          )
          .where(
            inArray(operationalChangeRiskLinksTable.changeId, changeIds),
          )
      : Promise.resolve([]),
    userIds.length
      ? db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds))
      : Promise.resolve([]),
  ]);

  const executionsByCycle = new Map<number, typeof executions>();
  for (const execution of executions) {
    const bucket =
      executionsByCycle.get(execution.execution.cycleEvidenceId) ?? [];
    bucket.push(execution);
    executionsByCycle.set(execution.execution.cycleEvidenceId, bucket);
  }

  const risksByChange = new Map<number, typeof changeRisks>();
  for (const risk of changeRisks) {
    const bucket = risksByChange.get(risk.changeId) ?? [];
    bucket.push(risk);
    risksByChange.set(risk.changeId, bucket);
  }

  const userNameById = new Map(users.map((user) => [user.id, user.name]));

  return {
    id: planRow.plan.id,
    organizationId: planRow.plan.organizationId,
    title: planRow.plan.title,
    planCode: planRow.plan.planCode,
    processId: planRow.plan.processId,
    processName: planRow.processName ?? null,
    unitId: planRow.plan.unitId,
    unitName: planRow.unitName ?? null,
    responsibleId: planRow.plan.responsibleId,
    responsibleName: planRow.responsibleName ?? null,
    serviceType: planRow.plan.serviceType,
    scope: planRow.plan.scope,
    sequenceDescription: planRow.plan.sequenceDescription,
    executionCriteria: planRow.plan.executionCriteria,
    requiredResources: planRow.plan.requiredResources ?? [],
    inputs: planRow.plan.inputs ?? [],
    outputs: planRow.plan.outputs ?? [],
    esgConsiderations: planRow.plan.esgConsiderations,
    readinessBlockingEnabled: planRow.plan.readinessBlockingEnabled,
    status: planRow.plan.status,
    currentRevisionNumber: planRow.plan.currentRevisionNumber,
    createdById: planRow.plan.createdById,
    updatedById: planRow.plan.updatedById,
    createdAt: planRow.plan.createdAt.toISOString(),
    updatedAt: planRow.plan.updatedAt.toISOString(),
    documents: documents.map((document) => ({
      ...document,
      status: document.status ?? null,
    })),
    riskLinks: risks.map((risk) => ({
      ...risk,
      planTitle: risk.planTitle ?? null,
    })),
    checklistItems: checklistItems.map((item) => ({
      id: item.id,
      title: item.title,
      instructions: item.instructions,
      isCritical: item.isCritical,
      sortOrder: item.sortOrder,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    revisions: revisions.map((item) => ({
      id: item.revision.id,
      revisionNumber: item.revision.revisionNumber,
      changeSummary: item.revision.changeSummary,
      changedById: item.revision.changedById,
      changedByName: item.changedByName ?? null,
      snapshot: item.revision.snapshot,
      createdAt: item.revision.createdAt.toISOString(),
    })),
    cycles: cycles.map((cycle) => {
      const cycleExecutions = executionsByCycle.get(cycle.id) ?? [];
      const criticalPendingCount = cycleExecutions.filter(
        (item) =>
          item.checklistIsCritical &&
          item.execution.status !== "ok" &&
          item.execution.status !== "waived",
      ).length;

      return {
        id: cycle.id,
        cycleCode: cycle.cycleCode,
        cycleDate: cycle.cycleDate?.toISOString() ?? null,
        status: cycle.status,
        evidenceSummary: cycle.evidenceSummary,
        externalReference: cycle.externalReference,
        attachments: cycle.attachments ?? [],
        readinessSummary: {
          total: cycleExecutions.length,
          pending: cycleExecutions.filter(
            (item) => item.execution.status === "pending",
          ).length,
          criticalPending: criticalPendingCount,
        },
        readinessExecutions: cycleExecutions.map((item) => ({
          id: item.execution.id,
          checklistItemId: item.execution.checklistItemId,
          checklistTitle: item.checklistTitle,
          isCritical: item.checklistIsCritical,
          status: item.execution.status,
          executedById: item.execution.executedById,
          executedByName: item.executedByName ?? null,
          executedAt: item.execution.executedAt?.toISOString() ?? null,
          evidenceNote: item.execution.evidenceNote,
          attachments: item.execution.attachments ?? [],
        })),
        createdAt: cycle.createdAt.toISOString(),
        updatedAt: cycle.updatedAt.toISOString(),
      };
    }),
    changes: changes.map((item) => ({
      id: item.id,
      title: item.title,
      cycleEvidenceId: item.cycleEvidenceId,
      reason: item.reason,
      impactLevel: item.impactLevel,
      impactDescription: item.impactDescription,
      mitigationAction: item.mitigationAction,
      decision: item.decision,
      requestedById: item.requestedById,
      requestedByName: userNameById.get(item.requestedById) ?? null,
      approvedById: item.approvedById,
      approvedByName: item.approvedById
        ? (userNameById.get(item.approvedById) ?? null)
        : null,
      approvedAt: item.approvedAt?.toISOString() ?? null,
      risks: (risksByChange.get(item.id) ?? []).map((risk) => ({
        id: risk.id,
        title: risk.title,
        type: risk.type,
      })),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

router.get("/organizations/:orgId/governance/operational-plans", async (req, res): Promise<void> => {
  const params = parseOrReject(orgParamsSchema, req.params, res);
  if (!params) return;
  if (params.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const query = parseOrReject(listPlansQuerySchema, req.query, res);
  if (!query) return;

  const conditions = [eq(operationalPlansTable.organizationId, params.orgId)];

  if (query.status) conditions.push(eq(operationalPlansTable.status, query.status));
  if (query.unitId) conditions.push(eq(operationalPlansTable.unitId, query.unitId));
  if (query.processId) {
    conditions.push(eq(operationalPlansTable.processId, query.processId));
  }
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(operationalPlansTable.title, pattern),
        ilike(operationalPlansTable.planCode, pattern),
        ilike(operationalPlansTable.serviceType, pattern),
      )!,
    );
  }

  const plans = await db
    .select({
      plan: operationalPlansTable,
      unitName: unitsTable.name,
      responsibleName: employeesTable.name,
      processName: sgqProcessesTable.name,
    })
    .from(operationalPlansTable)
    .leftJoin(unitsTable, eq(operationalPlansTable.unitId, unitsTable.id))
    .leftJoin(
      employeesTable,
      eq(operationalPlansTable.responsibleId, employeesTable.id),
    )
    .leftJoin(
      sgqProcessesTable,
      eq(operationalPlansTable.processId, sgqProcessesTable.id),
    )
    .where(and(...conditions))
    .orderBy(desc(operationalPlansTable.updatedAt));

  const planIds = plans.map((item) => item.plan.id);
  const [checklistCounts, changeCounts, cycleRows] = await Promise.all([
    planIds.length
      ? db
          .select({
            planId: operationalReadinessChecklistsTable.planId,
            checklistItemId: operationalReadinessChecklistsTable.id,
          })
          .from(operationalReadinessChecklistsTable)
          .where(inArray(operationalReadinessChecklistsTable.planId, planIds))
      : Promise.resolve([]),
    planIds.length
      ? db
          .select({
            planId: operationalChangesTable.planId,
            decision: operationalChangesTable.decision,
          })
          .from(operationalChangesTable)
          .where(inArray(operationalChangesTable.planId, planIds))
      : Promise.resolve([]),
    planIds.length
      ? db
          .select({
            id: operationalCycleEvidencesTable.id,
            planId: operationalCycleEvidencesTable.planId,
            status: operationalCycleEvidencesTable.status,
            cycleCode: operationalCycleEvidencesTable.cycleCode,
            createdAt: operationalCycleEvidencesTable.createdAt,
          })
          .from(operationalCycleEvidencesTable)
          .where(inArray(operationalCycleEvidencesTable.planId, planIds))
          .orderBy(desc(operationalCycleEvidencesTable.createdAt))
      : Promise.resolve([]),
  ]);

  const checklistCountByPlan = new Map<number, number>();
  for (const item of checklistCounts) {
    checklistCountByPlan.set(
      item.planId,
      (checklistCountByPlan.get(item.planId) ?? 0) + 1,
    );
  }

  const pendingChangesByPlan = new Map<number, number>();
  for (const item of changeCounts) {
    if (item.decision !== "pending") continue;
    pendingChangesByPlan.set(
      item.planId,
      (pendingChangesByPlan.get(item.planId) ?? 0) + 1,
    );
  }

  const latestCycleByPlan = new Map<number, (typeof cycleRows)[number]>();
  for (const cycle of cycleRows) {
    if (!latestCycleByPlan.has(cycle.planId)) {
      latestCycleByPlan.set(cycle.planId, cycle);
    }
  }

  res.json(
    plans.map((item) => ({
      id: item.plan.id,
      organizationId: item.plan.organizationId,
      title: item.plan.title,
      planCode: item.plan.planCode,
      processId: item.plan.processId,
      processName: item.processName ?? null,
      unitId: item.plan.unitId,
      unitName: item.unitName ?? null,
      responsibleId: item.plan.responsibleId,
      responsibleName: item.responsibleName ?? null,
      serviceType: item.plan.serviceType,
      status: item.plan.status,
      currentRevisionNumber: item.plan.currentRevisionNumber,
      checklistItemCount: checklistCountByPlan.get(item.plan.id) ?? 0,
      pendingChangesCount: pendingChangesByPlan.get(item.plan.id) ?? 0,
      latestCycle: latestCycleByPlan.get(item.plan.id)
        ? {
            id: latestCycleByPlan.get(item.plan.id)!.id,
            cycleCode: latestCycleByPlan.get(item.plan.id)!.cycleCode,
            status: latestCycleByPlan.get(item.plan.id)!.status,
          }
        : null,
      createdAt: item.plan.createdAt.toISOString(),
      updatedAt: item.plan.updatedAt.toISOString(),
    })),
  );
});

router.post(
  "/organizations/:orgId/governance/operational-plans",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(createPlanBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertPlanReferences(params.orgId, body);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Referências inválidas" });
      return;
    }

    const [plan] = await db
      .insert(operationalPlansTable)
      .values({
        organizationId: params.orgId,
        title: body.title,
        planCode: body.planCode ?? null,
        processId: body.processId ?? null,
        unitId: body.unitId ?? null,
        responsibleId: body.responsibleId ?? null,
        serviceType: body.serviceType ?? null,
        scope: body.scope ?? null,
        sequenceDescription: body.sequenceDescription ?? null,
        executionCriteria: body.executionCriteria ?? null,
        requiredResources: normalizeTextArray(body.requiredResources),
        inputs: normalizeTextArray(body.inputs),
        outputs: normalizeTextArray(body.outputs),
        esgConsiderations: body.esgConsiderations ?? null,
        readinessBlockingEnabled: body.readinessBlockingEnabled ?? true,
        status: body.status ?? "draft",
        currentRevisionNumber: 1,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning();

    await Promise.all([
      syncPlanDocuments(plan.id, [...new Set(body.documentIds ?? [])]),
      syncPlanRiskLinks(plan.id, [...new Set(body.riskOpportunityItemIds ?? [])]),
    ]);
    await createPlanRevision(plan.id, req.auth!.userId, body.changeSummary ?? "Criação inicial do plano operacional");

    const detail = await serializePlanDetail(params.orgId, plan.id);
    res.status(201).json(detail);
  },
);

router.get(
  "/organizations/:orgId/governance/operational-plans/:planId",
  async (req, res): Promise<void> => {
    const params = parseOrReject(planParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const detail = await serializePlanDetail(params.orgId, params.planId);
    if (!detail) {
      res.status(404).json({ error: "Plano operacional não encontrado" });
      return;
    }

    res.json(detail);
  },
);

router.patch(
  "/organizations/:orgId/governance/operational-plans/:planId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(planParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(basePlanBodySchema, req.body, res);
    if (!body) return;

    const plan = await ensurePlan(params.orgId, params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plano operacional não encontrado" });
      return;
    }

    try {
      await assertPlanReferences(params.orgId, body);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Referências inválidas" });
      return;
    }

    const updateData: Partial<typeof operationalPlansTable.$inferInsert> = {
      updatedById: req.auth!.userId,
      currentRevisionNumber: plan.currentRevisionNumber + 1,
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.planCode !== undefined) updateData.planCode = body.planCode ?? null;
    if (body.processId !== undefined) updateData.processId = body.processId ?? null;
    if (body.unitId !== undefined) updateData.unitId = body.unitId ?? null;
    if (body.responsibleId !== undefined) {
      updateData.responsibleId = body.responsibleId ?? null;
    }
    if (body.serviceType !== undefined) updateData.serviceType = body.serviceType ?? null;
    if (body.scope !== undefined) updateData.scope = body.scope ?? null;
    if (body.sequenceDescription !== undefined) {
      updateData.sequenceDescription = body.sequenceDescription ?? null;
    }
    if (body.executionCriteria !== undefined) {
      updateData.executionCriteria = body.executionCriteria ?? null;
    }
    if (body.requiredResources !== undefined) {
      updateData.requiredResources = normalizeTextArray(body.requiredResources);
    }
    if (body.inputs !== undefined) updateData.inputs = normalizeTextArray(body.inputs);
    if (body.outputs !== undefined) updateData.outputs = normalizeTextArray(body.outputs);
    if (body.esgConsiderations !== undefined) {
      updateData.esgConsiderations = body.esgConsiderations ?? null;
    }
    if (body.readinessBlockingEnabled !== undefined) {
      updateData.readinessBlockingEnabled = body.readinessBlockingEnabled;
    }
    if (body.status !== undefined) updateData.status = body.status;

    await db
      .update(operationalPlansTable)
      .set(updateData)
      .where(eq(operationalPlansTable.id, params.planId));

    if (body.documentIds !== undefined) {
      await syncPlanDocuments(params.planId, [...new Set(body.documentIds)]);
    }
    if (body.riskOpportunityItemIds !== undefined) {
      await syncPlanRiskLinks(params.planId, [...new Set(body.riskOpportunityItemIds)]);
    }

    await createPlanRevision(
      params.planId,
      req.auth!.userId,
      body.changeSummary ?? "Revisão do plano operacional",
    );

    const detail = await serializePlanDetail(params.orgId, params.planId);
    res.json(detail);
  },
);

router.post(
  "/organizations/:orgId/governance/operational-plans/:planId/checklist-items",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(planParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(checklistBodySchema, req.body, res);
    if (!body) return;

    const plan = await ensurePlan(params.orgId, params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plano operacional não encontrado" });
      return;
    }

    const [item] = await db
      .insert(operationalReadinessChecklistsTable)
      .values({
        planId: params.planId,
        title: body.title,
        instructions: body.instructions ?? null,
        isCritical: body.isCritical ?? false,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    await seedChecklistExecutionsForExistingCycles(params.orgId, params.planId, item.id);
    await db
      .update(operationalPlansTable)
      .set({
        updatedById: req.auth!.userId,
        currentRevisionNumber: plan.currentRevisionNumber + 1,
      })
      .where(eq(operationalPlansTable.id, params.planId));
    await createPlanRevision(
      params.planId,
      req.auth!.userId,
      body.changeSummary ?? `Inclusão do item de prontidão "${body.title}"`,
    );

    const detail = await serializePlanDetail(params.orgId, params.planId);
    res.status(201).json(detail);
  },
);

router.patch(
  "/organizations/:orgId/governance/operational-plans/:planId/checklist-items/:checklistItemId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(checklistParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(updateChecklistBodySchema, req.body, res);
    if (!body) return;

    const plan = await ensurePlan(params.orgId, params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plano operacional não encontrado" });
      return;
    }

    const [updated] = await db
      .update(operationalReadinessChecklistsTable)
      .set({
        title: body.title,
        instructions: body.instructions,
        isCritical: body.isCritical,
        sortOrder: body.sortOrder,
      })
      .where(
        and(
          eq(operationalReadinessChecklistsTable.id, params.checklistItemId),
          eq(operationalReadinessChecklistsTable.planId, params.planId),
        ),
      )
      .returning({ id: operationalReadinessChecklistsTable.id });

    if (!updated) {
      res.status(404).json({ error: "Item de prontidão não encontrado" });
      return;
    }

    await db
      .update(operationalPlansTable)
      .set({
        updatedById: req.auth!.userId,
        currentRevisionNumber: plan.currentRevisionNumber + 1,
      })
      .where(eq(operationalPlansTable.id, params.planId));
    await createPlanRevision(
      params.planId,
      req.auth!.userId,
      body.changeSummary ?? "Atualização da checklist de prontidão",
    );

    const detail = await serializePlanDetail(params.orgId, params.planId);
    res.json(detail);
  },
);

router.delete(
  "/organizations/:orgId/governance/operational-plans/:planId/checklist-items/:checklistItemId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(checklistParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const plan = await ensurePlan(params.orgId, params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plano operacional não encontrado" });
      return;
    }

    await db
      .delete(operationalReadinessChecklistsTable)
      .where(
        and(
          eq(operationalReadinessChecklistsTable.id, params.checklistItemId),
          eq(operationalReadinessChecklistsTable.planId, params.planId),
        ),
      );

    await db
      .update(operationalPlansTable)
      .set({
        updatedById: req.auth!.userId,
        currentRevisionNumber: plan.currentRevisionNumber + 1,
      })
      .where(eq(operationalPlansTable.id, params.planId));
    await createPlanRevision(
      params.planId,
      req.auth!.userId,
      "Remoção de item da checklist de prontidão",
    );

    res.sendStatus(204);
  },
);

router.post(
  "/organizations/:orgId/governance/operational-plans/:planId/cycles",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(planParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(cycleBodySchema, req.body, res);
    if (!body) return;

    const plan = await ensurePlan(params.orgId, params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plano operacional não encontrado" });
      return;
    }

    const [cycle] = await db
      .insert(operationalCycleEvidencesTable)
      .values({
        organizationId: params.orgId,
        planId: params.planId,
        cycleCode: body.cycleCode,
        cycleDate: body.cycleDate ? new Date(body.cycleDate) : null,
        status: body.status ?? "planned",
        evidenceSummary: body.evidenceSummary ?? null,
        externalReference: body.externalReference ?? null,
        attachments: body.attachments ?? [],
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning();

    await seedReadinessExecutionsForCycle(params.orgId, cycle.id, params.planId);

    const detail = await serializePlanDetail(params.orgId, params.planId);
    res.status(201).json(detail);
  },
);

router.patch(
  "/organizations/:orgId/governance/operational-plans/:planId/cycles/:cycleId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(cycleParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(updateCycleBodySchema, req.body, res);
    if (!body) return;

    const plan = await ensurePlan(params.orgId, params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plano operacional não encontrado" });
      return;
    }

    const [cycle] = await db
      .select()
      .from(operationalCycleEvidencesTable)
      .where(
        and(
          eq(operationalCycleEvidencesTable.id, params.cycleId),
          eq(operationalCycleEvidencesTable.planId, params.planId),
          eq(operationalCycleEvidencesTable.organizationId, params.orgId),
        ),
      );

    if (!cycle) {
      res.status(404).json({ error: "Ciclo operacional não encontrado" });
      return;
    }

    const requestedStatus = body.status ?? cycle.status;
    if (
      plan.readinessBlockingEnabled &&
      ["ready", "in_execution", "completed"].includes(requestedStatus)
    ) {
      const criticalPendingCount = await getCriticalPendingCount(params.planId, params.cycleId);
      if (criticalPendingCount > 0) {
        res.status(400).json({
          error:
            "Existem itens críticos de prontidão pendentes. O ciclo não pode avançar.",
        });
        return;
      }
    }

    await db
      .update(operationalCycleEvidencesTable)
      .set({
        cycleCode: body.cycleCode,
        cycleDate:
          body.cycleDate !== undefined
            ? body.cycleDate
              ? new Date(body.cycleDate)
              : null
            : undefined,
        status: body.status,
        evidenceSummary: body.evidenceSummary,
        externalReference: body.externalReference,
        attachments: body.attachments,
        updatedById: req.auth!.userId,
      })
      .where(eq(operationalCycleEvidencesTable.id, params.cycleId));

    const detail = await serializePlanDetail(params.orgId, params.planId);
    res.json(detail);
  },
);

router.patch(
  "/organizations/:orgId/governance/operational-plans/:planId/cycles/:cycleId/readiness-items/:checklistItemId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(readinessExecutionParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(readinessExecutionBodySchema, req.body, res);
    if (!body) return;

    const [execution] = await db
      .select()
      .from(operationalReadinessExecutionsTable)
      .where(
        and(
          eq(operationalReadinessExecutionsTable.organizationId, params.orgId),
          eq(operationalReadinessExecutionsTable.cycleEvidenceId, params.cycleId),
          eq(operationalReadinessExecutionsTable.checklistItemId, params.checklistItemId),
        ),
      );

    if (!execution) {
      res.status(404).json({ error: "Execução de prontidão não encontrada" });
      return;
    }

    if (body.executedById) {
      const [employee] = await db
        .select({ id: employeesTable.id })
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.id, body.executedById),
            eq(employeesTable.organizationId, params.orgId),
          ),
        );
      if (!employee) {
        res.status(400).json({ error: "Responsável pela execução inválido" });
        return;
      }
    }

    await db
      .update(operationalReadinessExecutionsTable)
      .set({
        status: body.status,
        executedById: body.executedById ?? null,
        executedAt:
          body.status === "pending"
            ? null
            : body.executedAt
              ? new Date(body.executedAt)
              : new Date(),
        evidenceNote: body.evidenceNote ?? null,
        attachments: body.attachments ?? [],
      })
      .where(eq(operationalReadinessExecutionsTable.id, execution.id));

    const detail = await serializePlanDetail(params.orgId, params.planId);
    res.json(detail);
  },
);

router.post(
  "/organizations/:orgId/governance/operational-plans/:planId/changes",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(planParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(changeBodySchema, req.body, res);
    if (!body) return;

    const plan = await ensurePlan(params.orgId, params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plano operacional não encontrado" });
      return;
    }

    if (body.cycleEvidenceId) {
      const cycle = await ensureCycleBelongsToPlan(
        params.orgId,
        params.planId,
        body.cycleEvidenceId,
      );
      if (!cycle) {
        res.status(400).json({ error: "Ciclo operacional inválido para este plano" });
        return;
      }
    }

    const impactLevel = body.impactLevel ?? "medium";
    if (
      ["high", "critical"].includes(impactLevel) &&
      !body.mitigationAction?.trim()
    ) {
      res.status(400).json({
        error: "Mudanças com impacto relevante exigem ação mitigatória registrada",
      });
      return;
    }

    if (
      impactLevel === "critical" &&
      body.decision === "approved" &&
      !["org_admin", "platform_admin"].includes(req.auth!.role)
    ) {
      res.status(403).json({
        error: "Mudanças operacionais críticas devem ser aprovadas por um administrador da organização",
      });
      return;
    }

    try {
      await assertRiskIds(params.orgId, [...new Set(body.riskOpportunityItemIds ?? [])]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Riscos inválidos" });
      return;
    }

    const [change] = await db
      .insert(operationalChangesTable)
      .values({
        organizationId: params.orgId,
        planId: params.planId,
        cycleEvidenceId: body.cycleEvidenceId ?? null,
        title: body.title,
        reason: body.reason,
        impactLevel,
        impactDescription: body.impactDescription ?? null,
        mitigationAction: body.mitigationAction ?? null,
        decision: body.decision ?? "pending",
        requestedById: req.auth!.userId,
        approvedById:
          body.decision === "approved" ? req.auth!.userId : null,
        approvedAt: body.decision === "approved" ? new Date() : null,
      })
      .returning();

    await syncChangeRiskLinks(change.id, [...new Set(body.riskOpportunityItemIds ?? [])]);

    const detail = await serializePlanDetail(params.orgId, params.planId);
    res.status(201).json(detail);
  },
);

router.patch(
  "/organizations/:orgId/governance/operational-plans/:planId/changes/:changeId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(changeParamsSchema, req.params, res);
    if (!params) return;
    if (params.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = parseOrReject(updateChangeBodySchema, req.body, res);
    if (!body) return;

    const [change] = await db
      .select()
      .from(operationalChangesTable)
      .where(
        and(
          eq(operationalChangesTable.id, params.changeId),
          eq(operationalChangesTable.planId, params.planId),
          eq(operationalChangesTable.organizationId, params.orgId),
        ),
      );

    if (!change) {
      res.status(404).json({ error: "Mudança operacional não encontrada" });
      return;
    }

    if (body.cycleEvidenceId) {
      const cycle = await ensureCycleBelongsToPlan(
        params.orgId,
        params.planId,
        body.cycleEvidenceId,
      );
      if (!cycle) {
        res.status(400).json({ error: "Ciclo operacional inválido para este plano" });
        return;
      }
    }

    const nextImpactLevel = body.impactLevel ?? change.impactLevel;
    const nextMitigationAction = body.mitigationAction ?? change.mitigationAction;
    const nextDecision = body.decision ?? change.decision;

    if (
      ["high", "critical"].includes(nextImpactLevel) &&
      !nextMitigationAction?.trim()
    ) {
      res.status(400).json({
        error: "Mudanças com impacto relevante exigem ação mitigatória registrada",
      });
      return;
    }

    if (
      nextImpactLevel === "critical" &&
      nextDecision === "approved" &&
      !["org_admin", "platform_admin"].includes(req.auth!.role)
    ) {
      res.status(403).json({
        error: "Mudanças operacionais críticas devem ser aprovadas por um administrador da organização",
      });
      return;
    }

    try {
      if (body.riskOpportunityItemIds !== undefined) {
        await assertRiskIds(params.orgId, [...new Set(body.riskOpportunityItemIds)]);
      }
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Riscos inválidos" });
      return;
    }

    await db
      .update(operationalChangesTable)
      .set({
        title: body.title,
        cycleEvidenceId: body.cycleEvidenceId,
        reason: body.reason,
        impactLevel: body.impactLevel,
        impactDescription: body.impactDescription,
        mitigationAction: body.mitigationAction,
        decision: body.decision,
        approvedById:
          body.decision === "approved"
            ? req.auth!.userId
            : body.decision === "pending"
              ? null
              : change.approvedById,
        approvedAt:
          body.decision === "approved"
            ? new Date()
            : body.decision === "pending"
              ? null
              : change.approvedAt,
      })
      .where(eq(operationalChangesTable.id, params.changeId));

    if (body.riskOpportunityItemIds !== undefined) {
      await syncChangeRiskLinks(params.changeId, [...new Set(body.riskOpportunityItemIds)]);
    }

    const detail = await serializePlanDetail(params.orgId, params.planId);
    res.json(detail);
  },
);

export default router;
