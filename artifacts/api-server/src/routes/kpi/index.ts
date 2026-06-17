import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import {
  actionPlansTable,
  db,
  kpiIndicatorRollupsTable,
  kpiIndicatorsTable,
  kpiMonthlyValueJustificationsTable,
  kpiMonthlyValuesTable,
  kpiObjectivesTable,
  kpiYearConfigsTable,
  unitsTable,
  usersTable,
  type KpiMonthlyValueJustification as DbKpiMonthlyValueJustification,
  type KpiRollupStrategy,
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
import {
  canActOnKpiIndicator,
  type KpiAction,
  type KpiIndicatorAccessFields,
  type KpiRequesterScope,
} from "../../services/kpi/access";
import { evaluateFormula, validateFormula } from "../../lib/formula-evaluator";
import {
  detectVariableRenames,
  migrateInputsForRename,
  type FormulaVar,
} from "../../services/kpi/formula-rename";
import { normalizeKpiUnit, CORPORATE_UNIT_LABEL } from "../../services/kpi/units";
import { computeRollupValue } from "../../services/kpi/rollup";

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
    unitId: r.unitId ?? null,
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

/**
 * Resolve o escopo do solicitante para o módulo KPI. Faz lookup do unitId só
 * quando role=manager (fonte sempre fresca, sem depender do token).
 */
async function getRequesterKpiScope(req: { auth?: { userId: number; role: KpiRequesterScope["role"] } }): Promise<KpiRequesterScope> {
  const { userId, role } = req.auth!;
  let unitId: number | null = null;
  if (role === "manager") {
    const [u] = await db
      .select({ unitId: usersTable.unitId })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    unitId = u?.unitId ?? null;
  }
  return { role, userId, unitId };
}

/** Campos de acesso a partir de uma row de indicador. */
function accessFieldsOf(r: { unitId: number | null; responsibleUserId: number | null; rollupStrategy: string | null }): KpiIndicatorAccessFields {
  return {
    unitId: r.unitId ?? null,
    responsibleUserId: r.responsibleUserId ?? null,
    isCorporate: r.rollupStrategy != null,
  };
}

/**
 * Condição SQL de visibilidade por role. undefined = sem restrição (admin).
 * - manager: própria filial OU corporativo (rollupStrategy not null)
 * - operator/analyst: só onde é responsável
 */
function kpiVisibilityCondition(scope: KpiRequesterScope): SQL | undefined {
  if (scope.role === "org_admin" || scope.role === "platform_admin") return undefined;
  if (scope.role === "manager") {
    return or(
      scope.unitId !== null ? eq(kpiIndicatorsTable.unitId, scope.unitId) : sql`false`,
      isNotNull(kpiIndicatorsTable.rollupStrategy),
    );
  }
  // operator / analyst
  return eq(kpiIndicatorsTable.responsibleUserId, scope.userId);
}

/** Carrega os campos de acesso de um indicador da org e checa a ação. Retorna
 * 'ok' | 404 | 403 para o handler responder. */
async function authorizeIndicatorAction(
  req: { auth?: { userId: number; role: KpiRequesterScope["role"]; organizationId: number } },
  orgId: number,
  indicatorId: number,
  action: KpiAction,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [ind] = await db
    .select({
      unitId: kpiIndicatorsTable.unitId,
      responsibleUserId: kpiIndicatorsTable.responsibleUserId,
      rollupStrategy: kpiIndicatorsTable.rollupStrategy,
    })
    .from(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, indicatorId), eq(kpiIndicatorsTable.organizationId, orgId)));
  if (!ind) return { ok: false, status: 404, error: "Indicador não encontrado" };
  const scope = await getRequesterKpiScope(req);
  if (!canActOnKpiIndicator(scope, accessFieldsOf(ind), action)) {
    return { ok: false, status: 403, error: "Sem permissão para esta operação no indicador" };
  }
  return { ok: true };
}

/**
 * Meses (1–12) em que um indicador não-mensal deve ser lançado, conforme a
 * periodicidade e o mês de referência. Vazio quando mensal ou sem referência
 * válida — nesse caso não há restrição (todos os meses contam).
 */
function expectedMonthsFor(
  periodicity: string,
  referenceMonth: number | null,
): number[] {
  if (!referenceMonth || referenceMonth < 1 || referenceMonth > 12) return [];
  const at = (offset: number) => ((referenceMonth - 1 + offset) % 12) + 1;
  if (periodicity === "annual") return [at(0)];
  if (periodicity === "semiannual") return [at(0), at(6)];
  if (periodicity === "quarterly") return [at(0), at(3), at(6), at(9)];
  return [];
}

function computeFeedStatus(
  monthValues: (number | null)[],
  periodicity: string,
  referenceMonth: number | null,
  year: number,
): "fed" | "overdue" {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  // Quantos meses do ano selecionado já viraram exigíveis (passaram).
  //   - ano passado : todos os 12 são exigíveis
  //   - ano corrente: 1..currentMonth-1 (o mês corrente ainda está em curso)
  //   - ano futuro  : 0 (nada cobrável ainda)
  const maxMonthDue =
    year < currentYear ? 12 : year > currentYear ? 0 : currentMonth - 1;

  if (maxMonthDue === 0) return "fed";

  // Periodicidades mensais: vencido se algum mês exigível está vazio.
  if (
    periodicity === "monthly" ||
    periodicity === "monthly_15d" ||
    periodicity === "monthly_45d"
  ) {
    for (let m = 1; m <= maxMonthDue; m++) {
      if (monthValues[m - 1] === null) return "overdue";
    }
    return "fed";
  }

  // Não mensais: precisam do mês de referência. Vencido quando um mês
  // esperado que já chegou (mês ≤ maxMonthDue) continua sem lançamento.
  if (!referenceMonth || referenceMonth < 1 || referenceMonth > 12) {
    return "fed"; // sem mês de referência — não há como cobrar
  }
  const expected = expectedMonthsFor(periodicity, referenceMonth);
  for (const m of expected) {
    if (m <= maxMonthDue && monthValues[m - 1] === null) return "overdue";
  }
  return "fed";
}

/**
 * Garante a existência de `kpi_year_configs` para (org, indicator, year),
 * herdando `goal`, `seq` e `objectiveId` do config mais recente de ANO
 * ANTERIOR quando precisa criar (carry-forward). Idempotente — usa
 * onConflictDoUpdate pra resolver races sem perder a row existente.
 *
 * Retorna `null` se o indicador não existe (ou não pertence à org).
 *
 * Por que carry-forward: o catálogo de indicadores (fórmula, periodicidade,
 * direction, etc.) não tem ano — eles seguem ativos. Apenas a meta/objetivo
 * tem dimensão temporal. Sem isso, todo dia 1º de janeiro o usuário precisava
 * reabrir cada indicador e reconfigurar a tolerância pra que ele voltasse a
 * aparecer na tela de Lançamentos. Agora a tolerância anterior fica como
 * default e o cliente sobrescreve quando quiser.
 */
async function ensureYearConfig(
  orgId: number,
  indicatorId: number,
  year: number,
): Promise<typeof kpiYearConfigsTable.$inferSelect | null> {
  const [existing] = await db
    .select()
    .from(kpiYearConfigsTable)
    .where(
      and(
        eq(kpiYearConfigsTable.organizationId, orgId),
        eq(kpiYearConfigsTable.indicatorId, indicatorId),
        eq(kpiYearConfigsTable.year, year),
      ),
    );
  if (existing) return existing;

  // Garante que o indicador existe na org antes de inserir (evita FK error)
  const [ind] = await db
    .select({ id: kpiIndicatorsTable.id })
    .from(kpiIndicatorsTable)
    .where(
      and(
        eq(kpiIndicatorsTable.id, indicatorId),
        eq(kpiIndicatorsTable.organizationId, orgId),
      ),
    );
  if (!ind) return null;

  // Busca o config mais recente em ano anterior pra herdar valores.
  const [prior] = await db
    .select()
    .from(kpiYearConfigsTable)
    .where(
      and(
        eq(kpiYearConfigsTable.organizationId, orgId),
        eq(kpiYearConfigsTable.indicatorId, indicatorId),
        lt(kpiYearConfigsTable.year, year),
      ),
    )
    .orderBy(desc(kpiYearConfigsTable.year))
    .limit(1);

  const [created] = await db
    .insert(kpiYearConfigsTable)
    .values({
      organizationId: orgId,
      indicatorId,
      year,
      objectiveId: prior?.objectiveId ?? null,
      seq: prior?.seq ?? null,
      goal: prior?.goal ?? null,
    })
    .onConflictDoUpdate({
      target: [
        kpiYearConfigsTable.organizationId,
        kpiYearConfigsTable.indicatorId,
        kpiYearConfigsTable.year,
      ],
      // Race: outra request criou no meio tempo. Mantém o que estava lá,
      // só toca updatedAt pro returning retornar a row.
      set: { updatedAt: new Date() },
    })
    .returning();
  return created;
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

  const scope = await getRequesterKpiScope(req);

  const conditions = [eq(kpiIndicatorsTable.organizationId, params.data.orgId)];
  if (query.data.unit) {
    conditions.push(ilike(kpiIndicatorsTable.unit, `%${query.data.unit}%`));
  }
  const visibility = kpiVisibilityCondition(scope);
  if (visibility) conditions.push(visibility);

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

  // Resolve a filial alvo: aceita unitId (preferido) e mantém o texto `unit`.
  const targetUnitId: number | null = typeof (req.body?.unitId) === "number" ? req.body.unitId : null;
  let unitText: string | null = normalizeKpiUnit(body.data.unit);
  if (targetUnitId !== null) {
    const [unitRow] = await db
      .select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable)
      .where(and(eq(unitsTable.id, targetUnitId), eq(unitsTable.organizationId, params.data.orgId)));
    if (!unitRow) { res.status(400).json({ error: "unitId não corresponde a uma filial desta organização" }); return; }
    unitText = unitRow.name;
  }

  const scope = await getRequesterKpiScope(req);
  const canCreate = canActOnKpiIndicator(
    scope,
    { unitId: targetUnitId, responsibleUserId, isCorporate: false },
    "createUnit",
  );
  if (!canCreate) { res.status(403).json({ error: "Sem permissão para criar indicador nesta filial" }); return; }

  const [row] = await db.insert(kpiIndicatorsTable).values({
    organizationId: params.data.orgId,
    name: body.data.name,
    measurement: body.data.measurement,
    formulaVariables: body.data.formulaVariables,
    formulaExpression: body.data.formulaExpression,
    unit: unitText,
    unitId: targetUnitId,
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
  if (body.data.unit !== undefined) updateData.unit = normalizeKpiUnit(body.data.unit);
  if (typeof req.body?.unitId === "number" || req.body?.unitId === null) {
    const newUnitId: number | null = req.body.unitId;
    if (newUnitId === null) {
      updateData.unitId = null;
    } else {
      const [unitRow] = await db
        .select({ id: unitsTable.id, name: unitsTable.name })
        .from(unitsTable)
        .where(and(eq(unitsTable.id, newUnitId), eq(unitsTable.organizationId, params.data.orgId)));
      if (!unitRow) { res.status(400).json({ error: "unitId não corresponde a uma filial desta organização" }); return; }
      updateData.unitId = unitRow.id;
      updateData.unit = unitRow.name;
    }
  }
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

  // Mudança de fórmula precisa recalcular os `value` dos kpi_monthly_values já
  // gravados — senão o histórico continua refletindo o cálculo antigo enquanto
  // o "Resultado" da tela de Lançar (que reavalia ao vivo) mostra o novo.
  // Pegamos expression + variables atuais antes do update pra comparar.
  const [current] = await db
    .select({
      formulaExpression: kpiIndicatorsTable.formulaExpression,
      formulaVariables: kpiIndicatorsTable.formulaVariables,
      unitId: kpiIndicatorsTable.unitId,
      responsibleUserId: kpiIndicatorsTable.responsibleUserId,
      rollupStrategy: kpiIndicatorsTable.rollupStrategy,
    })
    .from(kpiIndicatorsTable)
    .where(and(
      eq(kpiIndicatorsTable.id, params.data.indicatorId),
      eq(kpiIndicatorsTable.organizationId, params.data.orgId),
    ));
  if (!current) { res.status(404).json({ error: "Indicador não encontrado" }); return; }

  const scope = await getRequesterKpiScope(req);
  if (!canActOnKpiIndicator(scope, accessFieldsOf(current), "editDefinition")) {
    res.status(403).json({ error: "Sem permissão para editar este indicador" }); return;
  }

  const newExpression = typeof updateData.formulaExpression === "string"
    ? updateData.formulaExpression
    : current.formulaExpression;
  const newVariables: FormulaVar[] = Array.isArray(updateData.formulaVariables)
    ? (updateData.formulaVariables as FormulaVar[])
    : current.formulaVariables;
  const expressionChanged =
    typeof updateData.formulaExpression === "string" &&
    updateData.formulaExpression !== current.formulaExpression;
  // Editar texto da fórmula faz `parseNaturalFormula` regenerar os slugs das
  // variáveis. Detecta renames inequívocos pra migrar as chaves dos `inputs`
  // dos lançamentos antigos. Em qualquer ambiguidade, devolve [] e o guard
  // de NULL abaixo preserva o `value` visível.
  const renames = expressionChanged
    ? detectVariableRenames(current.formulaVariables, newVariables)
    : [];

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(kpiIndicatorsTable)
      .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
      .where(and(eq(kpiIndicatorsTable.id, params.data.indicatorId), eq(kpiIndicatorsTable.organizationId, params.data.orgId)))
      .returning();
    if (!updated) return null;

    if (expressionChanged && newExpression.trim()) {
      const yearConfigs = await tx
        .select({ id: kpiYearConfigsTable.id })
        .from(kpiYearConfigsTable)
        .where(and(
          eq(kpiYearConfigsTable.organizationId, params.data.orgId),
          eq(kpiYearConfigsTable.indicatorId, params.data.indicatorId),
        ));
      const yearConfigIds = yearConfigs.map((yc) => yc.id);
      if (yearConfigIds.length > 0) {
        const monthlyRows = await tx
          .select()
          .from(kpiMonthlyValuesTable)
          .where(inArray(kpiMonthlyValuesTable.yearConfigId, yearConfigIds));
        const now = new Date();
        for (const mv of monthlyRows) {
          const inputs = mv.inputs ?? {};
          if (Object.keys(inputs).length === 0) continue;

          // Camada 2: aplica renames (se houver) aos inputs antes de reavaliar.
          // Os inputs gravados podem ter chaves órfãs após edição de fórmula.
          const { migrated, changed: inputsChanged } = migrateInputsForRename(
            inputs,
            renames,
          );
          const recomputed = evaluateFormula(newExpression, migrated);
          const newValueStr = recomputed !== null && Number.isFinite(recomputed)
            ? String(recomputed)
            : null;

          // Camada 1 (guard de NULL): se a nova fórmula não consegue avaliar
          // mas o `value` antigo existe, NÃO apaga. Preserva o número visível
          // no histórico — o `inputs` continua intacto pra recuperação. Sem
          // este guard, edições de fórmula corromperiam o histórico já
          // lançado.
          const preserveValue = newValueStr === null && mv.value !== null;

          if (preserveValue && !inputsChanged) {
            // Nada a fazer: nem value novo nem inputs migrado.
            continue;
          }

          const setPayload: {
            value?: string | null;
            inputs?: typeof inputs;
            updatedAt: Date;
          } = { updatedAt: now };
          if (!preserveValue) setPayload.value = newValueStr;
          if (inputsChanged) setPayload.inputs = migrated;

          await tx.update(kpiMonthlyValuesTable)
            .set(setPayload)
            .where(eq(kpiMonthlyValuesTable.id, mv.id));
        }
      }
    }
    return updated;
  });

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

  const auth = await authorizeIndicatorAction(req, params.data.orgId, params.data.indicatorId, "delete");
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

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

  const scope = await getRequesterKpiScope(req);

  // Fetch all indicators (optionally filtered by unit), restritos ao escopo do solicitante
  const indicatorConditions = [eq(kpiIndicatorsTable.organizationId, params.data.orgId)];
  if (query.data.unit) {
    indicatorConditions.push(ilike(kpiIndicatorsTable.unit, `%${query.data.unit}%`));
  }
  const visibility = kpiVisibilityCondition(scope);
  if (visibility) indicatorConditions.push(visibility);

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

  // Carry-forward sintético: pra cada indicador sem config no ano alvo, busca
  // o config mais recente de ano anterior e materializa em memória (id=0
  // marca "não persistido"). Persiste de verdade só quando a Ana salvar um
  // valor — vide PUT /years/:year/values e ensureYearConfig. Sem isso, ano
  // novo viria vazio e o cliente teria que reabrir cada indicador no início
  // de cada ano (jan/2027 etc).
  const indicatorsWithoutConfig = indicators.filter(
    (ind) => !yearConfigByIndicatorId.has(ind.id),
  );
  if (indicatorsWithoutConfig.length > 0) {
    const missingIds = indicatorsWithoutConfig.map((i) => i.id);
    const priorRows = await db.execute<{
      indicator_id: number;
      objective_id: number | null;
      seq: number | null;
      goal: string | null;
    }>(sql`
      SELECT DISTINCT ON (indicator_id)
        indicator_id, objective_id, seq, goal
      FROM ${kpiYearConfigsTable}
      WHERE organization_id = ${params.data.orgId}
        AND year < ${params.data.year}
        AND indicator_id IN ${missingIds}
      ORDER BY indicator_id, year DESC
    `);
    const priorByIndicatorId = new Map(
      priorRows.rows.map((r) => [Number(r.indicator_id), r]),
    );
    const now = new Date();
    for (const ind of indicatorsWithoutConfig) {
      const prior = priorByIndicatorId.get(ind.id);
      const synthetic: typeof kpiYearConfigsTable.$inferSelect = {
        id: 0, // sentinela "não persistido"
        organizationId: params.data.orgId,
        indicatorId: ind.id,
        year: params.data.year,
        objectiveId: prior?.objective_id ?? null,
        seq: prior?.seq ?? null,
        goal: prior?.goal ?? null,
        createdAt: now,
        updatedAt: now,
      };
      yearConfigByIndicatorId.set(ind.id, synthetic);
    }
  }

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
    isOverridden: boolean;
    isComputed: boolean;             // true quando o valor visível veio de rollup (não do row)
    childrenWithData: number | null; // só relevante quando isComputed
    childrenTotal: number | null;    // só relevante quando isComputed
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
      isOverridden: mv.isOverridden,
      isComputed: false,
      childrenWithData: null,
      childrenTotal: null,
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

  // ─── Rollup compose on-read ──────────────────────────────────────────────
  // Corporativos com filhos + estratégia (rollupStrategy != null) têm o valor
  // mensal CALCULADO a partir dos filhos — EXCETO meses com is_overridden=true
  // (lançamento manual; respeitamos o que já está preenchido).
  const rollupIndicators = indicators.filter((ind) => ind.rollupStrategy);
  for (const ind of rollupIndicators) {
    const yc = yearConfigByIndicatorId.get(ind.id);
    if (!yc) continue;
    const monthMap = valuesByYearConfigId.get(yc.id) ?? new Map<number, MonthCell>();

    // Respeita a periodicidade: não-mensal com mês de referência só calcula nos
    // meses esperados (trimestre/semestre/ano). null = sem restrição (mensal),
    // calcula os 12. Evita agregar dado de mês fora do ciclo.
    const expected = expectedMonthsFor(ind.periodicity, ind.referenceMonth ?? null);
    const expectedSet = expected.length > 0 ? new Set(expected) : null;

    const computeResults = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const month = i + 1;
        // Fora da referência (indicador não-mensal): não calcula.
        if (expectedSet && !expectedSet.has(month)) {
          return { month, replace: null };
        }
        const existing = monthMap.get(month);
        // Override manual / mês já preenchido: respeita o valor armazenado.
        if (existing?.isOverridden) {
          return { month, replace: null };
        }
        const result = await computeRollupValue(params.data.orgId, ind.id, params.data.year, month);
        return { month, replace: result };
      }),
    );

    for (const { month, replace } of computeResults) {
      if (!replace) continue;
      if (!monthMap.has(month)) {
        monthMap.set(month, {
          monthlyValueId: 0,
          value: null,
          inputs: {},
          isOverridden: false,
          isComputed: false,
          childrenWithData: null,
          childrenTotal: null,
          justification: null,
          justificationsCount: 0,
        });
      }
      const cell = monthMap.get(month)!;
      cell.value = replace.computed;
      cell.isComputed = true;
      cell.childrenWithData = replace.childrenWithData;
      cell.childrenTotal = replace.childrenTotal;
    }
    valuesByYearConfigId.set(yc.id, monthMap);
  }

  // Build response — todos os indicadores aparecem em qualquer ano. Os que
  // não tinham config no ano alvo já receberam um sintético acima (carry-
  // forward), então sempre há um `yc` pra mapear.
  const rows = indicators
    .map((ind) => {
      const yc = yearConfigByIndicatorId.get(ind.id)!;
      const monthMap = valuesByYearConfigId.get(yc.id) ?? new Map<number, MonthCell>();
      const monthlyCells: MonthCell[] = Array.from({ length: 12 }, (_, i) =>
        monthMap.get(i + 1) ?? {
          monthlyValueId: 0,
          value: null,
          inputs: {},
          isOverridden: false,
          isComputed: false,
          childrenWithData: null,
          childrenTotal: null,
          justification: null,
          justificationsCount: 0,
        },
      );
      const monthlyValuesOnly = monthlyCells.map((c) => c.value);

      // Indicador não-mensal: só os meses de referência contam na agregação —
      // valores fora dela (ex.: carga de zero indevida) são ignorados.
      const expectedMonthSet = (() => {
        const e = expectedMonthsFor(ind.periodicity, ind.referenceMonth ?? null);
        return e.length > 0 ? new Set(e) : null;
      })();
      // monthlyValuesOnly é ordenado 1..12, então índice + 1 = mês.
      const filledValues = monthlyValuesOnly.filter(
        (v, i) => v !== null && (!expectedMonthSet || expectedMonthSet.has(i + 1)),
      ) as number[];
      const average = filledValues.length > 0 ? filledValues.reduce((a, b) => a + b, 0) / filledValues.length : null;
      const accumulated = filledValues.length > 0 ? filledValues.reduce((a, b) => a + b, 0) : null;
      const feedStatus = computeFeedStatus(
        monthlyValuesOnly,
        ind.periodicity,
        ind.referenceMonth ?? null,
        params.data.year,
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
          isOverridden: c.isOverridden,
          isComputed: c.isComputed,
          childrenWithData: c.childrenWithData,
          childrenTotal: c.childrenTotal,
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

  const auth = await authorizeIndicatorAction(req, params.data.orgId, params.data.indicatorId, "editDefinition");
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

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

  const auth = await authorizeIndicatorAction(req, params.data.orgId, params.data.indicatorId, "operate");
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

  // Garante a existência do yearConfig — se não existe, é criado com
  // carry-forward (goal/seq/objectiveId do ano anterior). Isso elimina a
  // necessidade de "reabrir" o indicador no início de cada ano antes de
  // poder lançar valores.
  const yearConfig = await ensureYearConfig(
    params.data.orgId,
    params.data.indicatorId,
    params.data.year,
  );
  if (!yearConfig) { res.status(404).json({ error: "Indicador não encontrado" }); return; }

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

  // is_overridden defaults to TRUE quando o user entra um valor (entrada manual
   // = override sobre o que o sistema calcularia). Quando value=null E o
   // indicador tem rollup configurado, marcamos FALSE pra liberar o compute.
   // O frontend pode passar isOverridden explicitamente pra controle fino.
  type UpsertValueRow = typeof body.data.values[number] & { isOverridden?: boolean };
  const upsertValues = body.data.values.map((v) => {
    const raw = v as UpsertValueRow;
    const valueNum = v.value !== null && v.value !== undefined ? String(v.value) : null;
    const isOverridden = typeof raw.isOverridden === "boolean"
      ? raw.isOverridden
      : valueNum !== null;
    return {
      organizationId: params.data.orgId,
      yearConfigId: yearConfig.id,
      month: v.month,
      value: valueNum,
      inputs: v.inputs ?? {},
      isOverridden,
    };
  });

  await db.insert(kpiMonthlyValuesTable).values(upsertValues)
    .onConflictDoUpdate({
      target: [kpiMonthlyValuesTable.yearConfigId, kpiMonthlyValuesTable.month],
      set: {
        value: sql`excluded.value`,
        inputs: sql`excluded.inputs`,
        isOverridden: sql`excluded.is_overridden`,
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
  // Mesma lógica do PUT values: cria o yearConfig sob demanda (carry-forward
  // do ano anterior) em vez de bloquear com 404. Permite justificar um mês
  // em ano que ainda não foi "aberto" manualmente.
  const yearConfig = await ensureYearConfig(orgId, indicatorId, year);
  if (!yearConfig) {
    return { error: "Indicador não encontrado", status: 404 };
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

    const auth = await authorizeIndicatorAction(req, params.data.orgId, params.data.indicatorId, "view");
    if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

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

    const auth = await authorizeIndicatorAction(req, params.data.orgId, params.data.indicatorId, "operate");
    if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

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

// ─── Corporativo (rollup por valores) ──────────────────────────────────────
// Cria um indicador unit="Corporativo" cujo valor mensal é a agregação
// (média/soma/mín/máx) dos VALORES dos indicadores-filhos selecionados pelo
// usuário. Sem fórmula própria e sem IA — o cálculo é compose-on-read e
// respeita meses lançados manualmente. Atômico: indicador + composição + meta.
router.post(
  "/organizations/:orgId/kpi/corporate-indicators",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const orgId = Number(req.params.orgId);
    if (!Number.isFinite(orgId)) { res.status(400).json({ error: "orgId inválido" }); return; }
    if (orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const scope = await getRequesterKpiScope(req);
    if (!canActOnKpiIndicator(scope, { unitId: null, responsibleUserId: null, isCorporate: true }, "createCorporate")) {
      res.status(403).json({ error: "Sem permissão para criar indicador corporativo" }); return;
    }

    const body = req.body as {
      name?: string;
      strategy?: string;
      childIndicatorIds?: number[];
      year?: number;
      goal?: number | null;
      measureUnit?: string | null;
      direction?: string;
      periodicity?: string;
      referenceMonth?: number | null;
      category?: string | null;
      norms?: string[];
      responsibleUserId?: number | null;
    };

    // Estratégias por VALOR (não expomos sum_inputs neste fluxo).
    const VALUE_STRATEGIES: KpiRollupStrategy[] = ["average", "sum_values", "min", "max"];
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      res.status(400).json({ error: "name obrigatório" }); return;
    }
    if (!body.strategy || !VALUE_STRATEGIES.includes(body.strategy as KpiRollupStrategy)) {
      res.status(400).json({ error: "strategy deve ser average | sum_values | min | max" }); return;
    }
    if (!body.direction || (body.direction !== "up" && body.direction !== "down")) {
      res.status(400).json({ error: "direction deve ser 'up' ou 'down'" }); return;
    }
    if (!body.periodicity || typeof body.periodicity !== "string") {
      res.status(400).json({ error: "periodicity obrigatório" }); return;
    }
    if (body.goal == null || !Number.isFinite(Number(body.goal))) {
      res.status(400).json({ error: "Tolerância obrigatória" }); return;
    }
    if (body.responsibleUserId == null || !Number.isFinite(Number(body.responsibleUserId))) {
      res.status(400).json({ error: "Responsável obrigatório" }); return;
    }
    const year = Number.isFinite(body.year) ? Number(body.year) : new Date().getFullYear();
    const childIds = Array.isArray(body.childIndicatorIds)
      ? [...new Set(body.childIndicatorIds.map(Number).filter(Number.isFinite))]
      : [];
    if (childIds.length < 2) {
      res.status(400).json({ error: "Selecione ao menos 2 indicadores-filhos" }); return;
    }

    // Filhos precisam pertencer à org e NÃO ser corporativos.
    const childRows = await db
      .select({ id: kpiIndicatorsTable.id, unit: kpiIndicatorsTable.unit })
      .from(kpiIndicatorsTable)
      .where(and(eq(kpiIndicatorsTable.organizationId, orgId), inArray(kpiIndicatorsTable.id, childIds)));
    if (childRows.length !== childIds.length) {
      res.status(400).json({ error: "Algum filho não pertence a esta organização" }); return;
    }
    const corporateChild = childRows.find(
      (c) => (c.unit ?? "").trim().toLowerCase() === CORPORATE_UNIT_LABEL.toLowerCase(),
    );
    if (corporateChild) {
      res.status(400).json({ error: "Um corporativo não pode ser filho de outro" }); return;
    }
    // 1 filho = 1 pai: rejeita filhos já vinculados a outro corporativo.
    const alreadyLinked = await db
      .select({ childIndicatorId: kpiIndicatorRollupsTable.childIndicatorId })
      .from(kpiIndicatorRollupsTable)
      .where(and(
        eq(kpiIndicatorRollupsTable.organizationId, orgId),
        inArray(kpiIndicatorRollupsTable.childIndicatorId, childIds),
      ));
    if (alreadyLinked.length > 0) {
      res.status(409).json({
        error: "Algum indicador já compõe outro corporativo",
        childIndicatorIds: alreadyLinked.map((l) => l.childIndicatorId),
      });
      return;
    }

    const strategy = body.strategy as KpiRollupStrategy;
    const strategyLabel = strategy === "average" ? "Média"
      : strategy === "sum_values" ? "Soma"
      : strategy === "min" ? "Mínimo" : "Máximo";

    const newIndicatorId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(kpiIndicatorsTable)
        .values({
          organizationId: orgId,
          name: body.name!.trim(),
          measurement: `${strategyLabel} de ${childIds.length} indicadores filiais`,
          measureUnit: body.measureUnit ?? null,
          unit: CORPORATE_UNIT_LABEL,
          direction: body.direction!,
          periodicity: body.periodicity!,
          referenceMonth: body.referenceMonth ?? null,
          category: body.category ?? null,
          formulaExpression: "",
          formulaVariables: [],
          responsibleUserId: body.responsibleUserId ?? null,
          norms: Array.isArray(body.norms) ? body.norms : [],
          rollupStrategy: strategy,
        })
        .returning({ id: kpiIndicatorsTable.id });

      await tx.insert(kpiIndicatorRollupsTable).values(
        childIds.map((childIndicatorId) => ({
          organizationId: orgId,
          parentIndicatorId: created.id,
          childIndicatorId,
          variableMapping: {},
        })),
      );

      // Year config com a tolerância/meta do corporativo.
      await tx.insert(kpiYearConfigsTable).values({
        organizationId: orgId,
        indicatorId: created.id,
        year,
        goal: body.goal != null ? String(body.goal) : null,
      });

      return created.id;
    });

    res.status(201).json({
      indicatorId: newIndicatorId,
      childrenCount: childIds.length,
      strategy,
    });
  },
);

export default router;
