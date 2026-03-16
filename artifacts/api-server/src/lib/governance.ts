import { randomUUID } from "crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  db,
  documentAttachmentsTable,
  documentUnitsTable,
  documentVersionsTable,
  documentsTable,
  strategicPlanActionsTable,
  strategicPlanActionUnitsTable,
  strategicPlanInterestedPartiesTable,
  strategicPlanObjectivesTable,
  strategicPlanRevisionsTable,
  strategicPlansTable,
  strategicPlanSwotItemsTable,
  unitsTable,
  userModulePermissionsTable,
  usersTable,
  notificationsTable,
  type StrategicPlanReminderFlags,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

const DAY_MS = 24 * 60 * 60 * 1000;
const objectStorageService = new ObjectStorageService();

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values));
}

function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfBuffer(title: string, lines: string[]): Buffer {
  const pageHeight = 800;
  const linesPerPage = 44;
  const chunks: string[][] = [];

  for (let i = 0; i < lines.length; i += linesPerPage) {
    chunks.push(lines.slice(i, i + linesPerPage));
  }

  const objects: string[] = [];
  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];
  const contentIds: number[] = [];

  for (const chunk of chunks) {
    let stream = "BT\n/F1 10 Tf\n40 800 Td\n14 TL\n";
    stream += `(${escapePdfText(title)}) Tj\nT*\n`;
    stream += "( ) Tj\nT*\n";
    for (const line of chunk) {
      stream += `(${escapePdfText(line)}) Tj\nT*\n`;
    }
    stream += "ET";
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
  }

  const pagesId = addObject("<< /Type /Pages /Kids [] /Count 0 >>");

  for (const contentId of contentIds) {
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

async function notifyUsers(
  organizationId: number,
  userIds: number[],
  payload: { type: string; title: string; description: string; entityId: number },
) {
  if (userIds.length === 0) return;

  await db.insert(notificationsTable).values(
    userIds.map((userId) => ({
      organizationId,
      userId,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      relatedEntityType: "strategic_plan",
      relatedEntityId: payload.entityId,
    })),
  );
}

async function getGovernanceRecipientIds(organizationId: number): Promise<number[]> {
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.organizationId, organizationId),
        or(eq(usersTable.role, "org_admin"), eq(usersTable.role, "platform_admin"))!,
      ),
    );

  const governanceUsers = await db
    .select({ id: userModulePermissionsTable.userId })
    .from(userModulePermissionsTable)
    .innerJoin(usersTable, eq(userModulePermissionsTable.userId, usersTable.id))
    .where(
      and(
        eq(usersTable.organizationId, organizationId),
        eq(userModulePermissionsTable.module, "governance"),
      ),
    );

  return uniqueNumbers([
    ...admins.map((row) => row.id),
    ...governanceUsers.map((row) => row.id),
  ]);
}

export async function ensureStrategicPlanMaintenance(organizationId: number): Promise<void> {
  const plans = await db
    .select({
      id: strategicPlansTable.id,
      title: strategicPlansTable.title,
      status: strategicPlansTable.status,
      nextReviewAt: strategicPlansTable.nextReviewAt,
      reminderFlags: strategicPlansTable.reminderFlags,
    })
    .from(strategicPlansTable)
    .where(
      and(
        eq(strategicPlansTable.organizationId, organizationId),
        inArray(strategicPlansTable.status, ["approved", "overdue"]),
      ),
    );

  const recipientIds = await getGovernanceRecipientIds(organizationId);
  const now = Date.now();

  for (const plan of plans) {
    if (!plan.nextReviewAt) continue;

    const diffDays = Math.ceil((plan.nextReviewAt.getTime() - now) / DAY_MS);
    const reminderFlags: StrategicPlanReminderFlags = { ...(plan.reminderFlags || {}) };
    let dirty = false;

    if (diffDays <= 30 && !reminderFlags.d30) {
      reminderFlags.d30 = true;
      dirty = true;
      await notifyUsers(organizationId, recipientIds, {
        type: "governance_review_due",
        title: "Revisão do planejamento em 30 dias",
        description: `O plano "${plan.title}" precisa ser revisado em até 30 dias.`,
        entityId: plan.id,
      });
    }

    if (diffDays <= 7 && !reminderFlags.d7) {
      reminderFlags.d7 = true;
      dirty = true;
      await notifyUsers(organizationId, recipientIds, {
        type: "governance_review_due",
        title: "Revisão do planejamento em 7 dias",
        description: `O plano "${plan.title}" precisa ser revisado em até 7 dias.`,
        entityId: plan.id,
      });
    }

    if (diffDays <= 0 && !reminderFlags.d0) {
      reminderFlags.d0 = true;
      dirty = true;
      await notifyUsers(organizationId, recipientIds, {
        type: "governance_review_overdue",
        title: "Revisão do planejamento vencida",
        description: `O plano "${plan.title}" está com a revisão vencida.`,
        entityId: plan.id,
      });
    }

    const nextStatus = diffDays <= 0 ? "overdue" : plan.status;
    if (dirty || nextStatus !== plan.status) {
      await db
        .update(strategicPlansTable)
        .set({
          status: nextStatus,
          reminderFlags,
        })
        .where(eq(strategicPlansTable.id, plan.id));
    }
  }
}

export async function getStrategicPlanDetail(planId: number, organizationId: number) {
  const [plan] = await db
    .select()
    .from(strategicPlansTable)
    .where(
      and(
        eq(strategicPlansTable.id, planId),
        eq(strategicPlansTable.organizationId, organizationId),
      ),
    );

  if (!plan) return null;

  const [swotItems, interestedParties, objectives, actions, revisions] = await Promise.all([
    db
      .select()
      .from(strategicPlanSwotItemsTable)
      .where(eq(strategicPlanSwotItemsTable.planId, planId))
      .orderBy(strategicPlanSwotItemsTable.sortOrder, strategicPlanSwotItemsTable.id),
    db
      .select()
      .from(strategicPlanInterestedPartiesTable)
      .where(eq(strategicPlanInterestedPartiesTable.planId, planId))
      .orderBy(
        strategicPlanInterestedPartiesTable.sortOrder,
        strategicPlanInterestedPartiesTable.id,
      ),
    db
      .select()
      .from(strategicPlanObjectivesTable)
      .where(eq(strategicPlanObjectivesTable.planId, planId))
      .orderBy(strategicPlanObjectivesTable.sortOrder, strategicPlanObjectivesTable.id),
    db
      .select({
        id: strategicPlanActionsTable.id,
        planId: strategicPlanActionsTable.planId,
        title: strategicPlanActionsTable.title,
        description: strategicPlanActionsTable.description,
        swotItemId: strategicPlanActionsTable.swotItemId,
        objectiveId: strategicPlanActionsTable.objectiveId,
        responsibleUserId: strategicPlanActionsTable.responsibleUserId,
        responsibleUserName: usersTable.name,
        dueDate: strategicPlanActionsTable.dueDate,
        status: strategicPlanActionsTable.status,
        notes: strategicPlanActionsTable.notes,
        sortOrder: strategicPlanActionsTable.sortOrder,
        createdAt: strategicPlanActionsTable.createdAt,
        updatedAt: strategicPlanActionsTable.updatedAt,
      })
      .from(strategicPlanActionsTable)
      .leftJoin(usersTable, eq(strategicPlanActionsTable.responsibleUserId, usersTable.id))
      .where(eq(strategicPlanActionsTable.planId, planId))
      .orderBy(strategicPlanActionsTable.sortOrder, strategicPlanActionsTable.id),
    db
      .select({
        id: strategicPlanRevisionsTable.id,
        planId: strategicPlanRevisionsTable.planId,
        revisionNumber: strategicPlanRevisionsTable.revisionNumber,
        revisionDate: strategicPlanRevisionsTable.revisionDate,
        reason: strategicPlanRevisionsTable.reason,
        changeSummary: strategicPlanRevisionsTable.changeSummary,
        approvedById: strategicPlanRevisionsTable.approvedById,
        approvedByName: usersTable.name,
        evidenceDocumentId: strategicPlanRevisionsTable.evidenceDocumentId,
        snapshot: strategicPlanRevisionsTable.snapshot,
        createdAt: strategicPlanRevisionsTable.createdAt,
      })
      .from(strategicPlanRevisionsTable)
      .leftJoin(usersTable, eq(strategicPlanRevisionsTable.approvedById, usersTable.id))
      .where(eq(strategicPlanRevisionsTable.planId, planId))
      .orderBy(desc(strategicPlanRevisionsTable.revisionNumber)),
  ]);

  const actionIds = actions.map((action) => action.id);
  const actionUnits =
    actionIds.length === 0
      ? []
      : await db
          .select({
            actionId: strategicPlanActionUnitsTable.actionId,
            unitId: unitsTable.id,
            unitName: unitsTable.name,
          })
          .from(strategicPlanActionUnitsTable)
          .innerJoin(unitsTable, eq(strategicPlanActionUnitsTable.unitId, unitsTable.id))
          .where(inArray(strategicPlanActionUnitsTable.actionId, actionIds));

  const actionsWithUnits = actions.map((action) => ({
    ...action,
    dueDate: isoDate(action.dueDate),
    createdAt: isoDate(action.createdAt),
    updatedAt: isoDate(action.updatedAt),
    units: actionUnits
      .filter((unit) => unit.actionId === action.id)
      .map((unit) => ({ id: unit.unitId, name: unit.unitName })),
  }));

  const swotItemsWithIso = swotItems.map((item) => ({
    ...item,
    createdAt: isoDate(item.createdAt),
    updatedAt: isoDate(item.updatedAt),
  }));

  const interestedPartiesWithIso = interestedParties.map((item) => ({
    ...item,
    createdAt: isoDate(item.createdAt),
    updatedAt: isoDate(item.updatedAt),
  }));

  const objectivesWithIso = objectives.map((item) => ({
    ...item,
    createdAt: isoDate(item.createdAt),
    updatedAt: isoDate(item.updatedAt),
  }));

  const revisionsWithIso = revisions.map((item) => ({
    ...item,
    revisionDate: isoDate(item.revisionDate),
    createdAt: isoDate(item.createdAt),
  }));

  const actionSwotIds = new Set(actionsWithUnits.map((action) => action.swotItemId).filter(Boolean));
  const complianceIssues: string[] = [];

  if (plan.status !== "approved" && plan.status !== "overdue") {
    complianceIssues.push("Plano sem aprovação vigente.");
  }
  if (plan.nextReviewAt && plan.nextReviewAt.getTime() < Date.now()) {
    complianceIssues.push("Revisão periódica vencida.");
  }
  if (swotItemsWithIso.length === 0) {
    complianceIssues.push("Ausência de itens SWOT.");
  }
  if (swotItemsWithIso.some((item) => !item.treatmentDecision?.trim())) {
    complianceIssues.push("Existem itens SWOT sem conclusão de tratamento.");
  }
  if (interestedPartiesWithIso.length === 0) {
    complianceIssues.push("Ausência de partes interessadas.");
  }
  if (objectivesWithIso.length === 0) {
    complianceIssues.push("Ausência de objetivos estratégicos.");
  }
  if (plan.climateChangeRelevant === null || typeof plan.climateChangeRelevant !== "boolean") {
    complianceIssues.push("Avaliação de relevância de mudança climática não registrada.");
  }
  if (
    swotItemsWithIso.some(
      (item) =>
        item.treatmentDecision?.toLowerCase().includes("requer") && !actionSwotIds.has(item.id),
    )
  ) {
    complianceIssues.push("Há item SWOT que requer ação sem ação vinculada.");
  }

  const actionsByStatus = actionsWithUnits.reduce<Record<string, number>>((acc, action) => {
    acc[action.status] = (acc[action.status] || 0) + 1;
    return acc;
  }, {});

  return {
    ...plan,
    createdAt: isoDate(plan.createdAt),
    updatedAt: isoDate(plan.updatedAt),
    submittedAt: isoDate(plan.submittedAt),
    approvedAt: isoDate(plan.approvedAt),
    rejectedAt: isoDate(plan.rejectedAt),
    archivedAt: isoDate(plan.archivedAt),
    nextReviewAt: isoDate(plan.nextReviewAt),
    swotItems: swotItemsWithIso,
    interestedParties: interestedPartiesWithIso,
    objectives: objectivesWithIso,
    actions: actionsWithUnits,
    revisions: revisionsWithIso,
    metrics: {
      swotCount: swotItemsWithIso.length,
      actionCount: actionsWithUnits.length,
      interestedPartyCount: interestedPartiesWithIso.length,
      objectiveCount: objectivesWithIso.length,
      openActionCount: actionsWithUnits.filter((action) => action.status !== "done").length,
      overdueActionCount: actionsWithUnits.filter(
        (action) => action.dueDate && new Date(action.dueDate).getTime() < Date.now() && action.status !== "done",
      ).length,
      actionsByStatus,
    },
    complianceIssues,
  };
}

export async function createStrategicPlanEvidenceDocument({
  plan,
  approvedById,
  detail,
}: {
  plan: {
    organizationId: number;
    id: number;
    title: string;
    standards: string[];
    executiveSummary?: string | null;
    technicalScope?: string | null;
    geographicScope?: string | null;
    strategicConclusion?: string | null;
    climateChangeRelevant?: boolean | null;
  };
  approvedById: number;
  detail: Awaited<ReturnType<typeof getStrategicPlanDetail>>;
}): Promise<number> {
  const revisionNumber = ((detail?.activeRevisionNumber as number | undefined) || 0) + 1;
  const lines = [
    `Plano: ${plan.title}`,
    `Status: aprovado`,
    `Normas: ${(plan.standards || []).join(", ") || "ISO 9001:2015"}`,
    `Resumo: ${plan.executiveSummary || "—"}`,
    `Escopo técnico: ${plan.technicalScope || "—"}`,
    `Escopo geográfico: ${plan.geographicScope || "—"}`,
    `Conclusão estratégica: ${plan.strategicConclusion || "—"}`,
    `Próxima revisão: ${detail?.nextReviewAt || "—"}`,
    `Mudança climática relevante: ${
      typeof plan.climateChangeRelevant === "boolean"
        ? plan.climateChangeRelevant
          ? "Sim"
          : "Não"
        : "Não informado"
    }`,
    " ",
    "Objetivos:",
    ...(detail?.objectives.map((item) => `${item.code || "—"} - ${item.description}`) || ["—"]),
    " ",
    "Partes interessadas:",
    ...(detail?.interestedParties.map((item) => `${item.name} | relevante=${item.relevantToManagementSystem ? "sim" : "nao"}`) || ["—"]),
    " ",
    "Itens SWOT:",
    ...(detail?.swotItems.map(
      (item) =>
        `${item.domain}/${item.swotType} - ${item.description} | decisao=${item.treatmentDecision || "—"}`,
    ) || ["—"]),
    " ",
    "Ações:",
    ...(detail?.actions.map(
      (item) =>
        `${item.title} | status=${item.status} | prazo=${item.dueDate || "—"} | unidades=${item.units.map((unit) => unit.name).join(", ") || "—"}`,
    ) || ["—"]),
  ];

  const pdfBuffer = buildPdfBuffer(`Planejamento Estratégico - Revisão ${revisionNumber}`, lines);
  const objectPath = await objectStorageService.uploadDirect(pdfBuffer, "application/pdf");

  const impactedUnitIds = uniqueNumbers(
    (detail?.actions || []).flatMap((action) => action.units.map((unit) => unit.id)),
  );

  const [document] = await db
    .insert(documentsTable)
    .values({
      organizationId: plan.organizationId,
      title: `${plan.title} - Revisão ${revisionNumber}`,
      type: "registro",
      sourceEntityType: "strategic_plan",
      sourceEntityId: plan.id,
      status: "approved",
      currentVersion: 1,
      validityDate: detail?.nextReviewAt ? detail.nextReviewAt.slice(0, 10) : null,
      createdById: approvedById,
    })
    .returning();

  if (impactedUnitIds.length > 0) {
    await db.insert(documentUnitsTable).values(
      impactedUnitIds.map((unitId) => ({
        documentId: document.id,
        unitId,
      })),
    );
  }

  await db.insert(documentAttachmentsTable).values({
    documentId: document.id,
    versionNumber: 1,
    fileName: `planejamento-estrategico-revisao-${revisionNumber}.pdf`,
    fileSize: pdfBuffer.length,
    contentType: "application/pdf",
    objectPath,
    uploadedById: approvedById,
  });

  await db.insert(documentVersionsTable).values({
    documentId: document.id,
    versionNumber: 1,
    changeDescription: `Documento gerado automaticamente a partir da aprovação do plano estratégico (revisão ${revisionNumber}).`,
    changedById: approvedById,
    changedFields: "status:approved,source_entity_type:strategic_plan",
  });

  return document.id;
}

export async function createStrategicPlanRevision({
  planId,
  approvedById,
  reason,
  changeSummary,
}: {
  planId: number;
  approvedById: number;
  reason?: string | null;
  changeSummary?: string | null;
}) {
  const detail = await getStrategicPlanDetail(
    planId,
    (
      await db
        .select({ organizationId: strategicPlansTable.organizationId })
        .from(strategicPlansTable)
        .where(eq(strategicPlansTable.id, planId))
    )[0]!.organizationId,
  );

  if (!detail) {
    throw new Error("Strategic plan not found");
  }

  const evidenceDocumentId = await createStrategicPlanEvidenceDocument({
    plan: detail,
    approvedById,
    detail,
  });

  const revisionNumber = detail.activeRevisionNumber + 1;
  const snapshot = {
    generatedAt: new Date().toISOString(),
    plan: detail,
  };

  const [revision] = await db
    .insert(strategicPlanRevisionsTable)
    .values({
      planId,
      revisionNumber,
      reason: reason || detail.reviewReason || null,
      changeSummary: changeSummary || null,
      approvedById,
      evidenceDocumentId,
      snapshot,
    })
    .returning();

  await db
    .update(strategicPlansTable)
    .set({
      activeRevisionNumber: revisionNumber,
      approvedAt: new Date(),
      nextReviewAt: addMonths(new Date(), detail.reviewFrequencyMonths || 12),
      reminderFlags: {},
    })
    .where(eq(strategicPlansTable.id, planId));

  return revision;
}

export function assertEditableStatus(status: string): boolean {
  return status === "draft" || status === "rejected";
}
