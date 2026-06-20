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

  // Caller identity (incl. their own filial). Needed BEFORE scope resolution
  // because a manager's scope=unit is locked to their own unitId; also feeds
  // the panel header block.
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

  const isAdmin = role === "org_admin" || role === "platform_admin";
  const isManager = role === "manager";

  // scope=org is admin-only.
  if (scope === "org" && !isAdmin) {
    res.status(403).json({ error: "Sem permissão para este escopo" });
    return;
  }

  // Resolve the effective filial for scope=unit: admins pick any filial,
  // managers are locked to their own, everyone else is forbidden.
  let effectiveUnitId: number | undefined;
  if (scope === "unit") {
    if (isAdmin) {
      if (!unitId) {
        res.status(400).json({ error: "unitId é obrigatório para scope=unit" });
        return;
      }
      effectiveUnitId = unitId;
    } else if (isManager) {
      if (!me?.unitId) {
        res.status(403).json({ error: "Gerente sem filial vinculada" });
        return;
      }
      effectiveUnitId = me.unitId; // locked to the manager's own filial; param ignored
    } else {
      res.status(403).json({ error: "Sem permissão para este escopo" });
      return;
    }
  }

  // Resolve the responsible users for the requested scope.
  let responsibleUserIds: number[];
  if (scope === "mine") {
    responsibleUserIds = [userId];
  } else if (scope === "unit") {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.organizationId, orgId), eq(usersTable.unitId, effectiveUnitId!)));
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
