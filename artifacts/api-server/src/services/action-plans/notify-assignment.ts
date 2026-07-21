import { eq } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { getResendClient } from "../../lib/resend";

const RELATED_ENTITY_TYPE = "action_plan";

export interface ActionPlanNotifyTarget {
  id: number;
  organizationId: number;
  code: string | null;
  title: string;
  dueDate: Date | null;
  responsibleUserId: number | null;
  effectivenessEvaluatorUserId?: number | null;
  effectivenessDueDate?: Date | null;
}

/**
 * Notify the responsible user — in-app + e-mail — that an action plan was just
 * assigned (or re-assigned) to them. See {@link deliverAssignment} for the
 * resilience contract.
 */
export async function notifyActionPlanAssignment(
  plan: ActionPlanNotifyTarget,
  actorUserId: number | null,
): Promise<void> {
  const ref = plan.code ? `${plan.code} — ` : "";
  const due = plan.dueDate ? ` Prazo: ${formatDateBR(plan.dueDate)}.` : "";
  await deliverAssignment({
    orgId: plan.organizationId,
    planId: plan.id,
    recipientUserId: plan.responsibleUserId ?? null,
    actorUserId,
    type: "action_plan_assigned",
    title: `Ação atribuída a você: ${ref}${plan.title}`,
    description: `Você foi definido como responsável por esta ação.${due} Abra a ação para registrar o andamento e concluí-la.`,
    reason: "foi definido como responsável por esta ação",
  });
}

/**
 * Notify the effectiveness evaluator — in-app + e-mail — that they were just
 * designated (or re-designated) to confirm the effectiveness of an action.
 */
export async function notifyActionPlanEvaluatorAssignment(
  plan: ActionPlanNotifyTarget,
  actorUserId: number | null,
): Promise<void> {
  const ref = plan.code ? `${plan.code} — ` : "";
  const due = plan.effectivenessDueDate ? ` Prazo de verificação: ${formatDateBR(plan.effectivenessDueDate)}.` : "";
  await deliverAssignment({
    orgId: plan.organizationId,
    planId: plan.id,
    recipientUserId: plan.effectivenessEvaluatorUserId ?? null,
    actorUserId,
    type: "action_plan_evaluator_assigned",
    title: `Avaliação de eficácia atribuída a você: ${ref}${plan.title}`,
    description: `Você foi definido como avaliador da eficácia desta ação.${due} Abra a ação para registrar o comparativo antes×depois e emitir o veredito (Eficaz / Não eficaz).`,
    reason: "foi definido como avaliador da eficácia desta ação",
  });
}

/**
 * Notify the responsible user — in-app + e-mail — that an individual AÇÃO
 * (5W2H row) of the plan was just assigned (or re-assigned) to them. Distinct
 * from {@link notifyActionPlanAssignment}, which is about the plan's own
 * responsible — a plan and its actions can have different people assigned.
 */
export async function notifyActionPlanActionAssignment(
  plan: ActionPlanNotifyTarget,
  action: { id: number; what: string | null; responsibleUserId: number | null; dueDate: Date | null },
  actorUserId: number,
): Promise<void> {
  if (action.responsibleUserId == null) return;
  if (action.responsibleUserId === actorUserId) return;

  const ref = plan.code ? `${plan.code} — ` : "";
  const what = action.what?.trim() ? action.what.trim() : plan.title;
  const due = action.dueDate ? ` Prazo: ${formatDateBR(action.dueDate)}.` : "";
  await deliverAssignment({
    orgId: plan.organizationId,
    planId: plan.id,
    recipientUserId: action.responsibleUserId,
    actorUserId,
    type: "action_plan_action_assigned",
    title: `Ação atribuída a você: ${ref}${what}`,
    description: `Você foi definido como responsável por esta ação do plano.${due} Abra o plano para registrar o andamento e concluí-la.`,
    reason: "foi definido como responsável por uma ação deste plano",
  });
}

/**
 * Notifica UM co-responsável — in-app + e-mail — de que foi vinculado ao plano.
 * Um plano tem N co-responsáveis; quem chama itera sobre eles. O texto é distinto
 * do ponto focal de propósito: quem lê precisa saber em que qualidade foi chamado.
 */
export async function notifyActionPlanCoResponsibleAssignment(
  plan: ActionPlanNotifyTarget,
  recipientUserId: number,
  actorUserId: number | null,
): Promise<void> {
  const ref = plan.code ? `${plan.code} — ` : "";
  const due = plan.dueDate ? ` Prazo: ${formatDateBR(plan.dueDate)}.` : "";
  await deliverAssignment({
    orgId: plan.organizationId,
    planId: plan.id,
    recipientUserId,
    actorUserId,
    type: "action_plan_assigned",
    title: `Você foi vinculado a uma ação: ${ref}${plan.title}`,
    description: `Você foi definido como co-responsável por esta ação.${due} Abra a ação para acompanhar e registrar o andamento.`,
    reason: "foi definido como co-responsável por esta ação",
  });
}

/**
 * Shared delivery core. Best-effort and self-contained: it never throws, so it
 * can't break the create/update request. Skips when there is no recipient or
 * when the actor assigned the work to themselves (no point pinging yourself).
 * Mirrors the overdue-escalation pass in ./escalation.ts.
 */
async function deliverAssignment({
  orgId,
  planId,
  recipientUserId,
  actorUserId,
  type,
  title,
  description,
  reason,
}: {
  orgId: number;
  planId: number;
  recipientUserId: number | null;
  actorUserId: number | null;
  type: string;
  title: string;
  description: string;
  reason: string;
}): Promise<void> {
  try {
    if (!recipientUserId || recipientUserId === actorUserId) return;

    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, recipientUserId))
      .limit(1);
    if (!user) return;

    await db.insert(notificationsTable).values({
      organizationId: orgId,
      userId: user.id,
      type,
      title,
      description,
      relatedEntityType: RELATED_ENTITY_TYPE,
      relatedEntityId: planId,
    });

    try {
      await sendAssignmentEmail({ to: user.email, responsibleName: user.name, title, description, planId, reason });
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
  reason,
}: {
  to: string;
  responsibleName: string;
  title: string;
  description: string;
  planId: number;
  reason: string;
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
          Mensagem automática do Daton. Você está recebendo este aviso porque ${escapeHtml(reason)}.
        </p>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
