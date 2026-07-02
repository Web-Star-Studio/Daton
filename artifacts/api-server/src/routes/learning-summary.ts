import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { computeLearningSummary } from "../services/aprendizagem/learning-summary";

const router: IRouter = Router();

const ParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
});

const QuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  unitId: z.coerce.number().int().positive().optional(),
});

router.get(
  "/organizations/:orgId/learning/summary",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const query = QuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }

    const summary = await computeLearningSummary({
      orgId: params.data.orgId,
      year: query.data.year,
      unitId: query.data.unitId,
      database: db,
    });

    res.json(summary);
  },
);

export default router;
