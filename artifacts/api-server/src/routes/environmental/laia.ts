import { Router, type Request, type Response } from "express";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  db,
  laiaAssessmentsTable,
  laiaBranchConfigsTable,
  laiaImportJobsTable,
  laiaMethodologiesTable,
  laiaMethodologyVersionsTable,
  laiaMonitoringPlansTable,
  laiaMonitoringRecordsTable,
  laiaRequirementLinksTable,
  laiaRevisionChangesTable,
  laiaRevisionsTable,
  laiaSectorsTable,
  legislationsTable,
  sgqCommunicationPlansTable,
  usersTable,
  unitsTable,
} from "@workspace/db";
import { requireWriteAccess } from "../../middlewares/auth";

const router = Router();

const scoreThresholdsSchema = z.object({
  negligibleMax: z.number().int(),
  moderateMax: z.number().int(),
});

const communicationPlanSchema = z.object({
  channel: z.string().min(1),
  audience: z.string().min(1),
  periodicity: z.string().min(1),
  requiresAcknowledgment: z.boolean().default(false),
  notes: z.string().nullable().optional(),
});

const requirementLinkSchema = z.object({
  type: z.enum(["legal", "other", "stakeholder", "strategic"]),
  legislationId: z.number().int().positive().nullable().optional(),
  title: z.string().min(1),
  requirementReference: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const branchConfigSchema = z.object({
  unitId: z.number().int().positive(),
  surveyStatus: z.enum(["nao_levantado", "em_levantamento", "levantado"]),
});

const sectorSchema = z.object({
  unitId: z.number().int().positive().nullable().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const methodologySchema = z.object({
  name: z.string().min(1).default("Metodologia LAIA"),
  title: z.string().min(1),
  consequenceMatrix: z.record(z.string(), z.any()),
  frequencyProbabilityMatrix: z.record(z.string(), z.any()),
  scoreThresholds: scoreThresholdsSchema,
  moderateSignificanceRule: z.string().min(1),
  documentContent: z
    .object({
      objetivo: z.string(),
      aplicacao: z.string(),
      generalidades: z.string(),
      definicoes: z.array(z.object({ termo: z.string(), descricao: z.string() })),
      responsabilidades: z.array(z.object({ cargo: z.string(), atribuicoes: z.string() })),
      procedimentoLevantamento: z.string(),
      procedimentoAnalise: z.string(),
      classificacaoAssuntos: z.array(z.string()),
      classificacaoAplicabilidade: z.array(z.object({ codigo: z.string(), nome: z.string(), descricao: z.string() })),
      niveisAtendimento: z.array(z.object({ nivel: z.string(), nome: z.string(), descricao: z.string() })),
      outrosRequisitos: z.string(),
    })
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
});

const assessmentBodySchema = z.object({
  unitId: z.number().int().positive().nullable().optional(),
  sectorId: z.number().int().positive().nullable().optional(),
  methodologyVersionId: z.number().int().positive().nullable().optional(),
  aspectCode: z.string().min(1).nullable().optional(),
  mode: z.enum(["quick", "complete"]).default("quick"),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  activityOperation: z.string().min(1),
  environmentalAspect: z.string().min(1),
  environmentalImpact: z.string().min(1),
  temporality: z.string().nullable().optional(),
  operationalSituation: z.string().nullable().optional(),
  incidence: z.string().nullable().optional(),
  impactClass: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  severity: z.string().nullable().optional(),
  consequenceScore: z.number().int().nullable().optional(),
  frequencyProbability: z.string().nullable().optional(),
  frequencyProbabilityScore: z.number().int().nullable().optional(),
  totalScore: z.number().int().nullable().optional(),
  category: z.enum(["desprezivel", "moderado", "critico"]).nullable().optional(),
  significance: z.enum(["significant", "not_significant"]).nullable().optional(),
  significanceReason: z.string().nullable().optional(),
  hasLegalRequirements: z.boolean().optional(),
  hasStakeholderDemand: z.boolean().optional(),
  hasStrategicOption: z.boolean().optional(),
  normalCondition: z.boolean().optional(),
  abnormalCondition: z.boolean().optional(),
  startupShutdown: z.boolean().optional(),
  emergencyScenario: z.string().nullable().optional(),
  changeContext: z.string().nullable().optional(),
  lifecycleStages: z.array(z.string().min(1)).optional(),
  controlLevel: z.enum(["direct_control", "influence", "none"]).default("direct_control"),
  influenceLevel: z.string().nullable().optional(),
  outsourcedProcess: z.string().nullable().optional(),
  supplierReference: z.string().nullable().optional(),
  controlTypes: z.array(z.string().min(1)).optional(),
  existingControls: z.string().nullable().optional(),
  controlRequired: z.string().nullable().optional(),
  controlResponsibleUserId: z.number().int().positive().nullable().optional(),
  controlDueAt: z.string().datetime().nullable().optional(),
  communicationRequired: z.boolean().optional(),
  communicationNotes: z.string().nullable().optional(),
  reviewFrequencyDays: z.number().int().positive().nullable().optional(),
  nextReviewAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  requirements: z.array(requirementLinkSchema).optional(),
  communicationPlans: z.array(communicationPlanSchema).optional(),
});

const assessmentListQuerySchema = z.object({
  unitId: z.coerce.number().int().positive().optional(),
  sectorId: z.coerce.number().int().positive().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  significance: z.enum(["significant", "not_significant"]).optional(),
  category: z.enum(["desprezivel", "moderado", "critico"]).optional(),
  q: z.string().optional(),
});

const monitoringPlanSchema = z.object({
  title: z.string().min(1),
  objective: z.string().min(1),
  method: z.string().min(1),
  indicator: z.string().nullable().optional(),
  frequency: z.string().min(1),
  delayCriteria: z.string().nullable().optional(),
  responsibleUserId: z.number().int().positive().nullable().optional(),
  status: z
    .enum(["draft", "active", "overdue", "completed", "canceled"])
    .default("draft"),
  nextDueAt: z.string().datetime().nullable().optional(),
});

const monitoringRecordSchema = z.object({
  executedAt: z.string().datetime(),
  result: z
    .enum(["within_limit", "out_of_limit", "informational"])
    .default("informational"),
  measuredValue: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  evidence: z
    .array(
      z.object({
        fileName: z.string().min(1),
        objectPath: z.string().min(1),
        contentType: z.string().nullable().optional(),
      }),
    )
    .optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
});

const importRowSchema = assessmentBodySchema.extend({
  sectorCode: z.string().nullable().optional(),
  sectorName: z.string().nullable().optional(),
});

const importSchema = z.object({
  unitId: z.number().int().positive().nullable().optional(),
  workbookName: z.string().nullable().optional(),
  rows: z.array(importRowSchema),
});

const paramsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
  unitId: z.coerce.number().int().positive().optional(),
  assessmentId: z.coerce.number().int().positive().optional(),
  planId: z.coerce.number().int().positive().optional(),
  sectorId: z.coerce.number().int().positive().optional(),
});

const sectorsQuerySchema = z.object({
  unitId: z.coerce.number().int().positive().optional(),
});

function requireOrgAccess(req: Request, res: Response, orgId: number) {
  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return false;
  }
  return true;
}

function buildDefaultMethodology() {
  return {
    title: "Metodologia LAIA padrão",
    consequenceMatrix: {
      local: { baixa: 20, media: 40, alta: 60 },
      regional: { baixa: 25, media: 45, alta: 65 },
      global: { baixa: 30, media: 50, alta: 70 },
    },
    frequencyProbabilityMatrix: {
      baixa: 10,
      media: 20,
      alta: 30,
    },
    scoreThresholds: {
      negligibleMax: 49,
      moderateMax: 70,
    },
    moderateSignificanceRule:
      "Moderado é significativo quando houver requisito legal, parte interessada ou opção estratégica.",
  };
}

function parseDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function normalizeComparableValue(value?: string | null) {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function incrementBucket(
  buckets: Record<string, number>,
  key: string | undefined,
) {
  const safeKey = key || "nao_informado";
  buckets[safeKey] = (buckets[safeKey] || 0) + 1;
}

function normalizeTemporality(value?: string | null) {
  const normalized = normalizeComparableValue(value);
  if (!normalized) return "nao_informado";
  if (["futura", "futuro", "future"].includes(normalized)) return "futura";
  if (["atual", "presente", "current"].includes(normalized)) return "atual";
  if (["passada", "passado", "anterior", "past"].includes(normalized)) {
    return "passada";
  }
  return "nao_informado";
}

function normalizeOperationalSituation(value?: string | null) {
  const normalized = normalizeComparableValue(value);
  if (!normalized) return "nao_informado";
  if (["anormal"].includes(normalized)) return "anormal";
  if (["normal"].includes(normalized)) return "normal";
  if (["emergencia", "emergency"].includes(normalized)) return "emergencia";
  return "nao_informado";
}

function normalizeIncidence(value?: string | null) {
  const normalized = normalizeComparableValue(value);
  if (!normalized) return "nao_informado";
  if (["direto", "direta", "direct"].includes(normalized)) return "direto";
  if (["indireto", "indireta", "indirect"].includes(normalized)) return "indireto";
  return "nao_informado";
}

function normalizeImpactClass(value?: string | null) {
  const normalized = normalizeComparableValue(value);
  if (!normalized) return "nao_informado";
  if (["adverso", "negativo", "negative"].includes(normalized)) return "adverso";
  if (["benefico", "positivo", "positive"].includes(normalized)) return "benefico";
  return "nao_informado";
}

function isAspectCodeUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    /laia_assessment_org_code_unique|duplicate key value/i.test(error.message)
  );
}

function stringifyValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

async function getAssessmentRecipients(orgId: number): Promise<number[]> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.organizationId, orgId),
        or(eq(usersTable.role, "org_admin"), eq(usersTable.role, "platform_admin")),
      ),
    );
  return rows.map((row) => row.id);
}

async function assertRequirementLegislationsExist(
  orgId: number,
  requirements: z.infer<typeof requirementLinkSchema>[] | undefined,
) {
  const legalIds = Array.from(
    new Set(
      (requirements ?? [])
        .filter((item) => item.type === "legal" && item.legislationId != null)
        .map((item) => item.legislationId as number),
    ),
  );

  if (legalIds.length === 0) {
    return;
  }

  const rows = await db
    .select({ id: legislationsTable.id })
    .from(legislationsTable)
    .where(
      and(
        eq(legislationsTable.organizationId, orgId),
        inArray(legislationsTable.id, legalIds),
      ),
    );

  const found = new Set(rows.map((row) => row.id));
  const missing = legalIds.filter((id) => !found.has(id));

  if (missing.length > 0) {
    throw new Error(
      `Legislações inválidas para a organização: ${missing.join(", ")}`,
    );
  }
}

async function syncAssessmentRequirements(
  orgId: number,
  assessmentId: number,
  requirements: z.infer<typeof requirementLinkSchema>[] | undefined,
) {
  await db
    .delete(laiaRequirementLinksTable)
    .where(
      and(
        eq(laiaRequirementLinksTable.organizationId, orgId),
        eq(laiaRequirementLinksTable.assessmentId, assessmentId),
      ),
    );

  if (!requirements || requirements.length === 0) return;

  await db.insert(laiaRequirementLinksTable).values(
    requirements.map((item) => ({
      organizationId: orgId,
      assessmentId,
      type: item.type,
      legislationId: item.legislationId ?? null,
      title: item.title,
      requirementReference: item.requirementReference ?? null,
      description: item.description ?? null,
    })),
  );
}

async function syncAssessmentCommunicationPlans(
  orgId: number,
  assessmentId: number,
  userId: number,
  plans: z.infer<typeof communicationPlanSchema>[] | undefined,
) {
  await db
    .delete(sgqCommunicationPlansTable)
    .where(
      and(
        eq(sgqCommunicationPlansTable.organizationId, orgId),
        eq(sgqCommunicationPlansTable.contextType, "laia_assessment"),
        eq(sgqCommunicationPlansTable.contextId, assessmentId),
      ),
    );

  if (!plans || plans.length === 0) return;

  await db.insert(sgqCommunicationPlansTable).values(
    plans.map((plan) => ({
      organizationId: orgId,
      systemDomain: "sga" as const,
      contextType: "laia_assessment" as const,
      contextId: assessmentId,
      documentId: null,
      channel: plan.channel,
      audience: plan.audience,
      periodicity: plan.periodicity,
      requiresAcknowledgment: plan.requiresAcknowledgment,
      notes: plan.notes ?? null,
      createdById: userId,
      updatedById: userId,
    })),
  );
}

async function getAssessmentDetail(orgId: number, assessmentId: number) {
  const [assessment] = await db
    .select({
      id: laiaAssessmentsTable.id,
      organizationId: laiaAssessmentsTable.organizationId,
      unitId: laiaAssessmentsTable.unitId,
      sectorId: laiaAssessmentsTable.sectorId,
      methodologyVersionId: laiaAssessmentsTable.methodologyVersionId,
      aspectCode: laiaAssessmentsTable.aspectCode,
      mode: laiaAssessmentsTable.mode,
      status: laiaAssessmentsTable.status,
      activityOperation: laiaAssessmentsTable.activityOperation,
      environmentalAspect: laiaAssessmentsTable.environmentalAspect,
      environmentalImpact: laiaAssessmentsTable.environmentalImpact,
      temporality: laiaAssessmentsTable.temporality,
      operationalSituation: laiaAssessmentsTable.operationalSituation,
      incidence: laiaAssessmentsTable.incidence,
      impactClass: laiaAssessmentsTable.impactClass,
      scope: laiaAssessmentsTable.scope,
      severity: laiaAssessmentsTable.severity,
      consequenceScore: laiaAssessmentsTable.consequenceScore,
      frequencyProbability: laiaAssessmentsTable.frequencyProbability,
      frequencyProbabilityScore: laiaAssessmentsTable.frequencyProbabilityScore,
      totalScore: laiaAssessmentsTable.totalScore,
      category: laiaAssessmentsTable.category,
      significance: laiaAssessmentsTable.significance,
      significanceReason: laiaAssessmentsTable.significanceReason,
      hasLegalRequirements: laiaAssessmentsTable.hasLegalRequirements,
      hasStakeholderDemand: laiaAssessmentsTable.hasStakeholderDemand,
      hasStrategicOption: laiaAssessmentsTable.hasStrategicOption,
      normalCondition: laiaAssessmentsTable.normalCondition,
      abnormalCondition: laiaAssessmentsTable.abnormalCondition,
      startupShutdown: laiaAssessmentsTable.startupShutdown,
      emergencyScenario: laiaAssessmentsTable.emergencyScenario,
      changeContext: laiaAssessmentsTable.changeContext,
      lifecycleStages: laiaAssessmentsTable.lifecycleStages,
      controlLevel: laiaAssessmentsTable.controlLevel,
      influenceLevel: laiaAssessmentsTable.influenceLevel,
      outsourcedProcess: laiaAssessmentsTable.outsourcedProcess,
      supplierReference: laiaAssessmentsTable.supplierReference,
      controlTypes: laiaAssessmentsTable.controlTypes,
      existingControls: laiaAssessmentsTable.existingControls,
      controlRequired: laiaAssessmentsTable.controlRequired,
      controlResponsibleUserId: laiaAssessmentsTable.controlResponsibleUserId,
      controlDueAt: laiaAssessmentsTable.controlDueAt,
      communicationRequired: laiaAssessmentsTable.communicationRequired,
      communicationNotes: laiaAssessmentsTable.communicationNotes,
      reviewFrequencyDays: laiaAssessmentsTable.reviewFrequencyDays,
      nextReviewAt: laiaAssessmentsTable.nextReviewAt,
      notes: laiaAssessmentsTable.notes,
      createdById: laiaAssessmentsTable.createdById,
      updatedById: laiaAssessmentsTable.updatedById,
      createdAt: laiaAssessmentsTable.createdAt,
      updatedAt: laiaAssessmentsTable.updatedAt,
      sectorName: laiaSectorsTable.name,
      sectorCode: laiaSectorsTable.code,
      unitName: unitsTable.name,
    })
    .from(laiaAssessmentsTable)
    .leftJoin(laiaSectorsTable, eq(laiaAssessmentsTable.sectorId, laiaSectorsTable.id))
    .leftJoin(unitsTable, eq(laiaAssessmentsTable.unitId, unitsTable.id))
    .where(
      and(
        eq(laiaAssessmentsTable.organizationId, orgId),
        eq(laiaAssessmentsTable.id, assessmentId),
      ),
    );

  if (!assessment) return null;

  const [requirements, communicationPlans, monitoringPlans] = await Promise.all([
    db
      .select({
        id: laiaRequirementLinksTable.id,
        type: laiaRequirementLinksTable.type,
        title: laiaRequirementLinksTable.title,
        requirementReference: laiaRequirementLinksTable.requirementReference,
        description: laiaRequirementLinksTable.description,
        legislationId: laiaRequirementLinksTable.legislationId,
        legislationTitle: legislationsTable.title,
      })
      .from(laiaRequirementLinksTable)
      .leftJoin(
        legislationsTable,
        eq(laiaRequirementLinksTable.legislationId, legislationsTable.id),
      )
      .where(eq(laiaRequirementLinksTable.assessmentId, assessmentId))
      .orderBy(asc(laiaRequirementLinksTable.id)),
    db
      .select({
        id: sgqCommunicationPlansTable.id,
        channel: sgqCommunicationPlansTable.channel,
        audience: sgqCommunicationPlansTable.audience,
        periodicity: sgqCommunicationPlansTable.periodicity,
        requiresAcknowledgment: sgqCommunicationPlansTable.requiresAcknowledgment,
        notes: sgqCommunicationPlansTable.notes,
        lastDistributedAt: sgqCommunicationPlansTable.lastDistributedAt,
      })
      .from(sgqCommunicationPlansTable)
      .where(
        and(
          eq(sgqCommunicationPlansTable.organizationId, orgId),
          eq(sgqCommunicationPlansTable.contextType, "laia_assessment"),
          eq(sgqCommunicationPlansTable.contextId, assessmentId),
        ),
      )
      .orderBy(asc(sgqCommunicationPlansTable.id)),
    db
      .select()
      .from(laiaMonitoringPlansTable)
      .where(eq(laiaMonitoringPlansTable.assessmentId, assessmentId))
      .orderBy(asc(laiaMonitoringPlansTable.id)),
  ]);

  return {
    ...assessment,
    controlDueAt: formatDate(assessment.controlDueAt),
    nextReviewAt: formatDate(assessment.nextReviewAt),
    createdAt: formatDate(assessment.createdAt),
    updatedAt: formatDate(assessment.updatedAt),
    requirements,
    communicationPlans: communicationPlans.map((plan) => ({
      ...plan,
      lastDistributedAt: formatDate(plan.lastDistributedAt),
    })),
    monitoringPlans: monitoringPlans.map((plan) => ({
      ...plan,
      nextDueAt: formatDate(plan.nextDueAt),
      lastCompletedAt: formatDate(plan.lastCompletedAt),
      createdAt: formatDate(plan.createdAt),
      updatedAt: formatDate(plan.updatedAt),
    })),
  };
}

async function getAssessmentSnapshot(orgId: number, assessmentId: number) {
  const detail = await getAssessmentDetail(orgId, assessmentId);
  if (!detail) return null;

  return {
    aspectCode: detail.aspectCode,
    activityOperation: detail.activityOperation,
    environmentalAspect: detail.environmentalAspect,
    environmentalImpact: detail.environmentalImpact,
    totalScore: detail.totalScore,
    category: detail.category,
    significance: detail.significance,
    methodologyVersionId: detail.methodologyVersionId,
  };
}

async function createRevision(
  orgId: number,
  assessmentId: number,
  userId: number,
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null,
  title: string,
) {
  const [aggregate] = await db
    .select({
      revisionNumber: sql<number>`coalesce(max(${laiaRevisionsTable.revisionNumber}), 0) + 1`,
    })
    .from(laiaRevisionsTable)
    .where(eq(laiaRevisionsTable.assessmentId, assessmentId));

  const [revision] = await db
    .insert(laiaRevisionsTable)
    .values({
      organizationId: orgId,
      assessmentId,
      title,
      description: title,
      revisionNumber: aggregate?.revisionNumber ?? 1,
      status: "finalized",
      snapshot: (afterState ?? beforeState) as any,
      createdById: userId,
      finalizedById: userId,
      finalizedAt: new Date(),
    })
    .returning({ id: laiaRevisionsTable.id });

  const keys = new Set<string>([
    ...Object.keys(beforeState ?? {}),
    ...Object.keys(afterState ?? {}),
  ]);
  const changes = Array.from(keys)
    .map((fieldName) => {
      const oldValue = stringifyValue(beforeState?.[fieldName]);
      const newValue = stringifyValue(afterState?.[fieldName]);
      if (oldValue === newValue) return null;
      return {
        revisionId: revision.id,
        entityType: "assessment",
        entityId: assessmentId,
        fieldName,
        oldValue,
        newValue,
      };
    })
    .filter(Boolean) as Array<{
    revisionId: number;
    entityType: string;
    entityId: number;
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }>;

  if (changes.length > 0) {
    await db.insert(laiaRevisionChangesTable).values(changes);
  }
}

async function resolveMethodologyVersionId(
  orgId: number,
  requestedId?: number | null,
) {
  if (requestedId) return requestedId;

  const [methodology] = await db
    .select({
      activeVersionId: laiaMethodologiesTable.activeVersionId,
    })
    .from(laiaMethodologiesTable)
    .where(eq(laiaMethodologiesTable.organizationId, orgId))
    .orderBy(desc(laiaMethodologiesTable.id))
    .limit(1);

  return methodology?.activeVersionId ?? null;
}

async function generateAspectCode(orgId: number, sectorId?: number | null) {
  let prefix = "LAIA";
  if (sectorId) {
    const [sector] = await db
      .select({ code: laiaSectorsTable.code })
      .from(laiaSectorsTable)
      .where(eq(laiaSectorsTable.id, sectorId));
    if (sector?.code) {
      prefix = sector.code;
    }
  }

  const [aggregate] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(laiaAssessmentsTable)
    .where(eq(laiaAssessmentsTable.organizationId, orgId));

  const sequence = String((aggregate?.count ?? 0) + 1).padStart(3, "0");
  return `${prefix}-${sequence}`;
}

async function insertAssessmentWithRetry(
  values: Omit<typeof laiaAssessmentsTable.$inferInsert, "aspectCode"> & {
    aspectCode?: string | null;
  },
): Promise<number> {
  const providedAspectCode = values.aspectCode ?? null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const aspectCode =
      providedAspectCode ??
      (await generateAspectCode(values.organizationId, values.sectorId ?? null));

    try {
      const [assessment] = await db
        .insert(laiaAssessmentsTable)
        .values({
          ...values,
          aspectCode,
        })
        .returning({ id: laiaAssessmentsTable.id });

      return assessment.id;
    } catch (error) {
      if (providedAspectCode || !isAspectCodeUniqueViolation(error) || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("Falha ao gerar código único de aspecto ambiental.");
}

router.get("/organizations/:orgId/environmental/laia/branch-configs", async (req, res) => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!requireOrgAccess(req, res, params.data.orgId)) return;

  const units = await db
    .select({
      id: unitsTable.id,
      name: unitsTable.name,
    })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, params.data.orgId))
    .orderBy(asc(unitsTable.name));

  const items = await db
    .select({
      id: laiaBranchConfigsTable.id,
      unitId: laiaBranchConfigsTable.unitId,
      surveyStatus: laiaBranchConfigsTable.surveyStatus,
      updatedAt: laiaBranchConfigsTable.updatedAt,
    })
    .from(laiaBranchConfigsTable)
    .where(eq(laiaBranchConfigsTable.organizationId, params.data.orgId));

  const assessmentStats = await db
    .select({
      unitId: laiaAssessmentsTable.unitId,
      totalAssessments: sql<number>`count(*)`,
      criticalAssessments:
        sql<number>`coalesce(sum(case when ${laiaAssessmentsTable.category} = 'critico' then 1 else 0 end), 0)`,
      significantAssessments:
        sql<number>`coalesce(sum(case when ${laiaAssessmentsTable.significance} = 'significant' then 1 else 0 end), 0)`,
      notSignificantAssessments:
        sql<number>`coalesce(sum(case when ${laiaAssessmentsTable.significance} = 'not_significant' then 1 else 0 end), 0)`,
    })
    .from(laiaAssessmentsTable)
    .where(eq(laiaAssessmentsTable.organizationId, params.data.orgId))
    .groupBy(laiaAssessmentsTable.unitId);

  const configByUnitId = new Map(items.map((item) => [item.unitId, item]));
  const statsByUnitId = new Map<
    number,
    {
      totalAssessments: number;
      criticalAssessments: number;
      significantAssessments: number;
      notSignificantAssessments: number;
    }
  >();

  for (const assessment of assessmentStats) {
    if (!assessment.unitId) continue;
    statsByUnitId.set(assessment.unitId, {
      totalAssessments: assessment.totalAssessments ?? 0,
      criticalAssessments: assessment.criticalAssessments ?? 0,
      significantAssessments: assessment.significantAssessments ?? 0,
      notSignificantAssessments: assessment.notSignificantAssessments ?? 0,
    });
  }

  res.json(
    units.map((unit) => {
      const config = configByUnitId.get(unit.id);
      const stats = statsByUnitId.get(unit.id) ?? {
        totalAssessments: 0,
        criticalAssessments: 0,
        significantAssessments: 0,
        notSignificantAssessments: 0,
      };

      return {
        id: config?.id ?? null,
        unitId: unit.id,
        unitName: unit.name,
        surveyStatus: config?.surveyStatus ?? "nao_levantado",
        updatedAt: formatDate(config?.updatedAt),
        ...stats,
      };
    }),
  );
});

router.patch(
  "/organizations/:orgId/environmental/laia/branch-configs",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const body = z.object({ items: z.array(branchConfigSchema) }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    for (const item of body.data.items) {
      const [existing] = await db
        .select({ id: laiaBranchConfigsTable.id })
        .from(laiaBranchConfigsTable)
        .where(
          and(
            eq(laiaBranchConfigsTable.organizationId, params.data.orgId),
            eq(laiaBranchConfigsTable.unitId, item.unitId),
          ),
        );

      if (existing) {
        await db
          .update(laiaBranchConfigsTable)
          .set({
            surveyStatus: item.surveyStatus,
            updatedById: req.auth!.userId,
          })
          .where(eq(laiaBranchConfigsTable.id, existing.id));
      } else {
        await db.insert(laiaBranchConfigsTable).values({
          organizationId: params.data.orgId,
          unitId: item.unitId,
          surveyStatus: item.surveyStatus,
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        });
      }
    }

    res.status(204).send();
  },
);

router.get("/organizations/:orgId/environmental/laia/sectors", async (req, res) => {
  const params = paramsSchema.safeParse(req.params);
  const query = sectorsQuerySchema.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }
  if (!requireOrgAccess(req, res, params.data.orgId)) return;

  const conditions = [eq(laiaSectorsTable.organizationId, params.data.orgId)];
  if (query.data.unitId) {
    conditions.push(eq(laiaSectorsTable.unitId, query.data.unitId));
  }

  const items = await db
    .select({
      id: laiaSectorsTable.id,
      unitId: laiaSectorsTable.unitId,
      departmentId: laiaSectorsTable.departmentId,
      code: laiaSectorsTable.code,
      name: laiaSectorsTable.name,
      description: laiaSectorsTable.description,
      isActive: laiaSectorsTable.isActive,
      createdAt: laiaSectorsTable.createdAt,
      updatedAt: laiaSectorsTable.updatedAt,
    })
    .from(laiaSectorsTable)
    .where(and(...conditions))
    .orderBy(asc(laiaSectorsTable.name));

  res.json(
    items.map((item) => ({
      ...item,
      createdAt: formatDate(item.createdAt),
      updatedAt: formatDate(item.updatedAt),
    })),
  );
});

router.get("/organizations/:orgId/environmental/laia/units/:unitId/overview", async (req, res) => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success || !params.data.unitId) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }
  if (!requireOrgAccess(req, res, params.data.orgId)) return;

  const [unit] = await db
    .select({
      id: unitsTable.id,
      name: unitsTable.name,
    })
    .from(unitsTable)
    .where(
      and(
        eq(unitsTable.organizationId, params.data.orgId),
        eq(unitsTable.id, params.data.unitId),
      ),
    );

  if (!unit) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const [config] = await db
    .select({
      surveyStatus: laiaBranchConfigsTable.surveyStatus,
    })
    .from(laiaBranchConfigsTable)
    .where(
      and(
        eq(laiaBranchConfigsTable.organizationId, params.data.orgId),
        eq(laiaBranchConfigsTable.unitId, params.data.unitId),
      ),
    );

  const assessments = await db
    .select({
      temporality: laiaAssessmentsTable.temporality,
      operationalSituation: laiaAssessmentsTable.operationalSituation,
      incidence: laiaAssessmentsTable.incidence,
      impactClass: laiaAssessmentsTable.impactClass,
    })
    .from(laiaAssessmentsTable)
    .where(
      and(
        eq(laiaAssessmentsTable.organizationId, params.data.orgId),
        eq(laiaAssessmentsTable.unitId, params.data.unitId),
      ),
    );

  const byTemporality: Record<string, number> = {};
  const byOperationalSituation: Record<string, number> = {};
  const byIncidence: Record<string, number> = {};
  const byImpactClass: Record<string, number> = {};

  for (const assessment of assessments) {
    incrementBucket(byTemporality, normalizeTemporality(assessment.temporality));
    incrementBucket(
      byOperationalSituation,
      normalizeOperationalSituation(assessment.operationalSituation),
    );
    incrementBucket(byIncidence, normalizeIncidence(assessment.incidence));
    incrementBucket(byImpactClass, normalizeImpactClass(assessment.impactClass));
  }

  res.json({
    unitId: unit.id,
    unitName: unit.name,
    surveyStatus: config?.surveyStatus ?? "nao_levantado",
    totalAssessments: assessments.length,
    byTemporality,
    byOperationalSituation,
    byIncidence,
    byImpactClass,
  });
});

router.post(
  "/organizations/:orgId/environmental/laia/sectors",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const body = sectorSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [sector] = await db
      .insert(laiaSectorsTable)
      .values({
        organizationId: params.data.orgId,
        unitId: body.data.unitId ?? null,
        departmentId: body.data.departmentId ?? null,
        code: body.data.code,
        name: body.data.name,
        description: body.data.description ?? null,
        isActive: body.data.isActive ?? true,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning({
        id: laiaSectorsTable.id,
        unitId: laiaSectorsTable.unitId,
        departmentId: laiaSectorsTable.departmentId,
        code: laiaSectorsTable.code,
        name: laiaSectorsTable.name,
        description: laiaSectorsTable.description,
        isActive: laiaSectorsTable.isActive,
        createdAt: laiaSectorsTable.createdAt,
        updatedAt: laiaSectorsTable.updatedAt,
      });

    res.status(201).json({
      ...sector,
      createdAt: formatDate(sector.createdAt),
      updatedAt: formatDate(sector.updatedAt),
    });
  },
);

router.patch(
  "/organizations/:orgId/environmental/laia/sectors/:sectorId",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.sectorId) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const body = sectorSchema.partial().safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    await db
      .update(laiaSectorsTable)
      .set({
        ...(body.data.unitId !== undefined ? { unitId: body.data.unitId ?? null } : {}),
        ...(body.data.departmentId !== undefined
          ? { departmentId: body.data.departmentId ?? null }
          : {}),
        ...(body.data.code !== undefined ? { code: body.data.code } : {}),
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.description !== undefined
          ? { description: body.data.description ?? null }
          : {}),
        ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
        updatedById: req.auth!.userId,
      })
      .where(
        and(
          eq(laiaSectorsTable.organizationId, params.data.orgId),
          eq(laiaSectorsTable.id, params.data.sectorId),
        ),
      );

    res.status(204).send();
  },
);

router.delete(
  "/organizations/:orgId/environmental/laia/sectors/:sectorId",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.sectorId) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    await db
      .delete(laiaSectorsTable)
      .where(
        and(
          eq(laiaSectorsTable.organizationId, params.data.orgId),
          eq(laiaSectorsTable.id, params.data.sectorId),
        ),
      );

    res.status(204).send();
  },
);

router.get("/organizations/:orgId/environmental/laia/methodology", async (req, res) => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!requireOrgAccess(req, res, params.data.orgId)) return;

  const [methodology] = await db
    .select()
    .from(laiaMethodologiesTable)
    .where(eq(laiaMethodologiesTable.organizationId, params.data.orgId))
    .orderBy(desc(laiaMethodologiesTable.id))
    .limit(1);

  if (!methodology) {
    res.json(null);
    return;
  }

  const versions = await db
    .select()
    .from(laiaMethodologyVersionsTable)
    .where(eq(laiaMethodologyVersionsTable.methodologyId, methodology.id))
    .orderBy(desc(laiaMethodologyVersionsTable.versionNumber));

  res.json({
    ...methodology,
    createdAt: formatDate(methodology.createdAt),
    updatedAt: formatDate(methodology.updatedAt),
    versions: versions.map((version) => ({
      ...version,
      publishedAt: formatDate(version.publishedAt),
      createdAt: formatDate(version.createdAt),
    })),
  });
});

router.put(
  "/organizations/:orgId/environmental/laia/methodology",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const body = methodologySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    let methodology = await db
      .select()
      .from(laiaMethodologiesTable)
      .where(eq(laiaMethodologiesTable.organizationId, params.data.orgId))
      .orderBy(desc(laiaMethodologiesTable.id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!methodology) {
      [methodology] = await db
        .insert(laiaMethodologiesTable)
        .values({
          organizationId: params.data.orgId,
          name: body.data.name,
          status: "active",
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        })
        .returning();
    } else {
      await db
        .update(laiaMethodologiesTable)
        .set({
          name: body.data.name,
          updatedById: req.auth!.userId,
        })
        .where(eq(laiaMethodologiesTable.id, methodology.id));
    }

    const [aggregate] = await db
      .select({
        versionNumber: sql<number>`coalesce(max(${laiaMethodologyVersionsTable.versionNumber}), 0) + 1`,
      })
      .from(laiaMethodologyVersionsTable)
      .where(eq(laiaMethodologyVersionsTable.methodologyId, methodology.id));

    const [version] = await db
      .insert(laiaMethodologyVersionsTable)
      .values({
        methodologyId: methodology.id,
        organizationId: params.data.orgId,
        versionNumber: aggregate?.versionNumber ?? 1,
        title: body.data.title,
        consequenceMatrix: body.data.consequenceMatrix,
        frequencyProbabilityMatrix: body.data.frequencyProbabilityMatrix,
        scoreThresholds: body.data.scoreThresholds,
        moderateSignificanceRule: body.data.moderateSignificanceRule,
        documentContent: body.data.documentContent ?? null,
        notes: body.data.notes ?? null,
        publishedAt: new Date(),
        createdById: req.auth!.userId,
      })
      .returning();

    await db
      .update(laiaMethodologiesTable)
      .set({
        activeVersionId: version.id,
        updatedById: req.auth!.userId,
      })
      .where(eq(laiaMethodologiesTable.id, methodology.id));

    res.status(201).json({
      methodologyId: methodology.id,
      activeVersionId: version.id,
      versionNumber: version.versionNumber,
    });
  },
);

router.get("/organizations/:orgId/environmental/laia/assessments", async (req, res) => {
  const params = paramsSchema.safeParse(req.params);
  const query = assessmentListQuerySchema.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }
  if (!requireOrgAccess(req, res, params.data.orgId)) return;

  const conditions = [eq(laiaAssessmentsTable.organizationId, params.data.orgId)];
  if (query.data.unitId) {
    conditions.push(eq(laiaAssessmentsTable.unitId, query.data.unitId));
  }
  if (query.data.sectorId) {
    conditions.push(eq(laiaAssessmentsTable.sectorId, query.data.sectorId));
  }
  if (query.data.status) {
    conditions.push(eq(laiaAssessmentsTable.status, query.data.status));
  }
  if (query.data.significance) {
    conditions.push(eq(laiaAssessmentsTable.significance, query.data.significance));
  }
  if (query.data.category) {
    conditions.push(eq(laiaAssessmentsTable.category, query.data.category));
  }

  const rows = await db
    .select({
      id: laiaAssessmentsTable.id,
      unitId: laiaAssessmentsTable.unitId,
      sectorId: laiaAssessmentsTable.sectorId,
      aspectCode: laiaAssessmentsTable.aspectCode,
      activityOperation: laiaAssessmentsTable.activityOperation,
      environmentalAspect: laiaAssessmentsTable.environmentalAspect,
      environmentalImpact: laiaAssessmentsTable.environmentalImpact,
      status: laiaAssessmentsTable.status,
      category: laiaAssessmentsTable.category,
      significance: laiaAssessmentsTable.significance,
      totalScore: laiaAssessmentsTable.totalScore,
      operationalSituation: laiaAssessmentsTable.operationalSituation,
      createdAt: laiaAssessmentsTable.createdAt,
      updatedAt: laiaAssessmentsTable.updatedAt,
      sectorName: laiaSectorsTable.name,
      unitName: unitsTable.name,
    })
    .from(laiaAssessmentsTable)
    .leftJoin(laiaSectorsTable, eq(laiaAssessmentsTable.sectorId, laiaSectorsTable.id))
    .leftJoin(unitsTable, eq(laiaAssessmentsTable.unitId, unitsTable.id))
    .where(and(...conditions))
    .orderBy(desc(laiaAssessmentsTable.updatedAt));

  const filtered = query.data.q
    ? rows.filter((row) =>
        [
          row.aspectCode,
          row.activityOperation,
          row.environmentalAspect,
          row.environmentalImpact,
          row.sectorName,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query.data.q!.toLowerCase()),
          ),
      )
    : rows;

  res.json(
    filtered.map((row) => ({
      ...row,
      createdAt: formatDate(row.createdAt),
      updatedAt: formatDate(row.updatedAt),
    })),
  );
});

router.post(
  "/organizations/:orgId/environmental/laia/assessments",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const body = assessmentBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    try {
      await assertRequirementLegislationsExist(
        params.data.orgId,
        body.data.requirements,
      );
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "Requisitos legais inválidos",
      });
      return;
    }

    const methodologyVersionId = await resolveMethodologyVersionId(
      params.data.orgId,
      body.data.methodologyVersionId,
    );
    const aspectCode =
      body.data.aspectCode ?? (await generateAspectCode(params.data.orgId, body.data.sectorId));

    const assessmentId = await insertAssessmentWithRetry({
        organizationId: params.data.orgId,
        unitId: body.data.unitId ?? null,
        sectorId: body.data.sectorId ?? null,
        methodologyVersionId,
        aspectCode,
        mode: body.data.mode,
        status: body.data.status,
        activityOperation: body.data.activityOperation,
        environmentalAspect: body.data.environmentalAspect,
        environmentalImpact: body.data.environmentalImpact,
        temporality: body.data.temporality ?? null,
        operationalSituation: body.data.operationalSituation ?? null,
        incidence: body.data.incidence ?? null,
        impactClass: body.data.impactClass ?? null,
        scope: body.data.scope ?? null,
        severity: body.data.severity ?? null,
        consequenceScore: body.data.consequenceScore ?? null,
        frequencyProbability: body.data.frequencyProbability ?? null,
        frequencyProbabilityScore: body.data.frequencyProbabilityScore ?? null,
        totalScore: body.data.totalScore ?? null,
        category: body.data.category ?? null,
        significance: body.data.significance ?? null,
        significanceReason: body.data.significanceReason ?? null,
        hasLegalRequirements: body.data.hasLegalRequirements ?? false,
        hasStakeholderDemand: body.data.hasStakeholderDemand ?? false,
        hasStrategicOption: body.data.hasStrategicOption ?? false,
        normalCondition: body.data.normalCondition ?? true,
        abnormalCondition: body.data.abnormalCondition ?? false,
        startupShutdown: body.data.startupShutdown ?? false,
        emergencyScenario: body.data.emergencyScenario ?? null,
        changeContext: body.data.changeContext ?? null,
        lifecycleStages: body.data.lifecycleStages ?? [],
        controlLevel: body.data.controlLevel,
        influenceLevel: body.data.influenceLevel ?? null,
        outsourcedProcess: body.data.outsourcedProcess ?? null,
        supplierReference: body.data.supplierReference ?? null,
        controlTypes: body.data.controlTypes ?? [],
        existingControls: body.data.existingControls ?? null,
        controlRequired: body.data.controlRequired ?? null,
        controlResponsibleUserId: body.data.controlResponsibleUserId ?? null,
        controlDueAt: parseDate(body.data.controlDueAt),
        communicationRequired: body.data.communicationRequired ?? false,
        communicationNotes: body.data.communicationNotes ?? null,
        reviewFrequencyDays: body.data.reviewFrequencyDays ?? null,
        nextReviewAt: parseDate(body.data.nextReviewAt),
        notes: body.data.notes ?? null,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      });

    await Promise.all([
      syncAssessmentRequirements(params.data.orgId, assessmentId, body.data.requirements),
      syncAssessmentCommunicationPlans(
        params.data.orgId,
        assessmentId,
        req.auth!.userId,
        body.data.communicationPlans,
      ),
    ]);

    const snapshot = await getAssessmentSnapshot(params.data.orgId, assessmentId);
    await createRevision(
      params.data.orgId,
      assessmentId,
      req.auth!.userId,
      null,
      snapshot,
      "Avaliação criada",
    );

    res.status(201).json(await getAssessmentDetail(params.data.orgId, assessmentId));
  },
);

router.get(
  "/organizations/:orgId/environmental/laia/assessments/:assessmentId",
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.assessmentId) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const detail = await getAssessmentDetail(
      params.data.orgId,
      params.data.assessmentId,
    );
    if (!detail) {
      res.status(404).json({ error: "Avaliação não encontrada" });
      return;
    }

    res.json(detail);
  },
);

router.patch(
  "/organizations/:orgId/environmental/laia/assessments/:assessmentId",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.assessmentId) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const body = assessmentBodySchema.partial().safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    try {
      await assertRequirementLegislationsExist(
        params.data.orgId,
        body.data.requirements,
      );
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "Requisitos legais inválidos",
      });
      return;
    }

    const beforeState = await getAssessmentSnapshot(
      params.data.orgId,
      params.data.assessmentId,
    );
    if (!beforeState) {
      res.status(404).json({ error: "Avaliação não encontrada" });
      return;
    }

    const methodologyVersionId =
      body.data.methodologyVersionId !== undefined
        ? await resolveMethodologyVersionId(
            params.data.orgId,
            body.data.methodologyVersionId,
          )
        : undefined;

    await db
      .update(laiaAssessmentsTable)
      .set({
        ...(body.data.unitId !== undefined ? { unitId: body.data.unitId ?? null } : {}),
        ...(body.data.sectorId !== undefined ? { sectorId: body.data.sectorId ?? null } : {}),
        ...(methodologyVersionId !== undefined ? { methodologyVersionId } : {}),
        ...(body.data.aspectCode !== undefined && body.data.aspectCode !== null
          ? { aspectCode: body.data.aspectCode }
          : {}),
        ...(body.data.mode !== undefined ? { mode: body.data.mode } : {}),
        ...(body.data.status !== undefined ? { status: body.data.status } : {}),
        ...(body.data.activityOperation !== undefined
          ? { activityOperation: body.data.activityOperation }
          : {}),
        ...(body.data.environmentalAspect !== undefined
          ? { environmentalAspect: body.data.environmentalAspect }
          : {}),
        ...(body.data.environmentalImpact !== undefined
          ? { environmentalImpact: body.data.environmentalImpact }
          : {}),
        ...(body.data.temporality !== undefined
          ? { temporality: body.data.temporality ?? null }
          : {}),
        ...(body.data.operationalSituation !== undefined
          ? { operationalSituation: body.data.operationalSituation ?? null }
          : {}),
        ...(body.data.incidence !== undefined ? { incidence: body.data.incidence ?? null } : {}),
        ...(body.data.impactClass !== undefined ? { impactClass: body.data.impactClass ?? null } : {}),
        ...(body.data.scope !== undefined ? { scope: body.data.scope ?? null } : {}),
        ...(body.data.severity !== undefined ? { severity: body.data.severity ?? null } : {}),
        ...(body.data.consequenceScore !== undefined
          ? { consequenceScore: body.data.consequenceScore ?? null }
          : {}),
        ...(body.data.frequencyProbability !== undefined
          ? { frequencyProbability: body.data.frequencyProbability ?? null }
          : {}),
        ...(body.data.frequencyProbabilityScore !== undefined
          ? { frequencyProbabilityScore: body.data.frequencyProbabilityScore ?? null }
          : {}),
        ...(body.data.totalScore !== undefined ? { totalScore: body.data.totalScore ?? null } : {}),
        ...(body.data.category !== undefined ? { category: body.data.category ?? null } : {}),
        ...(body.data.significance !== undefined
          ? { significance: body.data.significance ?? null }
          : {}),
        ...(body.data.significanceReason !== undefined
          ? { significanceReason: body.data.significanceReason ?? null }
          : {}),
        ...(body.data.hasLegalRequirements !== undefined
          ? { hasLegalRequirements: body.data.hasLegalRequirements }
          : {}),
        ...(body.data.hasStakeholderDemand !== undefined
          ? { hasStakeholderDemand: body.data.hasStakeholderDemand }
          : {}),
        ...(body.data.hasStrategicOption !== undefined
          ? { hasStrategicOption: body.data.hasStrategicOption }
          : {}),
        ...(body.data.normalCondition !== undefined
          ? { normalCondition: body.data.normalCondition }
          : {}),
        ...(body.data.abnormalCondition !== undefined
          ? { abnormalCondition: body.data.abnormalCondition }
          : {}),
        ...(body.data.startupShutdown !== undefined
          ? { startupShutdown: body.data.startupShutdown }
          : {}),
        ...(body.data.emergencyScenario !== undefined
          ? { emergencyScenario: body.data.emergencyScenario ?? null }
          : {}),
        ...(body.data.changeContext !== undefined
          ? { changeContext: body.data.changeContext ?? null }
          : {}),
        ...(body.data.lifecycleStages !== undefined
          ? { lifecycleStages: body.data.lifecycleStages }
          : {}),
        ...(body.data.controlLevel !== undefined ? { controlLevel: body.data.controlLevel } : {}),
        ...(body.data.influenceLevel !== undefined
          ? { influenceLevel: body.data.influenceLevel ?? null }
          : {}),
        ...(body.data.outsourcedProcess !== undefined
          ? { outsourcedProcess: body.data.outsourcedProcess ?? null }
          : {}),
        ...(body.data.supplierReference !== undefined
          ? { supplierReference: body.data.supplierReference ?? null }
          : {}),
        ...(body.data.controlTypes !== undefined ? { controlTypes: body.data.controlTypes } : {}),
        ...(body.data.existingControls !== undefined
          ? { existingControls: body.data.existingControls ?? null }
          : {}),
        ...(body.data.controlRequired !== undefined
          ? { controlRequired: body.data.controlRequired ?? null }
          : {}),
        ...(body.data.controlResponsibleUserId !== undefined
          ? { controlResponsibleUserId: body.data.controlResponsibleUserId ?? null }
          : {}),
        ...(body.data.controlDueAt !== undefined
          ? { controlDueAt: parseDate(body.data.controlDueAt) }
          : {}),
        ...(body.data.communicationRequired !== undefined
          ? { communicationRequired: body.data.communicationRequired }
          : {}),
        ...(body.data.communicationNotes !== undefined
          ? { communicationNotes: body.data.communicationNotes ?? null }
          : {}),
        ...(body.data.reviewFrequencyDays !== undefined
          ? { reviewFrequencyDays: body.data.reviewFrequencyDays ?? null }
          : {}),
        ...(body.data.nextReviewAt !== undefined
          ? { nextReviewAt: parseDate(body.data.nextReviewAt) }
          : {}),
        ...(body.data.notes !== undefined ? { notes: body.data.notes ?? null } : {}),
        updatedById: req.auth!.userId,
      })
      .where(
        and(
          eq(laiaAssessmentsTable.organizationId, params.data.orgId),
          eq(laiaAssessmentsTable.id, params.data.assessmentId),
        ),
      );

    if (body.data.requirements !== undefined) {
      await syncAssessmentRequirements(
        params.data.orgId,
        params.data.assessmentId,
        body.data.requirements,
      );
    }
    if (body.data.communicationPlans !== undefined) {
      await syncAssessmentCommunicationPlans(
        params.data.orgId,
        params.data.assessmentId,
        req.auth!.userId,
        body.data.communicationPlans,
      );
    }

    const afterState = await getAssessmentSnapshot(
      params.data.orgId,
      params.data.assessmentId,
    );
    await createRevision(
      params.data.orgId,
      params.data.assessmentId,
      req.auth!.userId,
      beforeState,
      afterState,
      "Avaliação atualizada",
    );

    res.json(await getAssessmentDetail(params.data.orgId, params.data.assessmentId));
  },
);

router.delete(
  "/organizations/:orgId/environmental/laia/assessments/:assessmentId",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.assessmentId) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const beforeState = await getAssessmentSnapshot(
      params.data.orgId,
      params.data.assessmentId,
    );
    if (!beforeState) {
      res.status(404).json({ error: "Avaliação não encontrada" });
      return;
    }

    await db
      .update(laiaAssessmentsTable)
      .set({
        status: "archived",
        updatedById: req.auth!.userId,
      })
      .where(
        and(
          eq(laiaAssessmentsTable.organizationId, params.data.orgId),
          eq(laiaAssessmentsTable.id, params.data.assessmentId),
        ),
      );

    const afterState = await getAssessmentSnapshot(
      params.data.orgId,
      params.data.assessmentId,
    );
    await createRevision(
      params.data.orgId,
      params.data.assessmentId,
      req.auth!.userId,
      beforeState,
      afterState,
      "Avaliação arquivada",
    );

    res.status(204).send();
  },
);

router.get(
  "/organizations/:orgId/environmental/laia/assessments/:assessmentId/monitoring-plans",
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.assessmentId) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const plans = await db
      .select()
      .from(laiaMonitoringPlansTable)
      .where(
        and(
          eq(laiaMonitoringPlansTable.organizationId, params.data.orgId),
          eq(laiaMonitoringPlansTable.assessmentId, params.data.assessmentId),
        ),
      )
      .orderBy(asc(laiaMonitoringPlansTable.id));

    res.json(
      plans.map((plan) => ({
        ...plan,
        nextDueAt: formatDate(plan.nextDueAt),
        lastCompletedAt: formatDate(plan.lastCompletedAt),
        createdAt: formatDate(plan.createdAt),
        updatedAt: formatDate(plan.updatedAt),
      })),
    );
  },
);

router.post(
  "/organizations/:orgId/environmental/laia/assessments/:assessmentId/monitoring-plans",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.assessmentId) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const body = monitoringPlanSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [plan] = await db
      .insert(laiaMonitoringPlansTable)
      .values({
        organizationId: params.data.orgId,
        assessmentId: params.data.assessmentId,
        title: body.data.title,
        objective: body.data.objective,
        method: body.data.method,
        indicator: body.data.indicator ?? null,
        frequency: body.data.frequency,
        delayCriteria: body.data.delayCriteria ?? null,
        responsibleUserId: body.data.responsibleUserId ?? null,
        status: body.data.status,
        nextDueAt: parseDate(body.data.nextDueAt),
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      })
      .returning();

    res.status(201).json({
      ...plan,
      nextDueAt: formatDate(plan.nextDueAt),
      lastCompletedAt: formatDate(plan.lastCompletedAt),
      createdAt: formatDate(plan.createdAt),
      updatedAt: formatDate(plan.updatedAt),
    });
  },
);

router.get(
  "/organizations/:orgId/environmental/laia/monitoring-plans/:planId/records",
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.planId) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const records = await db
      .select()
      .from(laiaMonitoringRecordsTable)
      .where(
        and(
          eq(laiaMonitoringRecordsTable.organizationId, params.data.orgId),
          eq(laiaMonitoringRecordsTable.planId, params.data.planId),
        ),
      )
      .orderBy(desc(laiaMonitoringRecordsTable.executedAt));

    res.json(
      records.map((record) => ({
        ...record,
        executedAt: formatDate(record.executedAt),
        createdAt: formatDate(record.createdAt),
      })),
    );
  },
);

router.post(
  "/organizations/:orgId/environmental/laia/monitoring-plans/:planId/records",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success || !params.data.planId) {
      res.status(400).json({ error: "Parâmetros inválidos" });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const body = monitoringRecordSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [record] = await db
      .insert(laiaMonitoringRecordsTable)
      .values({
        organizationId: params.data.orgId,
        planId: params.data.planId,
        executedAt: new Date(body.data.executedAt),
        result: body.data.result,
        measuredValue: body.data.measuredValue ?? null,
        notes: body.data.notes ?? null,
        evidence:
          body.data.evidence?.map((item) => ({
            fileName: item.fileName,
            objectPath: item.objectPath,
            ...(item.contentType ? { contentType: item.contentType } : {}),
          })) ?? [],
        createdById: req.auth!.userId,
      })
      .returning();

    await db
      .update(laiaMonitoringPlansTable)
      .set({
        lastCompletedAt: new Date(body.data.executedAt),
        nextDueAt:
          body.data.nextDueAt !== undefined
            ? parseDate(body.data.nextDueAt)
            : undefined,
        status: "active",
        reminderFlags: {},
        updatedById: req.auth!.userId,
      })
      .where(eq(laiaMonitoringPlansTable.id, params.data.planId));

    res.status(201).json({
      ...record,
      executedAt: formatDate(record.executedAt),
      createdAt: formatDate(record.createdAt),
    });
  },
);

router.post(
  "/organizations/:orgId/environmental/laia/assessments/import",
  requireWriteAccess(),
  async (req, res) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!requireOrgAccess(req, res, params.data.orgId)) return;

    const body = importSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [job] = await db
      .insert(laiaImportJobsTable)
      .values({
        organizationId: params.data.orgId,
        unitId: body.data.unitId ?? null,
        workbookName: body.data.workbookName ?? null,
        status: "processing",
        summary: {},
        createdById: req.auth!.userId,
      })
      .returning();

    let imported = 0;
    let failed = 0;
    const errors: Array<{ row: number; error: string }> = [];
    const methodologyVersionId = await resolveMethodologyVersionId(params.data.orgId);

    for (const [index, row] of body.data.rows.entries()) {
      try {
        await assertRequirementLegislationsExist(params.data.orgId, row.requirements);

        let sectorId = row.sectorId ?? null;
        if (!sectorId && row.sectorCode && row.sectorName) {
          const sectorUnitId = row.unitId ?? body.data.unitId ?? null;
          const [existingSector] = await db
            .select({ id: laiaSectorsTable.id })
            .from(laiaSectorsTable)
            .where(
              and(
                eq(laiaSectorsTable.organizationId, params.data.orgId),
                eq(laiaSectorsTable.code, row.sectorCode),
                sectorUnitId !== null && sectorUnitId !== undefined
                  ? eq(laiaSectorsTable.unitId, sectorUnitId)
                  : isNull(laiaSectorsTable.unitId),
              ),
            );

          if (existingSector) {
            sectorId = existingSector.id;
          } else {
            const [newSector] = await db
              .insert(laiaSectorsTable)
              .values({
                organizationId: params.data.orgId,
                unitId: row.unitId ?? body.data.unitId ?? null,
                code: row.sectorCode,
                name: row.sectorName,
                description: null,
                createdById: req.auth!.userId,
                updatedById: req.auth!.userId,
              })
              .returning({ id: laiaSectorsTable.id });
            sectorId = newSector.id;
          }
        }

        const assessmentId = await insertAssessmentWithRetry({
            organizationId: params.data.orgId,
            unitId: row.unitId ?? body.data.unitId ?? null,
            sectorId,
            methodologyVersionId,
            mode: row.mode,
            status: row.status,
            activityOperation: row.activityOperation,
            environmentalAspect: row.environmentalAspect,
            environmentalImpact: row.environmentalImpact,
            temporality: row.temporality ?? null,
            operationalSituation: row.operationalSituation ?? null,
            incidence: row.incidence ?? null,
            impactClass: row.impactClass ?? null,
            scope: row.scope ?? null,
            severity: row.severity ?? null,
            consequenceScore: row.consequenceScore ?? null,
            frequencyProbability: row.frequencyProbability ?? null,
            frequencyProbabilityScore: row.frequencyProbabilityScore ?? null,
            totalScore: row.totalScore ?? null,
            category: row.category ?? null,
            significance: row.significance ?? null,
            significanceReason: row.significanceReason ?? null,
            hasLegalRequirements: row.hasLegalRequirements ?? false,
            hasStakeholderDemand: row.hasStakeholderDemand ?? false,
            hasStrategicOption: row.hasStrategicOption ?? false,
            normalCondition: row.normalCondition ?? true,
            abnormalCondition: row.abnormalCondition ?? false,
            startupShutdown: row.startupShutdown ?? false,
            emergencyScenario: row.emergencyScenario ?? null,
            changeContext: row.changeContext ?? null,
            lifecycleStages: row.lifecycleStages ?? [],
            controlLevel: row.controlLevel,
            influenceLevel: row.influenceLevel ?? null,
            outsourcedProcess: row.outsourcedProcess ?? null,
            supplierReference: row.supplierReference ?? null,
            controlTypes: row.controlTypes ?? [],
            existingControls: row.existingControls ?? null,
            controlRequired: row.controlRequired ?? null,
            controlResponsibleUserId: row.controlResponsibleUserId ?? null,
            controlDueAt: parseDate(row.controlDueAt),
            communicationRequired: row.communicationRequired ?? false,
            communicationNotes: row.communicationNotes ?? null,
            reviewFrequencyDays: row.reviewFrequencyDays ?? null,
            nextReviewAt: parseDate(row.nextReviewAt),
            notes: row.notes ?? null,
            createdById: req.auth!.userId,
            updatedById: req.auth!.userId,
            aspectCode: row.aspectCode ?? null,
          });

        await Promise.all([
          syncAssessmentRequirements(params.data.orgId, assessmentId, row.requirements),
          syncAssessmentCommunicationPlans(
            params.data.orgId,
            assessmentId,
            req.auth!.userId,
            row.communicationPlans,
          ),
        ]);
        const snapshot = await getAssessmentSnapshot(params.data.orgId, assessmentId);
        await createRevision(
          params.data.orgId,
          assessmentId,
          req.auth!.userId,
          null,
          snapshot,
          "Avaliação importada",
        );
        imported += 1;
      } catch (error) {
        failed += 1;
        errors.push({
          row: index + 1,
          error: error instanceof Error ? error.message : "Falha na importação",
        });
      }
    }

    const summary = {
      imported,
      failed,
      total: body.data.rows.length,
      errors,
    };

    await db
      .update(laiaImportJobsTable)
      .set({
        status: failed > 0 ? "failed" : "completed",
        summary,
      })
      .where(eq(laiaImportJobsTable.id, job.id));

    res.json({
      jobId: job.id,
      ...summary,
    });
  },
);

router.get("/organizations/:orgId/environmental/laia/revisions", async (req, res) => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!requireOrgAccess(req, res, params.data.orgId)) return;

  const revisions = await db
    .select({
      id: laiaRevisionsTable.id,
      assessmentId: laiaRevisionsTable.assessmentId,
      title: laiaRevisionsTable.title,
      description: laiaRevisionsTable.description,
      revisionNumber: laiaRevisionsTable.revisionNumber,
      status: laiaRevisionsTable.status,
      createdAt: laiaRevisionsTable.createdAt,
      finalizedAt: laiaRevisionsTable.finalizedAt,
    })
    .from(laiaRevisionsTable)
    .where(eq(laiaRevisionsTable.organizationId, params.data.orgId))
    .orderBy(desc(laiaRevisionsTable.createdAt));

  const revisionIds = revisions.map((revision) => revision.id);
  const changes =
    revisionIds.length === 0
      ? []
      : await db
          .select()
          .from(laiaRevisionChangesTable)
          .where(inArray(laiaRevisionChangesTable.revisionId, revisionIds))
          .orderBy(desc(laiaRevisionChangesTable.createdAt));

  res.json(
    revisions.map((revision) => ({
      ...revision,
      createdAt: formatDate(revision.createdAt),
      finalizedAt: formatDate(revision.finalizedAt),
      changes: changes.filter((change) => change.revisionId === revision.id),
    })),
  );
});

router.get("/organizations/:orgId/environmental/laia/dashboard", async (req, res) => {
  const params = paramsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!requireOrgAccess(req, res, params.data.orgId)) return;

  const assessments = await db
    .select({
      id: laiaAssessmentsTable.id,
      significance: laiaAssessmentsTable.significance,
      category: laiaAssessmentsTable.category,
      unitId: laiaAssessmentsTable.unitId,
      sectorId: laiaAssessmentsTable.sectorId,
      hasLegalRequirements: laiaAssessmentsTable.hasLegalRequirements,
      operationalSituation: laiaAssessmentsTable.operationalSituation,
      lifecycleStages: laiaAssessmentsTable.lifecycleStages,
      controlResponsibleUserId: laiaAssessmentsTable.controlResponsibleUserId,
    })
    .from(laiaAssessmentsTable)
    .where(
      and(
        eq(laiaAssessmentsTable.organizationId, params.data.orgId),
        inArray(laiaAssessmentsTable.status, ["draft", "active"]),
      ),
    );

  const monitoringPlans = await db
    .select({
      assessmentId: laiaMonitoringPlansTable.assessmentId,
      status: laiaMonitoringPlansTable.status,
      nextDueAt: laiaMonitoringPlansTable.nextDueAt,
    })
    .from(laiaMonitoringPlansTable)
    .where(eq(laiaMonitoringPlansTable.organizationId, params.data.orgId));

  const now = Date.now();
  const monitoringPendingAssessmentIds = new Set(
    monitoringPlans
      .filter(
        (plan) =>
          !!plan.nextDueAt &&
          plan.nextDueAt.getTime() < now &&
          !["completed", "canceled"].includes(plan.status),
      )
      .map((plan) => plan.assessmentId),
  );

  const byOperationalSituation = assessments.reduce<Record<string, number>>(
    (acc, item) => {
      const key = item.operationalSituation || "nao_informado";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {},
  );

  const byLifecycleStage = assessments.reduce<Record<string, number>>(
    (acc, item) => {
      const stages = item.lifecycleStages.length > 0 ? item.lifecycleStages : ["nao_informado"];
      for (const stage of stages) {
        acc[stage] = (acc[stage] || 0) + 1;
      }
      return acc;
    },
    {},
  );

  res.json({
    totalAssessments: assessments.length,
    significantAssessments: assessments.filter((item) => item.significance === "significant")
      .length,
    criticalAssessments: assessments.filter((item) => item.category === "critico").length,
    withoutControlResponsible: assessments.filter((item) => !item.controlResponsibleUserId)
      .length,
    withLegalRequirement: assessments.filter((item) => item.hasLegalRequirements).length,
    withMonitoringPending: monitoringPendingAssessmentIds.size,
    byOperationalSituation,
    byLifecycleStage,
  });
});

export default router;
