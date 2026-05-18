import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  actionPlanEvidencesTable,
  actionPlansTable,
  db,
  kpiMonthlyValuesTable,
  usersTable,
} from "@workspace/db";
import {
  AddActionPlanEvidenceBody,
  AddActionPlanEvidenceParams,
  CreateActionPlanBody,
  CreateActionPlanParams,
  DeleteActionPlanEvidenceParams,
  DeleteActionPlanParams,
  GetActionPlanParams,
  ListActionPlansParams,
  ListActionPlansQueryParams,
  UpdateActionPlanBody,
  UpdateActionPlanParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";
import { resolveSourceContexts } from "../services/action-plans/source-context";
import {
  assertUserBelongsToOrg,
  resolveUserNames,
  serializeEvidence,
  serializePlan,
} from "../services/action-plans/serializers";

const router: IRouter = Router();

// ─── List ──────────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/action-plans", requireAuth, async (req, res): Promise<void> => {
  const params = ListActionPlansParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const query = ListActionPlansQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const conditions: SQL[] = [eq(actionPlansTable.organizationId, params.data.orgId)];
  if (query.data.status) conditions.push(eq(actionPlansTable.status, query.data.status));
  if (query.data.priority) conditions.push(eq(actionPlansTable.priority, query.data.priority));
  if (query.data.sourceModule) conditions.push(eq(actionPlansTable.sourceModule, query.data.sourceModule));
  if (query.data.responsibleUserId !== undefined) {
    conditions.push(eq(actionPlansTable.responsibleUserId, query.data.responsibleUserId));
  }
  if (query.data.sourceKpiMonthlyValueId !== undefined) {
    conditions.push(
      sql`(${actionPlansTable.sourceRef}->>'kpiMonthlyValueId')::int = ${query.data.sourceKpiMonthlyValueId}`,
    );
  }

  const plans = await db
    .select()
    .from(actionPlansTable)
    .where(and(...conditions))
    .orderBy(desc(actionPlansTable.updatedAt));

  if (plans.length === 0) {
    res.json([]);
    return;
  }

  const planIds = plans.map((p) => p.id);
  const evidenceCounts = await db
    .select({
      planId: actionPlanEvidencesTable.actionPlanId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(actionPlanEvidencesTable)
    .where(inArray(actionPlanEvidencesTable.actionPlanId, planIds))
    .groupBy(actionPlanEvidencesTable.actionPlanId);
  const countMap = new Map(evidenceCounts.map((c) => [c.planId, Number(c.cnt)]));

  const userNameMap = await resolveUserNames(plans.map((p) => p.responsibleUserId));
  const sourceContexts = await resolveSourceContexts(
    params.data.orgId,
    plans.map((p) => ({ id: p.id, sourceModule: p.sourceModule, sourceRef: p.sourceRef })),
  );

  res.json(plans.map((p) => ({
    id: p.id,
    organizationId: p.organizationId,
    sourceModule: p.sourceModule,
    sourceContext: sourceContexts.get(p.id) ?? { label: p.sourceModule, kpi: null },
    title: p.title,
    status: p.status,
    priority: p.priority,
    responsibleUserId: p.responsibleUserId ?? null,
    responsibleUserName: p.responsibleUserId !== null ? (userNameMap.get(p.responsibleUserId) ?? null) : null,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    evidencesCount: countMap.get(p.id) ?? 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  })));
});

// ─── Get one ───────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/action-plans/:planId", requireAuth, async (req, res): Promise<void> => {
  const params = GetActionPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [plan] = await db
    .select()
    .from(actionPlansTable)
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ));

  if (!plan) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }

  const evidences = await db
    .select()
    .from(actionPlanEvidencesTable)
    .where(eq(actionPlanEvidencesTable.actionPlanId, plan.id))
    .orderBy(asc(actionPlanEvidencesTable.uploadedAt));

  const userNameMap = await resolveUserNames([
    plan.responsibleUserId,
    plan.createdByUserId,
    ...evidences.map((e) => e.uploadedByUserId),
  ]);
  const sourceContexts = await resolveSourceContexts(
    params.data.orgId,
    [{ id: plan.id, sourceModule: plan.sourceModule, sourceRef: plan.sourceRef }],
  );

  res.json(serializePlan(plan, sourceContexts.get(plan.id) ?? { label: plan.sourceModule, kpi: null }, {
    responsibleUserName: plan.responsibleUserId !== null ? (userNameMap.get(plan.responsibleUserId) ?? null) : null,
    createdByUserName: plan.createdByUserId !== null ? (userNameMap.get(plan.createdByUserId) ?? null) : null,
    evidences: evidences.map((e) => serializeEvidence(
      e,
      e.uploadedByUserId !== null ? (userNameMap.get(e.uploadedByUserId) ?? null) : null,
    )),
  }));
});

// ─── Create ────────────────────────────────────────────────────────────────

router.post("/organizations/:orgId/action-plans", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateActionPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateActionPlanBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Validate KPI source: ensure the referenced monthly value belongs to this org
  if (body.data.sourceModule === "kpi") {
    const mvId = body.data.sourceRef.kpiMonthlyValueId;
    if (typeof mvId !== "number") {
      res.status(400).json({ error: "sourceRef.kpiMonthlyValueId é obrigatório quando sourceModule=kpi" });
      return;
    }
    const [mv] = await db
      .select({ id: kpiMonthlyValuesTable.id })
      .from(kpiMonthlyValuesTable)
      .where(and(
        eq(kpiMonthlyValuesTable.id, mvId),
        eq(kpiMonthlyValuesTable.organizationId, params.data.orgId),
      ));
    if (!mv) {
      res.status(400).json({ error: "Célula KPI de origem não encontrada nesta organização" });
      return;
    }
  }

  // Validate responsibleUserId belongs to the org (prevents cross-tenant assignment + FK errors)
  if (body.data.responsibleUserId !== null && body.data.responsibleUserId !== undefined) {
    const ok = await assertUserBelongsToOrg(body.data.responsibleUserId, params.data.orgId);
    if (!ok) {
      res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" });
      return;
    }
  }

  const [row] = await db.insert(actionPlansTable).values({
    organizationId: params.data.orgId,
    sourceModule: body.data.sourceModule,
    sourceRef: body.data.sourceRef,
    title: body.data.title,
    description: body.data.description ?? null,
    status: body.data.status ?? "open",
    priority: body.data.priority ?? "medium",
    responsibleUserId: body.data.responsibleUserId ?? null,
    dueDate: body.data.dueDate ? new Date(body.data.dueDate) : null,
    correctiveActionDescription: body.data.correctiveActionDescription ?? null,
    createdByUserId: req.auth!.userId,
  }).returning();

  const userNameMap = await resolveUserNames([row.responsibleUserId, row.createdByUserId]);
  const sourceContexts = await resolveSourceContexts(
    params.data.orgId,
    [{ id: row.id, sourceModule: row.sourceModule, sourceRef: row.sourceRef }],
  );

  res.status(201).json(serializePlan(row, sourceContexts.get(row.id) ?? { label: row.sourceModule, kpi: null }, {
    responsibleUserName: row.responsibleUserId !== null ? (userNameMap.get(row.responsibleUserId) ?? null) : null,
    createdByUserName: row.createdByUserId !== null ? (userNameMap.get(row.createdByUserId) ?? null) : null,
    evidences: [],
  }));
});

// ─── Update ────────────────────────────────────────────────────────────────

router.patch("/organizations/:orgId/action-plans/:planId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateActionPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateActionPlanBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [existing] = await db
    .select()
    .from(actionPlansTable)
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ));
  if (!existing) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }

  const update: Record<string, unknown> = {};
  if (body.data.title !== undefined) update.title = body.data.title;
  if (body.data.description !== undefined) update.description = body.data.description;
  if (body.data.status !== undefined) {
    update.status = body.data.status;
    if ((body.data.status === "completed" || body.data.status === "cancelled") && !existing.closedAt) {
      update.closedAt = new Date();
    }
    if (body.data.status === "open" || body.data.status === "in_progress") {
      update.closedAt = null;
    }
  }
  if (body.data.priority !== undefined) update.priority = body.data.priority;
  if (body.data.responsibleUserId !== undefined) {
    if (body.data.responsibleUserId !== null) {
      const ok = await assertUserBelongsToOrg(body.data.responsibleUserId, params.data.orgId);
      if (!ok) {
        res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" });
        return;
      }
    }
    update.responsibleUserId = body.data.responsibleUserId;
  }
  if (body.data.dueDate !== undefined) {
    update.dueDate = body.data.dueDate ? new Date(body.data.dueDate) : null;
  }
  if (body.data.correctiveActionDescription !== undefined) {
    update.correctiveActionDescription = body.data.correctiveActionDescription;
  }
  if (body.data.correctiveActionCompletedAt !== undefined) {
    update.correctiveActionCompletedAt = body.data.correctiveActionCompletedAt
      ? new Date(body.data.correctiveActionCompletedAt)
      : null;
  }

  const [row] = await db.update(actionPlansTable)
    .set(Object.keys(update).length > 0 ? update : { updatedAt: new Date() })
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ))
    .returning();

  const evidences = await db
    .select()
    .from(actionPlanEvidencesTable)
    .where(eq(actionPlanEvidencesTable.actionPlanId, row.id))
    .orderBy(asc(actionPlanEvidencesTable.uploadedAt));

  const userNameMap = await resolveUserNames([
    row.responsibleUserId,
    row.createdByUserId,
    ...evidences.map((e) => e.uploadedByUserId),
  ]);
  const sourceContexts = await resolveSourceContexts(
    params.data.orgId,
    [{ id: row.id, sourceModule: row.sourceModule, sourceRef: row.sourceRef }],
  );

  res.json(serializePlan(row, sourceContexts.get(row.id) ?? { label: row.sourceModule, kpi: null }, {
    responsibleUserName: row.responsibleUserId !== null ? (userNameMap.get(row.responsibleUserId) ?? null) : null,
    createdByUserName: row.createdByUserId !== null ? (userNameMap.get(row.createdByUserId) ?? null) : null,
    evidences: evidences.map((e) => serializeEvidence(
      e,
      e.uploadedByUserId !== null ? (userNameMap.get(e.uploadedByUserId) ?? null) : null,
    )),
  }));
});

// ─── Delete ────────────────────────────────────────────────────────────────

router.delete("/organizations/:orgId/action-plans/:planId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteActionPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [row] = await db.delete(actionPlansTable)
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ))
    .returning();

  if (!row) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }
  res.status(204).send();
});

// ─── Evidence: add ─────────────────────────────────────────────────────────

router.post("/organizations/:orgId/action-plans/:planId/evidences", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = AddActionPlanEvidenceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = AddActionPlanEvidenceBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [plan] = await db
    .select({ id: actionPlansTable.id })
    .from(actionPlansTable)
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ));
  if (!plan) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }

  // objectPath must point inside the canonical upload prefix produced by
  // /storage/uploads/direct (see employees route for the same guard).
  if (!body.data.objectPath.startsWith("/objects/uploads/")) {
    res.status(400).json({ error: "objectPath inválido: deve apontar para /objects/uploads/" });
    return;
  }

  const [row] = await db.insert(actionPlanEvidencesTable).values({
    organizationId: params.data.orgId,
    actionPlanId: params.data.planId,
    fileName: body.data.fileName,
    fileSize: body.data.fileSize,
    contentType: body.data.contentType,
    objectPath: body.data.objectPath,
    uploadedByUserId: req.auth!.userId,
  }).returning();

  let uploadedByUserName: string | null = null;
  if (row.uploadedByUserId !== null) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.uploadedByUserId));
    uploadedByUserName = u?.name ?? null;
  }

  res.status(201).json(serializeEvidence(row, uploadedByUserName));
});

// ─── Evidence: delete ──────────────────────────────────────────────────────

router.delete("/organizations/:orgId/action-plans/:planId/evidences/:evidenceId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteActionPlanEvidenceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [plan] = await db
    .select({ id: actionPlansTable.id })
    .from(actionPlansTable)
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ));
  if (!plan) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }

  const [row] = await db.delete(actionPlanEvidencesTable)
    .where(and(
      eq(actionPlanEvidencesTable.id, params.data.evidenceId),
      eq(actionPlanEvidencesTable.actionPlanId, params.data.planId),
    ))
    .returning();

  if (!row) { res.status(404).json({ error: "Evidência não encontrada" }); return; }
  res.status(204).send();
});

export default router;
