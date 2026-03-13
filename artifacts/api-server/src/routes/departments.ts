import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, departmentsTable, positionsTable } from "@workspace/db";
import {
  ListDepartmentsParams,
  CreateDepartmentParams,
  CreateDepartmentBody,
  UpdateDepartmentParams,
  UpdateDepartmentBody,
  DeleteDepartmentParams,
  ListPositionsParams,
  CreatePositionParams,
  CreatePositionBody,
  UpdatePositionParams,
  UpdatePositionBody,
  DeletePositionParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/organizations/:orgId/departments", requireAuth, async (req, res): Promise<void> => {
  const params = ListDepartmentsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const rows = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.organizationId, params.data.orgId))
    .orderBy(departmentsTable.name);

  res.json(rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

router.post("/organizations/:orgId/departments", requireAuth, async (req, res): Promise<void> => {
  const params = CreateDepartmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateDepartmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.insert(departmentsTable).values({
    organizationId: params.data.orgId,
    name: body.data.name,
    description: body.data.description,
  }).returning();

  res.status(201).json({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.patch("/organizations/:orgId/departments/:deptId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateDepartmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateDepartmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.update(departmentsTable)
    .set(body.data)
    .where(and(eq(departmentsTable.id, params.data.deptId), eq(departmentsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Departamento não encontrado" }); return; }

  res.json({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.delete("/organizations/:orgId/departments/:deptId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteDepartmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [row] = await db.delete(departmentsTable)
    .where(and(eq(departmentsTable.id, params.data.deptId), eq(departmentsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Departamento não encontrado" }); return; }
  res.status(204).send();
});

router.get("/organizations/:orgId/positions", requireAuth, async (req, res): Promise<void> => {
  const params = ListPositionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const rows = await db.select().from(positionsTable)
    .where(eq(positionsTable.organizationId, params.data.orgId))
    .orderBy(positionsTable.name);

  res.json(rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

router.post("/organizations/:orgId/positions", requireAuth, async (req, res): Promise<void> => {
  const params = CreatePositionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreatePositionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.insert(positionsTable).values({
    organizationId: params.data.orgId,
    name: body.data.name,
    description: body.data.description,
  }).returning();

  res.status(201).json({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.patch("/organizations/:orgId/positions/:posId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdatePositionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdatePositionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.update(positionsTable)
    .set(body.data)
    .where(and(eq(positionsTable.id, params.data.posId), eq(positionsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Cargo não encontrado" }); return; }

  res.json({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.delete("/organizations/:orgId/positions/:posId", requireAuth, async (req, res): Promise<void> => {
  const params = DeletePositionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [row] = await db.delete(positionsTable)
    .where(and(eq(positionsTable.id, params.data.posId), eq(positionsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Cargo não encontrado" }); return; }
  res.status(204).send();
});

export default router;
