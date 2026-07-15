// As ações do plano — o 5W2H rastreável (ver `action_plan_actions` no schema).
// Aninhadas sob /action-plans/:planId/actions; toda rota passa por
// requirePlanAccess() (mesma guarda de acesso ao plano de origem) e respeita o
// lock de plano encerrado.

import { Router, type IRouter } from "express";
import { and, asc, eq, max } from "drizzle-orm";
import {
  db,
  actionPlanActionsTable,
  actionPlansTable,
  isActionPlanEncerrado,
  type ActionPlan,
} from "@workspace/db";
import {
  CreateActionPlanActionBody,
  CreateActionPlanActionParams,
  DeleteActionPlanActionParams,
  ListActionPlanActionsParams,
  UpdateActionPlanActionBody,
  UpdateActionPlanActionParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";
import { requirePlanAccess } from "../middlewares/plan-access";
import { logActionPlanActivity } from "../services/action-plans/activity";
import { notifyActionPlanActionAssignment } from "../services/action-plans/notify-assignment";
import {
  assertUserBelongsToOrg,
  resolveUserNames,
  serializeAction,
} from "../services/action-plans/serializers";

const router: IRouter = Router();

// `currentUserName` em routes/action-plans.ts é uma função local, não exportada
// — não dá para importá-la. Resolve-se o nome do ator com `resolveUserNames`
// (essa sim exportada de services/action-plans/serializers.ts).
async function currentUserName(userId: number | null | undefined): Promise<string | null> {
  if (userId == null) return null;
  const map = await resolveUserNames([userId]);
  return map.get(userId) ?? null;
}

type LoadEditablePlanResult =
  | { error: { status: 404 | 409; message: string } }
  | { plan: ActionPlan };

/** Carrega o plano e recusa a edição se ele estiver encerrado.
 *  Retorno com tipo explícito: com 3 branches de `return` inferidos, o `"error" in
 *  loaded` não estreita por completo o tipo (loaded.error acusa "possibly
 *  undefined") — anotar o retorno como uma união de 2 membros resolve. */
async function loadEditablePlan(orgId: number, planId: number): Promise<LoadEditablePlanResult> {
  const [plan] = await db
    .select()
    .from(actionPlansTable)
    .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)));
  if (!plan) return { error: { status: 404, message: "Plano não encontrado" } };
  if (isActionPlanEncerrado(plan)) {
    return {
      error: {
        status: 409,
        message: "Plano encerrado. Reabra o plano (ato de administrador SGI) para editá-lo.",
      },
    };
  }
  return { plan };
}

// ─── List ──────────────────────────────────────────────────────────────────

router.get(
  "/organizations/:orgId/action-plans/:planId/actions",
  requireAuth,
  requirePlanAccess(),
  async (req, res): Promise<void> => {
    const params = ListActionPlanActionsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    // Confere a existência do plano na org antes de listar — mesmo padrão de
    // GET .../comments e GET .../activity. Sem isso, um planId inexistente (ou de
    // outra org) devolveria 200 [] em vez de 404.
    const [plan] = await db
      .select({ id: actionPlansTable.id })
      .from(actionPlansTable)
      .where(and(eq(actionPlansTable.id, params.data.planId), eq(actionPlansTable.organizationId, params.data.orgId)));
    if (!plan) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }

    const rows = await db
      .select()
      .from(actionPlanActionsTable)
      .where(and(
        eq(actionPlanActionsTable.actionPlanId, params.data.planId),
        eq(actionPlanActionsTable.organizationId, params.data.orgId),
      ))
      .orderBy(asc(actionPlanActionsTable.sortOrder), asc(actionPlanActionsTable.id));

    const names = await resolveUserNames(rows.map((r) => r.responsibleUserId));
    res.json(rows.map((r) => serializeAction(r, r.responsibleUserId ? names.get(r.responsibleUserId) ?? null : null)));
  },
);

// ─── Create ────────────────────────────────────────────────────────────────

router.post(
  "/organizations/:orgId/action-plans/:planId/actions",
  requireAuth,
  requirePlanAccess(),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateActionPlanActionParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = CreateActionPlanActionBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const loaded = await loadEditablePlan(params.data.orgId, params.data.planId);
    if ("error" in loaded) { res.status(loaded.error.status).json({ error: loaded.error.message }); return; }

    // Mesma regra do PATCH: uma ação sem enunciado não pode nascer já concluída — o registro
    // ficaria sem sentido para o auditor ("concluída: (vazio)").
    if (body.data.status === "completed" && !body.data.what?.trim()) {
      res.status(400).json({ error: "Descreva o que será feito (campo \"O quê\") antes de concluir a ação." });
      return;
    }

    if (body.data.responsibleUserId != null) {
      const ok = await assertUserBelongsToOrg(body.data.responsibleUserId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" }); return; }
    }

    const [{ value: currentMax } = { value: null }] = await db
      .select({ value: max(actionPlanActionsTable.sortOrder) })
      .from(actionPlanActionsTable)
      .where(eq(actionPlanActionsTable.actionPlanId, params.data.planId));

    const status = body.data.status ?? "open";
    const [row] = await db
      .insert(actionPlanActionsTable)
      .values({
        organizationId: params.data.orgId,
        actionPlanId: params.data.planId,
        what: body.data.what ?? null,
        why: body.data.why ?? null,
        whereAt: body.data.whereAt ?? null,
        how: body.data.how ?? null,
        howMuch: body.data.howMuch ?? null,
        responsibleUserId: body.data.responsibleUserId ?? null,
        dueDate: body.data.dueDate ? new Date(body.data.dueDate) : null,
        status,
        // Coerente com o PATCH: completed ⇒ completedAt carimbado no servidor.
        completedAt: status === "completed" ? new Date() : null,
        notes: body.data.notes ?? null,
        sortOrder: (currentMax ?? -1) + 1,
        createdByUserId: req.auth!.userId,
      })
      .returning();

    const userName = await currentUserName(req.auth!.userId);
    await logActionPlanActivity({
      orgId: params.data.orgId,
      actionPlanId: params.data.planId,
      action: "action_added",
      userId: req.auth!.userId,
      userName,
      changes: { kind: "action", actionId: row.id, what: row.what ?? "(sem enunciado)" },
    });

    await notifyActionPlanActionAssignment(loaded.plan, row, req.auth!.userId);

    const names = await resolveUserNames([row.responsibleUserId]);
    res.status(201).json(
      serializeAction(row, row.responsibleUserId ? names.get(row.responsibleUserId) ?? null : null),
    );
  },
);

// ─── Update ────────────────────────────────────────────────────────────────

router.patch(
  "/organizations/:orgId/action-plans/:planId/actions/:actionId",
  requireAuth,
  requirePlanAccess(),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateActionPlanActionParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateActionPlanActionBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const loaded = await loadEditablePlan(params.data.orgId, params.data.planId);
    if ("error" in loaded) { res.status(loaded.error.status).json({ error: loaded.error.message }); return; }

    const [existing] = await db
      .select()
      .from(actionPlanActionsTable)
      .where(and(
        eq(actionPlanActionsTable.id, params.data.actionId),
        eq(actionPlanActionsTable.actionPlanId, params.data.planId),
        eq(actionPlanActionsTable.organizationId, params.data.orgId),
      ));
    if (!existing) { res.status(404).json({ error: "Ação não encontrada" }); return; }

    if (body.data.responsibleUserId != null) {
      const ok = await assertUserBelongsToOrg(body.data.responsibleUserId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" }); return; }
    }

    const update: Record<string, unknown> = {};
    for (const field of ["what", "why", "whereAt", "how", "howMuch", "notes"] as const) {
      if (body.data[field] !== undefined) {
        const value = body.data[field];
        update[field] = typeof value === "string" ? value.trim() || null : null;
      }
    }
    if (body.data.responsibleUserId !== undefined) update.responsibleUserId = body.data.responsibleUserId;
    if (body.data.dueDate !== undefined) update.dueDate = body.data.dueDate ? new Date(body.data.dueDate) : null;
    if (body.data.sortOrder !== undefined) update.sortOrder = body.data.sortOrder;

    if (body.data.status !== undefined && body.data.status !== existing.status) {
      // Uma ação sem enunciado não pode ser dada como feita — o registro ficaria sem sentido
      // para o auditor ("concluída: (vazio)").
      const what = body.data.what !== undefined ? body.data.what : existing.what;
      if (body.data.status === "completed" && !what?.trim()) {
        res.status(400).json({ error: "Descreva o que será feito (campo \"O quê\") antes de concluir a ação." });
        return;
      }
      update.status = body.data.status;
      update.completedAt = body.data.status === "completed" ? new Date() : null;
    }

    const [row] = await db
      .update(actionPlanActionsTable)
      .set(Object.keys(update).length > 0 ? update : { updatedAt: new Date() })
      .where(eq(actionPlanActionsTable.id, params.data.actionId))
      .returning();

    // Log só do que mudou de fato — um autosave que reenvia o mesmo valor não vira entrada.
    const fields: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(update)) {
      const before = (existing as Record<string, unknown>)[key];
      const after = (row as Record<string, unknown>)[key];
      if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
        fields[key] = { from: before ?? null, to: after ?? null };
      }
    }
    if (Object.keys(fields).length > 0) {
      const userName = await currentUserName(req.auth!.userId);
      await logActionPlanActivity({
        orgId: params.data.orgId,
        actionPlanId: params.data.planId,
        action: "action_updated",
        userId: req.auth!.userId,
        userName,
        changes: { kind: "action", actionId: row.id, what: row.what ?? "(sem enunciado)", fields },
      });
    }

    if (row.responsibleUserId !== existing.responsibleUserId) {
      await notifyActionPlanActionAssignment(loaded.plan, row, req.auth!.userId);
    }

    const names = await resolveUserNames([row.responsibleUserId]);
    res.json(serializeAction(row, row.responsibleUserId ? names.get(row.responsibleUserId) ?? null : null));
  },
);

// ─── Delete ────────────────────────────────────────────────────────────────

router.delete(
  "/organizations/:orgId/action-plans/:planId/actions/:actionId",
  requireAuth,
  requirePlanAccess(),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteActionPlanActionParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const loaded = await loadEditablePlan(params.data.orgId, params.data.planId);
    if ("error" in loaded) { res.status(loaded.error.status).json({ error: loaded.error.message }); return; }

    const [removed] = await db
      .delete(actionPlanActionsTable)
      .where(and(
        eq(actionPlanActionsTable.id, params.data.actionId),
        eq(actionPlanActionsTable.actionPlanId, params.data.planId),
        eq(actionPlanActionsTable.organizationId, params.data.orgId),
      ))
      .returning();
    if (!removed) { res.status(404).json({ error: "Ação não encontrada" }); return; }

    // O `what` vai snapshotado: a linha deixou de existir, mas o auditor vai perguntar
    // qual ação foi removida (mesma razão do `userName` no log).
    const userName = await currentUserName(req.auth!.userId);
    await logActionPlanActivity({
      orgId: params.data.orgId,
      actionPlanId: params.data.planId,
      action: "action_removed",
      userId: req.auth!.userId,
      userName,
      changes: { kind: "action", actionId: removed.id, what: removed.what ?? "(sem enunciado)" },
    });

    res.status(204).end();
  },
);

export default router;
