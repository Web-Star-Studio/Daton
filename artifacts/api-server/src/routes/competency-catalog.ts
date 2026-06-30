import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  competencyCatalogTable,
  db,
  employeeCompetenciesTable,
  employeesTable,
  positionCompetencyRequirementsTable,
  positionsTable,
} from "@workspace/db";
import {
  CreateCompetencyCatalogItemBody,
  CreateCompetencyCatalogItemParams,
  DeleteCompetencyCatalogItemParams,
  ListCompetencyCatalogParams,
  UpdateCompetencyCatalogItemBody,
  UpdateCompetencyCatalogItemParams,
} from "@workspace/api-zod";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";

const router: IRouter = Router();

function serialize(
  row: typeof competencyCatalogTable.$inferSelect,
  usageCount?: number,
) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    competencyType: row.competencyType,
    category: row.category,
    norm: row.norm,
    isMandatory: row.isMandatory,
    ...(usageCount !== undefined ? { usageCount } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Conta usos texto-livre (case-insensitive) por nome de competência, escopado por org. */
async function loadUsageByName(orgId: number): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  const empRows = await db
    .select({
      key: sql<string>`lower(${employeeCompetenciesTable.name})`,
      n: sql<number>`cast(count(*) as int)`,
    })
    .from(employeeCompetenciesTable)
    .innerJoin(
      employeesTable,
      eq(employeeCompetenciesTable.employeeId, employeesTable.id),
    )
    .where(eq(employeesTable.organizationId, orgId))
    .groupBy(sql`lower(${employeeCompetenciesTable.name})`);
  const posRows = await db
    .select({
      key: sql<string>`lower(${positionCompetencyRequirementsTable.competencyName})`,
      n: sql<number>`cast(count(*) as int)`,
    })
    .from(positionCompetencyRequirementsTable)
    .innerJoin(
      positionsTable,
      eq(positionCompetencyRequirementsTable.positionId, positionsTable.id),
    )
    .where(eq(positionsTable.organizationId, orgId))
    .groupBy(sql`lower(${positionCompetencyRequirementsTable.competencyName})`);
  for (const r of [...empRows, ...posRows]) {
    usage.set(r.key, (usage.get(r.key) ?? 0) + r.n);
  }
  return usage;
}

// GET /organizations/:orgId/competency-catalog
router.get(
  "/organizations/:orgId/competency-catalog",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListCompetencyCatalogParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const rows = await db
      .select()
      .from(competencyCatalogTable)
      .where(eq(competencyCatalogTable.organizationId, params.data.orgId))
      .orderBy(asc(competencyCatalogTable.name));
    const usage = await loadUsageByName(params.data.orgId);
    res.json({
      data: rows.map((r) => serialize(r, usage.get(r.name.toLowerCase()) ?? 0)),
    });
  },
);

// POST /organizations/:orgId/competency-catalog — idempotente por nome (case-insensitive)
router.post(
  "/organizations/:orgId/competency-catalog",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateCompetencyCatalogItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = CreateCompetencyCatalogItemBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const name = body.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Informe o nome da competência" });
      return;
    }

    const findByName = async () => {
      const [row] = await db
        .select()
        .from(competencyCatalogTable)
        .where(
          and(
            eq(competencyCatalogTable.organizationId, params.data.orgId),
            sql`lower(${competencyCatalogTable.name}) = lower(${name})`,
          ),
        );
      return row;
    };

    const existing = await findByName();
    if (existing) {
      res.status(200).json(serialize(existing));
      return;
    }

    const [inserted] = await db
      .insert(competencyCatalogTable)
      .values({
        organizationId: params.data.orgId,
        name,
        competencyType: body.data.competencyType ?? null,
        category: body.data.category ?? null,
        norm: body.data.norm ?? null,
        isMandatory: body.data.isMandatory ?? false,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      res.status(201).json(serialize(inserted));
      return;
    }

    const raced = await findByName();
    if (raced) {
      res.status(200).json(serialize(raced));
      return;
    }
    res.status(409).json({ error: "Não foi possível criar a competência" });
  },
);

// PATCH /organizations/:orgId/competency-catalog/:itemId — edita; rename propaga
router.patch(
  "/organizations/:orgId/competency-catalog/:itemId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateCompetencyCatalogItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = UpdateCompetencyCatalogItemBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [current] = await db
      .select()
      .from(competencyCatalogTable)
      .where(
        and(
          eq(competencyCatalogTable.id, params.data.itemId),
          eq(competencyCatalogTable.organizationId, params.data.orgId),
        ),
      );
    if (!current) {
      res.status(404).json({ error: "Competência não encontrada" });
      return;
    }

    const updates: Partial<typeof competencyCatalogTable.$inferInsert> = {};
    let renamedTo: string | null = null;
    if (body.data.name !== undefined) {
      const name = body.data.name.trim();
      if (!name) {
        res.status(400).json({ error: "Informe o nome da competência" });
        return;
      }
      // colisão com outra competência (case-insensitive)
      const [clash] = await db
        .select({ id: competencyCatalogTable.id })
        .from(competencyCatalogTable)
        .where(
          and(
            eq(competencyCatalogTable.organizationId, params.data.orgId),
            sql`lower(${competencyCatalogTable.name}) = lower(${name})`,
            sql`${competencyCatalogTable.id} <> ${params.data.itemId}`,
          ),
        );
      if (clash) {
        res.status(409).json({ error: "Já existe uma competência com esse nome" });
        return;
      }
      updates.name = name;
      if (name !== current.name) renamedTo = name;
    }
    if (body.data.competencyType !== undefined)
      updates.competencyType = body.data.competencyType;
    if (body.data.category !== undefined) updates.category = body.data.category;
    if (body.data.norm !== undefined) updates.norm = body.data.norm;
    if (body.data.isMandatory !== undefined)
      updates.isMandatory = body.data.isMandatory;

    const [row] = await db
      .update(competencyCatalogTable)
      .set(updates)
      .where(
        and(
          eq(competencyCatalogTable.id, params.data.itemId),
          eq(competencyCatalogTable.organizationId, params.data.orgId),
        ),
      )
      .returning();

    // Propaga o rename aos usos texto-livre, escopado por organização.
    if (renamedTo) {
      await db
        .update(employeeCompetenciesTable)
        .set({ name: renamedTo })
        .where(
          and(
            sql`lower(${employeeCompetenciesTable.name}) = lower(${current.name})`,
            sql`${employeeCompetenciesTable.employeeId} in (select ${employeesTable.id} from ${employeesTable} where ${employeesTable.organizationId} = ${params.data.orgId})`,
          ),
        );
      await db
        .update(positionCompetencyRequirementsTable)
        .set({ competencyName: renamedTo })
        .where(
          and(
            sql`lower(${positionCompetencyRequirementsTable.competencyName}) = lower(${current.name})`,
            sql`${positionCompetencyRequirementsTable.positionId} in (select ${positionsTable.id} from ${positionsTable} where ${positionsTable.organizationId} = ${params.data.orgId})`,
          ),
        );
    }

    res.json(serialize(row));
  },
);

// DELETE /organizations/:orgId/competency-catalog/:itemId — remove só do catálogo
router.delete(
  "/organizations/:orgId/competency-catalog/:itemId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteCompetencyCatalogItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const [row] = await db
      .delete(competencyCatalogTable)
      .where(
        and(
          eq(competencyCatalogTable.id, params.data.itemId),
          eq(competencyCatalogTable.organizationId, params.data.orgId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Competência não encontrada" });
      return;
    }
    res.status(204).send();
  },
);

export default router;
