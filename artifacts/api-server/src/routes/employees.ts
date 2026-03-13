import { Router, type IRouter } from "express";
import { eq, and, ilike, or, count, sql } from "drizzle-orm";
import {
  db,
  employeesTable,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  employeeAwarenessTable,
  unitsTable,
} from "@workspace/db";
import {
  ListEmployeesParams,
  ListEmployeesQueryParams,
  CreateEmployeeParams,
  CreateEmployeeBody,
  GetEmployeeParams,
  UpdateEmployeeParams,
  UpdateEmployeeBody,
  DeleteEmployeeParams,
  ListCompetenciesParams,
  CreateCompetencyParams,
  CreateCompetencyBody,
  UpdateCompetencyParams,
  UpdateCompetencyBody,
  DeleteCompetencyParams,
  ListTrainingsParams,
  CreateTrainingParams,
  CreateTrainingBody,
  UpdateTrainingParams,
  UpdateTrainingBody,
  DeleteTrainingParams,
  ListAwarenessParams,
  CreateAwarenessParams,
  CreateAwarenessBody,
  UpdateAwarenessParams,
  UpdateAwarenessBody,
  DeleteAwarenessParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function verifyEmployeeOwnership(empId: number, orgId: number): Promise<boolean> {
  const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
    .where(and(eq(employeesTable.id, empId), eq(employeesTable.organizationId, orgId)));
  return !!emp;
}

interface EmployeeRow {
  id: number;
  organizationId: number;
  unitId: number | null;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  contractType: string;
  admissionDate: string | null;
  terminationDate: string | null;
  status: string;
  unitName?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function formatEmployee(e: EmployeeRow) {
  return {
    id: e.id,
    organizationId: e.organizationId,
    unitId: e.unitId,
    name: e.name,
    cpf: e.cpf,
    email: e.email,
    phone: e.phone,
    position: e.position,
    department: e.department,
    contractType: e.contractType,
    admissionDate: e.admissionDate,
    terminationDate: e.terminationDate,
    status: e.status,
    unitName: e.unitName || null,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
  };
}

router.get("/organizations/:orgId/employees", requireAuth, async (req, res): Promise<void> => {
  const params = ListEmployeesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const query = ListEmployeesQueryParams.safeParse(req.query);
  const conditions = [eq(employeesTable.organizationId, params.data.orgId)];

  if (query.success && query.data.search) {
    const s = `%${query.data.search}%`;
    conditions.push(or(ilike(employeesTable.name, s), ilike(employeesTable.cpf, s))!);
  }
  if (query.success && query.data.unitId) {
    conditions.push(eq(employeesTable.unitId, query.data.unitId));
  }
  if (query.success && query.data.position) {
    conditions.push(eq(employeesTable.position, query.data.position));
  }
  if (query.success && query.data.status) {
    conditions.push(eq(employeesTable.status, query.data.status));
  }

  const page = (query.success && query.data.page) || 1;
  const pageSize = (query.success && query.data.pageSize) || 25;
  const offset = (page - 1) * pageSize;

  const whereClause = and(...conditions);

  const [totalResult] = await db
    .select({ total: count() })
    .from(employeesTable)
    .where(whereClause);

  const rows = await db
    .select({
      id: employeesTable.id,
      organizationId: employeesTable.organizationId,
      unitId: employeesTable.unitId,
      name: employeesTable.name,
      cpf: employeesTable.cpf,
      email: employeesTable.email,
      phone: employeesTable.phone,
      position: employeesTable.position,
      department: employeesTable.department,
      contractType: employeesTable.contractType,
      admissionDate: employeesTable.admissionDate,
      terminationDate: employeesTable.terminationDate,
      status: employeesTable.status,
      createdAt: employeesTable.createdAt,
      updatedAt: employeesTable.updatedAt,
      unitName: unitsTable.name,
    })
    .from(employeesTable)
    .leftJoin(unitsTable, eq(employeesTable.unitId, unitsTable.id))
    .where(whereClause)
    .orderBy(employeesTable.name)
    .limit(pageSize)
    .offset(offset);

  res.json({
    data: rows.map(formatEmployee),
    pagination: {
      page,
      pageSize,
      total: totalResult.total,
      totalPages: Math.ceil(totalResult.total / pageSize),
    },
  });
});

router.post("/organizations/:orgId/employees", requireAuth, async (req, res): Promise<void> => {
  const params = CreateEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateEmployeeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  if (body.data.unitId) {
    const [unit] = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(and(eq(unitsTable.id, body.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));
    if (!unit) { res.status(400).json({ error: "Unidade não pertence a esta organização" }); return; }
  }

  const [emp] = await db.insert(employeesTable).values({
    ...body.data,
    organizationId: params.data.orgId,
  }).returning();

  res.status(201).json(formatEmployee(emp));
});

router.get("/organizations/:orgId/employees/:empId", requireAuth, async (req, res): Promise<void> => {
  const params = GetEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const rows = await db
    .select({
      id: employeesTable.id,
      organizationId: employeesTable.organizationId,
      unitId: employeesTable.unitId,
      name: employeesTable.name,
      cpf: employeesTable.cpf,
      email: employeesTable.email,
      phone: employeesTable.phone,
      position: employeesTable.position,
      department: employeesTable.department,
      contractType: employeesTable.contractType,
      admissionDate: employeesTable.admissionDate,
      terminationDate: employeesTable.terminationDate,
      status: employeesTable.status,
      createdAt: employeesTable.createdAt,
      updatedAt: employeesTable.updatedAt,
      unitName: unitsTable.name,
    })
    .from(employeesTable)
    .leftJoin(unitsTable, eq(employeesTable.unitId, unitsTable.id))
    .where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)));

  if (rows.length === 0) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const competencies = await db.select().from(employeeCompetenciesTable).where(eq(employeeCompetenciesTable.employeeId, params.data.empId)).orderBy(employeeCompetenciesTable.name);
  const trainings = await db.select().from(employeeTrainingsTable).where(eq(employeeTrainingsTable.employeeId, params.data.empId)).orderBy(employeeTrainingsTable.createdAt);
  const awareness = await db.select().from(employeeAwarenessTable).where(eq(employeeAwarenessTable.employeeId, params.data.empId)).orderBy(employeeAwarenessTable.date);

  res.json({
    ...formatEmployee(rows[0]),
    competencies: competencies.map(c => ({
      ...c,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    })),
    trainings: trainings.map(t => {
      let effectiveStatus = t.status;
      if (t.expirationDate && t.status === "completed") {
        const expDate = new Date(t.expirationDate);
        if (expDate < new Date()) {
          effectiveStatus = "expired";
        }
      }
      return {
        ...t,
        status: effectiveStatus,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
      };
    }),
    awareness: awareness.map(a => ({
      ...a,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : a.updatedAt,
    })),
  });
});

router.patch("/organizations/:orgId/employees/:empId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateEmployeeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  if (body.data.unitId) {
    const [unit] = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(and(eq(unitsTable.id, body.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));
    if (!unit) { res.status(400).json({ error: "Unidade não pertence a esta organização" }); return; }
  }

  const [emp] = await db.update(employeesTable)
    .set(body.data)
    .where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)))
    .returning();

  if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }
  res.json(formatEmployee(emp));
});

router.delete("/organizations/:orgId/employees/:empId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [emp] = await db.update(employeesTable)
    .set({ status: "inactive", terminationDate: new Date().toISOString().split("T")[0] })
    .where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)))
    .returning();

  if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }
  res.sendStatus(204);
});

router.get("/organizations/:orgId/employees/:empId/competencies", requireAuth, async (req, res): Promise<void> => {
  const params = ListCompetenciesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [emp] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)));
  if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const rows = await db.select().from(employeeCompetenciesTable).where(eq(employeeCompetenciesTable.employeeId, params.data.empId)).orderBy(employeeCompetenciesTable.name);
  res.json(rows);
});

router.post("/organizations/:orgId/employees/:empId/competencies", requireAuth, async (req, res): Promise<void> => {
  const params = CreateCompetencyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [emp] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)));
  if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const body = CreateCompetencyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [comp] = await db.insert(employeeCompetenciesTable).values({
    ...body.data,
    employeeId: params.data.empId,
  }).returning();

  res.status(201).json(comp);
});

router.patch("/organizations/:orgId/employees/:empId/competencies/:compId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCompetencyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const body = UpdateCompetencyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [comp] = await db.update(employeeCompetenciesTable)
    .set(body.data)
    .where(and(eq(employeeCompetenciesTable.id, params.data.compId), eq(employeeCompetenciesTable.employeeId, params.data.empId)))
    .returning();

  if (!comp) { res.status(404).json({ error: "Competência não encontrada" }); return; }
  res.json(comp);
});

router.delete("/organizations/:orgId/employees/:empId/competencies/:compId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCompetencyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const [comp] = await db.delete(employeeCompetenciesTable)
    .where(and(eq(employeeCompetenciesTable.id, params.data.compId), eq(employeeCompetenciesTable.employeeId, params.data.empId)))
    .returning();

  if (!comp) { res.status(404).json({ error: "Competência não encontrada" }); return; }
  res.sendStatus(204);
});

router.get("/organizations/:orgId/employees/:empId/trainings", requireAuth, async (req, res): Promise<void> => {
  const params = ListTrainingsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [emp] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)));
  if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const rows = await db.select().from(employeeTrainingsTable).where(eq(employeeTrainingsTable.employeeId, params.data.empId)).orderBy(employeeTrainingsTable.createdAt);
  res.json(rows);
});

router.post("/organizations/:orgId/employees/:empId/trainings", requireAuth, async (req, res): Promise<void> => {
  const params = CreateTrainingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [emp] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)));
  if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const body = CreateTrainingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [training] = await db.insert(employeeTrainingsTable).values({
    ...body.data,
    employeeId: params.data.empId,
  }).returning();

  res.status(201).json(training);
});

router.patch("/organizations/:orgId/employees/:empId/trainings/:trainId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTrainingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const body = UpdateTrainingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [training] = await db.update(employeeTrainingsTable)
    .set(body.data)
    .where(and(eq(employeeTrainingsTable.id, params.data.trainId), eq(employeeTrainingsTable.employeeId, params.data.empId)))
    .returning();

  if (!training) { res.status(404).json({ error: "Treinamento não encontrado" }); return; }
  res.json(training);
});

router.delete("/organizations/:orgId/employees/:empId/trainings/:trainId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTrainingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const [training] = await db.delete(employeeTrainingsTable)
    .where(and(eq(employeeTrainingsTable.id, params.data.trainId), eq(employeeTrainingsTable.employeeId, params.data.empId)))
    .returning();

  if (!training) { res.status(404).json({ error: "Treinamento não encontrado" }); return; }
  res.sendStatus(204);
});

router.get("/organizations/:orgId/employees/:empId/awareness", requireAuth, async (req, res): Promise<void> => {
  const params = ListAwarenessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [emp] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)));
  if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const rows = await db.select().from(employeeAwarenessTable).where(eq(employeeAwarenessTable.employeeId, params.data.empId)).orderBy(employeeAwarenessTable.date);
  res.json(rows);
});

router.post("/organizations/:orgId/employees/:empId/awareness", requireAuth, async (req, res): Promise<void> => {
  const params = CreateAwarenessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [emp] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)));
  if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const body = CreateAwarenessBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [record] = await db.insert(employeeAwarenessTable).values({
    ...body.data,
    employeeId: params.data.empId,
  }).returning();

  res.status(201).json(record);
});

router.patch("/organizations/:orgId/employees/:empId/awareness/:awaId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateAwarenessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const body = UpdateAwarenessBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [record] = await db.update(employeeAwarenessTable)
    .set(body.data)
    .where(and(eq(employeeAwarenessTable.id, params.data.awaId), eq(employeeAwarenessTable.employeeId, params.data.empId)))
    .returning();

  if (!record) { res.status(404).json({ error: "Registro não encontrado" }); return; }
  res.json(record);
});

router.delete("/organizations/:orgId/employees/:empId/awareness/:awaId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteAwarenessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const [record] = await db.delete(employeeAwarenessTable)
    .where(and(eq(employeeAwarenessTable.id, params.data.awaId), eq(employeeAwarenessTable.employeeId, params.data.empId)))
    .returning();

  if (!record) { res.status(404).json({ error: "Registro não encontrado" }); return; }
  res.sendStatus(204);
});

export default router;
