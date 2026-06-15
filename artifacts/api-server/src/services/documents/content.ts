import { z } from "zod";
import type { DocumentContentSection, DocumentVersionMetaSnapshot } from "@workspace/db";

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

export function buildVersionMetaSnapshot(doc: {
  title: string;
  code: string | null | undefined;
  area: string | null | undefined;
  applicableNorm: string | null | undefined;
  normativeRequirements: string[] | null | undefined;
}): DocumentVersionMetaSnapshot {
  return {
    title: doc.title,
    code: doc.code ?? null,
    area: doc.area ?? null,
    applicableNorm: doc.applicableNorm ?? null,
    normativeRequirements: doc.normativeRequirements ?? [],
  };
}
