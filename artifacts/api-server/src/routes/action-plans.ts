import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, asc, desc, eq, exists, gte, inArray, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import {
  actionPlanActionsTable,
  actionPlanActivityLogTable,
  actionPlanCommentsTable,
  actionPlanEvidencesTable,
  actionPlanResponsiblesTable,
  actionPlansTable,
  db,
  isActionPlanEncerrado,
  type ActionPlanActivityChanges,
  type ActionPlanAnalysis,
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
  RestoreActionPlanPlanningBody,
  RestoreActionPlanPlanningParams,
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
} from "../middlewares/auth";
import { requirePlanAccess, SOURCE_MODULE_OWNER } from "../middlewares/plan-access";
import { resolveSourceContexts } from "../services/action-plans/source-context";
import { normalizeAnalyses, parseAnalyses } from "../services/action-plans/analyses";
import {
  isPlanCoResponsible,
  listCoResponsibleIds,
  listCoResponsiblesByPlan,
  setPlanCoResponsibles,
} from "../services/action-plans/responsibles";
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
import { assertEffectivenessMethodBelongsToOrg } from "../services/effectiveness-methods/validate";
import { computeActionPlanSummary } from "../services/action-plans/summary";
import { listExternalActions } from "../services/action-plans/external";
import { buildDiff, logActionPlanActivity } from "../services/action-plans/activity";
import { extractPlanning, normalizePlanning, planningChanged, type PlanningBlock } from "../services/action-plans/planning";
import {
  notifyActionPlanAssignment,
  notifyActionPlanCoResponsibleAssignment,
  notifyActionPlanEvaluatorAssignment,
} from "../services/action-plans/notify-assignment";
import { draftActionPlanFromProblem } from "../services/action-plans/ai-draft";
import { AiCompletionError } from "../services/ai/json-completion";

const router: IRouter = Router();

/** Tracked fields for the update activity diff (display labels handled client-side).
 *  The planning block (root cause + tratativas) is logged separately, as one
 *  logical field — see `planning.ts`. The responsible set (ponto focal +
 *  co-responsáveis) is ALSO logged separately, with names instead of ids —
 *  see the `pontoFocal`/`coResponsibles` block below `planningChanged`. */
const DIFF_FIELDS = [
  "title",
  "description",
  "actionType",
  "priority",
  "gutGravity",
  "gutUrgency",
  "gutTendency",
  "dueDate",
  "correctiveActionDescription",
];

async function currentUserName(userId: number | null | undefined): Promise<string | null> {
  if (userId == null) return null;
  const map = await resolveUserNames([userId]);
  return map.get(userId) ?? null;
}

/** The block as it goes into the log: normalized, so an empty planning block reads
 *  as null whether the row holds `{}`/`[]` or `null`. */
function normalizedPlanning(row: Parameters<typeof extractPlanning>[0]) {
  return normalizePlanning(extractPlanning(row));
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
    // "É responsável": ponto focal OU co-responsável. O nome do parâmetro segue no
    // singular; a semântica é de pertinência ao conjunto de responsáveis do plano.
    const responsibleUserId = query.data.responsibleUserId;
    conditions.push(
      or(
        eq(actionPlansTable.responsibleUserId, responsibleUserId),
        exists(
          db
            .select({ one: sql`1` })
            .from(actionPlanResponsiblesTable)
            .where(
              and(
                eq(actionPlanResponsiblesTable.actionPlanId, actionPlansTable.id),
                eq(actionPlanResponsiblesTable.userId, responsibleUserId),
              ),
            ),
        ),
      )!,
    );
  }
  if (query.data.sourceKpiMonthlyValueId !== undefined) {
    conditions.push(
      sql`(${actionPlansTable.sourceRef}->>'kpiMonthlyValueId')::int = ${query.data.sourceKpiMonthlyValueId}`,
    );
  }
  if (query.data.actionType) conditions.push(eq(actionPlansTable.actionType, query.data.actionType));
  if (query.data.effectiveness === "effective" || query.data.effectiveness === "ineffective") {
    conditions.push(eq(actionPlansTable.effectivenessResult, query.data.effectiveness));
  } else if (query.data.effectiveness === "pending") {
    // "Aguardando verificação": concluída, ainda sem veredito. Mesmo critério do
    // tile "Aguardando" (eficacia-screen) e do escalation: result NULL OU 'pending'.
    conditions.push(eq(actionPlansTable.status, "completed"));
    const noVerdict = or(isNull(actionPlansTable.effectivenessResult), eq(actionPlansTable.effectivenessResult, "pending"));
    if (noVerdict) conditions.push(noVerdict);
  }
  if (query.data.dueWindow) {
    // Mesmas fronteiras do card (summary.ts): meia-noite local + 7 dias.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueSoonLimit = new Date(startOfToday.getTime() + 7 * 86_400_000);
    conditions.push(notInArray(actionPlansTable.status, ["completed", "cancelled"]));
    if (query.data.dueWindow === "overdue") {
      conditions.push(lt(actionPlansTable.dueDate, startOfToday));
    } else {
      conditions.push(gte(actionPlansTable.dueDate, startOfToday));
      conditions.push(lt(actionPlansTable.dueDate, dueSoonLimit));
    }
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

  // Um único SELECT agrupado para todos os planos da listagem — nunca uma consulta
  // por plano (N+1).
  const actionCounts = await db
    .select({
      actionPlanId: actionPlanActionsTable.actionPlanId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${actionPlanActionsTable.status} = 'completed')::int`,
    })
    .from(actionPlanActionsTable)
    .where(eq(actionPlanActionsTable.organizationId, params.data.orgId))
    .groupBy(actionPlanActionsTable.actionPlanId);
  const actionCountByPlan = new Map(actionCounts.map((c) => [c.actionPlanId, c]));

  const userNameMap = await resolveUserNames(plans.map((p) => p.responsibleUserId));
  const coResponsiblesByPlan = await listCoResponsiblesByPlan(planIds);
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
    coResponsibles: coResponsiblesByPlan.get(p.id) ?? [],
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    evidencesCount: countMap.get(p.id) ?? 0,
    actionsTotal: actionCountByPlan.get(p.id)?.total ?? 0,
    actionsDone: actionCountByPlan.get(p.id)?.done ?? 0,
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
  const coResponsiblesByPlan = await listCoResponsiblesByPlan([plan.id]);

  const actionRows = await db
    .select({ status: actionPlanActionsTable.status })
    .from(actionPlanActionsTable)
    .where(eq(actionPlanActionsTable.actionPlanId, planId));
  const actionsTotal = actionRows.length;
  const actionsDone = actionRows.filter((a) => a.status === "completed").length;

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
    coResponsibles: coResponsiblesByPlan.get(plan.id) ?? [],
    actionsTotal,
    actionsDone,
  });
}

router.get("/organizations/:orgId/action-plans/:planId", requireAuth, requirePlanAccess({ allowActionAssignee: true }), async (req, res): Promise<void> => {
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

  const coResponsibleIds = [...new Set(body.data.coResponsibleUserIds ?? [])];

  // Todo id referenciado tem de ser usuário DESTA org (barra cross-tenant + erro de FK).
  for (const userId of [
    body.data.responsibleUserId,
    ...coResponsibleIds,
    body.data.effectivenessEvaluatorUserId,
  ].filter((v): v is number => typeof v === "number")) {
    const ok = await assertUserBelongsToOrg(userId, params.data.orgId);
    if (!ok) {
      res.status(400).json({ error: "Responsável, co-responsável ou avaliador não corresponde a um usuário desta organização" });
      return;
    }
  }

  // Ninguém é responsável duas vezes: o ponto focal não entra na lista de co-responsáveis.
  if (body.data.responsibleUserId != null && coResponsibleIds.includes(body.data.responsibleUserId)) {
    res.status(400).json({ error: "O ponto focal não pode também constar como co-responsável." });
    return;
  }

  // O método de verificação vem do catálogo da org — um id de outro tenant (ou
  // inexistente) não pode entrar no plano.
  if (body.data.effectivenessMethodId != null) {
    const ok = await assertEffectivenessMethodBelongsToOrg(params.data.orgId, body.data.effectivenessMethodId);
    if (!ok) { res.status(400).json({ error: "Método de verificação inválido para esta organização" }); return; }
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
  // Independência (ISO): quem verifica a eficácia não pode ser NENHUM dos responsáveis.
  if (
    body.data.effectivenessEvaluatorUserId != null &&
    (body.data.effectivenessEvaluatorUserId === body.data.responsibleUserId ||
      coResponsibleIds.includes(body.data.effectivenessEvaluatorUserId))
  ) {
    res.status(400).json({ error: "O avaliador da eficácia deve ser diferente do ponto focal e dos co-responsáveis." });
    return;
  }

  // As tratativas chegam validadas pelo zod do OpenAPI, mas a forma de `data` por chave e a
  // unicidade da chave são regra nossa — reforçadas aqui, independentemente de como o Orval
  // resolveu a união discriminada.
  let normalizedAnalyses: ActionPlanAnalysis[] | null = null;
  if (body.data.analyses != null) {
    const parsed = parseAnalyses(body.data.analyses);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const list = normalizeAnalyses(parsed.value);
    normalizedAnalyses = list.length ? list : null;
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
    rootCause: body.data.rootCause ?? derived.rootCause ?? null,
    analyses: normalizedAnalyses,
    responsibleUserId: body.data.responsibleUserId ?? null,
    dueDate: body.data.dueDate ? new Date(body.data.dueDate) : null,
    correctiveActionDescription: body.data.correctiveActionDescription ?? null,
    effectivenessMethodId: body.data.effectivenessMethodId ?? null,
    effectivenessDueDate: body.data.effectivenessDueDate ? new Date(body.data.effectivenessDueDate) : null,
    effectivenessEvaluatorUserId: body.data.effectivenessEvaluatorUserId ?? null,
    odsNumbers: body.data.odsNumbers ?? null,
    normRefs: body.data.normRefs ?? derived.normRefs ?? null,
    relatedIndicatorIds: body.data.relatedIndicatorIds ?? derived.relatedIndicatorIds ?? null,
    relatedRiskIds: body.data.relatedRiskIds ?? derived.relatedRiskIds ?? null,
    createdByUserId: req.auth!.userId,
    closedAt: status === "completed" || status === "cancelled" ? new Date() : null,
  }).returning();

  await setPlanCoResponsibles(params.data.orgId, row.id, coResponsibleIds);

  const creatorName = await currentUserName(req.auth!.userId);
  await logActionPlanActivity({
    orgId: params.data.orgId,
    actionPlanId: row.id,
    action: "created",
    userId: req.auth!.userId,
    userName: creatorName,
    changes: { kind: "snapshot", data: { code, title: row.title, sourceModule: row.sourceModule, status: row.status } },
  });

  // A plan can be BORN with a planning block — the POST accepts rootCause /
  // analyses, and `deriveCreateDefaults` inherits the rootCause of an origin
  // nonconformity. The `created` snapshot doesn't carry the block, so without a
  // dedicated entry the initial state would survive only in the `from` of the
  // first later edit — and restore reads only `to`, leaving no restorable
  // version of the initial state. Record it as the first version, right after
  // `created`, as an edit from the empty block. A plan born empty logs nothing.
  const emptyPlanning: PlanningBlock = { rootCause: null, analyses: null };
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

  // Notifica quem já nasce vinculado.
  await notifyActionPlanAssignment(row, req.auth!.userId);
  for (const userId of coResponsibleIds) {
    await notifyActionPlanCoResponsibleAssignment(row, userId, req.auth!.userId);
  }
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

  const existingCoIds = await listCoResponsibleIds(params.data.planId);
  const incomingCoIds =
    body.data.coResponsibleUserIds === undefined
      ? undefined
      : [...new Set(body.data.coResponsibleUserIds ?? [])];
  const finalCoIds = incomingCoIds ?? existingCoIds;

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
  // Normaliza o bloco de análise NA ESCRITA, para que o banco guarde a forma canônica e
  // valha a invariante "toda mudança persistida é logada": `planningChanged` e o activity
  // log comparam blocos NORMALIZADOS, então persistir um valor cru poderia gravar uma
  // edição só-de-espaços que entrada nenhuma registra. Faz o merge do que veio sobre a
  // linha atual, normaliza, e grava só os campos que o chamador realmente enviou (um PATCH
  // que omite um campo não pode passar a persisti-lo).
  if (body.data.analyses !== undefined) {
    if (body.data.analyses === null) {
      update.analyses = null;
    } else {
      const parsed = parseAnalyses(body.data.analyses);
      if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
      const list = normalizeAnalyses(parsed.value);
      update.analyses = list.length ? list : null;
    }
  }
  if (body.data.rootCause !== undefined || body.data.analyses !== undefined) {
    const normalized = normalizePlanning(
      extractPlanning({
        rootCause: body.data.rootCause !== undefined ? body.data.rootCause : existing.rootCause,
        analyses:
          body.data.analyses !== undefined
            ? (update.analyses as ActionPlanAnalysis[] | null)
            : existing.analyses,
      }),
    );
    if (body.data.rootCause !== undefined) update.rootCause = normalized.rootCause;
  }

  if (body.data.responsibleUserId !== undefined) {
    if (body.data.responsibleUserId !== null) {
      const ok = await assertUserBelongsToOrg(body.data.responsibleUserId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" }); return; }
    }
    update.responsibleUserId = body.data.responsibleUserId;
  }

  if (incomingCoIds !== undefined) {
    for (const userId of incomingCoIds) {
      const ok = await assertUserBelongsToOrg(userId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "Co-responsável não corresponde a um usuário desta organização" }); return; }
    }
  }

  // Ninguém é responsável duas vezes — qualquer dos dois lados pode estar mudando aqui.
  {
    const finalFocal = body.data.responsibleUserId !== undefined
      ? body.data.responsibleUserId
      : existing.responsibleUserId;
    if (finalFocal != null && finalCoIds.includes(finalFocal)) {
      res.status(400).json({ error: "O ponto focal não pode também constar como co-responsável." });
      return;
    }
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
  if (body.data.effectivenessMethodId !== undefined) {
    if (body.data.effectivenessMethodId !== null) {
      const ok = await assertEffectivenessMethodBelongsToOrg(params.data.orgId, body.data.effectivenessMethodId);
      if (!ok) { res.status(400).json({ error: "Método de verificação inválido para esta organização" }); return; }
    }
    update.effectivenessMethodId = body.data.effectivenessMethodId;
  }
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
  // Independência (ISO): o avaliador não pode ser o ponto focal nem um co-responsável.
  {
    const finalFocal = body.data.responsibleUserId !== undefined
      ? body.data.responsibleUserId
      : existing.responsibleUserId;
    const finalEvaluator = body.data.effectivenessEvaluatorUserId !== undefined
      ? body.data.effectivenessEvaluatorUserId
      : existing.effectivenessEvaluatorUserId;
    if (finalEvaluator != null && (finalEvaluator === finalFocal || finalCoIds.includes(finalEvaluator))) {
      res.status(400).json({ error: "O avaliador da eficácia deve ser diferente do ponto focal e dos co-responsáveis." });
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

  if (incomingCoIds !== undefined) {
    await setPlanCoResponsibles(params.data.orgId, params.data.planId, incomingCoIds);
  }

  // ─── Activity log (one prioritized entry per update) ───────────────────────
  const userName = await currentUserName(req.auth!.userId);
  const logBase = { orgId: params.data.orgId, actionPlanId: row.id, userId: req.auth!.userId, userName };

  // Logged outside the prioritized chain below: that chain writes ONE entry per save,
  // so a save that changed both the status and the planning block would record only the
  // status and the block's version would vanish — the exact hole this feature closes.
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

  // Nomes, não ids: o histórico é lido por auditor. `action_plan_activity_log` já
  // snapshota `userName` pelo mesmo motivo.
  {
    const focalChanged = row.responsibleUserId !== existing.responsibleUserId;
    const sortedFinalCo = [...finalCoIds].sort((a, b) => a - b);
    const coChanged = JSON.stringify(existingCoIds) !== JSON.stringify(sortedFinalCo);

    if (focalChanged || coChanged) {
      const nameMap = await resolveUserNames([
        existing.responsibleUserId,
        row.responsibleUserId,
        ...existingCoIds,
        ...sortedFinalCo,
      ]);
      const nameOf = (id: number) => nameMap.get(id) ?? `#${id}`;
      const fields: Record<string, { from: unknown; to: unknown }> = {};
      if (focalChanged) {
        fields.pontoFocal = {
          from: existing.responsibleUserId != null ? nameOf(existing.responsibleUserId) : null,
          to: row.responsibleUserId != null ? nameOf(row.responsibleUserId) : null,
        };
      }
      if (coChanged) {
        fields.coResponsibles = {
          from: existingCoIds.map(nameOf),
          to: sortedFinalCo.map(nameOf),
        };
      }
      await logActionPlanActivity({ ...logBase, action: "updated", changes: { kind: "diff", fields } });
    }
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

  // Notifica o ponto focal se ele mudou, e só os co-responsáveis que ENTRARAM.
  if (row.responsibleUserId !== existing.responsibleUserId) {
    await notifyActionPlanAssignment(row, req.auth!.userId);
  }
  for (const userId of finalCoIds.filter((id) => !existingCoIds.includes(id))) {
    await notifyActionPlanCoResponsibleAssignment(row, userId, req.auth!.userId);
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

router.get("/organizations/:orgId/action-plans/:planId/comments", requireAuth, requirePlanAccess({ allowActionAssignee: true }), async (req, res): Promise<void> => {
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

router.get("/organizations/:orgId/action-plans/:planId/activity", requireAuth, requirePlanAccess({ allowActionAssignee: true }), async (req, res): Promise<void> => {
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
    // Validate with Zod like every sibling route, NOT `Number()`: `Number(true) === 1`
    // and `Number([7]) === 7` would coerce a malformed body into a real id and restore
    // the wrong version. `requirePlanAccess()` lets non-integer ids fall through on
    // purpose, so the coerced params also guard NaN from reaching Drizzle (→ 400, not 500).
    const params = RestoreActionPlanPlanningParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const body = RestoreActionPlanPlanningBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
    const orgId = params.data.orgId;
    const planId = params.data.planId;
    const activityId = body.data.activityId;

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
        rootCause: restored.rootCause,
        analyses: restored.analyses,
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
