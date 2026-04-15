import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  customerRequirementHistoryTable,
  customerRequirementReviewsTable,
  customerRequirementsTable,
  customersTable,
  db,
  sgqProcessesTable,
  unitsTable,
  usersTable,
  type CustomerAttachment,
  type CustomerRequirement,
  type CustomerRequirementSnapshot,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const CUSTOMER_STATUSES = ["active", "inactive"] as const;
const CUSTOMER_CRITICALITIES = ["low", "medium", "high"] as const;
const REQUIREMENT_STATUSES = [
  "draft",
  "under_review",
  "accepted",
  "accepted_with_restrictions",
  "adjustment_required",
  "rejected",
  "superseded",
] as const;
const REVIEW_DECISIONS = [
  "accepted",
  "accepted_with_restrictions",
  "adjustment_required",
  "rejected",
] as const;

const orgParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
});

const customerParamsSchema = orgParamsSchema.extend({
  customerId: z.coerce.number().int().positive(),
});

const requirementParamsSchema = customerParamsSchema.extend({
  requirementId: z.coerce.number().int().positive(),
});

const listCustomersQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  criticality: z.enum(CUSTOMER_CRITICALITIES).optional(),
});

const attachmentSchema = z.object({
  fileName: z.string().trim().min(1),
  fileSize: z.coerce.number().int().nonnegative(),
  contentType: z.string().trim().min(1),
  objectPath: z.string().trim().min(1),
});

const customerBodySchema = z.object({
  personType: z.enum(["pj", "pf"]).default("pj"),
  legalIdentifier: z.string().trim().min(1),
  legalName: z.string().trim().min(1),
  tradeName: z.string().trim().optional().nullable(),
  responsibleName: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().optional().nullable(),
  status: z.enum(CUSTOMER_STATUSES).default("active"),
  criticality: z.enum(CUSTOMER_CRITICALITIES).default("medium"),
  notes: z.string().trim().optional().nullable(),
});

const requirementBodySchema = z.object({
  unitId: z.coerce.number().int().positive().nullable().optional(),
  processId: z.coerce.number().int().positive().nullable().optional(),
  responsibleUserId: z.coerce.number().int().positive().nullable().optional(),
  serviceType: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  source: z.string().trim().optional().nullable(),
  status: z.enum(REQUIREMENT_STATUSES).default("draft"),
  changeSummary: z.string().trim().optional().nullable(),
});

const requirementPatchBodySchema = requirementBodySchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Informe ao menos um campo para atualizar.",
  );

const reviewBodySchema = z.object({
  reviewedById: z.coerce.number().int().positive().nullable().optional(),
  decision: z.enum(REVIEW_DECISIONS),
  capacityAnalysis: z.string().trim().min(1),
  restrictions: z.string().trim().optional().nullable(),
  justification: z.string().trim().optional().nullable(),
  decisionDate: z.string().datetime().optional(),
  attachments: z.array(attachmentSchema).default([]),
});

function normalizeOptionalString(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatTimestamp(
  value: Date | string | null | undefined,
): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function formatAttachments(
  attachments: CustomerAttachment[] | null | undefined,
): CustomerAttachment[] {
  return Array.isArray(attachments) ? attachments : [];
}

function getParseError(result: {
  success: boolean;
  error?: { message: string };
}): string {
  return result.success
    ? "Requisição inválida"
    : result.error?.message || "Requisição inválida";
}

function requireCustomerWrite(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const role = req.auth?.role;
  if (!role) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  if (role === "analyst") {
    res
      .status(403)
      .json({ error: "Permissão insuficiente para esta operação" });
    return;
  }

  next();
}

async function ensureOrgAccess(
  orgId: number,
  req: Request,
  res: Response,
): Promise<boolean> {
  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return false;
  }

  return true;
}

async function ensureUnitBelongsToOrg(
  unitId: number | null | undefined,
  orgId: number,
): Promise<boolean> {
  if (!unitId) return true;
  const [unit] = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(
      and(eq(unitsTable.id, unitId), eq(unitsTable.organizationId, orgId)),
    );
  return Boolean(unit);
}

async function ensureProcessBelongsToOrg(
  processId: number | null | undefined,
  orgId: number,
): Promise<boolean> {
  if (!processId) return true;
  const [process] = await db
    .select({ id: sgqProcessesTable.id })
    .from(sgqProcessesTable)
    .where(
      and(
        eq(sgqProcessesTable.id, processId),
        eq(sgqProcessesTable.organizationId, orgId),
      ),
    );
  return Boolean(process);
}

async function ensureUserBelongsToOrg(
  userId: number | null | undefined,
  orgId: number,
): Promise<boolean> {
  if (!userId) return true;
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(eq(usersTable.id, userId), eq(usersTable.organizationId, orgId)),
    );
  return Boolean(user);
}

async function getCustomerOrNull(customerId: number, orgId: number) {
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, customerId),
        eq(customersTable.organizationId, orgId),
      ),
    );
  return customer ?? null;
}

async function getRequirementOrNull(
  requirementId: number,
  customerId: number,
  orgId: number,
) {
  const [requirement] = await db
    .select()
    .from(customerRequirementsTable)
    .where(
      and(
        eq(customerRequirementsTable.id, requirementId),
        eq(customerRequirementsTable.customerId, customerId),
        eq(customerRequirementsTable.organizationId, orgId),
      ),
    );
  return requirement ?? null;
}

function buildRequirementSnapshot(
  requirement: Pick<
    CustomerRequirement,
    | "unitId"
    | "processId"
    | "responsibleUserId"
    | "serviceType"
    | "title"
    | "description"
    | "source"
    | "status"
    | "currentVersion"
  >,
): CustomerRequirementSnapshot {
  return {
    unitId: requirement.unitId ?? null,
    processId: requirement.processId ?? null,
    responsibleUserId: requirement.responsibleUserId ?? null,
    serviceType: requirement.serviceType,
    title: requirement.title,
    description: requirement.description,
    source: requirement.source ?? null,
    status: requirement.status,
    currentVersion: requirement.currentVersion,
  };
}

async function loadCustomerDetail(customerId: number, orgId: number) {
  const customer = await getCustomerOrNull(customerId, orgId);
  if (!customer) return null;

  const requirementRows = await db
    .select({
      id: customerRequirementsTable.id,
      organizationId: customerRequirementsTable.organizationId,
      customerId: customerRequirementsTable.customerId,
      unitId: customerRequirementsTable.unitId,
      unitName: unitsTable.name,
      processId: customerRequirementsTable.processId,
      processName: sgqProcessesTable.name,
      responsibleUserId: customerRequirementsTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      serviceType: customerRequirementsTable.serviceType,
      title: customerRequirementsTable.title,
      description: customerRequirementsTable.description,
      source: customerRequirementsTable.source,
      status: customerRequirementsTable.status,
      currentVersion: customerRequirementsTable.currentVersion,
      createdById: customerRequirementsTable.createdById,
      updatedById: customerRequirementsTable.updatedById,
      createdAt: customerRequirementsTable.createdAt,
      updatedAt: customerRequirementsTable.updatedAt,
    })
    .from(customerRequirementsTable)
    .leftJoin(unitsTable, eq(customerRequirementsTable.unitId, unitsTable.id))
    .leftJoin(
      sgqProcessesTable,
      eq(customerRequirementsTable.processId, sgqProcessesTable.id),
    )
    .leftJoin(
      usersTable,
      eq(customerRequirementsTable.responsibleUserId, usersTable.id),
    )
    .where(
      and(
        eq(customerRequirementsTable.customerId, customerId),
        eq(customerRequirementsTable.organizationId, orgId),
      ),
    )
    .orderBy(desc(customerRequirementsTable.updatedAt));

  const requirementIds = requirementRows.map((requirement) => requirement.id);
  const reviews = requirementIds.length
    ? await db
        .select({
          id: customerRequirementReviewsTable.id,
          requirementId: customerRequirementReviewsTable.requirementId,
          reviewedById: customerRequirementReviewsTable.reviewedById,
          reviewedByName: usersTable.name,
          decision: customerRequirementReviewsTable.decision,
          capacityAnalysis: customerRequirementReviewsTable.capacityAnalysis,
          restrictions: customerRequirementReviewsTable.restrictions,
          justification: customerRequirementReviewsTable.justification,
          decisionDate: customerRequirementReviewsTable.decisionDate,
          attachments: customerRequirementReviewsTable.attachments,
          createdAt: customerRequirementReviewsTable.createdAt,
        })
        .from(customerRequirementReviewsTable)
        .leftJoin(
          usersTable,
          eq(customerRequirementReviewsTable.reviewedById, usersTable.id),
        )
        .where(
          inArray(
            customerRequirementReviewsTable.requirementId,
            requirementIds,
          ),
        )
        .orderBy(desc(customerRequirementReviewsTable.createdAt))
    : [];

  const history = requirementIds.length
    ? await db
        .select({
          id: customerRequirementHistoryTable.id,
          requirementId: customerRequirementHistoryTable.requirementId,
          changedById: customerRequirementHistoryTable.changedById,
          changedByName: usersTable.name,
          changeType: customerRequirementHistoryTable.changeType,
          changeSummary: customerRequirementHistoryTable.changeSummary,
          version: customerRequirementHistoryTable.version,
          previousSnapshot: customerRequirementHistoryTable.previousSnapshot,
          snapshot: customerRequirementHistoryTable.snapshot,
          createdAt: customerRequirementHistoryTable.createdAt,
        })
        .from(customerRequirementHistoryTable)
        .leftJoin(
          usersTable,
          eq(customerRequirementHistoryTable.changedById, usersTable.id),
        )
        .where(
          inArray(
            customerRequirementHistoryTable.requirementId,
            requirementIds,
          ),
        )
        .orderBy(desc(customerRequirementHistoryTable.createdAt))
    : [];

  return {
    id: customer.id,
    organizationId: customer.organizationId,
    personType: customer.personType,
    legalIdentifier: customer.legalIdentifier,
    legalName: customer.legalName,
    tradeName: customer.tradeName,
    responsibleName: customer.responsibleName,
    email: customer.email,
    phone: customer.phone,
    status: customer.status,
    criticality: customer.criticality,
    notes: customer.notes,
    createdById: customer.createdById,
    createdAt: formatTimestamp(customer.createdAt),
    updatedAt: formatTimestamp(customer.updatedAt),
    requirements: requirementRows.map((requirement) => ({
      ...requirement,
      unit: requirement.unitId
        ? { id: requirement.unitId, name: requirement.unitName ?? "" }
        : null,
      process: requirement.processId
        ? { id: requirement.processId, name: requirement.processName ?? "" }
        : null,
      responsibleUser: requirement.responsibleUserId
        ? {
            id: requirement.responsibleUserId,
            name: requirement.responsibleUserName ?? "",
          }
        : null,
      createdAt: formatTimestamp(requirement.createdAt),
      updatedAt: formatTimestamp(requirement.updatedAt),
    })),
    reviews: reviews.map((review) => ({
      ...review,
      reviewedByName: review.reviewedByName ?? null,
      decisionDate: formatTimestamp(review.decisionDate),
      attachments: formatAttachments(review.attachments),
      createdAt: formatTimestamp(review.createdAt),
    })),
    history: history.map((entry) => ({
      ...entry,
      changedByName: entry.changedByName ?? null,
      createdAt: formatTimestamp(entry.createdAt),
    })),
  };
}

router.get(
  "/organizations/:orgId/customers",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = orgParamsSchema.safeParse(req.params);
    const query = listCustomersQuerySchema.safeParse(req.query);
    if (!params.success || !query.success) {
      res.status(400).json({
        error: params.success ? getParseError(query) : params.error.message,
      });
      return;
    }
    if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

    const conditions = [eq(customersTable.organizationId, params.data.orgId)];
    if (query.data.search) {
      const search = `%${query.data.search}%`;
      conditions.push(
        or(
          ilike(customersTable.legalName, search),
          ilike(customersTable.tradeName, search),
          ilike(customersTable.legalIdentifier, search),
          ilike(customersTable.responsibleName, search),
        )!,
      );
    }
    if (query.data.status)
      conditions.push(eq(customersTable.status, query.data.status));
    if (query.data.criticality) {
      conditions.push(eq(customersTable.criticality, query.data.criticality));
    }

    const rows = await db
      .select()
      .from(customersTable)
      .where(and(...conditions))
      .orderBy(customersTable.legalName);

    const customerIds = rows.map((customer) => customer.id);
    const requirements = customerIds.length
      ? await db
          .select({
            customerId: customerRequirementsTable.customerId,
            status: customerRequirementsTable.status,
          })
          .from(customerRequirementsTable)
          .where(inArray(customerRequirementsTable.customerId, customerIds))
      : [];

    const statsByCustomerId = new Map<
      number,
      {
        requirementCount: number;
        pendingRequirementCount: number;
        acceptedRequirementCount: number;
        restrictedRequirementCount: number;
      }
    >();
    for (const requirement of requirements) {
      const stats = statsByCustomerId.get(requirement.customerId) ?? {
        requirementCount: 0,
        pendingRequirementCount: 0,
        acceptedRequirementCount: 0,
        restrictedRequirementCount: 0,
      };
      stats.requirementCount += 1;
      if (
        ["draft", "under_review", "adjustment_required"].includes(
          requirement.status,
        )
      ) {
        stats.pendingRequirementCount += 1;
      }
      if (requirement.status === "accepted")
        stats.acceptedRequirementCount += 1;
      if (requirement.status === "accepted_with_restrictions") {
        stats.restrictedRequirementCount += 1;
      }
      statsByCustomerId.set(requirement.customerId, stats);
    }

    res.json(
      rows.map((customer) => ({
        id: customer.id,
        personType: customer.personType,
        legalIdentifier: customer.legalIdentifier,
        legalName: customer.legalName,
        tradeName: customer.tradeName,
        responsibleName: customer.responsibleName,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        criticality: customer.criticality,
        updatedAt: formatTimestamp(customer.updatedAt),
        ...(statsByCustomerId.get(customer.id) ?? {
          requirementCount: 0,
          pendingRequirementCount: 0,
          acceptedRequirementCount: 0,
          restrictedRequirementCount: 0,
        }),
      })),
    );
  },
);

router.post(
  "/organizations/:orgId/customers",
  requireAuth,
  requireCustomerWrite,
  async (req, res): Promise<void> => {
    const params = orgParamsSchema.safeParse(req.params);
    const body = customerBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.success ? getParseError(body) : params.error.message,
      });
      return;
    }
    if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

    const [created] = await db
      .insert(customersTable)
      .values({
        organizationId: params.data.orgId,
        createdById: req.auth!.userId,
        personType: body.data.personType,
        legalIdentifier: body.data.legalIdentifier,
        legalName: body.data.legalName,
        tradeName: normalizeOptionalString(body.data.tradeName),
        responsibleName: normalizeOptionalString(body.data.responsibleName),
        email: normalizeOptionalString(body.data.email || null),
        phone: normalizeOptionalString(body.data.phone),
        status: body.data.status,
        criticality: body.data.criticality,
        notes: normalizeOptionalString(body.data.notes),
      })
      .returning();

    const detail = await loadCustomerDetail(created.id, params.data.orgId);
    res.status(201).json(detail);
  },
);

router.get(
  "/organizations/:orgId/customers/:customerId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = customerParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

    const detail = await loadCustomerDetail(
      params.data.customerId,
      params.data.orgId,
    );
    if (!detail) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    res.json(detail);
  },
);

router.patch(
  "/organizations/:orgId/customers/:customerId",
  requireAuth,
  requireCustomerWrite,
  async (req, res): Promise<void> => {
    const params = customerParamsSchema.safeParse(req.params);
    const body = customerBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.success ? getParseError(body) : params.error.message,
      });
      return;
    }
    if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

    const customer = await getCustomerOrNull(
      params.data.customerId,
      params.data.orgId,
    );
    if (!customer) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    await db
      .update(customersTable)
      .set({
        personType: body.data.personType,
        legalIdentifier: body.data.legalIdentifier,
        legalName: body.data.legalName,
        tradeName: normalizeOptionalString(body.data.tradeName),
        responsibleName: normalizeOptionalString(body.data.responsibleName),
        email: normalizeOptionalString(body.data.email || null),
        phone: normalizeOptionalString(body.data.phone),
        status: body.data.status,
        criticality: body.data.criticality,
        notes: normalizeOptionalString(body.data.notes),
      })
      .where(eq(customersTable.id, customer.id));

    const detail = await loadCustomerDetail(customer.id, params.data.orgId);
    res.json(detail);
  },
);

router.post(
  "/organizations/:orgId/customers/:customerId/requirements",
  requireAuth,
  requireCustomerWrite,
  async (req, res): Promise<void> => {
    const params = customerParamsSchema.safeParse(req.params);
    const body = requirementBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.success ? getParseError(body) : params.error.message,
      });
      return;
    }
    if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

    const customer = await getCustomerOrNull(
      params.data.customerId,
      params.data.orgId,
    );
    if (!customer) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    const unitOk = await ensureUnitBelongsToOrg(
      body.data.unitId,
      params.data.orgId,
    );
    const processOk = await ensureProcessBelongsToOrg(
      body.data.processId,
      params.data.orgId,
    );
    const userOk = await ensureUserBelongsToOrg(
      body.data.responsibleUserId,
      params.data.orgId,
    );
    if (!unitOk || !processOk || !userOk) {
      res.status(400).json({
        error:
          "Referências inválidas para unidade, processo SGQ ou responsável",
      });
      return;
    }

    const created = await db.transaction(async (tx) => {
      const [requirement] = await tx
        .insert(customerRequirementsTable)
        .values({
          organizationId: params.data.orgId,
          customerId: customer.id,
          unitId: body.data.unitId ?? null,
          processId: body.data.processId ?? null,
          responsibleUserId: body.data.responsibleUserId ?? null,
          serviceType: body.data.serviceType,
          title: body.data.title,
          description: body.data.description,
          source: normalizeOptionalString(body.data.source),
          status: body.data.status,
          currentVersion: 1,
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        })
        .returning();

      await tx.insert(customerRequirementHistoryTable).values({
        requirementId: requirement.id,
        changedById: req.auth!.userId,
        changeType: "created",
        changeSummary:
          body.data.changeSummary ?? "Registro inicial do requisito.",
        version: requirement.currentVersion,
        previousSnapshot: null,
        snapshot: buildRequirementSnapshot(requirement),
      });

      return requirement;
    });

    const detail = await loadCustomerDetail(
      created.customerId,
      params.data.orgId,
    );
    res.status(201).json(detail);
  },
);

router.patch(
  "/organizations/:orgId/customers/:customerId/requirements/:requirementId",
  requireAuth,
  requireCustomerWrite,
  async (req, res): Promise<void> => {
    const params = requirementParamsSchema.safeParse(req.params);
    const body = requirementPatchBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.success ? getParseError(body) : params.error.message,
      });
      return;
    }
    if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

    const requirement = await getRequirementOrNull(
      params.data.requirementId,
      params.data.customerId,
      params.data.orgId,
    );
    if (!requirement) {
      res.status(404).json({ error: "Requisito do cliente não encontrado" });
      return;
    }

    const unitOk = await ensureUnitBelongsToOrg(
      body.data.unitId,
      params.data.orgId,
    );
    const processOk = await ensureProcessBelongsToOrg(
      body.data.processId,
      params.data.orgId,
    );
    const userOk = await ensureUserBelongsToOrg(
      body.data.responsibleUserId,
      params.data.orgId,
    );
    if (!unitOk || !processOk || !userOk) {
      res.status(400).json({
        error:
          "Referências inválidas para unidade, processo SGQ ou responsável",
      });
      return;
    }

    await db.transaction(async (tx) => {
      const previousSnapshot = buildRequirementSnapshot(requirement);
      const nextVersion = requirement.currentVersion + 1;
      const [updated] = await tx
        .update(customerRequirementsTable)
        .set({
          unitId:
            body.data.unitId === undefined
              ? requirement.unitId
              : body.data.unitId,
          processId:
            body.data.processId === undefined
              ? requirement.processId
              : body.data.processId,
          responsibleUserId:
            body.data.responsibleUserId === undefined
              ? requirement.responsibleUserId
              : body.data.responsibleUserId,
          serviceType: body.data.serviceType ?? requirement.serviceType,
          title: body.data.title ?? requirement.title,
          description: body.data.description ?? requirement.description,
          source:
            body.data.source === undefined
              ? requirement.source
              : normalizeOptionalString(body.data.source),
          status: body.data.status ?? requirement.status,
          currentVersion: nextVersion,
          updatedById: req.auth!.userId,
        })
        .where(eq(customerRequirementsTable.id, requirement.id))
        .returning();

      await tx.insert(customerRequirementHistoryTable).values({
        requirementId: requirement.id,
        changedById: req.auth!.userId,
        changeType: "updated",
        changeSummary: body.data.changeSummary ?? "Requisito atualizado.",
        version: nextVersion,
        previousSnapshot,
        snapshot: buildRequirementSnapshot(updated),
      });
    });

    const detail = await loadCustomerDetail(
      params.data.customerId,
      params.data.orgId,
    );
    res.json(detail);
  },
);

router.post(
  "/organizations/:orgId/customers/:customerId/requirements/:requirementId/reviews",
  requireAuth,
  requireCustomerWrite,
  async (req, res): Promise<void> => {
    const params = requirementParamsSchema.safeParse(req.params);
    const body = reviewBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: params.success ? getParseError(body) : params.error.message,
      });
      return;
    }
    if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

    const requirement = await getRequirementOrNull(
      params.data.requirementId,
      params.data.customerId,
      params.data.orgId,
    );
    if (!requirement) {
      res.status(404).json({ error: "Requisito do cliente não encontrado" });
      return;
    }

    const reviewedById = body.data.reviewedById ?? req.auth!.userId;
    if (!(await ensureUserBelongsToOrg(reviewedById, params.data.orgId))) {
      res.status(400).json({ error: "Responsável pela análise inválido" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.insert(customerRequirementReviewsTable).values({
        requirementId: requirement.id,
        reviewedById,
        decision: body.data.decision,
        capacityAnalysis: body.data.capacityAnalysis,
        restrictions: normalizeOptionalString(body.data.restrictions),
        justification: normalizeOptionalString(body.data.justification),
        decisionDate: body.data.decisionDate
          ? new Date(body.data.decisionDate)
          : new Date(),
        attachments: body.data.attachments,
      });

      const previousSnapshot = buildRequirementSnapshot(requirement);
      const nextVersion = requirement.currentVersion + 1;
      const [updated] = await tx
        .update(customerRequirementsTable)
        .set({
          status: body.data.decision,
          currentVersion: nextVersion,
          updatedById: req.auth!.userId,
        })
        .where(eq(customerRequirementsTable.id, requirement.id))
        .returning();

      await tx.insert(customerRequirementHistoryTable).values({
        requirementId: requirement.id,
        changedById: req.auth!.userId,
        changeType: "reviewed",
        changeSummary: "Análise crítica de capacidade registrada.",
        version: nextVersion,
        previousSnapshot,
        snapshot: buildRequirementSnapshot(updated),
      });
    });

    const detail = await loadCustomerDetail(
      params.data.customerId,
      params.data.orgId,
    );
    res.status(201).json(detail);
  },
);

export default router;
