import { Router, type IRouter } from "express";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { db, annualTrainingProgramTable } from "@workspace/db";
import {
  CreateAnnualProgramItemBody,
  CreateAnnualProgramItemParams,
  DeleteAnnualProgramItemParams,
  ListAnnualProgramParams,
  ListAnnualProgramQueryParams,
  UpdateAnnualProgramItemBody,
  UpdateAnnualProgramItemParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

function serialize(row: typeof annualTrainingProgramTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// GET list
router.get(
  "/organizations/:orgId/annual-program",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListAnnualProgramParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const query = ListAnnualProgramQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const conditions: SQL[] = [
      eq(annualTrainingProgramTable.organizationId, params.data.orgId),
    ];
    if (query.data.year)
      conditions.push(eq(annualTrainingProgramTable.year, query.data.year));
    if (query.data.unitId)
      conditions.push(eq(annualTrainingProgramTable.unitId, query.data.unitId));
    if (query.data.status)
      conditions.push(eq(annualTrainingProgramTable.status, query.data.status));

    const rows = await db
      .select()
      .from(annualTrainingProgramTable)
      .where(and(...conditions))
      .orderBy(
        asc(annualTrainingProgramTable.plannedMonth),
        asc(annualTrainingProgramTable.id),
      );
    res.json({ data: rows.map(serialize) });
  },
);

// POST create
router.post(
  "/organizations/:orgId/annual-program",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateAnnualProgramItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = CreateAnnualProgramItemBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [row] = await db
      .insert(annualTrainingProgramTable)
      .values({
        organizationId: params.data.orgId,
        year: body.data.year,
        catalogItemId: body.data.catalogItemId,
        unitId: body.data.unitId ?? null,
        plannedMonth: body.data.plannedMonth ?? null,
        modality: body.data.modality ?? null,
        plannedQuantity: body.data.plannedQuantity ?? null,
        responsible: body.data.responsible ?? null,
        status: body.data.status ?? "planejada",
        notes: body.data.notes ?? null,
      })
      .returning();
    res.status(201).json(serialize(row));
  },
);

// PATCH update
router.patch(
  "/organizations/:orgId/annual-program/:id",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateAnnualProgramItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = UpdateAnnualProgramItemBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const updates: Partial<typeof annualTrainingProgramTable.$inferInsert> = {};
    const b = body.data;
    if (b.year !== undefined) updates.year = b.year;
    if (b.catalogItemId !== undefined) updates.catalogItemId = b.catalogItemId;
    if (b.unitId !== undefined) updates.unitId = b.unitId;
    if (b.plannedMonth !== undefined) updates.plannedMonth = b.plannedMonth;
    if (b.modality !== undefined) updates.modality = b.modality;
    if (b.plannedQuantity !== undefined)
      updates.plannedQuantity = b.plannedQuantity;
    if (b.responsible !== undefined) updates.responsible = b.responsible;
    if (b.status !== undefined) updates.status = b.status;
    if (b.notes !== undefined) updates.notes = b.notes;
    if (b.classId !== undefined) updates.classId = b.classId;

    const [row] = await db
      .update(annualTrainingProgramTable)
      .set(updates)
      .where(
        and(
          eq(annualTrainingProgramTable.id, params.data.id),
          eq(annualTrainingProgramTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Item do programa não encontrado" });
      return;
    }
    res.json(serialize(row));
  },
);

// DELETE
router.delete(
  "/organizations/:orgId/annual-program/:id",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteAnnualProgramItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const [row] = await db
      .delete(annualTrainingProgramTable)
      .where(
        and(
          eq(annualTrainingProgramTable.id, params.data.id),
          eq(annualTrainingProgramTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Item do programa não encontrado" });
      return;
    }
    res.status(204).send();
  },
);

export default router;
