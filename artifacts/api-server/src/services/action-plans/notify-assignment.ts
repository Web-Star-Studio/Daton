import { eq } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { getResendClient } from "../../lib/resend";

const NOTIFICATION_TYPE = "action_plan_assigned";
const RELATED_ENTITY_TYPE = "action_plan";

export interface ActionPlanAssignmentTarget {
  id: number;
  organizationId: number;
  code: string | null;
  title: string;
  dueDate: Date | null;
  responsibleUserId: number | null;
}

/**
 * Notify the responsible user — in-app + e-mail — that an action plan was just
 * assigned (or re-assigned) to them. Best-effort and self-contained: it never
 * throws, so it can't break the create/update request. Skips when there is no
 * assignee or when the actor assigned the action to themselves (no point pinging
 * yourself). Mirrors the overdue-escalation pass in ./escalation.ts.
 */
export async function notifyActionPlanAssignment(
  plan: ActionPlanAssignmentTarget,
  actorUserId: number | null,
): Promise<void> {
  try {
    const assignee = plan.responsibleUserId;
    if (!assignee || assignee === actorUserId) return;

    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, assignee))
      .limit(1);
    if (!user) return;

    const ref = plan.code ? `${plan.code} — ` : "";
    const title = `Ação atribuída a você: ${ref}${plan.title}`;
    const due = plan.dueDate ? ` Prazo: ${formatDateBR(plan.dueDate)}.` : "";
    const description = `Você foi definido como responsável por esta ação.${due} Abra a ação para registrar o andamento e concluí-la.`;

    await db.insert(notificationsTable).values({
      organizationId: plan.organizationId,
      userId: user.id,
      type: NOTIFICATION_TYPE,
      title,
      description,
      relatedEntityType: RELATED_ENTITY_TYPE,
      relatedEntityId: plan.id,
    });

    try {
      await sendAssignmentEmail({ to: user.email, responsibleName: user.name, title, description, planId: plan.id });
    } catch (err) {
      console.error("[action-plans] failed to send assignment e-mail", err);
    }
  } catch (err) {
    console.error("[action-plans] failed to create assignment notification", err);
  }
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

async function sendAssignmentEmail({
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
          Mensagem automática do Daton. Você está recebendo este aviso porque foi definido como responsável por esta ação.
        </p>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
