import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, departmentsTable, departmentUnitsTable, unitsTable } from "@workspace/db";
import {
  ListDepartmentsParams,
  CreateDepartmentParams,
  CreateDepartmentBody,
  UpdateDepartmentParams,
  UpdateDepartmentBody,
  DeleteDepartmentParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/organizations/:orgId/departments", requireAuth, async (req, res): Promise<void> => {
  const params = ListDepartmentsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const rows = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.organizationId, params.data.orgId))
    .orderBy(departmentsTable.name);

  const deptIds = rows.map(r => r.id);
  const links = deptIds.length > 0
    ? await db.select().from(departmentUnitsTable)
        .where(inArray(departmentUnitsTable.departmentId, deptIds))
    : [];

  const unitIdsByDept = new Map<number, number[]>();
  for (const link of links) {
    const arr = unitIdsByDept.get(link.departmentId) || [];
    arr.push(link.unitId);
    unitIdsByDept.set(link.departmentId, arr);
  }

  res.json(rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    description: r.description,
    unitIds: unitIdsByDept.get(r.id) || [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

router.post("/organizations/:orgId/departments", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateDepartmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateDepartmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const unitIds = body.data.unitIds || [];

  if (unitIds.length > 0) {
    const validUnits = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(and(eq(unitsTable.organizationId, params.data.orgId), inArray(unitsTable.id, unitIds)));
    if (validUnits.length !== unitIds.length) {
      res.status(400).json({ error: "Uma ou mais unidades não pertencem à organização" });
      return;
    }
  }

  const result = await db.transaction(async (tx) => {
    const [row] = await tx.insert(departmentsTable).values({
      organizationId: params.data.orgId,
      name: body.data.name,
      description: body.data.description,
    }).returning();

    if (unitIds.length > 0) {
      await tx.insert(departmentUnitsTable).values(
        unitIds.map((unitId) => ({ departmentId: row.id, unitId })),
      );
    }

    return row;
  });

  res.status(201).json({
    id: result.id,
    organizationId: result.organizationId,
    name: result.name,
    description: result.description,
    unitIds,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  });
});

router.patch("/organizations/:orgId/departments/:deptId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateDepartmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateDepartmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const unitIds = body.data.unitIds;

  if (unitIds && unitIds.length > 0) {
    const validUnits = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(and(eq(unitsTable.organizationId, params.data.orgId), inArray(unitsTable.id, unitIds)));
    if (validUnits.length !== unitIds.length) {
      res.status(400).json({ error: "Uma ou mais unidades não pertencem à organização" });
      return;
    }
  }

  const result = await db.transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};
    if (body.data.name !== undefined) updateData.name = body.data.name;
    if (body.data.description !== undefined) updateData.description = body.data.description;

    const [row] = await tx.update(departmentsTable)
      .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
      .where(and(eq(departmentsTable.id, params.data.deptId), eq(departmentsTable.organizationId, params.data.orgId)))
      .returning();

    if (!row) return null;

    if (unitIds !== undefined) {
      await tx.delete(departmentUnitsTable)
        .where(eq(departmentUnitsTable.departmentId, row.id));

      if (unitIds.length > 0) {
        await tx.insert(departmentUnitsTable).values(
          unitIds.map((unitId) => ({ departmentId: row.id, unitId })),
        );
      }
    }

    return row;
  });

  if (!result) { res.status(404).json({ error: "Departamento não encontrado" }); return; }

  const links = await db.select({ unitId: departmentUnitsTable.unitId })
    .from(departmentUnitsTable)
    .where(eq(departmentUnitsTable.departmentId, result.id));

  res.json({
    id: result.id,
    organizationId: result.organizationId,
    name: result.name,
    description: result.description,
    unitIds: links.map(l => l.unitId),
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  });
});

router.delete("/organizations/:orgId/departments/:deptId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteDepartmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [row] = await db.delete(departmentsTable)
    .where(and(eq(departmentsTable.id, params.data.deptId), eq(departmentsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Departamento não encontrado" }); return; }
  res.status(204).send();
});

export default router;
