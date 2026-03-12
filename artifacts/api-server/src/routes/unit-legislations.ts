import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, unitLegislationsTable, unitsTable, legislationsTable } from "@workspace/db";
import {
  ListLegislationUnitsParams,
  AssignLegislationToUnitParams,
  AssignLegislationToUnitBody,
  UpdateUnitLegislationParams,
  UpdateUnitLegislationBody,
  RemoveUnitLegislationParams,
  ListUnitLegislationsParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/organizations/:orgId/legislations/:legId/units", requireAuth, async (req, res): Promise<void> => {
  const params = ListLegislationUnitsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [leg] = await db.select({ id: legislationsTable.id }).from(legislationsTable)
    .where(and(eq(legislationsTable.id, params.data.legId), eq(legislationsTable.organizationId, params.data.orgId)));

  if (!leg) {
    res.status(404).json({ error: "Legislação não encontrada" });
    return;
  }

  const results = await db.select({
    ul: unitLegislationsTable,
    unit: unitsTable,
  }).from(unitLegislationsTable)
    .innerJoin(unitsTable, and(eq(unitLegislationsTable.unitId, unitsTable.id), eq(unitsTable.organizationId, params.data.orgId)))
    .where(eq(unitLegislationsTable.legislationId, params.data.legId));

  res.json(results.map(({ ul, unit }) => ({
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
  })));
});

router.post("/organizations/:orgId/legislations/:legId/units", requireAuth, async (req, res): Promise<void> => {
  const params = AssignLegislationToUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = AssignLegislationToUnitBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [leg] = await db.select({ id: legislationsTable.id }).from(legislationsTable)
    .where(and(eq(legislationsTable.id, params.data.legId), eq(legislationsTable.organizationId, params.data.orgId)));

  if (!leg) {
    res.status(404).json({ error: "Legislação não encontrada" });
    return;
  }

  const [unit] = await db.select().from(unitsTable)
    .where(and(eq(unitsTable.id, body.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));

  if (!unit) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const [ul] = await db.insert(unitLegislationsTable).values({
    unitId: body.data.unitId,
    legislationId: params.data.legId,
    complianceStatus: body.data.complianceStatus || "nao_avaliado",
    notes: body.data.notes || null,
  }).returning();

  res.status(201).json({
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
  });
});

router.patch("/organizations/:orgId/legislations/:legId/units/:unitId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateUnitLegislationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = UpdateUnitLegislationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [leg] = await db.select({ id: legislationsTable.id }).from(legislationsTable)
    .where(and(eq(legislationsTable.id, params.data.legId), eq(legislationsTable.organizationId, params.data.orgId)));

  if (!leg) {
    res.status(404).json({ error: "Legislação não encontrada" });
    return;
  }

  const [ownerUnit] = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(and(eq(unitsTable.id, params.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));

  if (!ownerUnit) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const updateData: Record<string, unknown> = { ...body.data };
  if (body.data.complianceStatus) {
    updateData.evaluatedAt = new Date();
  }

  const [ul] = await db.update(unitLegislationsTable)
    .set(updateData)
    .where(and(
      eq(unitLegislationsTable.legislationId, params.data.legId),
      eq(unitLegislationsTable.unitId, params.data.unitId),
    ))
    .returning();

  if (!ul) {
    res.status(404).json({ error: "Vínculo não encontrado" });
    return;
  }

  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, ul.unitId));

  res.json({
    id: ul.id,
    unitId: ul.unitId,
    legislationId: ul.legislationId,
    complianceStatus: ul.complianceStatus,
    notes: ul.notes,
    evidenceUrl: ul.evidenceUrl,
    evaluatedAt: ul.evaluatedAt ? ul.evaluatedAt.toISOString() : null,
    createdAt: ul.createdAt.toISOString(),
    updatedAt: ul.updatedAt.toISOString(),
    unit: unit ? {
      id: unit.id,
      organizationId: unit.organizationId,
      name: unit.name,
      type: unit.type,
      address: unit.address,
      city: unit.city,
      state: unit.state,
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
    } : null,
  });
});

router.delete("/organizations/:orgId/legislations/:legId/units/:unitId", requireAuth, async (req, res): Promise<void> => {
  const params = RemoveUnitLegislationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [leg] = await db.select({ id: legislationsTable.id }).from(legislationsTable)
    .where(and(eq(legislationsTable.id, params.data.legId), eq(legislationsTable.organizationId, params.data.orgId)));

  if (!leg) {
    res.status(404).json({ error: "Legislação não encontrada" });
    return;
  }

  const [ownerUnit] = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(and(eq(unitsTable.id, params.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));

  if (!ownerUnit) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const [ul] = await db.delete(unitLegislationsTable)
    .where(and(
      eq(unitLegislationsTable.legislationId, params.data.legId),
      eq(unitLegislationsTable.unitId, params.data.unitId),
    ))
    .returning();

  if (!ul) {
    res.status(404).json({ error: "Vínculo não encontrado" });
    return;
  }

  res.sendStatus(204);
});

router.get("/organizations/:orgId/units/:unitId/legislations", requireAuth, async (req, res): Promise<void> => {
  const params = ListUnitLegislationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [ownerUnit] = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(and(eq(unitsTable.id, params.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));

  if (!ownerUnit) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const results = await db.select({
    ul: unitLegislationsTable,
    legislation: legislationsTable,
  }).from(unitLegislationsTable)
    .innerJoin(legislationsTable, and(eq(unitLegislationsTable.legislationId, legislationsTable.id), eq(legislationsTable.organizationId, params.data.orgId)))
    .where(eq(unitLegislationsTable.unitId, params.data.unitId));

  res.json(results.map(({ ul, legislation }) => ({
    id: ul.id,
    unitId: ul.unitId,
    legislationId: ul.legislationId,
    complianceStatus: ul.complianceStatus,
    notes: ul.notes,
    evidenceUrl: ul.evidenceUrl,
    evaluatedAt: ul.evaluatedAt ? ul.evaluatedAt.toISOString() : null,
    createdAt: ul.createdAt.toISOString(),
    updatedAt: ul.updatedAt.toISOString(),
    legislation: {
      id: legislation.id,
      organizationId: legislation.organizationId,
      title: legislation.title,
      number: legislation.number,
      description: legislation.description,
      level: legislation.level,
      status: legislation.status,
      publicationDate: legislation.publicationDate,
      sourceUrl: legislation.sourceUrl,
      applicableArticles: legislation.applicableArticles,
      createdAt: legislation.createdAt.toISOString(),
      updatedAt: legislation.updatedAt.toISOString(),
    },
  })));
});

export default router;
