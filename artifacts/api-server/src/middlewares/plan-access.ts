// artifacts/api-server/src/middlewares/plan-access.ts
// Extraída de routes/action-plans.ts: as rotas das AÇÕES do plano (action-plan-actions.ts)
// precisam da mesma guarda de acesso ao plano de origem.

import { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { actionPlansTable, db, type ActionPlanSourceModule } from "@workspace/db";
import { userHasModuleAccess, type AppModule } from "./auth";

/**
 * Module that owns each action-plan origin. The hub (`actionPlans`) sees every
 * plan, but the "Ações vinculadas" widget embedded in the origin screens reads
 * this same listing scoped by `sourceModule` — so whoever may open the origin
 * screen may read the actions spawned from it. Without this, granting `kpi`
 * alone would break the RAC deviation flow with a 403.
 */
export const SOURCE_MODULE_OWNER: Record<ActionPlanSourceModule, AppModule> = {
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
export function requirePlanAccess() {
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
