import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, effectivenessMethodsTable } from "@workspace/db";
import {
  CreateEffectivenessMethodBody,
  CreateEffectivenessMethodParams,
  ListEffectivenessMethodsParams,
  UpdateEffectivenessMethodBody,
  UpdateEffectivenessMethodParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

function serializeMethod(r: typeof effectivenessMethodsTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    label: r.label,
    active: r.active,
    sortOrder: r.sortOrder,
  };
}

// ─── Catálogo de métodos de verificação de eficácia ─────────────────────────
// Leitura liberada a qualquer usuário autenticado da org (a ficha do plano de
// ação precisa resolver o rótulo do método); escrita restrita a admins.

router.get("/organizations/:orgId/effectiveness-methods", requireAuth, async (req, res): Promise<void> => {
  const params = ListEffectivenessMethodsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  // Devolve ativos e inativos: o seletor filtra os ativos, mas a aba de gestão
  // precisa enxergar (e poder reativar) os inativos.
  const rows = await db.select().from(effectivenessMethodsTable)
    .where(eq(effectivenessMethodsTable.organizationId, params.data.orgId))
    .orderBy(asc(effectivenessMethodsTable.sortOrder), asc(effectivenessMethodsTable.label));

  res.json(rows.map(serializeMethod));
});

router.post("/organizations/:orgId/effectiveness-methods", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = CreateEffectivenessMethodParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateEffectivenessMethodBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const label = body.data.label.trim();
  if (!label) { res.status(400).json({ error: "Informe o nome do método" }); return; }

  const findByLabel = async () => {
    const [row] = await db.select().from(effectivenessMethodsTable)
      .where(and(
        eq(effectivenessMethodsTable.organizationId, params.data.orgId),
        sql`lower(${effectivenessMethodsTable.label}) = lower(${label})`,
      ));
    return row;
  };

  // Idempotente por rótulo (case-insensitive): caminho rápido devolve o
  // existente sem inserir. Se estiver inativo, reativa em vez de deixar o
  // chamador preso — "recriar" um método removido deve trazê-lo de volta.
  const existing = await findByLabel();
  if (existing) {
    if (!existing.active) {
      const [reactivated] = await db.update(effectivenessMethodsTable)
        .set({ active: true })
        .where(eq(effectivenessMethodsTable.id, existing.id))
        .returning();
      res.status(200).json(serializeMethod(reactivated));
      return;
    }
    res.status(200).json(serializeMethod(existing));
    return;
  }

  // Sob concorrência, duas requisições podem passar do SELECT acima; o índice
  // único funcional (org, lower(label)) garante que o ON CONFLICT não insira
  // o 2º — devolvemos o que a requisição concorrente criou.
  const [inserted] = await db.insert(effectivenessMethodsTable).values({
    organizationId: params.data.orgId,
    label,
  }).onConflictDoNothing().returning();
  if (inserted) { res.status(201).json(serializeMethod(inserted)); return; }

  const raced = await findByLabel();
  if (raced) {
    if (!raced.active) {
      const [reactivated] = await db.update(effectivenessMethodsTable)
        .set({ active: true })
        .where(eq(effectivenessMethodsTable.id, raced.id))
        .returning();
      res.status(200).json(serializeMethod(reactivated));
      return;
    }
    res.status(200).json(serializeMethod(raced));
    return;
  }

  res.status(409).json({ error: "Não foi possível criar o método" });
});

router.patch("/organizations/:orgId/effectiveness-methods/:methodId", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = UpdateEffectivenessMethodParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateEffectivenessMethodBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [current] = await db.select().from(effectivenessMethodsTable)
    .where(and(
      eq(effectivenessMethodsTable.id, params.data.methodId),
      eq(effectivenessMethodsTable.organizationId, params.data.orgId),
    ));
  if (!current) { res.status(404).json({ error: "Método não encontrado" }); return; }

  const updateData: Record<string, unknown> = {};

  if (body.data.label !== undefined) {
    const label = body.data.label.trim();
    if (!label) { res.status(400).json({ error: "Informe o nome do método" }); return; }

    // Colisão com outro método (case-insensitive) — exceto ele mesmo.
    const [clash] = await db.select({ id: effectivenessMethodsTable.id }).from(effectivenessMethodsTable)
      .where(and(
        eq(effectivenessMethodsTable.organizationId, params.data.orgId),
        sql`lower(${effectivenessMethodsTable.label}) = lower(${label})`,
        sql`${effectivenessMethodsTable.id} <> ${params.data.methodId}`,
      ));
    if (clash) { res.status(409).json({ error: "Já existe um método com esse nome" }); return; }

    updateData.label = label;
  }
  if (body.data.active !== undefined) updateData.active = body.data.active;
  if (body.data.sortOrder !== undefined) updateData.sortOrder = body.data.sortOrder;

  try {
    const [row] = await db.update(effectivenessMethodsTable)
      .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
      .where(and(
        eq(effectivenessMethodsTable.id, params.data.methodId),
        eq(effectivenessMethodsTable.organizationId, params.data.orgId),
      ))
      .returning();

    res.json(serializeMethod(row));
  } catch (err: unknown) {
    // A checagem de colisão acima (SELECT) não é atômica com este UPDATE — um
    // rename concorrente para o mesmo rótulo pode passar pelo SELECT e só
    // colidir aqui, no índice único. Sem isto, seria um 500 não tratado.
    const code =
      (err as { cause?: { code?: string } } | undefined)?.cause?.code ??
      (err as { code?: string } | undefined)?.code;
    if (code === "23505") {
      res.status(409).json({ error: "Já existe um método com esse nome" });
      return;
    }
    throw err;
  }
});

export default router;
