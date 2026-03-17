import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
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
} from "@workspace/db";
import { requireRole, requireWriteAccess } from "../../middlewares/auth";
import {
  createStrategicPlanRevision,
  getStrategicPlanDetail,
  isEditableStatus,
  listStrategicPlanSummaries,
} from "../../lib/governance";
import {
  createPlanBodySchema,
  getPlanOrThrow,
  importBodySchema,
  parseGovernanceParams,
  planBodySchema,
  reviewBodySchema,
  validateActionReferences,
} from "./shared";

const router: IRouter = Router();

router.get("/organizations/:orgId/governance/strategic-plans", async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res);
  if (!params) return;

  res.json(await listStrategicPlanSummaries(params.orgId));
});

router.post(
  "/organizations/:orgId/governance/strategic-plans",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseGovernanceParams(req.params, req.auth!.organizationId, res);
    if (!params) return;

    const body = createPlanBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const activePlans = await db
      .select({ id: strategicPlansTable.id })
      .from(strategicPlansTable)
      .where(
        and(
          eq(strategicPlansTable.organizationId, params.orgId),
          inArray(strategicPlansTable.status, ["draft", "in_review", "approved", "rejected", "overdue"]),
        ),
      );

    if (activePlans.length > 0) {
      res.status(409).json({ error: "A organização já possui um planejamento estratégico ativo" });
      return;
    }

    const [plan] = await db
      .insert(strategicPlansTable)
      .values({
        organizationId: params.orgId,
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

    res.status(201).json(await getStrategicPlanDetail(plan.id, params.orgId));
  },
);

router.get("/organizations/:orgId/governance/strategic-plans/:planId", async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const detail = await getStrategicPlanDetail(params.planId, params.orgId);
  if (!detail) {
    res.status(404).json({ error: "Plano estratégico não encontrado" });
    return;
  }

  res.json(detail);
});

router.patch(
  "/organizations/:orgId/governance/strategic-plans/:planId",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
    if (!params?.planId) return;

    const body = planBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const plan = await getPlanOrThrow(params.planId, params.orgId, res);
    if (!plan) return;
    if (!isEditableStatus(plan.status)) {
      res.status(400).json({ error: "Somente planos em rascunho ou rejeitados podem ser editados" });
      return;
    }

    const updateData: Record<string, unknown> = {
      updatedById: req.auth!.userId,
    };

    for (const [key, value] of Object.entries(body.data)) {
      if (value === undefined) continue;
      updateData[key] = key === "nextReviewAt" ? (value ? new Date(value as string) : null) : value;
    }

    await db.update(strategicPlansTable).set(updateData).where(eq(strategicPlansTable.id, params.planId));

    res.json(await getStrategicPlanDetail(params.planId, params.orgId));
  },
);

router.post(
  "/organizations/:orgId/governance/strategic-plans/:planId/import",
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
    if (!params?.planId) return;

    const body = importBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const plan = await getPlanOrThrow(params.planId, params.orgId, res);
    if (!plan) return;
    if (!isEditableStatus(plan.status)) {
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
            importedWorkbookName: body.data.workbookName ?? body.data.plan.importedWorkbookName ?? null,
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
            .where(inArray(strategicPlanActionUnitsTable.actionId, existingActionIds.map((row) => row.id)));
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
            executor: tx,
            orgId: params.orgId,
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
              (item.unitIds || []).map((unitId) => ({
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

    res.json(await getStrategicPlanDetail(plan.id, params.orgId));
  },
);

router.post("/organizations/:orgId/governance/strategic-plans/:planId/submit", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Somente planos em rascunho ou rejeitados podem ser submetidos" });
    return;
  }

  await db.update(strategicPlansTable).set({
    status: "in_review",
    submittedAt: new Date(),
    updatedById: req.auth!.userId,
  }).where(eq(strategicPlansTable.id, plan.id));

  res.json(await getStrategicPlanDetail(plan.id, params.orgId));
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/approve", requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const body = reviewBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (plan.status !== "in_review") {
    res.status(400).json({ error: "Somente planos em revisão podem ser aprovados" });
    return;
  }

  const detail = await getStrategicPlanDetail(plan.id, params.orgId);
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

  await db.update(strategicPlansTable).set({
    status: "approved",
    rejectedAt: null,
    updatedById: req.auth!.userId,
  }).where(eq(strategicPlansTable.id, plan.id));

  res.json(await getStrategicPlanDetail(plan.id, params.orgId));
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/reject", requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const body = reviewBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (plan.status !== "in_review") {
    res.status(400).json({ error: "Somente planos em revisão podem ser rejeitados" });
    return;
  }

  await db.update(strategicPlansTable).set({
    status: "rejected",
    reviewReason: body.data.reviewReason ?? plan.reviewReason ?? null,
    rejectedAt: new Date(),
    updatedById: req.auth!.userId,
  }).where(eq(strategicPlansTable.id, plan.id));

  res.json(await getStrategicPlanDetail(plan.id, params.orgId));
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/reopen", requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!["approved", "overdue", "rejected"].includes(plan.status)) {
    res.status(400).json({ error: "Este plano não pode ser reaberto" });
    return;
  }

  await db.update(strategicPlansTable).set({
    status: "draft",
    updatedById: req.auth!.userId,
  }).where(eq(strategicPlansTable.id, plan.id));

  res.json(await getStrategicPlanDetail(plan.id, params.orgId));
});

router.get("/organizations/:orgId/governance/strategic-plans/:planId/export", async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const [revision] = await db
    .select()
    .from(strategicPlanRevisionsTable)
    .where(eq(strategicPlanRevisionsTable.planId, params.planId))
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
});

export default router;
