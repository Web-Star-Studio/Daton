import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  kpiObjectivesTable,
  swotFactorsTable,
  swotMethodologiesTable,
  swotMethodologyVersionsTable,
  swotObjectivesTable,
  unitsTable,
  usersTable,
  type SwotTolerances,
} from "@workspace/db";
import {
  CreateSwotFactorBody,
  CreateSwotFactorParams,
  CreateSwotObjectiveBody,
  CreateSwotObjectiveParams,
  DeleteSwotFactorParams,
  DeleteSwotObjectiveParams,
  GetSwotMethodologyParams,
  ListSwotFactorsParams,
  ListSwotObjectivesParams,
  UpdateSwotFactorBody,
  UpdateSwotFactorParams,
  UpdateSwotMethodologyBody,
  UpdateSwotMethodologyParams,
  UpdateSwotObjectiveBody,
  UpdateSwotObjectiveParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../../middlewares/auth";

/** Padrão FPLAN 001 (resultado ≥ 8 exige ação) quando a empresa ainda não configurou. */
const DEFAULT_SWOT_TOLERANCES: SwotTolerances = { weakness: 8, opportunity: 8, threat: 8 };

const router: IRouter = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

function serializeObjective(r: typeof swotObjectivesTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    code: r.code ?? null,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeFactor(r: typeof swotFactorsTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    unitId: r.unitId ?? null,
    description: r.description,
    type: r.type,
    environment: r.environment,
    perspective: r.perspective ?? null,
    performance: r.performance,
    relevance: r.relevance,
    objectiveSource: r.objectiveSource ?? null,
    objectiveSourceId: r.objectiveSourceId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Ensure a unit FK belongs to the org (prevents cross-tenant references). */
async function unitBelongsToOrg(unitId: number, orgId: number): Promise<boolean> {
  const [u] = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(and(eq(unitsTable.id, unitId), eq(unitsTable.organizationId, orgId)));
  return !!u;
}

/**
 * Valida o vínculo polimórfico de objetivo (fonte + id) contra a org.
 * Ambos nulos = sem objetivo. Fontes suportadas: "swot", "kpi".
 */
async function validateObjectiveRef(
  source: string | null | undefined,
  sourceId: number | null | undefined,
  orgId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const hasSource = source !== null && source !== undefined && source !== "";
  const hasId = sourceId !== null && sourceId !== undefined;
  if (!hasSource && !hasId) return { ok: true };
  if (!hasSource || !hasId) {
    return { ok: false, error: "objectiveSource e objectiveSourceId devem ser informados juntos" };
  }
  if (source === "swot") {
    const [o] = await db
      .select({ id: swotObjectivesTable.id })
      .from(swotObjectivesTable)
      .where(and(eq(swotObjectivesTable.id, sourceId!), eq(swotObjectivesTable.organizationId, orgId)));
    return o ? { ok: true } : { ok: false, error: "Objetivo SWOT não encontrado nesta organização" };
  }
  if (source === "kpi") {
    const [o] = await db
      .select({ id: kpiObjectivesTable.id })
      .from(kpiObjectivesTable)
      .where(and(eq(kpiObjectivesTable.id, sourceId!), eq(kpiObjectivesTable.organizationId, orgId)));
    return o ? { ok: true } : { ok: false, error: "Objetivo do KPI não encontrado nesta organização" };
  }
  return { ok: false, error: `Fonte de objetivo desconhecida: ${source}` };
}

// ─── Objectives ──────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/swot/objectives", requireAuth, async (req, res): Promise<void> => {
  const params = ListSwotObjectivesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const rows = await db.select().from(swotObjectivesTable)
    .where(eq(swotObjectivesTable.organizationId, params.data.orgId))
    .orderBy(swotObjectivesTable.code, swotObjectivesTable.name);

  res.json(rows.map(serializeObjective));
});

router.post("/organizations/:orgId/swot/objectives", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateSwotObjectiveParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateSwotObjectiveBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.insert(swotObjectivesTable).values({
    organizationId: params.data.orgId,
    code: body.data.code ?? null,
    name: body.data.name,
  }).returning();

  res.status(201).json(serializeObjective(row));
});

router.patch("/organizations/:orgId/swot/objectives/:objectiveId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateSwotObjectiveParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateSwotObjectiveBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (body.data.code !== undefined) updateData.code = body.data.code;
  if (body.data.name !== undefined) updateData.name = body.data.name;

  const [row] = await db.update(swotObjectivesTable)
    .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
    .where(and(eq(swotObjectivesTable.id, params.data.objectiveId), eq(swotObjectivesTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Objetivo não encontrado" }); return; }
  res.json(serializeObjective(row));
});

router.delete("/organizations/:orgId/swot/objectives/:objectiveId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteSwotObjectiveParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [row] = await db.delete(swotObjectivesTable)
    .where(and(eq(swotObjectivesTable.id, params.data.objectiveId), eq(swotObjectivesTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Objetivo não encontrado" }); return; }
  res.status(204).send();
});

// ─── Factors ───────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/swot/factors", requireAuth, async (req, res): Promise<void> => {
  const params = ListSwotFactorsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const rows = await db.select().from(swotFactorsTable)
    .where(eq(swotFactorsTable.organizationId, params.data.orgId))
    .orderBy(asc(swotFactorsTable.id));

  res.json(rows.map(serializeFactor));
});

router.post("/organizations/:orgId/swot/factors", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateSwotFactorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateSwotFactorBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  if (body.data.unitId !== null && body.data.unitId !== undefined) {
    if (!(await unitBelongsToOrg(body.data.unitId, params.data.orgId))) {
      res.status(400).json({ error: "unitId não corresponde a uma unidade desta organização" });
      return;
    }
  }
  {
    const chk = await validateObjectiveRef(body.data.objectiveSource, body.data.objectiveSourceId, params.data.orgId);
    if (!chk.ok) { res.status(400).json({ error: chk.error }); return; }
  }

  const [row] = await db.insert(swotFactorsTable).values({
    organizationId: params.data.orgId,
    unitId: body.data.unitId ?? null,
    description: body.data.description,
    type: body.data.type,
    environment: body.data.environment,
    perspective: body.data.perspective ?? null,
    performance: body.data.performance,
    relevance: body.data.relevance,
    // Normaliza: fonte vazia/ausente => sem objetivo (id também nulo).
    objectiveSource: body.data.objectiveSource || null,
    objectiveSourceId: body.data.objectiveSource ? (body.data.objectiveSourceId ?? null) : null,
  }).returning();

  res.status(201).json(serializeFactor(row));
});

router.patch("/organizations/:orgId/swot/factors/:factorId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateSwotFactorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateSwotFactorBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  if (body.data.unitId !== null && body.data.unitId !== undefined) {
    if (!(await unitBelongsToOrg(body.data.unitId, params.data.orgId))) {
      res.status(400).json({ error: "unitId não corresponde a uma unidade desta organização" });
      return;
    }
  }
  if (body.data.objectiveSource !== undefined || body.data.objectiveSourceId !== undefined) {
    const src = body.data.objectiveSource ?? null;
    const sid = body.data.objectiveSourceId ?? null;
    const chk = await validateObjectiveRef(src, sid, params.data.orgId);
    if (!chk.ok) { res.status(400).json({ error: chk.error }); return; }
  }

  const updateData: Record<string, unknown> = {};
  if (body.data.description !== undefined) updateData.description = body.data.description;
  if (body.data.type !== undefined) updateData.type = body.data.type;
  if (body.data.environment !== undefined) updateData.environment = body.data.environment;
  if (body.data.perspective !== undefined) updateData.perspective = body.data.perspective;
  if (body.data.performance !== undefined) updateData.performance = body.data.performance;
  if (body.data.relevance !== undefined) updateData.relevance = body.data.relevance;
  if (body.data.unitId !== undefined) updateData.unitId = body.data.unitId;
  if (body.data.objectiveSource !== undefined || body.data.objectiveSourceId !== undefined) {
    const src = body.data.objectiveSource || null;
    updateData.objectiveSource = src;
    updateData.objectiveSourceId = src ? (body.data.objectiveSourceId ?? null) : null;
  }

  const [row] = await db.update(swotFactorsTable)
    .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
    .where(and(eq(swotFactorsTable.id, params.data.factorId), eq(swotFactorsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Fator não encontrado" }); return; }
  res.json(serializeFactor(row));
});

router.delete("/organizations/:orgId/swot/factors/:factorId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteSwotFactorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [row] = await db.delete(swotFactorsTable)
    .where(and(eq(swotFactorsTable.id, params.data.factorId), eq(swotFactorsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Fator não encontrado" }); return; }
  res.status(204).send();
});

// ─── Methodology (limiares configuráveis, versionado/auditável) ───────────────

router.get("/organizations/:orgId/swot/methodology", requireAuth, async (req, res): Promise<void> => {
  const params = GetSwotMethodologyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [methodology] = await db.select().from(swotMethodologiesTable)
    .where(eq(swotMethodologiesTable.organizationId, params.data.orgId))
    .orderBy(desc(swotMethodologiesTable.id))
    .limit(1);

  // Nunca configurada: devolve os padrões (configured=false), sem persistir nada.
  if (!methodology) {
    res.json({
      organizationId: params.data.orgId,
      configured: false,
      tolerances: DEFAULT_SWOT_TOLERANCES,
      activeVersionNumber: null,
      updatedAt: null,
      versions: [],
    });
    return;
  }

  const versions = await db
    .select({
      id: swotMethodologyVersionsTable.id,
      versionNumber: swotMethodologyVersionsTable.versionNumber,
      tolerances: swotMethodologyVersionsTable.tolerances,
      notes: swotMethodologyVersionsTable.notes,
      createdById: swotMethodologyVersionsTable.createdById,
      createdByName: usersTable.name,
      createdAt: swotMethodologyVersionsTable.createdAt,
    })
    .from(swotMethodologyVersionsTable)
    .leftJoin(usersTable, eq(usersTable.id, swotMethodologyVersionsTable.createdById))
    .where(eq(swotMethodologyVersionsTable.methodologyId, methodology.id))
    .orderBy(desc(swotMethodologyVersionsTable.versionNumber));

  const active = versions.find((v) => v.id === methodology.activeVersionId) ?? versions[0] ?? null;

  res.json({
    organizationId: methodology.organizationId,
    configured: true,
    tolerances: active?.tolerances ?? DEFAULT_SWOT_TOLERANCES,
    activeVersionNumber: active?.versionNumber ?? null,
    updatedAt: methodology.updatedAt.toISOString(),
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      tolerances: v.tolerances,
      notes: v.notes ?? null,
      createdById: v.createdById,
      createdByName: v.createdByName ?? null,
      createdAt: v.createdAt.toISOString(),
    })),
  });
});

router.put("/organizations/:orgId/swot/methodology", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateSwotMethodologyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateSwotMethodologyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const tolerances: SwotTolerances = {
    weakness: body.data.weakness,
    opportunity: body.data.opportunity,
    threat: body.data.threat,
  };

  // Upsert da metodologia-pai (uma por org).
  let [methodology] = await db.select().from(swotMethodologiesTable)
    .where(eq(swotMethodologiesTable.organizationId, params.data.orgId))
    .orderBy(desc(swotMethodologiesTable.id))
    .limit(1);

  if (!methodology) {
    [methodology] = await db.insert(swotMethodologiesTable).values({
      organizationId: params.data.orgId,
      createdById: req.auth!.userId,
      updatedById: req.auth!.userId,
    }).returning();
  } else {
    await db.update(swotMethodologiesTable)
      .set({ updatedById: req.auth!.userId })
      .where(eq(swotMethodologiesTable.id, methodology.id));
  }

  const [aggregate] = await db
    .select({ versionNumber: sql<number>`coalesce(max(${swotMethodologyVersionsTable.versionNumber}), 0) + 1` })
    .from(swotMethodologyVersionsTable)
    .where(eq(swotMethodologyVersionsTable.methodologyId, methodology.id));

  const [version] = await db.insert(swotMethodologyVersionsTable).values({
    methodologyId: methodology.id,
    organizationId: params.data.orgId,
    versionNumber: Number(aggregate?.versionNumber ?? 1),
    tolerances: tolerances,
    notes: body.data.notes ?? null,
    createdById: req.auth!.userId,
  }).returning();

  await db.update(swotMethodologiesTable)
    .set({ activeVersionId: version.id, updatedById: req.auth!.userId })
    .where(eq(swotMethodologiesTable.id, methodology.id));

  res.status(201).json({ versionNumber: version.versionNumber, activeVersionId: version.id });
});

export default router;
