import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { criticalReviewsTable, db, usersTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Validation ──────────────────────────────────────────────────────────────

const periodKindSchema = z.enum(["quarterly", "semiannual", "annual"]);
const statusSchema = z.enum(["draft", "completed"]);

const orgParam = z.object({ orgId: z.coerce.number().int() });
const itemParam = z.object({
  orgId: z.coerce.number().int(),
  id: z.coerce.number().int(),
});

const createBody = z.object({
  periodKind: periodKindSchema,
  year: z.number().int().min(2000).max(2100),
  periodNumber: z.number().int().min(1).max(4).default(1),
  reviewDate: z.string().nullable().optional(),
  status: statusSchema.optional(),
  participants: z.string().nullable().optional(),
  inputs: z.record(z.string(), z.string()).optional(),
  outputs: z.record(z.string(), z.string()).optional(),
});
const updateBody = createBody.partial();

// ─── Serialization ───────────────────────────────────────────────────────────

type Row = typeof criticalReviewsTable.$inferSelect;

function serialize(r: Row, createdByUserName: string | null) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    periodKind: r.periodKind,
    year: r.year,
    periodNumber: r.periodNumber,
    reviewDate: r.reviewDate ?? null,
    status: r.status,
    participants: r.participants ?? null,
    inputs: r.inputs ?? {},
    outputs: r.outputs ?? {},
    createdByUserId: r.createdByUserId ?? null,
    createdByUserName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get(
  "/organizations/:orgId/kpi/critical-reviews",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = orgParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select({ review: criticalReviewsTable, createdByUserName: usersTable.name })
      .from(criticalReviewsTable)
      .leftJoin(usersTable, eq(usersTable.id, criticalReviewsTable.createdByUserId))
      .where(eq(criticalReviewsTable.organizationId, params.data.orgId))
      .orderBy(
        desc(criticalReviewsTable.year),
        desc(criticalReviewsTable.periodNumber),
      );

    res.json(rows.map((r) => serialize(r.review, r.createdByUserName ?? null)));
  },
);

router.post(
  "/organizations/:orgId/kpi/critical-reviews",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = orgParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = createBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [row] = await db
      .insert(criticalReviewsTable)
      .values({
        organizationId: params.data.orgId,
        periodKind: body.data.periodKind,
        year: body.data.year,
        periodNumber: body.data.periodNumber,
        reviewDate: body.data.reviewDate ?? null,
        status: body.data.status ?? "draft",
        participants: body.data.participants ?? null,
        inputs: body.data.inputs ?? {},
        outputs: body.data.outputs ?? {},
        createdByUserId: req.auth!.userId,
      })
      .returning();

    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.userId));

    res.status(201).json(serialize(row, u?.name ?? null));
  },
);

router.patch(
  "/organizations/:orgId/kpi/critical-reviews/:id",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = itemParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = updateBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const d = body.data;
    const updateData: Record<string, unknown> = {};
    if (d.periodKind !== undefined) updateData.periodKind = d.periodKind;
    if (d.year !== undefined) updateData.year = d.year;
    if (d.periodNumber !== undefined) updateData.periodNumber = d.periodNumber;
    if (d.reviewDate !== undefined) updateData.reviewDate = d.reviewDate;
    if (d.status !== undefined) updateData.status = d.status;
    if (d.participants !== undefined) updateData.participants = d.participants;
    if (d.inputs !== undefined) updateData.inputs = d.inputs;
    if (d.outputs !== undefined) updateData.outputs = d.outputs;

    const [row] = await db
      .update(criticalReviewsTable)
      .set(
        Object.keys(updateData).length > 0
          ? updateData
          : { updatedAt: new Date() },
      )
      .where(
        and(
          eq(criticalReviewsTable.id, params.data.id),
          eq(criticalReviewsTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) { res.status(404).json({ error: "Análise crítica não encontrada" }); return; }

    let createdByUserName: string | null = null;
    if (row.createdByUserId !== null) {
      const [u] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, row.createdByUserId));
      createdByUserName = u?.name ?? null;
    }

    res.json(serialize(row, createdByUserName));
  },
);

router.delete(
  "/organizations/:orgId/kpi/critical-reviews/:id",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = itemParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [row] = await db
      .delete(criticalReviewsTable)
      .where(
        and(
          eq(criticalReviewsTable.id, params.data.id),
          eq(criticalReviewsTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) { res.status(404).json({ error: "Análise crítica não encontrada" }); return; }
    res.status(204).send();
  },
);

export default router;
