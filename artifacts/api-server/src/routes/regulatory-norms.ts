import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, regulatoryNormsTable } from "@workspace/db";
import {
  CreateNormBody,
  CreateNormParams,
  ListNormsParams,
  UpdateNormBody,
  UpdateNormParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

function serializeNorm(r: typeof regulatoryNormsTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    label: r.label,
    active: r.active,
    sortOrder: r.sortOrder,
  };
}

// ─── Catálogo de normas (cross-module: leitura liberada a qualquer usuário   ─
// autenticado da org; escrita restrita a admins — normas afetam indicadores  ─
// KPI e obrigatoriedades de treinamento em todos os módulos).                ─

router.get("/organizations/:orgId/norms", requireAuth, async (req, res): Promise<void> => {
  const params = ListNormsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  // Devolve ativas e inativas: o front filtra ativas nos seletores, mas a aba
  // de gestão precisa enxergar (e poder reativar) as inativas.
  const rows = await db.select().from(regulatoryNormsTable)
    .where(eq(regulatoryNormsTable.organizationId, params.data.orgId))
    .orderBy(asc(regulatoryNormsTable.sortOrder), asc(regulatoryNormsTable.label));

  res.json(rows.map(serializeNorm));
});

router.post("/organizations/:orgId/norms", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = CreateNormParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateNormBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const label = body.data.label.trim();
  if (!label) { res.status(400).json({ error: "Informe o rótulo da norma" }); return; }

  const findByLabel = async () => {
    const [row] = await db.select().from(regulatoryNormsTable)
      .where(and(
        eq(regulatoryNormsTable.organizationId, params.data.orgId),
        sql`lower(${regulatoryNormsTable.label}) = lower(${label})`,
      ));
    return row;
  };

  // Idempotente por rótulo (case-insensitive): caminho rápido devolve a
  // existente sem inserir. Se ela estiver inativa, reativa em vez de deixar
  // o chamador preso — "recriar" uma norma removida deve simplesmente trazê-la
  // de volta ao catálogo.
  const existing = await findByLabel();
  if (existing) {
    if (!existing.active) {
      const [reactivated] = await db.update(regulatoryNormsTable)
        .set({ active: true })
        .where(eq(regulatoryNormsTable.id, existing.id))
        .returning();
      res.status(200).json(serializeNorm(reactivated));
      return;
    }
    res.status(200).json(serializeNorm(existing));
    return;
  }

  // Sob concorrência, duas requisições podem passar do SELECT acima; o índice
  // único funcional (org, lower(label)) garante que o ON CONFLICT não insira
  // a 2ª — devolvemos a que a requisição concorrente criou.
  const [inserted] = await db.insert(regulatoryNormsTable).values({
    organizationId: params.data.orgId,
    label,
  }).onConflictDoNothing().returning();
  if (inserted) { res.status(201).json(serializeNorm(inserted)); return; }

  const raced = await findByLabel();
  if (raced) {
    // Mesma regra do caminho `existing` acima: se a norma criada pela
    // requisição concorrente estiver inativa, reativa em vez de devolver
    // uma norma "recriada" que continua fora do catálogo ativo.
    if (!raced.active) {
      const [reactivated] = await db.update(regulatoryNormsTable)
        .set({ active: true })
        .where(eq(regulatoryNormsTable.id, raced.id))
        .returning();
      res.status(200).json(serializeNorm(reactivated));
      return;
    }
    res.status(200).json(serializeNorm(raced));
    return;
  }

  res.status(409).json({ error: "Não foi possível criar a norma" });
});

router.patch("/organizations/:orgId/norms/:normId", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = UpdateNormParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateNormBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [current] = await db.select().from(regulatoryNormsTable)
    .where(and(
      eq(regulatoryNormsTable.id, params.data.normId),
      eq(regulatoryNormsTable.organizationId, params.data.orgId),
    ));
  if (!current) { res.status(404).json({ error: "Norma não encontrada" }); return; }

  const updateData: Record<string, unknown> = {};

  if (body.data.label !== undefined) {
    const label = body.data.label.trim();
    if (!label) { res.status(400).json({ error: "Informe o rótulo da norma" }); return; }

    // Colisão com outra norma (case-insensitive) — exceto ela mesma.
    const [clash] = await db.select({ id: regulatoryNormsTable.id }).from(regulatoryNormsTable)
      .where(and(
        eq(regulatoryNormsTable.organizationId, params.data.orgId),
        sql`lower(${regulatoryNormsTable.label}) = lower(${label})`,
        sql`${regulatoryNormsTable.id} <> ${params.data.normId}`,
      ));
    if (clash) { res.status(409).json({ error: "Já existe uma norma com esse rótulo" }); return; }

    updateData.label = label;
  }
  if (body.data.active !== undefined) updateData.active = body.data.active;
  if (body.data.sortOrder !== undefined) updateData.sortOrder = body.data.sortOrder;

  try {
    const [row] = await db.update(regulatoryNormsTable)
      .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
      .where(and(
        eq(regulatoryNormsTable.id, params.data.normId),
        eq(regulatoryNormsTable.organizationId, params.data.orgId),
      ))
      .returning();

    res.json(serializeNorm(row));
  } catch (err: unknown) {
    // A checagem de colisão acima (SELECT) não é atômica com este UPDATE —
    // um rename concorrente para o mesmo rótulo pode passar pelo SELECT e só
    // colidir aqui, no índice único. Sem isto, seria um 500 não tratado.
    const code =
      (err as { cause?: { code?: string } } | undefined)?.cause?.code ??
      (err as { code?: string } | undefined)?.code;
    if (code === "23505") {
      res.status(409).json({ error: "Já existe uma norma com esse rótulo" });
      return;
    }
    throw err;
  }
});

export default router;
