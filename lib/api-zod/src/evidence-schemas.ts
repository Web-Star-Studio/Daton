import { z as zod } from "zod";

export const RequestUploadUrlBody = zod.object({
  name: zod.string().min(1),
  size: zod.number().int().min(1),
  contentType: zod.string().min(1),
});

export const RequestUploadUrlResponse = zod.object({
  uploadURL: zod.string(),
  objectPath: zod.string(),
  metadata: zod.object({
    name: zod.string(),
    size: zod.number(),
    contentType: zod.string(),
  }).optional(),
});

export const EvidenceAttachmentResponse = zod.object({
  id: zod.number(),
  unitLegislationId: zod.number(),
  fileName: zod.string(),
  fileSize: zod.number(),
  contentType: zod.string(),
  objectPath: zod.string(),
  uploadedAt: zod.string(),
});

export const CreateEvidenceAttachmentBody = zod.object({
  fileName: zod.string().min(1),
  fileSize: zod.number().int().min(1),
  contentType: zod.string().min(1),
  objectPath: zod.string().min(1),
});

export const EvidenceAttachmentParams = zod.object({
  orgId: zod.coerce.number(),
  legId: zod.coerce.number(),
  unitId: zod.coerce.number(),
});

export const DeleteEvidenceAttachmentParams = zod.object({
  orgId: zod.coerce.number(),
  legId: zod.coerce.number(),
  unitId: zod.coerce.number(),
  attachmentId: zod.coerce.number(),
});

export const QuestionnaireQuestionItem = zod.object({
  id: zod.number(),
  code: zod.string(),
  questionNumber: zod.string(),
  text: zod.string(),
  type: zod.enum(["single_select", "multi_select", "text"]),
  options: zod.array(zod.string()).nullable(),
  conditionalOn: zod.string().nullable(),
  conditionalValue: zod.string().nullable(),
  sortOrder: zod.number(),
});

export const QuestionnaireThemeItem = zod.object({
  id: zod.number(),
  code: zod.string(),
  name: zod.string(),
  description: zod.string().nullable(),
  sortOrder: zod.number(),
  questions: zod.array(QuestionnaireQuestionItem),
});

export const ComplianceTagItem = zod.object({
  id: zod.number(),
  tag: zod.string(),
  sourceQuestionId: zod.number().nullable(),
});
