import type { Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  strategicPlanActionsTable,
  strategicPlanObjectivesTable,
  strategicPlansTable,
  strategicPlanSwotItemsTable,
  unitsTable,
  usersTable,
} from "@workspace/db";

export const paramsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive().optional(),
  itemId: z.coerce.number().int().positive().optional(),
});

export const planBodySchema = z.object({
  title: z.string().min(1).optional(),
  standards: z.array(z.string().min(1)).optional(),
  executiveSummary: z.string().nullable().optional(),
  reviewFrequencyMonths: z.number().int().min(1).max(36).optional(),
  nextReviewAt: z.string().datetime().nullable().optional(),
  reviewReason: z.string().nullable().optional(),
  climateChangeRelevant: z.boolean().nullable().optional(),
  climateChangeJustification: z.string().nullable().optional(),
  technicalScope: z.string().nullable().optional(),
  geographicScope: z.string().nullable().optional(),
  policy: z.string().nullable().optional(),
  mission: z.string().nullable().optional(),
  vision: z.string().nullable().optional(),
  values: z.string().nullable().optional(),
  strategicConclusion: z.string().nullable().optional(),
  methodologyNotes: z.string().nullable().optional(),
  legacyMethodology: z.string().nullable().optional(),
  legacyIndicatorsNotes: z.string().nullable().optional(),
  legacyRevisionHistory: z
    .array(
      z.object({
        date: z.string().nullable().optional(),
        reason: z.string().nullable().optional(),
        changedItem: z.string().nullable().optional(),
        revision: z.string().nullable().optional(),
        changedBy: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  importedWorkbookName: z.string().nullable().optional(),
});

export const createPlanBodySchema = planBodySchema.extend({
  title: z.string().min(1),
});

export const swotBodySchema = z.object({
  domain: z.enum(["sgq", "sga", "sgsv", "esg", "governance"]),
  matrixLabel: z.string().nullable().optional(),
  swotType: z.enum(["strength", "weakness", "opportunity", "threat"]),
  environment: z.enum(["internal", "external"]),
  perspective: z.string().nullable().optional(),
  description: z.string().min(1),
  performance: z.number().int().min(0).max(20).nullable().optional(),
  relevance: z.number().int().min(0).max(20).nullable().optional(),
  result: z.number().int().min(0).max(100).nullable().optional(),
  treatmentDecision: z.string().nullable().optional(),
  linkedObjectiveCode: z.string().nullable().optional(),
  linkedObjectiveLabel: z.string().nullable().optional(),
  importedActionReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const interestedPartyBodySchema = z.object({
  name: z.string().min(1),
  expectedRequirements: z.string().nullable().optional(),
  roleInCompany: z.string().nullable().optional(),
  roleSummary: z.string().nullable().optional(),
  relevantToManagementSystem: z.boolean().nullable().optional(),
  legalRequirementApplicable: z.boolean().nullable().optional(),
  monitoringMethod: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const objectiveBodySchema = z.object({
  code: z.string().min(1),
  systemDomain: z.string().nullable().optional(),
  description: z.string().min(1),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const actionBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  swotItemId: z.number().int().positive().nullable().optional(),
  objectiveId: z.number().int().positive().nullable().optional(),
  responsibleUserId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(["pending", "in_progress", "done", "canceled"]).optional(),
  notes: z.string().nullable().optional(),
  unitIds: z.array(z.number().int().positive()).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const importBodySchema = z.object({
  workbookName: z.string().nullable().optional(),
  plan: planBodySchema.extend({
    title: z.string().min(1),
  }),
  swotItems: z
    .array(
      swotBodySchema.extend({
        importKey: z.string().nullable().optional(),
      }),
    )
    .default([]),
  interestedParties: z.array(interestedPartyBodySchema).default([]),
  objectives: z
    .array(
      objectiveBodySchema.extend({
        importKey: z.string().nullable().optional(),
      }),
    )
    .default([]),
  actions: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        swotImportKey: z.string().nullable().optional(),
        objectiveCode: z.string().nullable().optional(),
        responsibleUserId: z.number().int().positive().nullable().optional(),
        dueDate: z.string().datetime().nullable().optional(),
        status: z.enum(["pending", "in_progress", "done", "canceled"]).optional(),
        notes: z.string().nullable().optional(),
        unitIds: z.array(z.number().int().positive()).optional(),
        sortOrder: z.number().int().min(0).optional(),
      }),
    )
    .default([]),
});

export const reviewBodySchema = z.object({
  reviewReason: z.string().nullable().optional(),
  changeSummary: z.string().nullable().optional(),
});

export function parseGovernanceParams(
  rawParams: unknown,
  authOrganizationId: number,
  res: Response,
  options?: { requirePlanId?: boolean; requireItemId?: boolean },
) {
  const parsed = paramsSchema.safeParse(rawParams);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return null;
  }

  if (options?.requirePlanId && !parsed.data.planId) {
    res.status(400).json({ error: "planId é obrigatório" });
    return null;
  }

  if (options?.requireItemId && !parsed.data.itemId) {
    res.status(400).json({ error: "itemId é obrigatório" });
    return null;
  }

  if (parsed.data.orgId !== authOrganizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return null;
  }

  return parsed.data;
}

export async function getPlanOrThrow(planId: number, orgId: number, res: Response) {
  const [plan] = await db
    .select()
    .from(strategicPlansTable)
    .where(and(eq(strategicPlansTable.id, planId), eq(strategicPlansTable.organizationId, orgId)));

  if (!plan) {
    res.status(404).json({ error: "Plano estratégico não encontrado" });
    return null;
  }

  return plan;
}

type SelectExecutor = Pick<typeof db, "select">;

export async function validateActionReferences({
  executor,
  orgId,
  planId,
  responsibleUserId,
  swotItemId,
  objectiveId,
  unitIds,
}: {
  executor: SelectExecutor;
  orgId: number;
  planId: number;
  responsibleUserId?: number | null;
  swotItemId?: number | null;
  objectiveId?: number | null;
  unitIds: number[];
}) {
  if (responsibleUserId) {
    const [user] = await executor
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, responsibleUserId), eq(usersTable.organizationId, orgId)));
    if (!user) return "Responsável inválido para esta organização";
  }

  if (swotItemId) {
    const [item] = await executor
      .select({ id: strategicPlanSwotItemsTable.id })
      .from(strategicPlanSwotItemsTable)
      .where(
        and(eq(strategicPlanSwotItemsTable.id, swotItemId), eq(strategicPlanSwotItemsTable.planId, planId)),
      );
    if (!item) return "Item SWOT vinculado não pertence ao plano";
  }

  if (objectiveId) {
    const [objective] = await executor
      .select({ id: strategicPlanObjectivesTable.id })
      .from(strategicPlanObjectivesTable)
      .where(
        and(
          eq(strategicPlanObjectivesTable.id, objectiveId),
          eq(strategicPlanObjectivesTable.planId, planId),
        ),
      );
    if (!objective) return "Objetivo vinculado não pertence ao plano";
  }

  if (unitIds.length > 0) {
    const units = await executor
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(and(eq(unitsTable.organizationId, orgId), inArray(unitsTable.id, unitIds)));
    if (units.length !== unitIds.length) return "Uma ou mais unidades não pertencem à organização";
  }

  return null;
}

export function getItemOrNotFound<T extends { id: number }>(items: T[], itemId: number, res: Response) {
  const item = items.find((current) => current.id === itemId);
  if (!item) {
    res.status(404).json({ error: "Item não encontrado" });
    return null;
  }
  return item;
}
