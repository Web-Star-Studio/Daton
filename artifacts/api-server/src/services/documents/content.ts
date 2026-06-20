import { z } from "zod";
import type { DocumentContentSection, DocumentRecordsTreatment, DocumentVersionMetaSnapshot } from "@workspace/db";

/** Trims a string and converts blank/undefined to null (for optional identification fields). */
export function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export const DocumentContentSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(100_000),
  order: z.number().int().min(0),
});

export const UpdateDocumentContentBodySchema = z.object({
  contentSections: z.array(DocumentContentSectionSchema).max(50),
}).refine(
  (data) => new Set(data.contentSections.map((s) => s.id)).size === data.contentSections.length,
  { message: "IDs de seção duplicados" },
);

export function normalizeContentSections(
  sections: DocumentContentSection[],
): DocumentContentSection[] {
  return sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, index) => ({ ...s, title: s.title.trim(), order: index }));
}

function isPgUniqueCodeConstraintViolation(target: unknown): boolean {
  return (
    typeof target === "object" &&
    target !== null &&
    "code" in target &&
    (target as { code?: string }).code === "23505" &&
    "constraint" in target &&
    (target as { constraint?: string }).constraint === "documents_org_code_unique"
  );
}

export function isDuplicateCodeError(err: unknown): boolean {
  if (isPgUniqueCodeConstraintViolation(err)) return true;
  // Drizzle wraps pg errors in DrizzleQueryError; the original pg error is in .cause
  if (
    err !== null &&
    typeof err === "object" &&
    "cause" in err &&
    isPgUniqueCodeConstraintViolation((err as { cause?: unknown }).cause)
  ) {
    return true;
  }
  return false;
}

export const RecordsTreatmentSchema = z
  .object({
    storageLocation: z.string().max(500).nullable().optional(),
    retentionMonths: z.number().int().min(0).max(1200).nullable().optional(),
    disposalMethod: z.string().max(500).nullable().optional(),
    responsible: z.string().max(500).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .nullable()
  .optional();

export function normalizeRecordsTreatment(
  input:
    | {
        storageLocation?: string | null;
        retentionMonths?: number | null;
        disposalMethod?: string | null;
        responsible?: string | null;
        notes?: string | null;
      }
    | null
    | undefined,
): DocumentRecordsTreatment | null {
  if (!input) return null;
  const result: DocumentRecordsTreatment = {
    storageLocation: blankToNull(input.storageLocation ?? null),
    retentionMonths:
      typeof input.retentionMonths === "number" ? input.retentionMonths : null,
    disposalMethod: blankToNull(input.disposalMethod ?? null),
    responsible: blankToNull(input.responsible ?? null),
    notes: blankToNull(input.notes ?? null),
  };
  const empty =
    !result.storageLocation &&
    result.retentionMonths === null &&
    !result.disposalMethod &&
    !result.responsible &&
    !result.notes;
  return empty ? null : result;
}

export function buildVersionMetaSnapshot(doc: {
  title: string;
  code: string | null | undefined;
  area: string | null | undefined;
  applicableNorm: string | null | undefined;
  normativeRequirements: string[] | null | undefined;
  recordsTreatment?: DocumentRecordsTreatment | null;
}): DocumentVersionMetaSnapshot {
  return {
    title: doc.title,
    code: doc.code ?? null,
    area: doc.area ?? null,
    applicableNorm: doc.applicableNorm ?? null,
    normativeRequirements: doc.normativeRequirements ?? [],
    recordsTreatment: doc.recordsTreatment ?? null,
  };
}
