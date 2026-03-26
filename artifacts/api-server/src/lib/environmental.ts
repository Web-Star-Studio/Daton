import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  db,
  laiaAssessmentsTable,
  laiaMonitoringPlansTable,
  notificationsTable,
  userModulePermissionsTable,
  usersTable,
  type LaiaMonitoringStatus,
  type LaiaReminderFlags,
} from "@workspace/db";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DRAFT_DAYS = 14;

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values));
}

async function notifyUsers(
  organizationId: number,
  userIds: number[],
  payload: {
    type: string;
    title: string;
    description: string;
    relatedEntityType: string;
    relatedEntityId: number;
  },
) {
  if (userIds.length === 0) return;

  await db.insert(notificationsTable).values(
    userIds.map((userId) => ({
      organizationId,
      userId,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      relatedEntityType: payload.relatedEntityType,
      relatedEntityId: payload.relatedEntityId,
    })),
  );
}

async function getEnvironmentalRecipientIds(organizationId: number): Promise<number[]> {
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.organizationId, organizationId),
        or(eq(usersTable.role, "org_admin"), eq(usersTable.role, "platform_admin")),
      ),
    );

  const environmentalUsers = await db
    .select({ id: userModulePermissionsTable.userId })
    .from(userModulePermissionsTable)
    .innerJoin(usersTable, eq(userModulePermissionsTable.userId, usersTable.id))
    .where(
      and(
        eq(usersTable.organizationId, organizationId),
        eq(userModulePermissionsTable.module, "environmental"),
      ),
    );

  return uniqueNumbers([
    ...admins.map((row) => row.id),
    ...environmentalUsers.map((row) => row.id),
  ]);
}

function shouldRemind(daysUntilDue: number, flags: LaiaReminderFlags, key: keyof LaiaReminderFlags) {
  if (key === "d30") return daysUntilDue <= 30 && !flags.d30;
  if (key === "d7") return daysUntilDue <= 7 && !flags.d7;
  if (key === "d0") return daysUntilDue <= 0 && !flags.d0;
  return false;
}

async function applyAssessmentMaintenance(
  assessment: {
    id: number;
    organizationId: number;
    aspectCode: string;
    status: string;
    nextReviewAt: Date | null;
    reviewReminderFlags: LaiaReminderFlags | null;
    controlRequired: string | null;
    controlResponsibleUserId: number | null;
    controlDueAt: Date | null;
    draftReminderSentAt: Date | null;
    updatedAt: Date;
  },
  recipientIds: number[],
) {
  const reminderFlags: LaiaReminderFlags = { ...(assessment.reviewReminderFlags || {}) };
  const now = Date.now();
  const updates: Partial<{
    reviewReminderFlags: LaiaReminderFlags;
    draftReminderSentAt: Date;
  }> = {};

  if (assessment.nextReviewAt) {
    const daysUntilDue = Math.ceil((assessment.nextReviewAt.getTime() - now) / DAY_MS);
    const notifications: Array<{ type: string; title: string; description: string }> = [];

    if (shouldRemind(daysUntilDue, reminderFlags, "d30")) {
      reminderFlags.d30 = true;
      notifications.push({
        type: "laia_review_due",
        title: "Revisão LAIA em 30 dias",
        description: `A avaliação ${assessment.aspectCode} precisa ser revisada em até 30 dias.`,
      });
    }
    if (shouldRemind(daysUntilDue, reminderFlags, "d7")) {
      reminderFlags.d7 = true;
      notifications.push({
        type: "laia_review_due",
        title: "Revisão LAIA em 7 dias",
        description: `A avaliação ${assessment.aspectCode} precisa ser revisada em até 7 dias.`,
      });
    }
    if (shouldRemind(daysUntilDue, reminderFlags, "d0")) {
      reminderFlags.d0 = true;
      notifications.push({
        type: "laia_review_overdue",
        title: "Revisão LAIA vencida",
        description: `A avaliação ${assessment.aspectCode} está com revisão vencida.`,
      });
    }

    if (
      reminderFlags.d30 !== assessment.reviewReminderFlags?.d30 ||
      reminderFlags.d7 !== assessment.reviewReminderFlags?.d7 ||
      reminderFlags.d0 !== assessment.reviewReminderFlags?.d0
    ) {
      updates.reviewReminderFlags = reminderFlags;
    }

    for (const notification of notifications) {
      await notifyUsers(assessment.organizationId, recipientIds, {
        ...notification,
        relatedEntityType: "laia_assessment",
        relatedEntityId: assessment.id,
      });
    }
  }

  if (
    assessment.status === "draft" &&
    !assessment.draftReminderSentAt &&
    now - assessment.updatedAt.getTime() >= STALE_DRAFT_DAYS * DAY_MS
  ) {
    updates.draftReminderSentAt = new Date();
    await notifyUsers(assessment.organizationId, recipientIds, {
      type: "laia_draft_stale",
      title: "Rascunho LAIA sem andamento",
      description: `A avaliação ${assessment.aspectCode} está em rascunho sem atualização recente.`,
      relatedEntityType: "laia_assessment",
      relatedEntityId: assessment.id,
    });
  }

  const hasPendingControl = Boolean(assessment.controlRequired?.trim()) || assessment.controlDueAt !== null;
  if (hasPendingControl && !assessment.controlResponsibleUserId && !reminderFlags.missingResponsible) {
    reminderFlags.missingResponsible = true;
    updates.reviewReminderFlags = reminderFlags;
    await notifyUsers(assessment.organizationId, recipientIds, {
      type: "laia_control_missing_owner",
      title: "Controle LAIA sem responsável",
      description: `A avaliação ${assessment.aspectCode} possui controle pendente sem responsável definido.`,
      relatedEntityType: "laia_assessment",
      relatedEntityId: assessment.id,
    });
  }

  if (Object.keys(updates).length === 0) return;

  await db
    .update(laiaAssessmentsTable)
    .set(updates)
    .where(eq(laiaAssessmentsTable.id, assessment.id));
}

async function applyMonitoringMaintenance(
  plan: {
    id: number;
    organizationId: number;
    title: string;
    status: string;
    nextDueAt: Date | null;
    reminderFlags: LaiaReminderFlags | null;
  },
  recipientIds: number[],
) {
  if (!plan.nextDueAt) return;

  const daysUntilDue = Math.ceil((plan.nextDueAt.getTime() - Date.now()) / DAY_MS);
  const reminderFlags: LaiaReminderFlags = { ...(plan.reminderFlags || {}) };
  const notifications: Array<{ type: string; title: string; description: string }> = [];
  let nextStatus: LaiaMonitoringStatus = plan.status as LaiaMonitoringStatus;

  if (shouldRemind(daysUntilDue, reminderFlags, "d7")) {
    reminderFlags.d7 = true;
    notifications.push({
      type: "laia_monitoring_due",
      title: "Monitoramento LAIA em 7 dias",
      description: `O plano de monitoramento "${plan.title}" vence em até 7 dias.`,
    });
  }

  if (shouldRemind(daysUntilDue, reminderFlags, "d0")) {
    reminderFlags.d0 = true;
    notifications.push({
      type: "laia_monitoring_overdue",
      title: "Monitoramento LAIA vencido",
      description: `O plano de monitoramento "${plan.title}" está vencido.`,
    });
    nextStatus = "overdue";
  }

  const shouldUpdate =
    nextStatus !== plan.status ||
    reminderFlags.d7 !== plan.reminderFlags?.d7 ||
    reminderFlags.d0 !== plan.reminderFlags?.d0;

  if (!shouldUpdate) return;

  await db
    .update(laiaMonitoringPlansTable)
    .set({
      status: nextStatus,
      reminderFlags,
    })
    .where(eq(laiaMonitoringPlansTable.id, plan.id));

  for (const notification of notifications) {
    await notifyUsers(plan.organizationId, recipientIds, {
      ...notification,
      relatedEntityType: "laia_monitoring_plan",
      relatedEntityId: plan.id,
    });
  }
}

export async function runEnvironmentalMaintenancePass(): Promise<void> {
  const [assessments, monitoringPlans] = await Promise.all([
    db
      .select({
        id: laiaAssessmentsTable.id,
        organizationId: laiaAssessmentsTable.organizationId,
        aspectCode: laiaAssessmentsTable.aspectCode,
        status: laiaAssessmentsTable.status,
        nextReviewAt: laiaAssessmentsTable.nextReviewAt,
        reviewReminderFlags: laiaAssessmentsTable.reviewReminderFlags,
        controlRequired: laiaAssessmentsTable.controlRequired,
        controlResponsibleUserId: laiaAssessmentsTable.controlResponsibleUserId,
        controlDueAt: laiaAssessmentsTable.controlDueAt,
        draftReminderSentAt: laiaAssessmentsTable.draftReminderSentAt,
        updatedAt: laiaAssessmentsTable.updatedAt,
      })
      .from(laiaAssessmentsTable)
      .where(
        or(
          and(
            inArray(laiaAssessmentsTable.status, ["active", "draft"]),
            isNotNull(laiaAssessmentsTable.nextReviewAt),
          ),
          eq(laiaAssessmentsTable.status, "draft"),
        ),
      ),
    db
      .select({
        id: laiaMonitoringPlansTable.id,
        organizationId: laiaMonitoringPlansTable.organizationId,
        title: laiaMonitoringPlansTable.title,
        status: laiaMonitoringPlansTable.status,
        nextDueAt: laiaMonitoringPlansTable.nextDueAt,
        reminderFlags: laiaMonitoringPlansTable.reminderFlags,
      })
      .from(laiaMonitoringPlansTable)
      .where(
        and(
          inArray(laiaMonitoringPlansTable.status, ["active", "overdue"]),
          isNotNull(laiaMonitoringPlansTable.nextDueAt),
        ),
      ),
  ]);

  const recipientsByOrganization = new Map<number, number[]>();

  for (const assessment of assessments) {
    let recipientIds = recipientsByOrganization.get(assessment.organizationId);
    if (!recipientIds) {
      recipientIds = await getEnvironmentalRecipientIds(assessment.organizationId);
      recipientsByOrganization.set(assessment.organizationId, recipientIds);
    }
    await applyAssessmentMaintenance(assessment, recipientIds);
  }

  for (const plan of monitoringPlans) {
    let recipientIds = recipientsByOrganization.get(plan.organizationId);
    if (!recipientIds) {
      recipientIds = await getEnvironmentalRecipientIds(plan.organizationId);
      recipientsByOrganization.set(plan.organizationId, recipientIds);
    }
    await applyMonitoringMaintenance(plan, recipientIds);
  }
}
