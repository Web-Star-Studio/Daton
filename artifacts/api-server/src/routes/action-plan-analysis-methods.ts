import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, actionPlanAnalysisMethodsTable } from "@workspace/db";
import {
  ListAnalysisMethodsParams,
  UpdateAnalysisMethodBody,
  UpdateAnalysisMethodParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { ensureAnalysisMethods } from "../services/action-plans/analysis-methods";

const router: IRouter = Router();

function serializeMethod(r: typeof actionPlanAnalysisMethodsTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    key: r.key,
    label: r.label,
    active: r.active,
    isDefault: r.isDefault,
    sortOrder: r.sortOrder,
  };
}

// Leitura liberada a qualquer usuário autenticado da org (o seletor de tratativa da
// ficha precisa dela); escrita restrita a admin — ligar/desligar tratativa é decisão
// do SGI, não do operador do dia a dia.

router.get(
  "/organizations/:orgId/action-plan-analysis-methods",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListAnalysisMethodsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    // Semeia preguiçosamente: uma org que ainda não passou pelo backfill (ou nasceu antes
    // desta feature) jamais pode ver o catálogo vazio.
    await ensureAnalysisMethods(params.data.orgId);

    // Devolve ativas E inativas: o front filtra ativas nos seletores, mas a ficha de um
    // plano que já usa uma tratativa desativada precisa continuar exibindo o rótulo dela.
    const rows = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(eq(actionPlanAnalysisMethodsTable.organizationId, params.data.orgId))
      .orderBy(asc(actionPlanAnalysisMethodsTable.sortOrder));

    res.json(rows.map(serializeMethod));
  },
);

router.patch(
  "/organizations/:orgId/action-plan-analysis-methods/:methodId",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = UpdateAnalysisMethodParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateAnalysisMethodBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [current] = await db
      .select()
      .from(actionPlanAnalysisMethodsTable)
      .where(and(
        eq(actionPlanAnalysisMethodsTable.id, params.data.methodId),
        eq(actionPlanAnalysisMethodsTable.organizationId, params.data.orgId),
      ));
    if (!current) { res.status(404).json({ error: "Tratativa não encontrada" }); return; }

    const update: Record<string, unknown> = {};

    if (body.data.label !== undefined) {
      const label = body.data.label.trim();
      if (!label) { res.status(400).json({ error: "Informe o rótulo da tratativa" }); return; }
      update.label = label;
    }
    if (body.data.isDefault !== undefined) update.isDefault = body.data.isDefault;
    if (body.data.sortOrder !== undefined) update.sortOrder = body.data.sortOrder;
    if (body.data.active !== undefined) {
      update.active = body.data.active;
      // Uma tratativa desativada não pode continuar sendo pré-marcada na criação do plano
      // — seria oferecer o que o catálogo diz que a empresa não usa.
      if (body.data.active === false) update.isDefault = false;
    }

    const [row] = await db
      .update(actionPlanAnalysisMethodsTable)
      .set(Object.keys(update).length > 0 ? update : { updatedAt: new Date() })
      .where(and(
        eq(actionPlanAnalysisMethodsTable.id, params.data.methodId),
        eq(actionPlanAnalysisMethodsTable.organizationId, params.data.orgId),
      ))
      .returning();

    res.json(serializeMethod(row));
  },
);

export default router;
