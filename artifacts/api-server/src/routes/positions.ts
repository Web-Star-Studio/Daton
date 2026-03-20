import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, positionsTable } from "@workspace/db";
import {
  CreatePositionBody,
  CreatePositionParams,
  DeletePositionParams,
  BulkDeletePositionsParams,
  BulkDeletePositionsBody,
  ImportPositionsBody,
  ImportPositionsParams,
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
    level: r.level,
    minSalary: r.minSalary,
    maxSalary: r.maxSalary,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function normalizeRequirements(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
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
    level: body.data.level,
    minSalary: body.data.minSalary,
    maxSalary: body.data.maxSalary,
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

router.post("/organizations/:orgId/positions/import", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = ImportPositionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = ImportPositionsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const conflictStrategy = body.data.conflictStrategy || "skip";

  const existingPositions = await db.select().from(positionsTable)
    .where(eq(positionsTable.organizationId, params.data.orgId));

  const existingMap = new Map<string, typeof existingPositions[0]>();
  for (const pos of existingPositions) {
    existingMap.set(pos.name.trim().toLowerCase(), pos);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: { index: number; title: string; error: string }[] = [];

  for (let i = 0; i < body.data.positions.length; i++) {
    const item = body.data.positions[i];
    try {
      const normalizedName = item.name.trim();
      const dupeKey = normalizedName.toLowerCase();
      const existing = existingMap.get(dupeKey);
      const normalizedReqs = normalizeRequirements(item.requirements);

      if (existing) {
        if (conflictStrategy === "update") {
          const updateData: Record<string, unknown> = {};
          if (item.description) updateData.description = item.description;
          if (item.education) updateData.education = item.education;
          if (item.experience) updateData.experience = item.experience;
          if (normalizedReqs) updateData.requirements = normalizedReqs;
          if (item.responsibilities) updateData.responsibilities = item.responsibilities;
          if (item.level) updateData.level = item.level;
          if (item.minSalary != null) updateData.minSalary = item.minSalary;
          if (item.maxSalary != null) updateData.maxSalary = item.maxSalary;

          if (Object.keys(updateData).length > 0) {
            await db.update(positionsTable)
              .set(updateData)
              .where(eq(positionsTable.id, existing.id));
          }
          updated++;
        } else {
          skipped++;
        }
      } else {
        await db.insert(positionsTable).values({
          organizationId: params.data.orgId,
          name: normalizedName,
          description: item.description,
          education: item.education,
          experience: item.experience,
          requirements: normalizedReqs,
          responsibilities: item.responsibilities,
          level: item.level,
          minSalary: item.minSalary,
          maxSalary: item.maxSalary,
        });
        created++;
        existingMap.set(dupeKey, {} as any);
      }
    } catch (err: any) {
      errors++;
      const msg = err?.message || String(err);
      errorDetails.push({ index: i, title: item.name || "(sem nome)", error: msg });
      console.error(`[import-positions] Row ${i} "${item.name}" failed:`, msg);
    }
  }

  res.status(201).json({
    created,
    updated,
    skipped,
    errors,
    total: body.data.positions.length,
    errorDetails,
  });
});

router.post("/organizations/:orgId/positions/bulk-delete", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = BulkDeletePositionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = BulkDeletePositionsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const deleted = await db.delete(positionsTable)
    .where(and(
      eq(positionsTable.organizationId, params.data.orgId),
      inArray(positionsTable.id, body.data.ids),
    ))
    .returning({ id: positionsTable.id });

  res.json({ deleted: deleted.length });
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
