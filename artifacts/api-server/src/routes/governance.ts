import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  documentAttachmentsTable,
  strategicPlanActionsTable,
  strategicPlanActionUnitsTable,
  strategicPlanInterestedPartiesTable,
  strategicPlanObjectivesTable,
  strategicPlanRevisionsTable,
  strategicPlansTable,
  strategicPlanSwotItemsTable,
  unitsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRole, requireWriteAccess } from "../middlewares/auth";
import {
  assertEditableStatus,
  createStrategicPlanRevision,
  ensureStrategicPlanMaintenance,
  getStrategicPlanDetail,
} from "../lib/governance";

const router: IRouter = Router();

const paramsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive().optional(),
  itemId: z.coerce.number().int().positive().optional(),
});

const planBodySchema = z.object({
  title: z.string().min(1).optional(),
  standards: z.array(z.string().min(1)).optional(),
  executiveSummary: z.string().nullable().optional(),
  reviewFrequencyMonths: z.number().int().min(1).max(36).optional(),
  nextReviewAt: z.string().datetime().nullable().optional(),
  reviewReason: z.string().nullable().optional(),
  climateChangeRelevant: z.boolean().nullable().optional(),
  climateChangeJustification: z.string().nullable().optional(),
  technicalScope: z.string().nullable().optional(),
  geographicScope: z.string().nullable().optional(),
  policy: z.string().nullable().optional(),
  mission: z.string().nullable().optional(),
  vision: z.string().nullable().optional(),
  values: z.string().nullable().optional(),
  strategicConclusion: z.string().nullable().optional(),
  methodologyNotes: z.string().nullable().optional(),
  legacyMethodology: z.string().nullable().optional(),
  legacyIndicatorsNotes: z.string().nullable().optional(),
  legacyRevisionHistory: z
    .array(
      z.object({
        date: z.string().nullable().optional(),
        reason: z.string().nullable().optional(),
        changedItem: z.string().nullable().optional(),
        revision: z.string().nullable().optional(),
        changedBy: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  importedWorkbookName: z.string().nullable().optional(),
});

const swotBodySchema = z.object({
  domain: z.enum(["sgq", "sga", "sgsv", "esg", "governance"]),
  matrixLabel: z.string().nullable().optional(),
  swotType: z.enum(["strength", "weakness", "opportunity", "threat"]),
  environment: z.enum(["internal", "external"]),
  perspective: z.string().nullable().optional(),
  description: z.string().min(1),
  performance: z.number().int().min(0).max(20).nullable().optional(),
  relevance: z.number().int().min(0).max(20).nullable().optional(),
  result: z.number().int().min(0).max(100).nullable().optional(),
  treatmentDecision: z.string().nullable().optional(),
  linkedObjectiveCode: z.string().nullable().optional(),
  linkedObjectiveLabel: z.string().nullable().optional(),
  importedActionReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const interestedPartyBodySchema = z.object({
  name: z.string().min(1),
  expectedRequirements: z.string().nullable().optional(),
  roleInCompany: z.string().nullable().optional(),
  roleSummary: z.string().nullable().optional(),
  relevantToManagementSystem: z.boolean().nullable().optional(),
  legalRequirementApplicable: z.boolean().nullable().optional(),
  monitoringMethod: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const objectiveBodySchema = z.object({
  code: z.string().min(1),
  systemDomain: z.string().nullable().optional(),
  description: z.string().min(1),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const actionBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  swotItemId: z.number().int().positive().nullable().optional(),
  objectiveId: z.number().int().positive().nullable().optional(),
  responsibleUserId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(["pending", "in_progress", "done", "canceled"]).optional(),
  notes: z.string().nullable().optional(),
  unitIds: z.array(z.number().int().positive()).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const importBodySchema = z.object({
  workbookName: z.string().nullable().optional(),
  plan: planBodySchema.extend({
    title: z.string().min(1),
  }),
  swotItems: z
    .array(
      swotBodySchema.extend({
        importKey: z.string().nullable().optional(),
      }),
    )
    .default([]),
  interestedParties: z.array(interestedPartyBodySchema).default([]),
  objectives: z
    .array(
      objectiveBodySchema.extend({
        importKey: z.string().nullable().optional(),
      }),
    )
    .default([]),
  actions: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        swotImportKey: z.string().nullable().optional(),
        objectiveCode: z.string().nullable().optional(),
        responsibleUserId: z.number().int().positive().nullable().optional(),
        dueDate: z.string().datetime().nullable().optional(),
        status: z.enum(["pending", "in_progress", "done", "canceled"]).optional(),
        notes: z.string().nullable().optional(),
        unitIds: z.array(z.number().int().positive()).optional(),
        sortOrder: z.number().int().min(0).optional(),
      }),
    )
    .default([]),
});

const reviewBodySchema = z.object({
  reviewReason: z.string().nullable().optional(),
  changeSummary: z.string().nullable().optional(),
});

function ensureOrgAccess(orgId: number, authOrgId: number) {
  return orgId === authOrgId;
}

async function getPlanOrThrow(planId: number, orgId: number, res: any) {
  const [plan] = await db
    .select()
    .from(strategicPlansTable)
    .where(and(eq(strategicPlansTable.id, planId), eq(strategicPlansTable.organizationId, orgId)));

  if (!plan) {
    res.status(404).json({ error: "Plano estratégico não encontrado" });
    return null;
  }

  return plan;
}

async function validateActionReferences({
  orgId,
  planId,
  responsibleUserId,
  swotItemId,
  objectiveId,
  unitIds,
}: {
  orgId: number;
  planId: number;
  responsibleUserId?: number | null;
  swotItemId?: number | null;
  objectiveId?: number | null;
  unitIds: number[];
}) {
  if (responsibleUserId) {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, responsibleUserId), eq(usersTable.organizationId, orgId)));
    if (!user) return "Responsável inválido para esta organização";
  }

  if (swotItemId) {
    const [item] = await db
      .select({ id: strategicPlanSwotItemsTable.id })
      .from(strategicPlanSwotItemsTable)
      .where(
        and(eq(strategicPlanSwotItemsTable.id, swotItemId), eq(strategicPlanSwotItemsTable.planId, planId)),
      );
    if (!item) return "Item SWOT vinculado não pertence ao plano";
  }

  if (objectiveId) {
    const [objective] = await db
      .select({ id: strategicPlanObjectivesTable.id })
      .from(strategicPlanObjectivesTable)
      .where(
        and(
          eq(strategicPlanObjectivesTable.id, objectiveId),
          eq(strategicPlanObjectivesTable.planId, planId),
        ),
      );
    if (!objective) return "Objetivo vinculado não pertence ao plano";
  }

  if (unitIds.length > 0) {
    const units = await db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(and(eq(unitsTable.organizationId, orgId), inArray(unitsTable.id, unitIds)));
    if (units.length !== unitIds.length) return "Uma ou mais unidades não pertencem à organização";
  }

  return null;
}

router.get("/organizations/:orgId/governance/strategic-plans", requireAuth, async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  await ensureStrategicPlanMaintenance(params.data.orgId);

  const plans = await db
    .select({ id: strategicPlansTable.id })
    .from(strategicPlansTable)
    .where(eq(strategicPlansTable.organizationId, params.data.orgId))
    .orderBy(desc(strategicPlansTable.updatedAt));

  const details = await Promise.all(
    plans.map((plan) => getStrategicPlanDetail(plan.id, params.data.orgId)),
  );

  res.json(details.filter(Boolean));
});

router.post(
  "/organizations/:orgId/governance/strategic-plans",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = planBodySchema.extend({ title: z.string().min(1) }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const existing = await db
      .select({ id: strategicPlansTable.id })
      .from(strategicPlansTable)
      .where(
        and(
          eq(strategicPlansTable.organizationId, params.data.orgId),
          inArray(strategicPlansTable.status, ["draft", "in_review", "approved", "rejected", "overdue"]),
        ),
      );

    if (existing.length > 0) {
      res.status(409).json({ error: "A organização já possui um planejamento estratégico ativo" });
      return;
    }

    const [plan] = await db
      .insert(strategicPlansTable)
      .values({
        organizationId: params.data.orgId,
        title: body.data.title,
        standards: body.data.standards || ["ISO 9001:2015"],
        executiveSummary: body.data.executiveSummary ?? null,
        reviewFrequencyMonths: body.data.reviewFrequencyMonths || 12,
        nextReviewAt: body.data.nextReviewAt ? new Date(body.data.nextReviewAt) : null,
        reviewReason: body.data.reviewReason ?? null,
        climateChangeRelevant:
          typeof body.data.climateChangeRelevant === "boolean"
            ? body.data.climateChangeRelevant
            : null,
        climateChangeJustification: body.data.climateChangeJustification ?? null,
        technicalScope: body.data.technicalScope ?? null,
        geographicScope: body.data.geographicScope ?? null,
        policy: body.data.policy ?? null,
        mission: body.data.mission ?? null,
        vision: body.data.vision ?? null,
        values: body.data.values ?? null,
        strategicConclusion: body.data.strategicConclusion ?? null,
        methodologyNotes: body.data.methodologyNotes ?? null,
        legacyMethodology: body.data.legacyMethodology ?? null,
        legacyIndicatorsNotes: body.data.legacyIndicatorsNotes ?? null,
        legacyRevisionHistory: body.data.legacyRevisionHistory ?? [],
        importedWorkbookName: body.data.importedWorkbookName ?? null,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning();

    res.status(201).json(await getStrategicPlanDetail(plan.id, params.data.orgId));
  },
);

router.get("/organizations/:orgId/governance/strategic-plans/:planId", requireAuth, async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (
    !params.success ||
    !params.data.planId ||
    !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)
  ) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  await ensureStrategicPlanMaintenance(params.data.orgId);
  const detail = await getStrategicPlanDetail(params.data.planId, params.data.orgId);
  if (!detail) {
    res.status(404).json({ error: "Plano estratégico não encontrado" });
    return;
  }
  res.json(detail);
});

router.patch(
  "/organizations/:orgId/governance/strategic-plans/:planId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = paramsSchema.safeParse(req.params);
    if (
      !params.success ||
      !params.data.planId ||
      !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = planBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
    if (!plan) return;
    if (!assertEditableStatus(plan.status)) {
      res.status(400).json({ error: "Somente planos em rascunho ou rejeitados podem ser editados" });
      return;
    }

    const updateData: Record<string, unknown> = {
      updatedById: req.auth!.userId,
    };

    for (const [key, value] of Object.entries(body.data)) {
      if (value === undefined) continue;
      if (key === "nextReviewAt") {
        updateData[key] = value ? new Date(value as string) : null;
        continue;
      }
      updateData[key] = value;
    }

    await db
      .update(strategicPlansTable)
      .set(updateData)
      .where(eq(strategicPlansTable.id, params.data.planId));

    res.json(await getStrategicPlanDetail(params.data.planId, params.data.orgId));
  },
);

router.post(
  "/organizations/:orgId/governance/strategic-plans/:planId/import",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = paramsSchema.safeParse(req.params);
    if (
      !params.success ||
      !params.data.planId ||
      !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = importBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
    if (!plan) return;
    if (!assertEditableStatus(plan.status)) {
      res.status(400).json({ error: "A importação só pode sobrescrever um plano em rascunho ou rejeitado" });
      return;
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(strategicPlansTable)
          .set({
            title: body.data.plan.title,
            standards: body.data.plan.standards || ["ISO 9001:2015"],
            executiveSummary: body.data.plan.executiveSummary ?? null,
            reviewFrequencyMonths: body.data.plan.reviewFrequencyMonths || 12,
            nextReviewAt: body.data.plan.nextReviewAt ? new Date(body.data.plan.nextReviewAt) : null,
            reviewReason: body.data.plan.reviewReason ?? null,
            climateChangeRelevant:
              typeof body.data.plan.climateChangeRelevant === "boolean"
                ? body.data.plan.climateChangeRelevant
                : null,
            climateChangeJustification: body.data.plan.climateChangeJustification ?? null,
            technicalScope: body.data.plan.technicalScope ?? null,
            geographicScope: body.data.plan.geographicScope ?? null,
            policy: body.data.plan.policy ?? null,
            mission: body.data.plan.mission ?? null,
            vision: body.data.plan.vision ?? null,
            values: body.data.plan.values ?? null,
            strategicConclusion: body.data.plan.strategicConclusion ?? null,
            methodologyNotes: body.data.plan.methodologyNotes ?? null,
            legacyMethodology: body.data.plan.legacyMethodology ?? null,
            legacyIndicatorsNotes: body.data.plan.legacyIndicatorsNotes ?? null,
            legacyRevisionHistory: body.data.plan.legacyRevisionHistory ?? [],
            importedWorkbookName:
              body.data.workbookName ?? body.data.plan.importedWorkbookName ?? null,
            updatedById: req.auth!.userId,
          })
          .where(eq(strategicPlansTable.id, plan.id));

        const existingActionIds = await tx
          .select({ id: strategicPlanActionsTable.id })
          .from(strategicPlanActionsTable)
          .where(eq(strategicPlanActionsTable.planId, plan.id));

        if (existingActionIds.length > 0) {
          await tx
            .delete(strategicPlanActionUnitsTable)
            .where(
              inArray(
                strategicPlanActionUnitsTable.actionId,
                existingActionIds.map((row) => row.id),
              ),
            );
        }

        await tx.delete(strategicPlanActionsTable).where(eq(strategicPlanActionsTable.planId, plan.id));
        await tx.delete(strategicPlanObjectivesTable).where(eq(strategicPlanObjectivesTable.planId, plan.id));
        await tx.delete(strategicPlanInterestedPartiesTable).where(eq(strategicPlanInterestedPartiesTable.planId, plan.id));
        await tx.delete(strategicPlanSwotItemsTable).where(eq(strategicPlanSwotItemsTable.planId, plan.id));

      const swotKeyToId = new Map<string, number>();
      const objectiveCodeToId = new Map<string, number>();

      for (const item of body.data.swotItems) {
        const [inserted] = await tx
          .insert(strategicPlanSwotItemsTable)
          .values({
            planId: plan.id,
            domain: item.domain,
            matrixLabel: item.matrixLabel ?? null,
            swotType: item.swotType,
            environment: item.environment,
            perspective: item.perspective ?? null,
            description: item.description,
            performance: item.performance ?? null,
            relevance: item.relevance ?? null,
            result: item.result ?? null,
            treatmentDecision: item.treatmentDecision ?? null,
            linkedObjectiveCode: item.linkedObjectiveCode ?? null,
            linkedObjectiveLabel: item.linkedObjectiveLabel ?? null,
            importedActionReference: item.importedActionReference ?? null,
            notes: item.notes ?? null,
            sortOrder: item.sortOrder ?? 0,
          })
          .returning({ id: strategicPlanSwotItemsTable.id });
        if (item.importKey) swotKeyToId.set(item.importKey, inserted.id);
      }

      for (const item of body.data.interestedParties) {
        await tx.insert(strategicPlanInterestedPartiesTable).values({
          planId: plan.id,
          name: item.name,
          expectedRequirements: item.expectedRequirements ?? null,
          roleInCompany: item.roleInCompany ?? null,
          roleSummary: item.roleSummary ?? null,
          relevantToManagementSystem:
            typeof item.relevantToManagementSystem === "boolean"
              ? item.relevantToManagementSystem
              : null,
          legalRequirementApplicable:
            typeof item.legalRequirementApplicable === "boolean"
              ? item.legalRequirementApplicable
              : null,
          monitoringMethod: item.monitoringMethod ?? null,
          notes: item.notes ?? null,
          sortOrder: item.sortOrder ?? 0,
        });
      }

      for (const item of body.data.objectives) {
        const [inserted] = await tx
          .insert(strategicPlanObjectivesTable)
          .values({
            planId: plan.id,
            code: item.code,
            systemDomain: item.systemDomain ?? null,
            description: item.description,
            notes: item.notes ?? null,
            sortOrder: item.sortOrder ?? 0,
          })
          .returning({ id: strategicPlanObjectivesTable.id });
        objectiveCodeToId.set(item.code, inserted.id);
        if (item.importKey) objectiveCodeToId.set(item.importKey, inserted.id);
      }

      for (const item of body.data.actions) {
        const validationError = await validateActionReferences({
          orgId: params.data.orgId,
          planId: plan.id,
          responsibleUserId: item.responsibleUserId ?? null,
          swotItemId: item.swotImportKey ? swotKeyToId.get(item.swotImportKey) ?? null : null,
          objectiveId: item.objectiveCode ? objectiveCodeToId.get(item.objectiveCode) ?? null : null,
          unitIds: item.unitIds || [],
        });

        if (validationError) {
          throw new Error(validationError);
        }

        const [action] = await tx
          .insert(strategicPlanActionsTable)
          .values({
            planId: plan.id,
            title: item.title,
            description: item.description ?? null,
            swotItemId: item.swotImportKey ? swotKeyToId.get(item.swotImportKey) ?? null : null,
            objectiveId: item.objectiveCode ? objectiveCodeToId.get(item.objectiveCode) ?? null : null,
            responsibleUserId: item.responsibleUserId ?? null,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            status: item.status ?? "pending",
            notes: item.notes ?? null,
            sortOrder: item.sortOrder ?? 0,
          })
          .returning({ id: strategicPlanActionsTable.id });

        if ((item.unitIds || []).length > 0) {
          await tx.insert(strategicPlanActionUnitsTable).values(
            (item.unitIds || []).map((unitId: number) => ({
              actionId: action.id,
              unitId,
            })),
          );
        }
      }
    });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Falha ao importar planejamento";
      res.status(400).json({ error: message });
      return;
    }

    res.json(await getStrategicPlanDetail(plan.id, params.data.orgId));
  },
);

router.post(
  "/organizations/:orgId/governance/strategic-plans/:planId/submit",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = paramsSchema.safeParse(req.params);
    if (
      !params.success ||
      !params.data.planId ||
      !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
    if (!plan) return;
    if (!assertEditableStatus(plan.status)) {
      res.status(400).json({ error: "Somente planos em rascunho ou rejeitados podem ser submetidos" });
      return;
    }

    await db
      .update(strategicPlansTable)
      .set({
        status: "in_review",
        submittedAt: new Date(),
        updatedById: req.auth!.userId,
      })
      .where(eq(strategicPlansTable.id, plan.id));

    res.json(await getStrategicPlanDetail(plan.id, params.data.orgId));
  },
);

router.post(
  "/organizations/:orgId/governance/strategic-plans/:planId/approve",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = paramsSchema.safeParse(req.params);
    if (
      !params.success ||
      !params.data.planId ||
      !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = reviewBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
    if (!plan) return;
    if (plan.status !== "in_review") {
      res.status(400).json({ error: "Somente planos em revisão podem ser aprovados" });
      return;
    }

    const detail = await getStrategicPlanDetail(plan.id, params.data.orgId);
    if (!detail) {
      res.status(404).json({ error: "Plano estratégico não encontrado" });
      return;
    }
    if (detail.complianceIssues.length > 0) {
      res.status(400).json({
        error: "O plano ainda possui pendências impeditivas para aprovação",
        issues: detail.complianceIssues,
      });
      return;
    }

    await createStrategicPlanRevision({
      planId: plan.id,
      approvedById: req.auth!.userId,
      reason: body.data.reviewReason ?? plan.reviewReason ?? null,
      changeSummary: body.data.changeSummary ?? null,
    });

    await db
      .update(strategicPlansTable)
      .set({
        status: "approved",
        rejectedAt: null,
        updatedById: req.auth!.userId,
      })
      .where(eq(strategicPlansTable.id, plan.id));

    res.json(await getStrategicPlanDetail(plan.id, params.data.orgId));
  },
);

router.post(
  "/organizations/:orgId/governance/strategic-plans/:planId/reject",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = paramsSchema.safeParse(req.params);
    if (
      !params.success ||
      !params.data.planId ||
      !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = reviewBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
    if (!plan) return;
    if (plan.status !== "in_review") {
      res.status(400).json({ error: "Somente planos em revisão podem ser rejeitados" });
      return;
    }

    await db
      .update(strategicPlansTable)
      .set({
        status: "rejected",
        reviewReason: body.data.reviewReason ?? plan.reviewReason ?? null,
        rejectedAt: new Date(),
        updatedById: req.auth!.userId,
      })
      .where(eq(strategicPlansTable.id, plan.id));

    res.json(await getStrategicPlanDetail(plan.id, params.data.orgId));
  },
);

router.post(
  "/organizations/:orgId/governance/strategic-plans/:planId/reopen",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = paramsSchema.safeParse(req.params);
    if (
      !params.success ||
      !params.data.planId ||
      !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
    if (!plan) return;
    if (!["approved", "overdue", "rejected"].includes(plan.status)) {
      res.status(400).json({ error: "Este plano não pode ser reaberto" });
      return;
    }

    await db
      .update(strategicPlansTable)
      .set({
        status: "draft",
        updatedById: req.auth!.userId,
      })
      .where(eq(strategicPlansTable.id, plan.id));

    res.json(await getStrategicPlanDetail(plan.id, params.data.orgId));
  },
);

router.get(
  "/organizations/:orgId/governance/strategic-plans/:planId/export",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = paramsSchema.safeParse(req.params);
    if (
      !params.success ||
      !params.data.planId ||
      !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [revision] = await db
      .select()
      .from(strategicPlanRevisionsTable)
      .where(eq(strategicPlanRevisionsTable.planId, params.data.planId))
      .orderBy(desc(strategicPlanRevisionsTable.revisionNumber))
      .limit(1);

    if (!revision?.evidenceDocumentId) {
      res.status(404).json({ error: "Nenhuma evidência formal aprovada foi encontrada" });
      return;
    }

    const [attachment] = await db
      .select()
      .from(documentAttachmentsTable)
      .where(eq(documentAttachmentsTable.documentId, revision.evidenceDocumentId))
      .orderBy(desc(documentAttachmentsTable.versionNumber))
      .limit(1);

    if (!attachment) {
      res.status(404).json({ error: "Anexo da evidência não encontrado" });
      return;
    }

    res.json({
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      evidenceDocumentId: revision.evidenceDocumentId,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      objectPath: attachment.objectPath,
      uploadedAt: attachment.uploadedAt.toISOString(),
    });
  },
);

router.get("/organizations/:orgId/governance/strategic-plans/:planId/swot-items", requireAuth, async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (
    !params.success ||
    !params.data.planId ||
    !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)
  ) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const detail = await getStrategicPlanDetail(params.data.planId, params.data.orgId);
  res.json(detail?.swotItems || []);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/swot-items", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const body = swotBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  const [item] = await db.insert(strategicPlanSwotItemsTable).values({
    planId: plan.id,
    ...body.data,
    matrixLabel: body.data.matrixLabel ?? null,
    perspective: body.data.perspective ?? null,
    performance: body.data.performance ?? null,
    relevance: body.data.relevance ?? null,
    result: body.data.result ?? null,
    treatmentDecision: body.data.treatmentDecision ?? null,
    linkedObjectiveCode: body.data.linkedObjectiveCode ?? null,
    linkedObjectiveLabel: body.data.linkedObjectiveLabel ?? null,
    importedActionReference: body.data.importedActionReference ?? null,
    notes: body.data.notes ?? null,
    sortOrder: body.data.sortOrder ?? 0,
  }).returning();
  res.status(201).json({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
});

router.patch("/organizations/:orgId/governance/strategic-plans/:planId/swot-items/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !params.data.itemId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const body = swotBodySchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  const [item] = await db.update(strategicPlanSwotItemsTable).set(body.data).where(and(eq(strategicPlanSwotItemsTable.id, params.data.itemId), eq(strategicPlanSwotItemsTable.planId, plan.id))).returning();
  if (!item) {
    res.status(404).json({ error: "Item SWOT não encontrado" });
    return;
  }
  res.json({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
});

router.delete("/organizations/:orgId/governance/strategic-plans/:planId/swot-items/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !params.data.itemId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  await db.delete(strategicPlanSwotItemsTable).where(and(eq(strategicPlanSwotItemsTable.id, params.data.itemId), eq(strategicPlanSwotItemsTable.planId, plan.id)));
  res.sendStatus(204);
});

router.get("/organizations/:orgId/governance/strategic-plans/:planId/interested-parties", requireAuth, async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const detail = await getStrategicPlanDetail(params.data.planId, params.data.orgId);
  res.json(detail?.interestedParties || []);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/interested-parties", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const body = interestedPartyBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  const [item] = await db.insert(strategicPlanInterestedPartiesTable).values({
    planId: plan.id,
    ...body.data,
    expectedRequirements: body.data.expectedRequirements ?? null,
    roleInCompany: body.data.roleInCompany ?? null,
    roleSummary: body.data.roleSummary ?? null,
    relevantToManagementSystem: typeof body.data.relevantToManagementSystem === "boolean" ? body.data.relevantToManagementSystem : null,
    legalRequirementApplicable: typeof body.data.legalRequirementApplicable === "boolean" ? body.data.legalRequirementApplicable : null,
    monitoringMethod: body.data.monitoringMethod ?? null,
    notes: body.data.notes ?? null,
    sortOrder: body.data.sortOrder ?? 0,
  }).returning();
  res.status(201).json({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
});

router.patch("/organizations/:orgId/governance/strategic-plans/:planId/interested-parties/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !params.data.itemId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const body = interestedPartyBodySchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  const [item] = await db.update(strategicPlanInterestedPartiesTable).set(body.data).where(and(eq(strategicPlanInterestedPartiesTable.id, params.data.itemId), eq(strategicPlanInterestedPartiesTable.planId, plan.id))).returning();
  if (!item) {
    res.status(404).json({ error: "Parte interessada não encontrada" });
    return;
  }
  res.json({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
});

router.delete("/organizations/:orgId/governance/strategic-plans/:planId/interested-parties/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !params.data.itemId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  await db.delete(strategicPlanInterestedPartiesTable).where(and(eq(strategicPlanInterestedPartiesTable.id, params.data.itemId), eq(strategicPlanInterestedPartiesTable.planId, plan.id)));
  res.sendStatus(204);
});

router.get("/organizations/:orgId/governance/strategic-plans/:planId/objectives", requireAuth, async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const detail = await getStrategicPlanDetail(params.data.planId, params.data.orgId);
  res.json(detail?.objectives || []);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/objectives", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const body = objectiveBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  const [item] = await db.insert(strategicPlanObjectivesTable).values({
    planId: plan.id,
    code: body.data.code,
    systemDomain: body.data.systemDomain ?? null,
    description: body.data.description,
    notes: body.data.notes ?? null,
    sortOrder: body.data.sortOrder ?? 0,
  }).returning();
  res.status(201).json({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
});

router.patch("/organizations/:orgId/governance/strategic-plans/:planId/objectives/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !params.data.itemId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const body = objectiveBodySchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  const [item] = await db.update(strategicPlanObjectivesTable).set(body.data).where(and(eq(strategicPlanObjectivesTable.id, params.data.itemId), eq(strategicPlanObjectivesTable.planId, plan.id))).returning();
  if (!item) {
    res.status(404).json({ error: "Objetivo não encontrado" });
    return;
  }
  res.json({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
});

router.delete("/organizations/:orgId/governance/strategic-plans/:planId/objectives/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !params.data.itemId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  await db.delete(strategicPlanObjectivesTable).where(and(eq(strategicPlanObjectivesTable.id, params.data.itemId), eq(strategicPlanObjectivesTable.planId, plan.id)));
  res.sendStatus(204);
});

router.get("/organizations/:orgId/governance/strategic-plans/:planId/actions", requireAuth, async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const detail = await getStrategicPlanDetail(params.data.planId, params.data.orgId);
  res.json(detail?.actions || []);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/actions", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const body = actionBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  const validationError = await validateActionReferences({
    orgId: params.data.orgId,
    planId: plan.id,
    responsibleUserId: body.data.responsibleUserId ?? null,
    swotItemId: body.data.swotItemId ?? null,
    objectiveId: body.data.objectiveId ?? null,
    unitIds: body.data.unitIds || [],
  });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const [item] = await db.insert(strategicPlanActionsTable).values({
    planId: plan.id,
    title: body.data.title,
    description: body.data.description ?? null,
    swotItemId: body.data.swotItemId ?? null,
    objectiveId: body.data.objectiveId ?? null,
    responsibleUserId: body.data.responsibleUserId ?? null,
    dueDate: body.data.dueDate ? new Date(body.data.dueDate) : null,
    status: body.data.status ?? "pending",
    notes: body.data.notes ?? null,
    sortOrder: body.data.sortOrder ?? 0,
  }).returning();
  if ((body.data.unitIds || []).length > 0) {
    await db.insert(strategicPlanActionUnitsTable).values(
      (body.data.unitIds || []).map((unitId: number) => ({
        actionId: item.id,
        unitId,
      })),
    );
  }
  res.status(201).json((await getStrategicPlanDetail(plan.id, params.data.orgId))?.actions.find((action) => action.id === item.id));
});

router.patch("/organizations/:orgId/governance/strategic-plans/:planId/actions/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !params.data.itemId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const body = actionBodySchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  const validationError = await validateActionReferences({
    orgId: params.data.orgId,
    planId: plan.id,
    responsibleUserId: body.data.responsibleUserId ?? null,
    swotItemId: body.data.swotItemId ?? null,
    objectiveId: body.data.objectiveId ?? null,
    unitIds: body.data.unitIds || [],
  });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const [item] = await db.update(strategicPlanActionsTable).set({
    ...body.data,
    dueDate: body.data.dueDate ? new Date(body.data.dueDate) : body.data.dueDate === null ? null : undefined,
  }).where(and(eq(strategicPlanActionsTable.id, params.data.itemId), eq(strategicPlanActionsTable.planId, plan.id))).returning();
  if (!item) {
    res.status(404).json({ error: "Ação não encontrada" });
    return;
  }
  if (body.data.unitIds) {
    await db.delete(strategicPlanActionUnitsTable).where(eq(strategicPlanActionUnitsTable.actionId, item.id));
    if (body.data.unitIds.length > 0) {
      await db.insert(strategicPlanActionUnitsTable).values(
        body.data.unitIds.map((unitId: number) => ({
          actionId: item.id,
          unitId,
        })),
      );
    }
  }
  res.json((await getStrategicPlanDetail(plan.id, params.data.orgId))?.actions.find((action) => action.id === item.id));
});

router.delete("/organizations/:orgId/governance/strategic-plans/:planId/actions/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.planId || !params.data.itemId || !ensureOrgAccess(params.data.orgId, req.auth!.organizationId)) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const plan = await getPlanOrThrow(params.data.planId, params.data.orgId, res);
  if (!plan) return;
  if (!assertEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }
  await db.delete(strategicPlanActionUnitsTable).where(eq(strategicPlanActionUnitsTable.actionId, params.data.itemId));
  await db.delete(strategicPlanActionsTable).where(and(eq(strategicPlanActionsTable.id, params.data.itemId), eq(strategicPlanActionsTable.planId, plan.id)));
  res.sendStatus(204);
});

export default router;
