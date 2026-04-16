import { Router, type IRouter } from "express";
import { eq, and, ilike, sql, inArray } from "drizzle-orm";
import { db, legislationsTable, unitLegislationsTable, unitsTable, unitComplianceTagsTable, type Legislation } from "@workspace/db";
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
import { requireAuth, requireModuleAccess, requireWriteAccess } from "../middlewares/auth";
import { notifyLegislationAdded } from "../lib/legislations";

const router: IRouter = Router();

function normalizePublicationDate(value: string | Date | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 2100) {
    return undefined;
  }

  return date.toISOString().slice(0, 10);
}

function formatLeg(l: Legislation, matchedTags?: string[]) {
  return {
    id: l.id,
    organizationId: l.organizationId,
    title: l.title,
    number: l.number,
    description: l.description,
    tipoNorma: l.tipoNorma,
    emissor: l.emissor,
    level: l.level,
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
    tags: l.tags ?? [],
    matchedTags: matchedTags || null,
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
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [eq(legislationsTable.organizationId, params.data.orgId)];

  if (query.data.search) {
    conditions.push(ilike(legislationsTable.title, `%${query.data.search}%`));
  }
  if (query.data.level) {
    conditions.push(eq(legislationsTable.level, query.data.level));
  }

  const unitIdParam = query.data.unitId;
  let unitTagValues: string[] = [];
  let filteringByUnit = false;

  if (unitIdParam) {
    filteringByUnit = true;
    const unitCheck = await db.select().from(unitsTable).where(and(eq(unitsTable.id, unitIdParam), eq(unitsTable.organizationId, params.data.orgId)));
    if (unitCheck.length === 0) {
      res.status(404).json({ error: "Unidade não encontrada" });
      return;
    }
    const tags = await db.select().from(unitComplianceTagsTable).where(eq(unitComplianceTagsTable.unitId, unitIdParam));
    unitTagValues = tags.map((t) => t.tag.toLowerCase());
    if (unitTagValues.length > 0) {
      conditions.push(sql`(
        SELECT array_agg(lower(t)) FROM unnest(${legislationsTable.tags}) AS t
      ) && array[${sql.join(unitTagValues.map(t => sql`${t}`), sql`, `)}]::text[]`);
    } else {
      res.json([]);
      return;
    }
  }

  const legislations = await db.select().from(legislationsTable)
    .where(and(...conditions))
    .orderBy(legislationsTable.createdAt);

  const unitTagSet = new Set(unitTagValues);

  res.json(legislations.map((l) => {
    if (filteringByUnit && l.tags) {
      const matched = (l.tags as string[]).filter(t => unitTagSet.has(t.toLowerCase()));
      return formatLeg(l, matched);
    }
    return formatLeg(l);
  }));
});

router.post("/organizations/:orgId/legislations", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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
    publicationDate: normalizePublicationDate(body.data.publicationDate),
    organizationId: params.data.orgId,
  };

  const [leg] = await db.insert(legislationsTable).values(insertData).returning();

  notifyLegislationAdded(params.data.orgId, leg).catch((e) =>
    console.error("[legislations] notify error:", e),
  );

  res.status(201).json(formatLeg(leg));
});

router.post("/organizations/:orgId/legislations/import", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

  const conflictStrategy = body.data.conflictStrategy || "skip";

  const existingLegs = await db.select().from(legislationsTable)
    .where(eq(legislationsTable.organizationId, params.data.orgId));

  const existingMap = new Map<string, typeof existingLegs[0]>();
  for (const leg of existingLegs) {
    if (leg.tipoNorma && leg.number) {
      const key = `${leg.tipoNorma.trim().toLowerCase()}::${leg.number.trim().toLowerCase()}`;
      existingMap.set(key, leg);
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const errorDetails: { index: number; title: string; error: string }[] = [];

  for (let i = 0; i < body.data.legislations.length; i++) {
    const item = body.data.legislations[i];
    try {
      const pubDate = normalizePublicationDate(item.publicationDate);

      const tipoNorma = item.tipoNorma?.trim() || null;
      const number = item.number?.trim() || null;
      const dupeKey = tipoNorma && number
        ? `${tipoNorma.toLowerCase()}::${number.toLowerCase()}`
        : null;
      const existing = dupeKey ? existingMap.get(dupeKey) : null;

      if (existing) {
        if (conflictStrategy === "update") {
          const updateData: Record<string, unknown> = {};
          if (item.title) updateData.title = item.title;
          if (item.description) updateData.description = item.description;
          if (item.emissor) updateData.emissor = item.emissor;
          if (item.level) updateData.level = item.level;
          if (item.uf) updateData.uf = item.uf;
          if (item.municipality) updateData.municipality = item.municipality;
          if (item.macrotema) updateData.macrotema = item.macrotema;
          if (item.subtema) updateData.subtema = item.subtema;
          if (item.applicability) updateData.applicability = item.applicability;
          if (pubDate) updateData.publicationDate = pubDate;
          if (item.sourceUrl) updateData.sourceUrl = item.sourceUrl;
          if (item.applicableArticles) updateData.applicableArticles = item.applicableArticles;
          if (item.reviewFrequencyDays) updateData.reviewFrequencyDays = item.reviewFrequencyDays;
          if (item.observations) updateData.observations = item.observations;
          if (item.generalObservations) updateData.generalObservations = item.generalObservations;
          if (item.tags) updateData.tags = item.tags;

          if (Object.keys(updateData).length > 0) {
            await db.update(legislationsTable)
              .set(updateData)
              .where(eq(legislationsTable.id, existing.id));
          }
          updated++;
        } else {
          skipped++;
        }
      } else {
        const importItem = {
          ...item,
          publicationDate: pubDate,
          organizationId: params.data.orgId,
        };
        const [newLeg] = await db.insert(legislationsTable).values(importItem).returning();
        created++;

        if (newLeg) {
          if (dupeKey) existingMap.set(dupeKey, newLeg);
          notifyLegislationAdded(params.data.orgId, newLeg).catch((e) =>
            console.error("[legislations/import] notify error:", e),
          );
        }
      }
    } catch (err: any) {
      errors++;
      const msg = err?.message || String(err);
      errorDetails.push({ index: i, title: item.title || "(sem título)", error: msg });
      console.error(`[import] Row ${i} "${item.title}" failed:`, msg);
    }
  }

  res.status(201).json({
    created,
    updated,
    skipped,
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

router.patch("/organizations/:orgId/legislations/:legId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

  const updateData = { ...body.data };
  const { publicationDate, ...restUpdateData } = updateData;
  const normalizedPublicationDate = normalizePublicationDate(publicationDate);
  const normalizedUpdateData = {
    ...restUpdateData,
    ...(Object.prototype.hasOwnProperty.call(updateData, "publicationDate") &&
    normalizedPublicationDate !== undefined
      ? { publicationDate: normalizedPublicationDate }
      : {}),
  };

  if (Object.keys(updateData).length === 0) {
    const [existing] = await db.select().from(legislationsTable)
      .where(and(eq(legislationsTable.id, params.data.legId), eq(legislationsTable.organizationId, params.data.orgId)));
    if (!existing) {
      res.status(404).json({ error: "Legislação não encontrada" });
      return;
    }
    res.json(formatLeg(existing));
    return;
  }

  const [leg] = await db.update(legislationsTable)
    .set(normalizedUpdateData)
    .where(and(eq(legislationsTable.id, params.data.legId), eq(legislationsTable.organizationId, params.data.orgId)))
    .returning();

  if (!leg) {
    res.status(404).json({ error: "Legislação não encontrada" });
    return;
  }

  res.json(formatLeg(leg));
});

router.delete("/organizations/:orgId/legislations/:legId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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
