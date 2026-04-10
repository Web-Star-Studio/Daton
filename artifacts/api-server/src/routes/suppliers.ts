import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  supplierCategoriesTable,
  supplierTypesTable,
  suppliersTable,
  supplierUnitsTable,
  supplierTypeLinksTable,
  supplierCatalogItemsTable,
  supplierOfferingsTable,
  supplierDocumentRequirementsTable,
  supplierDocumentSubmissionsTable,
  supplierDocumentReviewsTable,
  supplierQualificationReviewsTable,
  supplierPerformanceReviewsTable,
  supplierReceiptChecksTable,
  supplierFailuresTable,
  unitsTable,
  usersTable,
  type SupplierAttachment,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  buildSupplierDocumentRequirementImportPreview,
  buildSupplierImportPreview,
  readSupplierDocumentRequirementImportPreview,
  readSupplierImportPreview,
} from "../services/suppliers/imports";
import { syncSupplierCatalogAssociations } from "../services/suppliers/catalog-sync";

const router: IRouter = Router();
const DEFAULT_SUPPLIER_DOCUMENT_THRESHOLD = 80;

const orgParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
});

const supplierParamsSchema = orgParamsSchema.extend({
  supplierId: z.coerce.number().int().positive(),
});

const attachmentSchema = z.object({
  fileName: z.string().trim().min(1),
  fileSize: z.coerce.number().int().nonnegative(),
  contentType: z.string().trim().min(1),
  objectPath: z.string().trim().min(1),
});

const listSuppliersQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  typeId: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
});

const supplierCategoryBodySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const supplierTypeBodySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  documentThreshold: z.coerce.number().int().min(0).max(100).default(DEFAULT_SUPPLIER_DOCUMENT_THRESHOLD),
  status: z.enum(["active", "inactive"]).default("active"),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  parentTypeId: z.coerce.number().int().positive().nullable().optional(),
});

const supplierBodySchema = z.object({
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  personType: z.enum(["pj", "pf"]),
  legalIdentifier: z.string().trim().min(1),
  legalName: z.string().trim().min(1),
  tradeName: z.string().trim().optional().nullable(),
  responsibleName: z.string().trim().optional().nullable(),
  stateRegistration: z.string().trim().optional().nullable(),
  municipalRegistration: z.string().trim().optional().nullable(),
  rg: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  street: z.string().trim().optional().nullable(),
  streetNumber: z.string().trim().optional().nullable(),
  complement: z.string().trim().optional().nullable(),
  neighborhood: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  status: z.enum(["draft", "pending_qualification", "approved", "restricted", "blocked", "expired", "inactive"]).default("draft"),
  criticality: z.enum(["low", "medium", "high"]).default("medium"),
  notes: z.string().trim().optional().nullable(),
  unitIds: z.array(z.coerce.number().int().positive()).default([]),
  typeIds: z.array(z.coerce.number().int().positive()).default([]),
  catalogItemIds: z.array(z.coerce.number().int().positive()).optional(),
});

const supplierImportBodySchema = z.object({
  rows: z.array(
    z.object({
      rowNumber: z.coerce.number().int().positive().optional(),
      legalIdentifier: z.unknown().optional(),
      personType: z.unknown().optional(),
      legalName: z.unknown().optional(),
      tradeName: z.unknown().optional(),
      responsibleName: z.unknown().optional(),
      phone: z.unknown().optional(),
      email: z.unknown().optional(),
      postalCode: z.unknown().optional(),
      street: z.unknown().optional(),
      streetNumber: z.unknown().optional(),
      neighborhood: z.unknown().optional(),
      city: z.unknown().optional(),
      state: z.unknown().optional(),
      unitNames: z.unknown().optional(),
      categoryName: z.unknown().optional(),
      typeNames: z.unknown().optional(),
      notes: z.unknown().optional(),
    }),
  ).min(1),
});

const supplierImportCommitBodySchema = z.object({
  previewToken: z.string().trim().min(1),
});

const supplierCatalogItemBodySchema = z.object({
  name: z.string().trim().min(1),
  offeringType: z.enum(["product", "service"]),
  unitOfMeasure: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const supplierOfferingBodySchema = z
  .object({
    catalogItemId: z.coerce.number().int().positive().nullable().optional(),
    name: z.string().trim().optional(),
    offeringType: z.enum(["product", "service"]).optional(),
    unitOfMeasure: z.string().trim().optional().nullable(),
    description: z.string().trim().optional().nullable(),
    status: z.enum(["active", "inactive"]).optional(),
    isApprovedScope: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.catalogItemId) {
      return;
    }

    if (!value.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "Informe o nome do item.",
      });
    }

    if (!value.offeringType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["offeringType"],
        message: "Informe o tipo do item.",
      });
    }

    if (!value.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Informe o status do item.",
      });
    }
  });

const supplierDocumentRequirementBodySchema = z.object({
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  typeId: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  weight: z.coerce.number().int().min(1).max(5),
  status: z.enum(["active", "inactive"]).default("active"),
  attachments: z.array(attachmentSchema).default([]),
});

const supplierDocumentRequirementImportBodySchema = z.object({
  rows: z.array(
    z.object({
      rowNumber: z.coerce.number().int().positive().optional(),
      name: z.unknown().optional(),
      weight: z.unknown().optional(),
      description: z.unknown().optional(),
    }),
  ).min(1),
});

const supplierDocumentRequirementImportCommitBodySchema = z.object({
  previewToken: z.string().trim().min(1),
});

const supplierDocumentSubmissionBodySchema = z.object({
  requirementId: z.coerce.number().int().positive(),
  submissionStatus: z.enum(["approved", "rejected", "pending", "exempt"]),
  adequacyStatus: z.enum(["adequate", "not_adequate", "under_review"]).default("under_review"),
  workflowAction: z.enum(["approve_now", "request_review"]).default("approve_now"),
  requestedReviewerId: z.coerce.number().int().positive().nullable().optional(),
  reviewComment: z.string().trim().optional().nullable(),
  validityDate: z.string().date().optional().nullable(),
  exemptionReason: z.string().trim().optional().nullable(),
  rejectionReason: z.string().trim().optional().nullable(),
  observations: z.string().trim().optional().nullable(),
  attachments: z.array(attachmentSchema).default([]),
});

const supplierDocumentSubmissionReviewBodySchema = z.object({
  decision: z.enum(["approved", "rejected", "request_changes"]),
  validityDate: z.string().date().optional().nullable(),
  rejectionReason: z.string().trim().optional().nullable(),
  reviewComment: z.string().trim().optional().nullable(),
});

const supplierDocumentReviewBodySchema = z.object({
  nextReviewDate: z.string().date().optional().nullable(),
  observations: z.string().trim().optional().nullable(),
});

const supplierQualificationReviewBodySchema = z.object({
  decision: z.enum(["approved", "approved_with_conditions", "rejected"]),
  validUntil: z.string().date().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  attachments: z.array(attachmentSchema).default([]),
  approvedOfferingIds: z.array(z.coerce.number().int().positive()).default([]),
});

const supplierPerformanceReviewBodySchema = z.object({
  offeringId: z.coerce.number().int().positive().nullable().optional(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  qualityScore: z.coerce.number().int().min(0).max(10),
  deliveryScore: z.coerce.number().int().min(0).max(10),
  communicationScore: z.coerce.number().int().min(0).max(10),
  complianceScore: z.coerce.number().int().min(0).max(10),
  priceScore: z.coerce.number().int().min(0).max(10).optional().nullable(),
  conclusion: z.enum(["maintain", "restrict", "block"]),
  riskLevel: z.enum(["low", "medium", "high"]).default("medium"),
  observations: z.string().trim().optional().nullable(),
});

const supplierReceiptCheckBodySchema = z.object({
  offeringId: z.coerce.number().int().positive().nullable().optional(),
  unitId: z.coerce.number().int().positive().nullable().optional(),
  authorizedById: z.coerce.number().int().positive(),
  receiptDate: z.string().date(),
  description: z.string().trim().min(1),
  referenceNumber: z.string().trim().optional().nullable(),
  quantity: z.string().trim().optional().nullable(),
  totalValue: z.coerce.number().int().nonnegative().optional().nullable(),
  outcome: z.enum(["accepted", "accepted_with_remarks", "rejected"]),
  acceptanceCriteria: z.string().trim().min(1),
  notes: z.string().trim().optional().nullable(),
  nonConformityStatus: z.enum(["not_required", "pending_handoff", "handed_off"]).default("not_required"),
  nonConformitySummary: z.string().trim().optional().nullable(),
  attachments: z.array(attachmentSchema).default([]),
});

const supplierFailureBodySchema = z.object({
  performanceReviewId: z.coerce.number().int().positive().nullable().optional(),
  receiptCheckId: z.coerce.number().int().positive().nullable().optional(),
  failureType: z.enum(["delivery", "quality", "documentation", "compliance", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  description: z.string().trim().min(1),
  status: z.enum(["open", "resolved"]).default("open"),
});

function getParseError(result: { success: boolean; error?: { message: string } }): string {
  return result.success ? "Requisição inválida" : result.error?.message || "Requisição inválida";
}

function normalizeOptionalString(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function toDbFlag(value: boolean) {
  return value ? 1 : 0;
}

function formatLegalIdentifier(value: string, personType: "pj" | "pf") {
  const digits = normalizeDigits(value);
  if (personType === "pj" && digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (personType === "pf" && digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return value;
}

function formatPostalCode(value: string | null | undefined) {
  if (!value) return "";
  const digits = normalizeDigits(value);
  if (digits.length === 8) {
    return digits.replace(/^(\d{5})(\d{3})$/, "$1-$2");
  }
  return value;
}

function formatTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function formatAttachments(attachments: SupplierAttachment[] | null | undefined): SupplierAttachment[] {
  return Array.isArray(attachments) ? attachments : [];
}

function requireSupplierWrite(scope: "general" | "receipts" | "document_reviews") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.auth?.role;
    if (!role) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    if (role === "platform_admin" || role === "org_admin") {
      next();
      return;
    }

    if (role === "operator" && (scope === "receipts" || scope === "document_reviews")) {
      next();
      return;
    }

    res.status(403).json({ error: "Permissão insuficiente para esta operação" });
  };
}

async function ensureOrgAccess(orgId: number, req: Request, res: Response): Promise<boolean> {
  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return false;
  }

  return true;
}

async function ensureCategoryBelongsToOrg(categoryId: number | null | undefined, orgId: number): Promise<boolean> {
  if (!categoryId) return true;
  const [category] = await db
    .select({ id: supplierCategoriesTable.id })
    .from(supplierCategoriesTable)
    .where(and(eq(supplierCategoriesTable.id, categoryId), eq(supplierCategoriesTable.organizationId, orgId)));
  return Boolean(category);
}

async function ensureTypeBelongsToOrg(typeId: number | null | undefined, orgId: number): Promise<boolean> {
  if (!typeId) return true;
  const [type] = await db
    .select({ id: supplierTypesTable.id })
    .from(supplierTypesTable)
    .where(and(eq(supplierTypesTable.id, typeId), eq(supplierTypesTable.organizationId, orgId)));
  return Boolean(type);
}

async function ensureTypesBelongToOrg(typeIds: number[], orgId: number): Promise<boolean> {
  if (typeIds.length === 0) return true;
  const rows = await db
    .select({ id: supplierTypesTable.id })
    .from(supplierTypesTable)
    .where(and(eq(supplierTypesTable.organizationId, orgId), inArray(supplierTypesTable.id, typeIds)));
  return rows.length === typeIds.length;
}

async function ensureUnitsBelongToOrg(unitIds: number[], orgId: number): Promise<boolean> {
  if (unitIds.length === 0) return true;
  const rows = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(and(eq(unitsTable.organizationId, orgId), inArray(unitsTable.id, unitIds)));
  return rows.length === unitIds.length;
}

async function ensureCatalogItemsBelongToOrg(catalogItemIds: number[], orgId: number): Promise<boolean> {
  if (catalogItemIds.length === 0) return true;
  const rows = await db
    .select({ id: supplierCatalogItemsTable.id })
    .from(supplierCatalogItemsTable)
    .where(and(eq(supplierCatalogItemsTable.organizationId, orgId), inArray(supplierCatalogItemsTable.id, catalogItemIds)));
  return rows.length === catalogItemIds.length;
}

async function ensureUserBelongsToOrg(userId: number | null | undefined, orgId: number): Promise<boolean> {
  if (!userId) return true;
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, orgId)));
  return Boolean(user);
}

async function getSupplierOrNull(supplierId: number, orgId: number) {
  const [supplier] = await db
    .select()
    .from(suppliersTable)
    .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.organizationId, orgId)));
  return supplier ?? null;
}

async function ensureOfferingBelongsToSupplier(offeringId: number | null | undefined, supplierId: number): Promise<boolean> {
  if (!offeringId) return true;
  const [offering] = await db
    .select({ id: supplierOfferingsTable.id })
    .from(supplierOfferingsTable)
    .where(and(eq(supplierOfferingsTable.id, offeringId), eq(supplierOfferingsTable.supplierId, supplierId)));
  return Boolean(offering);
}

async function ensurePerformanceReviewBelongsToSupplier(reviewId: number | null | undefined, supplierId: number): Promise<boolean> {
  if (!reviewId) return true;
  const [review] = await db
    .select({ id: supplierPerformanceReviewsTable.id })
    .from(supplierPerformanceReviewsTable)
    .where(and(eq(supplierPerformanceReviewsTable.id, reviewId), eq(supplierPerformanceReviewsTable.supplierId, supplierId)));
  return Boolean(review);
}

async function ensureReceiptCheckBelongsToSupplier(receiptCheckId: number | null | undefined, supplierId: number): Promise<boolean> {
  if (!receiptCheckId) return true;
  const [receiptCheck] = await db
    .select({ id: supplierReceiptChecksTable.id })
    .from(supplierReceiptChecksTable)
    .where(and(eq(supplierReceiptChecksTable.id, receiptCheckId), eq(supplierReceiptChecksTable.supplierId, supplierId)));
  return Boolean(receiptCheck);
}

async function resolveSupplierDocumentThreshold(supplierId: number): Promise<number> {
  const rows = await db
    .select({ documentThreshold: supplierTypesTable.documentThreshold })
    .from(supplierTypeLinksTable)
    .innerJoin(supplierTypesTable, eq(supplierTypeLinksTable.typeId, supplierTypesTable.id))
    .where(eq(supplierTypeLinksTable.supplierId, supplierId));

  if (rows.length === 0) {
    return DEFAULT_SUPPLIER_DOCUMENT_THRESHOLD;
  }

  return rows.reduce((highest, row) => Math.max(highest, row.documentThreshold), 0);
}

async function preloadSupplierListData(
  suppliers: Array<{
    id: number;
    categoryId: number | null;
  }>,
) {
  if (suppliers.length === 0) {
    return {
      categoriesById: new Map<number, { id: number; name: string }>(),
      unitsBySupplierId: new Map<number, Array<{ id: number; name: string }>>(),
      typesBySupplierId: new Map<number, Array<{ id: number; name: string }>>(),
      latestQualificationBySupplierId: new Map<number, { decision: string; validUntil: string | null; createdAt: string | null }>(),
      latestPerformanceBySupplierId: new Map<number, { conclusion: string; riskLevel: string; finalScore: number; createdAt: string | null }>(),
    };
  }

  const supplierIds = suppliers.map((supplier) => supplier.id);
  const categoryIds = Array.from(new Set(suppliers.map((supplier) => supplier.categoryId).filter((value): value is number => Boolean(value))));

  const [categories, units, types, qualificationReviews, performanceReviews] = await Promise.all([
    categoryIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: supplierCategoriesTable.id, name: supplierCategoriesTable.name })
          .from(supplierCategoriesTable)
          .where(inArray(supplierCategoriesTable.id, categoryIds)),
    db
      .select({
        supplierId: supplierUnitsTable.supplierId,
        id: unitsTable.id,
        name: unitsTable.name,
      })
      .from(supplierUnitsTable)
      .innerJoin(unitsTable, eq(supplierUnitsTable.unitId, unitsTable.id))
      .where(inArray(supplierUnitsTable.supplierId, supplierIds))
      .orderBy(unitsTable.name),
    db
      .select({
        supplierId: supplierTypeLinksTable.supplierId,
        id: supplierTypesTable.id,
        name: supplierTypesTable.name,
      })
      .from(supplierTypeLinksTable)
      .innerJoin(supplierTypesTable, eq(supplierTypeLinksTable.typeId, supplierTypesTable.id))
      .where(inArray(supplierTypeLinksTable.supplierId, supplierIds))
      .orderBy(supplierTypesTable.name),
    db
      .select({
        supplierId: supplierQualificationReviewsTable.supplierId,
        decision: supplierQualificationReviewsTable.decision,
        validUntil: supplierQualificationReviewsTable.validUntil,
        createdAt: supplierQualificationReviewsTable.createdAt,
      })
      .from(supplierQualificationReviewsTable)
      .where(inArray(supplierQualificationReviewsTable.supplierId, supplierIds))
      .orderBy(desc(supplierQualificationReviewsTable.createdAt)),
    db
      .select({
        supplierId: supplierPerformanceReviewsTable.supplierId,
        conclusion: supplierPerformanceReviewsTable.conclusion,
        riskLevel: supplierPerformanceReviewsTable.riskLevel,
        finalScore: supplierPerformanceReviewsTable.finalScore,
        createdAt: supplierPerformanceReviewsTable.createdAt,
      })
      .from(supplierPerformanceReviewsTable)
      .where(inArray(supplierPerformanceReviewsTable.supplierId, supplierIds))
      .orderBy(desc(supplierPerformanceReviewsTable.createdAt)),
  ]);

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const unitsBySupplierId = new Map<number, Array<{ id: number; name: string }>>();
  const typesBySupplierId = new Map<number, Array<{ id: number; name: string }>>();
  const latestQualificationBySupplierId = new Map<number, { decision: string; validUntil: string | null; createdAt: string | null }>();
  const latestPerformanceBySupplierId = new Map<number, { conclusion: string; riskLevel: string; finalScore: number; createdAt: string | null }>();

  for (const unit of units) {
    const current = unitsBySupplierId.get(unit.supplierId) || [];
    current.push({ id: unit.id, name: unit.name });
    unitsBySupplierId.set(unit.supplierId, current);
  }

  for (const type of types) {
    const current = typesBySupplierId.get(type.supplierId) || [];
    current.push({ id: type.id, name: type.name });
    typesBySupplierId.set(type.supplierId, current);
  }

  for (const review of qualificationReviews) {
    if (!latestQualificationBySupplierId.has(review.supplierId)) {
      latestQualificationBySupplierId.set(review.supplierId, {
        decision: review.decision,
        validUntil: formatTimestamp(review.validUntil),
        createdAt: formatTimestamp(review.createdAt),
      });
    }
  }

  for (const review of performanceReviews) {
    if (!latestPerformanceBySupplierId.has(review.supplierId)) {
      latestPerformanceBySupplierId.set(review.supplierId, {
        conclusion: review.conclusion,
        riskLevel: review.riskLevel,
        finalScore: review.finalScore,
        createdAt: formatTimestamp(review.createdAt),
      });
    }
  }

  return {
    categoriesById,
    unitsBySupplierId,
    typesBySupplierId,
    latestQualificationBySupplierId,
    latestPerformanceBySupplierId,
  };
}

async function loadSupplierDetail(supplierId: number, orgId: number) {
  const supplier = await getSupplierOrNull(supplierId, orgId);
  if (!supplier) return null;

  const [category] = supplier.categoryId
    ? await db
        .select({ id: supplierCategoriesTable.id, name: supplierCategoriesTable.name })
        .from(supplierCategoriesTable)
        .where(eq(supplierCategoriesTable.id, supplier.categoryId))
    : [];

  const [creator] = supplier.createdById
    ? await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, supplier.createdById))
    : [];

  const [units, types, offerings, submissions, documentReviews, qualificationReviews, performanceReviews, receiptChecks, failures] =
    await Promise.all([
      db
        .select({ id: unitsTable.id, name: unitsTable.name })
        .from(supplierUnitsTable)
        .innerJoin(unitsTable, eq(supplierUnitsTable.unitId, unitsTable.id))
        .where(eq(supplierUnitsTable.supplierId, supplierId))
        .orderBy(unitsTable.name),
      db
        .select({
          id: supplierTypesTable.id,
          name: supplierTypesTable.name,
          categoryId: supplierTypesTable.categoryId,
          parentTypeId: supplierTypesTable.parentTypeId,
          documentThreshold: supplierTypesTable.documentThreshold,
        })
        .from(supplierTypeLinksTable)
        .innerJoin(supplierTypesTable, eq(supplierTypeLinksTable.typeId, supplierTypesTable.id))
        .where(eq(supplierTypeLinksTable.supplierId, supplierId))
        .orderBy(supplierTypesTable.name),
      db
        .select()
        .from(supplierOfferingsTable)
        .where(eq(supplierOfferingsTable.supplierId, supplierId))
        .orderBy(supplierOfferingsTable.name),
      db
        .select({
          id: supplierDocumentSubmissionsTable.id,
          requirementId: supplierDocumentRequirementsTable.id,
          requirementName: supplierDocumentRequirementsTable.name,
          weight: supplierDocumentRequirementsTable.weight,
          typeId: supplierDocumentRequirementsTable.typeId,
          categoryId: supplierDocumentRequirementsTable.categoryId,
          submissionStatus: supplierDocumentSubmissionsTable.submissionStatus,
          adequacyStatus: supplierDocumentSubmissionsTable.adequacyStatus,
          requestedReviewerId: supplierDocumentSubmissionsTable.requestedReviewerId,
          reviewedById: supplierDocumentSubmissionsTable.reviewedById,
          reviewedAt: supplierDocumentSubmissionsTable.reviewedAt,
          reviewComment: supplierDocumentSubmissionsTable.reviewComment,
          createdById: supplierDocumentSubmissionsTable.createdById,
          validityDate: supplierDocumentSubmissionsTable.validityDate,
          exemptionReason: supplierDocumentSubmissionsTable.exemptionReason,
          rejectionReason: supplierDocumentSubmissionsTable.rejectionReason,
          observations: supplierDocumentSubmissionsTable.observations,
          attachments: supplierDocumentSubmissionsTable.attachments,
          createdAt: supplierDocumentSubmissionsTable.createdAt,
          updatedAt: supplierDocumentSubmissionsTable.updatedAt,
        })
        .from(supplierDocumentSubmissionsTable)
        .innerJoin(
          supplierDocumentRequirementsTable,
          eq(supplierDocumentSubmissionsTable.requirementId, supplierDocumentRequirementsTable.id),
        )
        .where(eq(supplierDocumentSubmissionsTable.supplierId, supplierId))
        .orderBy(supplierDocumentRequirementsTable.name),
      db
        .select({
          id: supplierDocumentReviewsTable.id,
          reviewedById: supplierDocumentReviewsTable.reviewedById,
          compliancePercentage: supplierDocumentReviewsTable.compliancePercentage,
          threshold: supplierDocumentReviewsTable.threshold,
          result: supplierDocumentReviewsTable.result,
          nextReviewDate: supplierDocumentReviewsTable.nextReviewDate,
          criteriaSnapshot: supplierDocumentReviewsTable.criteriaSnapshot,
          observations: supplierDocumentReviewsTable.observations,
          createdAt: supplierDocumentReviewsTable.createdAt,
        })
        .from(supplierDocumentReviewsTable)
        .where(eq(supplierDocumentReviewsTable.supplierId, supplierId))
        .orderBy(desc(supplierDocumentReviewsTable.createdAt)),
      db
        .select()
        .from(supplierQualificationReviewsTable)
        .where(eq(supplierQualificationReviewsTable.supplierId, supplierId))
        .orderBy(desc(supplierQualificationReviewsTable.createdAt)),
      db
        .select({
          id: supplierPerformanceReviewsTable.id,
          offeringId: supplierPerformanceReviewsTable.offeringId,
          offeringName: supplierOfferingsTable.name,
          periodStart: supplierPerformanceReviewsTable.periodStart,
          periodEnd: supplierPerformanceReviewsTable.periodEnd,
          qualityScore: supplierPerformanceReviewsTable.qualityScore,
          deliveryScore: supplierPerformanceReviewsTable.deliveryScore,
          communicationScore: supplierPerformanceReviewsTable.communicationScore,
          complianceScore: supplierPerformanceReviewsTable.complianceScore,
          priceScore: supplierPerformanceReviewsTable.priceScore,
          finalScore: supplierPerformanceReviewsTable.finalScore,
          riskLevel: supplierPerformanceReviewsTable.riskLevel,
          conclusion: supplierPerformanceReviewsTable.conclusion,
          observations: supplierPerformanceReviewsTable.observations,
          createdAt: supplierPerformanceReviewsTable.createdAt,
        })
        .from(supplierPerformanceReviewsTable)
        .leftJoin(supplierOfferingsTable, eq(supplierPerformanceReviewsTable.offeringId, supplierOfferingsTable.id))
        .where(eq(supplierPerformanceReviewsTable.supplierId, supplierId))
        .orderBy(desc(supplierPerformanceReviewsTable.createdAt)),
      db
        .select({
          id: supplierReceiptChecksTable.id,
          offeringId: supplierReceiptChecksTable.offeringId,
          offeringName: supplierOfferingsTable.name,
          unitId: supplierReceiptChecksTable.unitId,
          unitName: unitsTable.name,
          authorizedById: supplierReceiptChecksTable.authorizedById,
          receiptDate: supplierReceiptChecksTable.receiptDate,
          description: supplierReceiptChecksTable.description,
          referenceNumber: supplierReceiptChecksTable.referenceNumber,
          quantity: supplierReceiptChecksTable.quantity,
          totalValue: supplierReceiptChecksTable.totalValue,
          outcome: supplierReceiptChecksTable.outcome,
          acceptanceCriteria: supplierReceiptChecksTable.acceptanceCriteria,
          notes: supplierReceiptChecksTable.notes,
          nonConformityStatus: supplierReceiptChecksTable.nonConformityStatus,
          nonConformitySummary: supplierReceiptChecksTable.nonConformitySummary,
          attachments: supplierReceiptChecksTable.attachments,
          createdAt: supplierReceiptChecksTable.createdAt,
        })
        .from(supplierReceiptChecksTable)
        .leftJoin(supplierOfferingsTable, eq(supplierReceiptChecksTable.offeringId, supplierOfferingsTable.id))
        .leftJoin(unitsTable, eq(supplierReceiptChecksTable.unitId, unitsTable.id))
        .where(eq(supplierReceiptChecksTable.supplierId, supplierId))
        .orderBy(desc(supplierReceiptChecksTable.createdAt)),
      db
        .select()
        .from(supplierFailuresTable)
        .where(eq(supplierFailuresTable.supplierId, supplierId))
        .orderBy(desc(supplierFailuresTable.createdAt)),
    ]);

  return {
    id: supplier.id,
    organizationId: supplier.organizationId,
    personType: supplier.personType,
    legalIdentifier: supplier.legalIdentifier,
    legalName: supplier.legalName,
    tradeName: supplier.tradeName,
    responsibleName: supplier.responsibleName,
    stateRegistration: supplier.stateRegistration,
    municipalRegistration: supplier.municipalRegistration,
    rg: supplier.rg,
    email: supplier.email,
    phone: supplier.phone,
    website: supplier.website,
    postalCode: supplier.postalCode,
    street: supplier.street,
    streetNumber: supplier.streetNumber,
    complement: supplier.complement,
    neighborhood: supplier.neighborhood,
    city: supplier.city,
    state: supplier.state,
    status: supplier.status,
    criticality: supplier.criticality,
    notes: supplier.notes,
    category,
    units,
    types,
    offerings,
    documentCompliancePercentage: supplier.documentCompliancePercentage,
    documentReviewStatus: supplier.documentReviewStatus,
    documentReviewNextDate: supplier.documentReviewNextDate,
    qualifiedUntil: supplier.qualifiedUntil,
    createdAt: formatTimestamp(supplier.createdAt),
    updatedAt: formatTimestamp(supplier.updatedAt),
    createdBy: creator ?? null,
    documents: {
      submissions: submissions.map((submission) => ({
        ...submission,
        attachments: formatAttachments(submission.attachments),
        reviewedAt: formatTimestamp(submission.reviewedAt),
        createdAt: formatTimestamp(submission.createdAt),
        updatedAt: formatTimestamp(submission.updatedAt),
      })),
      reviews: documentReviews.map((review) => ({
        ...review,
        createdAt: formatTimestamp(review.createdAt),
      })),
    },
    qualificationReviews: qualificationReviews.map((review) => ({
      ...review,
      attachments: formatAttachments(review.attachments),
      createdAt: formatTimestamp(review.createdAt),
    })),
    performanceReviews: performanceReviews.map((review) => ({
      ...review,
      createdAt: formatTimestamp(review.createdAt),
    })),
    receiptChecks: receiptChecks.map((receipt) => ({
      ...receipt,
      attachments: formatAttachments(receipt.attachments),
      createdAt: formatTimestamp(receipt.createdAt),
    })),
    failures: failures.map((failure) => ({
      ...failure,
      occurredAt: formatTimestamp(failure.occurredAt),
      createdAt: formatTimestamp(failure.createdAt),
    })),
  };
}

async function maybeCreateFailureFromPerformanceReview({
  supplierId,
  reviewId,
  conclusion,
  observations,
  userId,
}: {
  supplierId: number;
  reviewId: number;
  conclusion: "maintain" | "restrict" | "block";
  observations?: string | null;
  userId: number;
}) {
  if (conclusion === "maintain") return;

  await db.insert(supplierFailuresTable).values({
    supplierId,
    performanceReviewId: reviewId,
    failureType: "compliance",
    severity: conclusion === "block" ? "high" : "medium",
    description: normalizeOptionalString(observations) || `Avaliação de desempenho concluiu ${conclusion}.`,
    createdById: userId,
  });
}

async function maybeCreateFailureFromReceiptCheck({
  supplierId,
  receiptCheckId,
  outcome,
  summary,
  userId,
}: {
  supplierId: number;
  receiptCheckId: number;
  outcome: "accepted" | "accepted_with_remarks" | "rejected";
  summary?: string | null;
  userId: number;
}) {
  if (outcome === "accepted") return;

  await db.insert(supplierFailuresTable).values({
    supplierId,
    receiptCheckId,
    failureType: "quality",
    severity: outcome === "rejected" ? "high" : "medium",
    description: normalizeOptionalString(summary) || `Recebimento marcado como ${outcome}.`,
    createdById: userId,
  });
}

router.get("/organizations/:orgId/supplier-categories", requireAuth, async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const rows = await db
    .select()
    .from(supplierCategoriesTable)
    .where(eq(supplierCategoriesTable.organizationId, params.data.orgId))
    .orderBy(supplierCategoriesTable.name);

  res.json(rows);
});

router.post("/organizations/:orgId/supplier-categories", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const body = supplierCategoryBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const [created] = await db.insert(supplierCategoriesTable).values({
    organizationId: params.data.orgId,
    ...body.data,
  }).returning();
  res.status(201).json(created);
});

router.patch("/organizations/:orgId/supplier-categories/:categoryId", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = z.object({ orgId: z.coerce.number().int().positive(), categoryId: z.coerce.number().int().positive() }).safeParse(req.params);
  const body = supplierCategoryBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const [updated] = await db
    .update(supplierCategoriesTable)
    .set(body.data)
    .where(and(eq(supplierCategoriesTable.id, params.data.categoryId), eq(supplierCategoriesTable.organizationId, params.data.orgId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Categoria não encontrada" });
    return;
  }

  res.json(updated);
});

router.get("/organizations/:orgId/supplier-types", requireAuth, async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const rows = await db
    .select()
    .from(supplierTypesTable)
    .where(eq(supplierTypesTable.organizationId, params.data.orgId))
    .orderBy(supplierTypesTable.name);

  res.json(rows);
});

router.post("/organizations/:orgId/supplier-types", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const body = supplierTypeBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  if (!(await ensureCategoryBelongsToOrg(body.data.categoryId, params.data.orgId))) {
    res.status(400).json({ error: "Categoria inválida para esta organização" });
    return;
  }
  if (!(await ensureTypeBelongsToOrg(body.data.parentTypeId, params.data.orgId))) {
    res.status(400).json({ error: "Tipo pai inválido para esta organização" });
    return;
  }

  const [created] = await db.insert(supplierTypesTable).values({
    organizationId: params.data.orgId,
    ...body.data,
  }).returning();
  res.status(201).json(created);
});

router.patch("/organizations/:orgId/supplier-types/:typeId", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = z.object({ orgId: z.coerce.number().int().positive(), typeId: z.coerce.number().int().positive() }).safeParse(req.params);
  const body = supplierTypeBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  if (!(await ensureCategoryBelongsToOrg(body.data.categoryId, params.data.orgId))) {
    res.status(400).json({ error: "Categoria inválida para esta organização" });
    return;
  }
  if (!(await ensureTypeBelongsToOrg(body.data.parentTypeId, params.data.orgId))) {
    res.status(400).json({ error: "Tipo pai inválido para esta organização" });
    return;
  }

  const [updated] = await db
    .update(supplierTypesTable)
    .set(body.data)
    .where(and(eq(supplierTypesTable.id, params.data.typeId), eq(supplierTypesTable.organizationId, params.data.orgId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Tipo não encontrado" });
    return;
  }

  res.json(updated);
});

router.get("/organizations/:orgId/supplier-catalog-items", requireAuth, async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const rows = await db
    .select()
    .from(supplierCatalogItemsTable)
    .where(eq(supplierCatalogItemsTable.organizationId, params.data.orgId))
    .orderBy(supplierCatalogItemsTable.name);

  res.json(rows);
});

router.post("/organizations/:orgId/supplier-catalog-items", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const body = supplierCatalogItemBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const [created] = await db
    .insert(supplierCatalogItemsTable)
    .values({
      organizationId: params.data.orgId,
      name: body.data.name,
      offeringType: body.data.offeringType,
      unitOfMeasure: normalizeOptionalString(body.data.unitOfMeasure),
      description: normalizeOptionalString(body.data.description),
      status: body.data.status,
    })
    .returning();

  res.status(201).json(created);
});

router.patch("/organizations/:orgId/supplier-catalog-items/:catalogItemId", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = z.object({
    orgId: z.coerce.number().int().positive(),
    catalogItemId: z.coerce.number().int().positive(),
  }).safeParse(req.params);
  const body = supplierCatalogItemBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const updated = await db.transaction(async (tx) => {
    const [nextItem] = await tx
      .update(supplierCatalogItemsTable)
      .set({
        name: body.data.name,
        offeringType: body.data.offeringType,
        unitOfMeasure: normalizeOptionalString(body.data.unitOfMeasure),
        description: normalizeOptionalString(body.data.description),
        status: body.data.status,
      })
      .where(
        and(
          eq(supplierCatalogItemsTable.id, params.data.catalogItemId),
          eq(supplierCatalogItemsTable.organizationId, params.data.orgId),
        ),
      )
      .returning();

    if (!nextItem) {
      return null;
    }

    await tx
      .update(supplierOfferingsTable)
      .set({
        name: nextItem.name,
        offeringType: nextItem.offeringType,
        unitOfMeasure: nextItem.unitOfMeasure,
        description: nextItem.description,
        status: nextItem.status,
      })
      .where(eq(supplierOfferingsTable.catalogItemId, nextItem.id));

    return nextItem;
  });

  if (!updated) {
    res.status(404).json({ error: "Item de catálogo não encontrado" });
    return;
  }

  res.json(updated);
});

router.get("/organizations/:orgId/supplier-document-requirements", requireAuth, async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const rows = await db
    .select()
    .from(supplierDocumentRequirementsTable)
    .where(eq(supplierDocumentRequirementsTable.organizationId, params.data.orgId))
    .orderBy(supplierDocumentRequirementsTable.name);
  res.json(rows.map((row) => ({ ...row, attachments: formatAttachments(row.attachments) })));
});

router.get("/organizations/:orgId/supplier-document-requirements/export", requireAuth, async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const rows = await db
    .select({
      name: supplierDocumentRequirementsTable.name,
      weight: supplierDocumentRequirementsTable.weight,
      description: supplierDocumentRequirementsTable.description,
    })
    .from(supplierDocumentRequirementsTable)
    .where(eq(supplierDocumentRequirementsTable.organizationId, params.data.orgId))
    .orderBy(supplierDocumentRequirementsTable.name);

  res.json({
    rows: rows.map((row) => ({
      name: row.name,
      weight: row.weight,
      description: row.description ?? "",
    })),
  });
});

router.post("/organizations/:orgId/supplier-document-requirements/import-preview", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const body = supplierDocumentRequirementImportBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const preview = await buildSupplierDocumentRequirementImportPreview(params.data.orgId, body.data.rows);
  res.json(preview);
});

router.post("/organizations/:orgId/supplier-document-requirements/import-commit", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const body = supplierDocumentRequirementImportCommitBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  let preview;
  try {
    preview = await readSupplierDocumentRequirementImportPreview(params.data.orgId, body.data.previewToken);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Prévia de importação inválida." });
    return;
  }
  if (preview.summary.errorCount > 0) {
    res.status(400).json({
      error: "A importação contém linhas inválidas. Corrija a planilha e gere uma nova prévia.",
      preview,
    });
    return;
  }

  const validRows = preview.rows.filter((row) => row.action === "create" || row.action === "update");

  await db.transaction(async (tx) => {
    for (const row of validRows) {
      if (row.action === "update" && row.existingRequirementId) {
        await tx
          .update(supplierDocumentRequirementsTable)
          .set({
            name: row.name,
            weight: row.weight ?? 1,
            description: row.description,
          })
          .where(
            and(
              eq(supplierDocumentRequirementsTable.id, row.existingRequirementId),
              eq(supplierDocumentRequirementsTable.organizationId, params.data.orgId),
            ),
          );
        continue;
      }

      await tx.insert(supplierDocumentRequirementsTable).values({
        organizationId: params.data.orgId,
        name: row.name,
        weight: row.weight ?? 1,
        description: row.description,
        status: "active",
        attachments: [],
      });
    }
  });

  res.status(201).json({
    imported: validRows.length,
    created: validRows.filter((row) => row.action === "create").length,
    updated: validRows.filter((row) => row.action === "update").length,
  });
});

router.post("/organizations/:orgId/supplier-document-requirements", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const body = supplierDocumentRequirementBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  if (!(await ensureCategoryBelongsToOrg(body.data.categoryId, params.data.orgId))) {
    res.status(400).json({ error: "Categoria inválida para esta organização" });
    return;
  }
  if (!(await ensureTypeBelongsToOrg(body.data.typeId, params.data.orgId))) {
    res.status(400).json({ error: "Tipo inválido para esta organização" });
    return;
  }

  const [created] = await db.insert(supplierDocumentRequirementsTable).values({
    organizationId: params.data.orgId,
    ...body.data,
  }).returning();
  res.status(201).json(created);
});

router.patch("/organizations/:orgId/supplier-document-requirements/:requirementId", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = z.object({ orgId: z.coerce.number().int().positive(), requirementId: z.coerce.number().int().positive() }).safeParse(req.params);
  const body = supplierDocumentRequirementBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  if (!(await ensureCategoryBelongsToOrg(body.data.categoryId, params.data.orgId))) {
    res.status(400).json({ error: "Categoria inválida para esta organização" });
    return;
  }
  if (!(await ensureTypeBelongsToOrg(body.data.typeId, params.data.orgId))) {
    res.status(400).json({ error: "Tipo inválido para esta organização" });
    return;
  }

  const [updated] = await db
    .update(supplierDocumentRequirementsTable)
    .set(body.data)
    .where(and(eq(supplierDocumentRequirementsTable.id, params.data.requirementId), eq(supplierDocumentRequirementsTable.organizationId, params.data.orgId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Requisito documental não encontrado" });
    return;
  }

  res.json(updated);
});

router.get("/organizations/:orgId/suppliers", requireAuth, async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const query = listSuppliersQuerySchema.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: params.success ? getParseError(query) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const conditions = [eq(suppliersTable.organizationId, params.data.orgId)];
  if (query.data.search) {
    const search = `%${query.data.search}%`;
    conditions.push(
      or(
        ilike(suppliersTable.legalName, search),
        ilike(suppliersTable.tradeName, search),
        ilike(suppliersTable.legalIdentifier, search),
      )!,
    );
  }
  if (query.data.status) {
    conditions.push(eq(suppliersTable.status, query.data.status));
  }
  if (query.data.categoryId) {
    conditions.push(eq(suppliersTable.categoryId, query.data.categoryId));
  }

  const baseRows = await db
    .select({
      id: suppliersTable.id,
      categoryId: suppliersTable.categoryId,
      personType: suppliersTable.personType,
      legalIdentifier: suppliersTable.legalIdentifier,
      legalName: suppliersTable.legalName,
      tradeName: suppliersTable.tradeName,
      responsibleName: suppliersTable.responsibleName,
      status: suppliersTable.status,
      criticality: suppliersTable.criticality,
      documentCompliancePercentage: suppliersTable.documentCompliancePercentage,
      documentReviewStatus: suppliersTable.documentReviewStatus,
      documentReviewNextDate: suppliersTable.documentReviewNextDate,
      qualifiedUntil: suppliersTable.qualifiedUntil,
      updatedAt: suppliersTable.updatedAt,
    })
    .from(suppliersTable)
    .where(and(...conditions))
    .orderBy(suppliersTable.legalName);

  let filteredRows = baseRows;
  let supplierIds = filteredRows.map((row) => row.id);

  if (query.data.unitId && supplierIds.length > 0) {
    const rows = await db
      .select({ supplierId: supplierUnitsTable.supplierId })
      .from(supplierUnitsTable)
      .where(and(inArray(supplierUnitsTable.supplierId, supplierIds), eq(supplierUnitsTable.unitId, query.data.unitId)));
    const allowedIds = new Set(rows.map((row) => row.supplierId));
    filteredRows = filteredRows.filter((row) => allowedIds.has(row.id));
    supplierIds = filteredRows.map((row) => row.id);
  }

  if (query.data.typeId && supplierIds.length > 0) {
    const rows = await db
      .select({ supplierId: supplierTypeLinksTable.supplierId })
      .from(supplierTypeLinksTable)
      .where(and(inArray(supplierTypeLinksTable.supplierId, supplierIds), eq(supplierTypeLinksTable.typeId, query.data.typeId)));
    const allowedIds = new Set(rows.map((row) => row.supplierId));
    filteredRows = filteredRows.filter((row) => allowedIds.has(row.id));
  }

  const preloaded = await preloadSupplierListData(filteredRows);
  const items = filteredRows.map((supplier) => ({
    id: supplier.id,
    personType: supplier.personType,
    legalIdentifier: supplier.legalIdentifier,
    legalName: supplier.legalName,
    tradeName: supplier.tradeName,
    responsibleName: supplier.responsibleName,
    status: supplier.status,
    criticality: supplier.criticality,
    category: supplier.categoryId ? preloaded.categoriesById.get(supplier.categoryId) ?? null : null,
    units: preloaded.unitsBySupplierId.get(supplier.id) ?? [],
    types: preloaded.typesBySupplierId.get(supplier.id) ?? [],
    documentCompliancePercentage: supplier.documentCompliancePercentage,
    documentReviewStatus: supplier.documentReviewStatus,
    documentReviewNextDate: supplier.documentReviewNextDate,
    qualifiedUntil: supplier.qualifiedUntil,
    latestQualification: preloaded.latestQualificationBySupplierId.get(supplier.id) ?? null,
    latestPerformance: preloaded.latestPerformanceBySupplierId.get(supplier.id) ?? null,
    updatedAt: formatTimestamp(supplier.updatedAt),
  }));

  res.json(items);
});

router.get("/organizations/:orgId/suppliers/export", requireAuth, async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const rows = await db
    .select({
      id: suppliersTable.id,
      categoryId: suppliersTable.categoryId,
      personType: suppliersTable.personType,
      legalIdentifier: suppliersTable.legalIdentifier,
      legalName: suppliersTable.legalName,
      tradeName: suppliersTable.tradeName,
      responsibleName: suppliersTable.responsibleName,
      phone: suppliersTable.phone,
      email: suppliersTable.email,
      postalCode: suppliersTable.postalCode,
      street: suppliersTable.street,
      streetNumber: suppliersTable.streetNumber,
      neighborhood: suppliersTable.neighborhood,
      city: suppliersTable.city,
      state: suppliersTable.state,
      notes: suppliersTable.notes,
    })
    .from(suppliersTable)
    .where(eq(suppliersTable.organizationId, params.data.orgId))
    .orderBy(suppliersTable.legalName);

  const preloaded = await preloadSupplierListData(rows.map((row) => ({
    id: row.id,
    categoryId: row.categoryId,
  })));

  res.json({
    rows: rows.map((row) => ({
      legalIdentifier: formatLegalIdentifier(row.legalIdentifier, row.personType === "pf" ? "pf" : "pj"),
      personType: row.personType === "pf" ? "PF" : "PJ",
      legalName: row.legalName,
      tradeName: row.tradeName ?? "",
      responsibleName: row.responsibleName ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      postalCode: formatPostalCode(row.postalCode),
      street: row.street ?? "",
      streetNumber: row.streetNumber ?? "",
      neighborhood: row.neighborhood ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      unitNames: (preloaded.unitsBySupplierId.get(row.id) ?? []).map((unit) => unit.name).join(", "),
      categoryName: row.categoryId ? preloaded.categoriesById.get(row.categoryId)?.name ?? "" : "",
      typeNames: (preloaded.typesBySupplierId.get(row.id) ?? []).map((type) => type.name).join(", "),
      notes: row.notes ?? "",
    })),
  });
});

router.post("/organizations/:orgId/suppliers/import-preview", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const body = supplierImportBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const preview = await buildSupplierImportPreview(params.data.orgId, body.data.rows);
  res.json(preview);
});

router.post("/organizations/:orgId/suppliers/import-commit", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const body = supplierImportCommitBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  let preview;
  try {
    preview = await readSupplierImportPreview(params.data.orgId, body.data.previewToken);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Prévia de importação inválida." });
    return;
  }
  if (preview.summary.errorCount > 0) {
    res.status(400).json({
      error: "A importação contém linhas inválidas. Corrija a planilha e gere uma nova prévia.",
      preview,
    });
    return;
  }

  const validRows = preview.rows.filter((row) => row.action === "create" || row.action === "update");

  await db.transaction(async (tx) => {
    for (const row of validRows) {
      const payload = {
        categoryId: row.categoryId,
        personType: row.personType ?? "pj",
        legalIdentifier: row.legalIdentifier,
        legalName: row.legalName,
        tradeName: row.tradeName,
        responsibleName: row.responsibleName,
        email: row.email,
        phone: row.phone,
        postalCode: row.postalCode,
        street: row.street,
        streetNumber: row.streetNumber,
        neighborhood: row.neighborhood,
        city: row.city,
        state: row.state,
        notes: row.notes,
      };

      let supplierId = row.existingSupplierId;
      if (row.action === "update" && supplierId) {
        const [updated] = await tx
          .update(suppliersTable)
          .set(payload)
          .where(
            and(
              eq(suppliersTable.id, supplierId),
              eq(suppliersTable.organizationId, params.data.orgId),
            ),
          )
          .returning({ id: suppliersTable.id });
        supplierId = updated?.id ?? supplierId;
      } else {
        const [created] = await tx
          .insert(suppliersTable)
          .values({
            organizationId: params.data.orgId,
            createdById: req.auth!.userId,
            status: "draft",
            criticality: "medium",
            ...payload,
          })
          .returning({ id: suppliersTable.id });
        supplierId = created.id;
      }

      await tx.delete(supplierUnitsTable).where(eq(supplierUnitsTable.supplierId, supplierId));
      if (row.unitIds.length > 0) {
        await tx.insert(supplierUnitsTable).values(
          row.unitIds.map((unitId) => ({
            supplierId,
            unitId,
          })),
        );
      }

      await tx.delete(supplierTypeLinksTable).where(eq(supplierTypeLinksTable.supplierId, supplierId));
      if (row.typeIds.length > 0) {
        await tx.insert(supplierTypeLinksTable).values(
          row.typeIds.map((typeId) => ({
            supplierId,
            typeId,
          })),
        );
      }
    }
  });

  res.status(201).json({
    imported: validRows.length,
    created: validRows.filter((row) => row.action === "create").length,
    updated: validRows.filter((row) => row.action === "update").length,
  });
});

router.post("/organizations/:orgId/suppliers", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = orgParamsSchema.safeParse(req.params);
  const body = supplierBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const categoryOk = await ensureCategoryBelongsToOrg(body.data.categoryId, params.data.orgId);
  const typesOk = await ensureTypesBelongToOrg(body.data.typeIds, params.data.orgId);
  const unitsOk = await ensureUnitsBelongToOrg(body.data.unitIds, params.data.orgId);
  const catalogItemsOk = await ensureCatalogItemsBelongToOrg(body.data.catalogItemIds || [], params.data.orgId);
  if (!categoryOk || !typesOk || !unitsOk || !catalogItemsOk) {
    res.status(400).json({ error: "Referências inválidas para categoria, tipos ou unidades" });
    return;
  }

  const payload = {
    categoryId: body.data.categoryId ?? null,
    personType: body.data.personType,
    legalIdentifier: body.data.legalIdentifier,
    legalName: body.data.legalName,
    tradeName: normalizeOptionalString(body.data.tradeName),
    responsibleName: normalizeOptionalString(body.data.responsibleName),
    stateRegistration: normalizeOptionalString(body.data.stateRegistration),
    municipalRegistration: normalizeOptionalString(body.data.municipalRegistration),
    rg: normalizeOptionalString(body.data.rg),
    email: normalizeOptionalString(body.data.email || null),
    phone: normalizeOptionalString(body.data.phone),
    website: normalizeOptionalString(body.data.website),
    postalCode: normalizeOptionalString(body.data.postalCode),
    street: normalizeOptionalString(body.data.street),
    streetNumber: normalizeOptionalString(body.data.streetNumber),
    complement: normalizeOptionalString(body.data.complement),
    neighborhood: normalizeOptionalString(body.data.neighborhood),
    city: normalizeOptionalString(body.data.city),
    state: normalizeOptionalString(body.data.state),
    status: body.data.status,
    criticality: body.data.criticality,
    notes: normalizeOptionalString(body.data.notes),
  };

  const supplier = await db.transaction(async (tx) => {
    const [created] = await tx.insert(suppliersTable).values({
      organizationId: params.data.orgId,
      createdById: req.auth!.userId,
      ...payload,
    }).returning();

    if (body.data.unitIds.length > 0) {
      await tx.insert(supplierUnitsTable).values(body.data.unitIds.map((unitId) => ({
        supplierId: created.id,
        unitId,
      })));
    }

    if (body.data.typeIds.length > 0) {
      await tx.insert(supplierTypeLinksTable).values(body.data.typeIds.map((typeId) => ({
        supplierId: created.id,
        typeId,
      })));
    }

    await syncSupplierCatalogAssociations(tx, created.id, params.data.orgId, body.data.catalogItemIds);

    return created;
  });

  const detail = await loadSupplierDetail(supplier.id, params.data.orgId);
  res.status(201).json(detail);
});

router.get("/organizations/:orgId/suppliers/:supplierId", requireAuth, async (req, res): Promise<void> => {
  const params = supplierParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const detail = await loadSupplierDetail(params.data.supplierId, params.data.orgId);
  if (!detail) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }

  res.json(detail);
});

router.patch("/organizations/:orgId/suppliers/:supplierId", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = supplierParamsSchema.safeParse(req.params);
  const body = supplierBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }
  const categoryOk = await ensureCategoryBelongsToOrg(body.data.categoryId, params.data.orgId);
  const typesOk = await ensureTypesBelongToOrg(body.data.typeIds, params.data.orgId);
  const unitsOk = await ensureUnitsBelongToOrg(body.data.unitIds, params.data.orgId);
  const catalogItemsOk = await ensureCatalogItemsBelongToOrg(body.data.catalogItemIds || [], params.data.orgId);
  if (!categoryOk || !typesOk || !unitsOk || !catalogItemsOk) {
    res.status(400).json({ error: "Referências inválidas para categoria, tipos ou unidades" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(suppliersTable)
      .set({
        categoryId: body.data.categoryId ?? null,
        personType: body.data.personType,
        legalIdentifier: body.data.legalIdentifier,
        legalName: body.data.legalName,
        tradeName: normalizeOptionalString(body.data.tradeName),
        responsibleName: normalizeOptionalString(body.data.responsibleName),
        stateRegistration: normalizeOptionalString(body.data.stateRegistration),
        municipalRegistration: normalizeOptionalString(body.data.municipalRegistration),
        rg: normalizeOptionalString(body.data.rg),
        email: normalizeOptionalString(body.data.email || null),
        phone: normalizeOptionalString(body.data.phone),
        website: normalizeOptionalString(body.data.website),
        postalCode: normalizeOptionalString(body.data.postalCode),
        street: normalizeOptionalString(body.data.street),
        streetNumber: normalizeOptionalString(body.data.streetNumber),
        complement: normalizeOptionalString(body.data.complement),
        neighborhood: normalizeOptionalString(body.data.neighborhood),
        city: normalizeOptionalString(body.data.city),
        state: normalizeOptionalString(body.data.state),
        status: body.data.status,
        criticality: body.data.criticality,
        notes: normalizeOptionalString(body.data.notes),
      })
      .where(eq(suppliersTable.id, supplier.id));

    await tx.delete(supplierUnitsTable).where(eq(supplierUnitsTable.supplierId, supplier.id));
    if (body.data.unitIds.length > 0) {
      await tx.insert(supplierUnitsTable).values(body.data.unitIds.map((unitId) => ({
        supplierId: supplier.id,
        unitId,
      })));
    }

    await tx.delete(supplierTypeLinksTable).where(eq(supplierTypeLinksTable.supplierId, supplier.id));
    if (body.data.typeIds.length > 0) {
      await tx.insert(supplierTypeLinksTable).values(body.data.typeIds.map((typeId) => ({
        supplierId: supplier.id,
        typeId,
      })));
    }

    await syncSupplierCatalogAssociations(tx, supplier.id, params.data.orgId, body.data.catalogItemIds);
  });

  const detail = await loadSupplierDetail(supplier.id, params.data.orgId);
  res.json(detail);
});

router.post("/organizations/:orgId/suppliers/:supplierId/offerings", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = supplierParamsSchema.safeParse(req.params);
  const body = supplierOfferingBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }
  if (body.data.catalogItemId && !(await ensureCatalogItemsBelongToOrg([body.data.catalogItemId], params.data.orgId))) {
    res.status(400).json({ error: "Item de catálogo inválido para esta organização" });
    return;
  }

  const [catalogItem] = body.data.catalogItemId
    ? await db
        .select()
        .from(supplierCatalogItemsTable)
        .where(
          and(
            eq(supplierCatalogItemsTable.id, body.data.catalogItemId),
            eq(supplierCatalogItemsTable.organizationId, params.data.orgId),
          ),
        )
    : [];

  const offeringName = catalogItem?.name ?? body.data.name?.trim();
  const offeringType = catalogItem?.offeringType ?? body.data.offeringType;
  const offeringStatus = catalogItem?.status ?? body.data.status;

  if (!offeringName || !offeringType || !offeringStatus) {
    res.status(400).json({ error: "Dados insuficientes para salvar o item do fornecedor" });
    return;
  }

  const [created] = await db.insert(supplierOfferingsTable).values({
    supplierId: supplier.id,
    catalogItemId: catalogItem?.id ?? null,
    name: offeringName,
    offeringType,
    unitOfMeasure: catalogItem?.unitOfMeasure ?? normalizeOptionalString(body.data.unitOfMeasure),
    description: catalogItem?.description ?? normalizeOptionalString(body.data.description),
    status: offeringStatus,
    isApprovedScope: toDbFlag(body.data.isApprovedScope),
  }).returning();

  res.status(201).json(created);
});

router.patch("/organizations/:orgId/suppliers/:supplierId/offerings/:offeringId", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = z.object({
    orgId: z.coerce.number().int().positive(),
    supplierId: z.coerce.number().int().positive(),
    offeringId: z.coerce.number().int().positive(),
  }).safeParse(req.params);
  const body = supplierOfferingBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }
  if (body.data.catalogItemId && !(await ensureCatalogItemsBelongToOrg([body.data.catalogItemId], params.data.orgId))) {
    res.status(400).json({ error: "Item de catálogo inválido para esta organização" });
    return;
  }

  const [catalogItem] = body.data.catalogItemId
    ? await db
        .select()
        .from(supplierCatalogItemsTable)
        .where(
          and(
            eq(supplierCatalogItemsTable.id, body.data.catalogItemId),
            eq(supplierCatalogItemsTable.organizationId, params.data.orgId),
          ),
        )
    : [];

  const offeringName = catalogItem?.name ?? body.data.name?.trim();
  const offeringType = catalogItem?.offeringType ?? body.data.offeringType;
  const offeringStatus = catalogItem?.status ?? body.data.status;

  if (!offeringName || !offeringType || !offeringStatus) {
    res.status(400).json({ error: "Dados insuficientes para salvar o item do fornecedor" });
    return;
  }

  const [updated] = await db
    .update(supplierOfferingsTable)
    .set({
      catalogItemId: catalogItem?.id ?? null,
      name: offeringName,
      offeringType,
      unitOfMeasure: catalogItem?.unitOfMeasure ?? normalizeOptionalString(body.data.unitOfMeasure),
      description: catalogItem?.description ?? normalizeOptionalString(body.data.description),
      status: offeringStatus,
      isApprovedScope: toDbFlag(body.data.isApprovedScope),
    })
    .where(and(eq(supplierOfferingsTable.id, params.data.offeringId), eq(supplierOfferingsTable.supplierId, supplier.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Item não encontrado" });
    return;
  }

  res.json(updated);
});

router.post("/organizations/:orgId/suppliers/:supplierId/document-submissions", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = supplierParamsSchema.safeParse(req.params);
  const body = supplierDocumentSubmissionBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }
  const [requirement] = await db
    .select()
    .from(supplierDocumentRequirementsTable)
    .where(and(eq(supplierDocumentRequirementsTable.id, body.data.requirementId), eq(supplierDocumentRequirementsTable.organizationId, params.data.orgId)));
  if (!requirement) {
    res.status(400).json({ error: "Requisito documental inválido" });
    return;
  }
  if (!(await ensureUserBelongsToOrg(body.data.requestedReviewerId, params.data.orgId))) {
    res.status(400).json({ error: "Aprovador solicitado inválido para esta organização" });
    return;
  }

  const submissionStatus =
    body.data.workflowAction === "approve_now" ? body.data.submissionStatus : "pending";
  const adequacyStatus =
    body.data.workflowAction === "approve_now" ? body.data.adequacyStatus : "under_review";
  const requestedReviewerId =
    body.data.workflowAction === "request_review" ? body.data.requestedReviewerId ?? null : null;
  const reviewedById = body.data.workflowAction === "approve_now" ? req.auth!.userId : null;
  const reviewedAt = body.data.workflowAction === "approve_now" ? new Date() : null;

  const [upserted] = await db
    .insert(supplierDocumentSubmissionsTable)
    .values({
      supplierId: supplier.id,
      requirementId: body.data.requirementId,
      submissionStatus,
      adequacyStatus,
      requestedReviewerId,
      reviewedById,
      reviewedAt,
      reviewComment: normalizeOptionalString(body.data.reviewComment),
      validityDate: body.data.validityDate ?? null,
      exemptionReason: normalizeOptionalString(body.data.exemptionReason),
      rejectionReason: normalizeOptionalString(body.data.rejectionReason),
      observations: normalizeOptionalString(body.data.observations),
      attachments: body.data.attachments,
      createdById: req.auth!.userId,
    })
    .onConflictDoUpdate({
      target: [supplierDocumentSubmissionsTable.supplierId, supplierDocumentSubmissionsTable.requirementId],
      set: {
        submissionStatus,
        adequacyStatus,
        requestedReviewerId,
        reviewedById,
        reviewedAt,
        reviewComment: normalizeOptionalString(body.data.reviewComment),
        validityDate: body.data.validityDate ?? null,
        exemptionReason: normalizeOptionalString(body.data.exemptionReason),
        rejectionReason: normalizeOptionalString(body.data.rejectionReason),
        observations: normalizeOptionalString(body.data.observations),
        attachments: body.data.attachments,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.status(201).json(upserted);
});

router.post("/organizations/:orgId/suppliers/:supplierId/document-submissions/:submissionId/review", requireAuth, requireSupplierWrite("document_reviews"), async (req, res): Promise<void> => {
  const params = z.object({
    orgId: z.coerce.number().int().positive(),
    supplierId: z.coerce.number().int().positive(),
    submissionId: z.coerce.number().int().positive(),
  }).safeParse(req.params);
  const body = supplierDocumentSubmissionReviewBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }

  const [existing] = await db
    .select()
    .from(supplierDocumentSubmissionsTable)
    .where(
      and(
        eq(supplierDocumentSubmissionsTable.id, params.data.submissionId),
        eq(supplierDocumentSubmissionsTable.supplierId, supplier.id),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Submissão documental não encontrada" });
    return;
  }

  // A pessoa solicitada é um encaminhamento preferencial. A revisão continua
  // aberta para qualquer usuário com permissão de escrita no fluxo documental.
  const [updated] = await db
    .update(supplierDocumentSubmissionsTable)
    .set({
      submissionStatus:
        body.data.decision === "approved"
          ? "approved"
          : body.data.decision === "rejected"
            ? "rejected"
            : "pending",
      adequacyStatus:
        body.data.decision === "approved"
          ? "adequate"
          : body.data.decision === "rejected"
            ? "not_adequate"
            : "under_review",
      requestedReviewerId: null,
      reviewedById: req.auth!.userId,
      reviewedAt: new Date(),
      reviewComment: normalizeOptionalString(body.data.reviewComment),
      validityDate: body.data.validityDate ?? null,
      rejectionReason:
        body.data.decision === "rejected"
          ? normalizeOptionalString(body.data.rejectionReason)
          : null,
      updatedAt: new Date(),
    })
    .where(eq(supplierDocumentSubmissionsTable.id, existing.id))
    .returning();

  res.json(updated);
});

router.post("/organizations/:orgId/suppliers/:supplierId/document-reviews", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = supplierParamsSchema.safeParse(req.params);
  const body = supplierDocumentReviewBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }

  const submissions = await db
    .select({
      requirementId: supplierDocumentRequirementsTable.id,
      requirementName: supplierDocumentRequirementsTable.name,
      weight: supplierDocumentRequirementsTable.weight,
      submissionStatus: supplierDocumentSubmissionsTable.submissionStatus,
      adequacyStatus: supplierDocumentSubmissionsTable.adequacyStatus,
    })
    .from(supplierDocumentSubmissionsTable)
    .innerJoin(
      supplierDocumentRequirementsTable,
      eq(supplierDocumentSubmissionsTable.requirementId, supplierDocumentRequirementsTable.id),
    )
    .where(eq(supplierDocumentSubmissionsTable.supplierId, supplier.id));

  if (submissions.length === 0) {
    res.status(400).json({ error: "Não há submissões documentais para avaliar" });
    return;
  }

  const threshold = await resolveSupplierDocumentThreshold(supplier.id);
  const included = submissions.filter((submission) => submission.submissionStatus !== "exempt");
  const totalPossible = included.reduce((sum, submission) => sum + submission.weight, 0);
  const points = included.reduce((sum, submission) => (
    submission.submissionStatus === "approved" ? sum + submission.weight : sum
  ), 0);
  const compliancePercentage = totalPossible === 0 ? 100 : Math.round((points / totalPossible) * 100);
  const result = compliancePercentage >= threshold ? "apt" : "not_apt";

  const [review] = await db.insert(supplierDocumentReviewsTable).values({
    supplierId: supplier.id,
    reviewedById: req.auth!.userId,
    compliancePercentage,
    threshold,
    result,
    nextReviewDate: body.data.nextReviewDate ?? null,
    criteriaSnapshot: submissions.map((submission) => ({
      requirementId: submission.requirementId,
      requirementName: submission.requirementName,
      weight: submission.weight,
      status: submission.submissionStatus,
      adequacy: submission.adequacyStatus,
    })),
    observations: normalizeOptionalString(body.data.observations),
  }).returning();

  await db.update(suppliersTable).set({
    documentCompliancePercentage: compliancePercentage,
    documentReviewStatus: result,
    documentReviewNextDate: body.data.nextReviewDate ?? null,
    status: result === "apt" && supplier.status === "draft" ? "pending_qualification" : supplier.status,
  }).where(eq(suppliersTable.id, supplier.id));

  res.status(201).json(review);
});

router.post("/organizations/:orgId/suppliers/:supplierId/qualification-reviews", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = supplierParamsSchema.safeParse(req.params);
  const body = supplierQualificationReviewBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;

  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }

  const [latestDocumentReview] = await db
    .select({ result: supplierDocumentReviewsTable.result })
    .from(supplierDocumentReviewsTable)
    .where(eq(supplierDocumentReviewsTable.supplierId, supplier.id))
    .orderBy(desc(supplierDocumentReviewsTable.createdAt))
    .limit(1);

  if (!latestDocumentReview || latestDocumentReview.result !== "apt") {
    res.status(400).json({ error: "A homologação exige avaliação documental apta" });
    return;
  }

  const offerings = body.data.approvedOfferingIds.length === 0
    ? []
    : await db
        .select({ id: supplierOfferingsTable.id, name: supplierOfferingsTable.name, offeringType: supplierOfferingsTable.offeringType })
        .from(supplierOfferingsTable)
        .where(and(eq(supplierOfferingsTable.supplierId, supplier.id), inArray(supplierOfferingsTable.id, body.data.approvedOfferingIds)));

  const [review] = await db.insert(supplierQualificationReviewsTable).values({
    supplierId: supplier.id,
    reviewedById: req.auth!.userId,
    decision: body.data.decision,
    validUntil: body.data.validUntil ?? null,
    notes: normalizeOptionalString(body.data.notes),
    attachments: body.data.attachments,
    approvedOfferings: offerings.map((offering) => ({
      offeringId: offering.id,
      name: offering.name,
      offeringType: offering.offeringType as "product" | "service",
    })),
  }).returning();

  await db.update(suppliersTable).set({
    lastQualifiedAt: new Date(),
    qualifiedUntil: body.data.validUntil ?? null,
    status:
      body.data.decision === "approved"
        ? "approved"
        : body.data.decision === "approved_with_conditions"
          ? "restricted"
          : "blocked",
  }).where(eq(suppliersTable.id, supplier.id));

  res.status(201).json(review);
});

router.post("/organizations/:orgId/suppliers/:supplierId/performance-reviews", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = supplierParamsSchema.safeParse(req.params);
  const body = supplierPerformanceReviewBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }

  if (body.data.offeringId) {
    const [offering] = await db
      .select({ id: supplierOfferingsTable.id })
      .from(supplierOfferingsTable)
      .where(and(eq(supplierOfferingsTable.id, body.data.offeringId), eq(supplierOfferingsTable.supplierId, supplier.id)));
    if (!offering) {
      res.status(400).json({ error: "Produto ou serviço inválido para este fornecedor" });
      return;
    }
  }

  const weightedScores = [
    body.data.qualityScore,
    body.data.deliveryScore,
    body.data.communicationScore,
    body.data.complianceScore,
    ...(body.data.priceScore === null || body.data.priceScore === undefined ? [] : [body.data.priceScore]),
  ];
  const finalScore = Math.round(weightedScores.reduce((sum, value) => sum + value, 0) / weightedScores.length);

  const [review] = await db.insert(supplierPerformanceReviewsTable).values({
    supplierId: supplier.id,
    offeringId: body.data.offeringId ?? null,
    evaluatedById: req.auth!.userId,
    periodStart: body.data.periodStart,
    periodEnd: body.data.periodEnd,
    qualityScore: body.data.qualityScore,
    deliveryScore: body.data.deliveryScore,
    communicationScore: body.data.communicationScore,
    complianceScore: body.data.complianceScore,
    priceScore: body.data.priceScore ?? null,
    finalScore,
    riskLevel: body.data.riskLevel,
    conclusion: body.data.conclusion,
    observations: normalizeOptionalString(body.data.observations),
  }).returning();

  if (body.data.conclusion === "restrict" || body.data.conclusion === "block") {
    await db.update(suppliersTable).set({
      status: body.data.conclusion === "block" ? "blocked" : "restricted",
    }).where(eq(suppliersTable.id, supplier.id));
  }

  await maybeCreateFailureFromPerformanceReview({
    supplierId: supplier.id,
    reviewId: review.id,
    conclusion: body.data.conclusion,
    observations: body.data.observations,
    userId: req.auth!.userId,
  });

  res.status(201).json(review);
});

router.post("/organizations/:orgId/suppliers/:supplierId/receipt-checks", requireAuth, requireSupplierWrite("receipts"), async (req, res): Promise<void> => {
  const params = supplierParamsSchema.safeParse(req.params);
  const body = supplierReceiptCheckBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }

  if (!(await ensureUserBelongsToOrg(body.data.authorizedById, params.data.orgId))) {
    res.status(400).json({ error: "Autorizador inválido para esta organização" });
    return;
  }
  if (!(await ensureUnitsBelongToOrg(body.data.unitId ? [body.data.unitId] : [], params.data.orgId))) {
    res.status(400).json({ error: "Unidade inválida para esta organização" });
    return;
  }
  if (body.data.offeringId) {
    const [offering] = await db
      .select({ id: supplierOfferingsTable.id })
      .from(supplierOfferingsTable)
      .where(and(eq(supplierOfferingsTable.id, body.data.offeringId), eq(supplierOfferingsTable.supplierId, supplier.id)));
    if (!offering) {
      res.status(400).json({ error: "Produto ou serviço inválido para este fornecedor" });
      return;
    }
  }

  const [receipt] = await db.insert(supplierReceiptChecksTable).values({
    supplierId: supplier.id,
    offeringId: body.data.offeringId ?? null,
    unitId: body.data.unitId ?? null,
    checkedById: req.auth!.userId,
    authorizedById: body.data.authorizedById,
    receiptDate: body.data.receiptDate,
    description: body.data.description,
    referenceNumber: normalizeOptionalString(body.data.referenceNumber),
    quantity: normalizeOptionalString(body.data.quantity),
    totalValue: body.data.totalValue ?? null,
    outcome: body.data.outcome,
    acceptanceCriteria: body.data.acceptanceCriteria,
    notes: normalizeOptionalString(body.data.notes),
    nonConformityStatus: body.data.nonConformityStatus,
    nonConformitySummary: normalizeOptionalString(body.data.nonConformitySummary),
    attachments: body.data.attachments,
  }).returning();

  await maybeCreateFailureFromReceiptCheck({
    supplierId: supplier.id,
    receiptCheckId: receipt.id,
    outcome: body.data.outcome,
    summary: body.data.nonConformitySummary,
    userId: req.auth!.userId,
  });

  res.status(201).json(receipt);
});

router.patch("/organizations/:orgId/suppliers/:supplierId/receipt-checks/:receiptCheckId", requireAuth, requireSupplierWrite("receipts"), async (req, res): Promise<void> => {
  const params = z.object({
    orgId: z.coerce.number().int().positive(),
    supplierId: z.coerce.number().int().positive(),
    receiptCheckId: z.coerce.number().int().positive(),
  }).safeParse(req.params);
  const body = supplierReceiptCheckBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }
  if (!(await ensureUserBelongsToOrg(body.data.authorizedById, params.data.orgId))) {
    res.status(400).json({ error: "Autorizador inválido para esta organização" });
    return;
  }
  if (!(await ensureUnitsBelongToOrg(body.data.unitId ? [body.data.unitId] : [], params.data.orgId))) {
    res.status(400).json({ error: "Unidade inválida para esta organização" });
    return;
  }
  if (!(await ensureOfferingBelongsToSupplier(body.data.offeringId, supplier.id))) {
    res.status(400).json({ error: "Produto ou serviço inválido para este fornecedor" });
    return;
  }

  const [updated] = await db
    .update(supplierReceiptChecksTable)
    .set({
      offeringId: body.data.offeringId ?? null,
      unitId: body.data.unitId ?? null,
      authorizedById: body.data.authorizedById,
      receiptDate: body.data.receiptDate,
      description: body.data.description,
      referenceNumber: normalizeOptionalString(body.data.referenceNumber),
      quantity: normalizeOptionalString(body.data.quantity),
      totalValue: body.data.totalValue ?? null,
      outcome: body.data.outcome,
      acceptanceCriteria: body.data.acceptanceCriteria,
      notes: normalizeOptionalString(body.data.notes),
      nonConformityStatus: body.data.nonConformityStatus,
      nonConformitySummary: normalizeOptionalString(body.data.nonConformitySummary),
      attachments: body.data.attachments,
    })
    .where(and(eq(supplierReceiptChecksTable.id, params.data.receiptCheckId), eq(supplierReceiptChecksTable.supplierId, supplier.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Recebimento não encontrado" });
    return;
  }

  res.json(updated);
});

router.post("/organizations/:orgId/suppliers/:supplierId/failures", requireAuth, requireSupplierWrite("general"), async (req, res): Promise<void> => {
  const params = supplierParamsSchema.safeParse(req.params);
  const body = supplierFailureBodySchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.success ? getParseError(body) : params.error.message });
    return;
  }
  if (!(await ensureOrgAccess(params.data.orgId, req, res))) return;
  const supplier = await getSupplierOrNull(params.data.supplierId, params.data.orgId);
  if (!supplier) {
    res.status(404).json({ error: "Fornecedor não encontrado" });
    return;
  }
  if (!(await ensurePerformanceReviewBelongsToSupplier(body.data.performanceReviewId, supplier.id))) {
    res.status(400).json({ error: "Avaliação de desempenho inválida" });
    return;
  }
  if (!(await ensureReceiptCheckBelongsToSupplier(body.data.receiptCheckId, supplier.id))) {
    res.status(400).json({ error: "Recebimento inválido" });
    return;
  }

  const [created] = await db.insert(supplierFailuresTable).values({
    supplierId: supplier.id,
    performanceReviewId: body.data.performanceReviewId ?? null,
    receiptCheckId: body.data.receiptCheckId ?? null,
    failureType: body.data.failureType,
    severity: body.data.severity,
    description: body.data.description,
    status: body.data.status,
    createdById: req.auth!.userId,
  }).returning();

  res.status(201).json(created);
});

export default router;
