import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  roadSafetyFactorMeasurementsTable,
  roadSafetyFactorsTable,
  usersTable,
} from "@workspace/db";
import {
  CreateRoadSafetyFactorBody,
  CreateRoadSafetyFactorParams,
  CreateRoadSafetyMeasurementBody,
  CreateRoadSafetyMeasurementParams,
  DeleteRoadSafetyFactorParams,
  GetRoadSafetyFactorParams,
  ListRoadSafetyFactorsParams,
  ListRoadSafetyMeasurementsParams,
  UpdateRoadSafetyFactorBody,
  UpdateRoadSafetyFactorParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../../middlewares/auth";

const router: IRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FactorRow = typeof roadSafetyFactorsTable.$inferSelect;
type MeasurementRow = typeof roadSafetyFactorMeasurementsTable.$inferSelect;

type MeasurementAggregate = {
  latestValue: number | null;
  latestMeasurementDate: string | null;
  measurementCount: number;
  updatedThisMonth: boolean;
};

const EMPTY_AGGREGATE: MeasurementAggregate = {
  latestValue: null,
  latestMeasurementDate: null,
  measurementCount: 0,
  updatedThisMonth: false,
};

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Aggregates measurement history into the computed fields the painel needs. */
function aggregateMeasurements(rows: MeasurementRow[]): MeasurementAggregate {
  if (rows.length === 0) return EMPTY_AGGREGATE;
  const ym = currentYearMonth();
  let latest: MeasurementRow | null = null;
  let updatedThisMonth = false;
  for (const m of rows) {
    if (!latest || m.referenceDate > latest.referenceDate) latest = m;
    if (m.referenceDate.startsWith(ym)) updatedThisMonth = true;
  }
  return {
    latestValue: latest ? parseFloat(latest.value) : null,
    latestMeasurementDate: latest ? latest.referenceDate : null,
    measurementCount: rows.length,
    updatedThisMonth,
  };
}

function serializeFactor(
  r: FactorRow,
  responsibleUserName: string | null,
  agg: MeasurementAggregate,
) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    code: r.code,
    type: r.type,
    origin: r.origin ?? null,
    normItem: r.normItem ?? null,
    isAdditional: r.isAdditional,
    name: r.name,
    analysis: r.analysis ?? null,
    currentDiagnosis: r.currentDiagnosis ?? null,
    monitoringForm: r.monitoringForm ?? null,
    periodicity: r.periodicity,
    measureUnit: r.measureUnit ?? null,
    goal: r.goal !== null && r.goal !== undefined ? parseFloat(r.goal) : null,
    responsibleUserId: r.responsibleUserId ?? null,
    responsibleUserName,
    monitoringDetail: r.monitoringDetail ?? null,
    gutGravity: r.gutGravity,
    gutUrgency: r.gutUrgency,
    gutTendency: r.gutTendency,
    gutScore: r.gutGravity * r.gutUrgency * r.gutTendency,
    existingControls: r.existingControls ?? null,
    controlStatus: r.controlStatus,
    reviewDeadline: r.reviewDeadline ?? null,
    actionPlanRef: r.actionPlanRef ?? null,
    latestValue: agg.latestValue,
    latestMeasurementDate: agg.latestMeasurementDate,
    measurementCount: agg.measurementCount,
    updatedThisMonth: agg.updatedThisMonth,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeMeasurement(r: MeasurementRow, createdByUserName: string | null) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    factorId: r.factorId,
    value: parseFloat(r.value),
    referenceDate: r.referenceDate,
    note: r.note ?? null,
    createdByUserId: r.createdByUserId ?? null,
    createdByUserName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Next sequential factor code (FD01, FD02, …) scoped to the organization. */
async function nextFactorCode(orgId: number): Promise<string> {
  const rows = await db
    .select({ code: roadSafetyFactorsTable.code })
    .from(roadSafetyFactorsTable)
    .where(eq(roadSafetyFactorsTable.organizationId, orgId));
  let max = 0;
  for (const r of rows) {
    const m = /^FD(\d+)$/.exec(r.code ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `FD${String(max + 1).padStart(2, "0")}`;
}

const clampGut = (v: number | undefined, fallback: number): number => {
  if (typeof v !== "number" || Number.isNaN(v)) return fallback;
  return Math.min(5, Math.max(1, Math.round(v)));
};

// ─── Factors ─────────────────────────────────────────────────────────────────

router.get(
  "/organizations/:orgId/road-safety/factors",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListRoadSafetyFactorsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select({ factor: roadSafetyFactorsTable, responsibleUserName: usersTable.name })
      .from(roadSafetyFactorsTable)
      .leftJoin(usersTable, eq(usersTable.id, roadSafetyFactorsTable.responsibleUserId))
      .where(eq(roadSafetyFactorsTable.organizationId, params.data.orgId))
      .orderBy(asc(roadSafetyFactorsTable.code));

    const factorIds = rows.map((r) => r.factor.id);
    const measurements = factorIds.length
      ? await db
          .select()
          .from(roadSafetyFactorMeasurementsTable)
          .where(inArray(roadSafetyFactorMeasurementsTable.factorId, factorIds))
      : [];

    const byFactor = new Map<number, MeasurementRow[]>();
    for (const m of measurements) {
      const list = byFactor.get(m.factorId) ?? [];
      list.push(m);
      byFactor.set(m.factorId, list);
    }

    res.json(
      rows.map((r) =>
        serializeFactor(
          r.factor,
          r.responsibleUserName ?? null,
          aggregateMeasurements(byFactor.get(r.factor.id) ?? []),
        ),
      ),
    );
  },
);

router.post(
  "/organizations/:orgId/road-safety/factors",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateRoadSafetyFactorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = CreateRoadSafetyFactorBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const responsibleUserId = await resolveResponsible(
      body.data.responsibleUserId ?? null,
      params.data.orgId,
      res,
    );
    if (responsibleUserId === undefined) return;

    const code = await nextFactorCode(params.data.orgId);

    const [row] = await db
      .insert(roadSafetyFactorsTable)
      .values({
        organizationId: params.data.orgId,
        code,
        type: body.data.type,
        origin: body.data.origin ?? null,
        normItem: body.data.normItem ?? null,
        isAdditional: body.data.isAdditional ?? false,
        name: body.data.name.trim().toUpperCase(),
        analysis: body.data.analysis ?? null,
        // currentDiagnosis ainda não está no contrato gerado (api-zod) —
        // lido direto do corpo até a próxima rodada de codegen.
        currentDiagnosis:
          typeof req.body?.currentDiagnosis === "string"
            ? req.body.currentDiagnosis
            : null,
        monitoringForm: body.data.monitoringForm ?? null,
        periodicity: body.data.periodicity || "monthly",
        measureUnit: body.data.measureUnit ?? null,
        goal: body.data.goal != null ? String(body.data.goal) : null,
        responsibleUserId,
        monitoringDetail: body.data.monitoringDetail ?? null,
        gutGravity: clampGut(body.data.gutGravity, 1),
        gutUrgency: clampGut(body.data.gutUrgency, 1),
        gutTendency: clampGut(body.data.gutTendency, 1),
        existingControls: body.data.existingControls ?? null,
        controlStatus: body.data.controlStatus || "scheduled",
        reviewDeadline: body.data.reviewDeadline ?? null,
        actionPlanRef: body.data.actionPlanRef ?? null,
      })
      .returning();

    res.status(201).json(serializeFactor(row, null, EMPTY_AGGREGATE));
  },
);

router.get(
  "/organizations/:orgId/road-safety/factors/:factorId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetRoadSafetyFactorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [row] = await db
      .select({ factor: roadSafetyFactorsTable, responsibleUserName: usersTable.name })
      .from(roadSafetyFactorsTable)
      .leftJoin(usersTable, eq(usersTable.id, roadSafetyFactorsTable.responsibleUserId))
      .where(
        and(
          eq(roadSafetyFactorsTable.id, params.data.factorId),
          eq(roadSafetyFactorsTable.organizationId, params.data.orgId),
        ),
      );
    if (!row) { res.status(404).json({ error: "Fator não encontrado" }); return; }

    const measurements = await db
      .select()
      .from(roadSafetyFactorMeasurementsTable)
      .where(eq(roadSafetyFactorMeasurementsTable.factorId, params.data.factorId));

    res.json(
      serializeFactor(
        row.factor,
        row.responsibleUserName ?? null,
        aggregateMeasurements(measurements),
      ),
    );
  },
);

router.patch(
  "/organizations/:orgId/road-safety/factors/:factorId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateRoadSafetyFactorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = UpdateRoadSafetyFactorBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const updateData: Record<string, unknown> = {};
    const d = body.data;
    if (d.type !== undefined) updateData.type = d.type;
    if (d.origin !== undefined) updateData.origin = d.origin;
    if (d.normItem !== undefined) updateData.normItem = d.normItem;
    if (d.isAdditional !== undefined) updateData.isAdditional = d.isAdditional;
    if (d.name !== undefined) updateData.name = d.name.trim().toUpperCase();
    if (d.analysis !== undefined) updateData.analysis = d.analysis;
    if (req.body && "currentDiagnosis" in req.body) {
      updateData.currentDiagnosis =
        typeof req.body.currentDiagnosis === "string"
          ? req.body.currentDiagnosis
          : null;
    }
    if (d.monitoringForm !== undefined) updateData.monitoringForm = d.monitoringForm;
    if (d.periodicity !== undefined) updateData.periodicity = d.periodicity;
    if (d.measureUnit !== undefined) updateData.measureUnit = d.measureUnit;
    if (d.goal !== undefined) updateData.goal = d.goal != null ? String(d.goal) : null;
    if (d.monitoringDetail !== undefined) updateData.monitoringDetail = d.monitoringDetail;
    if (d.gutGravity !== undefined) updateData.gutGravity = clampGut(d.gutGravity, 1);
    if (d.gutUrgency !== undefined) updateData.gutUrgency = clampGut(d.gutUrgency, 1);
    if (d.gutTendency !== undefined) updateData.gutTendency = clampGut(d.gutTendency, 1);
    if (d.existingControls !== undefined) updateData.existingControls = d.existingControls;
    if (d.controlStatus !== undefined) updateData.controlStatus = d.controlStatus;
    if (d.reviewDeadline !== undefined) updateData.reviewDeadline = d.reviewDeadline;
    if (d.actionPlanRef !== undefined) updateData.actionPlanRef = d.actionPlanRef;
    if (d.responsibleUserId !== undefined) {
      const resolved = await resolveResponsible(d.responsibleUserId, params.data.orgId, res);
      if (resolved === undefined) return;
      updateData.responsibleUserId = resolved;
    }

    const [row] = await db
      .update(roadSafetyFactorsTable)
      .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
      .where(
        and(
          eq(roadSafetyFactorsTable.id, params.data.factorId),
          eq(roadSafetyFactorsTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) { res.status(404).json({ error: "Fator não encontrado" }); return; }

    let responsibleUserName: string | null = null;
    if (row.responsibleUserId !== null) {
      const [u] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, row.responsibleUserId));
      responsibleUserName = u?.name ?? null;
    }
    const measurements = await db
      .select()
      .from(roadSafetyFactorMeasurementsTable)
      .where(eq(roadSafetyFactorMeasurementsTable.factorId, row.id));

    res.json(serializeFactor(row, responsibleUserName, aggregateMeasurements(measurements)));
  },
);

router.delete(
  "/organizations/:orgId/road-safety/factors/:factorId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteRoadSafetyFactorParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [row] = await db
      .delete(roadSafetyFactorsTable)
      .where(
        and(
          eq(roadSafetyFactorsTable.id, params.data.factorId),
          eq(roadSafetyFactorsTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) { res.status(404).json({ error: "Fator não encontrado" }); return; }
    res.status(204).send();
  },
);

// ─── Measurements (immutable launches) ───────────────────────────────────────

router.get(
  "/organizations/:orgId/road-safety/factors/:factorId/measurements",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListRoadSafetyMeasurementsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const rows = await db
      .select({
        measurement: roadSafetyFactorMeasurementsTable,
        createdByUserName: usersTable.name,
      })
      .from(roadSafetyFactorMeasurementsTable)
      .leftJoin(usersTable, eq(usersTable.id, roadSafetyFactorMeasurementsTable.createdByUserId))
      .where(
        and(
          eq(roadSafetyFactorMeasurementsTable.factorId, params.data.factorId),
          eq(roadSafetyFactorMeasurementsTable.organizationId, params.data.orgId),
        ),
      )
      .orderBy(desc(roadSafetyFactorMeasurementsTable.referenceDate));

    res.json(rows.map((r) => serializeMeasurement(r.measurement, r.createdByUserName ?? null)));
  },
);

router.post(
  "/organizations/:orgId/road-safety/factors/:factorId/measurements",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateRoadSafetyMeasurementParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = CreateRoadSafetyMeasurementBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const [factor] = await db
      .select({ id: roadSafetyFactorsTable.id })
      .from(roadSafetyFactorsTable)
      .where(
        and(
          eq(roadSafetyFactorsTable.id, params.data.factorId),
          eq(roadSafetyFactorsTable.organizationId, params.data.orgId),
        ),
      );
    if (!factor) { res.status(404).json({ error: "Fator não encontrado" }); return; }

    const [row] = await db
      .insert(roadSafetyFactorMeasurementsTable)
      .values({
        organizationId: params.data.orgId,
        factorId: params.data.factorId,
        value: String(body.data.value),
        referenceDate: body.data.referenceDate,
        note: body.data.note ?? null,
        createdByUserId: req.auth!.userId,
      })
      .returning();

    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.userId));

    res.status(201).json(serializeMeasurement(row, u?.name ?? null));
  },
);

/**
 * Validates a responsibleUserId belongs to the org. Returns the id (or null),
 * or `undefined` after sending a 400 — callers must abort on undefined.
 */
async function resolveResponsible(
  responsibleUserId: number | null,
  orgId: number,
  res: import("express").Response,
): Promise<number | null | undefined> {
  if (responsibleUserId === null) return null;
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, responsibleUserId), eq(usersTable.organizationId, orgId)));
  if (!user) {
    res.status(400).json({ error: "responsibleUserId não corresponde a um usuário desta organização" });
    return undefined;
  }
  return user.id;
}

export default router;
