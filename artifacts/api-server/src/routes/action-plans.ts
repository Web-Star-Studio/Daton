import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  actionPlanActivityLogTable,
  actionPlanCommentsTable,
  actionPlanEvidencesTable,
  actionPlansTable,
  db,
  isActionPlanEncerrado,
  type ActionPlanActivityChanges,
  type ActionPlanSourceModule,
} from "@workspace/db";
import {
  AddActionPlanCommentBody,
  AddActionPlanCommentParams,
  AddActionPlanEvidenceBody,
  AddActionPlanEvidenceParams,
  CreateActionPlanBody,
  CreateActionPlanParams,
  DeleteActionPlanEvidenceParams,
  DeleteActionPlanParams,
  GetActionPlanParams,
  GetActionPlansSummaryParams,
  ListExternalActionsParams,
  ListActionPlanActivityParams,
  ListActionPlanCommentsParams,
  ListActionPlansParams,
  ListActionPlansQueryParams,
  SuggestActionPlanDraftBody,
  SuggestActionPlanDraftParams,
  UpdateActionPlanBody,
  UpdateActionPlanParams,
} from "@workspace/api-zod";
import {
  requireAuth,
  requireModuleAccess,
  requireWriteAccess,
  userHasModuleAccess,
  type AppModule,
} from "../middlewares/auth";
import { resolveSourceContexts } from "../services/action-plans/source-context";
import {
  assertUserBelongsToOrg,
  resolveUserNames,
  serializeActivityEntry,
  serializeComment,
  serializeEvidence,
  serializePlan,
  userIsAnalyst,
} from "../services/action-plans/serializers";
import { gutScore } from "../services/action-plans/gut";
import { generateActionPlanCode } from "../services/action-plans/code";
import { deriveCreateDefaults } from "../services/action-plans/derivation";
import { validateSourceRef } from "../services/action-plans/validate-source";
import { computeActionPlanSummary } from "../services/action-plans/summary";
import { listExternalActions } from "../services/action-plans/external";
import { buildDiff, logActionPlanActivity } from "../services/action-plans/activity";
import { extractPlanning, normalizePlanning, planningChanged, type PlanningBlock } from "../services/action-plans/planning";
import { notifyActionPlanAssignment, notifyActionPlanEvaluatorAssignment } from "../services/action-plans/notify-assignment";
import { draftActionPlanFromProblem } from "../services/action-plans/ai-draft";
import { AiCompletionError } from "../services/ai/json-completion";

const router: IRouter = Router();

/** Tracked fields for the update activity diff (display labels handled client-side).
 *  The planning block (5W2H + root cause + whys) is logged separately, as one
 *  logical field — see `planning.ts`. */
const DIFF_FIELDS = [
  "title",
  "description",
  "actionType",
  "priority",
  "gutGravity",
  "gutUrgency",
  "gutTendency",
  "responsibleUserId",
  "dueDate",
  "correctiveActionDescription",
];

async function currentUserName(userId: number | null | undefined): Promise<string | null> {
  if (userId == null) return null;
  const map = await resolveUserNames([userId]);
  return map.get(userId) ?? null;
}

/** The block as it goes into the log: normalized, so an empty 5W2H reads as null
 *  whether the row holds `{}` or `null`. */
function normalizedPlanning(row: Parameters<typeof extractPlanning>[0]) {
  return normalizePlanning(extractPlanning(row));
}

/**
 * Module that owns each action-plan origin. The hub (`actionPlans`) sees every
 * plan, but the "Ações vinculadas" widget embedded in the origin screens reads
 * this same listing scoped by `sourceModule` — so whoever may open the origin
 * screen may read the actions spawned from it. Without this, granting `kpi`
 * alone would break the RAC deviation flow with a 403.
 */
const SOURCE_MODULE_OWNER: Record<ActionPlanSourceModule, AppModule> = {
  kpi: "kpi",
  rac: "kpi",
  swot: "swot",
  nonconformity: "governance",
  audit_finding: "governance",
  risk: "governance",
  training: "employees",
  environmental: "environmental",
  road_safety: "roadSafety",
  incident: "roadSafety",
  manual: "actionPlans",
};

/**
 * Guards every `/:planId` route. Without it the hub gate would be bypassable by
 * anyone in the org who guesses a plan id. A plan belongs to whoever holds the
 * hub module, holds the module that owns its origin, or is personally assigned
 * to it — the responsible and the effectiveness evaluator reach their own plans
 * from "Suas Pendências" without ever holding `actionPlans`.
 *
 * Registered after `requireAuth`. Unknown ids and malformed params fall through
 * untouched so the routes keep answering 404/400 exactly as before.
 */
function requirePlanAccess() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const orgId = Number(req.params.orgId);
    const planId = Number(req.params.planId);
    if (!Number.isInteger(orgId) || !Number.isInteger(planId)) { next(); return; }
    if (orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [plan] = await db
      .select({
        sourceModule: actionPlansTable.sourceModule,
        responsibleUserId: actionPlansTable.responsibleUserId,
        effectivenessEvaluatorUserId: actionPlansTable.effectivenessEvaluatorUserId,
      })
      .from(actionPlansTable)
      .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)));
    if (!plan) { next(); return; }

    const userId = req.auth!.userId;
    const allowed =
      plan.responsibleUserId === userId ||
      plan.effectivenessEvaluatorUserId === userId ||
      (await userHasModuleAccess(req.auth!, "actionPlans")) ||
      (await userHasModuleAccess(req.auth!, SOURCE_MODULE_OWNER[plan.sourceModule]));
    if (!allowed) { res.status(403).json({ error: "Sem acesso a este plano de ação" }); return; }

    next();
  };
}

// ─── List ──────────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/action-plans", requireAuth, async (req, res): Promise<void> => {
  const params = ListActionPlansParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const query = ListActionPlansQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const scopedTo = query.data.sourceModule;
  const canReadListing =
    (await userHasModuleAccess(req.auth!, "actionPlans")) ||
    (scopedTo !== undefined && (await userHasModuleAccess(req.auth!, SOURCE_MODULE_OWNER[scopedTo])));
  if (!canReadListing) { res.status(403).json({ error: "Sem acesso a este módulo" }); return; }

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
    code: p.code ?? null,
    sourceModule: p.sourceModule,
    sourceRef: p.sourceRef,
    sourceContext: sourceContexts.get(p.id) ?? { label: p.sourceModule, kpi: null },
    actionType: p.actionType,
    title: p.title,
    status: p.status,
    priority: p.priority,
    gutScore: gutScore(p.gutGravity, p.gutUrgency, p.gutTendency),
    effectivenessResult: p.effectivenessResult ?? null,
    responsibleUserId: p.responsibleUserId ?? null,
    responsibleUserName: p.responsibleUserId !== null ? (userNameMap.get(p.responsibleUserId) ?? null) : null,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    evidencesCount: countMap.get(p.id) ?? 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  })));
});

// ─── Summary (dashboards) ────────────────────────────────────────────────────
// NOTE: must be registered before "/:planId" so "summary" is not parsed as an id.

router.get("/organizations/:orgId/action-plans/summary", requireAuth, requireModuleAccess("actionPlans"), async (req, res): Promise<void> => {
  const params = GetActionPlansSummaryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const summary = await computeActionPlanSummary(params.data.orgId);
  res.json(summary);
});

// ─── External actions (read-only bridge: governance corrective actions) ───────
// NOTE: must be registered before "/:planId" so the literal path isn't parsed as an id.

router.get("/organizations/:orgId/action-plans/external-actions", requireAuth, requireModuleAccess("actionPlans"), async (req, res): Promise<void> => {
  const params = ListExternalActionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const items = await listExternalActions(params.data.orgId);
  res.json(items);
});

// ─── AI draft (opt-in "Sugerir plano") ───────────────────────────────────────
// NOTE: must be registered before "/:planId" so "ai-suggest" is not parsed as an id.
// Drafts 5W2H + 5-whys from the problem text; NEVER persists. The client pre-fills
// the editable form and the user reviews/saves via PATCH. The core does not depend
// on AI: failures answer 502 and leave the form untouched. requireWriteAccess()
// keeps read-only analysts from triggering paid AI calls.

router.post("/organizations/:orgId/action-plans/ai-suggest", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = SuggestActionPlanDraftParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = SuggestActionPlanDraftBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  try {
    const draft = await draftActionPlanFromProblem({
      problem: body.data.problem,
      title: body.data.title,
      sourceModule: body.data.sourceModule,
      contextLabel: body.data.contextLabel,
    });
    res.json(draft);
  } catch (error) {
    console.error("[action-plans/ai-suggest] failed", error);
    // AiCompletionError já traz um motivo que o usuário entende (limite de tokens,
    // resposta vazia); qualquer outra falha vira a mensagem genérica.
    const message = error instanceof AiCompletionError
      ? error.message
      : "Não foi possível gerar a sugestão por IA no momento.";
    res.status(502).json({ error: message });
  }
});

// ─── Get one ───────────────────────────────────────────────────────────────

async function loadAndSerializePlan(orgId: number, planId: number) {
  const [plan] = await db
    .select()
    .from(actionPlansTable)
    .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)));
  if (!plan) return null;

  const evidences = await db
    .select()
    .from(actionPlanEvidencesTable)
    .where(eq(actionPlanEvidencesTable.actionPlanId, plan.id))
    .orderBy(asc(actionPlanEvidencesTable.uploadedAt));

  const userNameMap = await resolveUserNames([
    plan.responsibleUserId,
    plan.createdByUserId,
    plan.effectivenessEvaluatorUserId,
    ...evidences.map((e) => e.uploadedByUserId),
  ]);
  const sourceContexts = await resolveSourceContexts(
    orgId,
    [{ id: plan.id, sourceModule: plan.sourceModule, sourceRef: plan.sourceRef }],
  );

  return serializePlan(plan, sourceContexts.get(plan.id) ?? { label: plan.sourceModule, kpi: null }, {
    responsibleUserName: plan.responsibleUserId !== null ? (userNameMap.get(plan.responsibleUserId) ?? null) : null,
    createdByUserName: plan.createdByUserId !== null ? (userNameMap.get(plan.createdByUserId) ?? null) : null,
    effectivenessEvaluatorUserName: plan.effectivenessEvaluatorUserId !== null
      ? (userNameMap.get(plan.effectivenessEvaluatorUserId) ?? null)
      : null,
    evidences: evidences.map((e) => serializeEvidence(
      e,
      e.uploadedByUserId !== null ? (userNameMap.get(e.uploadedByUserId) ?? null) : null,
    )),
  });
}

router.get("/organizations/:orgId/action-plans/:planId", requireAuth, requirePlanAccess(), async (req, res): Promise<void> => {
  const params = GetActionPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const out = await loadAndSerializePlan(params.data.orgId, params.data.planId);
  if (!out) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }
  res.json(out);
});

// ─── Create ────────────────────────────────────────────────────────────────

router.post("/organizations/:orgId/action-plans", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateActionPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateActionPlanBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Validate the origin reference (well-formed + belongs to this org).
  const sourceError = await validateSourceRef(params.data.orgId, body.data.sourceModule, body.data.sourceRef);
  if (sourceError) { res.status(400).json({ error: sourceError }); return; }

  // Validate user references belong to the org (prevents cross-tenant + FK errors)
  for (const [field, value] of [
    ["responsibleUserId", body.data.responsibleUserId],
    ["effectivenessEvaluatorUserId", body.data.effectivenessEvaluatorUserId],
  ] as const) {
    if (value !== null && value !== undefined) {
      const ok = await assertUserBelongsToOrg(value, params.data.orgId);
      if (!ok) {
        res.status(400).json({ error: `${field} não corresponde a um usuário desta organização` });
        return;
      }
    }
  }

  // Governance: designating the effectiveness evaluator is an SGI act — only an
  // admin may do it, so an operator can't self-assign and bypass the verdict lock.
  const isSgiAdmin = req.auth!.role === "platform_admin" || req.auth!.role === "org_admin";
  if (body.data.effectivenessEvaluatorUserId != null && !isSgiAdmin) {
    res.status(403).json({ error: "Somente um administrador (SGI) pode designar o avaliador de eficácia." });
    return;
  }
  if (body.data.effectivenessEvaluatorUserId != null && await userIsAnalyst(body.data.effectivenessEvaluatorUserId, params.data.orgId)) {
    res.status(400).json({ error: "O avaliador de eficácia deve ter acesso de escrita — analistas (somente leitura) não podem emitir o veredito." });
    return;
  }
  // Independence: the effectiveness evaluator must differ from the action's responsible.
  if (
    body.data.effectivenessEvaluatorUserId != null &&
    body.data.responsibleUserId != null &&
    body.data.effectivenessEvaluatorUserId === body.data.responsibleUserId
  ) {
    res.status(400).json({ error: "O avaliador da eficácia deve ser diferente do responsável pela ação." });
    return;
  }

  const actionType = body.data.actionType ?? "corrective";
  const derived = await deriveCreateDefaults(params.data.orgId, body.data.sourceModule, body.data.sourceRef);
  const code = await generateActionPlanCode(params.data.orgId, actionType, new Date().getFullYear());
  const status = body.data.status ?? "open";

  const [row] = await db.insert(actionPlansTable).values({
    organizationId: params.data.orgId,
    code,
    sourceModule: body.data.sourceModule,
    sourceRef: body.data.sourceRef,
    actionType,
    title: body.data.title,
    description: body.data.description ?? null,
    status,
    priority: body.data.priority ?? "medium",
    gutGravity: body.data.gutGravity ?? null,
    gutUrgency: body.data.gutUrgency ?? null,
    gutTendency: body.data.gutTendency ?? null,
    plan5w2h: body.data.plan5w2h ?? null,
    rootCause: body.data.rootCause ?? derived.rootCause ?? null,
    rootCauseWhys: body.data.rootCauseWhys ?? null,
    responsibleUserId: body.data.responsibleUserId ?? null,
    dueDate: body.data.dueDate ? new Date(body.data.dueDate) : null,
    correctiveActionDescription: body.data.correctiveActionDescription ?? null,
    effectivenessMethod: body.data.effectivenessMethod ?? null,
    effectivenessDueDate: body.data.effectivenessDueDate ? new Date(body.data.effectivenessDueDate) : null,
    effectivenessEvaluatorUserId: body.data.effectivenessEvaluatorUserId ?? null,
    odsNumbers: body.data.odsNumbers ?? null,
    normRefs: body.data.normRefs ?? derived.normRefs ?? null,
    relatedIndicatorIds: body.data.relatedIndicatorIds ?? derived.relatedIndicatorIds ?? null,
    relatedRiskIds: body.data.relatedRiskIds ?? derived.relatedRiskIds ?? null,
    createdByUserId: req.auth!.userId,
    closedAt: status === "completed" || status === "cancelled" ? new Date() : null,
  }).returning();

  const creatorName = await currentUserName(req.auth!.userId);
  await logActionPlanActivity({
    orgId: params.data.orgId,
    actionPlanId: row.id,
    action: "created",
    userId: req.auth!.userId,
    userName: creatorName,
    changes: { kind: "snapshot", data: { code, title: row.title, sourceModule: row.sourceModule, status: row.status } },
  });

  // A plan can be BORN with a planning block — the POST accepts plan5w2h /
  // rootCause / rootCauseWhys, and `deriveCreateDefaults` inherits the rootCause
  // of an origin nonconformity. The `created` snapshot doesn't carry the block, so
  // without a dedicated entry the initial state would survive only in the `from`
  // of the first later edit — and restore reads only `to`, leaving no restorable
  // version of the initial state. Record it as the first version, right after
  // `created`, as an edit from the empty block. A plan born empty logs nothing.
  const emptyPlanning: PlanningBlock = { plan5w2h: null, rootCause: null, rootCauseWhys: null };
  const initialPlanning = normalizedPlanning(row);
  if (planningChanged(emptyPlanning, initialPlanning)) {
    await logActionPlanActivity({
      orgId: params.data.orgId,
      actionPlanId: row.id,
      action: "updated",
      userId: req.auth!.userId,
      userName: creatorName,
      changes: {
        kind: "diff",
        fields: { planning: { from: emptyPlanning, to: initialPlanning } },
      },
    });
  }

  // Notify the responsible user / evaluator if the action is created already assigned.
  await notifyActionPlanAssignment(row, req.auth!.userId);
  await notifyActionPlanEvaluatorAssignment(row, req.auth!.userId);

  const out = await loadAndSerializePlan(params.data.orgId, row.id);
  res.status(201).json(out);
});

// ─── Update ────────────────────────────────────────────────────────────────

router.patch("/organizations/:orgId/action-plans/:planId", requireAuth, requirePlanAccess(), requireWriteAccess(), async (req, res): Promise<void> => {
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

  // Lock: an encerrado plan (final Encerramento stage / cancelled) is frozen for
  // everyone. The ONLY permitted mutation is an admin (SGI) reopening it — a
  // status-only change back to open/in_progress. Any other edit is rejected.
  if (isActionPlanEncerrado(existing)) {
    const isAdmin = req.auth!.role === "platform_admin" || req.auth!.role === "org_admin";
    const target = body.data.status;
    const isReopen = target === "open" || target === "in_progress";
    const onlyStatusChanged = Object.entries(body.data).every(([k, v]) => k === "status" || v === undefined);
    if (!isReopen || !onlyStatusChanged) {
      res.status(409).json({ error: "Plano encerrado está bloqueado para alterações. Um administrador (SGI) precisa reabri-lo para editar." });
      return;
    }
    if (!isAdmin) {
      res.status(403).json({ error: "Somente um administrador (SGI) pode reabrir um plano encerrado." });
      return;
    }
  }

  const update: Record<string, unknown> = {};
  if (body.data.actionType !== undefined) update.actionType = body.data.actionType;
  if (body.data.title !== undefined) update.title = body.data.title;
  if (body.data.description !== undefined) update.description = body.data.description;

  let statusChanged = false;
  let reopened = false;
  if (body.data.status !== undefined) {
    update.status = body.data.status;
    statusChanged = body.data.status !== existing.status;
    if ((body.data.status === "completed" || body.data.status === "cancelled") && !existing.closedAt) {
      update.closedAt = new Date();
    }
    if (body.data.status === "open" || body.data.status === "in_progress") {
      update.closedAt = null;
      if (existing.status === "completed" || existing.status === "cancelled") reopened = true;
    }
  }
  if (body.data.priority !== undefined) update.priority = body.data.priority;
  if (body.data.gutGravity !== undefined) update.gutGravity = body.data.gutGravity;
  if (body.data.gutUrgency !== undefined) update.gutUrgency = body.data.gutUrgency;
  if (body.data.gutTendency !== undefined) update.gutTendency = body.data.gutTendency;
  // Normalize the planning block ON WRITE so the DB holds the canonical form and
  // the "every persisted change is logged" invariant holds: `planningChanged` and
  // the activity log both compare NORMALIZED blocks, so persisting a raw value
  // could store a whitespace-only edit that no entry ever records. Merge the
  // incoming fields over the current row, normalize, then write back only the
  // fields the caller actually sent (a PATCH that omits a field must not start
  // persisting it).
  if (
    body.data.plan5w2h !== undefined ||
    body.data.rootCause !== undefined ||
    body.data.rootCauseWhys !== undefined
  ) {
    const normalized = normalizePlanning(
      extractPlanning({
        plan5w2h: body.data.plan5w2h !== undefined ? body.data.plan5w2h : existing.plan5w2h,
        rootCause: body.data.rootCause !== undefined ? body.data.rootCause : existing.rootCause,
        rootCauseWhys: body.data.rootCauseWhys !== undefined ? body.data.rootCauseWhys : existing.rootCauseWhys,
      }),
    );
    if (body.data.plan5w2h !== undefined) update.plan5w2h = normalized.plan5w2h;
    if (body.data.rootCause !== undefined) update.rootCause = normalized.rootCause;
    if (body.data.rootCauseWhys !== undefined) update.rootCauseWhys = normalized.rootCauseWhys;
  }

  if (body.data.responsibleUserId !== undefined) {
    if (body.data.responsibleUserId !== null) {
      const ok = await assertUserBelongsToOrg(body.data.responsibleUserId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" }); return; }
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

  // ─── Effectiveness ─────────────────────────────────────────────────────────
  let effectivenessEvaluated = false;
  if (body.data.effectivenessMethod !== undefined) update.effectivenessMethod = body.data.effectivenessMethod;
  if (body.data.effectivenessDueDate !== undefined) {
    update.effectivenessDueDate = body.data.effectivenessDueDate ? new Date(body.data.effectivenessDueDate) : null;
  }
  if (body.data.effectivenessEvaluatorUserId !== undefined) {
    if (body.data.effectivenessEvaluatorUserId !== null) {
      const ok = await assertUserBelongsToOrg(body.data.effectivenessEvaluatorUserId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "effectivenessEvaluatorUserId não corresponde a um usuário desta organização" }); return; }
      if (await userIsAnalyst(body.data.effectivenessEvaluatorUserId, params.data.orgId)) {
        res.status(400).json({ error: "O avaliador de eficácia deve ter acesso de escrita — analistas (somente leitura) não podem emitir o veredito." });
        return;
      }
    }
    // Governance: only an SGI admin may (re)designate or clear the evaluator — this
    // is what makes the verdict lock effective (an operator can't self-designate).
    if (body.data.effectivenessEvaluatorUserId !== existing.effectivenessEvaluatorUserId) {
      const isAdmin = req.auth!.role === "platform_admin" || req.auth!.role === "org_admin";
      if (!isAdmin) { res.status(403).json({ error: "Somente um administrador (SGI) pode designar o avaliador de eficácia." }); return; }
    }
    update.effectivenessEvaluatorUserId = body.data.effectivenessEvaluatorUserId;
  }
  // Independence: the evaluator must differ from the responsible (either side may change here).
  {
    const effResponsible = body.data.responsibleUserId !== undefined ? body.data.responsibleUserId : existing.responsibleUserId;
    const effEvaluator = body.data.effectivenessEvaluatorUserId !== undefined ? body.data.effectivenessEvaluatorUserId : existing.effectivenessEvaluatorUserId;
    if (effResponsible != null && effEvaluator != null && effResponsible === effEvaluator) {
      res.status(400).json({ error: "O avaliador da eficácia deve ser diferente do responsável pela ação." });
      return;
    }
  }
  if (body.data.effectivenessBefore !== undefined) update.effectivenessBefore = body.data.effectivenessBefore;
  if (body.data.effectivenessAfter !== undefined) update.effectivenessAfter = body.data.effectivenessAfter;
  if (body.data.effectivenessComment !== undefined) update.effectivenessComment = body.data.effectivenessComment;
  if (body.data.effectivenessResult !== undefined) {
    // Verdict lock: only the designated evaluator (or an SGI admin) may TOUCH the
    // verdict — set it, change it, OR clear an existing one. Any transition into or
    // out of a verdict state is gated; designating the evaluator is a separate save.
    if (body.data.effectivenessResult !== existing.effectivenessResult) {
      const newIsVerdict = body.data.effectivenessResult === "effective" || body.data.effectivenessResult === "ineffective";
      const oldIsVerdict = existing.effectivenessResult === "effective" || existing.effectivenessResult === "ineffective";
      if (newIsVerdict || oldIsVerdict) {
        const isAdmin = req.auth!.role === "platform_admin" || req.auth!.role === "org_admin";
        const isEvaluator = existing.effectivenessEvaluatorUserId !== null && existing.effectivenessEvaluatorUserId === req.auth!.userId;
        if (!isEvaluator && !isAdmin) {
          res.status(403).json({ error: "Somente o avaliador designado pode emitir ou alterar o veredito de eficácia." });
          return;
        }
      }
    }
    update.effectivenessResult = body.data.effectivenessResult;
    const becameVerdict = body.data.effectivenessResult === "effective" || body.data.effectivenessResult === "ineffective";
    if (becameVerdict && body.data.effectivenessResult !== existing.effectivenessResult) {
      update.effectivenessCheckedAt = new Date();
      effectivenessEvaluated = true;
    }
    if (body.data.effectivenessResult === null || body.data.effectivenessResult === "pending") {
      update.effectivenessCheckedAt = null;
    }
  }

  if (body.data.odsNumbers !== undefined) update.odsNumbers = body.data.odsNumbers;
  if (body.data.normRefs !== undefined) update.normRefs = body.data.normRefs;
  if (body.data.relatedIndicatorIds !== undefined) update.relatedIndicatorIds = body.data.relatedIndicatorIds;
  if (body.data.relatedRiskIds !== undefined) update.relatedRiskIds = body.data.relatedRiskIds;

  const [row] = await db.update(actionPlansTable)
    .set(Object.keys(update).length > 0 ? update : { updatedAt: new Date() })
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ))
    .returning();

  // ─── Activity log (one prioritized entry per update) ───────────────────────
  const userName = await currentUserName(req.auth!.userId);
  const logBase = { orgId: params.data.orgId, actionPlanId: row.id, userId: req.auth!.userId, userName };

  // Logged outside the prioritized chain below: that chain writes ONE entry per save,
  // so a save that changed both the status and the 5W2H would record only the status
  // and the block's version would vanish — the exact hole this feature closes.
  if (planningChanged(existing, row)) {
    await logActionPlanActivity({
      ...logBase,
      action: "updated",
      changes: {
        kind: "diff",
        fields: {
          planning: { from: normalizedPlanning(existing), to: normalizedPlanning(row) },
        },
      },
    });
  }

  if (reopened) {
    await logActionPlanActivity({ ...logBase, action: "reopened", changes: { kind: "note", message: `Reaberta (${existing.status} → ${row.status})` } });
  } else if (statusChanged) {
    await logActionPlanActivity({ ...logBase, action: "status_changed", changes: { kind: "diff", fields: { status: { from: existing.status, to: row.status } } } });
  } else if (effectivenessEvaluated) {
    await logActionPlanActivity({ ...logBase, action: "effectiveness_evaluated", changes: { kind: "diff", fields: { effectivenessResult: { from: existing.effectivenessResult ?? null, to: row.effectivenessResult ?? null } } } });
  } else {
    const diff: ActionPlanActivityChanges | null = buildDiff(
      existing as unknown as Record<string, unknown>,
      row as unknown as Record<string, unknown>,
      DIFF_FIELDS,
    );
    if (diff) await logActionPlanActivity({ ...logBase, action: "updated", changes: diff });
  }

  // Notify the new responsible user / evaluator when the assignment changed (skips unassign + self-assign).
  if (row.responsibleUserId !== existing.responsibleUserId) {
    await notifyActionPlanAssignment(row, req.auth!.userId);
  }
  if (row.effectivenessEvaluatorUserId !== existing.effectivenessEvaluatorUserId) {
    await notifyActionPlanEvaluatorAssignment(row, req.auth!.userId);
  }

  const out = await loadAndSerializePlan(params.data.orgId, row.id);
  res.json(out);
});

// ─── Delete ────────────────────────────────────────────────────────────────

router.delete("/organizations/:orgId/action-plans/:planId", requireAuth, requirePlanAccess(), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteActionPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [existing] = await db
    .select({ status: actionPlansTable.status, effectivenessResult: actionPlansTable.effectivenessResult })
    .from(actionPlansTable)
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ));
  if (!existing) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }

  // An encerrado plan can only be removed by an admin (SGI).
  if (isActionPlanEncerrado(existing)) {
    const isAdmin = req.auth!.role === "platform_admin" || req.auth!.role === "org_admin";
    if (!isAdmin) {
      res.status(403).json({ error: "Somente um administrador (SGI) pode excluir um plano encerrado." });
      return;
    }
  }

  const [row] = await db.delete(actionPlansTable)
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ))
    .returning();

  if (!row) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }
  res.status(204).send();
});

// ─── Comments ────────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/action-plans/:planId/comments", requireAuth, requirePlanAccess(), async (req, res): Promise<void> => {
  const params = ListActionPlanCommentsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [plan] = await db
    .select({ id: actionPlansTable.id })
    .from(actionPlansTable)
    .where(and(eq(actionPlansTable.id, params.data.planId), eq(actionPlansTable.organizationId, params.data.orgId)));
  if (!plan) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }

  const comments = await db
    .select()
    .from(actionPlanCommentsTable)
    .where(eq(actionPlanCommentsTable.actionPlanId, params.data.planId))
    .orderBy(desc(actionPlanCommentsTable.createdAt));

  const userNameMap = await resolveUserNames(comments.map((c) => c.createdByUserId));
  res.json(comments.map((c) => serializeComment(
    c,
    c.createdByUserId !== null ? (userNameMap.get(c.createdByUserId) ?? null) : null,
  )));
});

router.post("/organizations/:orgId/action-plans/:planId/comments", requireAuth, requirePlanAccess(), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = AddActionPlanCommentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = AddActionPlanCommentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [plan] = await db
    .select({ id: actionPlansTable.id })
    .from(actionPlansTable)
    .where(and(eq(actionPlansTable.id, params.data.planId), eq(actionPlansTable.organizationId, params.data.orgId)));
  if (!plan) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }

  const [row] = await db.insert(actionPlanCommentsTable).values({
    organizationId: params.data.orgId,
    actionPlanId: params.data.planId,
    body: body.data.body,
    createdByUserId: req.auth!.userId,
  }).returning();

  res.status(201).json(serializeComment(row, await currentUserName(req.auth!.userId)));
});

// ─── Activity log ─────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/action-plans/:planId/activity", requireAuth, requirePlanAccess(), async (req, res): Promise<void> => {
  const params = ListActionPlanActivityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [plan] = await db
    .select({ id: actionPlansTable.id })
    .from(actionPlansTable)
    .where(and(eq(actionPlansTable.id, params.data.planId), eq(actionPlansTable.organizationId, params.data.orgId)));
  if (!plan) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }

  const entries = await db
    .select()
    .from(actionPlanActivityLogTable)
    .where(eq(actionPlanActivityLogTable.actionPlanId, params.data.planId))
    .orderBy(desc(actionPlanActivityLogTable.createdAt));

  res.json(entries.map(serializeActivityEntry));
});

// ─── Restore a planning version ──────────────────────────────────────────────
// The chosen entry's `to` IS a complete snapshot of the block, so restoring is
// applying it. Never destructive: the restore itself becomes a new entry.

router.post(
  "/organizations/:orgId/action-plans/:planId/planning/restore",
  requireAuth,
  requirePlanAccess(),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const orgId = Number(req.params.orgId);
    const planId = Number(req.params.planId);
    // `requirePlanAccess()` intentionally lets non-integer ids fall through, so
    // guard them here before the first query — otherwise NaN reaches Drizzle and
    // Postgres 500s, instead of the 400 the sibling routes return.
    if (!Number.isInteger(orgId) || orgId <= 0 || !Number.isInteger(planId) || planId <= 0) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    const activityId = Number((req.body as { activityId?: unknown })?.activityId);
    if (!Number.isInteger(activityId) || activityId <= 0) {
      res.status(400).json({ error: "activityId inválido" });
      return;
    }

    const [existing] = await db
      .select()
      .from(actionPlansTable)
      .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)));
    if (!existing) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }
    if (isActionPlanEncerrado(existing)) {
      res.status(409).json({ error: "Plano encerrado não pode ser editado." });
      return;
    }

    const [entry] = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(
        and(
          eq(actionPlanActivityLogTable.id, activityId),
          eq(actionPlanActivityLogTable.actionPlanId, planId),
          eq(actionPlanActivityLogTable.organizationId, orgId),
        ),
      );
    const changes = entry?.changes as
      | { kind?: string; fields?: { planning?: { to?: unknown } } }
      | null
      | undefined;
    const target = changes?.fields?.planning?.to as PlanningBlock | undefined;
    if (!target) {
      res.status(404).json({ error: "Versão do planejamento não encontrada" });
      return;
    }

    const restored = normalizePlanning(target);
    if (!planningChanged(existing, restored)) {
      const out = await loadAndSerializePlan(orgId, planId);
      res.json(out);
      return;
    }

    const [row] = await db
      .update(actionPlansTable)
      .set({
        plan5w2h: restored.plan5w2h,
        rootCause: restored.rootCause,
        rootCauseWhys: restored.rootCauseWhys,
        updatedAt: new Date(),
      })
      .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)))
      .returning();

    await logActionPlanActivity({
      orgId,
      actionPlanId: row.id,
      action: "updated",
      userId: req.auth!.userId,
      userName: await currentUserName(req.auth!.userId),
      changes: {
        kind: "diff",
        fields: { planning: { from: normalizedPlanning(existing), to: normalizedPlanning(row) } },
        restoredFrom: { activityId, at: entry.createdAt.toISOString() },
      },
    });

    res.json(await loadAndSerializePlan(orgId, planId));
  },
);

// ─── Evidence: add ─────────────────────────────────────────────────────────

router.post("/organizations/:orgId/action-plans/:planId/evidences", requireAuth, requirePlanAccess(), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = AddActionPlanEvidenceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = AddActionPlanEvidenceBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [plan] = await db
    .select({ id: actionPlansTable.id, status: actionPlansTable.status, effectivenessResult: actionPlansTable.effectivenessResult })
    .from(actionPlansTable)
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ));
  if (!plan) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }
  if (isActionPlanEncerrado(plan)) {
    res.status(409).json({ error: "Plano encerrado está bloqueado para alterações. Um administrador (SGI) precisa reabri-lo para anexar evidências." });
    return;
  }

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

  const uploadedByUserName = await currentUserName(row.uploadedByUserId);
  await logActionPlanActivity({
    orgId: params.data.orgId,
    actionPlanId: params.data.planId,
    action: "evidence_added",
    userId: req.auth!.userId,
    userName: uploadedByUserName,
    changes: { kind: "note", message: `Evidência anexada: ${row.fileName}` },
  });

  res.status(201).json(serializeEvidence(row, uploadedByUserName));
});

// ─── Evidence: delete ──────────────────────────────────────────────────────

router.delete("/organizations/:orgId/action-plans/:planId/evidences/:evidenceId", requireAuth, requirePlanAccess(), requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteActionPlanEvidenceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [plan] = await db
    .select({ id: actionPlansTable.id, status: actionPlansTable.status, effectivenessResult: actionPlansTable.effectivenessResult })
    .from(actionPlansTable)
    .where(and(
      eq(actionPlansTable.id, params.data.planId),
      eq(actionPlansTable.organizationId, params.data.orgId),
    ));
  if (!plan) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }
  if (isActionPlanEncerrado(plan)) {
    res.status(409).json({ error: "Plano encerrado está bloqueado para alterações. Um administrador (SGI) precisa reabri-lo para remover evidências." });
    return;
  }

  const [row] = await db.delete(actionPlanEvidencesTable)
    .where(and(
      eq(actionPlanEvidencesTable.id, params.data.evidenceId),
      eq(actionPlanEvidencesTable.actionPlanId, params.data.planId),
    ))
    .returning();

  if (!row) { res.status(404).json({ error: "Evidência não encontrada" }); return; }

  await logActionPlanActivity({
    orgId: params.data.orgId,
    actionPlanId: params.data.planId,
    action: "evidence_removed",
    userId: req.auth!.userId,
    userName: await currentUserName(req.auth!.userId),
    changes: { kind: "note", message: `Evidência removida: ${row.fileName}` },
  });

  res.status(204).send();
});

export default router;
