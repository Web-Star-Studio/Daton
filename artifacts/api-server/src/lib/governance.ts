import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
  type StrategicPlanStatus,
  type StrategicPlanReminderFlags,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

const DAY_MS = 24 * 60 * 60 * 1000;
const objectStorageService = new ObjectStorageService();

export interface StrategicPlanSummaryMetrics {
  swotCount: number;
  actionCount: number;
  interestedPartyCount: number;
  objectiveCount: number;
  openActionCount: number;
  overdueActionCount: number;
  actionsByStatus: Record<string, number>;
}

export interface StrategicPlanOpenActionByUnit {
  unitId: number;
  unitName: string;
  openActionCount: number;
}

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

function wrapPdfText(
  text: string,
  maxWidth: number,
  size: number,
  measure: (value: string, fontSize: number) => number,
): string[] {
  const normalized = text.trim();
  if (!normalized) return [""];

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (measure(next, size) <= maxWidth) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    let slice = "";
    for (const char of word) {
      const candidate = `${slice}${char}`;
      if (measure(candidate, size) <= maxWidth || !slice) {
        slice = candidate;
      } else {
        lines.push(slice);
        slice = char;
      }
    }
    current = slice;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

async function buildPdfBuffer(title: string, lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 48;
  const bodySize = 10;
  const titleSize = 16;
  const lineHeight = 14;
  const maxWidth = pageSize[0] - margin * 2;

  let page = pdf.addPage(pageSize);
  let cursorY = page.getHeight() - margin;

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY - requiredHeight < margin) {
      page = pdf.addPage(pageSize);
      cursorY = page.getHeight() - margin;
    }
  };

  ensureSpace(titleSize + lineHeight * 2);
  page.drawText(title, {
    x: margin,
    y: cursorY,
    font: titleFont,
    size: titleSize,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursorY -= titleSize + 10;

  for (const rawLine of lines) {
    const wrappedLines =
      rawLine.trim() === ""
        ? [""]
        : wrapPdfText(rawLine, maxWidth, bodySize, (value, fontSize) =>
            bodyFont.widthOfTextAtSize(value, fontSize),
          );

    ensureSpace(wrappedLines.length * lineHeight + 4);

    for (const wrappedLine of wrappedLines) {
      if (wrappedLine.trim() !== "") {
        page.drawText(wrappedLine, {
          x: margin,
          y: cursorY,
          font: bodyFont,
          size: bodySize,
          color: rgb(0.15, 0.15, 0.15),
        });
      }
      cursorY -= lineHeight;
    }
  }

  return Buffer.from(await pdf.save());
}

function buildStrategicPlanMetrics(args: {
  swotCount: number;
  interestedPartyCount: number;
  objectiveCount: number;
  actions: Array<{ dueDate?: string | null; status: string }>;
}): StrategicPlanSummaryMetrics {
  const actionsByStatus = args.actions.reduce<Record<string, number>>((acc, action) => {
    acc[action.status] = (acc[action.status] || 0) + 1;
    return acc;
  }, {});

  return {
    swotCount: args.swotCount,
    actionCount: args.actions.length,
    interestedPartyCount: args.interestedPartyCount,
    objectiveCount: args.objectiveCount,
    openActionCount: args.actions.filter((action) => action.status !== "done").length,
    overdueActionCount: args.actions.filter(
      (action) =>
        action.dueDate &&
        new Date(action.dueDate).getTime() < Date.now() &&
        action.status !== "done",
    ).length,
    actionsByStatus,
  };
}

function buildStrategicPlanComplianceIssues(args: {
  status: string;
  nextReviewAt?: Date | string | null;
  climateChangeRelevant?: boolean | null;
  swotItems: Array<{ id: number; treatmentDecision?: string | null }>;
  interestedPartyCount: number;
  objectiveCount: number;
  actions: Array<{ swotItemId?: number | null }>;
}): string[] {
  const complianceIssues: string[] = [];
  const nextReviewAt =
    typeof args.nextReviewAt === "string"
      ? new Date(args.nextReviewAt)
      : args.nextReviewAt ?? null;
  const actionSwotIds = new Set(
    args.actions.map((action) => action.swotItemId).filter((value): value is number => !!value),
  );

  if (args.status !== "approved" && args.status !== "overdue") {
    complianceIssues.push("Plano sem aprovação vigente.");
  }
  if (nextReviewAt && nextReviewAt.getTime() < Date.now()) {
    complianceIssues.push("Revisão periódica vencida.");
  }
  if (args.swotItems.length === 0) {
    complianceIssues.push("Ausência de itens SWOT.");
  }
  if (args.swotItems.some((item) => !item.treatmentDecision?.trim())) {
    complianceIssues.push("Existem itens SWOT sem conclusão de tratamento.");
  }
  if (args.interestedPartyCount === 0) {
    complianceIssues.push("Ausência de partes interessadas.");
  }
  if (args.objectiveCount === 0) {
    complianceIssues.push("Ausência de objetivos estratégicos.");
  }
  if (args.climateChangeRelevant === null || typeof args.climateChangeRelevant !== "boolean") {
    complianceIssues.push("Avaliação de relevância de mudança climática não registrada.");
  }
  if (
    args.swotItems.some(
      (item) =>
        item.treatmentDecision?.toLowerCase().includes("requer") && !actionSwotIds.has(item.id),
    )
  ) {
    complianceIssues.push("Há item SWOT que requer ação sem ação vinculada.");
  }

  return complianceIssues;
}

function buildOpenActionsByUnit(
  actions: Array<{
    id: number;
    status: string;
    units: Array<{ id: number; name: string }>;
  }>,
): StrategicPlanOpenActionByUnit[] {
  const counts = new Map<number, StrategicPlanOpenActionByUnit>();

  for (const action of actions) {
    if (action.status === "done") continue;
    for (const unit of action.units) {
      const current = counts.get(unit.id);
      if (current) {
        current.openActionCount += 1;
      } else {
        counts.set(unit.id, {
          unitId: unit.id,
          unitName: unit.name,
          openActionCount: 1,
        });
      }
    }
  }

  return Array.from(counts.values()).sort(
    (left, right) => right.openActionCount - left.openActionCount || left.unitName.localeCompare(right.unitName),
  );
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
        or(eq(usersTable.role, "org_admin"), eq(usersTable.role, "platform_admin")),
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

async function applyMaintenanceToPlan(plan: {
  id: number;
  organizationId: number;
  title: string;
  status: string;
  nextReviewAt: Date | null;
  reminderFlags: StrategicPlanReminderFlags | null;
}, recipientIds: number[]) {
  if (!plan.nextReviewAt) return;

  const diffDays = Math.ceil((plan.nextReviewAt.getTime() - Date.now()) / DAY_MS);
  const reminderFlags: StrategicPlanReminderFlags = { ...(plan.reminderFlags || {}) };
  const notifications: Array<{
    type: string;
    title: string;
    description: string;
  }> = [];

  if (diffDays <= 30 && !reminderFlags.d30) {
    reminderFlags.d30 = true;
    notifications.push({
      type: "governance_review_due",
      title: "Revisão do planejamento em 30 dias",
      description: `O plano "${plan.title}" precisa ser revisado em até 30 dias.`,
    });
  }

  if (diffDays <= 7 && !reminderFlags.d7) {
    reminderFlags.d7 = true;
    notifications.push({
      type: "governance_review_due",
      title: "Revisão do planejamento em 7 dias",
      description: `O plano "${plan.title}" precisa ser revisado em até 7 dias.`,
    });
  }

  if (diffDays <= 0 && !reminderFlags.d0) {
    reminderFlags.d0 = true;
    notifications.push({
      type: "governance_review_overdue",
      title: "Revisão do planejamento vencida",
      description: `O plano "${plan.title}" está com a revisão vencida.`,
    });
  }

  const nextStatus: StrategicPlanStatus =
    diffDays <= 0 ? "overdue" : (plan.status as StrategicPlanStatus);
  const shouldUpdate =
    nextStatus !== plan.status ||
    reminderFlags.d30 !== plan.reminderFlags?.d30 ||
    reminderFlags.d7 !== plan.reminderFlags?.d7 ||
    reminderFlags.d0 !== plan.reminderFlags?.d0;

  if (!shouldUpdate) return;

  await db
    .update(strategicPlansTable)
    .set({
      status: nextStatus,
      reminderFlags,
    })
    .where(eq(strategicPlansTable.id, plan.id));

  for (const notification of notifications) {
    await notifyUsers(plan.organizationId, recipientIds, {
      ...notification,
      entityId: plan.id,
    });
  }
}

export async function runGovernanceMaintenancePass(): Promise<void> {
  const plans = await db
    .select({
      id: strategicPlansTable.id,
      organizationId: strategicPlansTable.organizationId,
      title: strategicPlansTable.title,
      status: strategicPlansTable.status,
      nextReviewAt: strategicPlansTable.nextReviewAt,
      reminderFlags: strategicPlansTable.reminderFlags,
    })
    .from(strategicPlansTable)
    .where(
      and(
        inArray(strategicPlansTable.status, ["approved", "overdue"]),
        isNotNull(strategicPlansTable.nextReviewAt),
      ),
    );

  const recipientsByOrganization = new Map<number, number[]>();
  for (const plan of plans) {
    let recipientIds = recipientsByOrganization.get(plan.organizationId);
    if (!recipientIds) {
      recipientIds = await getGovernanceRecipientIds(plan.organizationId);
      recipientsByOrganization.set(plan.organizationId, recipientIds);
    }
    await applyMaintenanceToPlan(plan, recipientIds);
  }
}

export async function listStrategicPlanSummaries(organizationId: number) {
  const plans = await db
    .select()
    .from(strategicPlansTable)
    .where(eq(strategicPlansTable.organizationId, organizationId))
    .orderBy(desc(strategicPlansTable.updatedAt));

  if (plans.length === 0) {
    return [];
  }

  const planIds = plans.map((plan) => plan.id);
  const [swotItems, interestedParties, objectives, actions] = await Promise.all([
    db
      .select({
        id: strategicPlanSwotItemsTable.id,
        planId: strategicPlanSwotItemsTable.planId,
        treatmentDecision: strategicPlanSwotItemsTable.treatmentDecision,
      })
      .from(strategicPlanSwotItemsTable)
      .where(inArray(strategicPlanSwotItemsTable.planId, planIds)),
    db
      .select({
        id: strategicPlanInterestedPartiesTable.id,
        planId: strategicPlanInterestedPartiesTable.planId,
      })
      .from(strategicPlanInterestedPartiesTable)
      .where(inArray(strategicPlanInterestedPartiesTable.planId, planIds)),
    db
      .select({
        id: strategicPlanObjectivesTable.id,
        planId: strategicPlanObjectivesTable.planId,
      })
      .from(strategicPlanObjectivesTable)
      .where(inArray(strategicPlanObjectivesTable.planId, planIds)),
    db
      .select({
        id: strategicPlanActionsTable.id,
        planId: strategicPlanActionsTable.planId,
        swotItemId: strategicPlanActionsTable.swotItemId,
        dueDate: strategicPlanActionsTable.dueDate,
        status: strategicPlanActionsTable.status,
      })
      .from(strategicPlanActionsTable)
      .where(inArray(strategicPlanActionsTable.planId, planIds)),
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

  return plans.map((plan) => {
    const planSwotItems = swotItems.filter((item) => item.planId === plan.id);
    const planActions = actions
      .filter((action) => action.planId === plan.id)
      .map((action) => ({
        id: action.id,
        status: action.status,
        swotItemId: action.swotItemId,
        dueDate: isoDate(action.dueDate),
        units: actionUnits
          .filter((unit) => unit.actionId === action.id)
          .map((unit) => ({ id: unit.unitId, name: unit.unitName })),
      }));
    const metrics = buildStrategicPlanMetrics({
      swotCount: planSwotItems.length,
      interestedPartyCount: interestedParties.filter((item) => item.planId === plan.id).length,
      objectiveCount: objectives.filter((item) => item.planId === plan.id).length,
      actions: planActions,
    });
    const complianceIssues = buildStrategicPlanComplianceIssues({
      status: plan.status,
      nextReviewAt: plan.nextReviewAt,
      climateChangeRelevant: plan.climateChangeRelevant,
      swotItems: planSwotItems,
      interestedPartyCount: metrics.interestedPartyCount,
      objectiveCount: metrics.objectiveCount,
      actions: planActions,
    });

    return {
      id: plan.id,
      organizationId: plan.organizationId,
      title: plan.title,
      status: plan.status,
      reviewFrequencyMonths: plan.reviewFrequencyMonths,
      nextReviewAt: isoDate(plan.nextReviewAt),
      executiveSummary: plan.executiveSummary,
      activeRevisionNumber: plan.activeRevisionNumber,
      updatedAt: isoDate(plan.updatedAt),
      createdAt: isoDate(plan.createdAt),
      complianceIssues,
      firstComplianceIssue: complianceIssues[0] || null,
      openActionsByUnit: buildOpenActionsByUnit(planActions),
      metrics,
    };
  });
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

  const metrics = buildStrategicPlanMetrics({
    swotCount: swotItemsWithIso.length,
    interestedPartyCount: interestedPartiesWithIso.length,
    objectiveCount: objectivesWithIso.length,
    actions: actionsWithUnits,
  });
  const complianceIssues = buildStrategicPlanComplianceIssues({
    status: plan.status,
    nextReviewAt: plan.nextReviewAt,
    climateChangeRelevant: plan.climateChangeRelevant,
    swotItems: swotItemsWithIso,
    interestedPartyCount: metrics.interestedPartyCount,
    objectiveCount: metrics.objectiveCount,
    actions: actionsWithUnits,
  });

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
    metrics,
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

  const pdfBuffer = await buildPdfBuffer(
    `Planejamento Estratégico - Revisão ${revisionNumber}`,
    lines,
  );
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

export function isEditableStatus(status: string): boolean {
  return status === "draft" || status === "rejected";
}
