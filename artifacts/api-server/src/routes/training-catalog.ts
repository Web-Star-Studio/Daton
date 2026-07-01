import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, sql, type SQL } from "drizzle-orm";
import {
  db,
  annualTrainingProgramTable,
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
    const { search, norm, category, modality, status } = query.data;
    const page = query.data.page && query.data.page > 0 ? query.data.page : 1;
    const pageSize =
      query.data.pageSize && query.data.pageSize > 0 ? query.data.pageSize : 50;

    const conditions: SQL[] = [
      eq(trainingCatalogTable.organizationId, params.data.orgId),
    ];
    if (search) conditions.push(ilike(trainingCatalogTable.title, `%${search}%`));
    if (norm) conditions.push(eq(trainingCatalogTable.norm, norm));
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
      .orderBy(asc(trainingCatalogTable.title))
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
    const [row] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: params.data.orgId,
        title,
        category: body.data.category ?? null,
        modality: body.data.modality ?? null,
        norm: body.data.norm ?? null,
        clause: body.data.clause ?? null,
        workloadHours: body.data.workloadHours ?? null,
        validityMonths: body.data.validityMonths ?? null,
        isMandatory: body.data.isMandatory ?? false,
        status: body.data.status ?? "ativo",
        targetCompetencyName: body.data.targetCompetencyName ?? null,
        targetCompetencyType: body.data.targetCompetencyType ?? null,
        targetCompetencyLevel: body.data.targetCompetencyLevel ?? null,
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
    if (b.title !== undefined) updates.title = b.title.trim();
    if (b.category !== undefined) updates.category = b.category;
    if (b.modality !== undefined) updates.modality = b.modality;
    if (b.norm !== undefined) updates.norm = b.norm;
    if (b.clause !== undefined) updates.clause = b.clause;
    if (b.workloadHours !== undefined) updates.workloadHours = b.workloadHours;
    if (b.validityMonths !== undefined) updates.validityMonths = b.validityMonths;
    if (b.isMandatory !== undefined) updates.isMandatory = b.isMandatory;
    if (b.status !== undefined) updates.status = b.status;
    if (b.targetCompetencyName !== undefined)
      updates.targetCompetencyName = b.targetCompetencyName;
    if (b.targetCompetencyType !== undefined)
      updates.targetCompetencyType = b.targetCompetencyType;
    if (b.targetCompetencyLevel !== undefined)
      updates.targetCompetencyLevel = b.targetCompetencyLevel;
    if (b.defaultInstructor !== undefined)
      updates.defaultInstructor = b.defaultInstructor;
    if (b.objective !== undefined) updates.objective = b.objective;
    if (b.programContent !== undefined) updates.programContent = b.programContent;
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
    // Não excluir item ainda referenciado por turmas, obrigatoriedades ou PAT:
    // isso apagaria histórico de execução (turmas → participantes/evidências).
    // Nesses casos o correto é inativar o item (status), não excluir.
    const [refClass] = await db
      .select({ id: trainingClassesTable.id })
      .from(trainingClassesTable)
      .where(
        and(
          eq(trainingClassesTable.organizationId, params.data.orgId),
          eq(trainingClassesTable.catalogItemId, params.data.itemId),
        ),
      )
      .limit(1);
    const [refReq] = await db
      .select({ id: trainingRequirementsTable.id })
      .from(trainingRequirementsTable)
      .where(
        and(
          eq(trainingRequirementsTable.organizationId, params.data.orgId),
          eq(trainingRequirementsTable.catalogItemId, params.data.itemId),
        ),
      )
      .limit(1);
    const [refPat] = await db
      .select({ id: annualTrainingProgramTable.id })
      .from(annualTrainingProgramTable)
      .where(
        and(
          eq(annualTrainingProgramTable.organizationId, params.data.orgId),
          eq(annualTrainingProgramTable.catalogItemId, params.data.itemId),
        ),
      )
      .limit(1);
    if (refClass || refReq || refPat) {
      res.status(409).json({
        error:
          "Não é possível excluir: há turmas, obrigatoriedades ou itens do PAT vinculados. Inative o item em vez de excluir.",
      });
      return;
    }
    const [row] = await db
      .delete(trainingCatalogTable)
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
    res.status(204).send();
  },
);

export default router;
