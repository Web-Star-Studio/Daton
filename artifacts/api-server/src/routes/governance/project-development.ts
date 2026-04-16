import { Router, type IRouter, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  developmentProjectsTable,
  developmentProjectChangesTable,
  developmentProjectInputsTable,
  developmentProjectOutputsTable,
  developmentProjectReviewsTable,
  developmentProjectStagesTable,
  employeesTable,
  requirementApplicabilityDecisionsTable,
  usersTable,
  type DevelopmentProjectChangeStatus,
  type DevelopmentProjectOutputStatus,
  type DevelopmentProjectReviewOutcome,
  type DevelopmentProjectReviewType,
  type DevelopmentProjectStageStatus,
  type DevelopmentProjectStatus,
  type GovernanceSystemAttachment,
} from "@workspace/db";
import {
  requireAuth,
  requireRole,
  requireWriteAccess,
} from "../../middlewares/auth";

const router: IRouter = Router();

const attachmentSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  contentType: z.string().min(1),
  objectPath: z.string().min(1),
});

const orgParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
});

const decisionParamsSchema = orgParamsSchema.extend({
  decisionId: z.coerce.number().int().positive(),
});

const projectParamsSchema = orgParamsSchema.extend({
  projectId: z.coerce.number().int().positive(),
});

const inputParamsSchema = projectParamsSchema.extend({
  inputId: z.coerce.number().int().positive(),
});

const stageParamsSchema = projectParamsSchema.extend({
  stageId: z.coerce.number().int().positive(),
});

const outputParamsSchema = projectParamsSchema.extend({
  outputId: z.coerce.number().int().positive(),
});

const reviewParamsSchema = projectParamsSchema.extend({
  reviewId: z.coerce.number().int().positive(),
});

const changeParamsSchema = projectParamsSchema.extend({
  changeId: z.coerce.number().int().positive(),
});

const decisionBodySchema = z.object({
  isApplicable: z.boolean(),
  scopeSummary: z.string().trim().min(1).nullable().optional(),
  justification: z.string().trim().min(1),
  responsibleEmployeeId: z.number().int().positive(),
  validFrom: z.string().date().nullable().optional(),
  validUntil: z.string().date().nullable().optional(),
});

const updateDecisionBodySchema = decisionBodySchema.partial();

const projectBodySchema = z.object({
  projectCode: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  objective: z.string().trim().min(1).nullable().optional(),
  status: z
    .enum(["draft", "active", "under_review", "completed", "canceled"])
    .optional(),
  responsibleEmployeeId: z.number().int().positive().nullable().optional(),
  plannedStartDate: z.string().date().nullable().optional(),
  plannedEndDate: z.string().date().nullable().optional(),
  actualEndDate: z.string().date().nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const updateProjectBodySchema = projectBodySchema.partial();

const projectInputBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  source: z.string().trim().min(1).nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateProjectInputBodySchema = projectInputBodySchema.partial();

const projectStageBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  responsibleEmployeeId: z.number().int().positive().nullable().optional(),
  status: z
    .enum(["planned", "in_progress", "completed", "blocked", "canceled"])
    .optional(),
  dueDate: z.string().date().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  evidenceNote: z.string().trim().min(1).nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateProjectStageBodySchema = projectStageBodySchema.partial();

const projectOutputBodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  outputType: z.string().trim().min(1).optional(),
  status: z.enum(["draft", "approved", "released"]).optional(),
  attachments: z.array(attachmentSchema).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateProjectOutputBodySchema = projectOutputBodySchema.partial();

const projectReviewBodySchema = z.object({
  reviewType: z.enum(["review", "verification", "validation"]),
  title: z.string().trim().min(1),
  notes: z.string().trim().min(1).nullable().optional(),
  outcome: z
    .enum(["pending", "approved", "rejected", "needs_changes"])
    .optional(),
  responsibleEmployeeId: z.number().int().positive().nullable().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const updateProjectReviewBodySchema = projectReviewBodySchema.partial();

const projectChangeBodySchema = z.object({
  title: z.string().trim().min(1),
  changeDescription: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  impactDescription: z.string().trim().min(1).nullable().optional(),
  status: z.enum(["pending", "approved", "rejected", "implemented"]).optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const updateProjectChangeBodySchema = projectChangeBodySchema.partial();

function parseOrReject<T>(schema: z.ZodSchema<T>, raw: unknown, res: Response) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return null;
  }
  return parsed.data;
}

function assertOrgAccess(orgId: number, authOrgId: number, res: Response) {
  if (orgId !== authOrgId) {
    res.status(403).json({ error: "Acesso negado" });
    return false;
  }
  return true;
}

function normalizeAttachments(
  attachments?: GovernanceSystemAttachment[],
): GovernanceSystemAttachment[] {
  return attachments ?? [];
}

function assertDateRange(
  validFrom: string | null | undefined,
  validUntil: string | null | undefined,
) {
  if (validFrom && validUntil && validUntil < validFrom) {
    throw new Error(
      "A validade final não pode ser anterior à validade inicial",
    );
  }
}

async function ensureEmployeeBelongsToOrg(
  orgId: number,
  employeeId?: number | null,
) {
  if (!employeeId) return;

  const [employee] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, employeeId),
        eq(employeesTable.organizationId, orgId),
      ),
    );

  if (!employee) {
    throw new Error("Responsável inválido para esta organização");
  }
}

async function ensureDecision(orgId: number, decisionId: number) {
  const [decision] = await db
    .select()
    .from(requirementApplicabilityDecisionsTable)
    .where(
      and(
        eq(requirementApplicabilityDecisionsTable.id, decisionId),
        eq(requirementApplicabilityDecisionsTable.organizationId, orgId),
      ),
    );

  return decision ?? null;
}

async function ensureProject(orgId: number, projectId: number) {
  const [project] = await db
    .select()
    .from(developmentProjectsTable)
    .where(
      and(
        eq(developmentProjectsTable.id, projectId),
        eq(developmentProjectsTable.organizationId, orgId),
      ),
    );

  return project ?? null;
}

async function buildNameMaps(employeeIds: number[], userIds: number[]) {
  const uniqueEmployeeIds = [...new Set(employeeIds)];
  const uniqueUserIds = [...new Set(userIds)];

  const [employees, users] = await Promise.all([
    uniqueEmployeeIds.length > 0
      ? db
          .select({ id: employeesTable.id, name: employeesTable.name })
          .from(employeesTable)
          .where(inArray(employeesTable.id, uniqueEmployeeIds))
      : Promise.resolve([]),
    uniqueUserIds.length > 0
      ? db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, uniqueUserIds))
      : Promise.resolve([]),
  ]);

  return {
    employeeNames: new Map(
      employees.map((employee) => [employee.id, employee.name]),
    ),
    userNames: new Map(users.map((user) => [user.id, user.name])),
  };
}

function serializeDecision(
  decision: typeof requirementApplicabilityDecisionsTable.$inferSelect,
  employeeNames: Map<number, string>,
  userNames: Map<number, string>,
  today: string,
) {
  const isActive =
    decision.approvalStatus === "approved" &&
    (!decision.validFrom || decision.validFrom <= today) &&
    (!decision.validUntil || decision.validUntil >= today);

  return {
    id: decision.id,
    organizationId: decision.organizationId,
    requirementCode: decision.requirementCode,
    isApplicable: decision.isApplicable,
    scopeSummary: decision.scopeSummary,
    justification: decision.justification,
    responsibleEmployeeId: decision.responsibleEmployeeId,
    responsibleEmployeeName: decision.responsibleEmployeeId
      ? (employeeNames.get(decision.responsibleEmployeeId) ?? null)
      : null,
    approvalStatus: decision.approvalStatus,
    approvedById: decision.approvedById,
    approvedByName: decision.approvedById
      ? (userNames.get(decision.approvedById) ?? null)
      : null,
    approvedAt: decision.approvedAt?.toISOString() ?? null,
    validFrom: decision.validFrom,
    validUntil: decision.validUntil,
    isCurrentActive: isActive,
    createdById: decision.createdById,
    createdByName: userNames.get(decision.createdById) ?? null,
    updatedById: decision.updatedById,
    updatedByName: userNames.get(decision.updatedById) ?? null,
    createdAt: decision.createdAt.toISOString(),
    updatedAt: decision.updatedAt.toISOString(),
  };
}

function serializeProjectSummary(
  project: typeof developmentProjectsTable.$inferSelect,
  employeeNames: Map<number, string>,
) {
  return {
    id: project.id,
    organizationId: project.organizationId,
    applicabilityDecisionId: project.applicabilityDecisionId,
    projectCode: project.projectCode,
    title: project.title,
    scope: project.scope,
    objective: project.objective,
    status: project.status,
    responsibleEmployeeId: project.responsibleEmployeeId,
    responsibleEmployeeName: project.responsibleEmployeeId
      ? (employeeNames.get(project.responsibleEmployeeId) ?? null)
      : null,
    plannedStartDate: project.plannedStartDate,
    plannedEndDate: project.plannedEndDate,
    actualEndDate: project.actualEndDate,
    attachments: project.attachments,
    createdById: project.createdById,
    updatedById: project.updatedById,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function serializeProjectInput(
  input: typeof developmentProjectInputsTable.$inferSelect,
) {
  return {
    id: input.id,
    organizationId: input.organizationId,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    source: input.source,
    attachments: input.attachments,
    sortOrder: input.sortOrder,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

function serializeProjectStage(
  stage: typeof developmentProjectStagesTable.$inferSelect,
  employeeNames: Map<number, string>,
) {
  return {
    id: stage.id,
    organizationId: stage.organizationId,
    projectId: stage.projectId,
    title: stage.title,
    description: stage.description,
    responsibleEmployeeId: stage.responsibleEmployeeId,
    responsibleEmployeeName: stage.responsibleEmployeeId
      ? (employeeNames.get(stage.responsibleEmployeeId) ?? null)
      : null,
    status: stage.status,
    dueDate: stage.dueDate,
    completedAt: stage.completedAt?.toISOString() ?? null,
    evidenceNote: stage.evidenceNote,
    attachments: stage.attachments,
    sortOrder: stage.sortOrder,
    createdAt: stage.createdAt.toISOString(),
    updatedAt: stage.updatedAt.toISOString(),
  };
}

function serializeProjectOutput(
  output: typeof developmentProjectOutputsTable.$inferSelect,
) {
  return {
    id: output.id,
    organizationId: output.organizationId,
    projectId: output.projectId,
    title: output.title,
    description: output.description,
    outputType: output.outputType,
    status: output.status,
    attachments: output.attachments,
    sortOrder: output.sortOrder,
    createdAt: output.createdAt.toISOString(),
    updatedAt: output.updatedAt.toISOString(),
  };
}

function serializeProjectReview(
  review: typeof developmentProjectReviewsTable.$inferSelect,
  employeeNames: Map<number, string>,
  userNames: Map<number, string>,
) {
  return {
    id: review.id,
    organizationId: review.organizationId,
    projectId: review.projectId,
    reviewType: review.reviewType,
    title: review.title,
    notes: review.notes,
    outcome: review.outcome,
    responsibleEmployeeId: review.responsibleEmployeeId,
    responsibleEmployeeName: review.responsibleEmployeeId
      ? (employeeNames.get(review.responsibleEmployeeId) ?? null)
      : null,
    occurredAt: review.occurredAt?.toISOString() ?? null,
    attachments: review.attachments,
    createdById: review.createdById,
    createdByName: userNames.get(review.createdById) ?? null,
    createdAt: review.createdAt.toISOString(),
  };
}

function serializeProjectChange(
  change: typeof developmentProjectChangesTable.$inferSelect,
  userNames: Map<number, string>,
) {
  return {
    id: change.id,
    organizationId: change.organizationId,
    projectId: change.projectId,
    title: change.title,
    changeDescription: change.changeDescription,
    reason: change.reason,
    impactDescription: change.impactDescription,
    status: change.status,
    decidedById: change.decidedById,
    decidedByName: change.decidedById
      ? (userNames.get(change.decidedById) ?? null)
      : null,
    decidedAt: change.decidedAt?.toISOString() ?? null,
    attachments: change.attachments,
    createdById: change.createdById,
    updatedById: change.updatedById,
    createdByName: userNames.get(change.createdById) ?? null,
    updatedByName: userNames.get(change.updatedById) ?? null,
    createdAt: change.createdAt.toISOString(),
    updatedAt: change.updatedAt.toISOString(),
  };
}

async function getCurrentApplicabilityState(orgId: number) {
  const decisions = await db
    .select()
    .from(requirementApplicabilityDecisionsTable)
    .where(
      and(
        eq(requirementApplicabilityDecisionsTable.organizationId, orgId),
        eq(requirementApplicabilityDecisionsTable.requirementCode, "8.3"),
      ),
    )
    .orderBy(
      desc(requirementApplicabilityDecisionsTable.approvedAt),
      desc(requirementApplicabilityDecisionsTable.createdAt),
    );

  const today = new Date().toISOString().slice(0, 10);
  const currentDecision =
    decisions.find(
      (decision) =>
        decision.approvalStatus === "approved" &&
        (!decision.validFrom || decision.validFrom <= today) &&
        (!decision.validUntil || decision.validUntil >= today),
    ) ?? null;

  return { currentDecision, decisions, today };
}

async function assertProjectsEnabled(orgId: number) {
  const { currentDecision } = await getCurrentApplicabilityState(orgId);

  if (!currentDecision || !currentDecision.isApplicable) {
    throw new Error(
      "O fluxo de projeto e desenvolvimento só pode ser alterado após uma decisão aprovada de aplicabilidade do item 8.3",
    );
  }

  return currentDecision;
}

async function loadProjectDetail(orgId: number, projectId: number) {
  const [project, inputs, stages, outputs, reviews, changes] =
    await Promise.all([
      ensureProject(orgId, projectId),
      db
        .select()
        .from(developmentProjectInputsTable)
        .where(
          and(
            eq(developmentProjectInputsTable.organizationId, orgId),
            eq(developmentProjectInputsTable.projectId, projectId),
          ),
        )
        .orderBy(
          developmentProjectInputsTable.sortOrder,
          developmentProjectInputsTable.id,
        ),
      db
        .select()
        .from(developmentProjectStagesTable)
        .where(
          and(
            eq(developmentProjectStagesTable.organizationId, orgId),
            eq(developmentProjectStagesTable.projectId, projectId),
          ),
        )
        .orderBy(
          developmentProjectStagesTable.sortOrder,
          developmentProjectStagesTable.id,
        ),
      db
        .select()
        .from(developmentProjectOutputsTable)
        .where(
          and(
            eq(developmentProjectOutputsTable.organizationId, orgId),
            eq(developmentProjectOutputsTable.projectId, projectId),
          ),
        )
        .orderBy(
          developmentProjectOutputsTable.sortOrder,
          developmentProjectOutputsTable.id,
        ),
      db
        .select()
        .from(developmentProjectReviewsTable)
        .where(
          and(
            eq(developmentProjectReviewsTable.organizationId, orgId),
            eq(developmentProjectReviewsTable.projectId, projectId),
          ),
        )
        .orderBy(
          desc(developmentProjectReviewsTable.occurredAt),
          desc(developmentProjectReviewsTable.createdAt),
        ),
      db
        .select()
        .from(developmentProjectChangesTable)
        .where(
          and(
            eq(developmentProjectChangesTable.organizationId, orgId),
            eq(developmentProjectChangesTable.projectId, projectId),
          ),
        )
        .orderBy(desc(developmentProjectChangesTable.createdAt)),
    ]);

  if (!project) {
    return null;
  }

  const employeeIds = [
    project.responsibleEmployeeId,
    ...stages.map((stage) => stage.responsibleEmployeeId),
    ...reviews.map((review) => review.responsibleEmployeeId),
  ].filter((value): value is number => value != null);
  const userIds = [
    project.createdById,
    project.updatedById,
    ...reviews.map((review) => review.createdById),
    ...changes.flatMap((change) => [
      change.createdById,
      change.updatedById,
      change.decidedById,
    ]),
  ].filter((value): value is number => value != null);

  const { employeeNames, userNames } = await buildNameMaps(
    employeeIds,
    userIds,
  );

  return {
    ...serializeProjectSummary(project, employeeNames),
    createdByName: userNames.get(project.createdById) ?? null,
    updatedByName: userNames.get(project.updatedById) ?? null,
    inputs: inputs.map(serializeProjectInput),
    stages: stages.map((stage) => serializeProjectStage(stage, employeeNames)),
    outputs: outputs.map(serializeProjectOutput),
    reviews: reviews.map((review) =>
      serializeProjectReview(review, employeeNames, userNames),
    ),
    changes: changes.map((change) => serializeProjectChange(change, userNames)),
  };
}

router.get(
  "/organizations/:orgId/governance/project-development/applicability",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    const { currentDecision, decisions, today } =
      await getCurrentApplicabilityState(params.orgId);
    const employeeIds = decisions
      .map((decision) => decision.responsibleEmployeeId)
      .filter((value): value is number => value != null);
    const userIds = decisions
      .flatMap((decision) => [
        decision.createdById,
        decision.updatedById,
        decision.approvedById,
      ])
      .filter((value): value is number => value != null);
    const { employeeNames, userNames } = await buildNameMaps(
      employeeIds,
      userIds,
    );

    res.json({
      workflowEnabled: !!currentDecision?.isApplicable,
      currentDecision: currentDecision
        ? serializeDecision(currentDecision, employeeNames, userNames, today)
        : null,
      history: decisions.map((decision) =>
        serializeDecision(decision, employeeNames, userNames, today),
      ),
    });
  },
);

router.post(
  "/organizations/:orgId/governance/project-development/applicability",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    const body = parseOrReject(decisionBodySchema, req.body, res);
    if (!body) return;

    try {
      assertDateRange(body.validFrom, body.validUntil);
      await ensureEmployeeBelongsToOrg(
        params.orgId,
        body.responsibleEmployeeId,
      );

      const [created] = await db
        .insert(requirementApplicabilityDecisionsTable)
        .values({
          organizationId: params.orgId,
          requirementCode: "8.3",
          isApplicable: body.isApplicable,
          scopeSummary: body.scopeSummary ?? null,
          justification: body.justification,
          responsibleEmployeeId: body.responsibleEmployeeId,
          validFrom: body.validFrom ?? null,
          validUntil: body.validUntil ?? null,
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        })
        .returning();

      const { employeeNames, userNames } = await buildNameMaps(
        created.responsibleEmployeeId ? [created.responsibleEmployeeId] : [],
        [created.createdById, created.updatedById],
      );

      res
        .status(201)
        .json(
          serializeDecision(
            created,
            employeeNames,
            userNames,
            new Date().toISOString().slice(0, 10),
          ),
        );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.patch(
  "/organizations/:orgId/governance/project-development/applicability/:decisionId",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = parseOrReject(decisionParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    const body = parseOrReject(updateDecisionBodySchema, req.body, res);
    if (!body) return;

    try {
      const existing = await ensureDecision(params.orgId, params.decisionId);
      if (!existing) {
        res
          .status(404)
          .json({ error: "Decisão de aplicabilidade não encontrada" });
        return;
      }
      if (existing.approvalStatus !== "pending") {
        res.status(409).json({
          error: "Somente decisões pendentes podem ser editadas",
        });
        return;
      }

      const nextValidFrom = body.validFrom ?? existing.validFrom;
      const nextValidUntil = body.validUntil ?? existing.validUntil;
      assertDateRange(nextValidFrom, nextValidUntil);
      await ensureEmployeeBelongsToOrg(
        params.orgId,
        body.responsibleEmployeeId ?? existing.responsibleEmployeeId,
      );

      const [updated] = await db
        .update(requirementApplicabilityDecisionsTable)
        .set({
          isApplicable: body.isApplicable ?? existing.isApplicable,
          scopeSummary:
            body.scopeSummary === undefined
              ? existing.scopeSummary
              : body.scopeSummary,
          justification: body.justification ?? existing.justification,
          responsibleEmployeeId:
            body.responsibleEmployeeId ?? existing.responsibleEmployeeId,
          validFrom: nextValidFrom ?? null,
          validUntil: nextValidUntil ?? null,
          updatedById: req.auth!.userId,
          updatedAt: new Date(),
        })
        .where(eq(requirementApplicabilityDecisionsTable.id, params.decisionId))
        .returning();

      const { employeeNames, userNames } = await buildNameMaps(
        updated.responsibleEmployeeId ? [updated.responsibleEmployeeId] : [],
        [updated.createdById, updated.updatedById],
      );

      res.json(
        serializeDecision(
          updated,
          employeeNames,
          userNames,
          new Date().toISOString().slice(0, 10),
        ),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post(
  "/organizations/:orgId/governance/project-development/applicability/:decisionId/approve",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const params = parseOrReject(decisionParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    try {
      const existing = await ensureDecision(params.orgId, params.decisionId);
      if (!existing) {
        res
          .status(404)
          .json({ error: "Decisão de aplicabilidade não encontrada" });
        return;
      }
      if (existing.approvalStatus !== "pending") {
        res.status(409).json({
          error: "Somente decisões pendentes podem ser aprovadas",
        });
        return;
      }
      if (!existing.responsibleEmployeeId) {
        res.status(400).json({
          error:
            "A decisão precisa ter um responsável válido antes da aprovação",
        });
        return;
      }
      assertDateRange(existing.validFrom, existing.validUntil);

      const [approved] = await db.transaction(async (tx) => {
        await tx
          .update(requirementApplicabilityDecisionsTable)
          .set({
            approvalStatus: "superseded",
            updatedById: req.auth!.userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(
                requirementApplicabilityDecisionsTable.organizationId,
                params.orgId,
              ),
              eq(requirementApplicabilityDecisionsTable.requirementCode, "8.3"),
              eq(
                requirementApplicabilityDecisionsTable.approvalStatus,
                "approved",
              ),
            ),
          );

        return tx
          .update(requirementApplicabilityDecisionsTable)
          .set({
            approvalStatus: "approved",
            approvedById: req.auth!.userId,
            approvedAt: new Date(),
            updatedById: req.auth!.userId,
            updatedAt: new Date(),
          })
          .where(
            eq(requirementApplicabilityDecisionsTable.id, params.decisionId),
          )
          .returning();
      });

      const { employeeNames, userNames } = await buildNameMaps(
        approved.responsibleEmployeeId ? [approved.responsibleEmployeeId] : [],
        [
          approved.createdById,
          approved.updatedById,
          approved.approvedById ?? req.auth!.userId,
        ],
      );

      res.json(
        serializeDecision(
          approved,
          employeeNames,
          userNames,
          new Date().toISOString().slice(0, 10),
        ),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.get(
  "/organizations/:orgId/governance/project-development/projects",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    const projects = await db
      .select()
      .from(developmentProjectsTable)
      .where(eq(developmentProjectsTable.organizationId, params.orgId))
      .orderBy(desc(developmentProjectsTable.updatedAt));

    const employeeIds = projects
      .map((project) => project.responsibleEmployeeId)
      .filter((value): value is number => value != null);
    const { employeeNames } = await buildNameMaps(employeeIds, []);

    res.json(
      projects.map((project) =>
        serializeProjectSummary(project, employeeNames),
      ),
    );
  },
);

router.post(
  "/organizations/:orgId/governance/project-development/projects",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(orgParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    const body = parseOrReject(projectBodySchema, req.body, res);
    if (!body) return;

    try {
      const currentDecision = await assertProjectsEnabled(params.orgId);
      await ensureEmployeeBelongsToOrg(
        params.orgId,
        body.responsibleEmployeeId,
      );

      const [project] = await db
        .insert(developmentProjectsTable)
        .values({
          organizationId: params.orgId,
          applicabilityDecisionId: currentDecision.id,
          projectCode: body.projectCode ?? null,
          title: body.title,
          scope: body.scope,
          objective: body.objective ?? null,
          status: body.status ?? "draft",
          responsibleEmployeeId: body.responsibleEmployeeId ?? null,
          plannedStartDate: body.plannedStartDate ?? null,
          plannedEndDate: body.plannedEndDate ?? null,
          actualEndDate: body.actualEndDate ?? null,
          attachments: normalizeAttachments(body.attachments),
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        })
        .returning();

      const { employeeNames } = await buildNameMaps(
        project.responsibleEmployeeId ? [project.responsibleEmployeeId] : [],
        [],
      );

      res.status(201).json(serializeProjectSummary(project, employeeNames));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.get(
  "/organizations/:orgId/governance/project-development/projects/:projectId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = parseOrReject(projectParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    const detail = await loadProjectDetail(params.orgId, params.projectId);
    if (!detail) {
      res
        .status(404)
        .json({ error: "Projeto de desenvolvimento não encontrado" });
      return;
    }

    res.json(detail);
  },
);

router.patch(
  "/organizations/:orgId/governance/project-development/projects/:projectId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(projectParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    const body = parseOrReject(updateProjectBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);

      const existing = await ensureProject(params.orgId, params.projectId);
      if (!existing) {
        res
          .status(404)
          .json({ error: "Projeto de desenvolvimento não encontrado" });
        return;
      }

      await ensureEmployeeBelongsToOrg(
        params.orgId,
        body.responsibleEmployeeId ?? existing.responsibleEmployeeId,
      );

      const [updated] = await db
        .update(developmentProjectsTable)
        .set({
          projectCode:
            body.projectCode === undefined
              ? existing.projectCode
              : body.projectCode,
          title: body.title ?? existing.title,
          scope: body.scope ?? existing.scope,
          objective:
            body.objective === undefined ? existing.objective : body.objective,
          status: (body.status ?? existing.status) as DevelopmentProjectStatus,
          responsibleEmployeeId:
            body.responsibleEmployeeId === undefined
              ? existing.responsibleEmployeeId
              : body.responsibleEmployeeId,
          plannedStartDate:
            body.plannedStartDate === undefined
              ? existing.plannedStartDate
              : body.plannedStartDate,
          plannedEndDate:
            body.plannedEndDate === undefined
              ? existing.plannedEndDate
              : body.plannedEndDate,
          actualEndDate:
            body.actualEndDate === undefined
              ? existing.actualEndDate
              : body.actualEndDate,
          attachments:
            body.attachments === undefined
              ? existing.attachments
              : normalizeAttachments(body.attachments),
          updatedById: req.auth!.userId,
          updatedAt: new Date(),
        })
        .where(eq(developmentProjectsTable.id, params.projectId))
        .returning();

      const { employeeNames } = await buildNameMaps(
        updated.responsibleEmployeeId ? [updated.responsibleEmployeeId] : [],
        [],
      );

      res.json(serializeProjectSummary(updated, employeeNames));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post(
  "/organizations/:orgId/governance/project-development/projects/:projectId/inputs",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(projectParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(projectInputBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const project = await ensureProject(params.orgId, params.projectId);
      if (!project) {
        res
          .status(404)
          .json({ error: "Projeto de desenvolvimento não encontrado" });
        return;
      }

      const [created] = await db
        .insert(developmentProjectInputsTable)
        .values({
          organizationId: params.orgId,
          projectId: params.projectId,
          title: body.title,
          description: body.description ?? null,
          source: body.source ?? null,
          attachments: normalizeAttachments(body.attachments),
          sortOrder: body.sortOrder ?? 0,
        })
        .returning();

      res.status(201).json(serializeProjectInput(created));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.patch(
  "/organizations/:orgId/governance/project-development/projects/:projectId/inputs/:inputId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(inputParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(updateProjectInputBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const [existing] = await db
        .select()
        .from(developmentProjectInputsTable)
        .where(
          and(
            eq(developmentProjectInputsTable.id, params.inputId),
            eq(developmentProjectInputsTable.projectId, params.projectId),
            eq(developmentProjectInputsTable.organizationId, params.orgId),
          ),
        );

      if (!existing) {
        res.status(404).json({ error: "Entrada do projeto não encontrada" });
        return;
      }

      const [updated] = await db
        .update(developmentProjectInputsTable)
        .set({
          title: body.title ?? existing.title,
          description:
            body.description === undefined
              ? existing.description
              : body.description,
          source: body.source === undefined ? existing.source : body.source,
          attachments:
            body.attachments === undefined
              ? existing.attachments
              : normalizeAttachments(body.attachments),
          sortOrder: body.sortOrder ?? existing.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(developmentProjectInputsTable.id, params.inputId))
        .returning();

      res.json(serializeProjectInput(updated));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.delete(
  "/organizations/:orgId/governance/project-development/projects/:projectId/inputs/:inputId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(inputParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    try {
      await assertProjectsEnabled(params.orgId);
      await db
        .delete(developmentProjectInputsTable)
        .where(
          and(
            eq(developmentProjectInputsTable.id, params.inputId),
            eq(developmentProjectInputsTable.projectId, params.projectId),
            eq(developmentProjectInputsTable.organizationId, params.orgId),
          ),
        );

      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post(
  "/organizations/:orgId/governance/project-development/projects/:projectId/stages",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(projectParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(projectStageBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const project = await ensureProject(params.orgId, params.projectId);
      if (!project) {
        res
          .status(404)
          .json({ error: "Projeto de desenvolvimento não encontrado" });
        return;
      }
      await ensureEmployeeBelongsToOrg(
        params.orgId,
        body.responsibleEmployeeId,
      );

      const [created] = await db
        .insert(developmentProjectStagesTable)
        .values({
          organizationId: params.orgId,
          projectId: params.projectId,
          title: body.title,
          description: body.description ?? null,
          responsibleEmployeeId: body.responsibleEmployeeId ?? null,
          status: body.status ?? "planned",
          dueDate: body.dueDate ?? null,
          completedAt: body.completedAt ? new Date(body.completedAt) : null,
          evidenceNote: body.evidenceNote ?? null,
          attachments: normalizeAttachments(body.attachments),
          sortOrder: body.sortOrder ?? 0,
        })
        .returning();

      const { employeeNames } = await buildNameMaps(
        created.responsibleEmployeeId ? [created.responsibleEmployeeId] : [],
        [],
      );

      res.status(201).json(serializeProjectStage(created, employeeNames));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.patch(
  "/organizations/:orgId/governance/project-development/projects/:projectId/stages/:stageId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(stageParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(updateProjectStageBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const [existing] = await db
        .select()
        .from(developmentProjectStagesTable)
        .where(
          and(
            eq(developmentProjectStagesTable.id, params.stageId),
            eq(developmentProjectStagesTable.projectId, params.projectId),
            eq(developmentProjectStagesTable.organizationId, params.orgId),
          ),
        );

      if (!existing) {
        res.status(404).json({ error: "Etapa do projeto não encontrada" });
        return;
      }

      await ensureEmployeeBelongsToOrg(
        params.orgId,
        body.responsibleEmployeeId ?? existing.responsibleEmployeeId,
      );

      const [updated] = await db
        .update(developmentProjectStagesTable)
        .set({
          title: body.title ?? existing.title,
          description:
            body.description === undefined
              ? existing.description
              : body.description,
          responsibleEmployeeId:
            body.responsibleEmployeeId === undefined
              ? existing.responsibleEmployeeId
              : body.responsibleEmployeeId,
          status: (body.status ??
            existing.status) as DevelopmentProjectStageStatus,
          dueDate: body.dueDate === undefined ? existing.dueDate : body.dueDate,
          completedAt:
            body.completedAt === undefined
              ? existing.completedAt
              : body.completedAt
                ? new Date(body.completedAt)
                : null,
          evidenceNote:
            body.evidenceNote === undefined
              ? existing.evidenceNote
              : body.evidenceNote,
          attachments:
            body.attachments === undefined
              ? existing.attachments
              : normalizeAttachments(body.attachments),
          sortOrder: body.sortOrder ?? existing.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(developmentProjectStagesTable.id, params.stageId))
        .returning();

      const { employeeNames } = await buildNameMaps(
        updated.responsibleEmployeeId ? [updated.responsibleEmployeeId] : [],
        [],
      );

      res.json(serializeProjectStage(updated, employeeNames));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.delete(
  "/organizations/:orgId/governance/project-development/projects/:projectId/stages/:stageId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(stageParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    try {
      await assertProjectsEnabled(params.orgId);
      await db
        .delete(developmentProjectStagesTable)
        .where(
          and(
            eq(developmentProjectStagesTable.id, params.stageId),
            eq(developmentProjectStagesTable.projectId, params.projectId),
            eq(developmentProjectStagesTable.organizationId, params.orgId),
          ),
        );

      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post(
  "/organizations/:orgId/governance/project-development/projects/:projectId/outputs",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(projectParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(projectOutputBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const project = await ensureProject(params.orgId, params.projectId);
      if (!project) {
        res
          .status(404)
          .json({ error: "Projeto de desenvolvimento não encontrado" });
        return;
      }

      const [created] = await db
        .insert(developmentProjectOutputsTable)
        .values({
          organizationId: params.orgId,
          projectId: params.projectId,
          title: body.title,
          description: body.description ?? null,
          outputType: body.outputType ?? "other",
          status: body.status ?? "draft",
          attachments: normalizeAttachments(body.attachments),
          sortOrder: body.sortOrder ?? 0,
        })
        .returning();

      res.status(201).json(serializeProjectOutput(created));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.patch(
  "/organizations/:orgId/governance/project-development/projects/:projectId/outputs/:outputId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(outputParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(updateProjectOutputBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const [existing] = await db
        .select()
        .from(developmentProjectOutputsTable)
        .where(
          and(
            eq(developmentProjectOutputsTable.id, params.outputId),
            eq(developmentProjectOutputsTable.projectId, params.projectId),
            eq(developmentProjectOutputsTable.organizationId, params.orgId),
          ),
        );

      if (!existing) {
        res.status(404).json({ error: "Saída do projeto não encontrada" });
        return;
      }

      const [updated] = await db
        .update(developmentProjectOutputsTable)
        .set({
          title: body.title ?? existing.title,
          description:
            body.description === undefined
              ? existing.description
              : body.description,
          outputType: body.outputType ?? existing.outputType,
          status: (body.status ??
            existing.status) as DevelopmentProjectOutputStatus,
          attachments:
            body.attachments === undefined
              ? existing.attachments
              : normalizeAttachments(body.attachments),
          sortOrder: body.sortOrder ?? existing.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(developmentProjectOutputsTable.id, params.outputId))
        .returning();

      res.json(serializeProjectOutput(updated));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.delete(
  "/organizations/:orgId/governance/project-development/projects/:projectId/outputs/:outputId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(outputParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    try {
      await assertProjectsEnabled(params.orgId);
      await db
        .delete(developmentProjectOutputsTable)
        .where(
          and(
            eq(developmentProjectOutputsTable.id, params.outputId),
            eq(developmentProjectOutputsTable.projectId, params.projectId),
            eq(developmentProjectOutputsTable.organizationId, params.orgId),
          ),
        );

      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post(
  "/organizations/:orgId/governance/project-development/projects/:projectId/reviews",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(projectParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(projectReviewBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const project = await ensureProject(params.orgId, params.projectId);
      if (!project) {
        res
          .status(404)
          .json({ error: "Projeto de desenvolvimento não encontrado" });
        return;
      }
      await ensureEmployeeBelongsToOrg(
        params.orgId,
        body.responsibleEmployeeId,
      );

      const [created] = await db
        .insert(developmentProjectReviewsTable)
        .values({
          organizationId: params.orgId,
          projectId: params.projectId,
          reviewType: body.reviewType,
          title: body.title,
          notes: body.notes ?? null,
          outcome: body.outcome ?? "pending",
          responsibleEmployeeId: body.responsibleEmployeeId ?? null,
          occurredAt: body.occurredAt ? new Date(body.occurredAt) : null,
          attachments: normalizeAttachments(body.attachments),
          createdById: req.auth!.userId,
        })
        .returning();

      const { employeeNames, userNames } = await buildNameMaps(
        created.responsibleEmployeeId ? [created.responsibleEmployeeId] : [],
        [created.createdById],
      );

      res
        .status(201)
        .json(serializeProjectReview(created, employeeNames, userNames));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.patch(
  "/organizations/:orgId/governance/project-development/projects/:projectId/reviews/:reviewId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(updateProjectReviewBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const [existing] = await db
        .select()
        .from(developmentProjectReviewsTable)
        .where(
          and(
            eq(developmentProjectReviewsTable.id, params.reviewId),
            eq(developmentProjectReviewsTable.projectId, params.projectId),
            eq(developmentProjectReviewsTable.organizationId, params.orgId),
          ),
        );

      if (!existing) {
        res.status(404).json({ error: "Registro de revisão não encontrado" });
        return;
      }

      await ensureEmployeeBelongsToOrg(
        params.orgId,
        body.responsibleEmployeeId ?? existing.responsibleEmployeeId,
      );

      const [updated] = await db
        .update(developmentProjectReviewsTable)
        .set({
          reviewType: (body.reviewType ??
            existing.reviewType) as DevelopmentProjectReviewType,
          title: body.title ?? existing.title,
          notes: body.notes === undefined ? existing.notes : body.notes,
          outcome: (body.outcome ??
            existing.outcome) as DevelopmentProjectReviewOutcome,
          responsibleEmployeeId:
            body.responsibleEmployeeId === undefined
              ? existing.responsibleEmployeeId
              : body.responsibleEmployeeId,
          occurredAt:
            body.occurredAt === undefined
              ? existing.occurredAt
              : body.occurredAt
                ? new Date(body.occurredAt)
                : null,
          attachments:
            body.attachments === undefined
              ? existing.attachments
              : normalizeAttachments(body.attachments),
        })
        .where(eq(developmentProjectReviewsTable.id, params.reviewId))
        .returning();

      const { employeeNames, userNames } = await buildNameMaps(
        updated.responsibleEmployeeId ? [updated.responsibleEmployeeId] : [],
        [updated.createdById],
      );

      res.json(serializeProjectReview(updated, employeeNames, userNames));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.delete(
  "/organizations/:orgId/governance/project-development/projects/:projectId/reviews/:reviewId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(reviewParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    try {
      await assertProjectsEnabled(params.orgId);
      await db
        .delete(developmentProjectReviewsTable)
        .where(
          and(
            eq(developmentProjectReviewsTable.id, params.reviewId),
            eq(developmentProjectReviewsTable.projectId, params.projectId),
            eq(developmentProjectReviewsTable.organizationId, params.orgId),
          ),
        );

      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.post(
  "/organizations/:orgId/governance/project-development/projects/:projectId/changes",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(projectParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(projectChangeBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const project = await ensureProject(params.orgId, params.projectId);
      if (!project) {
        res
          .status(404)
          .json({ error: "Projeto de desenvolvimento não encontrado" });
        return;
      }

      const nextStatus = body.status ?? "pending";

      const [created] = await db
        .insert(developmentProjectChangesTable)
        .values({
          organizationId: params.orgId,
          projectId: params.projectId,
          title: body.title,
          changeDescription: body.changeDescription,
          reason: body.reason,
          impactDescription: body.impactDescription ?? null,
          status: nextStatus,
          decidedById: nextStatus === "pending" ? null : req.auth!.userId,
          decidedAt: nextStatus === "pending" ? null : new Date(),
          attachments: normalizeAttachments(body.attachments),
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        })
        .returning();

      const { userNames } = await buildNameMaps(
        [],
        [
          created.createdById,
          created.updatedById,
          created.decidedById ?? req.auth!.userId,
        ],
      );

      res.status(201).json(serializeProjectChange(created, userNames));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.patch(
  "/organizations/:orgId/governance/project-development/projects/:projectId/changes/:changeId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(changeParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;
    const body = parseOrReject(updateProjectChangeBodySchema, req.body, res);
    if (!body) return;

    try {
      await assertProjectsEnabled(params.orgId);
      const [existing] = await db
        .select()
        .from(developmentProjectChangesTable)
        .where(
          and(
            eq(developmentProjectChangesTable.id, params.changeId),
            eq(developmentProjectChangesTable.projectId, params.projectId),
            eq(developmentProjectChangesTable.organizationId, params.orgId),
          ),
        );

      if (!existing) {
        res.status(404).json({ error: "Mudança do projeto não encontrada" });
        return;
      }

      const nextStatus = (body.status ??
        existing.status) as DevelopmentProjectChangeStatus;
      const nextDecisionMeta =
        nextStatus === "pending"
          ? { decidedById: null, decidedAt: null }
          : { decidedById: req.auth!.userId, decidedAt: new Date() };

      const [updated] = await db
        .update(developmentProjectChangesTable)
        .set({
          title: body.title ?? existing.title,
          changeDescription:
            body.changeDescription ?? existing.changeDescription,
          reason: body.reason ?? existing.reason,
          impactDescription:
            body.impactDescription === undefined
              ? existing.impactDescription
              : body.impactDescription,
          status: nextStatus,
          attachments:
            body.attachments === undefined
              ? existing.attachments
              : normalizeAttachments(body.attachments),
          updatedById: req.auth!.userId,
          updatedAt: new Date(),
          ...nextDecisionMeta,
        })
        .where(eq(developmentProjectChangesTable.id, params.changeId))
        .returning();

      const { userNames } = await buildNameMaps(
        [],
        [
          updated.createdById,
          updated.updatedById,
          updated.decidedById ?? req.auth!.userId,
        ],
      );

      res.json(serializeProjectChange(updated, userNames));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

router.delete(
  "/organizations/:orgId/governance/project-development/projects/:projectId/changes/:changeId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = parseOrReject(changeParamsSchema, req.params, res);
    if (!params) return;
    if (!assertOrgAccess(params.orgId, req.auth!.organizationId, res)) return;

    try {
      await assertProjectsEnabled(params.orgId);
      await db
        .delete(developmentProjectChangesTable)
        .where(
          and(
            eq(developmentProjectChangesTable.id, params.changeId),
            eq(developmentProjectChangesTable.projectId, params.projectId),
            eq(developmentProjectChangesTable.organizationId, params.orgId),
          ),
        );

      res.sendStatus(204);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
);

export default router;
