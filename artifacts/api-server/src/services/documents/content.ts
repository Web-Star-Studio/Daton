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
});

export function normalizeContentSections(
  sections: DocumentContentSection[],
): DocumentContentSection[] {
  return sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, index) => ({ ...s, title: s.title.trim(), order: index }));
}

export function buildVersionMetaSnapshot(doc: {
  title: string;
  code: string | null;
  area: string | null;
  applicableNorm: string | null;
  normativeRequirements: string[];
}): DocumentVersionMetaSnapshot {
  return {
    title: doc.title,
    code: doc.code ?? null,
    area: doc.area ?? null,
    applicableNorm: doc.applicableNorm ?? null,
    normativeRequirements: doc.normativeRequirements ?? [],
  };
}
