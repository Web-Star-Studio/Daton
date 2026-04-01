import { Router, type IRouter } from "express";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import {
  db,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiObjectivesTable,
  kpiYearConfigsTable,
} from "@workspace/db";
import {
  CreateKpiIndicatorBody,
  CreateKpiIndicatorParams,
  CreateKpiObjectiveBody,
  CreateKpiObjectiveParams,
  DeleteKpiIndicatorParams,
  DeleteKpiObjectiveParams,
  ListKpiIndicatorsParams,
  ListKpiIndicatorsQueryParams,
  ListKpiObjectivesParams,
  ListKpiYearDataParams,
  ListKpiYearDataQueryParams,
  UpdateKpiIndicatorBody,
  UpdateKpiIndicatorParams,
  UpdateKpiObjectiveBody,
  UpdateKpiObjectiveParams,
  UpsertKpiValuesBody,
  UpsertKpiValuesParams,
  UpsertKpiYearConfigBody,
  UpsertKpiYearConfigParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../../middlewares/auth";

const router: IRouter = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

function serializeIndicator(r: typeof kpiIndicatorsTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    measurement: r.measurement,
    unit: r.unit ?? null,
    responsible: r.responsible ?? null,
    measureUnit: r.measureUnit ?? null,
    direction: r.direction,
    periodicity: r.periodicity,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeObjective(r: typeof kpiObjectivesTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    code: r.code ?? null,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeYearConfig(r: typeof kpiYearConfigsTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    indicatorId: r.indicatorId,
    objectiveId: r.objectiveId ?? null,
    year: r.year,
    seq: r.seq ?? null,
    goal: r.goal !== null && r.goal !== undefined ? parseFloat(r.goal) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function computeFeedStatus(
  monthValues: (number | null)[],
  periodicity: string,
): "fed" | "overdue" {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const monthsToCheck = currentMonth - 1; // months prior to current

  if (monthsToCheck <= 0) return "fed";

  // For non-monthly periodicities, we're lenient and only check if any data exists
  if (periodicity === "annual") return "fed";
  if (periodicity === "semiannual") {
    // expect at least the first semester data if past June
    if (currentMonth <= 6) return "fed";
    return monthValues[5] !== null ? "fed" : "overdue";
  }
  if (periodicity === "quarterly") {
    // expect data for every completed quarter
    const completedQuarters = Math.floor((currentMonth - 1) / 3);
    if (completedQuarters === 0) return "fed";
    const quarterMonths = [3, 6, 9, 12].slice(0, completedQuarters);
    return quarterMonths.every((m) => monthValues[m - 1] !== null) ? "fed" : "overdue";
  }

  // For monthly-based periodicities, check all months up to last month
  for (let m = 1; m <= monthsToCheck; m++) {
    if (monthValues[m - 1] === null) return "overdue";
  }
  return "fed";
}

// ─── Objectives ────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/kpi/objectives", requireAuth, async (req, res): Promise<void> => {
  const params = ListKpiObjectivesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const rows = await db.select().from(kpiObjectivesTable)
    .where(eq(kpiObjectivesTable.organizationId, params.data.orgId))
    .orderBy(kpiObjectivesTable.code, kpiObjectivesTable.name);

  res.json(rows.map(serializeObjective));
});

router.post("/organizations/:orgId/kpi/objectives", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateKpiObjectiveParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateKpiObjectiveBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.insert(kpiObjectivesTable).values({
    organizationId: params.data.orgId,
    code: body.data.code ?? null,
    name: body.data.name,
  }).returning();

  res.status(201).json(serializeObjective(row));
});

router.patch("/organizations/:orgId/kpi/objectives/:objectiveId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateKpiObjectiveParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateKpiObjectiveBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (body.data.code !== undefined) updateData.code = body.data.code;
  if (body.data.name !== undefined) updateData.name = body.data.name;

  const [row] = await db.update(kpiObjectivesTable)
    .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
    .where(and(eq(kpiObjectivesTable.id, params.data.objectiveId), eq(kpiObjectivesTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Objetivo não encontrado" }); return; }
  res.json(serializeObjective(row));
});

router.delete("/organizations/:orgId/kpi/objectives/:objectiveId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteKpiObjectiveParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [row] = await db.delete(kpiObjectivesTable)
    .where(and(eq(kpiObjectivesTable.id, params.data.objectiveId), eq(kpiObjectivesTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Objetivo não encontrado" }); return; }
  res.status(204).send();
});

// ─── Indicators ────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/kpi/indicators", requireAuth, async (req, res): Promise<void> => {
  const params = ListKpiIndicatorsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const query = ListKpiIndicatorsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const conditions = [eq(kpiIndicatorsTable.organizationId, params.data.orgId)];
  if (query.data.unit) {
    conditions.push(ilike(kpiIndicatorsTable.unit, `%${query.data.unit}%`));
  }

  const rows = await db.select().from(kpiIndicatorsTable)
    .where(and(...conditions))
    .orderBy(kpiIndicatorsTable.name);

  res.json(rows.map(serializeIndicator));
});

router.post("/organizations/:orgId/kpi/indicators", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateKpiIndicatorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateKpiIndicatorBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.insert(kpiIndicatorsTable).values({
    organizationId: params.data.orgId,
    name: body.data.name,
    measurement: body.data.measurement,
    unit: body.data.unit ?? null,
    responsible: body.data.responsible ?? null,
    measureUnit: body.data.measureUnit ?? null,
    direction: body.data.direction,
    periodicity: body.data.periodicity,
  }).returning();

  // Auto-create yearConfig for the current year so indicator appears in data entry
  const currentYear = new Date().getFullYear();
  const goalStr = body.data.goal !== null && body.data.goal !== undefined ? String(body.data.goal) : null;
  await db.insert(kpiYearConfigsTable).values({
    organizationId: params.data.orgId,
    indicatorId: row.id,
    objectiveId: body.data.objectiveId ?? null,
    year: currentYear,
    seq: body.data.seq ?? null,
    goal: goalStr,
  }).onConflictDoNothing();

  res.status(201).json(serializeIndicator(row));
});

router.patch("/organizations/:orgId/kpi/indicators/:indicatorId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateKpiIndicatorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateKpiIndicatorBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (body.data.name !== undefined) updateData.name = body.data.name;
  if (body.data.measurement !== undefined) updateData.measurement = body.data.measurement;
  if (body.data.unit !== undefined) updateData.unit = body.data.unit;
  if (body.data.responsible !== undefined) updateData.responsible = body.data.responsible;
  if (body.data.measureUnit !== undefined) updateData.measureUnit = body.data.measureUnit;
  if (body.data.direction !== undefined) updateData.direction = body.data.direction;
  if (body.data.periodicity !== undefined) updateData.periodicity = body.data.periodicity;

  const [row] = await db.update(kpiIndicatorsTable)
    .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
    .where(and(eq(kpiIndicatorsTable.id, params.data.indicatorId), eq(kpiIndicatorsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Indicador não encontrado" }); return; }
  res.json(serializeIndicator(row));
});

router.delete("/organizations/:orgId/kpi/indicators/:indicatorId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteKpiIndicatorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [row] = await db.delete(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, params.data.indicatorId), eq(kpiIndicatorsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Indicador não encontrado" }); return; }
  res.status(204).send();
});

// ─── Year Data ─────────────────────────────────────────────────────────────

router.get("/organizations/:orgId/kpi/years/:year", requireAuth, async (req, res): Promise<void> => {
  const params = ListKpiYearDataParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const query = ListKpiYearDataQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  // Fetch all indicators (optionally filtered by unit)
  const indicatorConditions = [eq(kpiIndicatorsTable.organizationId, params.data.orgId)];
  if (query.data.unit) {
    indicatorConditions.push(ilike(kpiIndicatorsTable.unit, `%${query.data.unit}%`));
  }

  const indicators = await db.select().from(kpiIndicatorsTable)
    .where(and(...indicatorConditions))
    .orderBy(kpiIndicatorsTable.name);

  if (indicators.length === 0) {
    res.json([]);
    return;
  }

  const indicatorIds = indicators.map((i) => i.id);

  // Fetch year configs for this year
  const yearConfigs = await db.select().from(kpiYearConfigsTable)
    .where(and(
      eq(kpiYearConfigsTable.organizationId, params.data.orgId),
      eq(kpiYearConfigsTable.year, params.data.year),
      inArray(kpiYearConfigsTable.indicatorId, indicatorIds),
    ));

  const yearConfigByIndicatorId = new Map(yearConfigs.map((yc) => [yc.indicatorId, yc]));
  const yearConfigIds = yearConfigs.map((yc) => yc.id);

  // Fetch monthly values
  const monthlyValues = yearConfigIds.length > 0
    ? await db.select().from(kpiMonthlyValuesTable)
        .where(inArray(kpiMonthlyValuesTable.yearConfigId, yearConfigIds))
    : [];

  const valuesByYearConfigId = new Map<number, Map<number, number | null>>();
  for (const mv of monthlyValues) {
    if (!valuesByYearConfigId.has(mv.yearConfigId)) {
      valuesByYearConfigId.set(mv.yearConfigId, new Map());
    }
    valuesByYearConfigId.get(mv.yearConfigId)!.set(
      mv.month,
      mv.value !== null && mv.value !== undefined ? parseFloat(mv.value) : null,
    );
  }

  // Fetch objectives for lookup
  const objectiveIds = [...new Set(yearConfigs.map((yc) => yc.objectiveId).filter(Boolean) as number[])];
  const objectives = objectiveIds.length > 0
    ? await db.select().from(kpiObjectivesTable).where(inArray(kpiObjectivesTable.id, objectiveIds))
    : [];
  const objectiveById = new Map(objectives.map((o) => [o.id, o]));

  // Build response — only include indicators that have a yearConfig
  const rows = indicators
    .filter((ind) => yearConfigByIndicatorId.has(ind.id))
    .map((ind) => {
      const yc = yearConfigByIndicatorId.get(ind.id)!;
      const monthMap = valuesByYearConfigId.get(yc.id) ?? new Map();
      const monthlyArr: (number | null)[] = Array.from({ length: 12 }, (_, i) => monthMap.get(i + 1) ?? null);

      const filledValues = monthlyArr.filter((v) => v !== null) as number[];
      const average = filledValues.length > 0 ? filledValues.reduce((a, b) => a + b, 0) / filledValues.length : null;
      const accumulated = filledValues.length > 0 ? filledValues.reduce((a, b) => a + b, 0) : null;
      const feedStatus = computeFeedStatus(monthlyArr, ind.periodicity);
      const objective = yc.objectiveId ? objectiveById.get(yc.objectiveId) ?? null : null;

      return {
        indicator: serializeIndicator(ind),
        yearConfig: serializeYearConfig(yc),
        objective: objective ? serializeObjective(objective) : null,
        monthlyValues: monthlyArr.map((v, i) => ({ month: i + 1, value: v })),
        average,
        accumulated,
        feedStatus,
      };
    });

  // Sort by seq if available, then by indicator name
  rows.sort((a, b) => {
    const seqA = a.yearConfig.seq ?? Infinity;
    const seqB = b.yearConfig.seq ?? Infinity;
    if (seqA !== seqB) return seqA - seqB;
    return a.indicator.name.localeCompare(b.indicator.name);
  });

  res.json(rows);
});

router.put("/organizations/:orgId/kpi/indicators/:indicatorId/years/:year", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpsertKpiYearConfigParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpsertKpiYearConfigBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Verify indicator belongs to org
  const [indicator] = await db.select({ id: kpiIndicatorsTable.id })
    .from(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, params.data.indicatorId), eq(kpiIndicatorsTable.organizationId, params.data.orgId)));

  if (!indicator) { res.status(404).json({ error: "Indicador não encontrado" }); return; }

  const goalStr = body.data.goal !== null && body.data.goal !== undefined ? String(body.data.goal) : null;

  const [row] = await db.insert(kpiYearConfigsTable).values({
    organizationId: params.data.orgId,
    indicatorId: params.data.indicatorId,
    objectiveId: body.data.objectiveId ?? null,
    year: params.data.year,
    seq: body.data.seq ?? null,
    goal: goalStr,
  }).onConflictDoUpdate({
    target: [kpiYearConfigsTable.organizationId, kpiYearConfigsTable.indicatorId, kpiYearConfigsTable.year],
    set: {
      objectiveId: body.data.objectiveId ?? null,
      seq: body.data.seq ?? null,
      goal: goalStr,
      updatedAt: new Date(),
    },
  }).returning();

  res.json(serializeYearConfig(row));
});

router.put("/organizations/:orgId/kpi/indicators/:indicatorId/years/:year/values", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpsertKpiValuesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpsertKpiValuesBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Verify year config exists and belongs to org
  const [yearConfig] = await db.select().from(kpiYearConfigsTable)
    .where(and(
      eq(kpiYearConfigsTable.indicatorId, params.data.indicatorId),
      eq(kpiYearConfigsTable.year, params.data.year),
      eq(kpiYearConfigsTable.organizationId, params.data.orgId),
    ));

  if (!yearConfig) { res.status(404).json({ error: "Configuração de ano não encontrada. Configure a meta antes de inserir valores." }); return; }

  if (body.data.values.length === 0) {
    const existing = await db.select().from(kpiMonthlyValuesTable)
      .where(eq(kpiMonthlyValuesTable.yearConfigId, yearConfig.id));
    res.json(existing.map((v) => ({ month: v.month, value: v.value !== null ? parseFloat(v.value) : null })));
    return;
  }

  const upsertValues = body.data.values.map((v) => ({
    organizationId: params.data.orgId,
    yearConfigId: yearConfig.id,
    month: v.month,
    value: v.value !== null && v.value !== undefined ? String(v.value) : null,
  }));

  await db.insert(kpiMonthlyValuesTable).values(upsertValues)
    .onConflictDoUpdate({
      target: [kpiMonthlyValuesTable.yearConfigId, kpiMonthlyValuesTable.month],
      set: {
        value: sql`excluded.value`,
        updatedAt: new Date(),
      },
    });

  const updated = await db.select().from(kpiMonthlyValuesTable)
    .where(eq(kpiMonthlyValuesTable.yearConfigId, yearConfig.id))
    .orderBy(kpiMonthlyValuesTable.month);

  res.json(updated.map((v) => ({ month: v.month, value: v.value !== null ? parseFloat(v.value) : null })));
});

export default router;
