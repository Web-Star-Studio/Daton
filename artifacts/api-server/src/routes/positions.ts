import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, positionsTable } from "@workspace/db";
import {
  CreatePositionBody,
  CreatePositionParams,
  DeletePositionParams,
  ListPositionsParams,
  UpdatePositionBody,
  UpdatePositionParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

function serializePosition(r: typeof positionsTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    description: r.description,
    education: r.education,
    experience: r.experience,
    requirements: r.requirements,
    responsibilities: r.responsibilities,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/organizations/:orgId/positions", requireAuth, async (req, res): Promise<void> => {
  const params = ListPositionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const rows = await db.select().from(positionsTable)
    .where(eq(positionsTable.organizationId, params.data.orgId))
    .orderBy(positionsTable.name);

  res.json(rows.map((r) => serializePosition(r)));
});

router.post("/organizations/:orgId/positions", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreatePositionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreatePositionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.insert(positionsTable).values({
    organizationId: params.data.orgId,
    name: body.data.name,
    description: body.data.description,
    education: body.data.education,
    experience: body.data.experience,
    requirements: body.data.requirements,
    responsibilities: body.data.responsibilities,
  }).returning();

  res.status(201).json(serializePosition(row));
});

router.patch("/organizations/:orgId/positions/:posId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdatePositionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdatePositionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.update(positionsTable)
    .set(body.data)
    .where(and(eq(positionsTable.id, params.data.posId), eq(positionsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Cargo não encontrado" }); return; }

  res.json(serializePosition(row));
});

router.delete("/organizations/:orgId/positions/:posId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeletePositionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [row] = await db.delete(positionsTable)
    .where(and(eq(positionsTable.id, params.data.posId), eq(positionsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Cargo não encontrado" }); return; }
  res.status(204).send();
});

export default router;
