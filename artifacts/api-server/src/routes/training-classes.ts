import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  employeesTable,
  employeeTrainingsTable,
  trainingCatalogTable,
  trainingClassesTable,
  trainingClassParticipantsTable,
  unitsTable,
} from "@workspace/db";
import {
  AddTrainingClassParticipantsBody,
  AddTrainingClassParticipantsParams,
  CompleteTrainingClassParams,
  CreateTrainingClassBody,
  CreateTrainingClassParams,
  DeleteTrainingClassParams,
  DeleteTrainingClassParticipantParams,
  GetTrainingClassParams,
  ListTrainingClassesParams,
  ListTrainingClassesQueryParams,
  UpdateTrainingClassBody,
  UpdateTrainingClassParams,
  UpdateTrainingClassParticipantBody,
  UpdateTrainingClassParticipantParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";
import { completeTrainingClass } from "../services/aprendizagem/complete-class";

const router: IRouter = Router();

function serializeClass(
  row: typeof trainingClassesTable.$inferSelect,
  participantCount?: number,
) {
  return {
    ...row,
    attachments: row.attachments ?? [],
    ...(participantCount !== undefined ? { participantCount } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeParticipant(
  row: typeof trainingClassParticipantsTable.$inferSelect,
  employeeName?: string | null,
) {
  return {
    ...row,
    ...(employeeName !== undefined ? { employeeName } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadDetail(orgId: number, classId: number) {
  const [cls] = await db
    .select()
    .from(trainingClassesTable)
    .where(
      and(
        eq(trainingClassesTable.id, classId),
        eq(trainingClassesTable.organizationId, orgId),
      ),
    );
  if (!cls) return null;
  const rows = await db
    .select({
      participant: trainingClassParticipantsTable,
      employeeName: employeesTable.name,
    })
    .from(trainingClassParticipantsTable)
    .innerJoin(
      employeesTable,
      eq(trainingClassParticipantsTable.employeeId, employeesTable.id),
    )
    .where(eq(trainingClassParticipantsTable.classId, classId))
    .orderBy(asc(trainingClassParticipantsTable.id));
  return {
    ...serializeClass(cls, rows.length),
    participants: rows.map((r) =>
      serializeParticipant(r.participant, r.employeeName),
    ),
  };
}

function deriveResult(
  attendance: string | null | undefined,
  score: number | null | undefined,
  minScore: number | null,
  override: string | null | undefined,
): string | null {
  if (override) return override;
  if (attendance === "presente") {
    if (minScore == null || score == null) return "aprovado";
    return score >= minScore ? "aprovado" : "reprovado";
  }
  if (attendance === "faltou") return "reprovado";
  return null;
}

// GET list
router.get(
  "/organizations/:orgId/training-classes",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListTrainingClassesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const query = ListTrainingClassesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const conditions: SQL[] = [
      eq(trainingClassesTable.organizationId, params.data.orgId),
    ];
    if (query.data.status)
      conditions.push(eq(trainingClassesTable.status, query.data.status));
    if (query.data.unitId)
      conditions.push(eq(trainingClassesTable.unitId, query.data.unitId));
    if (query.data.catalogItemId)
      conditions.push(
        eq(trainingClassesTable.catalogItemId, query.data.catalogItemId),
      );

    const rows = await db
      .select()
      .from(trainingClassesTable)
      .where(and(...conditions))
      .orderBy(asc(trainingClassesTable.startDate));

    const counts = await db
      .select({
        classId: trainingClassParticipantsTable.classId,
        n: sql<number>`cast(count(*) as int)`,
      })
      .from(trainingClassParticipantsTable)
      .groupBy(trainingClassParticipantsTable.classId);
    const countByClass = new Map(counts.map((c) => [c.classId, c.n]));

    res.json({
      data: rows.map((r) => serializeClass(r, countByClass.get(r.id) ?? 0)),
    });
  },
);

// POST create
router.post(
  "/organizations/:orgId/training-classes",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateTrainingClassParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = CreateTrainingClassBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    // isolamento multi-tenant: o item de catálogo tem de ser da própria org.
    const [catalogItem] = await db
      .select({ id: trainingCatalogTable.id })
      .from(trainingCatalogTable)
      .where(
        and(
          eq(trainingCatalogTable.id, body.data.catalogItemId),
          eq(trainingCatalogTable.organizationId, params.data.orgId),
        ),
      );
    if (!catalogItem) {
      res.status(400).json({ error: "Item do catálogo não encontrado" });
      return;
    }
    if (body.data.unitId != null) {
      const [unit] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(
          and(
            eq(unitsTable.id, body.data.unitId),
            eq(unitsTable.organizationId, params.data.orgId),
          ),
        );
      if (!unit) {
        res.status(400).json({ error: "Filial não encontrada" });
        return;
      }
    }
    const [row] = await db
      .insert(trainingClassesTable)
      .values({
        organizationId: params.data.orgId,
        catalogItemId: body.data.catalogItemId,
        code: body.data.code ?? null,
        startDate: body.data.startDate,
        endDate: body.data.endDate ?? null,
        unitId: body.data.unitId ?? null,
        location: body.data.location ?? null,
        instructor: body.data.instructor ?? null,
        modality: body.data.modality ?? null,
        workloadHours: body.data.workloadHours ?? null,
        capacity: body.data.capacity ?? null,
        minScore: body.data.minScore ?? null,
        status: body.data.status ?? "agendada",
        notes: body.data.notes ?? null,
        attachments: body.data.attachments ?? [],
      })
      .returning();
    res.status(201).json(serializeClass(row, 0));
  },
);

// GET detail
router.get(
  "/organizations/:orgId/training-classes/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetTrainingClassParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const detail = await loadDetail(params.data.orgId, params.data.id);
    if (!detail) {
      res.status(404).json({ error: "Turma não encontrada" });
      return;
    }
    res.json(detail);
  },
);

// PATCH update
router.patch(
  "/organizations/:orgId/training-classes/:id",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateTrainingClassParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = UpdateTrainingClassBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const b = body.data;
    // isolamento multi-tenant: validar unitId antes de atualizar.
    if (b.unitId != null) {
      const [unit] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(
          and(
            eq(unitsTable.id, b.unitId),
            eq(unitsTable.organizationId, params.data.orgId),
          ),
        );
      if (!unit) {
        res.status(400).json({ error: "Filial não encontrada" });
        return;
      }
    }
    const updates: Partial<typeof trainingClassesTable.$inferInsert> = {};
    if (b.code !== undefined) updates.code = b.code;
    if (b.startDate !== undefined) updates.startDate = b.startDate;
    if (b.endDate !== undefined) updates.endDate = b.endDate;
    if (b.unitId !== undefined) updates.unitId = b.unitId;
    if (b.location !== undefined) updates.location = b.location;
    if (b.instructor !== undefined) updates.instructor = b.instructor;
    if (b.modality !== undefined) updates.modality = b.modality;
    if (b.workloadHours !== undefined) updates.workloadHours = b.workloadHours;
    if (b.capacity !== undefined) updates.capacity = b.capacity;
    if (b.minScore !== undefined) updates.minScore = b.minScore;
    if (b.status !== undefined) updates.status = b.status;
    if (b.notes !== undefined) updates.notes = b.notes;
    if (b.attachments !== undefined) updates.attachments = b.attachments;

    const [row] = await db
      .update(trainingClassesTable)
      .set(updates)
      .where(
        and(
          eq(trainingClassesTable.id, params.data.id),
          eq(trainingClassesTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Turma não encontrada" });
      return;
    }
    res.json(serializeClass(row));
  },
);

// DELETE class
router.delete(
  "/organizations/:orgId/training-classes/:id",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteTrainingClassParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const [row] = await db
      .delete(trainingClassesTable)
      .where(
        and(
          eq(trainingClassesTable.id, params.data.id),
          eq(trainingClassesTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Turma não encontrada" });
      return;
    }
    res.status(204).send();
  },
);

// POST participants (enroll)
router.post(
  "/organizations/:orgId/training-classes/:id/participants",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = AddTrainingClassParticipantsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = AddTrainingClassParticipantsBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [cls] = await db
      .select()
      .from(trainingClassesTable)
      .where(
        and(
          eq(trainingClassesTable.id, params.data.id),
          eq(trainingClassesTable.organizationId, params.data.orgId),
        ),
      );
    if (!cls) {
      res.status(404).json({ error: "Turma não encontrada" });
      return;
    }

    // isolamento multi-tenant: todos os colaboradores têm de ser da própria org.
    const orgEmployees = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(
        and(
          inArray(employeesTable.id, body.data.employeeIds),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      );
    const validEmployeeIds = new Set(orgEmployees.map((e) => e.id));
    if (body.data.employeeIds.some((id) => !validEmployeeIds.has(id))) {
      res.status(400).json({ error: "Colaborador não encontrado" });
      return;
    }

    for (const employeeId of body.data.employeeIds) {
      // vincula um pendente do mesmo item, se existir
      const [pending] = await db
        .select({ id: employeeTrainingsTable.id })
        .from(employeeTrainingsTable)
        .where(
          and(
            eq(employeeTrainingsTable.employeeId, employeeId),
            eq(employeeTrainingsTable.catalogItemId, cls.catalogItemId),
            eq(employeeTrainingsTable.status, "pendente"),
          ),
        );
      await db
        .insert(trainingClassParticipantsTable)
        .values({
          classId: params.data.id,
          employeeId,
          employeeTrainingId: pending?.id ?? null,
        })
        .onConflictDoNothing();
    }

    const detail = await loadDetail(params.data.orgId, params.data.id);
    res.json(detail);
  },
);

// PATCH participant
router.patch(
  "/organizations/:orgId/training-classes/:id/participants/:participantId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateTrainingClassParticipantParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = UpdateTrainingClassParticipantBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    // garante que a turma é da org
    const [cls] = await db
      .select({ id: trainingClassesTable.id, minScore: trainingClassesTable.minScore })
      .from(trainingClassesTable)
      .where(
        and(
          eq(trainingClassesTable.id, params.data.id),
          eq(trainingClassesTable.organizationId, params.data.orgId),
        ),
      );
    if (!cls) {
      res.status(404).json({ error: "Turma não encontrada" });
      return;
    }
    const [current] = await db
      .select()
      .from(trainingClassParticipantsTable)
      .where(
        and(
          eq(trainingClassParticipantsTable.id, params.data.participantId),
          eq(trainingClassParticipantsTable.classId, params.data.id),
        ),
      );
    if (!current) {
      res.status(404).json({ error: "Participante não encontrado" });
      return;
    }
    const attendance =
      body.data.attendance !== undefined
        ? body.data.attendance
        : current.attendance;
    const score = body.data.score !== undefined ? body.data.score : current.score;
    const result = deriveResult(attendance, score, cls.minScore, body.data.result);

    const [row] = await db
      .update(trainingClassParticipantsTable)
      .set({ attendance, score, result })
      .where(eq(trainingClassParticipantsTable.id, params.data.participantId))
      .returning();
    res.json(serializeParticipant(row));
  },
);

// DELETE participant
router.delete(
  "/organizations/:orgId/training-classes/:id/participants/:participantId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteTrainingClassParticipantParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const [cls] = await db
      .select({ id: trainingClassesTable.id })
      .from(trainingClassesTable)
      .where(
        and(
          eq(trainingClassesTable.id, params.data.id),
          eq(trainingClassesTable.organizationId, params.data.orgId),
        ),
      );
    if (!cls) {
      res.status(404).json({ error: "Turma não encontrada" });
      return;
    }
    const [row] = await db
      .delete(trainingClassParticipantsTable)
      .where(
        and(
          eq(trainingClassParticipantsTable.id, params.data.participantId),
          eq(trainingClassParticipantsTable.classId, params.data.id),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Participante não encontrado" });
      return;
    }
    res.status(204).send();
  },
);

// POST complete
router.post(
  "/organizations/:orgId/training-classes/:id/complete",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CompleteTrainingClassParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const result = await completeTrainingClass({
      orgId: params.data.orgId,
      classId: params.data.id,
      database: db,
    });
    res.json(result);
  },
);

export default router;
