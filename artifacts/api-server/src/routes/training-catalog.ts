import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, sql, type SQL } from "drizzle-orm";
import {
  db,
  annualTrainingProgramTable,
  employeeTrainingsTable,
  trainingCatalogTable,
  trainingClassesTable,
  trainingRequirementsTable,
} from "@workspace/db";
import {
  CreateTrainingCatalogItemBody,
  CreateTrainingCatalogItemParams,
  DeleteTrainingCatalogItemParams,
  GetTrainingCatalogItemParams,
  ListTrainingCatalogParams,
  ListTrainingCatalogQueryParams,
  UpdateTrainingCatalogItemBody,
  UpdateTrainingCatalogItemParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";
import { assertNormsBelongToOrg } from "../services/norms/validate";

const router: IRouter = Router();

function serialize(row: typeof trainingCatalogTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// GET /organizations/:orgId/training-catalog — lista com filtros + paginação
router.get(
  "/organizations/:orgId/training-catalog",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListTrainingCatalogParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const query = ListTrainingCatalogQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const { search, norm, normId, category, modality, status } = query.data;
    const page = query.data.page && query.data.page > 0 ? query.data.page : 1;
    const pageSize =
      query.data.pageSize && query.data.pageSize > 0 ? query.data.pageSize : 50;

    const conditions: SQL[] = [
      eq(trainingCatalogTable.organizationId, params.data.orgId),
    ];
    if (search)
      conditions.push(ilike(trainingCatalogTable.title, `%${search}%`));
    // `norm` (texto livre) é legado; `normId` filtra pelo id do catálogo dentro do
    // array jsonb norm_ids (containment). Ambos aceitos p/ compatibilidade.
    if (normId)
      conditions.push(
        sql`${trainingCatalogTable.normIds} @> ${JSON.stringify([normId])}::jsonb`,
      );
    else if (norm) conditions.push(eq(trainingCatalogTable.norm, norm));
    if (category) conditions.push(eq(trainingCatalogTable.category, category));
    if (modality) conditions.push(eq(trainingCatalogTable.modality, modality));
    if (status) conditions.push(eq(trainingCatalogTable.status, status));
    const where = and(...conditions);

    const [{ total }] = await db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(trainingCatalogTable)
      .where(where);

    const rows = await db
      .select()
      .from(trainingCatalogTable)
      .where(where)
      // `id` breaks ties: titles are not unique, and OFFSET paging over a
      // non-unique ORDER BY can shift ties across page boundaries between separate
      // requests — duplicating one row and skipping another when a client fetches
      // every page. A stable secondary key makes paging deterministic.
      .orderBy(asc(trainingCatalogTable.title), asc(trainingCatalogTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      data: rows.map(serialize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  },
);

// POST /organizations/:orgId/training-catalog — cria
router.post(
  "/organizations/:orgId/training-catalog",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateTrainingCatalogItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = CreateTrainingCatalogItemBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const title = body.data.title.trim();
    if (!title) {
      res.status(400).json({ error: "Informe o título do treinamento" });
      return;
    }
    if (
      !(await assertNormsBelongToOrg(
        params.data.orgId,
        body.data.normIds ?? [],
      ))
    ) {
      res
        .status(400)
        .json({ error: "Norma(s) inválida(s) para esta organização" });
      return;
    }
    // Um item pode comprovar VÁRIAS competências (ISO 10015): targetCompetencies
    // é a lista canônica. As colunas singulares (targetCompetencyName/Type/Level)
    // são legado e espelham o 1º item da lista — quem envia só o singular
    // (chamadores antigos) continua funcionando, mas não popula a lista.
    const targetCompetencies = body.data.targetCompetencies ?? [];
    const firstCompetency = targetCompetencies[0] ?? null;
    const [row] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: params.data.orgId,
        title,
        category: body.data.category ?? null,
        modality: body.data.modality ?? null,
        norm: body.data.norm ?? null,
        clause: body.data.clause ?? null,
        normIds: body.data.normIds ?? [],
        workloadHours: body.data.workloadHours ?? null,
        validityMonths: body.data.validityMonths ?? null,
        isMandatory: body.data.isMandatory ?? false,
        status: body.data.status ?? "ativo",
        evidenceType: body.data.evidenceType ?? null,
        targetCompetencies,
        targetCompetencyName:
          firstCompetency?.name ?? body.data.targetCompetencyName ?? null,
        targetCompetencyType:
          firstCompetency?.type ?? body.data.targetCompetencyType ?? null,
        targetCompetencyLevel:
          firstCompetency?.level ?? body.data.targetCompetencyLevel ?? null,
        defaultInstructor: body.data.defaultInstructor ?? null,
        objective: body.data.objective ?? null,
        programContent: body.data.programContent ?? null,
        evaluationMethod: body.data.evaluationMethod ?? null,
      })
      .returning();
    res.status(201).json(serialize(row));
  },
);

// GET /organizations/:orgId/training-catalog/:itemId
router.get(
  "/organizations/:orgId/training-catalog/:itemId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetTrainingCatalogItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const [row] = await db
      .select()
      .from(trainingCatalogTable)
      .where(
        and(
          eq(trainingCatalogTable.id, params.data.itemId),
          eq(trainingCatalogTable.organizationId, params.data.orgId),
        ),
      );
    if (!row) {
      res.status(404).json({ error: "Item do catálogo não encontrado" });
      return;
    }
    res.json(serialize(row));
  },
);

// PATCH /organizations/:orgId/training-catalog/:itemId
router.patch(
  "/organizations/:orgId/training-catalog/:itemId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateTrainingCatalogItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = UpdateTrainingCatalogItemBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const updates: Partial<typeof trainingCatalogTable.$inferInsert> = {};
    const b = body.data;
    if (b.title !== undefined) {
      const trimmedTitle = b.title.trim();
      if (!trimmedTitle) {
        res.status(400).json({ error: "Informe o título do treinamento" });
        return;
      }
      updates.title = trimmedTitle;
    }
    if (b.category !== undefined) updates.category = b.category;
    if (b.modality !== undefined) updates.modality = b.modality;
    if (b.norm !== undefined) updates.norm = b.norm;
    if (b.clause !== undefined) updates.clause = b.clause;
    if (b.normIds !== undefined) {
      if (!(await assertNormsBelongToOrg(params.data.orgId, b.normIds))) {
        res
          .status(400)
          .json({ error: "Norma(s) inválida(s) para esta organização" });
        return;
      }
      updates.normIds = b.normIds;
    }
    if (b.workloadHours !== undefined) updates.workloadHours = b.workloadHours;
    if (b.validityMonths !== undefined)
      updates.validityMonths = b.validityMonths;
    if (b.isMandatory !== undefined) updates.isMandatory = b.isMandatory;
    if (b.status !== undefined) updates.status = b.status;
    if (b.evidenceType !== undefined) updates.evidenceType = b.evidenceType;
    if (b.targetCompetencyName !== undefined)
      updates.targetCompetencyName = b.targetCompetencyName;
    if (b.targetCompetencyType !== undefined)
      updates.targetCompetencyType = b.targetCompetencyType;
    if (b.targetCompetencyLevel !== undefined)
      updates.targetCompetencyLevel = b.targetCompetencyLevel;
    // Lista canônica de competências comprovadas (multi). Espelha o 1º item nas
    // colunas singulares legadas — depois dos handlers acima, então a lista vence.
    if (b.targetCompetencies !== undefined) {
      updates.targetCompetencies = b.targetCompetencies;
      const first = b.targetCompetencies[0] ?? null;
      updates.targetCompetencyName = first?.name ?? null;
      updates.targetCompetencyType = first?.type ?? null;
      updates.targetCompetencyLevel = first?.level ?? null;
    }
    if (b.defaultInstructor !== undefined)
      updates.defaultInstructor = b.defaultInstructor;
    if (b.objective !== undefined) updates.objective = b.objective;
    if (b.programContent !== undefined)
      updates.programContent = b.programContent;
    if (b.evaluationMethod !== undefined)
      updates.evaluationMethod = b.evaluationMethod;

    const [row] = await db
      .update(trainingCatalogTable)
      .set(updates)
      .where(
        and(
          eq(trainingCatalogTable.id, params.data.itemId),
          eq(trainingCatalogTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Item do catálogo não encontrado" });
      return;
    }
    res.json(serialize(row));
  },
);

// DELETE /organizations/:orgId/training-catalog/:itemId
router.delete(
  "/organizations/:orgId/training-catalog/:itemId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteTrainingCatalogItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const { orgId, itemId } = params.data;
    // cascade=true confirma a exclusão junto das dependências (fluxo de
    // confirmação no frontend); qualquer outro valor/ausência = false.
    const cascade = req.query.cascade === "true";

    if (cascade) {
      // Se o treinamento não existe mais, "cargo X deve fazer Y" deixa de
      // fazer sentido: apaga a obrigatoriedade e as pendências ainda não
      // realizadas. Quem já concluiu é histórico — preservado, só perde o
      // vínculo com o catálogo.
      const [row] = await db.transaction(async (tx) => {
        // Confirma que o item é DESTA organização ANTES de qualquer mutação.
        // As operações abaixo em employee_trainings filtram só por
        // catalog_item_id; sem este guard, um tenant poderia passar o itemId de
        // outra org e destruir os dados dela (o DELETE do item no fim é
        // org-scoped, mas casaria 0 linhas e a transação ainda faria COMMIT).
        const [owned] = await tx
          .select({ id: trainingCatalogTable.id })
          .from(trainingCatalogTable)
          .where(
            and(
              eq(trainingCatalogTable.id, itemId),
              eq(trainingCatalogTable.organizationId, orgId),
            ),
          )
          .limit(1);
        if (!owned) return [] as { id: number }[]; // 404, sem tocar em nada
        // Pendências (não concluídas) somem: ninguém dali em diante é esperado.
        await tx
          .delete(employeeTrainingsTable)
          .where(
            and(
              eq(employeeTrainingsTable.catalogItemId, itemId),
              sql`${employeeTrainingsTable.status} <> 'concluido'`,
            ),
          );
        // Concluídos são preservados como histórico, mas desvinculados do
        // catálogo. Zeramos explicitamente: a FK ON DELETE SET NULL de
        // catalog_item_id/requirement_id foi criada por DDL só na produção e
        // não existe em todo ambiente — sem isto, o registro ficaria com um
        // ponteiro pendente após o item ser apagado.
        await tx
          .update(employeeTrainingsTable)
          .set({ catalogItemId: null, requirementId: null })
          .where(
            and(
              eq(employeeTrainingsTable.catalogItemId, itemId),
              sql`${employeeTrainingsTable.status} = 'concluido'`,
            ),
          );
        // ON DELETE CASCADE cuida de obrigatoriedades/turmas/PAT vinculados.
        return tx
          .delete(trainingCatalogTable)
          .where(
            and(
              eq(trainingCatalogTable.id, itemId),
              eq(trainingCatalogTable.organizationId, orgId),
            ),
          )
          .returning();
      });
      if (!row) {
        res.status(404).json({ error: "Item do catálogo não encontrado" });
        return;
      }
      res.status(204).send();
      return;
    }

    // Sem cascade: não excluir item ainda referenciado por turmas,
    // obrigatoriedades ou PAT — isso apagaria histórico de execução. Conta as
    // dependências para o frontend oferecer "excluir mesmo assim" (cascade).
    const [[reqCount], [classCount], [patCount], [trainingCounts]] =
      await Promise.all([
        db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(trainingRequirementsTable)
          .where(
            and(
              eq(trainingRequirementsTable.organizationId, orgId),
              eq(trainingRequirementsTable.catalogItemId, itemId),
            ),
          ),
        db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(trainingClassesTable)
          .where(
            and(
              eq(trainingClassesTable.organizationId, orgId),
              eq(trainingClassesTable.catalogItemId, itemId),
            ),
          ),
        db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(annualTrainingProgramTable)
          .where(
            and(
              eq(annualTrainingProgramTable.organizationId, orgId),
              eq(annualTrainingProgramTable.catalogItemId, itemId),
            ),
          ),
        db
          .select({
            pendencias: sql<number>`count(*) filter (where ${employeeTrainingsTable.status} <> 'concluido')::int`,
            concluidos: sql<number>`count(*) filter (where ${employeeTrainingsTable.status} = 'concluido')::int`,
          })
          .from(employeeTrainingsTable)
          .where(eq(employeeTrainingsTable.catalogItemId, itemId)),
      ]);

    const dependencies = {
      obrigatoriedades: reqCount.count,
      turmas: classCount.count,
      pat: patCount.count,
      pendencias: trainingCounts.pendencias,
      concluidos: trainingCounts.concluidos,
    };

    if (
      dependencies.obrigatoriedades > 0 ||
      dependencies.turmas > 0 ||
      dependencies.pat > 0
    ) {
      res.status(409).json({
        error:
          "Não é possível excluir: há obrigatoriedades, turmas ou itens do PAT vinculados. Confirme para excluir junto.",
        dependencies,
      });
      return;
    }

    const [row] = await db
      .delete(trainingCatalogTable)
      .where(
        and(
          eq(trainingCatalogTable.id, itemId),
          eq(trainingCatalogTable.organizationId, orgId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Item do catálogo não encontrado" });
      return;
    }
    res.status(204).send();
  },
);

export default router;
