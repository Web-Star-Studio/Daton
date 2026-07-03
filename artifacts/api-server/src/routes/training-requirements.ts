import { Router, type IRouter } from "express";
import { and, asc, eq, type SQL } from "drizzle-orm";
import {
  db,
  positionsTable,
  trainingCatalogTable,
  trainingRequirementsTable,
} from "@workspace/db";
import {
  CreateTrainingRequirementBody,
  CreateTrainingRequirementParams,
  DeleteTrainingRequirementParams,
  ListTrainingRequirementsParams,
  ListTrainingRequirementsQueryParams,
  PreviewTrainingRequirementsParams,
  PreviewTrainingRequirementsQueryParams,
  UpdateTrainingRequirementBody,
  UpdateTrainingRequirementParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

function serialize(row: typeof trainingRequirementsTable.$inferSelect) {
  return {
    ...row,
    filialUnitIds: (row.filialUnitIds as number[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// GET /organizations/:orgId/training-requirements
router.get(
  "/organizations/:orgId/training-requirements",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListTrainingRequirementsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const query = ListTrainingRequirementsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const conditions: SQL[] = [
      eq(trainingRequirementsTable.organizationId, params.data.orgId),
    ];
    if (query.data.positionId)
      conditions.push(eq(trainingRequirementsTable.positionId, query.data.positionId));
    if (query.data.deadlineType)
      conditions.push(eq(trainingRequirementsTable.deadlineType, query.data.deadlineType));
    if (query.data.scope)
      conditions.push(eq(trainingRequirementsTable.scope, query.data.scope));

    const rows = await db
      .select()
      .from(trainingRequirementsTable)
      .where(and(...conditions))
      .orderBy(asc(trainingRequirementsTable.id));
    res.json({ data: rows.map(serialize) });
  },
);

// GET /organizations/:orgId/training-requirements/preview?position=&unitId=
router.get(
  "/organizations/:orgId/training-requirements/preview",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = PreviewTrainingRequirementsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const query = PreviewTrainingRequirementsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const [position] = await db
      .select()
      .from(positionsTable)
      .where(
        and(
          eq(positionsTable.organizationId, params.data.orgId),
          eq(positionsTable.name, query.data.position),
        ),
      );
    if (!position) {
      res.json({ requirements: [] });
      return;
    }
    const rows = await db
      .select()
      .from(trainingRequirementsTable)
      .where(
        and(
          eq(trainingRequirementsTable.organizationId, params.data.orgId),
          eq(trainingRequirementsTable.positionId, position.id),
        ),
      )
      .orderBy(asc(trainingRequirementsTable.id));
    const unitId = query.data.unitId;
    const applicable = rows.filter((r) => {
      if (r.scope !== "filial") return true;
      const units = (r.filialUnitIds as number[]) ?? [];
      return unitId != null && units.includes(unitId);
    });
    res.json({ requirements: applicable.map(serialize) });
  },
);

// POST /organizations/:orgId/training-requirements
router.post(
  "/organizations/:orgId/training-requirements",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateTrainingRequirementParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = CreateTrainingRequirementBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    // isolamento multi-tenant: cargo e item de catálogo têm de ser da própria org.
    const [position] = await db
      .select({ id: positionsTable.id })
      .from(positionsTable)
      .where(
        and(
          eq(positionsTable.id, body.data.positionId),
          eq(positionsTable.organizationId, params.data.orgId),
        ),
      );
    if (!position) {
      res.status(400).json({ error: "Cargo não encontrado" });
      return;
    }
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
    // não permite obrigatoriedade duplicada (mesmo cargo+treinamento+escopo).
    const [dup] = await db
      .select({ id: trainingRequirementsTable.id })
      .from(trainingRequirementsTable)
      .where(
        and(
          eq(trainingRequirementsTable.organizationId, params.data.orgId),
          eq(trainingRequirementsTable.positionId, body.data.positionId),
          eq(trainingRequirementsTable.catalogItemId, body.data.catalogItemId),
          eq(trainingRequirementsTable.scope, body.data.scope ?? "geral"),
        ),
      );
    if (dup) {
      res.status(409).json({
        error: "Já existe obrigatoriedade para este cargo, treinamento e escopo",
      });
      return;
    }
    const [row] = await db
      .insert(trainingRequirementsTable)
      .values({
        organizationId: params.data.orgId,
        positionId: body.data.positionId,
        catalogItemId: body.data.catalogItemId,
        deadlineType: body.data.deadlineType,
        deadlineDays: body.data.deadlineDays ?? null,
        scope: body.data.scope ?? "geral",
        filialUnitIds: body.data.filialUnitIds ?? [],
        recurrence: body.data.recurrence ?? "nao_repete",
        isCritical: body.data.isCritical ?? false,
        norm: body.data.norm ?? null,
        notes: body.data.notes ?? null,
      })
      .returning();
    res.status(201).json(serialize(row));
  },
);

// PATCH /organizations/:orgId/training-requirements/:id
router.patch(
  "/organizations/:orgId/training-requirements/:id",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateTrainingRequirementParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = UpdateTrainingRequirementBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const b = body.data;
    // isolamento multi-tenant: validar que cargo e item de catálogo pertencem à org antes de atualizar.
    if (b.positionId !== undefined) {
      const [position] = await db
        .select({ id: positionsTable.id })
        .from(positionsTable)
        .where(
          and(
            eq(positionsTable.id, b.positionId),
            eq(positionsTable.organizationId, params.data.orgId),
          ),
        );
      if (!position) {
        res.status(400).json({ error: "Cargo não encontrado" });
        return;
      }
    }
    if (b.catalogItemId !== undefined) {
      const [catalogItem] = await db
        .select({ id: trainingCatalogTable.id })
        .from(trainingCatalogTable)
        .where(
          and(
            eq(trainingCatalogTable.id, b.catalogItemId),
            eq(trainingCatalogTable.organizationId, params.data.orgId),
          ),
        );
      if (!catalogItem) {
        res.status(400).json({ error: "Item do catálogo não encontrado" });
        return;
      }
    }

    const updates: Partial<typeof trainingRequirementsTable.$inferInsert> = {};
    if (b.positionId !== undefined) updates.positionId = b.positionId;
    if (b.catalogItemId !== undefined) updates.catalogItemId = b.catalogItemId;
    if (b.deadlineType !== undefined) updates.deadlineType = b.deadlineType;
    if (b.deadlineDays !== undefined) updates.deadlineDays = b.deadlineDays;
    if (b.scope !== undefined) updates.scope = b.scope;
    if (b.filialUnitIds !== undefined) updates.filialUnitIds = b.filialUnitIds;
    if (b.recurrence !== undefined) updates.recurrence = b.recurrence;
    if (b.isCritical !== undefined) updates.isCritical = b.isCritical;
    if (b.norm !== undefined) updates.norm = b.norm;
    if (b.notes !== undefined) updates.notes = b.notes;

    try {
      const [row] = await db
        .update(trainingRequirementsTable)
        .set(updates)
        .where(
          and(
            eq(trainingRequirementsTable.id, params.data.id),
            eq(trainingRequirementsTable.organizationId, params.data.orgId),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "Obrigatoriedade não encontrada" });
        return;
      }
      res.json(serialize(row));
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined;
      if (code === "23505") {
        res
          .status(409)
          .json({
            error:
              "Já existe uma obrigatoriedade com esse cargo/treinamento/escopo",
          });
        return;
      }
      throw error;
    }
  },
);

// DELETE /organizations/:orgId/training-requirements/:id
router.delete(
  "/organizations/:orgId/training-requirements/:id",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteTrainingRequirementParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const [row] = await db
      .delete(trainingRequirementsTable)
      .where(
        and(
          eq(trainingRequirementsTable.id, params.data.id),
          eq(trainingRequirementsTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Obrigatoriedade não encontrada" });
      return;
    }
    res.status(204).send();
  },
);

export default router;
