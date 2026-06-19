import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, unitsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { aggregatePendencias } from "../services/pendencias/aggregate";

const router: IRouter = Router();

const querySchema = z.object({
  scope: z.enum(["mine", "unit", "org"]).default("mine"),
  unitId: z.coerce.number().int().positive().optional(),
  dueSoonDays: z.coerce.number().int().min(1).max(90).default(7),
});

router.get("/organizations/:orgId/pendencias", requireAuth, async (req, res): Promise<void> => {
  const orgId = Number(req.params.orgId);
  const { userId, organizationId, role } = req.auth!;
  if (orgId !== organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { scope, unitId, dueSoonDays } = parsed.data;

  const isAdmin = role === "org_admin" || role === "platform_admin";
  if (scope !== "mine" && !isAdmin) {
    res.status(403).json({ error: "Sem permissão para este escopo" });
    return;
  }
  if (scope === "unit" && !unitId) {
    res.status(400).json({ error: "unitId é obrigatório para scope=unit" });
    return;
  }

  // Resolve the responsible users for the requested scope.
  let responsibleUserIds: number[];
  if (scope === "mine") {
    responsibleUserIds = [userId];
  } else if (scope === "unit") {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.organizationId, orgId), eq(usersTable.unitId, unitId!)));
    responsibleUserIds = rows.map((r) => r.id);
  } else {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.organizationId, orgId));
    responsibleUserIds = rows.map((r) => r.id);
  }

  const now = new Date();
  const { items, counts, completedToday } = await aggregatePendencias({
    orgId,
    responsibleUserIds,
    now,
    dueSoonDays,
  });

  // Caller identity block for the panel header.
  const [me] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
      lastLoginAt: usersTable.lastLoginAt,
      unitId: usersTable.unitId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  let filial: { id: number; name: string } | null = null;
  if (me?.unitId) {
    const [unit] = await db
      .select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable)
      .where(eq(unitsTable.id, me.unitId));
    filial = unit ?? null;
  }

  res.json({
    user: {
      id: me?.id ?? userId,
      name: me?.name ?? "",
      role: me?.role ?? role,
      lastLoginAt: me?.lastLoginAt ? me.lastLoginAt.toISOString() : null,
      filial,
    },
    scope,
    counts,
    items,
    completedToday,
  });
});

export default router;
