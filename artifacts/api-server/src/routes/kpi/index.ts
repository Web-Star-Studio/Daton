import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import {
  actionPlansTable,
  db,
  kpiIndicatorsTable,
  kpiMonthlyValueJustificationsTable,
  kpiMonthlyValuesTable,
  kpiObjectivesTable,
  kpiYearConfigsTable,
  usersTable,
  type KpiMonthlyValueJustification as DbKpiMonthlyValueJustification,
} from "@workspace/db";
import {
  AddKpiMonthJustificationBody,
  AddKpiMonthJustificationParams,
  CreateKpiIndicatorBody,
  CreateKpiIndicatorParams,
  CreateKpiObjectiveBody,
  CreateKpiObjectiveParams,
  DeleteKpiIndicatorParams,
  DeleteKpiObjectiveParams,
  ListKpiIndicatorsParams,
  ListKpiIndicatorsQueryParams,
  ListKpiMonthJustificationsParams,
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
import { validateFormula } from "../../lib/formula-evaluator";

const router: IRouter = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

function serializeIndicator(
  r: typeof kpiIndicatorsTable.$inferSelect,
  responsibleUserName: string | null = null,
) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    measurement: r.measurement,
    formulaVariables: r.formulaVariables,
    formulaExpression: r.formulaExpression,
    unit: r.unit ?? null,
    responsible: r.responsible ?? null,
    responsibleUserId: r.responsibleUserId ?? null,
    responsibleUserName,
    measureUnit: r.measureUnit ?? null,
    direction: r.direction,
    periodicity: r.periodicity,
    referenceMonth: r.referenceMonth ?? null,
    category: r.category ?? null,
    norms: r.norms ?? [],
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
  referenceMonth: number | null,
): "fed" | "overdue" {
  const currentMonth = new Date().getMonth() + 1; // 1-indexed

  // Periodicidades mensais: vencido se algum mês ANTERIOR ao atual está vazio
  // (o mês corrente ainda está em curso).
  if (
    periodicity === "monthly" ||
    periodicity === "monthly_15d" ||
    periodicity === "monthly_45d"
  ) {
    for (let m = 1; m < currentMonth; m++) {
      if (monthValues[m - 1] === null) return "overdue";
    }
    return "fed";
  }

  // Não mensais: precisam do mês de referência. Vencido quando um mês
  // esperado que já chegou (mês ≤ atual) continua sem lançamento.
  if (!referenceMonth || referenceMonth < 1 || referenceMonth > 12) {
    return "fed"; // sem mês de referência — não há como cobrar
  }
  const at = (offset: number) => ((referenceMonth - 1 + offset) % 12) + 1;
  let expected: number[];
  if (periodicity === "annual") expected = [at(0)];
  else if (periodicity === "semiannual") expected = [at(0), at(6)];
  else if (periodicity === "quarterly") expected = [at(0), at(3), at(6), at(9)];
  else expected = [];
  for (const m of expected) {
    if (m <= currentMonth && monthValues[m - 1] === null) return "overdue";
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

  const rows = await db
    .select({
      indicator: kpiIndicatorsTable,
      responsibleUserName: usersTable.name,
    })
    .from(kpiIndicatorsTable)
    .leftJoin(usersTable, eq(usersTable.id, kpiIndicatorsTable.responsibleUserId))
    .where(and(...conditions))
    .orderBy(kpiIndicatorsTable.name);

  res.json(rows.map((r) => serializeIndicator(r.indicator, r.responsibleUserName ?? null)));
});

router.post("/organizations/:orgId/kpi/indicators", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateKpiIndicatorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateKpiIndicatorBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const formulaCheck = validateFormula(body.data.formulaExpression, body.data.formulaVariables);
  if (!formulaCheck.ok) { res.status(400).json({ error: `Fórmula inválida: ${formulaCheck.error}` }); return; }

  let responsibleUserId: number | null = body.data.responsibleUserId ?? null;
  let responsibleText: string | null = body.data.responsible ?? null;
  if (responsibleUserId !== null) {
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(eq(usersTable.id, responsibleUserId), eq(usersTable.organizationId, params.data.orgId)));
    if (!user) {
      res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" });
      return;
    }
    responsibleText = user.name;
  }

  const [row] = await db.insert(kpiIndicatorsTable).values({
    organizationId: params.data.orgId,
    name: body.data.name,
    measurement: body.data.measurement,
    formulaVariables: body.data.formulaVariables,
    formulaExpression: body.data.formulaExpression,
    unit: body.data.unit ?? null,
    responsible: responsibleText,
    responsibleUserId,
    measureUnit: body.data.measureUnit ?? null,
    direction: body.data.direction,
    periodicity: body.data.periodicity,
    // referenceMonth ainda fora do contrato gerado — lido do corpo direto.
    referenceMonth:
      typeof req.body?.referenceMonth === "number"
        ? req.body.referenceMonth
        : null,
    category: body.data.category ?? null,
    norms: body.data.norms ?? [],
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

  res.status(201).json(serializeIndicator(row, responsibleText));
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
  if (body.data.responsibleUserId !== undefined) {
    const newUserId = body.data.responsibleUserId;
    if (newUserId === null) {
      updateData.responsibleUserId = null;
      updateData.responsible = null;
    } else {
      const [user] = await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(and(eq(usersTable.id, newUserId), eq(usersTable.organizationId, params.data.orgId)));
      if (!user) {
        res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" });
        return;
      }
      updateData.responsibleUserId = user.id;
      updateData.responsible = user.name;
    }
  } else if (body.data.responsible !== undefined) {
    updateData.responsible = body.data.responsible;
  }
  if (body.data.measureUnit !== undefined) updateData.measureUnit = body.data.measureUnit;
  if (body.data.direction !== undefined) updateData.direction = body.data.direction;
  if (body.data.periodicity !== undefined) updateData.periodicity = body.data.periodicity;
  if (req.body && "referenceMonth" in req.body) {
    updateData.referenceMonth =
      typeof req.body.referenceMonth === "number"
        ? req.body.referenceMonth
        : null;
  }
  if (body.data.category !== undefined) updateData.category = body.data.category;
  if (body.data.norms !== undefined) updateData.norms = body.data.norms;

  if (body.data.formulaExpression !== undefined || body.data.formulaVariables !== undefined) {
    const expr = body.data.formulaExpression ?? "";
    const vars = body.data.formulaVariables ?? [];
    const formulaCheck = validateFormula(expr, vars);
    if (!formulaCheck.ok) { res.status(400).json({ error: `Fórmula inválida: ${formulaCheck.error}` }); return; }
    if (body.data.formulaExpression !== undefined) updateData.formulaExpression = body.data.formulaExpression;
    if (body.data.formulaVariables !== undefined) updateData.formulaVariables = body.data.formulaVariables;
  }

  const [row] = await db.update(kpiIndicatorsTable)
    .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
    .where(and(eq(kpiIndicatorsTable.id, params.data.indicatorId), eq(kpiIndicatorsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Indicador não encontrado" }); return; }

  let respUserName: string | null = null;
  if (row.responsibleUserId !== null) {
    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, row.responsibleUserId));
    respUserName = u?.name ?? null;
  }
  res.json(serializeIndicator(row, respUserName));
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

  // Batch-fetch responsible user names for indicators that have responsibleUserId
  const respUserIds = [...new Set(indicators.map((i) => i.responsibleUserId).filter((v): v is number => v !== null))];
  const respUsers = respUserIds.length > 0
    ? await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.id, respUserIds))
    : [];
  const respUserNameById = new Map(respUsers.map((u) => [u.id, u.name]));

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

  type JustificationSummary = {
    id: number;
    monthlyValueId: number;
    body: string;
    createdByUserId: number | null;
    createdByUserName: string | null;
    createdAt: string;
  };
  type MonthCell = {
    monthlyValueId: number;
    value: number | null;
    inputs: Record<string, number | null>;
    justification: JustificationSummary | null;
    justificationsCount: number;
  };
  const valuesByYearConfigId = new Map<number, Map<number, MonthCell>>();
  for (const mv of monthlyValues) {
    if (!valuesByYearConfigId.has(mv.yearConfigId)) {
      valuesByYearConfigId.set(mv.yearConfigId, new Map());
    }
    valuesByYearConfigId.get(mv.yearConfigId)!.set(mv.month, {
      monthlyValueId: mv.id,
      value: mv.value !== null && mv.value !== undefined ? parseFloat(mv.value) : null,
      inputs: mv.inputs ?? {},
      justification: null,
      justificationsCount: 0,
    });
  }

  // Batch-fetch the latest justification per cell + total counts
  const monthlyValueIdsForJust = monthlyValues.map((mv) => mv.id);
  if (monthlyValueIdsForJust.length > 0) {
    type JustRow = {
      id: number;
      monthly_value_id: number;
      body: string;
      created_by_user_id: number | null;
      created_at: Date;
      created_by_user_name: string | null;
    };
    const latestJusts = await db.execute<JustRow>(sql`
      SELECT DISTINCT ON (j.monthly_value_id)
        j.id, j.monthly_value_id, j.body, j.created_by_user_id, j.created_at, u.name AS created_by_user_name
      FROM ${kpiMonthlyValueJustificationsTable} j
      LEFT JOIN ${usersTable} u ON u.id = j.created_by_user_id
      WHERE j.monthly_value_id IN ${monthlyValueIdsForJust}
      ORDER BY j.monthly_value_id, j.created_at DESC
    `);
    const counts = await db
      .select({
        mvId: kpiMonthlyValueJustificationsTable.monthlyValueId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(kpiMonthlyValueJustificationsTable)
      .where(inArray(kpiMonthlyValueJustificationsTable.monthlyValueId, monthlyValueIdsForJust))
      .groupBy(kpiMonthlyValueJustificationsTable.monthlyValueId);
    const countByMvId = new Map(counts.map((c) => [c.mvId, Number(c.cnt)]));
    const latestByMvId = new Map<number, JustRow>(latestJusts.rows.map((r) => [Number(r.monthly_value_id), r]));

    // Attach to MonthCell entries
    for (const [, monthMap] of valuesByYearConfigId) {
      for (const cell of monthMap.values()) {
        const latest = latestByMvId.get(cell.monthlyValueId);
        if (latest) {
          cell.justification = {
            id: Number(latest.id),
            monthlyValueId: Number(latest.monthly_value_id),
            body: latest.body,
            createdByUserId: latest.created_by_user_id !== null ? Number(latest.created_by_user_id) : null,
            createdByUserName: latest.created_by_user_name ?? null,
            createdAt: new Date(latest.created_at).toISOString(),
          };
        }
        cell.justificationsCount = countByMvId.get(cell.monthlyValueId) ?? 0;
      }
    }
  }

  // Batch count action plans grouped by kpiMonthlyValueId
  const monthlyValueIds = monthlyValues.map((mv) => mv.id);
  const actionPlanCountsByMvId = new Map<number, number>();
  if (monthlyValueIds.length > 0) {
    const counts = await db.execute<{ mv_id: number; cnt: number }>(sql`
      SELECT (${actionPlansTable.sourceRef}->>'kpiMonthlyValueId')::int AS mv_id,
             COUNT(*)::int AS cnt
      FROM ${actionPlansTable}
      WHERE ${actionPlansTable.organizationId} = ${params.data.orgId}
        AND ${actionPlansTable.sourceModule} = 'kpi'
        AND (${actionPlansTable.sourceRef}->>'kpiMonthlyValueId') ~ '^[0-9]+$'
        AND (${actionPlansTable.sourceRef}->>'kpiMonthlyValueId')::int IN ${monthlyValueIds}
      GROUP BY mv_id
    `);
    for (const row of counts.rows) {
      if (row.mv_id !== null && row.mv_id !== undefined) {
        actionPlanCountsByMvId.set(Number(row.mv_id), Number(row.cnt));
      }
    }
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
      const monthMap = valuesByYearConfigId.get(yc.id) ?? new Map<number, MonthCell>();
      const monthlyCells: MonthCell[] = Array.from({ length: 12 }, (_, i) =>
        monthMap.get(i + 1) ?? { monthlyValueId: 0, value: null, inputs: {}, justification: null, justificationsCount: 0 },
      );
      const monthlyValuesOnly = monthlyCells.map((c) => c.value);

      const filledValues = monthlyValuesOnly.filter((v) => v !== null) as number[];
      const average = filledValues.length > 0 ? filledValues.reduce((a, b) => a + b, 0) / filledValues.length : null;
      const accumulated = filledValues.length > 0 ? filledValues.reduce((a, b) => a + b, 0) : null;
      const feedStatus = computeFeedStatus(
        monthlyValuesOnly,
        ind.periodicity,
        ind.referenceMonth ?? null,
      );
      const objective = yc.objectiveId ? objectiveById.get(yc.objectiveId) ?? null : null;

      const responsibleUserName = ind.responsibleUserId !== null
        ? respUserNameById.get(ind.responsibleUserId) ?? null
        : null;
      return {
        indicator: serializeIndicator(ind, responsibleUserName),
        yearConfig: serializeYearConfig(yc),
        objective: objective ? serializeObjective(objective) : null,
        monthlyValues: monthlyCells.map((c, i) => ({
          month: i + 1,
          value: c.value,
          inputs: c.inputs,
          monthlyValueId: c.monthlyValueId > 0 ? c.monthlyValueId : null,
          justification: c.justification,
          justificationsCount: c.justificationsCount,
          actionPlansCount: c.monthlyValueId > 0 ? (actionPlanCountsByMvId.get(c.monthlyValueId) ?? 0) : 0,
        })),
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
    res.json(existing.map((v) => ({
      month: v.month,
      value: v.value !== null ? parseFloat(v.value) : null,
      inputs: v.inputs ?? {},
      monthlyValueId: v.id,
      justification: null,
      justificationsCount: 0,
      actionPlansCount: 0,
    })));
    return;
  }

  const upsertValues = body.data.values.map((v) => ({
    organizationId: params.data.orgId,
    yearConfigId: yearConfig.id,
    month: v.month,
    value: v.value !== null && v.value !== undefined ? String(v.value) : null,
    inputs: v.inputs ?? {},
  }));

  await db.insert(kpiMonthlyValuesTable).values(upsertValues)
    .onConflictDoUpdate({
      target: [kpiMonthlyValuesTable.yearConfigId, kpiMonthlyValuesTable.month],
      set: {
        value: sql`excluded.value`,
        inputs: sql`excluded.inputs`,
        updatedAt: new Date(),
      },
    });

  const updated = await db.select().from(kpiMonthlyValuesTable)
    .where(eq(kpiMonthlyValuesTable.yearConfigId, yearConfig.id))
    .orderBy(kpiMonthlyValuesTable.month);

  res.json(updated.map((v) => ({
    month: v.month,
    value: v.value !== null ? parseFloat(v.value) : null,
    inputs: v.inputs ?? {},
    monthlyValueId: v.id,
    justification: null,
    justificationsCount: 0,
    actionPlansCount: 0,
  })));
});

// ─── Monthly Justifications (append-only history) ──────────────────────────

function serializeJustification(
  j: DbKpiMonthlyValueJustification,
  createdByUserName: string | null,
) {
  return {
    id: j.id,
    monthlyValueId: j.monthlyValueId,
    body: j.body,
    createdByUserId: j.createdByUserId ?? null,
    createdByUserName,
    createdAt: j.createdAt.toISOString(),
  };
}

async function ensureMonthlyValueRow(
  orgId: number,
  indicatorId: number,
  year: number,
  month: number,
): Promise<{ id: number } | { error: string; status: number }> {
  const [yearConfig] = await db.select().from(kpiYearConfigsTable)
    .where(and(
      eq(kpiYearConfigsTable.indicatorId, indicatorId),
      eq(kpiYearConfigsTable.year, year),
      eq(kpiYearConfigsTable.organizationId, orgId),
    ));
  if (!yearConfig) {
    return { error: "Configuração de ano não encontrada. Configure a meta antes de adicionar justificativa.", status: 404 };
  }
  // Insert (or no-op via onConflictDoUpdate that touches only updatedAt) to guarantee row exists.
  const [row] = await db.insert(kpiMonthlyValuesTable).values({
    organizationId: orgId,
    yearConfigId: yearConfig.id,
    month,
    value: null,
    inputs: {},
  }).onConflictDoUpdate({
    target: [kpiMonthlyValuesTable.yearConfigId, kpiMonthlyValuesTable.month],
    set: { updatedAt: new Date() },
  }).returning({ id: kpiMonthlyValuesTable.id });
  return { id: row.id };
}

router.get(
  "/organizations/:orgId/kpi/indicators/:indicatorId/years/:year/months/:month/justifications",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListKpiMonthJustificationsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    // Find the kpi_monthly_values.id for this (indicator, year, month) inside the org
    const [mv] = await db
      .select({ id: kpiMonthlyValuesTable.id })
      .from(kpiMonthlyValuesTable)
      .innerJoin(kpiYearConfigsTable, eq(kpiYearConfigsTable.id, kpiMonthlyValuesTable.yearConfigId))
      .where(and(
        eq(kpiMonthlyValuesTable.organizationId, params.data.orgId),
        eq(kpiYearConfigsTable.indicatorId, params.data.indicatorId),
        eq(kpiYearConfigsTable.year, params.data.year),
        eq(kpiMonthlyValuesTable.month, params.data.month),
      ));

    if (!mv) {
      res.json([]);
      return;
    }

    const rows = await db
      .select({
        j: kpiMonthlyValueJustificationsTable,
        userName: usersTable.name,
      })
      .from(kpiMonthlyValueJustificationsTable)
      .leftJoin(usersTable, eq(usersTable.id, kpiMonthlyValueJustificationsTable.createdByUserId))
      .where(eq(kpiMonthlyValueJustificationsTable.monthlyValueId, mv.id))
      .orderBy(desc(kpiMonthlyValueJustificationsTable.createdAt));

    res.json(rows.map((r) => serializeJustification(r.j, r.userName ?? null)));
  },
);

router.post(
  "/organizations/:orgId/kpi/indicators/:indicatorId/years/:year/months/:month/justifications",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = AddKpiMonthJustificationParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = AddKpiMonthJustificationBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const mv = await ensureMonthlyValueRow(
      params.data.orgId,
      params.data.indicatorId,
      params.data.year,
      params.data.month,
    );
    if ("error" in mv) { res.status(mv.status).json({ error: mv.error }); return; }

    const [row] = await db.insert(kpiMonthlyValueJustificationsTable).values({
      organizationId: params.data.orgId,
      monthlyValueId: mv.id,
      body: body.data.body,
      createdByUserId: req.auth!.userId,
    }).returning();

    let createdByUserName: string | null = null;
    if (row.createdByUserId !== null) {
      const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.createdByUserId));
      createdByUserName = u?.name ?? null;
    }

    res.status(201).json(serializeJustification(row, createdByUserName));
  },
);

export default router;
