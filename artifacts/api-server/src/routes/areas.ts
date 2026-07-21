import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, areasTable } from "@workspace/db";
import {
  CreateAreaBody,
  CreateAreaParams,
  ListAreasParams,
  UpdateAreaBody,
  UpdateAreaParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

function serializeArea(r: typeof areasTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    label: r.label,
    active: r.active,
    sortOrder: r.sortOrder,
  };
}

// ─── Catálogo de áreas (setores) de cargo ───────────────────────────────────
// Leitura liberada a qualquer usuário autenticado da org (o formulário de cargo
// precisa resolver o rótulo da área); escrita restrita a admins.

router.get("/organizations/:orgId/areas", requireAuth, async (req, res): Promise<void> => {
  const params = ListAreasParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  // Devolve ativos e inativos: o seletor filtra os ativos, mas a aba de gestão
  // precisa enxergar (e poder reativar) os inativos.
  const rows = await db.select().from(areasTable)
    .where(eq(areasTable.organizationId, params.data.orgId))
    .orderBy(asc(areasTable.sortOrder), asc(areasTable.label));

  res.json(rows.map(serializeArea));
});

router.post("/organizations/:orgId/areas", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = CreateAreaParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateAreaBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const label = body.data.label.trim();
  if (!label) { res.status(400).json({ error: "Informe o nome da área" }); return; }

  const findByLabel = async () => {
    const [row] = await db.select().from(areasTable)
      .where(and(
        eq(areasTable.organizationId, params.data.orgId),
        sql`lower(${areasTable.label}) = lower(${label})`,
      ));
    return row;
  };

  // Idempotente por rótulo (case-insensitive): caminho rápido devolve o
  // existente sem inserir. Se estiver inativo, reativa em vez de deixar o
  // chamador preso — "recriar" uma área removida deve trazê-la de volta.
  const existing = await findByLabel();
  if (existing) {
    if (!existing.active) {
      const [reactivated] = await db.update(areasTable)
        .set({ active: true })
        .where(eq(areasTable.id, existing.id))
        .returning();
      res.status(200).json(serializeArea(reactivated));
      return;
    }
    res.status(200).json(serializeArea(existing));
    return;
  }

  // Sob concorrência, duas requisições podem passar do SELECT acima; o índice
  // único funcional (org, lower(label)) garante que o ON CONFLICT não insira
  // o 2º — devolvemos o que a requisição concorrente criou.
  const [inserted] = await db.insert(areasTable).values({
    organizationId: params.data.orgId,
    label,
  }).onConflictDoNothing().returning();
  if (inserted) { res.status(201).json(serializeArea(inserted)); return; }

  const raced = await findByLabel();
  if (raced) {
    if (!raced.active) {
      const [reactivated] = await db.update(areasTable)
        .set({ active: true })
        .where(eq(areasTable.id, raced.id))
        .returning();
      res.status(200).json(serializeArea(reactivated));
      return;
    }
    res.status(200).json(serializeArea(raced));
    return;
  }

  res.status(409).json({ error: "Não foi possível criar a área" });
});

router.patch("/organizations/:orgId/areas/:areaId", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = UpdateAreaParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateAreaBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [current] = await db.select().from(areasTable)
    .where(and(
      eq(areasTable.id, params.data.areaId),
      eq(areasTable.organizationId, params.data.orgId),
    ));
  if (!current) { res.status(404).json({ error: "Área não encontrada" }); return; }

  const updateData: Record<string, unknown> = {};

  if (body.data.label !== undefined) {
    const label = body.data.label.trim();
    if (!label) { res.status(400).json({ error: "Informe o nome da área" }); return; }

    // Colisão com outra área (case-insensitive) — exceto ela mesma.
    const [clash] = await db.select({ id: areasTable.id }).from(areasTable)
      .where(and(
        eq(areasTable.organizationId, params.data.orgId),
        sql`lower(${areasTable.label}) = lower(${label})`,
        sql`${areasTable.id} <> ${params.data.areaId}`,
      ));
    if (clash) { res.status(409).json({ error: "Já existe uma área com esse nome" }); return; }

    updateData.label = label;
  }
  if (body.data.active !== undefined) updateData.active = body.data.active;
  if (body.data.sortOrder !== undefined) updateData.sortOrder = body.data.sortOrder;

  try {
    const [row] = await db.update(areasTable)
      .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
      .where(and(
        eq(areasTable.id, params.data.areaId),
        eq(areasTable.organizationId, params.data.orgId),
      ))
      .returning();

    res.json(serializeArea(row));
  } catch (err: unknown) {
    // A checagem de colisão acima (SELECT) não é atômica com este UPDATE — um
    // rename concorrente para o mesmo rótulo pode passar pelo SELECT e só
    // colidir aqui, no índice único. Sem isto, seria um 500 não tratado.
    const code =
      (err as { cause?: { code?: string } } | undefined)?.cause?.code ??
      (err as { code?: string } | undefined)?.code;
    if (code === "23505") {
      res.status(409).json({ error: "Já existe uma área com esse nome" });
      return;
    }
    throw err;
  }
});

export default router;
