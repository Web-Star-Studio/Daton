import { and, eq, gte, isNotNull, lt, notInArray } from "drizzle-orm";
import { actionPlansTable, db, notificationsTable, usersTable } from "@workspace/db";
import { getResendClient } from "../../lib/resend";
import { logActionPlanActivity } from "./activity";

const NOTIFICATION_TYPE = "action_plan_overdue";
const RELATED_ENTITY_TYPE = "action_plan";
const DEFAULT_ORG_CONCURRENCY = 5;

export interface ActionPlanEscalationResult {
  scanned: number;
  alertsCreated: number;
  emailsSent: number;
}

/**
 * Scan for overdue action plans (status not completed/cancelled, dueDate in the
 * past) and escalate to the responsible user via in-app notification + e-mail.
 * Idempotent for the same day via per-day dedupe on the notifications table, so
 * the boot warmup + cron tick won't double-alert. Mirrors the regulatory-docs
 * alerts pass.
 *
 * If `orgId` is provided the scan is restricted to that org; otherwise it sweeps
 * every org (used by the scheduler).
 */
export async function runActionPlanEscalationPass(orgId?: number): Promise<ActionPlanEscalationResult> {
  const result: ActionPlanEscalationResult = { scanned: 0, alertsCreated: 0, emailsSent: 0 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const conditions = [
    isNotNull(actionPlansTable.dueDate),
    lt(actionPlansTable.dueDate, todayStart),
    notInArray(actionPlansTable.status, ["completed", "cancelled"]),
    isNotNull(actionPlansTable.responsibleUserId),
  ];
  if (typeof orgId === "number") conditions.push(eq(actionPlansTable.organizationId, orgId));

  const plans = await db
    .select({
      id: actionPlansTable.id,
      organizationId: actionPlansTable.organizationId,
      code: actionPlansTable.code,
      title: actionPlansTable.title,
      dueDate: actionPlansTable.dueDate,
      responsibleUserId: actionPlansTable.responsibleUserId,
    })
    .from(actionPlansTable)
    .where(and(...conditions));

  result.scanned = plans.length;
  if (plans.length === 0) return result;

  const plansByOrg = new Map<number, typeof plans>();
  for (const p of plans) {
    let bucket = plansByOrg.get(p.organizationId);
    if (!bucket) { bucket = []; plansByOrg.set(p.organizationId, bucket); }
    bucket.push(p);
  }

  const orgIds = Array.from(plansByOrg.keys());
  const concurrency = Math.max(1, Number(process.env.ACTION_PLAN_ESCALATION_ORG_CONCURRENCY) || DEFAULT_ORG_CONCURRENCY);

  for (let i = 0; i < orgIds.length; i += concurrency) {
    const batch = orgIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((id) => processOrg(plansByOrg.get(id)!, todayStart)));
    for (const r of batchResults) {
      result.alertsCreated += r.alertsCreated;
      result.emailsSent += r.emailsSent;
    }
  }

  return result;
}

type PlanRow = {
  id: number;
  organizationId: number;
  code: string | null;
  title: string;
  dueDate: Date | null;
  responsibleUserId: number | null;
};

async function processOrg(plans: PlanRow[], todayStart: Date): Promise<{ alertsCreated: number; emailsSent: number }> {
  const result = { alertsCreated: 0, emailsSent: 0 };
  const userCache = new Map<number, { id: number; name: string; email: string } | null>();

  for (const plan of plans) {
    if (!plan.responsibleUserId || !plan.dueDate) continue;

    let user = userCache.get(plan.responsibleUserId);
    if (user === undefined) {
      const [u] = await db
        .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, plan.responsibleUserId))
        .limit(1);
      user = u ?? null;
      userCache.set(plan.responsibleUserId, user);
    }
    if (!user) continue;

    const daysOverdue = Math.max(1, Math.floor((todayStart.getTime() - plan.dueDate.getTime()) / 86_400_000));
    const ref = plan.code ? `${plan.code} — ` : "";
    const title = `Ação vencida: ${ref}${plan.title}`;
    const description = `Prazo expirado em ${formatDateBR(plan.dueDate)} (há ${daysOverdue} dia${daysOverdue === 1 ? "" : "s"}). Atualize o andamento ou conclua a ação.`;

    // Dedupe within today (same plan + user + type).
    const [existing] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.organizationId, plan.organizationId),
          eq(notificationsTable.userId, user.id),
          eq(notificationsTable.relatedEntityType, RELATED_ENTITY_TYPE),
          eq(notificationsTable.relatedEntityId, plan.id),
          eq(notificationsTable.type, NOTIFICATION_TYPE),
          gte(notificationsTable.createdAt, todayStart),
        ),
      )
      .limit(1);
    if (existing) continue;

    await db.insert(notificationsTable).values({
      organizationId: plan.organizationId,
      userId: user.id,
      type: NOTIFICATION_TYPE,
      title,
      description,
      relatedEntityType: RELATED_ENTITY_TYPE,
      relatedEntityId: plan.id,
    });
    result.alertsCreated += 1;

    // Record the escalation in the action's audit trail (once per day, tied to dedupe).
    await logActionPlanActivity({
      orgId: plan.organizationId,
      actionPlanId: plan.id,
      action: "escalated",
      userId: null,
      userName: "Sistema",
      changes: { kind: "note", message: `Escalonamento automático — ${daysOverdue} dia(s) de atraso. Notificado: ${user.name}.` },
    });

    try {
      await sendOverdueEmail({ to: user.email, responsibleName: user.name, title, description, planId: plan.id });
      result.emailsSent += 1;
    } catch (err) {
      console.error("[action-plans] failed to send escalation e-mail", err);
    }
  }

  return result;
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

async function sendOverdueEmail({
  to,
  responsibleName,
  title,
  description,
  planId,
}: {
  to: string;
  responsibleName: string;
  title: string;
  description: string;
  planId: number;
}) {
  const { client, fromEmail } = await getResendClient();
  const appUrl = process.env.APP_BASE_URL ?? "";
  const link = appUrl ? `${appUrl.replace(/\/$/, "")}/planos-acao/${planId}` : "";

  await client.emails.send({
    from: fromEmail,
    to,
    subject: `[Daton] ${title}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; max-width: 560px;">
        <h2 style="font-size: 18px; margin: 0 0 12px;">${escapeHtml(title)}</h2>
        <p style="margin: 0 0 12px;">Olá ${escapeHtml(responsibleName)},</p>
        <p style="margin: 0 0 16px;">${escapeHtml(description)}</p>
        ${link
          ? `<p style="margin: 16px 0;"><a href="${link}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Abrir a ação</a></p>`
          : ""}
        <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
          Mensagem automática do Daton. Você está recebendo este alerta porque é o responsável por esta ação.
        </p>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
