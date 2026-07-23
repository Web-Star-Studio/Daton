import { eq } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { getResendClient } from "../../lib/resend";

const RELATED_ENTITY_TYPE = "training_class";
const ROUTE = "/aprendizagem/turmas";

export interface ClassResponsibleNotifyTarget {
  classId: number;
  organizationId: number;
  trainingTitle: string;
  code: string | null;
  startDate: string | null;
  responsibleUserId: number | null;
}

/**
 * Notifica — in-app + e-mail — o RESPONSÁVEL PELA TURMA que acabou de ser
 * vinculado. O responsável é um por turma (treino online multi-filial).
 *
 * Best-effort, igual ao padrão dos planos de ação: nunca lança (não derruba o
 * create/update) e não pinga quem se auto-atribuiu. Quem chama já garante que
 * só dispara quando o responsável MUDOU.
 */
export async function notifyClassResponsibleAssignment(
  turma: ClassResponsibleNotifyTarget,
  actorUserId: number | null,
): Promise<void> {
  try {
    const recipientId = turma.responsibleUserId;
    if (!recipientId || recipientId === actorUserId) return;

    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, recipientId))
      .limit(1);
    if (!user) return;

    const ref = turma.code ? `${turma.code} — ` : "";
    const quando = turma.startDate ? ` Início: ${formatDateBR(turma.startDate)}.` : "";
    const title = `Você é responsável por uma turma: ${ref}${turma.trainingTitle}`;
    const description = `Você foi definido como responsável por esta turma.${quando} Abra Turmas para acompanhar a preparação, a presença e as notas.`;

    await db.insert(notificationsTable).values({
      organizationId: turma.organizationId,
      userId: user.id,
      type: "training_class_responsible_assigned",
      title,
      description,
      relatedEntityType: RELATED_ENTITY_TYPE,
      relatedEntityId: turma.classId,
    });

    try {
      await sendEmail({
        to: user.email,
        responsibleName: user.name,
        title,
        description,
      });
    } catch (err) {
      console.error("[turmas] falha ao enviar e-mail de responsável", err);
    }
  } catch (err) {
    console.error("[turmas] falha ao notificar responsável da turma", err);
  }
}

function formatDateBR(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

async function sendEmail({
  to,
  responsibleName,
  title,
  description,
}: {
  to: string;
  responsibleName: string;
  title: string;
  description: string;
}): Promise<void> {
  const { client, fromEmail } = await getResendClient();
  const appUrl = process.env.APP_BASE_URL ?? "";
  const link = appUrl ? `${appUrl.replace(/\/$/, "")}${ROUTE}` : "";

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
          ? `<p style="margin: 16px 0;"><a href="${link}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Abrir Turmas</a></p>`
          : ""}
        <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
          Mensagem automática do Daton. Você está recebendo este aviso porque foi definido como responsável por uma turma.
        </p>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
