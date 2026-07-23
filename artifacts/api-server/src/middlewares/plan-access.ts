// artifacts/api-server/src/middlewares/plan-access.ts
// Extraída de routes/action-plans.ts: as rotas das AÇÕES do plano (action-plan-actions.ts)
// precisam da mesma guarda de acesso ao plano de origem.

import { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { actionPlansTable, db, type ActionPlanSourceModule } from "@workspace/db";
import { userHasModuleAccess, type AppModule, type AuthPayload } from "./auth";
import {
  isPlanActionAssignee,
  isPlanCoResponsible,
  isPlanTaskAssignee,
} from "../services/action-plans/responsibles";

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
  improvement: "actionPlans",
  corrective: "actionPlans",
  norm_requirement: "actionPlans",
};

type PlanAccessRow = {
  sourceModule: ActionPlanSourceModule;
  responsibleUserId: number | null;
  effectivenessEvaluatorUserId: number | null;
};

/**
 * Acesso de NÍVEL DE PLANO: ponto focal, avaliador da eficácia, módulo do hub ou módulo
 * da origem. É o conjunto de quem pode CONDUZIR o plano — editar/excluir o plano e
 * qualquer ação dele.
 *
 * NÃO inclui co-responsável: desde o "Como" com dono por passo, co-responsável é
 * DERIVADO da execução (responde por uma ação ou recebeu um passo) e tem acesso
 * ESTREITO — abre a ficha e mexe só no que é dele —, não conduz o plano. Esse alcance
 * estreito entra por `allowActionAssignee` (leitura) + a trava de dono na rota PATCH da
 * ação. Promover todo executante a condutor seria escalada de privilégio.
 */
async function hasPlanLevelAccess(auth: AuthPayload, plan: PlanAccessRow, _planId: number): Promise<boolean> {
  const userId = auth.userId;
  // Ordem importa: os checks de módulo saem do cache de auth (30s), então o
  // curto-circuito evita a consulta à junção para quem já entra pelo módulo.
  return (
    plan.responsibleUserId === userId ||
    plan.effectivenessEvaluatorUserId === userId ||
    (await userHasModuleAccess(auth, "actionPlans")) ||
    (await userHasModuleAccess(auth, SOURCE_MODULE_OWNER[plan.sourceModule]))
  );
}

/**
 * Resolve, para um handler, se o usuário tem acesso de NÍVEL DE PLANO (conduz o plano) —
 * distinto de só executar uma ação. A rota PATCH da ação usa isto para decidir se o usuário
 * pode mexer em QUALQUER ação (nível de plano) ou apenas na dele (responsável da ação).
 * Devolve false para plano inexistente/de outra org.
 */
export async function userCanReachPlan(auth: AuthPayload, orgId: number, planId: number): Promise<boolean> {
  if (orgId !== auth.organizationId) return false;
  const [plan] = await db
    .select({
      sourceModule: actionPlansTable.sourceModule,
      responsibleUserId: actionPlansTable.responsibleUserId,
      effectivenessEvaluatorUserId: actionPlansTable.effectivenessEvaluatorUserId,
    })
    .from(actionPlansTable)
    .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)));
  if (!plan) return false;
  return hasPlanLevelAccess(auth, plan, planId);
}

/**
 * Guards every `/:planId` route. Without it the hub gate would be bypassable by
 * anyone in the org who guesses a plan id. A plan belongs to whoever holds the
 * hub module, holds the module that owns its origin, or is personally assigned
 * to it — o ponto focal, os co-responsáveis e o avaliador da eficácia alcançam os
 * próprios planos a partir de "Suas Pendências" sem nunca ter `actionPlans`.
 *
 * `allowActionAssignee` amplia o acesso a quem só executa uma AÇÃO do plano. Use
 * SOMENTE em rotas de LEITURA (GET do plano/ações/comentários/atividade): quem
 * recebe a ação em "Suas Pendências" precisa abrir a ficha. NUNCA nas rotas de
 * escrita do plano — senão o responsável de uma única ação poderia editar/excluir
 * o plano inteiro e as ações dos outros (escalada de privilégio). A escrita da
 * própria ação é liberada na rota PATCH da ação, com checagem de dono.
 *
 * Registered after `requireAuth`. Unknown ids and malformed params fall through
 * untouched so the routes keep answering 404/400 exactly as before.
 */
export function requirePlanAccess(options?: { allowActionAssignee?: boolean }) {
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
      (await hasPlanLevelAccess(req.auth!, plan, planId)) ||
      // Alcance ESTREITO (só leitura): abre a ficha para agir na sua parte, mesmo sem o
      // módulo. Cobre quem executa uma AÇÃO ou um PASSO do "Como" (fonte da verdade,
      // varre as ações direto), e quem está no espelho de co-responsáveis — inclusive
      // quem entrou pelo caminho manual legado, evitando que a pendência vire um beco.
      // NÃO é acesso de condução: editar/excluir o plano exige `hasPlanLevelAccess`.
      (options?.allowActionAssignee === true &&
        ((await isPlanActionAssignee(planId, userId)) ||
          (await isPlanTaskAssignee(planId, userId)) ||
          (await isPlanCoResponsible(planId, userId))));
    if (!allowed) { res.status(403).json({ error: "Sem acesso a este plano de ação" }); return; }

    next();
  };
}
