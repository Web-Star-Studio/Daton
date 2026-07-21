import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, trainingCatalogOptionsTable } from "@workspace/db";
import {
  CreateTrainingCatalogOptionBody,
  CreateTrainingCatalogOptionParams,
  ListTrainingCatalogOptionsParams,
  ListTrainingCatalogOptionsQueryParams,
  UpdateTrainingCatalogOptionBody,
  UpdateTrainingCatalogOptionParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { slugifyEvidenceCode } from "../services/training-catalog-options/evidence";

const router: IRouter = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

function serializeOption(
  r: typeof trainingCatalogOptionsTable.$inferSelect,
) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    kind: r.kind,
    label: r.label,
    code: r.code,
    active: r.active,
    sortOrder: r.sortOrder,
    provesCompetency: r.provesCompetency,
    requiresValidity: r.requiresValidity,
  };
}

/** Acha um código livre para o tipo de evidência: base, base_2, base_3, … */
async function pickFreeCode(
  orgId: number,
  base: string,
): Promise<string> {
  const existing = await db
    .select({ code: trainingCatalogOptionsTable.code })
    .from(trainingCatalogOptionsTable)
    .where(
      and(
        eq(trainingCatalogOptionsTable.organizationId, orgId),
        eq(trainingCatalogOptionsTable.kind, "evidence_type"),
      ),
    );
  const taken = new Set(
    existing.map((r) => r.code).filter((c): c is string => Boolean(c)),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Praticamente inalcançável; mantém o contrato de devolver algo único-o-bastante.
  return `${base}_${taken.size + 1}`;
}

// ─── Catálogo de opções do catálogo de treinamentos ─────────────────────────
// (categoria / modalidade / tipo de evidência)
// Leitura liberada a qualquer usuário autenticado da org (o form do catálogo e a
// ficha precisam resolver rótulos e a semântica de evidência); escrita restrita
// a admins. Montado SEM gate de módulo — um org_admin pode não ter o módulo de
// aprendizagem e ainda assim precisa gerir o catálogo em Configurações.

router.get(
  "/organizations/:orgId/training-catalog-options",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListTrainingCatalogOptionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const query = ListTrainingCatalogOptionsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }

    const conditions = [
      eq(trainingCatalogOptionsTable.organizationId, params.data.orgId),
    ];
    if (query.data.kind)
      conditions.push(eq(trainingCatalogOptionsTable.kind, query.data.kind));

    // Devolve ativos e inativos: o seletor filtra os ativos, mas a aba de gestão
    // precisa enxergar (e poder reativar) os inativos.
    const rows = await db
      .select()
      .from(trainingCatalogOptionsTable)
      .where(and(...conditions))
      .orderBy(
        asc(trainingCatalogOptionsTable.kind),
        asc(trainingCatalogOptionsTable.sortOrder),
        asc(trainingCatalogOptionsTable.label),
      );

    res.json(rows.map(serializeOption));
  },
);

router.post(
  "/organizations/:orgId/training-catalog-options",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = CreateTrainingCatalogOptionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = CreateTrainingCatalogOptionBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const orgId = params.data.orgId;
    const kind = body.data.kind;
    const label = body.data.label.trim();
    if (!label) {
      res.status(400).json({ error: "Informe o nome da opção" });
      return;
    }

    const findByLabel = async () => {
      const [row] = await db
        .select()
        .from(trainingCatalogOptionsTable)
        .where(
          and(
            eq(trainingCatalogOptionsTable.organizationId, orgId),
            eq(trainingCatalogOptionsTable.kind, kind),
            sql`lower(${trainingCatalogOptionsTable.label}) = lower(${label})`,
          ),
        );
      return row;
    };

    // Idempotente por rótulo (case-insensitive): devolve o existente; se estiver
    // inativo, reativa — "recriar" um item removido deve trazê-lo de volta.
    const existing = await findByLabel();
    if (existing) {
      if (!existing.active) {
        const [reactivated] = await db
          .update(trainingCatalogOptionsTable)
          .set({ active: true })
          .where(eq(trainingCatalogOptionsTable.id, existing.id))
          .returning();
        res.status(200).json(serializeOption(reactivated));
        return;
      }
      res.status(200).json(serializeOption(existing));
      return;
    }

    // `code` e flags só valem para evidence_type. Categoria/modalidade casam por
    // rótulo (code null). Para evidence_type geramos um código estável a partir
    // do rótulo (ou usamos o informado) e garantimos unicidade por (org, kind).
    let code: string | null = null;
    let provesCompetency = false;
    let requiresValidity = false;
    if (kind === "evidence_type") {
      const requested = body.data.code?.trim();
      const base = slugifyEvidenceCode(
        requested && requested.length > 0 ? requested : label,
      );
      code = await pickFreeCode(orgId, base);
      provesCompetency = body.data.provesCompetency ?? false;
      requiresValidity = body.data.requiresValidity ?? false;
    }

    const [inserted] = await db
      .insert(trainingCatalogOptionsTable)
      .values({
        organizationId: orgId,
        kind,
        label,
        code,
        provesCompetency,
        requiresValidity,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      res.status(201).json(serializeOption(inserted));
      return;
    }

    // Corrida: outra requisição criou o mesmo rótulo entre o SELECT e o INSERT.
    const raced = await findByLabel();
    if (raced) {
      if (!raced.active) {
        const [reactivated] = await db
          .update(trainingCatalogOptionsTable)
          .set({ active: true })
          .where(eq(trainingCatalogOptionsTable.id, raced.id))
          .returning();
        res.status(200).json(serializeOption(reactivated));
        return;
      }
      res.status(200).json(serializeOption(raced));
      return;
    }

    res.status(409).json({ error: "Não foi possível criar a opção" });
  },
);

router.patch(
  "/organizations/:orgId/training-catalog-options/:optionId",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = UpdateTrainingCatalogOptionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = UpdateTrainingCatalogOptionBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const orgId = params.data.orgId;
    const optionId = params.data.optionId;

    const [current] = await db
      .select()
      .from(trainingCatalogOptionsTable)
      .where(
        and(
          eq(trainingCatalogOptionsTable.id, optionId),
          eq(trainingCatalogOptionsTable.organizationId, orgId),
        ),
      );
    if (!current) {
      res.status(404).json({ error: "Opção não encontrada" });
      return;
    }

    const updateData: Record<string, unknown> = {};

    if (body.data.label !== undefined) {
      const label = body.data.label.trim();
      if (!label) {
        res.status(400).json({ error: "Informe o nome da opção" });
        return;
      }
      // Colisão com outra opção do MESMO kind (case-insensitive), exceto ela mesma.
      const [clash] = await db
        .select({ id: trainingCatalogOptionsTable.id })
        .from(trainingCatalogOptionsTable)
        .where(
          and(
            eq(trainingCatalogOptionsTable.organizationId, orgId),
            eq(trainingCatalogOptionsTable.kind, current.kind),
            sql`lower(${trainingCatalogOptionsTable.label}) = lower(${label})`,
            sql`${trainingCatalogOptionsTable.id} <> ${optionId}`,
          ),
        );
      if (clash) {
        res.status(409).json({ error: "Já existe uma opção com esse nome" });
        return;
      }
      updateData.label = label;
    }
    if (body.data.active !== undefined) updateData.active = body.data.active;
    if (body.data.sortOrder !== undefined)
      updateData.sortOrder = body.data.sortOrder;
    // Flags semânticas só fazem sentido para evidence_type; ignoradas nos demais.
    if (current.kind === "evidence_type") {
      if (body.data.provesCompetency !== undefined)
        updateData.provesCompetency = body.data.provesCompetency;
      if (body.data.requiresValidity !== undefined)
        updateData.requiresValidity = body.data.requiresValidity;
    }

    try {
      const [row] = await db
        .update(trainingCatalogOptionsTable)
        .set(
          Object.keys(updateData).length > 0
            ? updateData
            : { updatedAt: new Date() },
        )
        .where(
          and(
            eq(trainingCatalogOptionsTable.id, optionId),
            eq(trainingCatalogOptionsTable.organizationId, orgId),
          ),
        )
        .returning();

      res.json(serializeOption(row));
    } catch (err: unknown) {
      // A checagem de colisão (SELECT) não é atômica com o UPDATE — um rename
      // concorrente para o mesmo rótulo pode só colidir aqui, no índice único.
      const code =
        (err as { cause?: { code?: string } } | undefined)?.cause?.code ??
        (err as { code?: string } | undefined)?.code;
      if (code === "23505") {
        res.status(409).json({ error: "Já existe uma opção com esse nome" });
        return;
      }
      throw err;
    }
  },
);

export default router;
