import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  strategicPlanActionsTable,
  strategicPlanActionUnitsTable,
  strategicPlanInterestedPartiesTable,
  strategicPlanObjectivesTable,
  strategicPlanRiskOpportunityEffectivenessReviewsTable,
  strategicPlanRiskOpportunityItemsTable,
  strategicPlanSwotItemsTable,
} from "@workspace/db";
import { requireWriteAccess } from "../../middlewares/auth";
import { getStrategicPlanDetail, isEditableStatus } from "../../lib/governance";
import {
  actionBodySchema,
  getItemOrNotFound,
  getPlanOrThrow,
  interestedPartyBodySchema,
  objectiveBodySchema,
  parseGovernanceParams,
  riskOpportunityBodySchema,
  riskOpportunityEffectivenessReviewBodySchema,
  swotBodySchema,
  validateActionReferences,
  validateRiskOpportunityReferences,
} from "./shared";

const router: IRouter = Router();

function calculateRiskOpportunityScore(
  likelihood?: number | null,
  impact?: number | null,
) {
  if (
    typeof likelihood === "number" &&
    Number.isFinite(likelihood) &&
    typeof impact === "number" &&
    Number.isFinite(impact)
  ) {
    return likelihood * impact;
  }
  return null;
}

router.get("/organizations/:orgId/governance/strategic-plans/:planId/swot-items", async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const detail = await getStrategicPlanDetail(params.planId, params.orgId);
  res.json(detail?.swotItems || []);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/swot-items", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const body = swotBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const [item] = await db
    .insert(strategicPlanSwotItemsTable)
    .values({
      planId: plan.id,
      ...body.data,
      matrixLabel: body.data.matrixLabel ?? null,
      perspective: body.data.perspective ?? null,
      treatmentDecision: body.data.treatmentDecision ?? null,
      linkedObjectiveCode: body.data.linkedObjectiveCode ?? null,
      linkedObjectiveLabel: body.data.linkedObjectiveLabel ?? null,
      importedActionReference: body.data.importedActionReference ?? null,
      notes: body.data.notes ?? null,
      performance: body.data.performance ?? null,
      relevance: body.data.relevance ?? null,
      result: body.data.result ?? null,
      sortOrder: body.data.sortOrder ?? 0,
    })
    .returning();

  res.status(201).json(item);
});

router.patch("/organizations/:orgId/governance/strategic-plans/:planId/swot-items/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const body = swotBodySchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const [item] = await db
    .update(strategicPlanSwotItemsTable)
    .set(body.data)
    .where(and(eq(strategicPlanSwotItemsTable.id, params.itemId), eq(strategicPlanSwotItemsTable.planId, plan.id)))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item SWOT não encontrado" });
    return;
  }

  res.json(item);
});

router.delete("/organizations/:orgId/governance/strategic-plans/:planId/swot-items/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  await db
    .delete(strategicPlanSwotItemsTable)
    .where(and(eq(strategicPlanSwotItemsTable.id, params.itemId), eq(strategicPlanSwotItemsTable.planId, plan.id)));

  res.sendStatus(204);
});

router.get("/organizations/:orgId/governance/strategic-plans/:planId/interested-parties", async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const detail = await getStrategicPlanDetail(params.planId, params.orgId);
  res.json(detail?.interestedParties || []);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/interested-parties", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const body = interestedPartyBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const [item] = await db
    .insert(strategicPlanInterestedPartiesTable)
    .values({
      planId: plan.id,
      name: body.data.name,
      expectedRequirements: body.data.expectedRequirements ?? null,
      roleInCompany: body.data.roleInCompany ?? null,
      roleSummary: body.data.roleSummary ?? null,
      relevantToManagementSystem: body.data.relevantToManagementSystem ?? null,
      legalRequirementApplicable: body.data.legalRequirementApplicable ?? null,
      monitoringMethod: body.data.monitoringMethod ?? null,
      notes: body.data.notes ?? null,
      sortOrder: body.data.sortOrder ?? 0,
    })
    .returning();

  res.status(201).json(item);
});

router.patch("/organizations/:orgId/governance/strategic-plans/:planId/interested-parties/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const body = interestedPartyBodySchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const [item] = await db
    .update(strategicPlanInterestedPartiesTable)
    .set(body.data)
    .where(and(eq(strategicPlanInterestedPartiesTable.id, params.itemId), eq(strategicPlanInterestedPartiesTable.planId, plan.id)))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Parte interessada não encontrada" });
    return;
  }

  res.json(item);
});

router.delete("/organizations/:orgId/governance/strategic-plans/:planId/interested-parties/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  await db
    .delete(strategicPlanInterestedPartiesTable)
    .where(and(eq(strategicPlanInterestedPartiesTable.id, params.itemId), eq(strategicPlanInterestedPartiesTable.planId, plan.id)));

  res.sendStatus(204);
});

router.get("/organizations/:orgId/governance/strategic-plans/:planId/objectives", async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const detail = await getStrategicPlanDetail(params.planId, params.orgId);
  res.json(detail?.objectives || []);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/objectives", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const body = objectiveBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const [item] = await db
    .insert(strategicPlanObjectivesTable)
    .values({
      planId: plan.id,
      code: body.data.code,
      systemDomain: body.data.systemDomain ?? null,
      description: body.data.description,
      notes: body.data.notes ?? null,
      sortOrder: body.data.sortOrder ?? 0,
    })
    .returning();

  res.status(201).json(item);
});

router.patch("/organizations/:orgId/governance/strategic-plans/:planId/objectives/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const body = objectiveBodySchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const [item] = await db
    .update(strategicPlanObjectivesTable)
    .set(body.data)
    .where(and(eq(strategicPlanObjectivesTable.id, params.itemId), eq(strategicPlanObjectivesTable.planId, plan.id)))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Objetivo não encontrado" });
    return;
  }

  res.json(item);
});

router.delete("/organizations/:orgId/governance/strategic-plans/:planId/objectives/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  await db
    .delete(strategicPlanObjectivesTable)
    .where(and(eq(strategicPlanObjectivesTable.id, params.itemId), eq(strategicPlanObjectivesTable.planId, plan.id)));

  res.sendStatus(204);
});

router.get("/organizations/:orgId/governance/strategic-plans/:planId/risk-opportunity-items", async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const detail = await getStrategicPlanDetail(params.planId, params.orgId);
  res.json(detail?.riskOpportunityItems || []);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/risk-opportunity-items", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const body = riskOpportunityBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const validationError = await validateRiskOpportunityReferences({
    executor: db,
    orgId: params.orgId,
    planId: plan.id,
    ownerUserId: body.data.ownerUserId ?? null,
    coOwnerUserId: body.data.coOwnerUserId ?? null,
    swotItemId: body.data.swotItemId ?? null,
    objectiveId: body.data.objectiveId ?? null,
    unitId: body.data.unitId ?? null,
  });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const score = calculateRiskOpportunityScore(
    body.data.likelihood ?? null,
    body.data.impact ?? null,
  );

  const [item] = await db
    .insert(strategicPlanRiskOpportunityItemsTable)
    .values({
      planId: plan.id,
      type: body.data.type,
      sourceType: body.data.sourceType,
      sourceReference: body.data.sourceReference ?? null,
      title: body.data.title,
      description: body.data.description,
      ownerUserId: body.data.ownerUserId ?? null,
      coOwnerUserId: body.data.coOwnerUserId ?? null,
      unitId: body.data.unitId ?? null,
      objectiveId: body.data.objectiveId ?? null,
      swotItemId: body.data.swotItemId ?? null,
      likelihood: body.data.likelihood ?? null,
      impact: body.data.impact ?? null,
      score,
      responseStrategy: body.data.responseStrategy ?? null,
      nextReviewAt: body.data.nextReviewAt ? new Date(body.data.nextReviewAt) : null,
      status: body.data.status ?? "identified",
      existingControls: body.data.existingControls ?? null,
      expectedEffect: body.data.expectedEffect ?? null,
      notes: body.data.notes ?? null,
      sortOrder: body.data.sortOrder ?? 0,
    })
    .returning();

  const detail = await getStrategicPlanDetail(plan.id, params.orgId);
  const createdItem = getItemOrNotFound(detail?.riskOpportunityItems || [], item.id, res);
  if (!createdItem) return;
  res.status(201).json(createdItem);
});

router.patch("/organizations/:orgId/governance/strategic-plans/:planId/risk-opportunity-items/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const body = riskOpportunityBodySchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const validationError = await validateRiskOpportunityReferences({
    executor: db,
    orgId: params.orgId,
    planId: plan.id,
    ownerUserId: body.data.ownerUserId ?? null,
    coOwnerUserId: body.data.coOwnerUserId ?? null,
    swotItemId: body.data.swotItemId ?? null,
    objectiveId: body.data.objectiveId ?? null,
    unitId: body.data.unitId ?? null,
  });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const [currentItem] = await db
    .select()
    .from(strategicPlanRiskOpportunityItemsTable)
    .where(and(eq(strategicPlanRiskOpportunityItemsTable.id, params.itemId), eq(strategicPlanRiskOpportunityItemsTable.planId, plan.id)));

  if (!currentItem) {
    res.status(404).json({ error: "Risco ou oportunidade não encontrado" });
    return;
  }

  const score = body.data.likelihood !== undefined || body.data.impact !== undefined
    ? calculateRiskOpportunityScore(
        body.data.likelihood ?? currentItem.likelihood ?? null,
        body.data.impact ?? currentItem.impact ?? null,
      )
    : undefined;

  const [item] = await db
    .update(strategicPlanRiskOpportunityItemsTable)
    .set({
      ...body.data,
      nextReviewAt:
        body.data.nextReviewAt
          ? new Date(body.data.nextReviewAt)
          : body.data.nextReviewAt === null
            ? null
            : undefined,
      score,
    })
    .where(and(eq(strategicPlanRiskOpportunityItemsTable.id, params.itemId), eq(strategicPlanRiskOpportunityItemsTable.planId, plan.id)))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Risco ou oportunidade não encontrado" });
    return;
  }

  const detail = await getStrategicPlanDetail(plan.id, params.orgId);
  const updatedItem = getItemOrNotFound(detail?.riskOpportunityItems || [], item.id, res);
  if (!updatedItem) return;
  res.json(updatedItem);
});

router.delete("/organizations/:orgId/governance/strategic-plans/:planId/risk-opportunity-items/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  await db
    .delete(strategicPlanRiskOpportunityItemsTable)
    .where(and(eq(strategicPlanRiskOpportunityItemsTable.id, params.itemId), eq(strategicPlanRiskOpportunityItemsTable.planId, plan.id)));

  res.sendStatus(204);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/risk-opportunity-items/:itemId/effectiveness-review", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const body = riskOpportunityEffectivenessReviewBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const [item] = await db
    .select()
    .from(strategicPlanRiskOpportunityItemsTable)
    .where(and(eq(strategicPlanRiskOpportunityItemsTable.id, params.itemId), eq(strategicPlanRiskOpportunityItemsTable.planId, plan.id)));

  if (!item) {
    res.status(404).json({ error: "Risco ou oportunidade não encontrado" });
    return;
  }

  await db.insert(strategicPlanRiskOpportunityEffectivenessReviewsTable).values({
    riskOpportunityItemId: item.id,
    reviewedById: req.auth!.userId,
    result: body.data.result,
    comment: body.data.comment ?? null,
  });

  await db
    .update(strategicPlanRiskOpportunityItemsTable)
    .set({
      status: body.data.result === "effective" ? "effective" : "ineffective",
    })
    .where(eq(strategicPlanRiskOpportunityItemsTable.id, item.id));

  const detail = await getStrategicPlanDetail(plan.id, params.orgId);
  const updatedItem = getItemOrNotFound(detail?.riskOpportunityItems || [], item.id, res);
  if (!updatedItem) return;
  res.json(updatedItem);
});

router.get("/organizations/:orgId/governance/strategic-plans/:planId/actions", async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const detail = await getStrategicPlanDetail(params.planId, params.orgId);
  res.json(detail?.actions || []);
});

router.post("/organizations/:orgId/governance/strategic-plans/:planId/actions", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true });
  if (!params?.planId) return;

  const body = actionBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const validationError = await validateActionReferences({
    executor: db,
    orgId: params.orgId,
    planId: plan.id,
    responsibleUserId: body.data.responsibleUserId ?? null,
    secondaryResponsibleUserId: body.data.secondaryResponsibleUserId ?? null,
    swotItemId: body.data.swotItemId ?? null,
    objectiveId: body.data.objectiveId ?? null,
    riskOpportunityItemId: body.data.riskOpportunityItemId ?? null,
    unitIds: body.data.unitIds || [],
  });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const [item] = await db
    .insert(strategicPlanActionsTable)
    .values({
      planId: plan.id,
      title: body.data.title,
      description: body.data.description ?? null,
      swotItemId: body.data.swotItemId ?? null,
      objectiveId: body.data.objectiveId ?? null,
      riskOpportunityItemId: body.data.riskOpportunityItemId ?? null,
      responsibleUserId: body.data.responsibleUserId ?? null,
      secondaryResponsibleUserId: body.data.secondaryResponsibleUserId ?? null,
      dueDate: body.data.dueDate ? new Date(body.data.dueDate) : null,
      rescheduledDueDate: body.data.rescheduledDueDate
        ? new Date(body.data.rescheduledDueDate)
        : null,
      rescheduleReason: body.data.rescheduleReason ?? null,
      completedAt: body.data.completedAt ? new Date(body.data.completedAt) : null,
      completionNotes: body.data.completionNotes ?? null,
      status: body.data.status ?? "pending",
      notes: body.data.notes ?? null,
      sortOrder: body.data.sortOrder ?? 0,
    })
    .returning();

  if ((body.data.unitIds || []).length > 0) {
    await db.insert(strategicPlanActionUnitsTable).values(
      (body.data.unitIds || []).map((unitId) => ({
        actionId: item.id,
        unitId,
      })),
    );
  }

  const detail = await getStrategicPlanDetail(plan.id, params.orgId);
  const createdItem = getItemOrNotFound(detail?.actions || [], item.id, res);
  if (!createdItem) return;
  res.status(201).json(createdItem);
});

router.patch("/organizations/:orgId/governance/strategic-plans/:planId/actions/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const body = actionBodySchema.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  const validationError = await validateActionReferences({
    executor: db,
    orgId: params.orgId,
    planId: plan.id,
    responsibleUserId: body.data.responsibleUserId ?? null,
    secondaryResponsibleUserId: body.data.secondaryResponsibleUserId ?? null,
    swotItemId: body.data.swotItemId ?? null,
    objectiveId: body.data.objectiveId ?? null,
    riskOpportunityItemId: body.data.riskOpportunityItemId ?? null,
    unitIds: body.data.unitIds || [],
  });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const [item] = await db
    .update(strategicPlanActionsTable)
    .set({
      ...body.data,
      rescheduledDueDate:
        body.data.rescheduledDueDate
          ? new Date(body.data.rescheduledDueDate)
          : body.data.rescheduledDueDate === null
            ? null
            : undefined,
      completedAt:
        body.data.completedAt
          ? new Date(body.data.completedAt)
          : body.data.completedAt === null
            ? null
            : undefined,
      dueDate:
        body.data.dueDate
          ? new Date(body.data.dueDate)
          : body.data.dueDate === null
            ? null
            : undefined,
    })
    .where(and(eq(strategicPlanActionsTable.id, params.itemId), eq(strategicPlanActionsTable.planId, plan.id)))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Ação não encontrada" });
    return;
  }

  if (body.data.unitIds) {
    await db.delete(strategicPlanActionUnitsTable).where(eq(strategicPlanActionUnitsTable.actionId, item.id));
    if (body.data.unitIds.length > 0) {
      await db.insert(strategicPlanActionUnitsTable).values(
        body.data.unitIds.map((unitId) => ({
          actionId: item.id,
          unitId,
        })),
      );
    }
  }

  const detail = await getStrategicPlanDetail(plan.id, params.orgId);
  const updatedItem = getItemOrNotFound(detail?.actions || [], item.id, res);
  if (!updatedItem) return;
  res.json(updatedItem);
});

router.delete("/organizations/:orgId/governance/strategic-plans/:planId/actions/:itemId", requireWriteAccess(), async (req, res): Promise<void> => {
  const params = parseGovernanceParams(req.params, req.auth!.organizationId, res, { requirePlanId: true, requireItemId: true });
  if (!params?.planId || !params.itemId) return;

  const plan = await getPlanOrThrow(params.planId, params.orgId, res);
  if (!plan) return;
  if (!isEditableStatus(plan.status)) {
    res.status(400).json({ error: "Plano não está editável" });
    return;
  }

  await db
    .delete(strategicPlanActionsTable)
    .where(and(eq(strategicPlanActionsTable.id, params.itemId), eq(strategicPlanActionsTable.planId, plan.id)));

  res.sendStatus(204);
});

export default router;
