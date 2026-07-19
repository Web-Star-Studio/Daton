import { Router, type IRouter } from "express";
import {
  eq,
  ne,
  and,
  ilike,
  or,
  not,
  isNull,
  isNotNull,
  count,
  desc,
  sql,
  exists,
  inArray,
} from "drizzle-orm";
import { z } from "zod";
import {
  db,
  departmentsTable,
  documentsTable,
  employeesTable,
  employeeProfileItemsTable,
  employeeProfileItemAttachmentsTable,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  employeePositionChangesTable,
  trainingCatalogTable,
  trainingEffectivenessReviewsTable,
  employeeAwarenessTable,
  employeeUnitsTable,
  positionCompetencyRequirementsTable,
  positionCompetencyMatrixRevisionsTable,
  positionsTable,
  sgqProcessesTable,
  strategicPlanObjectivesTable,
  strategicPlansTable,
  unitsTable,
  usersTable,
} from "@workspace/db";
import {
  ListEmployeesParams,
  ListEmployeesQueryParams,
  ListOrganizationTrainingsParams,
  ListOrganizationTrainingsQueryParams,
  ListEmployeeCompetencyGapsParams,
  ListEmployeeCompetencyGapsQueryParams,
  CreateEmployeeParams,
  CreateEmployeeBody,
  GetEmployeeParams,
  UpdateEmployeeParams,
  UpdateEmployeeBody,
  DeleteEmployeeParams,
  CreateEmployeeProfileItemParams,
  CreateEmployeeProfileItemBody,
  UpdateEmployeeProfileItemParams,
  UpdateEmployeeProfileItemBody,
  DeleteEmployeeProfileItemParams,
  AddEmployeeProfileItemAttachmentParams,
  AddEmployeeProfileItemAttachmentBody,
  DeleteEmployeeProfileItemAttachmentParams,
  ListCompetenciesParams,
  CreateCompetencyParams,
  CreateCompetencyBody,
  UpdateCompetencyParams,
  UpdateCompetencyBody,
  DeleteCompetencyParams,
  ListTrainingsParams,
  CreateTrainingParams,
  CreateTrainingBody,
  UpdateTrainingParams,
  UpdateTrainingBody,
  DeleteTrainingParams,
  ListTrainingEffectivenessReviewsParams,
  CreateTrainingEffectivenessReviewParams,
  CreateTrainingEffectivenessReviewBody,
  ListAwarenessParams,
  CreateAwarenessParams,
  CreateAwarenessBody,
  UpdateAwarenessParams,
  UpdateAwarenessBody,
  DeleteAwarenessParams,
  ListPositionCompetencyRequirementsParams,
  CreatePositionCompetencyRequirementParams,
  CreatePositionCompetencyRequirementBody,
  UpdatePositionCompetencyRequirementParams,
  UpdatePositionCompetencyRequirementBody,
  DeletePositionCompetencyRequirementParams,
  ListPositionCompetencyMatrixRevisionsParams,
  LinkEmployeeUnitParams,
  LinkEmployeeUnitBody,
  UnlinkEmployeeUnitParams,
} from "@workspace/api-zod";
import {
  requireAuth,
  requireModuleAccess,
  requireWriteAccess,
} from "../middlewares/auth";
import { applyTrainingRequirements } from "../services/aprendizagem/requirements-engine";
import { addMonthsClamped } from "../services/aprendizagem/date-helpers";
import {
  computeCompetencyGapStatusByEmployee,
  computeTrainingCompletionByEmployee,
} from "../services/aprendizagem/employee-learning-aggregates";
import { resolveEmployeeCompetencies } from "../services/aprendizagem/competency-resolver";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { lookupCpfReceitaFederal, InfosimplesError } from "../lib/infosimples";

// ─── Board de Eficácia — fragmentos SQL reutilizáveis (T1) ──────────────────
// Usados nas tasks T2 (filtro por coluna) e T3 (contagens das colunas do board).

/**
 * EXISTS: o treinamento tem pelo menos uma avaliação de eficácia registrada.
 * SQL: EXISTS (SELECT 1 FROM training_effectiveness_reviews r
 *              WHERE r.training_id = employee_trainings.id)
 */
export const boardHasReviewExists = exists(
  db
    .select({ one: sql<number>`1` })
    .from(trainingEffectivenessReviewsTable)
    .where(
      eq(
        trainingEffectivenessReviewsTable.trainingId,
        employeeTrainingsTable.id,
      ),
    ),
);

/**
 * Coluna "Concluídas": treinamentos com review registrado.
 * SQL: hasReview
 */
export const boardConcluidas = boardHasReviewExists;

/**
 * Coluna "Em Avaliação": sem review, mas com papel ou prazo de avaliação atribuídos.
 * SQL: NOT hasReview
 *      AND (effectiveness_assigned_role IS NOT NULL OR effectiveness_due_date IS NOT NULL)
 */
export const boardEmAvaliacao = and(
  not(boardHasReviewExists),
  or(
    isNotNull(employeeTrainingsTable.effectivenessAssignedRole),
    isNotNull(employeeTrainingsTable.effectivenessDueDate),
  )!,
)!;

/**
 * Coluna "Pendentes": sem review e sem qualquer configuração de avaliação atribuída.
 * SQL: NOT hasReview
 *      AND effectiveness_assigned_role IS NULL
 *      AND effectiveness_due_date IS NULL
 */
export const boardPendentes = and(
  not(boardHasReviewExists),
  isNull(employeeTrainingsTable.effectivenessAssignedRole),
  isNull(employeeTrainingsTable.effectivenessDueDate),
)!;

/**
 * Critério de eficácia "presente" para o status `pending`: evaluationMethod OU
 * targetCompetencyName não-nulo E não-vazio. Fonte ÚNICA da regra em SQL —
 * espelha exatamente o truthy do JS `getEffectivenessStatus` (`||`, onde string
 * vazia conta como ausente), eliminando a divergência SQL×JS. Ver #115.
 */
export const boardHasPendingCriteria = or(
  and(
    isNotNull(employeeTrainingsTable.evaluationMethod),
    ne(employeeTrainingsTable.evaluationMethod, ""),
  ),
  and(
    isNotNull(employeeTrainingsTable.targetCompetencyName),
    ne(employeeTrainingsTable.targetCompetencyName, ""),
  ),
)!;

/**
 * Filtro de escopo `needs_evaluation`: inclui apenas treinamentos que têm
 * alguma configuração de avaliação de eficácia ou já possuem uma review.
 * Espelha o conjunto de estados NÃO-nulos de `getEffectivenessStatus`:
 * pending (critério presente) + in_review (papel OU **prazo** atribuído) + review.
 * SQL: (critério de pending presente — ver boardHasPendingCriteria)
 *      OR effectiveness_assigned_role IS NOT NULL
 *      OR effectiveness_due_date IS NOT NULL   -- in_review por prazo (SQL×JS, #115)
 *      OR EXISTS (review)
 */
export const boardNeedsEvaluationScope = or(
  boardHasPendingCriteria,
  isNotNull(employeeTrainingsTable.effectivenessAssignedRole),
  isNotNull(employeeTrainingsTable.effectivenessDueDate),
  boardHasReviewExists,
)!;

// ─────────────────────────────────────────────────────────────────────────────

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const MAX_PROFILE_ITEM_ATTACHMENTS = 10;
const MAX_PROFILE_ITEM_ATTACHMENT_FILE_SIZE = 20 * 1024 * 1024;
const PROFILE_ITEM_ATTACHMENT_PREFIX = "/objects/uploads/";

async function verifyEmployeeOwnership(
  empId: number,
  orgId: number,
): Promise<boolean> {
  const [emp] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, empId),
        eq(employeesTable.organizationId, orgId),
      ),
    );
  return !!emp;
}

interface EmployeeRow {
  id: number;
  organizationId: number;
  unitId: number | null;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  birthDate: string | null;
  gender: string | null;
  education: string | null;
  contractType: string;
  admissionDate: string | null;
  terminationDate: string | null;
  status: string;
  unitName?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

type TrainingReviewRow =
  typeof trainingEffectivenessReviewsTable.$inferSelect & {
    evaluatorName?: string | null;
  };

type PositionCompetencyRequirementRow =
  typeof positionCompetencyRequirementsTable.$inferSelect;

type AwarenessReferenceMaps = {
  documentTitles: Map<number, string>;
  processNames: Map<number, string>;
  objectiveLabels: Map<number, string>;
};

type PositionSummaryRow = typeof positionsTable.$inferSelect;

function deriveTrainingStatus(
  status: string,
  expirationDate: string | null,
): string {
  if (expirationDate) {
    const expDate = new Date(expirationDate);
    if (expDate < new Date()) {
      return "vencido";
    }
  }
  return status;
}

function normalizeCompetencyText(value: string | null | undefined): string {
  return (value || "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeCompetencyType(value: string | null | undefined): string {
  return normalizeCompetencyText(value) || "habilidade";
}

function buildCompetencyKey(
  name: string | null | undefined,
  type: string | null | undefined,
): string {
  return `${normalizeCompetencyText(name)}::${normalizeCompetencyType(type)}`;
}

function getTodayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

function toIsoDateTime(
  value: Date | string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function getEffectivenessStatus(
  reviews: TrainingReviewRow[],
  training: typeof employeeTrainingsTable.$inferSelect,
): "pending" | "in_review" | "effective" | "ineffective" | null {
  if (reviews.length > 0) {
    return reviews[0]?.isEffective ? "effective" : "ineffective";
  }

  if (
    training.effectivenessAssignedRole != null ||
    training.effectivenessDueDate != null
  ) {
    return "in_review";
  }

  // "pending": critério de eficácia presente. O `||` trata string vazia como
  // ausente (falsy) — a contraparte SQL é `boardHasPendingCriteria` (não-nulo E
  // não-vazio), mantida idêntica a esta regra. Ver #115.
  if (training.evaluationMethod || training.targetCompetencyName) {
    return "pending";
  }

  return null;
}

function formatTrainingEffectivenessReview(review: TrainingReviewRow) {
  return {
    id: review.id,
    trainingId: review.trainingId,
    evaluatorUserId: review.evaluatorUserId,
    evaluatorName: review.evaluatorName || null,
    evaluatorRole: review.evaluatorRole || null,
    evaluationDate: review.evaluationDate,
    score: review.score,
    isEffective: review.isEffective,
    resultLevel: review.resultLevel,
    comments: review.comments,
    attachments: formatEmployeeRecordAttachments(review.attachments),
    createdAt: toIsoDateTime(review.createdAt),
  };
}

function formatPositionCompetencyRequirement(
  requirement: PositionCompetencyRequirementRow,
) {
  return {
    ...requirement,
    createdAt: toIsoDateTime(requirement.createdAt),
    updatedAt: toIsoDateTime(requirement.updatedAt),
  };
}

function formatEmployee(e: EmployeeRow) {
  return {
    id: e.id,
    organizationId: e.organizationId,
    unitId: e.unitId,
    name: e.name,
    cpf: e.cpf,
    email: e.email,
    phone: e.phone,
    position: e.position,
    department: e.department,
    birthDate: e.birthDate,
    gender: e.gender,
    education: e.education,
    contractType: e.contractType,
    admissionDate: e.admissionDate,
    terminationDate: e.terminationDate,
    status: e.status,
    unitName: e.unitName || null,
    createdAt:
      e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    updatedAt:
      e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
  };
}

const EMPLOYEE_REQUIRED_FIELD_LABELS = {
  name: "Nome completo",
  admissionDate: "Data de admissão",
} as const;

const EMPLOYEE_TEXT_FIELDS = [
  "name",
  "cpf",
  "email",
  "phone",
  "position",
  "department",
  "birthDate",
  "gender",
  "education",
  "admissionDate",
  "terminationDate",
] as const;

type ProfileItemCategory =
  | "professional_experience"
  | "education_certification";

type ProfileItemAttachmentInput = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

type EmployeeRecordAttachmentInput = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

type ProfileItemInput = {
  title: string;
  description?: string | null;
  attachments?: ProfileItemAttachmentInput[];
};

type ProfileItemRow = {
  id: number;
  employeeId: number;
  category: string;
  title: string;
  description: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ProfileItemAttachmentRow = {
  id: number;
  itemId: number;
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
  uploadedAt: Date | string;
};

const EMPLOYEE_RECORD_ATTACHMENT_MIME_PATTERN =
  /^(application\/pdf|image\/.+)$/i;

function sanitizeEmployeePayload(payload: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = { ...payload };

  for (const field of EMPLOYEE_TEXT_FIELDS) {
    if (!(field in sanitized)) continue;

    const value = sanitized[field];
    if (typeof value !== "string") continue;

    const trimmedValue = value.trim();
    if (
      trimmedValue.length === 0 &&
      !Object.hasOwn(EMPLOYEE_REQUIRED_FIELD_LABELS, field)
    ) {
      delete sanitized[field];
      continue;
    }

    sanitized[field] = trimmedValue;
  }

  return sanitized;
}

function getInvalidRequiredEmployeeFields(
  payload: Record<string, unknown>,
  options: { requireAllFields: boolean },
): string[] {
  return (
    Object.entries(EMPLOYEE_REQUIRED_FIELD_LABELS) as Array<
      [keyof typeof EMPLOYEE_REQUIRED_FIELD_LABELS, string]
    >
  )
    .filter(([field]) => {
      if (!(field in payload)) return options.requireAllFields;

      const value = payload[field];
      if (value == null) return true;
      if (typeof value === "string") return value.trim().length === 0;
      return false;
    })
    .map(([, label]) => label);
}

type ProfileItemInsertExecutor = Pick<typeof db, "insert">;
type PositionCompetencyMatrixExecutor = Pick<typeof db, "select" | "insert">;

async function verifyProfileItemOwnership(
  itemId: number,
  empId: number,
  orgId: number,
): Promise<boolean> {
  const [item] = await db
    .select({ id: employeeProfileItemsTable.id })
    .from(employeeProfileItemsTable)
    .innerJoin(
      employeesTable,
      eq(employeeProfileItemsTable.employeeId, employeesTable.id),
    )
    .where(
      and(
        eq(employeeProfileItemsTable.id, itemId),
        eq(employeeProfileItemsTable.employeeId, empId),
        eq(employeesTable.organizationId, orgId),
      ),
    );

  return !!item;
}

async function validateEmployeeReferenceValues(
  orgId: number,
  payload: {
    department?: string | null;
    position?: string | null;
  },
): Promise<string | null> {
  if (payload.department) {
    const [department] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(
        and(
          eq(departmentsTable.organizationId, orgId),
          eq(departmentsTable.name, payload.department),
        ),
      );

    if (!department) {
      return "Departamento não pertence a esta organização";
    }
  }

  if (payload.position) {
    const [position] = await db
      .select({ id: positionsTable.id })
      .from(positionsTable)
      .where(
        and(
          eq(positionsTable.organizationId, orgId),
          eq(positionsTable.name, payload.position),
        ),
      );

    if (!position) {
      return "Cargo não pertence a esta organização";
    }
  }

  return null;
}

async function getPositionRecord(
  posId: number,
  orgId: number,
): Promise<PositionSummaryRow | null> {
  const [position] = await db
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.id, posId),
        eq(positionsTable.organizationId, orgId),
      ),
    );

  return position || null;
}

async function validateAwarenessLinks(
  orgId: number,
  payload: {
    policyDocumentId?: number | null;
    documentId?: number | null;
    processId?: number | null;
    objectiveId?: number | null;
  },
): Promise<string | null> {
  if (payload.policyDocumentId != null) {
    const [policyDoc] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, payload.policyDocumentId),
          eq(documentsTable.organizationId, orgId),
          eq(documentsTable.type, "politica"),
        ),
      );

    if (!policyDoc) {
      return "Política informada não pertence à organização ou não é um documento do tipo política";
    }
  }

  if (payload.documentId != null) {
    const [document] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, payload.documentId),
          eq(documentsTable.organizationId, orgId),
        ),
      );

    if (!document) {
      return "Documento informado não pertence à organização";
    }
  }

  if (payload.processId != null) {
    const [process] = await db
      .select({ id: sgqProcessesTable.id })
      .from(sgqProcessesTable)
      .where(
        and(
          eq(sgqProcessesTable.id, payload.processId),
          eq(sgqProcessesTable.organizationId, orgId),
        ),
      );

    if (!process) {
      return "Processo SGQ informado não pertence à organização";
    }
  }

  if (payload.objectiveId != null) {
    const [objective] = await db
      .select({ id: strategicPlanObjectivesTable.id })
      .from(strategicPlanObjectivesTable)
      .innerJoin(
        strategicPlansTable,
        eq(strategicPlanObjectivesTable.planId, strategicPlansTable.id),
      )
      .where(
        and(
          eq(strategicPlanObjectivesTable.id, payload.objectiveId),
          eq(strategicPlansTable.organizationId, orgId),
        ),
      );

    if (!objective) {
      return "Objetivo estratégico informado não pertence à organização";
    }
  }

  return null;
}

function sanitizeProfileItemInput<T extends ProfileItemInput>(item: T): T {
  return {
    ...item,
    title: item.title.trim(),
    description: item.description?.trim() || undefined,
    attachments: item.attachments?.map((attachment) => ({
      ...attachment,
      fileName: attachment.fileName.trim(),
      contentType: attachment.contentType.trim(),
      objectPath: attachment.objectPath.trim(),
    })),
  };
}

async function validateProfileItemAttachment(
  attachment: ProfileItemAttachmentInput,
): Promise<string | null> {
  if (!attachment.objectPath.startsWith(PROFILE_ITEM_ATTACHMENT_PREFIX)) {
    return "Anexo inválido: objectPath deve apontar para /objects/uploads/";
  }

  if (attachment.fileSize > MAX_PROFILE_ITEM_ATTACHMENT_FILE_SIZE) {
    return "Anexo inválido: tamanho máximo por arquivo é 20MB";
  }

  try {
    await objectStorageService.getObjectEntityFile(attachment.objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return "Anexo inválido: arquivo não encontrado no storage";
    }
    throw error;
  }

  return null;
}

async function validateProfileItemAttachments(
  attachments: ProfileItemAttachmentInput[] | undefined,
): Promise<string | null> {
  if (!attachments?.length) return null;

  if (attachments.length > MAX_PROFILE_ITEM_ATTACHMENTS) {
    return `Cada item permite no máximo ${MAX_PROFILE_ITEM_ATTACHMENTS} anexos`;
  }

  for (const attachment of attachments) {
    const validationError = await validateProfileItemAttachment(attachment);
    if (validationError) return validationError;
  }

  return null;
}

function sanitizeEmployeeRecordAttachments(
  attachments: EmployeeRecordAttachmentInput[] | undefined,
): EmployeeRecordAttachmentInput[] | undefined {
  if (!attachments?.length) return undefined;

  return attachments.map((attachment) => ({
    fileName: attachment.fileName.trim(),
    fileSize: attachment.fileSize,
    contentType: attachment.contentType.trim(),
    objectPath: attachment.objectPath.trim(),
  }));
}

async function validateEmployeeRecordAttachments(
  attachments: EmployeeRecordAttachmentInput[] | undefined,
): Promise<string | null> {
  if (!attachments?.length) return null;

  if (attachments.length > MAX_PROFILE_ITEM_ATTACHMENTS) {
    return `Cada registro permite no máximo ${MAX_PROFILE_ITEM_ATTACHMENTS} anexos`;
  }

  for (const attachment of attachments) {
    if (!EMPLOYEE_RECORD_ATTACHMENT_MIME_PATTERN.test(attachment.contentType)) {
      return "Anexo inválido: apenas arquivos PDF ou imagem são permitidos";
    }

    const validationError = await validateProfileItemAttachment(attachment);
    if (validationError) return validationError;
  }

  return null;
}

function formatEmployeeRecordAttachments(
  attachments: EmployeeRecordAttachmentInput[] | null | undefined,
) {
  return Array.isArray(attachments) ? attachments : [];
}

function formatCompetencyRecord(
  competency: typeof employeeCompetenciesTable.$inferSelect,
) {
  return {
    ...competency,
    attachments: formatEmployeeRecordAttachments(competency.attachments),
    createdAt:
      competency.createdAt instanceof Date
        ? competency.createdAt.toISOString()
        : competency.createdAt,
    updatedAt:
      competency.updatedAt instanceof Date
        ? competency.updatedAt.toISOString()
        : competency.updatedAt,
  };
}

function formatTrainingRecord(
  training: typeof employeeTrainingsTable.$inferSelect,
  options?: { reviews?: TrainingReviewRow[] },
) {
  const reviews = options?.reviews || [];
  return {
    ...training,
    attachments: formatEmployeeRecordAttachments(training.attachments),
    status: deriveTrainingStatus(training.status, training.expirationDate),
    latestEffectivenessReview: reviews[0]
      ? formatTrainingEffectivenessReview(reviews[0])
      : null,
    effectivenessReviews: reviews.map(formatTrainingEffectivenessReview),
    createdAt:
      training.createdAt instanceof Date
        ? training.createdAt.toISOString()
        : training.createdAt,
    updatedAt:
      training.updatedAt instanceof Date
        ? training.updatedAt.toISOString()
        : training.updatedAt,
  };
}

function formatAwarenessRecord(
  awareness: typeof employeeAwarenessTable.$inferSelect,
  referenceMaps?: AwarenessReferenceMaps,
) {
  return {
    ...awareness,
    attachments: formatEmployeeRecordAttachments(awareness.attachments),
    policyDocumentTitle: awareness.policyDocumentId
      ? referenceMaps?.documentTitles.get(awareness.policyDocumentId) || null
      : null,
    documentTitle: awareness.documentId
      ? referenceMaps?.documentTitles.get(awareness.documentId) || null
      : null,
    processName: awareness.processId
      ? referenceMaps?.processNames.get(awareness.processId) || null
      : null,
    objectiveLabel: awareness.objectiveId
      ? referenceMaps?.objectiveLabels.get(awareness.objectiveId) || null
      : null,
    createdAt:
      awareness.createdAt instanceof Date
        ? awareness.createdAt.toISOString()
        : awareness.createdAt,
    updatedAt:
      awareness.updatedAt instanceof Date
        ? awareness.updatedAt.toISOString()
        : awareness.updatedAt,
  };
}

async function loadTrainingReviewRows(
  trainingIds: number[],
): Promise<Map<number, TrainingReviewRow[]>> {
  if (trainingIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: trainingEffectivenessReviewsTable.id,
      trainingId: trainingEffectivenessReviewsTable.trainingId,
      evaluatorUserId: trainingEffectivenessReviewsTable.evaluatorUserId,
      evaluationDate: trainingEffectivenessReviewsTable.evaluationDate,
      score: trainingEffectivenessReviewsTable.score,
      isEffective: trainingEffectivenessReviewsTable.isEffective,
      resultLevel: trainingEffectivenessReviewsTable.resultLevel,
      comments: trainingEffectivenessReviewsTable.comments,
      attachments: trainingEffectivenessReviewsTable.attachments,
      legacyV1Id: trainingEffectivenessReviewsTable.legacyV1Id,
      evaluatorRole: trainingEffectivenessReviewsTable.evaluatorRole,
      createdAt: trainingEffectivenessReviewsTable.createdAt,
      evaluatorName: usersTable.name,
    })
    .from(trainingEffectivenessReviewsTable)
    .leftJoin(
      usersTable,
      eq(trainingEffectivenessReviewsTable.evaluatorUserId, usersTable.id),
    )
    .where(inArray(trainingEffectivenessReviewsTable.trainingId, trainingIds))
    .orderBy(
      sql`${trainingEffectivenessReviewsTable.evaluationDate} desc`,
      sql`${trainingEffectivenessReviewsTable.createdAt} desc`,
    );

  const reviewMap = new Map<number, TrainingReviewRow[]>();
  for (const row of rows) {
    const items = reviewMap.get(row.trainingId) || [];
    items.push(row);
    reviewMap.set(row.trainingId, items);
  }

  return reviewMap;
}

async function loadAwarenessReferenceMaps(
  orgId: number,
  awarenessRows: Array<typeof employeeAwarenessTable.$inferSelect>,
): Promise<AwarenessReferenceMaps> {
  const documentIds = [
    ...new Set(
      awarenessRows
        .flatMap((row) => [row.policyDocumentId, row.documentId])
        .filter((value): value is number => value != null),
    ),
  ];
  const processIds = [
    ...new Set(
      awarenessRows
        .map((row) => row.processId)
        .filter((value): value is number => value != null),
    ),
  ];
  const objectiveIds = [
    ...new Set(
      awarenessRows
        .map((row) => row.objectiveId)
        .filter((value): value is number => value != null),
    ),
  ];

  const documentTitles = new Map<number, string>();
  const processNames = new Map<number, string>();
  const objectiveLabels = new Map<number, string>();

  if (documentIds.length > 0) {
    const documentRows = await db
      .select({ id: documentsTable.id, title: documentsTable.title })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.organizationId, orgId),
          inArray(documentsTable.id, documentIds),
        ),
      );
    for (const row of documentRows) {
      documentTitles.set(row.id, row.title);
    }
  }

  if (processIds.length > 0) {
    const processRows = await db
      .select({ id: sgqProcessesTable.id, name: sgqProcessesTable.name })
      .from(sgqProcessesTable)
      .where(
        and(
          eq(sgqProcessesTable.organizationId, orgId),
          inArray(sgqProcessesTable.id, processIds),
        ),
      );
    for (const row of processRows) {
      processNames.set(row.id, row.name);
    }
  }

  if (objectiveIds.length > 0) {
    const objectiveRows = await db
      .select({
        id: strategicPlanObjectivesTable.id,
        code: strategicPlanObjectivesTable.code,
        description: strategicPlanObjectivesTable.description,
      })
      .from(strategicPlanObjectivesTable)
      .innerJoin(
        strategicPlansTable,
        eq(strategicPlanObjectivesTable.planId, strategicPlansTable.id),
      )
      .where(
        and(
          eq(strategicPlansTable.organizationId, orgId),
          inArray(strategicPlanObjectivesTable.id, objectiveIds),
        ),
      );
    for (const row of objectiveRows) {
      objectiveLabels.set(
        row.id,
        row.code ? `${row.code} · ${row.description}` : row.description,
      );
    }
  }

  return {
    documentTitles,
    processNames,
    objectiveLabels,
  };
}

async function validateProfileItemInputs(
  items: ProfileItemInput[] | undefined,
): Promise<string | null> {
  if (!items?.length) return null;

  for (const item of items.map(sanitizeProfileItemInput)) {
    if (!item.title.trim()) {
      return "Item inválido: título é obrigatório";
    }

    const attachmentValidationError = await validateProfileItemAttachments(
      item.attachments,
    );
    if (attachmentValidationError) return attachmentValidationError;
  }

  return null;
}

function formatProfileItemAttachment(attachment: ProfileItemAttachmentRow) {
  return {
    id: attachment.id,
    itemId: attachment.itemId,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    contentType: attachment.contentType,
    objectPath: attachment.objectPath,
    uploadedAt:
      attachment.uploadedAt instanceof Date
        ? attachment.uploadedAt.toISOString()
        : attachment.uploadedAt,
  };
}

function formatProfileItem(
  item: ProfileItemRow,
  attachmentsByItemId: Map<number, ProfileItemAttachmentRow[]>,
) {
  return {
    id: item.id,
    employeeId: item.employeeId,
    category: item.category,
    title: item.title,
    description: item.description,
    attachments: (attachmentsByItemId.get(item.id) || []).map(
      formatProfileItemAttachment,
    ),
    createdAt:
      item.createdAt instanceof Date
        ? item.createdAt.toISOString()
        : item.createdAt,
    updatedAt:
      item.updatedAt instanceof Date
        ? item.updatedAt.toISOString()
        : item.updatedAt,
  };
}

async function loadEmployeeProfileItems(empId: number) {
  const itemRows = await db
    .select({
      id: employeeProfileItemsTable.id,
      employeeId: employeeProfileItemsTable.employeeId,
      category: employeeProfileItemsTable.category,
      title: employeeProfileItemsTable.title,
      description: employeeProfileItemsTable.description,
      createdAt: employeeProfileItemsTable.createdAt,
      updatedAt: employeeProfileItemsTable.updatedAt,
    })
    .from(employeeProfileItemsTable)
    .where(eq(employeeProfileItemsTable.employeeId, empId))
    .orderBy(employeeProfileItemsTable.createdAt);

  const itemIds = itemRows.map((item) => item.id);
  const attachmentRows =
    itemIds.length === 0
      ? []
      : await db
          .select({
            id: employeeProfileItemAttachmentsTable.id,
            itemId: employeeProfileItemAttachmentsTable.itemId,
            fileName: employeeProfileItemAttachmentsTable.fileName,
            fileSize: employeeProfileItemAttachmentsTable.fileSize,
            contentType: employeeProfileItemAttachmentsTable.contentType,
            objectPath: employeeProfileItemAttachmentsTable.objectPath,
            uploadedAt: employeeProfileItemAttachmentsTable.uploadedAt,
          })
          .from(employeeProfileItemAttachmentsTable)
          .where(inArray(employeeProfileItemAttachmentsTable.itemId, itemIds))
          .orderBy(employeeProfileItemAttachmentsTable.uploadedAt);

  const attachmentsByItemId = new Map<number, ProfileItemAttachmentRow[]>();
  for (const attachment of attachmentRows) {
    const entries = attachmentsByItemId.get(attachment.itemId) || [];
    entries.push(attachment);
    attachmentsByItemId.set(attachment.itemId, entries);
  }

  const formattedItems = itemRows.map((item) =>
    formatProfileItem(item, attachmentsByItemId),
  );

  return {
    professionalExperiences: formattedItems.filter(
      (item) => item.category === "professional_experience",
    ),
    educationCertifications: formattedItems.filter(
      (item) => item.category === "education_certification",
    ),
  };
}

async function loadProfileItemAttachmentRows(
  itemId: number,
): Promise<ProfileItemAttachmentRow[]> {
  return db
    .select({
      id: employeeProfileItemAttachmentsTable.id,
      itemId: employeeProfileItemAttachmentsTable.itemId,
      fileName: employeeProfileItemAttachmentsTable.fileName,
      fileSize: employeeProfileItemAttachmentsTable.fileSize,
      contentType: employeeProfileItemAttachmentsTable.contentType,
      objectPath: employeeProfileItemAttachmentsTable.objectPath,
      uploadedAt: employeeProfileItemAttachmentsTable.uploadedAt,
    })
    .from(employeeProfileItemAttachmentsTable)
    .where(eq(employeeProfileItemAttachmentsTable.itemId, itemId))
    .orderBy(employeeProfileItemAttachmentsTable.uploadedAt);
}

async function createEmployeeProfileItems(
  executor: ProfileItemInsertExecutor,
  employeeId: number,
  items: ProfileItemInput[] | undefined,
  category: ProfileItemCategory,
) {
  if (!items?.length) return;

  const sanitizedItems = items.map(sanitizeProfileItemInput);
  const createdItems = await executor
    .insert(employeeProfileItemsTable)
    .values(
      sanitizedItems.map((item) => ({
        employeeId,
        category,
        title: item.title,
        description: item.description || null,
      })),
    )
    .returning();

  const attachmentValues = createdItems.flatMap((createdItem, index) => {
    const itemAttachments = sanitizedItems[index]?.attachments || [];
    return itemAttachments.map((attachment) => ({
      itemId: createdItem.id,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      contentType: attachment.contentType,
      objectPath: attachment.objectPath,
    }));
  });

  if (attachmentValues.length > 0) {
    await executor
      .insert(employeeProfileItemAttachmentsTable)
      .values(attachmentValues);
  }
}

async function loadPositionCompetencyRequirements(
  positionId: number,
): Promise<PositionCompetencyRequirementRow[]> {
  return db
    .select()
    .from(positionCompetencyRequirementsTable)
    .where(eq(positionCompetencyRequirementsTable.positionId, positionId))
    .orderBy(
      positionCompetencyRequirementsTable.sortOrder,
      positionCompetencyRequirementsTable.competencyName,
    );
}

async function createPositionCompetencyMatrixRevision(
  executor: PositionCompetencyMatrixExecutor,
  positionId: number,
  userId: number,
) {
  const requirements = await executor
    .select()
    .from(positionCompetencyRequirementsTable)
    .where(eq(positionCompetencyRequirementsTable.positionId, positionId))
    .orderBy(
      positionCompetencyRequirementsTable.sortOrder,
      positionCompetencyRequirementsTable.competencyName,
    );

  const [latestRevision] = await executor
    .select({
      revisionNumber: positionCompetencyMatrixRevisionsTable.revisionNumber,
    })
    .from(positionCompetencyMatrixRevisionsTable)
    .where(eq(positionCompetencyMatrixRevisionsTable.positionId, positionId))
    .orderBy(sql`${positionCompetencyMatrixRevisionsTable.revisionNumber} desc`)
    .limit(1);

  const snapshot = requirements.map((requirement) => ({
    id: requirement.id,
    positionId: requirement.positionId,
    competencyName: requirement.competencyName,
    competencyType: requirement.competencyType,
    requiredLevel: requirement.requiredLevel,
    notes: requirement.notes,
    sortOrder: requirement.sortOrder,
    createdById: requirement.createdById,
    updatedById: requirement.updatedById,
    createdAt: toIsoDateTime(requirement.createdAt)!,
    updatedAt: toIsoDateTime(requirement.updatedAt)!,
  }));

  await executor.insert(positionCompetencyMatrixRevisionsTable).values({
    positionId,
    revisionNumber: (latestRevision?.revisionNumber || 0) + 1,
    snapshot,
    createdById: userId,
  });
}

router.get(
  "/organizations/:orgId/employees",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListEmployeesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const query = ListEmployeesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }

    const conditions = [eq(employeesTable.organizationId, params.data.orgId)];

    const normalizedSearch = query.data.search?.trim();
    if (normalizedSearch) {
      const s = `%${normalizedSearch}%`;
      conditions.push(
        or(
          ilike(employeesTable.name, s),
          ilike(employeesTable.email, s),
          ilike(employeesTable.cpf, s),
          ilike(employeesTable.department, s),
          ilike(employeesTable.position, s),
        )!,
      );
    }
    if (query.data.unitId) {
      const targetUnitId = query.data.unitId;
      conditions.push(
        or(
          eq(employeesTable.unitId, targetUnitId),
          exists(
            db
              .select({ id: employeeUnitsTable.id })
              .from(employeeUnitsTable)
              .where(
                and(
                  eq(employeeUnitsTable.employeeId, employeesTable.id),
                  eq(employeeUnitsTable.unitId, targetUnitId),
                ),
              ),
          ),
        )!,
      );
    }
    if (query.data.position) {
      conditions.push(eq(employeesTable.position, query.data.position));
    }
    const baseConditions = [...conditions];
    // colaboradores que têm um usuário (login) vinculado (FK users.employee_id)
    const hasLinkedUser = sql`EXISTS (SELECT 1 FROM users u WHERE u.employee_id = ${employeesTable.id})`;
    const onlyWithUser = req.query.hasUser === "true";
    if (onlyWithUser) {
      conditions.push(hasLinkedUser);
    }
    if (query.data.status) {
      conditions.push(eq(employeesTable.status, query.data.status));
    }

    const page = query.data.page || 1;
    const pageSize = query.data.pageSize || 25;
    const offset = (page - 1) * pageSize;

    const whereClause = and(...conditions);

    const [totalResult] = await db
      .select({ total: count() })
      .from(employeesTable)
      .where(whereClause);

    const rows = await db
      .select({
        id: employeesTable.id,
        organizationId: employeesTable.organizationId,
        unitId: employeesTable.unitId,
        name: employeesTable.name,
        cpf: employeesTable.cpf,
        email: employeesTable.email,
        phone: employeesTable.phone,
        position: employeesTable.position,
        department: employeesTable.department,
        birthDate: employeesTable.birthDate,
        gender: employeesTable.gender,
        education: employeesTable.education,
        contractType: employeesTable.contractType,
        admissionDate: employeesTable.admissionDate,
        terminationDate: employeesTable.terminationDate,
        status: employeesTable.status,
        createdAt: employeesTable.createdAt,
        updatedAt: employeesTable.updatedAt,
        unitName: unitsTable.name,
      })
      .from(employeesTable)
      .leftJoin(unitsTable, eq(employeesTable.unitId, unitsTable.id))
      .where(whereClause)
      .orderBy(employeesTable.name)
      .limit(pageSize)
      .offset(offset);

    const statusRows = await db
      .select({ status: employeesTable.status, n: count() })
      .from(employeesTable)
      .where(and(...baseConditions))
      .groupBy(employeesTable.status);
    const statusCounts = { active: 0, inactive: 0, onLeave: 0 };
    for (const r of statusRows) {
      if (r.status === "active") statusCounts.active = r.n;
      else if (r.status === "inactive") statusCounts.inactive = r.n;
      else if (r.status === "on_leave") statusCounts.onLeave = r.n;
    }

    const [userCountRow] = await db
      .select({ n: count() })
      .from(usersTable)
      .where(eq(usersTable.organizationId, params.data.orgId));
    const userCount = userCountRow?.n ?? 0;

    // colaboradores (no escopo, sem filtro de status) que têm usuário vinculado
    const [withUserRow] = await db
      .select({ n: count() })
      .from(employeesTable)
      .where(and(...baseConditions, hasLinkedUser));
    const withUserCount = withUserRow?.n ?? 0;

    // ── Agregados de aprendizagem por colaborador (página corrente) ───────────
    const pageEmployeeIds = rows.map((r) => r.id);
    const pageEmployeesForGap = rows.map((r) => ({
      id: r.id,
      position: r.position,
    }));
    // Último dia do mês corrente (UTC), mesma lógica de learning-summary.ts:94–97
    const _now = new Date();
    const _endOfMonth = new Date(
      Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth() + 1, 0),
    )
      .toISOString()
      .slice(0, 10);

    const [gapStatusMap, trainingCompletionMap] = await Promise.all([
      computeCompetencyGapStatusByEmployee(
        db,
        params.data.orgId,
        pageEmployeesForGap,
      ),
      computeTrainingCompletionByEmployee(
        db,
        params.data.orgId,
        pageEmployeeIds,
        _endOfMonth,
      ),
    ]);

    res.json({
      data: rows.map((row) => ({
        ...formatEmployee(row),
        trainingCompletionPercent: trainingCompletionMap.get(row.id) ?? null,
        competencyGapStatus: gapStatusMap.get(row.id) ?? "ok",
      })),
      pagination: {
        page,
        pageSize,
        total: totalResult.total,
        totalPages: Math.ceil(totalResult.total / pageSize),
      },
      statusCounts,
      userCount,
      withUserCount,
    });
  },
);

const LookupCpfParams = z.object({
  orgId: z.coerce.number().int().positive(),
});

const LookupCpfBody = z.object({
  cpf: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().length(11, "CPF deve conter 11 dígitos")),
  birthdate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Data de nascimento deve estar em ISO 8601 (YYYY-MM-DD)",
    ),
});

// Fase 6: histórico de mudanças de cargo (exibido no Cronograma). Sob o prefixo
// /employees para herdar o gate do módulo employees. Registrado ANTES das rotas
// /employees/:empId para "position-changes" não ser interpretado como empId.
router.get(
  "/organizations/:orgId/employees/position-changes",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = z
      .object({ orgId: z.coerce.number().int() })
      .safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const rows = await db
      .select({
        id: employeePositionChangesTable.id,
        employeeId: employeePositionChangesTable.employeeId,
        employeeName: employeesTable.name,
        previousPosition: employeePositionChangesTable.previousPosition,
        newPosition: employeePositionChangesTable.newPosition,
        changedByUserName: usersTable.name,
        trainingsGenerated: employeePositionChangesTable.trainingsGenerated,
        trainingsReused: employeePositionChangesTable.trainingsReused,
        createdAt: employeePositionChangesTable.createdAt,
      })
      .from(employeePositionChangesTable)
      .innerJoin(
        employeesTable,
        eq(employeePositionChangesTable.employeeId, employeesTable.id),
      )
      .leftJoin(
        usersTable,
        eq(employeePositionChangesTable.changedByUserId, usersTable.id),
      )
      .where(eq(employeePositionChangesTable.organizationId, params.data.orgId))
      .orderBy(desc(employeePositionChangesTable.createdAt))
      .limit(100);
    res.json(
      rows.map((r) => ({
        ...r,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
    );
  },
);

router.post(
  "/organizations/:orgId/employees/lookup-cpf",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = LookupCpfParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = LookupCpfBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    try {
      const result = await lookupCpfReceitaFederal({
        cpf: body.data.cpf,
        birthdate: body.data.birthdate,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof InfosimplesError) {
        const status =
          error.code === 612 || error.code === 613 || error.code === 614
            ? 404
            : 502;
        res.status(status).json({
          error: error.codeMessage || "Falha ao consultar a Receita Federal",
          code: error.code,
          details: error.errors,
        });
        return;
      }
      console.error("[employees:lookup-cpf]", error);
      res
        .status(500)
        .json({ error: "Erro interno ao consultar a Receita Federal" });
    }
  },
);

router.post(
  "/organizations/:orgId/employees",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = CreateEmployeeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const payload = sanitizeEmployeePayload(body.data) as typeof body.data;
    const invalidRequiredFields = getInvalidRequiredEmployeeFields(payload, {
      requireAllFields: true,
    });
    if (invalidRequiredFields.length > 0) {
      res.status(400).json({
        error: `${invalidRequiredFields.join(", ")} ${invalidRequiredFields.length > 1 ? "são obrigatórios" : "é obrigatório"}`,
      });
      return;
    }

    const {
      professionalExperiences,
      educationCertifications,
      ...employeePayload
    } = payload;

    const profileItemValidationError =
      (await validateProfileItemInputs(professionalExperiences)) ||
      (await validateProfileItemInputs(educationCertifications));
    if (profileItemValidationError) {
      res.status(400).json({ error: profileItemValidationError });
      return;
    }

    if (employeePayload.unitId) {
      const [unit] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(
          and(
            eq(unitsTable.id, employeePayload.unitId),
            eq(unitsTable.organizationId, params.data.orgId),
          ),
        );
      if (!unit) {
        res
          .status(400)
          .json({ error: "Unidade não pertence a esta organização" });
        return;
      }
    }

    const referenceValueError = await validateEmployeeReferenceValues(
      params.data.orgId,
      employeePayload,
    );
    if (referenceValueError) {
      res.status(400).json({ error: referenceValueError });
      return;
    }

    const { emp, autoLinked } = await db.transaction(async (tx) => {
      const [createdEmployee] = await tx
        .insert(employeesTable)
        .values({
          ...employeePayload,
          organizationId: params.data.orgId,
        })
        .returning();

      await createEmployeeProfileItems(
        tx,
        createdEmployee.id,
        professionalExperiences,
        "professional_experience",
      );
      await createEmployeeProfileItems(
        tx,
        createdEmployee.id,
        educationCertifications,
        "education_certification",
      );

      const autoLinked = await applyTrainingRequirements({
        orgId: params.data.orgId,
        employeeId: createdEmployee.id,
        database: tx,
      });

      return { emp: createdEmployee, autoLinked };
    });

    res
      .status(201)
      .json({ ...formatEmployee(emp), autoLinkedTrainings: autoLinked });
  },
);

router.get(
  "/organizations/:orgId/employees/trainings",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListOrganizationTrainingsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const query = ListOrganizationTrainingsQueryParams.extend({
      effectivenessStatus: z
        .enum(["pending", "in_review", "effective", "ineffective"])
        .optional(),
      /** Escopo do board de eficácia.
       *  - `needs_evaluation`: apenas treinamentos com avaliação configurada ou review registrado.
       *  - `all` (padrão): todos os treinamentos — mantém compatibilidade com os callers existentes. */
      scope: z.enum(["needs_evaluation", "all"]).optional().default("all"),
      /** Filtro por ano de conclusão (completionDate). */
      year: z.coerce.number().int().min(2000).max(2100).optional(),
      /** Filtro por papel atribuído para avaliação de eficácia. */
      evaluatorRole: z
        .enum(["gestor", "rh", "instrutor", "colaborador"])
        .optional(),
      /** Filtro por norma do item do catálogo vinculado (texto legado). */
      norm: z.string().optional(),
      /** Filtro por id da norma do catálogo (norm_ids do item vinculado). */
      normId: z.coerce.number().int().optional(),
      /** Coluna do board: aplica condição de coluna à query de dados e ao COUNT
       *  de paginação. As stats (boardCounts, eficazes…) sempre cobrem o
       *  conjunto filtrado inteiro, independente desta coluna. */
      boardColumn: z
        .enum(["pendentes", "em_avaliacao", "concluidas"])
        .optional(),
    }).safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }

    const page = query.data.page ?? 1;
    const pageSize = query.data.pageSize ?? 25;
    const offset = (page - 1) * pageSize;

    // ── Condições compartilhadas (sem boardColumn) ────────────────────────────
    const conditions: ReturnType<typeof and>[] = [
      eq(employeesTable.organizationId, params.data.orgId),
    ];
    const normalizedSearch = query.data.search?.trim();
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      conditions.push(
        or(
          ilike(employeesTable.name, pattern),
          ilike(employeeTrainingsTable.title, pattern),
          ilike(employeeTrainingsTable.description, pattern),
          ilike(employeeTrainingsTable.objective, pattern),
          ilike(employeeTrainingsTable.targetCompetencyName, pattern),
        )!,
      );
    }
    if (query.data.employeeId) {
      conditions.push(eq(employeesTable.id, query.data.employeeId));
    }
    if (query.data.department) {
      conditions.push(eq(employeesTable.department, query.data.department));
    }
    if (query.data.position) {
      conditions.push(eq(employeesTable.position, query.data.position));
    }
    if (query.data.unitId) {
      const targetUnitId = query.data.unitId;
      conditions.push(
        or(
          eq(employeesTable.unitId, targetUnitId),
          exists(
            db
              .select({ id: employeeUnitsTable.id })
              .from(employeeUnitsTable)
              .where(
                and(
                  eq(employeeUnitsTable.employeeId, employeesTable.id),
                  eq(employeeUnitsTable.unitId, targetUnitId),
                ),
              ),
          ),
        )!,
      );
    }
    if (query.data.scope === "needs_evaluation") {
      conditions.push(boardNeedsEvaluationScope);
    }
    // ── Filtros novos (T2) ────────────────────────────────────────────────────
    if (query.data.status) {
      const st = query.data.status;
      if (st === "concluido") {
        conditions.push(
          and(
            eq(employeeTrainingsTable.status, "concluido"),
            or(
              isNull(employeeTrainingsTable.expirationDate),
              sql`${employeeTrainingsTable.expirationDate} >= current_date`,
            )!,
          )!,
        );
      } else if (st === "vencido") {
        conditions.push(
          or(
            eq(employeeTrainingsTable.status, "vencido"),
            and(
              isNotNull(employeeTrainingsTable.expirationDate),
              sql`${employeeTrainingsTable.expirationDate} < current_date`,
            )!,
          )!,
        );
      } else {
        conditions.push(eq(employeeTrainingsTable.status, st));
      }
    }
    if (query.data.year) {
      conditions.push(
        sql`extract(year from ${employeeTrainingsTable.completionDate}) = ${query.data.year}`,
      );
    }
    if (query.data.evaluatorRole) {
      conditions.push(
        eq(
          employeeTrainingsTable.effectivenessAssignedRole,
          query.data.evaluatorRole,
        ),
      );
    }
    // Filtro por norma: `normId` (id do catálogo, dentro do array jsonb
    // norm_ids do item vinculado) tem precedência; `norm` (texto legado) é
    // mantido por compatibilidade.
    if (query.data.normId) {
      const normId = query.data.normId;
      conditions.push(
        exists(
          db
            .select({ one: sql<number>`1` })
            .from(trainingCatalogTable)
            .where(
              and(
                eq(
                  trainingCatalogTable.id,
                  sql`${employeeTrainingsTable.catalogItemId}`,
                ),
                sql`${trainingCatalogTable.normIds} @> ${JSON.stringify([normId])}::jsonb`,
              ),
            ),
        ),
      );
    } else if (query.data.norm) {
      const normValue = query.data.norm;
      conditions.push(
        exists(
          db
            .select({ one: sql<number>`1` })
            .from(trainingCatalogTable)
            .where(
              and(
                eq(
                  trainingCatalogTable.id,
                  sql`${employeeTrainingsTable.catalogItemId}`,
                ),
                eq(trainingCatalogTable.norm, normValue),
              ),
            ),
        ),
      );
    }
    // ── effectivenessStatus → SQL (paginação-safe; antes do LIMIT) ───────────
    if (query.data.effectivenessStatus) {
      const es = query.data.effectivenessStatus;
      if (es === "in_review") {
        // NOT hasReview AND (assignedRole IS NOT NULL OR dueDate IS NOT NULL)
        conditions.push(boardEmAvaliacao);
      } else if (es === "pending") {
        // NOT hasReview AND assignedRole IS NULL AND dueDate IS NULL
        // AND critério presente (não-nulo e não-vazio — espelha o JS, #115)
        conditions.push(and(boardPendentes, boardHasPendingCriteria)!);
      } else {
        // effective / ineffective: hasReview AND latest review is_effective = ?
        const latestIsEffSq = sql`(
          select r.is_effective
          from training_effectiveness_reviews r
          where r.training_id = ${employeeTrainingsTable.id}
          order by r.evaluation_date desc, r.created_at desc
          limit 1
        )`;
        conditions.push(
          and(
            boardHasReviewExists,
            es === "effective"
              ? sql`${latestIsEffSq} = true`
              : sql`${latestIsEffSq} = false`,
          )!,
        );
      }
    }
    // ── expiringWithinDays → SQL (paginação-safe; antes do LIMIT) ────────────
    if (query.data.expiringWithinDays) {
      const days = query.data.expiringWithinDays;
      // Calcular o horizonte em JS para passar como string DATE — evita ambiguidade
      // de tipo na binding `current_date + $N` em alguns drivers.
      const horizonDate = new Date(Date.now() + days * 86400000)
        .toISOString()
        .split("T")[0];
      conditions.push(
        and(
          isNotNull(employeeTrainingsTable.expirationDate),
          sql`${employeeTrainingsTable.expirationDate} >= current_date`,
          sql`${employeeTrainingsTable.expirationDate} <= ${horizonDate}::date`,
        )!,
      );
    }

    // ── Condição de coluna do board (só para query de dados + COUNT) ──────────
    const boardColumnCondition =
      query.data.boardColumn === "pendentes"
        ? boardPendentes
        : query.data.boardColumn === "em_avaliacao"
          ? boardEmAvaliacao
          : query.data.boardColumn === "concluidas"
            ? boardConcluidas
            : null;

    const dataConditions = boardColumnCondition
      ? [...conditions, boardColumnCondition]
      : conditions;

    // ── Query de DADOS — paginação SQL real ───────────────────────────────────
    const rows = await db
      .select({
        id: employeeTrainingsTable.id,
        employeeId: employeeTrainingsTable.employeeId,
        title: employeeTrainingsTable.title,
        description: employeeTrainingsTable.description,
        objective: employeeTrainingsTable.objective,
        institution: employeeTrainingsTable.institution,
        instructor: employeeTrainingsTable.instructor,
        targetCompetencyName: employeeTrainingsTable.targetCompetencyName,
        targetCompetencyType: employeeTrainingsTable.targetCompetencyType,
        targetCompetencyLevel: employeeTrainingsTable.targetCompetencyLevel,
        evaluationMethod: employeeTrainingsTable.evaluationMethod,
        renewalMonths: employeeTrainingsTable.renewalMonths,
        workloadHours: employeeTrainingsTable.workloadHours,
        completionDate: employeeTrainingsTable.completionDate,
        expirationDate: employeeTrainingsTable.expirationDate,
        status: employeeTrainingsTable.status,
        attachments: employeeTrainingsTable.attachments,
        legacyV1Id: employeeTrainingsTable.legacyV1Id,
        catalogItemId: employeeTrainingsTable.catalogItemId,
        dueDate: employeeTrainingsTable.dueDate,
        requirementId: employeeTrainingsTable.requirementId,
        effectivenessDueDate: employeeTrainingsTable.effectivenessDueDate,
        effectivenessAssignedRole:
          employeeTrainingsTable.effectivenessAssignedRole,
        createdAt: employeeTrainingsTable.createdAt,
        updatedAt: employeeTrainingsTable.updatedAt,
        employeeName: employeesTable.name,
        employeePosition: employeesTable.position,
        employeeDepartment: employeesTable.department,
        unitId: employeesTable.unitId,
        unitName: unitsTable.name,
      })
      .from(employeeTrainingsTable)
      .innerJoin(
        employeesTable,
        eq(employeeTrainingsTable.employeeId, employeesTable.id),
      )
      .leftJoin(unitsTable, eq(employeesTable.unitId, unitsTable.id))
      .where(and(...dataConditions))
      .orderBy(
        sql`${employeesTable.name} asc`,
        sql`${employeeTrainingsTable.createdAt} desc`,
        sql`${employeeTrainingsTable.id} asc`,
      )
      .limit(pageSize)
      .offset(offset);

    // ── COUNT para pagination.total (mesmas condições + boardColumn) ──────────
    const [countRow] = await db
      .select({ paginationTotal: count() })
      .from(employeeTrainingsTable)
      .innerJoin(
        employeesTable,
        eq(employeeTrainingsTable.employeeId, employeesTable.id),
      )
      .where(and(...dataConditions));
    const paginationTotal = countRow?.paginationTotal ?? 0;

    // ── Stats por query agregada (conjunto filtrado, SEM boardColumn) ─────────
    // Subqueries correlacionadas para a última review por treinamento
    const latestIsEffective = sql`(
      select r.is_effective
      from training_effectiveness_reviews r
      where r.training_id = ${employeeTrainingsTable.id}
      order by r.evaluation_date desc, r.created_at desc
      limit 1
    )`;
    const latestEvalDate = sql`(
      select r.evaluation_date
      from training_effectiveness_reviews r
      where r.training_id = ${employeeTrainingsTable.id}
      order by r.evaluation_date desc, r.created_at desc
      limit 1
    )`;

    const [statsRow] = await db
      .select({
        total: sql<number>`count(*)::int`,
        // Board column counts
        boardPendentesCount: sql<number>`count(*) filter (where ${boardPendentes})::int`,
        boardEmAvaliacaoCount: sql<number>`count(*) filter (where ${boardEmAvaliacao})::int`,
        boardConcluidasCount: sql<number>`count(*) filter (where ${boardConcluidas})::int`,
        // Legacy training-status stats (replicating deriveTrainingStatus logic)
        pendenteCount: sql<number>`count(*) filter (where ${employeeTrainingsTable.status} = 'pendente')::int`,
        concluidoCount: sql<number>`count(*) filter (where ${employeeTrainingsTable.status} = 'concluido' and (${employeeTrainingsTable.expirationDate} is null or ${employeeTrainingsTable.expirationDate} >= current_date))::int`,
        vencidoCount: sql<number>`count(*) filter (where ${employeeTrainingsTable.status} = 'vencido' or (${employeeTrainingsTable.expirationDate} is not null and ${employeeTrainingsTable.expirationDate} < current_date))::int`,
        // effectivenessPending: boardPendentes (sem review/atribuição) + critério
        // de eficácia presente (fragmento único, alinhado ao JS — #115)
        effectivenessPendingCount: sql<number>`count(*) filter (where ${boardPendentes} and ${boardHasPendingCriteria})::int`,
        // eficazes / naoEficazes: última review por treinamento
        eficazesCount: sql<number>`count(*) filter (where ${latestIsEffective} = true)::int`,
        naoEficazesCount: sql<number>`count(*) filter (where ${latestIsEffective} = false)::int`,
        // onTime: concluídas com dueDate onde latestEvalDate <= dueDate
        onTimeCount: sql<number>`count(*) filter (where
          ${boardConcluidas}
          and ${employeeTrainingsTable.effectivenessDueDate} is not null
          and ${latestEvalDate} <= ${employeeTrainingsTable.effectivenessDueDate}
        )::int`,
        withDueDateCount: sql<number>`count(*) filter (where ${boardConcluidas} and ${employeeTrainingsTable.effectivenessDueDate} is not null)::int`,
      })
      .from(employeeTrainingsTable)
      .innerJoin(
        employeesTable,
        eq(employeeTrainingsTable.employeeId, employeesTable.id),
      )
      .where(and(...conditions)); // SEM boardColumn — stats cobrem o conjunto inteiro

    // Compute derived stats
    const eficazes = statsRow?.eficazesCount ?? 0;
    const naoEficazes = statsRow?.naoEficazesCount ?? 0;
    const eficazDenom = eficazes + naoEficazes;
    const eficazPercent =
      eficazDenom > 0 ? Math.round((eficazes / eficazDenom) * 100) : null;

    const withDueDateCount = statsRow?.withDueDateCount ?? 0;
    const onTimePercent =
      withDueDateCount > 0
        ? Math.round(((statsRow?.onTimeCount ?? 0) / withDueDateCount) * 100)
        : null;

    const stats = {
      // Campos legados (mantidos para compatibilidade com callers existentes)
      total: statsRow?.total ?? 0,
      pendente: statsRow?.pendenteCount ?? 0,
      concluido: statsRow?.concluidoCount ?? 0,
      vencido: statsRow?.vencidoCount ?? 0,
      effectivenessPending: statsRow?.effectivenessPendingCount ?? 0,
      onTimePercent,
      // Novos campos de board (T2)
      boardCounts: {
        pendentes: statsRow?.boardPendentesCount ?? 0,
        emAvaliacao: statsRow?.boardEmAvaliacaoCount ?? 0,
        concluidas: statsRow?.boardConcluidasCount ?? 0,
      },
      eficazes,
      naoEficazes,
      eficazPercent,
    };

    // ── Reviews — apenas para os IDs da página ────────────────────────────────
    const reviewsByTrainingId = await loadTrainingReviewRows(
      rows.map((row) => row.id),
    );

    // ── Formatar linha (efectivenessStatus e expiringWithinDays já estão no SQL) ─
    const pageData = rows.map((row) => {
      const reviews = reviewsByTrainingId.get(row.id) || [];
      const derivedStatus = deriveTrainingStatus(
        row.status,
        row.expirationDate,
      );
      const effectivenessStatus = getEffectivenessStatus(reviews, row);

      return {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        employeePosition: row.employeePosition,
        employeeDepartment: row.employeeDepartment,
        unitId: row.unitId,
        unitName: row.unitName,
        title: row.title,
        description: row.description,
        objective: row.objective,
        institution: row.institution,
        instructor: row.instructor,
        targetCompetencyName: row.targetCompetencyName,
        targetCompetencyType: row.targetCompetencyType,
        targetCompetencyLevel: row.targetCompetencyLevel,
        evaluationMethod: row.evaluationMethod,
        renewalMonths: row.renewalMonths,
        workloadHours: row.workloadHours,
        completionDate: row.completionDate,
        expirationDate: row.expirationDate,
        status: derivedStatus,
        effectivenessStatus,
        effectivenessDueDate: row.effectivenessDueDate || null,
        effectivenessAssignedRole:
          (row.effectivenessAssignedRole as
            | "gestor"
            | "rh"
            | "instrutor"
            | "colaborador"
            | null) || null,
        reviewerCount: new Set(reviews.map((r) => r.evaluatorUserId)).size,
        effectivenessScorePercent:
          reviews[0] != null && reviews[0].score != null
            ? reviews[0].score * 10
            : null,
        attachments: formatEmployeeRecordAttachments(row.attachments),
        latestEffectivenessReview: reviews[0]
          ? formatTrainingEffectivenessReview(reviews[0])
          : null,
        createdAt: toIsoDateTime(row.createdAt),
        updatedAt: toIsoDateTime(row.updatedAt),
      };
    });

    res.json({
      data: pageData,
      pagination: {
        page,
        pageSize,
        total: paginationTotal,
        totalPages: Math.ceil(paginationTotal / pageSize),
      },
      stats,
    });
  },
);

router.get(
  "/organizations/:orgId/employees/competency-gaps",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListEmployeeCompetencyGapsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const query = ListEmployeeCompetencyGapsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const page = query.data.page || 1;
    const pageSize = query.data.pageSize || 25;

    const conditions = [eq(employeesTable.organizationId, params.data.orgId)];
    const normalizedSearch = query.data.search?.trim();
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      conditions.push(
        or(
          ilike(employeesTable.name, pattern),
          ilike(employeesTable.position, pattern),
          ilike(employeesTable.department, pattern),
        )!,
      );
    }
    if (query.data.department) {
      conditions.push(eq(employeesTable.department, query.data.department));
    }
    if (query.data.position) {
      conditions.push(eq(employeesTable.position, query.data.position));
    }
    if (query.data.unitId) {
      const targetUnitId = query.data.unitId;
      conditions.push(
        or(
          eq(employeesTable.unitId, targetUnitId),
          exists(
            db
              .select({ id: employeeUnitsTable.id })
              .from(employeeUnitsTable)
              .where(
                and(
                  eq(employeeUnitsTable.employeeId, employeesTable.id),
                  eq(employeeUnitsTable.unitId, targetUnitId),
                ),
              ),
          ),
        )!,
      );
    }

    const employees = await db
      .select({
        id: employeesTable.id,
        name: employeesTable.name,
        position: employeesTable.position,
        department: employeesTable.department,
        unitId: employeesTable.unitId,
        unitName: unitsTable.name,
      })
      .from(employeesTable)
      .leftJoin(unitsTable, eq(employeesTable.unitId, unitsTable.id))
      .where(and(...conditions))
      .orderBy(employeesTable.name);

    if (employees.length === 0) {
      res.json({
        data: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
      });
      return;
    }

    const employeeIds = employees.map((employee) => employee.id);
    const positionNames = [
      ...new Set(
        employees
          .map((employee) => employee.position)
          .filter((value): value is string => !!value),
      ),
    ];
    // Só para enriquecer a resposta com `positionId` — a regra de gap em si
    // vem inteira do resolvedor logo abaixo (nunca reimplementada aqui).
    const positions =
      positionNames.length === 0
        ? []
        : await db
            .select()
            .from(positionsTable)
            .where(
              and(
                eq(positionsTable.organizationId, params.data.orgId),
                inArray(positionsTable.name, positionNames),
              ),
            );
    const positionByName = new Map(
      positions.map((position) => [position.name, position]),
    );

    const trainingRows = await db
      .select({
        employeeId: employeeTrainingsTable.employeeId,
        targetCompetencyName: employeeTrainingsTable.targetCompetencyName,
        targetCompetencyType: employeeTrainingsTable.targetCompetencyType,
      })
      .from(employeeTrainingsTable)
      .where(inArray(employeeTrainingsTable.employeeId, employeeIds));
    const relatedTrainingCount = new Map<string, number>();
    for (const training of trainingRows) {
      if (!training.targetCompetencyName) continue;
      const key = `${training.employeeId}::${buildCompetencyKey(training.targetCompetencyName, training.targetCompetencyType)}`;
      relatedTrainingCount.set(key, (relatedTrainingCount.get(key) || 0) + 1);
    }

    const conformanceByEmployee = await resolveEmployeeCompetencies(
      db,
      params.data.orgId,
      employees.map((employee) => ({
        id: employee.id,
        position: employee.position,
      })),
    );

    const gaps = employees
      .flatMap((employee) => {
        const position = employee.position
          ? positionByName.get(employee.position)
          : null;
        const conformance = conformanceByEmployee.get(employee.id);
        if (!conformance) return [];

        // Só requisitos com status "gap" viram lacuna acionável aqui.
        // "nao_classificado" (sem manual e sem catálogo classificado que prove)
        // não é lacuna — é ausência de dado, e não deve aparecer nesta lista.
        return conformance.requirements
          .filter((requirement) => requirement.status === "gap")
          .map((requirement) => {
            const key = buildCompetencyKey(
              requirement.competencyName,
              requirement.competencyType,
            );
            return {
              employeeId: employee.id,
              employeeName: employee.name,
              employeePosition: employee.position,
              employeeDepartment: employee.department,
              unitId: employee.unitId,
              unitName: employee.unitName,
              positionId: position?.id ?? null,
              competencyName: requirement.competencyName,
              competencyType: requirement.competencyType,
              requiredLevel: requirement.requiredLevel,
              acquiredLevel: requirement.acquiredLevel,
              gapLevel: requirement.gapLevel,
              critical: requirement.critical,
              relatedTrainingCount:
                relatedTrainingCount.get(`${employee.id}::${key}`) || 0,
            };
          });
      })
      .filter((item) => !query.data.criticalOnly || item.critical);

    const total = gaps.length;
    const offset = (page - 1) * pageSize;

    res.json({
      data: gaps.slice(offset, offset + pageSize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  },
);

router.get(
  "/organizations/:orgId/employees/positions/:posId/competency-requirements",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListPositionCompetencyRequirementsParams.safeParse(
      req.params,
    );
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const position = await getPositionRecord(
      params.data.posId,
      params.data.orgId,
    );
    if (!position) {
      res.status(404).json({ error: "Cargo não encontrado" });
      return;
    }

    const rows = await loadPositionCompetencyRequirements(position.id);
    res.json(rows.map(formatPositionCompetencyRequirement));
  },
);

router.post(
  "/organizations/:orgId/employees/positions/:posId/competency-requirements",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreatePositionCompetencyRequirementParams.safeParse(
      req.params,
    );
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const position = await getPositionRecord(
      params.data.posId,
      params.data.orgId,
    );
    if (!position) {
      res.status(404).json({ error: "Cargo não encontrado" });
      return;
    }

    const body = CreatePositionCompetencyRequirementBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    try {
      const requirement = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(positionCompetencyRequirementsTable)
          .values({
            positionId: position.id,
            competencyName: body.data.competencyName.trim(),
            competencyType: body.data.competencyType,
            requiredLevel: body.data.requiredLevel,
            notes: body.data.notes?.trim() || null,
            sortOrder: body.data.sortOrder ?? 0,
            createdById: req.auth!.userId,
            updatedById: req.auth!.userId,
          })
          .returning();

        await createPositionCompetencyMatrixRevision(
          tx,
          position.id,
          req.auth!.userId,
        );
        return created;
      });

      res.status(201).json(formatPositionCompetencyRequirement(requirement));
    } catch (error) {
      res.status(400).json({
        error: "Já existe um requisito para esta competência neste cargo",
      });
    }
  },
);

router.patch(
  "/organizations/:orgId/employees/positions/:posId/competency-requirements/:requirementId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdatePositionCompetencyRequirementParams.safeParse(
      req.params,
    );
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const position = await getPositionRecord(
      params.data.posId,
      params.data.orgId,
    );
    if (!position) {
      res.status(404).json({ error: "Cargo não encontrado" });
      return;
    }

    const body = UpdatePositionCompetencyRequirementBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    try {
      const requirement = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(positionCompetencyRequirementsTable)
          .set({
            ...(body.data.competencyName !== undefined
              ? { competencyName: body.data.competencyName.trim() }
              : {}),
            ...(body.data.competencyType !== undefined
              ? { competencyType: body.data.competencyType }
              : {}),
            ...(body.data.requiredLevel !== undefined
              ? { requiredLevel: body.data.requiredLevel }
              : {}),
            ...(body.data.notes !== undefined
              ? { notes: body.data.notes?.trim() || null }
              : {}),
            ...(body.data.sortOrder !== undefined
              ? { sortOrder: body.data.sortOrder }
              : {}),
            updatedById: req.auth!.userId,
          })
          .where(
            and(
              eq(
                positionCompetencyRequirementsTable.id,
                params.data.requirementId,
              ),
              eq(positionCompetencyRequirementsTable.positionId, position.id),
            ),
          )
          .returning();

        if (!updated) return null;
        await createPositionCompetencyMatrixRevision(
          tx,
          position.id,
          req.auth!.userId,
        );
        return updated;
      });

      if (!requirement) {
        res
          .status(404)
          .json({ error: "Requisito de competência não encontrado" });
        return;
      }
      res.json(formatPositionCompetencyRequirement(requirement));
    } catch (error) {
      res.status(400).json({
        error: "Já existe um requisito para esta competência neste cargo",
      });
    }
  },
);

router.delete(
  "/organizations/:orgId/employees/positions/:posId/competency-requirements/:requirementId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeletePositionCompetencyRequirementParams.safeParse(
      req.params,
    );
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const position = await getPositionRecord(
      params.data.posId,
      params.data.orgId,
    );
    if (!position) {
      res.status(404).json({ error: "Cargo não encontrado" });
      return;
    }

    const deleted = await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(positionCompetencyRequirementsTable)
        .where(
          and(
            eq(
              positionCompetencyRequirementsTable.id,
              params.data.requirementId,
            ),
            eq(positionCompetencyRequirementsTable.positionId, position.id),
          ),
        )
        .returning();

      if (!removed) return null;
      await createPositionCompetencyMatrixRevision(
        tx,
        position.id,
        req.auth!.userId,
      );
      return removed;
    });

    if (!deleted) {
      res
        .status(404)
        .json({ error: "Requisito de competência não encontrado" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/organizations/:orgId/employees/positions/:posId/competency-matrix-revisions",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListPositionCompetencyMatrixRevisionsParams.safeParse(
      req.params,
    );
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const position = await getPositionRecord(
      params.data.posId,
      params.data.orgId,
    );
    if (!position) {
      res.status(404).json({ error: "Cargo não encontrado" });
      return;
    }

    const revisions = await db
      .select({
        id: positionCompetencyMatrixRevisionsTable.id,
        positionId: positionCompetencyMatrixRevisionsTable.positionId,
        revisionNumber: positionCompetencyMatrixRevisionsTable.revisionNumber,
        createdById: positionCompetencyMatrixRevisionsTable.createdById,
        createdByName: usersTable.name,
        createdAt: positionCompetencyMatrixRevisionsTable.createdAt,
        snapshot: positionCompetencyMatrixRevisionsTable.snapshot,
      })
      .from(positionCompetencyMatrixRevisionsTable)
      .leftJoin(
        usersTable,
        eq(positionCompetencyMatrixRevisionsTable.createdById, usersTable.id),
      )
      .where(eq(positionCompetencyMatrixRevisionsTable.positionId, position.id))
      .orderBy(
        sql`${positionCompetencyMatrixRevisionsTable.revisionNumber} desc`,
      );

    res.json(
      revisions.map((revision) => ({
        ...revision,
        createdByName: revision.createdByName || null,
        createdAt: toIsoDateTime(revision.createdAt),
        snapshot: revision.snapshot.map((item) => ({
          ...item,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      })),
    );
  },
);

router.get(
  "/organizations/:orgId/employees/:empId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const rows = await db
      .select({
        id: employeesTable.id,
        organizationId: employeesTable.organizationId,
        unitId: employeesTable.unitId,
        name: employeesTable.name,
        cpf: employeesTable.cpf,
        email: employeesTable.email,
        phone: employeesTable.phone,
        position: employeesTable.position,
        department: employeesTable.department,
        birthDate: employeesTable.birthDate,
        gender: employeesTable.gender,
        education: employeesTable.education,
        contractType: employeesTable.contractType,
        admissionDate: employeesTable.admissionDate,
        terminationDate: employeesTable.terminationDate,
        status: employeesTable.status,
        createdAt: employeesTable.createdAt,
        updatedAt: employeesTable.updatedAt,
        unitName: unitsTable.name,
      })
      .from(employeesTable)
      .leftJoin(unitsTable, eq(employeesTable.unitId, unitsTable.id))
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      );

    if (rows.length === 0) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const competencies = await db
      .select()
      .from(employeeCompetenciesTable)
      .where(eq(employeeCompetenciesTable.employeeId, params.data.empId))
      .orderBy(employeeCompetenciesTable.name);
    const trainings = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.employeeId, params.data.empId))
      .orderBy(employeeTrainingsTable.createdAt);
    const trainingReviews = await loadTrainingReviewRows(
      trainings.map((training) => training.id),
    );
    const awareness = await db
      .select()
      .from(employeeAwarenessTable)
      .where(eq(employeeAwarenessTable.employeeId, params.data.empId))
      .orderBy(employeeAwarenessTable.date);
    const awarenessReferenceMaps = await loadAwarenessReferenceMaps(
      params.data.orgId,
      awareness,
    );
    const profileItems = await loadEmployeeProfileItems(params.data.empId);
    const linkedUnits = await db
      .select({ id: unitsTable.id, name: unitsTable.name })
      .from(employeeUnitsTable)
      .innerJoin(unitsTable, eq(employeeUnitsTable.unitId, unitsTable.id))
      .where(eq(employeeUnitsTable.employeeId, params.data.empId));

    // Task 4 — a ficha lê o MESMO motor de conformidade da listagem/KPIs
    // (resolveEmployeeCompetencies), em vez do matching de texto livre que o
    // front usava (position-requirements.ts, aposentado nesta task).
    // `positionName: null` no resultado do resolvedor significa "o texto de
    // `employee.position` não bateu com nenhum cargo cadastrado" — nesse caso
    // devolvemos `null` em vez de um objeto com requirements vazio.
    const conformanceByEmployee = await resolveEmployeeCompetencies(
      db,
      params.data.orgId,
      [{ id: rows[0].id, position: rows[0].position }],
    );
    const resolvedConformance = conformanceByEmployee.get(rows[0].id) ?? null;
    const competencyConformance =
      resolvedConformance && resolvedConformance.positionName !== null
        ? {
            positionName: resolvedConformance.positionName,
            requirements: resolvedConformance.requirements,
            gapStatus: resolvedConformance.gapStatus,
          }
        : null;

    res.json({
      ...formatEmployee(rows[0]),
      units: linkedUnits,
      competencies: competencies.map(formatCompetencyRecord),
      trainings: trainings.map((training) =>
        formatTrainingRecord(training, {
          reviews: trainingReviews.get(training.id) || [],
        }),
      ),
      awareness: awareness.map((record) =>
        formatAwarenessRecord(record, awarenessReferenceMaps),
      ),
      professionalExperiences: profileItems.professionalExperiences,
      educationCertifications: profileItems.educationCertifications,
      competencyConformance,
    });
  },
);

router.patch(
  "/organizations/:orgId/employees/:empId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = UpdateEmployeeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const payload = sanitizeEmployeePayload(body.data) as typeof body.data;
    const invalidRequiredFields = getInvalidRequiredEmployeeFields(payload, {
      requireAllFields: false,
    });
    if (invalidRequiredFields.length > 0) {
      res.status(400).json({
        error: `${invalidRequiredFields.join(", ")} ${invalidRequiredFields.length > 1 ? "são obrigatórios" : "é obrigatório"}`,
      });
      return;
    }

    if (payload.unitId) {
      const [unit] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(
          and(
            eq(unitsTable.id, payload.unitId),
            eq(unitsTable.organizationId, params.data.orgId),
          ),
        );
      if (!unit) {
        res
          .status(400)
          .json({ error: "Unidade não pertence a esta organização" });
        return;
      }
    }

    const referenceValueError = await validateEmployeeReferenceValues(
      params.data.orgId,
      payload,
    );
    if (referenceValueError) {
      res.status(400).json({ error: referenceValueError });
      return;
    }

    const [before] = await db
      .select({
        position: employeesTable.position,
        unitId: employeesTable.unitId,
      })
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      );

    const [emp] = await db
      .update(employeesTable)
      .set(payload)
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      )
      .returning();

    if (!emp) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    // Mudança de cargo OU de filial → recomputa obrigatoriedades (adiciona/aproveita; nunca remove).
    const positionChanged =
      payload.position !== undefined &&
      before &&
      payload.position !== before.position;
    const unitChanged =
      payload.unitId !== undefined &&
      before &&
      payload.unitId !== before.unitId;
    let autoLinked = { generated: 0, reused: 0 };
    if (positionChanged || unitChanged) {
      autoLinked = await applyTrainingRequirements({
        orgId: params.data.orgId,
        employeeId: params.data.empId,
        database: db,
      });
    }
    // Fase 6: registra o histórico da mudança de cargo (troca de filial não
    // entra neste histórico). Guarda quantos treinamentos o recálculo gerou/
    // aproveitou, para exibição no Cronograma.
    if (positionChanged) {
      // Auditoria secundária: uma falha aqui não pode derrubar a troca de cargo
      // (já aplicada) nem o recálculo. Best-effort com log.
      try {
        await db.insert(employeePositionChangesTable).values({
          organizationId: params.data.orgId,
          employeeId: params.data.empId,
          previousPosition: before?.position ?? null,
          newPosition: payload.position ?? null,
          changedByUserId: req.auth!.userId,
          trainingsGenerated: autoLinked.generated,
          trainingsReused: autoLinked.reused,
        });
      } catch (err) {
        console.error("Falha ao registrar histórico de mudança de cargo:", err);
      }
    }
    res.json({ ...formatEmployee(emp), autoLinkedTrainings: autoLinked });
  },
);

router.delete(
  "/organizations/:orgId/employees/:empId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [emp] = await db
      .update(employeesTable)
      .set({
        status: "inactive",
        terminationDate: new Date().toISOString().split("T")[0],
      })
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      )
      .returning();

    if (!emp) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/organizations/:orgId/employees/:empId/competencies",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListCompetenciesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      );
    if (!emp) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const rows = await db
      .select()
      .from(employeeCompetenciesTable)
      .where(eq(employeeCompetenciesTable.employeeId, params.data.empId))
      .orderBy(employeeCompetenciesTable.name);
    res.json(rows.map(formatCompetencyRecord));
  },
);

router.post(
  "/organizations/:orgId/employees/:empId/competencies",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateCompetencyParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      );
    if (!emp) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const body = CreateCompetencyBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const attachments = sanitizeEmployeeRecordAttachments(
      body.data.attachments,
    );
    const attachmentValidationError =
      await validateEmployeeRecordAttachments(attachments);
    if (attachmentValidationError) {
      res.status(400).json({ error: attachmentValidationError });
      return;
    }

    const [comp] = await db
      .insert(employeeCompetenciesTable)
      .values({
        ...body.data,
        attachments: attachments || [],
        employeeId: params.data.empId,
      })
      .returning();

    res.status(201).json(formatCompetencyRecord(comp));
  },
);

router.patch(
  "/organizations/:orgId/employees/:empId/competencies/:compId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateCompetencyParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const body = UpdateCompetencyBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const attachments =
      body.data.attachments === undefined
        ? undefined
        : sanitizeEmployeeRecordAttachments(body.data.attachments);
    const attachmentValidationError =
      await validateEmployeeRecordAttachments(attachments);
    if (attachmentValidationError) {
      res.status(400).json({ error: attachmentValidationError });
      return;
    }

    const [comp] = await db
      .update(employeeCompetenciesTable)
      .set({
        ...body.data,
        ...(attachments !== undefined ? { attachments } : {}),
      })
      .where(
        and(
          eq(employeeCompetenciesTable.id, params.data.compId),
          eq(employeeCompetenciesTable.employeeId, params.data.empId),
        ),
      )
      .returning();

    if (!comp) {
      res.status(404).json({ error: "Competência não encontrada" });
      return;
    }
    res.json(formatCompetencyRecord(comp));
  },
);

router.delete(
  "/organizations/:orgId/employees/:empId/competencies/:compId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteCompetencyParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const [comp] = await db
      .delete(employeeCompetenciesTable)
      .where(
        and(
          eq(employeeCompetenciesTable.id, params.data.compId),
          eq(employeeCompetenciesTable.employeeId, params.data.empId),
        ),
      )
      .returning();

    if (!comp) {
      res.status(404).json({ error: "Competência não encontrada" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/organizations/:orgId/employees/:empId/trainings",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListTrainingsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      );
    if (!emp) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const rows = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.employeeId, params.data.empId))
      .orderBy(employeeTrainingsTable.createdAt);
    const reviews = await loadTrainingReviewRows(rows.map((row) => row.id));
    res.json(
      rows.map((row) =>
        formatTrainingRecord(row, { reviews: reviews.get(row.id) || [] }),
      ),
    );
  },
);

router.post(
  "/organizations/:orgId/employees/:empId/trainings",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateTrainingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      );
    if (!emp) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const body = CreateTrainingBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const attachments = sanitizeEmployeeRecordAttachments(
      body.data.attachments,
    );
    const attachmentValidationError =
      await validateEmployeeRecordAttachments(attachments);
    if (attachmentValidationError) {
      res.status(400).json({ error: attachmentValidationError });
      return;
    }

    // Snapshot do catálogo: se veio catalogItemId, copia os campos template do
    // item (ausentes no body) e calcula a validade. O body tem precedência.
    const {
      catalogItemId,
      attachments: _bodyAttachments,
      ...bodyFields
    } = body.data;
    const values: Partial<typeof employeeTrainingsTable.$inferInsert> = {};
    let resolvedCatalogItemId: number | null = null;

    if (catalogItemId != null) {
      const [item] = await db
        .select()
        .from(trainingCatalogTable)
        .where(
          and(
            eq(trainingCatalogTable.id, catalogItemId),
            eq(trainingCatalogTable.organizationId, params.data.orgId),
          ),
        );
      if (!item) {
        res.status(400).json({ error: "Item do catálogo não encontrado" });
        return;
      }
      resolvedCatalogItemId = item.id;
      const defaults: Partial<typeof employeeTrainingsTable.$inferInsert> = {
        title: item.title,
        description: item.programContent ?? undefined,
        objective: item.objective ?? undefined,
        instructor: item.defaultInstructor ?? undefined,
        targetCompetencyName: item.targetCompetencyName ?? undefined,
        targetCompetencyType: item.targetCompetencyType ?? undefined,
        targetCompetencyLevel: item.targetCompetencyLevel ?? undefined,
        evaluationMethod: item.evaluationMethod ?? undefined,
        workloadHours: item.workloadHours ?? undefined,
        renewalMonths: item.validityMonths ?? undefined,
      };
      for (const [k, v] of Object.entries(defaults)) {
        if (v !== undefined) (values as Record<string, unknown>)[k] = v;
      }
    }

    // Campos do body sobrescrevem os defaults do catálogo (só os definidos).
    for (const [k, v] of Object.entries(bodyFields)) {
      if (v !== undefined) (values as Record<string, unknown>)[k] = v;
    }

    // Validade: se houver conclusão + renovação e nenhuma data de vencimento
    // explícita, calcula expirationDate = completionDate + renewalMonths.
    if (
      !values.expirationDate &&
      values.completionDate &&
      values.renewalMonths
    ) {
      const expDate = addMonthsClamped(
        values.completionDate,
        values.renewalMonths,
      );
      if (expDate) values.expirationDate = expDate;
    }

    const finalTitle = values.title?.trim();
    if (!finalTitle) {
      res.status(400).json({
        error:
          "Informe o título do treinamento ou selecione um item do catálogo",
      });
      return;
    }

    const [training] = await db
      .insert(employeeTrainingsTable)
      .values({
        ...values,
        title: finalTitle,
        attachments: attachments || [],
        employeeId: params.data.empId,
        catalogItemId: resolvedCatalogItemId,
      })
      .returning();

    res.status(201).json(formatTrainingRecord(training, { reviews: [] }));
  },
);

router.patch(
  "/organizations/:orgId/employees/:empId/trainings/:trainId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateTrainingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const body = UpdateTrainingBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const attachments =
      body.data.attachments === undefined
        ? undefined
        : sanitizeEmployeeRecordAttachments(body.data.attachments);
    const attachmentValidationError =
      await validateEmployeeRecordAttachments(attachments);
    if (attachmentValidationError) {
      res.status(400).json({ error: attachmentValidationError });
      return;
    }

    const [training] = await db
      .update(employeeTrainingsTable)
      .set({
        ...body.data,
        ...(attachments !== undefined ? { attachments } : {}),
      })
      .where(
        and(
          eq(employeeTrainingsTable.id, params.data.trainId),
          eq(employeeTrainingsTable.employeeId, params.data.empId),
        ),
      )
      .returning();

    if (!training) {
      res.status(404).json({ error: "Treinamento não encontrado" });
      return;
    }
    const reviews = await loadTrainingReviewRows([training.id]);
    res.json(
      formatTrainingRecord(training, {
        reviews: reviews.get(training.id) || [],
      }),
    );
  },
);

router.delete(
  "/organizations/:orgId/employees/:empId/trainings/:trainId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteTrainingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const [training] = await db
      .delete(employeeTrainingsTable)
      .where(
        and(
          eq(employeeTrainingsTable.id, params.data.trainId),
          eq(employeeTrainingsTable.employeeId, params.data.empId),
        ),
      )
      .returning();

    if (!training) {
      res.status(404).json({ error: "Treinamento não encontrado" });
      return;
    }
    res.sendStatus(204);
  },
);

const EffectivenessAssignmentParams = z.object({
  orgId: z.coerce.number(),
  empId: z.coerce.number(),
  trainId: z.coerce.number(),
});

const EVALUATOR_ROLE_VALUES = [
  "gestor",
  "rh",
  "instrutor",
  "colaborador",
] as const;

const EffectivenessAssignmentBody = z.object({
  evaluatorRole: z.enum(EVALUATOR_ROLE_VALUES),
  dueDate: z.string().date(),
});

router.post(
  "/organizations/:orgId/employees/:empId/trainings/:trainId/effectiveness-assignment",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = EffectivenessAssignmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const [training] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(
        and(
          eq(employeeTrainingsTable.id, params.data.trainId),
          eq(employeeTrainingsTable.employeeId, params.data.empId),
        ),
      );
    if (!training) {
      res.status(404).json({ error: "Treinamento não encontrado" });
      return;
    }

    const body = EffectivenessAssignmentBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    await db
      .update(employeeTrainingsTable)
      .set({
        effectivenessAssignedRole: body.data.evaluatorRole,
        effectivenessDueDate: body.data.dueDate,
      })
      .where(eq(employeeTrainingsTable.id, training.id));

    // Re-load with employee + unit join to return full listagem shape
    const [updatedRow] = await db
      .select({
        id: employeeTrainingsTable.id,
        employeeId: employeeTrainingsTable.employeeId,
        title: employeeTrainingsTable.title,
        description: employeeTrainingsTable.description,
        objective: employeeTrainingsTable.objective,
        institution: employeeTrainingsTable.institution,
        instructor: employeeTrainingsTable.instructor,
        targetCompetencyName: employeeTrainingsTable.targetCompetencyName,
        targetCompetencyType: employeeTrainingsTable.targetCompetencyType,
        targetCompetencyLevel: employeeTrainingsTable.targetCompetencyLevel,
        evaluationMethod: employeeTrainingsTable.evaluationMethod,
        renewalMonths: employeeTrainingsTable.renewalMonths,
        workloadHours: employeeTrainingsTable.workloadHours,
        completionDate: employeeTrainingsTable.completionDate,
        expirationDate: employeeTrainingsTable.expirationDate,
        status: employeeTrainingsTable.status,
        attachments: employeeTrainingsTable.attachments,
        legacyV1Id: employeeTrainingsTable.legacyV1Id,
        catalogItemId: employeeTrainingsTable.catalogItemId,
        dueDate: employeeTrainingsTable.dueDate,
        requirementId: employeeTrainingsTable.requirementId,
        effectivenessDueDate: employeeTrainingsTable.effectivenessDueDate,
        effectivenessAssignedRole:
          employeeTrainingsTable.effectivenessAssignedRole,
        createdAt: employeeTrainingsTable.createdAt,
        updatedAt: employeeTrainingsTable.updatedAt,
        employeeName: employeesTable.name,
        employeePosition: employeesTable.position,
        employeeDepartment: employeesTable.department,
        unitId: employeesTable.unitId,
        unitName: unitsTable.name,
      })
      .from(employeeTrainingsTable)
      .innerJoin(
        employeesTable,
        eq(employeeTrainingsTable.employeeId, employeesTable.id),
      )
      .leftJoin(unitsTable, eq(employeesTable.unitId, unitsTable.id))
      .where(eq(employeeTrainingsTable.id, training.id));

    const reviews = await loadTrainingReviewRows([updatedRow.id]);
    const trainingReviews = reviews.get(updatedRow.id) || [];
    const derivedStatus = deriveTrainingStatus(
      updatedRow.status,
      updatedRow.expirationDate,
    );
    const effectivenessStatus = getEffectivenessStatus(
      trainingReviews,
      updatedRow,
    );

    res.json({
      id: updatedRow.id,
      employeeId: updatedRow.employeeId,
      employeeName: updatedRow.employeeName,
      employeePosition: updatedRow.employeePosition,
      employeeDepartment: updatedRow.employeeDepartment,
      unitId: updatedRow.unitId,
      unitName: updatedRow.unitName,
      title: updatedRow.title,
      description: updatedRow.description,
      objective: updatedRow.objective,
      institution: updatedRow.institution,
      instructor: updatedRow.instructor,
      targetCompetencyName: updatedRow.targetCompetencyName,
      targetCompetencyType: updatedRow.targetCompetencyType,
      targetCompetencyLevel: updatedRow.targetCompetencyLevel,
      evaluationMethod: updatedRow.evaluationMethod,
      renewalMonths: updatedRow.renewalMonths,
      workloadHours: updatedRow.workloadHours,
      completionDate: updatedRow.completionDate,
      expirationDate: updatedRow.expirationDate,
      status: derivedStatus,
      effectivenessStatus,
      effectivenessDueDate: updatedRow.effectivenessDueDate || null,
      effectivenessAssignedRole:
        (updatedRow.effectivenessAssignedRole as
          | "gestor"
          | "rh"
          | "instrutor"
          | "colaborador"
          | null) || null,
      reviewerCount: new Set(trainingReviews.map((r) => r.evaluatorUserId))
        .size,
      effectivenessScorePercent:
        trainingReviews[0] != null && trainingReviews[0].score != null
          ? trainingReviews[0].score * 10
          : null,
      attachments: formatEmployeeRecordAttachments(updatedRow.attachments),
      latestEffectivenessReview: trainingReviews[0]
        ? formatTrainingEffectivenessReview(trainingReviews[0])
        : null,
      createdAt: toIsoDateTime(updatedRow.createdAt),
      updatedAt: toIsoDateTime(updatedRow.updatedAt),
    });
  },
);

router.get(
  "/organizations/:orgId/employees/:empId/trainings/:trainId/effectiveness-reviews",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListTrainingEffectivenessReviewsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const [training] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(
        and(
          eq(employeeTrainingsTable.id, params.data.trainId),
          eq(employeeTrainingsTable.employeeId, params.data.empId),
        ),
      );
    if (!training) {
      res.status(404).json({ error: "Treinamento não encontrado" });
      return;
    }

    const reviews = await loadTrainingReviewRows([training.id]);
    res.json(
      (reviews.get(training.id) || []).map(formatTrainingEffectivenessReview),
    );
  },
);

router.post(
  "/organizations/:orgId/employees/:empId/trainings/:trainId/effectiveness-reviews",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateTrainingEffectivenessReviewParams.safeParse(
      req.params,
    );
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const [training] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(
        and(
          eq(employeeTrainingsTable.id, params.data.trainId),
          eq(employeeTrainingsTable.employeeId, params.data.empId),
        ),
      );
    if (!training) {
      res.status(404).json({ error: "Treinamento não encontrado" });
      return;
    }

    const body = CreateTrainingEffectivenessReviewBody.extend({
      evaluatorRole: z.enum(EVALUATOR_ROLE_VALUES).optional(),
    }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const attachments = sanitizeEmployeeRecordAttachments(
      body.data.attachments,
    );
    const attachmentValidationError =
      await validateEmployeeRecordAttachments(attachments);
    if (attachmentValidationError) {
      res.status(400).json({ error: attachmentValidationError });
      return;
    }

    // evaluatorRole: use body value if provided; otherwise inherit from training
    const evaluatorRole =
      body.data.evaluatorRole ??
      (training.effectivenessAssignedRole as
        | "gestor"
        | "rh"
        | "instrutor"
        | "colaborador"
        | null
        | undefined) ??
      null;

    const review = await db.transaction(async (tx) => {
      const [createdReview] = await tx
        .insert(trainingEffectivenessReviewsTable)
        .values({
          trainingId: training.id,
          evaluatorUserId: req.auth!.userId,
          evaluationDate: body.data.evaluationDate,
          score: body.data.score,
          isEffective: body.data.isEffective,
          resultLevel: body.data.resultLevel,
          comments: body.data.comments?.trim() || null,
          attachments: attachments || [],
          evaluatorRole: evaluatorRole ?? undefined,
        })
        .returning();

      if (body.data.isEffective) {
        // Um item do catálogo pode comprovar VÁRIAS competências
        // (training_catalog.target_competencies). Carrega a lista completa
        // do item (uma vez, fora de qualquer loop) quando o treino vem de
        // catálogo; as colunas singulares de employee_trainings só espelham
        // a 1ª competência da lista e não bastam para o atestado durável.
        let competenciesToGrant: {
          name: string;
          type: string;
          level: number | null;
        }[] = [];

        if (training.catalogItemId != null) {
          const [catalogItem] = await tx
            .select()
            .from(trainingCatalogTable)
            .where(
              and(
                eq(trainingCatalogTable.id, training.catalogItemId),
                eq(trainingCatalogTable.organizationId, params.data.orgId),
              ),
            );
          competenciesToGrant = (catalogItem?.targetCompetencies ?? [])
            .filter((comp) => !!comp?.name)
            .map((comp) => ({
              name: comp.name,
              type: comp.type || "habilidade",
              level: comp.level ?? null,
            }));
        }

        // Fallback para a competência singular do próprio treino: nem todo
        // treino vem de catálogo (avulsos), e um item de catálogo pode não
        // ter a lista populada (legado). Preserva o comportamento anterior.
        if (competenciesToGrant.length === 0 && training.targetCompetencyName) {
          competenciesToGrant = [
            {
              name: training.targetCompetencyName,
              type: training.targetCompetencyType || "habilidade",
              level: training.targetCompetencyLevel ?? null,
            },
          ];
        }

        if (competenciesToGrant.length > 0) {
          const existingCompetencies = await tx
            .select()
            .from(employeeCompetenciesTable)
            .where(eq(employeeCompetenciesTable.employeeId, params.data.empId));

          for (const comp of competenciesToGrant) {
            const targetLevel = body.data.resultLevel ?? comp.level ?? 1;
            const key = buildCompetencyKey(comp.name, comp.type);
            const existingCompetency = existingCompetencies.find(
              (competency) =>
                buildCompetencyKey(competency.name, competency.type) === key,
            );

            if (existingCompetency) {
              const nextLevel = Math.max(
                existingCompetency.acquiredLevel || 0,
                targetLevel,
              );
              await tx
                .update(employeeCompetenciesTable)
                .set({
                  acquiredLevel: nextLevel,
                  type: existingCompetency.type || comp.type,
                })
                .where(eq(employeeCompetenciesTable.id, existingCompetency.id));
              existingCompetency.acquiredLevel = nextLevel;
            } else {
              const [inserted] = await tx
                .insert(employeeCompetenciesTable)
                .values({
                  employeeId: params.data.empId,
                  name: comp.name,
                  type: comp.type,
                  requiredLevel: comp.level ?? targetLevel,
                  acquiredLevel: targetLevel,
                  description:
                    training.objective || training.description || null,
                  evidence: `Atualizada via eficácia do treinamento "${training.title}"`,
                  attachments: [],
                })
                .returning();
              existingCompetencies.push(inserted);
            }
          }
        }
      }

      return createdReview;
    });

    const reviews = await loadTrainingReviewRows([review.trainingId]);
    const createdReview = (reviews.get(review.trainingId) || []).find(
      (item) => item.id === review.id,
    ) || {
      ...review,
      evaluatorName: null,
    };
    res.status(201).json(formatTrainingEffectivenessReview(createdReview));
  },
);

router.get(
  "/organizations/:orgId/employees/:empId/awareness",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListAwarenessParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      );
    if (!emp) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const rows = await db
      .select()
      .from(employeeAwarenessTable)
      .where(eq(employeeAwarenessTable.employeeId, params.data.empId))
      .orderBy(employeeAwarenessTable.date);
    const referenceMaps = await loadAwarenessReferenceMaps(
      params.data.orgId,
      rows,
    );
    res.json(rows.map((row) => formatAwarenessRecord(row, referenceMaps)));
  },
);

router.post(
  "/organizations/:orgId/employees/:empId/awareness",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateAwarenessParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [emp] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, params.data.empId),
          eq(employeesTable.organizationId, params.data.orgId),
        ),
      );
    if (!emp) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const body = CreateAwarenessBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const attachments = sanitizeEmployeeRecordAttachments(
      body.data.attachments,
    );
    const attachmentValidationError =
      await validateEmployeeRecordAttachments(attachments);
    if (attachmentValidationError) {
      res.status(400).json({ error: attachmentValidationError });
      return;
    }

    const awarenessLinkError = await validateAwarenessLinks(params.data.orgId, {
      policyDocumentId: body.data.policyDocumentId,
      documentId: body.data.documentId,
      processId: body.data.processId,
      objectiveId: body.data.objectiveId,
    });
    if (awarenessLinkError) {
      res.status(400).json({ error: awarenessLinkError });
      return;
    }

    const [record] = await db
      .insert(employeeAwarenessTable)
      .values({
        ...body.data,
        attachments: attachments || [],
        employeeId: params.data.empId,
      })
      .returning();

    const referenceMaps = await loadAwarenessReferenceMaps(params.data.orgId, [
      record,
    ]);
    res.status(201).json(formatAwarenessRecord(record, referenceMaps));
  },
);

router.patch(
  "/organizations/:orgId/employees/:empId/awareness/:awaId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateAwarenessParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const body = UpdateAwarenessBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const attachments =
      body.data.attachments === undefined
        ? undefined
        : sanitizeEmployeeRecordAttachments(body.data.attachments);
    const attachmentValidationError =
      await validateEmployeeRecordAttachments(attachments);
    if (attachmentValidationError) {
      res.status(400).json({ error: attachmentValidationError });
      return;
    }

    const awarenessLinkError = await validateAwarenessLinks(params.data.orgId, {
      policyDocumentId: body.data.policyDocumentId,
      documentId: body.data.documentId,
      processId: body.data.processId,
      objectiveId: body.data.objectiveId,
    });
    if (awarenessLinkError) {
      res.status(400).json({ error: awarenessLinkError });
      return;
    }

    const [record] = await db
      .update(employeeAwarenessTable)
      .set({
        ...body.data,
        ...(attachments !== undefined ? { attachments } : {}),
      })
      .where(
        and(
          eq(employeeAwarenessTable.id, params.data.awaId),
          eq(employeeAwarenessTable.employeeId, params.data.empId),
        ),
      )
      .returning();

    if (!record) {
      res.status(404).json({ error: "Registro não encontrado" });
      return;
    }
    const referenceMaps = await loadAwarenessReferenceMaps(params.data.orgId, [
      record,
    ]);
    res.json(formatAwarenessRecord(record, referenceMaps));
  },
);

router.delete(
  "/organizations/:orgId/employees/:empId/awareness/:awaId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteAwarenessParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const [record] = await db
      .delete(employeeAwarenessTable)
      .where(
        and(
          eq(employeeAwarenessTable.id, params.data.awaId),
          eq(employeeAwarenessTable.employeeId, params.data.empId),
        ),
      )
      .returning();

    if (!record) {
      res.status(404).json({ error: "Registro não encontrado" });
      return;
    }
    res.sendStatus(204);
  },
);

router.post(
  "/organizations/:orgId/employees/:empId/profile-items",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateEmployeeProfileItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const body = CreateEmployeeProfileItemBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const item = sanitizeProfileItemInput(body.data);
    if (!item.title.trim()) {
      res.status(400).json({ error: "Item inválido: título é obrigatório" });
      return;
    }
    const attachmentValidationError = await validateProfileItemAttachments(
      item.attachments,
    );
    if (attachmentValidationError) {
      res.status(400).json({ error: attachmentValidationError });
      return;
    }

    const createdProfileItem = await db.transaction(async (tx) => {
      const [createdItem] = await tx
        .insert(employeeProfileItemsTable)
        .values({
          employeeId: params.data.empId,
          category: item.category,
          title: item.title,
          description: item.description || null,
        })
        .returning();

      const createdAttachments = item.attachments?.length
        ? await tx
            .insert(employeeProfileItemAttachmentsTable)
            .values(
              item.attachments.map((attachment) => ({
                itemId: createdItem.id,
                fileName: attachment.fileName,
                fileSize: attachment.fileSize,
                contentType: attachment.contentType,
                objectPath: attachment.objectPath,
              })),
            )
            .returning()
        : [];

      const attachmentsByItemId = new Map<number, ProfileItemAttachmentRow[]>();
      attachmentsByItemId.set(createdItem.id, createdAttachments);

      return formatProfileItem(createdItem, attachmentsByItemId);
    });

    res.status(201).json(createdProfileItem);
  },
);

router.patch(
  "/organizations/:orgId/employees/:empId/profile-items/:itemId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UpdateEmployeeProfileItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyProfileItemOwnership(
        params.data.itemId,
        params.data.empId,
        params.data.orgId,
      ))
    ) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }

    const body = UpdateEmployeeProfileItemBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (body.data.title !== undefined && body.data.title.trim().length === 0) {
      res.status(400).json({ error: "Item inválido: título é obrigatório" });
      return;
    }

    const [updatedItem] = await db
      .update(employeeProfileItemsTable)
      .set({
        ...(body.data.title !== undefined
          ? { title: body.data.title.trim() }
          : {}),
        ...(body.data.description !== undefined
          ? { description: body.data.description?.trim() || null }
          : {}),
      })
      .where(
        and(
          eq(employeeProfileItemsTable.id, params.data.itemId),
          eq(employeeProfileItemsTable.employeeId, params.data.empId),
        ),
      )
      .returning();

    if (!updatedItem) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }

    const attachmentRows = await loadProfileItemAttachmentRows(updatedItem.id);
    const attachmentsByItemId = new Map<number, ProfileItemAttachmentRow[]>();
    attachmentsByItemId.set(updatedItem.id, attachmentRows);

    res.json(formatProfileItem(updatedItem, attachmentsByItemId));
  },
);

router.delete(
  "/organizations/:orgId/employees/:empId/profile-items/:itemId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteEmployeeProfileItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyProfileItemOwnership(
        params.data.itemId,
        params.data.empId,
        params.data.orgId,
      ))
    ) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }

    const [deletedItem] = await db
      .delete(employeeProfileItemsTable)
      .where(
        and(
          eq(employeeProfileItemsTable.id, params.data.itemId),
          eq(employeeProfileItemsTable.employeeId, params.data.empId),
        ),
      )
      .returning();

    if (!deletedItem) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }
    res.sendStatus(204);
  },
);

router.post(
  "/organizations/:orgId/employees/:empId/profile-items/:itemId/attachments",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = AddEmployeeProfileItemAttachmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyProfileItemOwnership(
        params.data.itemId,
        params.data.empId,
        params.data.orgId,
      ))
    ) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }

    const body = AddEmployeeProfileItemAttachmentBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [existingAttachmentsCount] = await db
      .select({ total: count() })
      .from(employeeProfileItemAttachmentsTable)
      .where(
        eq(employeeProfileItemAttachmentsTable.itemId, params.data.itemId),
      );

    if (
      (existingAttachmentsCount?.total ?? 0) >= MAX_PROFILE_ITEM_ATTACHMENTS
    ) {
      res.status(400).json({
        error: `Cada item permite no máximo ${MAX_PROFILE_ITEM_ATTACHMENTS} anexos`,
      });
      return;
    }

    const attachmentValidationError = await validateProfileItemAttachment({
      fileName: body.data.fileName.trim(),
      fileSize: body.data.fileSize,
      contentType: body.data.contentType.trim(),
      objectPath: body.data.objectPath.trim(),
    });
    if (attachmentValidationError) {
      res.status(400).json({ error: attachmentValidationError });
      return;
    }

    const [attachment] = await db
      .insert(employeeProfileItemAttachmentsTable)
      .values({
        itemId: params.data.itemId,
        fileName: body.data.fileName.trim(),
        fileSize: body.data.fileSize,
        contentType: body.data.contentType.trim(),
        objectPath: body.data.objectPath.trim(),
      })
      .returning();

    res.status(201).json(formatProfileItemAttachment(attachment));
  },
);

router.delete(
  "/organizations/:orgId/employees/:empId/profile-items/:itemId/attachments/:attachmentId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = DeleteEmployeeProfileItemAttachmentParams.safeParse(
      req.params,
    );
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyProfileItemOwnership(
        params.data.itemId,
        params.data.empId,
        params.data.orgId,
      ))
    ) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }

    const [attachment] = await db
      .delete(employeeProfileItemAttachmentsTable)
      .where(
        and(
          eq(employeeProfileItemAttachmentsTable.id, params.data.attachmentId),
          eq(employeeProfileItemAttachmentsTable.itemId, params.data.itemId),
        ),
      )
      .returning();

    if (!attachment) {
      res.status(404).json({ error: "Anexo não encontrado" });
      return;
    }
    res.sendStatus(204);
  },
);

router.post(
  "/organizations/:orgId/employees/:empId/units",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = LinkEmployeeUnitParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const body = LinkEmployeeUnitBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [unit] = await db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(
        and(
          eq(unitsTable.id, body.data.unitId),
          eq(unitsTable.organizationId, params.data.orgId),
        ),
      );
    if (!unit) {
      res.status(400).json({ error: "Unidade não pertence à organização" });
      return;
    }

    const existing = await db
      .select({ id: employeeUnitsTable.id })
      .from(employeeUnitsTable)
      .where(
        and(
          eq(employeeUnitsTable.employeeId, params.data.empId),
          eq(employeeUnitsTable.unitId, body.data.unitId),
        ),
      );
    if (existing.length > 0) {
      res.status(409).json({ error: "Unidade já vinculada" });
      return;
    }

    const [link] = await db
      .insert(employeeUnitsTable)
      .values({ employeeId: params.data.empId, unitId: body.data.unitId })
      .returning();
    res.status(201).json(link);
  },
);

router.delete(
  "/organizations/:orgId/employees/:empId/units/:unitId",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = UnlinkEmployeeUnitParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    if (
      !(await verifyEmployeeOwnership(params.data.empId, params.data.orgId))
    ) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const [deleted] = await db
      .delete(employeeUnitsTable)
      .where(
        and(
          eq(employeeUnitsTable.employeeId, params.data.empId),
          eq(employeeUnitsTable.unitId, params.data.unitId),
        ),
      )
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Vínculo não encontrado" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
