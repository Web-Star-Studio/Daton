import { Router, type IRouter } from "express";
import { eq, and, ilike, sql } from "drizzle-orm";
import { db, legislationsTable, unitLegislationsTable, unitsTable, type Legislation } from "@workspace/db";
import {
  ListLegislationsParams,
  ListLegislationsQueryParams,
  CreateLegislationParams,
  CreateLegislationBody,
  ImportLegislationsParams,
  ImportLegislationsBody,
  GetLegislationParams,
  UpdateLegislationParams,
  UpdateLegislationBody,
  DeleteLegislationParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatLeg(l: Legislation) {
  return {
    id: l.id,
    organizationId: l.organizationId,
    title: l.title,
    number: l.number,
    description: l.description,
    tipoNorma: l.tipoNorma,
    emissor: l.emissor,
    level: l.level,
    status: l.status,
    uf: l.uf,
    municipality: l.municipality,
    macrotema: l.macrotema,
    subtema: l.subtema,
    applicability: l.applicability,
    publicationDate: l.publicationDate,
    sourceUrl: l.sourceUrl,
    applicableArticles: l.applicableArticles,
    reviewFrequencyDays: l.reviewFrequencyDays,
    observations: l.observations,
    generalObservations: l.generalObservations,
    createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    updatedAt: l.updatedAt instanceof Date ? l.updatedAt.toISOString() : l.updatedAt,
  };
}

router.get("/organizations/:orgId/legislations", requireAuth, async (req, res): Promise<void> => {
  const params = ListLegislationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const query = ListLegislationsQueryParams.safeParse(req.query);

  const conditions = [eq(legislationsTable.organizationId, params.data.orgId)];

  if (query.success && query.data.search) {
    conditions.push(ilike(legislationsTable.title, `%${query.data.search}%`));
  }
  if (query.success && query.data.level) {
    conditions.push(eq(legislationsTable.level, query.data.level));
  }
  if (query.success && query.data.status) {
    conditions.push(eq(legislationsTable.status, query.data.status));
  }

  const legislations = await db.select().from(legislationsTable)
    .where(and(...conditions))
    .orderBy(legislationsTable.createdAt);

  res.json(legislations.map(formatLeg));
});

router.post("/organizations/:orgId/legislations", requireAuth, async (req, res): Promise<void> => {
  const params = CreateLegislationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = CreateLegislationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const insertData = {
    ...body.data,
    organizationId: params.data.orgId,
  };

  const [leg] = await db.insert(legislationsTable).values(insertData).returning();

  res.status(201).json(formatLeg(leg));
});

router.post("/organizations/:orgId/legislations/import", requireAuth, async (req, res): Promise<void> => {
  const params = ImportLegislationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = ImportLegislationsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  let imported = 0;
  let errors = 0;

  const errorDetails: { index: number; title: string; error: string }[] = [];

  for (let i = 0; i < body.data.legislations.length; i++) {
    const item = body.data.legislations[i];
    try {
      const importItem = {
        ...item,
        organizationId: params.data.orgId,
      };
      await db.insert(legislationsTable).values(importItem);
      imported++;
    } catch (err: any) {
      errors++;
      const msg = err?.message || String(err);
      errorDetails.push({ index: i, title: item.title || "(sem título)", error: msg });
      console.error(`[import] Row ${i} "${item.title}" failed:`, msg);
    }
  }

  res.status(201).json({
    imported,
    errors,
    total: body.data.legislations.length,
    errorDetails,
  });
});

router.get("/organizations/:orgId/legislations/:legId", requireAuth, async (req, res): Promise<void> => {
  const params = GetLegislationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [leg] = await db.select().from(legislationsTable)
    .where(and(eq(legislationsTable.id, params.data.legId), eq(legislationsTable.organizationId, params.data.orgId)));

  if (!leg) {
    res.status(404).json({ error: "Legislação não encontrada" });
    return;
  }

  const unitLegs = await db.select({
    ul: unitLegislationsTable,
    unit: unitsTable,
  }).from(unitLegislationsTable)
    .innerJoin(unitsTable, and(eq(unitLegislationsTable.unitId, unitsTable.id), eq(unitsTable.organizationId, params.data.orgId)))
    .where(eq(unitLegislationsTable.legislationId, leg.id));

  res.json({
    ...formatLeg(leg),
    unitLegislations: unitLegs.map(({ ul, unit }) => ({
      id: ul.id,
      unitId: ul.unitId,
      legislationId: ul.legislationId,
      complianceStatus: ul.complianceStatus,
      notes: ul.notes,
      evidenceUrl: ul.evidenceUrl,
      evaluatedAt: ul.evaluatedAt ? ul.evaluatedAt.toISOString() : null,
      createdAt: ul.createdAt.toISOString(),
      updatedAt: ul.updatedAt.toISOString(),
      unit: {
        id: unit.id,
        organizationId: unit.organizationId,
        name: unit.name,
        type: unit.type,
        address: unit.address,
        city: unit.city,
        state: unit.state,
        createdAt: unit.createdAt.toISOString(),
        updatedAt: unit.updatedAt.toISOString(),
      },
    })),
  });
});

router.patch("/organizations/:orgId/legislations/:legId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateLegislationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = UpdateLegislationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData = {
    ...body.data,
  };

  const [leg] = await db.update(legislationsTable)
    .set(updateData)
    .where(and(eq(legislationsTable.id, params.data.legId), eq(legislationsTable.organizationId, params.data.orgId)))
    .returning();

  if (!leg) {
    res.status(404).json({ error: "Legislação não encontrada" });
    return;
  }

  res.json(formatLeg(leg));
});

router.delete("/organizations/:orgId/legislations/:legId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteLegislationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [leg] = await db.delete(legislationsTable)
    .where(and(eq(legislationsTable.id, params.data.legId), eq(legislationsTable.organizationId, params.data.orgId)))
    .returning();

  if (!leg) {
    res.status(404).json({ error: "Legislação não encontrada" });
    return;
  }

  res.sendStatus(204);
});

export default router;
