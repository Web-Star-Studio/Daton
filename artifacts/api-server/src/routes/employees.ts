import { Router, type IRouter } from "express";
import { eq, and, ilike, or, count, sql, exists, inArray } from "drizzle-orm";
import {
  db,
  departmentsTable,
  employeesTable,
  employeeProfileItemsTable,
  employeeProfileItemAttachmentsTable,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  employeeAwarenessTable,
  employeeUnitsTable,
  positionsTable,
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
  CreateEmployeeProfileItemParams,
  CreateEmployeeProfileItemBody,
  UpdateEmployeeProfileItemParams,
  UpdateEmployeeProfileItemBody,
  DeleteEmployeeProfileItemParams,
  AddEmployeeProfileItemAttachmentParams,
  AddEmployeeProfileItemAttachmentBody,
  DeleteEmployeeProfileItemAttachmentParams,
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
  LinkEmployeeUnitParams,
  LinkEmployeeUnitBody,
  UnlinkEmployeeUnitParams,
} from "@workspace/api-zod";
import { requireAuth, requireModuleAccess, requireWriteAccess } from "../middlewares/auth";

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

function deriveTrainingStatus(status: string, expirationDate: string | null): string {
  if (expirationDate) {
    const expDate = new Date(expirationDate);
    if (expDate < new Date()) {
      return "vencido";
    }
  }
  return status;
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

const EMPLOYEE_REQUIRED_FIELD_LABELS = {
  name: "Nome completo",
  cpf: "CPF",
  admissionDate: "Data de admissão",
} as const;

const EMPLOYEE_TEXT_FIELDS = [
  "name",
  "cpf",
  "email",
  "phone",
  "position",
  "department",
  "admissionDate",
  "terminationDate",
] as const;

type ProfileItemCategory = "professional_experience" | "education_certification";

type ProfileItemAttachmentInput = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

type ProfileItemInput = {
  title: string;
  description?: string | null;
  attachments?: ProfileItemAttachmentInput[];
};

type ProfileItemRow = {
  id: number;
  employeeId: number;
  category: string;
  title: string;
  description: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ProfileItemAttachmentRow = {
  id: number;
  itemId: number;
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
  uploadedAt: Date | string;
};

function sanitizeEmployeePayload(payload: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = { ...payload };

  for (const field of EMPLOYEE_TEXT_FIELDS) {
    if (!(field in sanitized)) continue;

    const value = sanitized[field];
    if (typeof value !== "string") continue;

    const trimmedValue = value.trim();
    if (trimmedValue.length === 0 && !Object.hasOwn(EMPLOYEE_REQUIRED_FIELD_LABELS, field)) {
      delete sanitized[field];
      continue;
    }

    sanitized[field] = trimmedValue;
  }

  return sanitized;
}

function getInvalidRequiredEmployeeFields(
  payload: Record<string, unknown>,
  options: { requireAllFields: boolean },
): string[] {
  return (Object.entries(EMPLOYEE_REQUIRED_FIELD_LABELS) as Array<
    [keyof typeof EMPLOYEE_REQUIRED_FIELD_LABELS, string]
  >)
    .filter(([field]) => {
      if (!(field in payload)) return options.requireAllFields;

      const value = payload[field];
      if (value == null) return true;
      if (typeof value === "string") return value.trim().length === 0;
      return false;
    })
    .map(([, label]) => label);
}

async function verifyProfileItemOwnership(itemId: number, empId: number): Promise<boolean> {
  const [item] = await db
    .select({ id: employeeProfileItemsTable.id })
    .from(employeeProfileItemsTable)
    .where(and(eq(employeeProfileItemsTable.id, itemId), eq(employeeProfileItemsTable.employeeId, empId)));

  return !!item;
}

async function validateEmployeeReferenceValues(
  orgId: number,
  payload: {
    department?: string | null;
    position?: string | null;
  },
): Promise<string | null> {
  if (payload.department) {
    const [department] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(and(eq(departmentsTable.organizationId, orgId), eq(departmentsTable.name, payload.department)));

    if (!department) {
      return "Departamento não pertence a esta organização";
    }
  }

  if (payload.position) {
    const [position] = await db
      .select({ id: positionsTable.id })
      .from(positionsTable)
      .where(and(eq(positionsTable.organizationId, orgId), eq(positionsTable.name, payload.position)));

    if (!position) {
      return "Cargo não pertence a esta organização";
    }
  }

  return null;
}

function sanitizeProfileItemInput<T extends ProfileItemInput>(item: T): T {
  return {
    ...item,
    title: item.title.trim(),
    description: item.description?.trim() || undefined,
    attachments: item.attachments?.map((attachment) => ({
      ...attachment,
      fileName: attachment.fileName.trim(),
      contentType: attachment.contentType.trim(),
      objectPath: attachment.objectPath.trim(),
    })),
  };
}

function formatProfileItemAttachment(attachment: ProfileItemAttachmentRow) {
  return {
    id: attachment.id,
    itemId: attachment.itemId,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    contentType: attachment.contentType,
    objectPath: attachment.objectPath,
    uploadedAt: attachment.uploadedAt instanceof Date ? attachment.uploadedAt.toISOString() : attachment.uploadedAt,
  };
}

function formatProfileItem(
  item: ProfileItemRow,
  attachmentsByItemId: Map<number, ProfileItemAttachmentRow[]>,
) {
  return {
    id: item.id,
    employeeId: item.employeeId,
    category: item.category,
    title: item.title,
    description: item.description,
    attachments: (attachmentsByItemId.get(item.id) || []).map(formatProfileItemAttachment),
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
  };
}

async function loadEmployeeProfileItems(empId: number) {
  const itemRows = await db
    .select({
      id: employeeProfileItemsTable.id,
      employeeId: employeeProfileItemsTable.employeeId,
      category: employeeProfileItemsTable.category,
      title: employeeProfileItemsTable.title,
      description: employeeProfileItemsTable.description,
      createdAt: employeeProfileItemsTable.createdAt,
      updatedAt: employeeProfileItemsTable.updatedAt,
    })
    .from(employeeProfileItemsTable)
    .where(eq(employeeProfileItemsTable.employeeId, empId))
    .orderBy(employeeProfileItemsTable.createdAt);

  const itemIds = itemRows.map((item) => item.id);
  const attachmentRows = itemIds.length === 0
    ? []
    : await db
      .select({
        id: employeeProfileItemAttachmentsTable.id,
        itemId: employeeProfileItemAttachmentsTable.itemId,
        fileName: employeeProfileItemAttachmentsTable.fileName,
        fileSize: employeeProfileItemAttachmentsTable.fileSize,
        contentType: employeeProfileItemAttachmentsTable.contentType,
        objectPath: employeeProfileItemAttachmentsTable.objectPath,
        uploadedAt: employeeProfileItemAttachmentsTable.uploadedAt,
      })
      .from(employeeProfileItemAttachmentsTable)
      .where(inArray(employeeProfileItemAttachmentsTable.itemId, itemIds))
      .orderBy(employeeProfileItemAttachmentsTable.uploadedAt);

  const attachmentsByItemId = new Map<number, ProfileItemAttachmentRow[]>();
  for (const attachment of attachmentRows) {
    const entries = attachmentsByItemId.get(attachment.itemId) || [];
    entries.push(attachment);
    attachmentsByItemId.set(attachment.itemId, entries);
  }

  const formattedItems = itemRows.map((item) => formatProfileItem(item, attachmentsByItemId));

  return {
    professionalExperiences: formattedItems.filter((item) => item.category === "professional_experience"),
    educationCertifications: formattedItems.filter((item) => item.category === "education_certification"),
  };
}

async function createEmployeeProfileItems(
  executor: any,
  employeeId: number,
  items: ProfileItemInput[] | undefined,
  category: ProfileItemCategory,
) {
  if (!items?.length) return;

  for (const rawItem of items) {
    const item = sanitizeProfileItemInput(rawItem);
    const [createdItem] = await executor
      .insert(employeeProfileItemsTable)
      .values({
        employeeId,
        category,
        title: item.title,
        description: item.description || null,
      })
      .returning();

    if (item.attachments?.length) {
      await executor.insert(employeeProfileItemAttachmentsTable).values(
        item.attachments.map((attachment) => ({
          itemId: createdItem.id,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          contentType: attachment.contentType,
          objectPath: attachment.objectPath,
        })),
      );
    }
  }
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
    const targetUnitId = query.data.unitId;
    conditions.push(
      or(
        eq(employeesTable.unitId, targetUnitId),
        exists(
          db.select({ id: employeeUnitsTable.id })
            .from(employeeUnitsTable)
            .where(and(
              eq(employeeUnitsTable.employeeId, employeesTable.id),
              eq(employeeUnitsTable.unitId, targetUnitId)
            ))
        )
      )!
    );
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

router.post("/organizations/:orgId/employees", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateEmployeeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const payload = sanitizeEmployeePayload(body.data) as typeof body.data;
  const invalidRequiredFields = getInvalidRequiredEmployeeFields(payload, { requireAllFields: true });
  if (invalidRequiredFields.length > 0) {
    res.status(400).json({ error: `${invalidRequiredFields.join(", ")} ${invalidRequiredFields.length > 1 ? "são obrigatórios" : "é obrigatório"}` });
    return;
  }

  const {
    professionalExperiences,
    educationCertifications,
    ...employeePayload
  } = payload;

  if (employeePayload.unitId) {
    const [unit] = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(and(eq(unitsTable.id, employeePayload.unitId), eq(unitsTable.organizationId, params.data.orgId)));
    if (!unit) { res.status(400).json({ error: "Unidade não pertence a esta organização" }); return; }
  }

  const referenceValueError = await validateEmployeeReferenceValues(params.data.orgId, employeePayload);
  if (referenceValueError) { res.status(400).json({ error: referenceValueError }); return; }

  const emp = await db.transaction(async (tx) => {
    const [createdEmployee] = await tx.insert(employeesTable).values({
      ...employeePayload,
      organizationId: params.data.orgId,
    }).returning();

    await createEmployeeProfileItems(tx, createdEmployee.id, professionalExperiences, "professional_experience");
    await createEmployeeProfileItems(tx, createdEmployee.id, educationCertifications, "education_certification");

    return createdEmployee;
  });

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
  const profileItems = await loadEmployeeProfileItems(params.data.empId);
  const linkedUnits = await db.select({ id: unitsTable.id, name: unitsTable.name })
    .from(employeeUnitsTable)
    .innerJoin(unitsTable, eq(employeeUnitsTable.unitId, unitsTable.id))
    .where(eq(employeeUnitsTable.employeeId, params.data.empId));

  res.json({
    ...formatEmployee(rows[0]),
    units: linkedUnits,
    competencies: competencies.map(c => ({
      ...c,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    })),
    trainings: trainings.map(t => ({
      ...t,
      status: deriveTrainingStatus(t.status, t.expirationDate),
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
    })),
    awareness: awareness.map(a => ({
      ...a,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : a.updatedAt,
    })),
    professionalExperiences: profileItems.professionalExperiences,
    educationCertifications: profileItems.educationCertifications,
  });
});

router.patch("/organizations/:orgId/employees/:empId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateEmployeeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const payload = sanitizeEmployeePayload(body.data) as typeof body.data;
  const invalidRequiredFields = getInvalidRequiredEmployeeFields(payload, { requireAllFields: false });
  if (invalidRequiredFields.length > 0) {
    res.status(400).json({ error: `${invalidRequiredFields.join(", ")} ${invalidRequiredFields.length > 1 ? "são obrigatórios" : "é obrigatório"}` });
    return;
  }

  if (payload.unitId) {
    const [unit] = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(and(eq(unitsTable.id, payload.unitId), eq(unitsTable.organizationId, params.data.orgId)));
    if (!unit) { res.status(400).json({ error: "Unidade não pertence a esta organização" }); return; }
  }

  const referenceValueError = await validateEmployeeReferenceValues(params.data.orgId, payload);
  if (referenceValueError) { res.status(400).json({ error: referenceValueError }); return; }

  const [emp] = await db.update(employeesTable)
    .set(payload)
    .where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)))
    .returning();

  if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }
  res.json(formatEmployee(emp));
});

router.delete("/organizations/:orgId/employees/:empId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

router.post("/organizations/:orgId/employees/:empId/competencies", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

router.patch("/organizations/:orgId/employees/:empId/competencies/:compId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

router.delete("/organizations/:orgId/employees/:empId/competencies/:compId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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
  res.json(rows.map(t => ({
    ...t,
    status: deriveTrainingStatus(t.status, t.expirationDate),
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  })));
});

router.post("/organizations/:orgId/employees/:empId/trainings", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

router.patch("/organizations/:orgId/employees/:empId/trainings/:trainId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

router.delete("/organizations/:orgId/employees/:empId/trainings/:trainId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

router.post("/organizations/:orgId/employees/:empId/awareness", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

router.patch("/organizations/:orgId/employees/:empId/awareness/:awaId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

router.delete("/organizations/:orgId/employees/:empId/awareness/:awaId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
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

router.post("/organizations/:orgId/employees/:empId/profile-items", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = CreateEmployeeProfileItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const body = CreateEmployeeProfileItemBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const item = sanitizeProfileItemInput(body.data);
  const [createdItem] = await db.insert(employeeProfileItemsTable).values({
    employeeId: params.data.empId,
    category: item.category,
    title: item.title,
    description: item.description || null,
  }).returning();

  if (item.attachments?.length) {
    await db.insert(employeeProfileItemAttachmentsTable).values(
      item.attachments.map((attachment) => ({
        itemId: createdItem.id,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        contentType: attachment.contentType,
        objectPath: attachment.objectPath,
      })),
    );
  }

  const profileItems = await loadEmployeeProfileItems(params.data.empId);
  const createdProfileItem = [...profileItems.professionalExperiences, ...profileItems.educationCertifications]
    .find((profileItem) => profileItem.id === createdItem.id);

  if (!createdProfileItem) { res.status(500).json({ error: "Falha ao carregar item criado" }); return; }
  res.status(201).json(createdProfileItem);
});

router.patch("/organizations/:orgId/employees/:empId/profile-items/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UpdateEmployeeProfileItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyProfileItemOwnership(params.data.itemId, params.data.empId))) { res.status(404).json({ error: "Item não encontrado" }); return; }

  const body = UpdateEmployeeProfileItemBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [updatedItem] = await db.update(employeeProfileItemsTable)
    .set({
      ...(body.data.title !== undefined ? { title: body.data.title.trim() } : {}),
      ...(body.data.description !== undefined ? { description: body.data.description?.trim() || null } : {}),
    })
    .where(and(eq(employeeProfileItemsTable.id, params.data.itemId), eq(employeeProfileItemsTable.employeeId, params.data.empId)))
    .returning();

  if (!updatedItem) { res.status(404).json({ error: "Item não encontrado" }); return; }

  const profileItems = await loadEmployeeProfileItems(params.data.empId);
  const profileItem = [...profileItems.professionalExperiences, ...profileItems.educationCertifications]
    .find((item) => item.id === updatedItem.id);

  if (!profileItem) { res.status(500).json({ error: "Falha ao carregar item atualizado" }); return; }
  res.json(profileItem);
});

router.delete("/organizations/:orgId/employees/:empId/profile-items/:itemId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteEmployeeProfileItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyProfileItemOwnership(params.data.itemId, params.data.empId))) { res.status(404).json({ error: "Item não encontrado" }); return; }

  const [deletedItem] = await db.delete(employeeProfileItemsTable)
    .where(and(eq(employeeProfileItemsTable.id, params.data.itemId), eq(employeeProfileItemsTable.employeeId, params.data.empId)))
    .returning();

  if (!deletedItem) { res.status(404).json({ error: "Item não encontrado" }); return; }
  res.sendStatus(204);
});

router.post("/organizations/:orgId/employees/:empId/profile-items/:itemId/attachments", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = AddEmployeeProfileItemAttachmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyProfileItemOwnership(params.data.itemId, params.data.empId))) { res.status(404).json({ error: "Item não encontrado" }); return; }

  const body = AddEmployeeProfileItemAttachmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [attachment] = await db.insert(employeeProfileItemAttachmentsTable).values({
    itemId: params.data.itemId,
    fileName: body.data.fileName.trim(),
    fileSize: body.data.fileSize,
    contentType: body.data.contentType.trim(),
    objectPath: body.data.objectPath.trim(),
  }).returning();

  res.status(201).json(formatProfileItemAttachment(attachment));
});

router.delete("/organizations/:orgId/employees/:empId/profile-items/:itemId/attachments/:attachmentId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteEmployeeProfileItemAttachmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyProfileItemOwnership(params.data.itemId, params.data.empId))) { res.status(404).json({ error: "Item não encontrado" }); return; }

  const [attachment] = await db.delete(employeeProfileItemAttachmentsTable)
    .where(and(
      eq(employeeProfileItemAttachmentsTable.id, params.data.attachmentId),
      eq(employeeProfileItemAttachmentsTable.itemId, params.data.itemId),
    ))
    .returning();

  if (!attachment) { res.status(404).json({ error: "Anexo não encontrado" }); return; }
  res.sendStatus(204);
});

router.post("/organizations/:orgId/employees/:empId/units", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = LinkEmployeeUnitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const body = LinkEmployeeUnitBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [unit] = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(and(eq(unitsTable.id, body.data.unitId), eq(unitsTable.organizationId, params.data.orgId)));
  if (!unit) { res.status(400).json({ error: "Unidade não pertence à organização" }); return; }

  const existing = await db.select({ id: employeeUnitsTable.id }).from(employeeUnitsTable)
    .where(and(eq(employeeUnitsTable.employeeId, params.data.empId), eq(employeeUnitsTable.unitId, body.data.unitId)));
  if (existing.length > 0) { res.status(409).json({ error: "Unidade já vinculada" }); return; }

  const [link] = await db.insert(employeeUnitsTable).values({ employeeId: params.data.empId, unitId: body.data.unitId }).returning();
  res.status(201).json(link);
});

router.delete("/organizations/:orgId/employees/:empId/units/:unitId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = UnlinkEmployeeUnitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }
  if (!(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

  const [deleted] = await db.delete(employeeUnitsTable)
    .where(and(eq(employeeUnitsTable.employeeId, params.data.empId), eq(employeeUnitsTable.unitId, params.data.unitId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Vínculo não encontrado" }); return; }
  res.sendStatus(204);
});

export default router;
