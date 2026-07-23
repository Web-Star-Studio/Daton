import { Router, type IRouter } from "express";
import { and, asc, eq, exists, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  employeesTable,
  employeeTrainingsTable,
  trainingCatalogTable,
  trainingClassesTable,
  trainingClassParticipantsTable,
  trainingClassUnitsTable,
  unitsTable,
  usersTable,
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
import {
  loadClassUnits,
  replaceClassUnits,
  resolveUnitsFromBody,
  validateClassUnits,
  type SerializedClassUnit,
} from "../services/aprendizagem/class-units";
import { notifyClassResponsibleAssignment } from "../services/aprendizagem/notify-class-responsible";

const router: IRouter = Router();

function serializeClass(
  row: typeof trainingClassesTable.$inferSelect,
  opts: {
    participantCount?: number;
    approvedCount?: number;
    confirmedCount?: number;
    units?: SerializedClassUnit[];
    responsibleUserName?: string | null;
  } = {},
) {
  const { participantCount, approvedCount, confirmedCount } = opts;
  return {
    ...row,
    attachments: row.attachments ?? [],
    units: opts.units ?? [],
    responsibleUserName: opts.responsibleUserName ?? null,
    ...(participantCount !== undefined ? { participantCount } : {}),
    ...(approvedCount !== undefined ? { approvedCount } : {}),
    ...(confirmedCount !== undefined ? { confirmedCount } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Nomes dos responsáveis (users) por id — para serializar responsibleUserName. */
async function loadResponsibleNames(
  ids: (number | null)[],
): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id): id is number => id != null))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Valida que o responsável (opcional) é usuário da própria org. */
async function validateResponsible(
  orgId: number,
  responsibleUserId: number | null | undefined,
): Promise<boolean> {
  if (responsibleUserId == null) return true;
  const [u] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, responsibleUserId),
        eq(usersTable.organizationId, orgId),
      ),
    );
  return !!u;
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

/** Título do treinamento (catálogo) para os textos de notificação. */
async function catalogTitleFor(catalogItemId: number): Promise<string> {
  const [item] = await db
    .select({ title: trainingCatalogTable.title })
    .from(trainingCatalogTable)
    .where(eq(trainingCatalogTable.id, catalogItemId));
  return item?.title ?? "Turma";
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
  const unitsByClass = await loadClassUnits([classId]);
  const names = await loadResponsibleNames([cls.responsibleUserId]);
  return {
    ...serializeClass(cls, {
      participantCount: rows.length,
      units: unitsByClass.get(classId) ?? [],
      responsibleUserName: cls.responsibleUserId
        ? (names.get(cls.responsibleUserId) ?? null)
        : null,
    }),
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
    // A filial da turma virou N:N (training_class_units) — o filtro casa se a
    // turma INCLUIR a filial, não só quando ela é a primeira/única.
    const unitFilter = query.data.unitId;
    if (unitFilter)
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(trainingClassUnitsTable)
            .where(
              and(
                eq(trainingClassUnitsTable.classId, trainingClassesTable.id),
                eq(trainingClassUnitsTable.unitId, unitFilter),
              ),
            ),
        ),
      );
    // "Minhas turmas como responsável": turma cujo responsável é o usuário.
    const responsibleFilter = query.data.responsibleUserId;
    if (responsibleFilter)
      conditions.push(
        eq(trainingClassesTable.responsibleUserId, responsibleFilter),
      );
    if (query.data.catalogItemId)
      conditions.push(
        eq(trainingClassesTable.catalogItemId, query.data.catalogItemId),
      );

    const rows = await db
      .select()
      .from(trainingClassesTable)
      .where(and(...conditions))
      .orderBy(asc(trainingClassesTable.startDate));

    // Inscritos, confirmados e aprovados por turma. "Aprovados" é o que a ficha
    // do catálogo e a Gestão de Treinamentos mostram como "Realizados": quem
    // concluiu, não quem se inscreveu. "Confirmados" é a presença
    // (attendance='presente'), o passo intermediário do funil.
    // Restrito às turmas já carregadas — sem o inArray o agregado varre a
    // tabela de participantes inteira, de todas as organizações.
    const classIds = rows.map((r) => r.id);
    const counts = classIds.length
      ? await db
          .select({
            classId: trainingClassParticipantsTable.classId,
            n: sql<number>`cast(count(*) as int)`,
            approved: sql<number>`cast(count(*) filter (where ${trainingClassParticipantsTable.result} = 'aprovado') as int)`,
            confirmed: sql<number>`cast(count(*) filter (where ${trainingClassParticipantsTable.attendance} = 'presente') as int)`,
          })
          .from(trainingClassParticipantsTable)
          .where(inArray(trainingClassParticipantsTable.classId, classIds))
          .groupBy(trainingClassParticipantsTable.classId)
      : [];
    const countByClass = new Map(counts.map((c) => [c.classId, c]));
    const unitsByClass = await loadClassUnits(classIds);
    const respNames = await loadResponsibleNames(
      rows.map((r) => r.responsibleUserId),
    );

    res.json({
      data: rows.map((r) => {
        const c = countByClass.get(r.id);
        return serializeClass(r, {
          participantCount: c?.n ?? 0,
          approvedCount: c?.approved ?? 0,
          confirmedCount: c?.confirmed ?? 0,
          units: unitsByClass.get(r.id) ?? [],
          responsibleUserName: r.responsibleUserId
            ? (respNames.get(r.responsibleUserId) ?? null)
            : null,
        });
      }),
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
    // Filiais da turma (N:N). `unitId` continua aceito como atalho legado.
    const units = resolveUnitsFromBody(body.data) ?? [];
    const unitsError = await validateClassUnits(params.data.orgId, units);
    if (unitsError) {
      res.status(400).json({ error: unitsError });
      return;
    }
    // Responsável pela turma (opcional, um só).
    const responsibleUserId = body.data.responsibleUserId ?? null;
    if (!(await validateResponsible(params.data.orgId, responsibleUserId))) {
      res.status(400).json({ error: "Responsável não encontrado" });
      return;
    }

    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(trainingClassesTable)
        .values({
          organizationId: params.data.orgId,
          catalogItemId: body.data.catalogItemId,
          code: body.data.code ?? null,
          startDate: body.data.startDate,
          endDate: body.data.endDate ?? null,
          // Espelho legado — replaceClassUnits reescreve a partir da lista.
          unitId: null,
          location: body.data.location ?? null,
          instructor: body.data.instructor ?? null,
          responsibleUserId,
          modality: body.data.modality ?? null,
          workloadHours: body.data.workloadHours ?? null,
          capacity: body.data.capacity ?? null,
          minScore: body.data.minScore ?? null,
          status: body.data.status ?? "agendada",
          notes: body.data.notes ?? null,
          attachments: body.data.attachments ?? [],
        })
        .returning();
      await replaceClassUnits(tx, created.id, units);
      return { ...created, unitId: units[0]?.unitId ?? null };
    });

    // Notifica o responsável recém-vinculado (in-app + e-mail). Best-effort:
    // fora da transação, não bloqueia a resposta, não derruba o create.
    if (row.responsibleUserId) {
      void notifyClassResponsibleAssignment(
        {
          classId: row.id,
          organizationId: row.organizationId,
          trainingTitle: await catalogTitleFor(row.catalogItemId),
          code: row.code,
          startDate: row.startDate,
          responsibleUserId: row.responsibleUserId,
        },
        req.auth!.userId,
      );
    }

    const unitsByClass = await loadClassUnits([row.id]);
    const names = await loadResponsibleNames([row.responsibleUserId]);
    res.status(201).json(
      serializeClass(row, {
        participantCount: 0,
        units: unitsByClass.get(row.id) ?? [],
        responsibleUserName: row.responsibleUserId
          ? (names.get(row.responsibleUserId) ?? null)
          : null,
      }),
    );
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
    // Filiais: `units` é replace-all; `unitId` é o atalho legado. Omitir os dois
    // mantém as filiais atuais. Validação multi-tenant antes de gravar.
    const units = resolveUnitsFromBody(b);
    if (units !== undefined) {
      const unitsError = await validateClassUnits(params.data.orgId, units);
      if (unitsError) {
        res.status(400).json({ error: unitsError });
        return;
      }
    }
    if (
      b.responsibleUserId !== undefined &&
      !(await validateResponsible(params.data.orgId, b.responsibleUserId))
    ) {
      res.status(400).json({ error: "Responsável não encontrado" });
      return;
    }
    const updates: Partial<typeof trainingClassesTable.$inferInsert> = {};
    if (b.code !== undefined) updates.code = b.code;
    if (b.startDate !== undefined) updates.startDate = b.startDate;
    if (b.endDate !== undefined) updates.endDate = b.endDate;
    // `unitId` NÃO entra aqui: o espelho legado é escrito por replaceClassUnits,
    // sempre a partir da mesma lista — é o que impede os dois divergirem.
    if (b.location !== undefined) updates.location = b.location;
    if (b.instructor !== undefined) updates.instructor = b.instructor;
    if (b.responsibleUserId !== undefined)
      updates.responsibleUserId = b.responsibleUserId;
    if (b.modality !== undefined) updates.modality = b.modality;
    if (b.workloadHours !== undefined) updates.workloadHours = b.workloadHours;
    if (b.capacity !== undefined) updates.capacity = b.capacity;
    if (b.minScore !== undefined) updates.minScore = b.minScore;
    if (b.status !== undefined) updates.status = b.status;
    if (b.notes !== undefined) updates.notes = b.notes;
    if (b.attachments !== undefined) updates.attachments = b.attachments;
    // Trocar só as filiais também é uma alteração da turma.
    if (units !== undefined) updates.updatedAt = new Date();

    const scope = and(
      eq(trainingClassesTable.id, params.data.id),
      eq(trainingClassesTable.organizationId, params.data.orgId),
    );
    // Responsável anterior — para só notificar quando REALMENTE muda.
    let priorResponsibleId: number | null = null;
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ responsibleUserId: trainingClassesTable.responsibleUserId })
        .from(trainingClassesTable)
        .where(scope);
      if (!existing) return null;
      priorResponsibleId = existing.responsibleUserId;
      // drizzle rejeita .set({}) — um PATCH vazio só relê a turma.
      const [updated] = Object.keys(updates).length
        ? await tx
            .update(trainingClassesTable)
            .set(updates)
            .where(scope)
            .returning()
        : await tx.select().from(trainingClassesTable).where(scope);
      if (!updated) return null;
      if (units === undefined) return updated;
      await replaceClassUnits(tx, updated.id, units);
      return { ...updated, unitId: units[0]?.unitId ?? null };
    });
    if (!row) {
      res.status(404).json({ error: "Turma não encontrada" });
      return;
    }
    // Notifica só quando o responsável mudou para alguém novo (não repete se
    // re-salvar com o mesmo). Best-effort, fora da transação.
    if (
      row.responsibleUserId &&
      row.responsibleUserId !== priorResponsibleId
    ) {
      void notifyClassResponsibleAssignment(
        {
          classId: row.id,
          organizationId: row.organizationId,
          trainingTitle: await catalogTitleFor(row.catalogItemId),
          code: row.code,
          startDate: row.startDate,
          responsibleUserId: row.responsibleUserId,
        },
        req.auth!.userId,
      );
    }
    const unitsByClass = await loadClassUnits([row.id]);
    const names = await loadResponsibleNames([row.responsibleUserId]);
    res.json(
      serializeClass(row, {
        units: unitsByClass.get(row.id) ?? [],
        responsibleUserName: row.responsibleUserId
          ? (names.get(row.responsibleUserId) ?? null)
          : null,
      }),
    );
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

    // Batch-fetch pending trainings para todos os participantes de uma vez (evita N+1).
    const pendingTrainings = await db
      .select({
        id: employeeTrainingsTable.id,
        employeeId: employeeTrainingsTable.employeeId,
      })
      .from(employeeTrainingsTable)
      .where(
        and(
          inArray(employeeTrainingsTable.employeeId, body.data.employeeIds),
          eq(employeeTrainingsTable.catalogItemId, cls.catalogItemId),
          eq(employeeTrainingsTable.status, "pendente"),
        ),
      );
    // Keep only first match per employee (same as original single-select behaviour).
    const pendingByEmployee = new Map<number, number>();
    for (const t of pendingTrainings) {
      if (!pendingByEmployee.has(t.employeeId)) {
        pendingByEmployee.set(t.employeeId, t.id);
      }
    }

    for (const employeeId of body.data.employeeIds) {
      await db
        .insert(trainingClassParticipantsTable)
        .values({
          classId: params.data.id,
          employeeId,
          employeeTrainingId: pendingByEmployee.get(employeeId) ?? null,
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
      .select({
        id: trainingClassesTable.id,
        minScore: trainingClassesTable.minScore,
      })
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
    const score =
      body.data.score !== undefined ? body.data.score : current.score;
    // Só recomputa result quando o PATCH fornece explicitamente `result` ou `attendance`.
    // Score sozinho (sem attendance/result) preserva o result manual existente.
    const result =
      body.data.result !== undefined || body.data.attendance !== undefined
        ? deriveResult(attendance, score, cls.minScore, body.data.result)
        : current.result;

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
