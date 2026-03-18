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
  strategicPlanRiskOpportunityEffectivenessReviewsTable,
  strategicPlanRiskOpportunityItemsTable,
  strategicPlanRevisionsTable,
  strategicPlanReviewersTable,
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
type GovernanceMutationExecutor = Pick<typeof db, "insert" | "update" | "select">;

export interface StrategicPlanSummaryMetrics {
  swotCount: number;
  actionCount: number;
  interestedPartyCount: number;
  objectiveCount: number;
  riskOpportunityCount: number;
  openActionCount: number;
  overdueActionCount: number;
  openRiskOpportunityCount: number;
  overdueRiskOpportunityCount: number;
  actionsByStatus: Record<string, number>;
  riskOpportunitiesByStatus: Record<string, number>;
  riskOpportunitiesByType: Record<string, number>;
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
  riskOpportunityItems: Array<{
    nextReviewAt?: string | null;
    status: string;
    type: string;
  }>;
}): StrategicPlanSummaryMetrics {
  const actionsByStatus = args.actions.reduce<Record<string, number>>((acc, action) => {
    acc[action.status] = (acc[action.status] || 0) + 1;
    return acc;
  }, {});
  const riskOpportunitiesByStatus = args.riskOpportunityItems.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    {},
  );
  const riskOpportunitiesByType = args.riskOpportunityItems.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    },
    {},
  );

  return {
    swotCount: args.swotCount,
    actionCount: args.actions.length,
    interestedPartyCount: args.interestedPartyCount,
    objectiveCount: args.objectiveCount,
    riskOpportunityCount: args.riskOpportunityItems.length,
    openActionCount: args.actions.filter((action) => action.status !== "done").length,
    overdueActionCount: args.actions.filter(
      (action) =>
        action.dueDate &&
        new Date(action.dueDate).getTime() < Date.now() &&
        action.status !== "done",
    ).length,
    actionsByStatus,
    openRiskOpportunityCount: args.riskOpportunityItems.filter(
      (item) => !["effective", "canceled"].includes(item.status),
    ).length,
    overdueRiskOpportunityCount: args.riskOpportunityItems.filter(
      (item) =>
        item.nextReviewAt &&
        new Date(item.nextReviewAt).getTime() < Date.now() &&
        !["effective", "canceled"].includes(item.status),
    ).length,
    riskOpportunitiesByStatus,
    riskOpportunitiesByType,
  };
}

function buildRiskOpportunityPriority(score: number | null | undefined): string {
  if (!score || score <= 0) return "na";
  if (score <= 4) return "low";
  if (score <= 8) return "medium";
  if (score <= 12) return "high";
  return "critical";
}

function deriveRiskOpportunityStatus(args: {
  storedStatus: string;
  likelihood?: number | null;
  impact?: number | null;
  responseStrategy?: string | null;
  actions: Array<{ status: string }>;
  latestEffectivenessResult?: string | null;
}): string {
  if (args.storedStatus === "continuous" || args.storedStatus === "canceled") {
    return args.storedStatus;
  }
  if (args.latestEffectivenessResult === "ineffective") return "ineffective";
  if (args.latestEffectivenessResult === "effective") return "effective";
  if (args.actions.length > 0) {
    const hasOpenAction = args.actions.some((action) =>
      ["pending", "in_progress"].includes(action.status),
    );
    return hasOpenAction ? "responding" : "awaiting_effectiveness";
  }
  if (args.likelihood && args.impact && args.responseStrategy) {
    return "assessed";
  }
  return "identified";
}

function buildStrategicPlanComplianceIssues(args: {
  status: string;
  nextReviewAt?: Date | string | null;
  climateChangeRelevant?: boolean | null;
  swotItems: Array<{ id: number; treatmentDecision?: string | null }>;
  interestedPartyCount: number;
  objectiveCount: number;
  actions: Array<{ swotItemId?: number | null }>;
  riskOpportunityItems: Array<{
    id: number;
    ownerUserId?: number | null;
    likelihood?: number | null;
    impact?: number | null;
    responseStrategy?: string | null;
    nextReviewAt?: string | null;
    status: string;
    latestEffectivenessResult?: string | null;
    actions: Array<{ status: string }>;
  }>;
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
  if (args.riskOpportunityItems.length === 0) {
    complianceIssues.push("Ausência de riscos e oportunidades avaliados.");
  }
  if (
    args.riskOpportunityItems.some(
      (item) =>
        !item.ownerUserId ||
        !item.likelihood ||
        !item.impact ||
        !item.responseStrategy,
    )
  ) {
    complianceIssues.push("Existem riscos ou oportunidades sem avaliação completa.");
  }
  if (
    args.riskOpportunityItems.some(
      (item) =>
        item.responseStrategy &&
        !["monitor", "accept"].includes(item.responseStrategy) &&
        item.actions.length === 0 &&
        !["canceled", "continuous"].includes(item.status),
    )
  ) {
    complianceIssues.push("Há risco ou oportunidade que exige resposta sem ação vinculada.");
  }
  if (
    args.riskOpportunityItems.some(
      (item) =>
        item.nextReviewAt &&
        new Date(item.nextReviewAt).getTime() < Date.now() &&
        !["effective", "canceled"].includes(item.status),
    )
  ) {
    complianceIssues.push("Existem riscos ou oportunidades com revisão vencida.");
  }
  if (
    args.riskOpportunityItems.some(
      (item) =>
        item.status === "awaiting_effectiveness" && !item.latestEffectivenessResult,
    )
  ) {
    complianceIssues.push("Há risco ou oportunidade concluído sem verificação de eficácia.");
  }
  if (
    args.riskOpportunityItems.some(
      (item) => item.latestEffectivenessResult === "ineffective",
    )
  ) {
    complianceIssues.push("Há risco ou oportunidade com eficácia reprovada.");
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

export interface GovernanceRiskOpportunityListFilters {
  planId?: number;
  type?: "risk" | "opportunity";
  status?:
    | "identified"
    | "assessed"
    | "responding"
    | "awaiting_effectiveness"
    | "effective"
    | "ineffective"
    | "continuous"
    | "canceled";
  priority?: "na" | "low" | "medium" | "high" | "critical";
  ownerUserId?: number;
  unitId?: number;
  sourceType?:
    | "swot"
    | "audit"
    | "meeting"
    | "legislation"
    | "incident"
    | "internal_strategy"
    | "other";
}

export async function listGovernanceRiskOpportunityItems(
  organizationId: number,
  filters: GovernanceRiskOpportunityListFilters = {},
) {
  const planConditions = [eq(strategicPlansTable.organizationId, organizationId)];
  if (filters.planId) {
    planConditions.push(eq(strategicPlansTable.id, filters.planId));
  }

  const plans = await db
    .select({
      id: strategicPlansTable.id,
      title: strategicPlansTable.title,
    })
    .from(strategicPlansTable)
    .where(and(...planConditions));

  if (plans.length === 0) {
    return [];
  }

  const planIds = plans.map((plan) => plan.id);
  const planTitleById = new Map(plans.map((plan) => [plan.id, plan.title]));
  const riskConditions = [inArray(strategicPlanRiskOpportunityItemsTable.planId, planIds)];

  if (filters.type) {
    riskConditions.push(eq(strategicPlanRiskOpportunityItemsTable.type, filters.type));
  }
  if (filters.ownerUserId) {
    riskConditions.push(eq(strategicPlanRiskOpportunityItemsTable.ownerUserId, filters.ownerUserId));
  }
  if (filters.unitId) {
    riskConditions.push(eq(strategicPlanRiskOpportunityItemsTable.unitId, filters.unitId));
  }
  if (filters.sourceType) {
    riskConditions.push(eq(strategicPlanRiskOpportunityItemsTable.sourceType, filters.sourceType));
  }

  const riskOpportunityItems = await db
    .select()
    .from(strategicPlanRiskOpportunityItemsTable)
    .where(and(...riskConditions))
    .orderBy(
      desc(strategicPlanRiskOpportunityItemsTable.updatedAt),
      desc(strategicPlanRiskOpportunityItemsTable.id),
    );

  if (riskOpportunityItems.length === 0) {
    return [];
  }

  const riskOpportunityItemIds = riskOpportunityItems.map((item) => item.id);
  const actions = await db
    .select({
      id: strategicPlanActionsTable.id,
      planId: strategicPlanActionsTable.planId,
      title: strategicPlanActionsTable.title,
      description: strategicPlanActionsTable.description,
      swotItemId: strategicPlanActionsTable.swotItemId,
      objectiveId: strategicPlanActionsTable.objectiveId,
      responsibleUserId: strategicPlanActionsTable.responsibleUserId,
      secondaryResponsibleUserId: strategicPlanActionsTable.secondaryResponsibleUserId,
      riskOpportunityItemId: strategicPlanActionsTable.riskOpportunityItemId,
      dueDate: strategicPlanActionsTable.dueDate,
      rescheduledDueDate: strategicPlanActionsTable.rescheduledDueDate,
      rescheduleReason: strategicPlanActionsTable.rescheduleReason,
      completedAt: strategicPlanActionsTable.completedAt,
      completionNotes: strategicPlanActionsTable.completionNotes,
      status: strategicPlanActionsTable.status,
      notes: strategicPlanActionsTable.notes,
      sortOrder: strategicPlanActionsTable.sortOrder,
      createdAt: strategicPlanActionsTable.createdAt,
      updatedAt: strategicPlanActionsTable.updatedAt,
    })
    .from(strategicPlanActionsTable)
    .where(inArray(strategicPlanActionsTable.riskOpportunityItemId, riskOpportunityItemIds))
    .orderBy(strategicPlanActionsTable.sortOrder, strategicPlanActionsTable.id);

  const actionIds = actions.map((action) => action.id);
  const effectivenessReviews = await db
    .select({
      id: strategicPlanRiskOpportunityEffectivenessReviewsTable.id,
      riskOpportunityItemId:
        strategicPlanRiskOpportunityEffectivenessReviewsTable.riskOpportunityItemId,
      reviewedById: strategicPlanRiskOpportunityEffectivenessReviewsTable.reviewedById,
      result: strategicPlanRiskOpportunityEffectivenessReviewsTable.result,
      comment: strategicPlanRiskOpportunityEffectivenessReviewsTable.comment,
      createdAt: strategicPlanRiskOpportunityEffectivenessReviewsTable.createdAt,
    })
    .from(strategicPlanRiskOpportunityEffectivenessReviewsTable)
    .where(
      inArray(
        strategicPlanRiskOpportunityEffectivenessReviewsTable.riskOpportunityItemId,
        riskOpportunityItemIds,
      ),
    );

  const governanceUserIds = uniqueNumbers(
    [
      ...actions.flatMap((action) => [
        action.responsibleUserId,
        action.secondaryResponsibleUserId,
      ]),
      ...riskOpportunityItems.flatMap((item) => [
        item.ownerUserId,
        item.coOwnerUserId,
      ]),
      ...effectivenessReviews.map((review) => review.reviewedById),
    ].filter((value): value is number => typeof value === "number"),
  );
  const unitIds = uniqueNumbers(
    riskOpportunityItems
      .map((item) => item.unitId)
      .filter((value): value is number => typeof value === "number"),
  );
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
  const governanceUsers =
    governanceUserIds.length === 0
      ? []
      : await db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, governanceUserIds));
  const riskUnits =
    unitIds.length === 0
      ? []
      : await db
          .select({ id: unitsTable.id, name: unitsTable.name })
          .from(unitsTable)
          .where(inArray(unitsTable.id, unitIds));

  const governanceUsersMap = new Map(governanceUsers.map((user) => [user.id, user.name]));
  const riskUnitsMap = new Map(riskUnits.map((unit) => [unit.id, unit.name]));
  const actionsWithUnits = actions.map((action) => ({
    ...action,
    responsibleUserName: action.responsibleUserId
      ? governanceUsersMap.get(action.responsibleUserId) || null
      : null,
    secondaryResponsibleUserName: action.secondaryResponsibleUserId
      ? governanceUsersMap.get(action.secondaryResponsibleUserId) || null
      : null,
    dueDate: isoDate(action.dueDate),
    rescheduledDueDate: isoDate(action.rescheduledDueDate),
    completedAt: isoDate(action.completedAt),
    createdAt: isoDate(action.createdAt),
    updatedAt: isoDate(action.updatedAt),
    units: actionUnits
      .filter((unit) => unit.actionId === action.id)
      .map((unit) => ({ id: unit.unitId, name: unit.unitName })),
  }));
  const effectivenessReviewsWithIso = effectivenessReviews.map((review) => ({
    ...review,
    reviewedByName: governanceUsersMap.get(review.reviewedById) || null,
    createdAt: isoDate(review.createdAt),
  }));

  const items = riskOpportunityItems
    .map((item) => {
      const linkedActions = actionsWithUnits.filter(
        (action) => action.riskOpportunityItemId === item.id,
      );
      const itemReviews = effectivenessReviewsWithIso
        .filter((review) => review.riskOpportunityItemId === item.id)
        .sort(
          (left, right) =>
            new Date(right.createdAt || 0).getTime() -
            new Date(left.createdAt || 0).getTime(),
        );
      const latestEffectivenessReview = itemReviews[0] || null;
      const derivedStatus = deriveRiskOpportunityStatus({
        storedStatus: item.status,
        likelihood: item.likelihood,
        impact: item.impact,
        responseStrategy: item.responseStrategy,
        actions: linkedActions,
        latestEffectivenessResult: latestEffectivenessReview?.result ?? null,
      });
      const priority = buildRiskOpportunityPriority(item.score);

      return {
        ...item,
        planTitle: planTitleById.get(item.planId) || "Plano sem título",
        ownerUserName: item.ownerUserId
          ? governanceUsersMap.get(item.ownerUserId) || null
          : null,
        coOwnerUserName: item.coOwnerUserId
          ? governanceUsersMap.get(item.coOwnerUserId) || null
          : null,
        unitName: item.unitId ? riskUnitsMap.get(item.unitId) || null : null,
        nextReviewAt: isoDate(item.nextReviewAt),
        createdAt: isoDate(item.createdAt),
        updatedAt: isoDate(item.updatedAt),
        priority,
        status: derivedStatus,
        effectivenessReviews: itemReviews,
        latestEffectivenessReview,
        actions: linkedActions,
      };
    })
    .filter((item) => {
      if (filters.status && item.status !== filters.status) {
        return false;
      }
      if (filters.priority && item.priority !== filters.priority) {
        return false;
      }
      return true;
    });

  return items;
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
  const [swotItems, interestedParties, objectives, actions, riskOpportunityItems] =
    await Promise.all([
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
        riskOpportunityItemId: strategicPlanActionsTable.riskOpportunityItemId,
        dueDate: strategicPlanActionsTable.dueDate,
        status: strategicPlanActionsTable.status,
      })
      .from(strategicPlanActionsTable)
      .where(inArray(strategicPlanActionsTable.planId, planIds)),
    db
      .select({
        id: strategicPlanRiskOpportunityItemsTable.id,
        planId: strategicPlanRiskOpportunityItemsTable.planId,
        ownerUserId: strategicPlanRiskOpportunityItemsTable.ownerUserId,
        likelihood: strategicPlanRiskOpportunityItemsTable.likelihood,
        impact: strategicPlanRiskOpportunityItemsTable.impact,
        responseStrategy: strategicPlanRiskOpportunityItemsTable.responseStrategy,
        nextReviewAt: strategicPlanRiskOpportunityItemsTable.nextReviewAt,
        status: strategicPlanRiskOpportunityItemsTable.status,
        type: strategicPlanRiskOpportunityItemsTable.type,
      })
      .from(strategicPlanRiskOpportunityItemsTable)
      .where(inArray(strategicPlanRiskOpportunityItemsTable.planId, planIds)),
  ]);

  const riskOpportunityItemIds = riskOpportunityItems.map((item) => item.id);
  const effectivenessReviews =
    riskOpportunityItemIds.length === 0
      ? []
      : await db
          .select({
            id: strategicPlanRiskOpportunityEffectivenessReviewsTable.id,
            riskOpportunityItemId:
              strategicPlanRiskOpportunityEffectivenessReviewsTable.riskOpportunityItemId,
            result: strategicPlanRiskOpportunityEffectivenessReviewsTable.result,
            createdAt: strategicPlanRiskOpportunityEffectivenessReviewsTable.createdAt,
          })
          .from(strategicPlanRiskOpportunityEffectivenessReviewsTable)
          .where(
            inArray(
              strategicPlanRiskOpportunityEffectivenessReviewsTable.riskOpportunityItemId,
              riskOpportunityItemIds,
            ),
          );

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
        riskOpportunityItemId: action.riskOpportunityItemId,
        dueDate: isoDate(action.dueDate),
        units: actionUnits
          .filter((unit) => unit.actionId === action.id)
          .map((unit) => ({ id: unit.unitId, name: unit.unitName })),
      }));
    const planRiskOpportunityItems = riskOpportunityItems
      .filter((item) => item.planId === plan.id)
      .map((item) => {
        const itemActions = planActions.filter(
          (action) => action.riskOpportunityItemId === item.id,
        );
        const latestEffectivenessReview = effectivenessReviews
          .filter((review) => review.riskOpportunityItemId === item.id)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

        return {
          ...item,
          nextReviewAt: isoDate(item.nextReviewAt),
          latestEffectivenessResult: latestEffectivenessReview?.result ?? null,
          actions: itemActions,
          status: deriveRiskOpportunityStatus({
            storedStatus: item.status,
            likelihood: item.likelihood,
            impact: item.impact,
            responseStrategy: item.responseStrategy,
            actions: itemActions,
            latestEffectivenessResult: latestEffectivenessReview?.result ?? null,
          }),
        };
      });
    const metrics = buildStrategicPlanMetrics({
      swotCount: planSwotItems.length,
      interestedPartyCount: interestedParties.filter((item) => item.planId === plan.id).length,
      objectiveCount: objectives.filter((item) => item.planId === plan.id).length,
      actions: planActions,
      riskOpportunityItems: planRiskOpportunityItems,
    });
    const complianceIssues = buildStrategicPlanComplianceIssues({
      status: plan.status,
      nextReviewAt: plan.nextReviewAt,
      climateChangeRelevant: plan.climateChangeRelevant,
      swotItems: planSwotItems,
      interestedPartyCount: metrics.interestedPartyCount,
      objectiveCount: metrics.objectiveCount,
      actions: planActions,
      riskOpportunityItems: planRiskOpportunityItems,
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

  const [
    swotItems,
    interestedParties,
    objectives,
    actions,
    riskOpportunityItems,
    revisions,
    reviewerRows,
  ] = await Promise.all([
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
        secondaryResponsibleUserId: strategicPlanActionsTable.secondaryResponsibleUserId,
        riskOpportunityItemId: strategicPlanActionsTable.riskOpportunityItemId,
        dueDate: strategicPlanActionsTable.dueDate,
        rescheduledDueDate: strategicPlanActionsTable.rescheduledDueDate,
        rescheduleReason: strategicPlanActionsTable.rescheduleReason,
        completedAt: strategicPlanActionsTable.completedAt,
        completionNotes: strategicPlanActionsTable.completionNotes,
        status: strategicPlanActionsTable.status,
        notes: strategicPlanActionsTable.notes,
        sortOrder: strategicPlanActionsTable.sortOrder,
        createdAt: strategicPlanActionsTable.createdAt,
        updatedAt: strategicPlanActionsTable.updatedAt,
      })
      .from(strategicPlanActionsTable)
      .where(eq(strategicPlanActionsTable.planId, planId))
      .orderBy(strategicPlanActionsTable.sortOrder, strategicPlanActionsTable.id),
    db
      .select()
      .from(strategicPlanRiskOpportunityItemsTable)
      .where(eq(strategicPlanRiskOpportunityItemsTable.planId, planId))
      .orderBy(
        strategicPlanRiskOpportunityItemsTable.updatedAt,
        strategicPlanRiskOpportunityItemsTable.id,
      ),
    db
      .select({
        id: strategicPlanRevisionsTable.id,
        planId: strategicPlanRevisionsTable.planId,
        reviewCycle: strategicPlanRevisionsTable.reviewCycle,
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
    db
      .select({
        id: strategicPlanReviewersTable.id,
        planId: strategicPlanReviewersTable.planId,
        userId: strategicPlanReviewersTable.userId,
        reviewCycle: strategicPlanReviewersTable.reviewCycle,
        status: strategicPlanReviewersTable.status,
        readAt: strategicPlanReviewersTable.readAt,
        decidedAt: strategicPlanReviewersTable.decidedAt,
        comment: strategicPlanReviewersTable.comment,
        createdAt: strategicPlanReviewersTable.createdAt,
        name: usersTable.name,
      })
      .from(strategicPlanReviewersTable)
      .innerJoin(usersTable, eq(strategicPlanReviewersTable.userId, usersTable.id))
      .where(eq(strategicPlanReviewersTable.planId, planId))
      .orderBy(desc(strategicPlanReviewersTable.reviewCycle), usersTable.name),
  ]);

  const actionIds = actions.map((action) => action.id);
  const riskOpportunityItemIds = riskOpportunityItems.map((item) => item.id);
  const effectivenessReviews =
    riskOpportunityItemIds.length === 0
      ? []
      : await db
          .select({
            id: strategicPlanRiskOpportunityEffectivenessReviewsTable.id,
            riskOpportunityItemId:
              strategicPlanRiskOpportunityEffectivenessReviewsTable.riskOpportunityItemId,
            reviewedById: strategicPlanRiskOpportunityEffectivenessReviewsTable.reviewedById,
            result: strategicPlanRiskOpportunityEffectivenessReviewsTable.result,
            comment: strategicPlanRiskOpportunityEffectivenessReviewsTable.comment,
            createdAt: strategicPlanRiskOpportunityEffectivenessReviewsTable.createdAt,
          })
          .from(strategicPlanRiskOpportunityEffectivenessReviewsTable)
          .where(
            inArray(
              strategicPlanRiskOpportunityEffectivenessReviewsTable.riskOpportunityItemId,
              riskOpportunityItemIds,
            ),
          );
  const governanceUserIds = uniqueNumbers(
    [
      ...actions.flatMap((action) => [
        action.responsibleUserId,
        action.secondaryResponsibleUserId,
      ]),
      ...riskOpportunityItems.flatMap((item) => [
        item.ownerUserId,
        item.coOwnerUserId,
      ]),
      ...effectivenessReviews.map((review) => review.reviewedById),
      ...(plan.reviewerIds || []),
    ].filter((value): value is number => typeof value === "number"),
  );
  const unitIds = uniqueNumbers(
    riskOpportunityItems
      .map((item) => item.unitId)
      .filter((value): value is number => typeof value === "number"),
  );
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
  const governanceUsers =
    governanceUserIds.length === 0
      ? []
      : await db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, governanceUserIds));
  const riskUnits =
    unitIds.length === 0
      ? []
      : await db
          .select({ id: unitsTable.id, name: unitsTable.name })
          .from(unitsTable)
          .where(inArray(unitsTable.id, unitIds));
  const governanceUsersMap = new Map(governanceUsers.map((user) => [user.id, user.name]));
  const riskUnitsMap = new Map(riskUnits.map((unit) => [unit.id, unit.name]));

  const actionsWithUnits = actions.map((action) => ({
    ...action,
    responsibleUserName: action.responsibleUserId
      ? governanceUsersMap.get(action.responsibleUserId) || null
      : null,
    secondaryResponsibleUserName: action.secondaryResponsibleUserId
      ? governanceUsersMap.get(action.secondaryResponsibleUserId) || null
      : null,
    dueDate: isoDate(action.dueDate),
    rescheduledDueDate: isoDate(action.rescheduledDueDate),
    completedAt: isoDate(action.completedAt),
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

  const effectivenessReviewsWithIso = effectivenessReviews.map((review) => ({
    ...review,
    reviewedByName: governanceUsersMap.get(review.reviewedById) || null,
    createdAt: isoDate(review.createdAt),
  }));

  const currentReviewCycle = reviewerRows[0]?.reviewCycle ?? null;
  const reviewersWithIso = reviewerRows.map((reviewer) => ({
    id: reviewer.id,
    planId: reviewer.planId,
    userId: reviewer.userId,
    name: reviewer.name,
    reviewCycle: reviewer.reviewCycle,
    status: reviewer.status,
    readAt: isoDate(reviewer.readAt),
    decidedAt: isoDate(reviewer.decidedAt),
    comment: reviewer.comment || null,
    createdAt: isoDate(reviewer.createdAt),
  }));

  const riskOpportunityItemsWithIso = riskOpportunityItems.map((item) => {
    const linkedActions = actionsWithUnits.filter(
      (action) => action.riskOpportunityItemId === item.id,
    );
    const itemReviews = effectivenessReviewsWithIso
      .filter((review) => review.riskOpportunityItemId === item.id)
      .sort((left, right) =>
        new Date(right.createdAt || 0).getTime() -
        new Date(left.createdAt || 0).getTime(),
      );
    const latestEffectivenessReview = itemReviews[0] || null;
    const derivedStatus = deriveRiskOpportunityStatus({
      storedStatus: item.status,
      likelihood: item.likelihood,
      impact: item.impact,
      responseStrategy: item.responseStrategy,
      actions: linkedActions,
      latestEffectivenessResult: latestEffectivenessReview?.result ?? null,
    });

    return {
      ...item,
      ownerUserName: item.ownerUserId
        ? governanceUsersMap.get(item.ownerUserId) || null
        : null,
      coOwnerUserName: item.coOwnerUserId
        ? governanceUsersMap.get(item.coOwnerUserId) || null
        : null,
      unitName: item.unitId ? riskUnitsMap.get(item.unitId) || null : null,
      nextReviewAt: isoDate(item.nextReviewAt),
      createdAt: isoDate(item.createdAt),
      updatedAt: isoDate(item.updatedAt),
      priority: buildRiskOpportunityPriority(item.score),
      status: derivedStatus,
      effectivenessReviews: itemReviews,
      latestEffectivenessReview,
      actions: linkedActions,
    };
  });

  const revisionsWithIso = revisions.map((item) => ({
    ...item,
    revisionDate: isoDate(item.revisionDate),
    createdAt: isoDate(item.createdAt),
    reviewers: reviewersWithIso.filter(
      (reviewer) => reviewer.reviewCycle === item.reviewCycle,
    ),
  }));

  const metrics = buildStrategicPlanMetrics({
    swotCount: swotItemsWithIso.length,
    interestedPartyCount: interestedPartiesWithIso.length,
    objectiveCount: objectivesWithIso.length,
    actions: actionsWithUnits,
    riskOpportunityItems: riskOpportunityItemsWithIso,
  });
  const complianceIssues = buildStrategicPlanComplianceIssues({
    status: plan.status,
    nextReviewAt: plan.nextReviewAt,
    climateChangeRelevant: plan.climateChangeRelevant,
    swotItems: swotItemsWithIso,
    interestedPartyCount: metrics.interestedPartyCount,
    objectiveCount: metrics.objectiveCount,
    actions: actionsWithUnits,
    riskOpportunityItems: riskOpportunityItemsWithIso,
  });

  return {
    ...plan,
    reviewerIds: plan.reviewerIds || [],
    currentReviewCycle,
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
    riskOpportunityItems: riskOpportunityItemsWithIso,
    reviewers:
      currentReviewCycle == null
        ? []
        : reviewersWithIso.filter(
            (reviewer) => reviewer.reviewCycle === currentReviewCycle,
          ),
    revisions: revisionsWithIso,
    metrics,
    complianceIssues,
  };
}

export async function createStrategicPlanEvidenceDocument({
  plan,
  approvedById,
  detail,
  executor = db,
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
  executor?: GovernanceMutationExecutor;
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
    "Riscos e oportunidades:",
    ...(detail?.riskOpportunityItems.map(
      (item) =>
        `${item.type} - ${item.title} | score=${item.score || "—"} | prioridade=${item.priority || "—"} | estrategia=${item.responseStrategy || "—"} | status=${item.status}`,
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
    [
      ...(detail?.actions || []).flatMap((action) => action.units.map((unit) => unit.id)),
      ...(detail?.riskOpportunityItems || [])
        .map((item) => item.unitId)
        .filter((value): value is number => typeof value === "number"),
    ],
  );

  const [document] = await executor
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
    await executor.insert(documentUnitsTable).values(
      impactedUnitIds.map((unitId) => ({
        documentId: document.id,
        unitId,
      })),
    );
  }

  await executor.insert(documentAttachmentsTable).values({
    documentId: document.id,
    versionNumber: 1,
    fileName: `planejamento-estrategico-revisao-${revisionNumber}.pdf`,
    fileSize: pdfBuffer.length,
    contentType: "application/pdf",
    objectPath,
    uploadedById: approvedById,
  });

  await executor.insert(documentVersionsTable).values({
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
  reviewCycle,
  reason,
  changeSummary,
  detail,
  executor = db,
}: {
  planId: number;
  approvedById: number;
  reviewCycle: number;
  reason?: string | null;
  changeSummary?: string | null;
  detail?: Awaited<ReturnType<typeof getStrategicPlanDetail>>;
  executor?: GovernanceMutationExecutor;
}) {
  const resolvedDetail = detail ?? await getStrategicPlanDetail(
    planId,
    (
      await executor
        .select({ organizationId: strategicPlansTable.organizationId })
        .from(strategicPlansTable)
        .where(eq(strategicPlansTable.id, planId))
    )[0]!.organizationId,
  );

  if (!resolvedDetail) {
    throw new Error("Strategic plan not found");
  }

  const evidenceDocumentId = await createStrategicPlanEvidenceDocument({
    plan: resolvedDetail,
    approvedById,
    detail: resolvedDetail,
    executor,
  });

  const revisionNumber = resolvedDetail.activeRevisionNumber + 1;
  const snapshot = {
    generatedAt: new Date().toISOString(),
    plan: resolvedDetail,
  };

  const [revision] = await executor
    .insert(strategicPlanRevisionsTable)
    .values({
      planId,
      reviewCycle,
      revisionNumber,
      reason: reason || resolvedDetail.reviewReason || null,
      changeSummary: changeSummary || null,
      approvedById,
      evidenceDocumentId,
      snapshot,
    })
    .returning();

  await executor
    .update(strategicPlansTable)
    .set({
      activeRevisionNumber: revisionNumber,
      approvedAt: new Date(),
      nextReviewAt: addMonths(new Date(), resolvedDetail.reviewFrequencyMonths || 12),
      reminderFlags: {},
    })
    .where(eq(strategicPlansTable.id, planId));

  return revision;
}

export async function getLatestStrategicPlanReviewCycle(planId: number) {
  const [reviewer] = await db
    .select({ reviewCycle: strategicPlanReviewersTable.reviewCycle })
    .from(strategicPlanReviewersTable)
    .where(eq(strategicPlanReviewersTable.planId, planId))
    .orderBy(desc(strategicPlanReviewersTable.reviewCycle))
    .limit(1);

  return reviewer?.reviewCycle ?? 0;
}

export function isEditableStatus(status: string): boolean {
  return status === "draft" || status === "rejected";
}
