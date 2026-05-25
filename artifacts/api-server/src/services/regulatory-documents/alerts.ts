import { and, eq, gte, isNotNull } from "drizzle-orm";
import {
  db,
  notificationsTable,
  regulatoryDocumentsTable,
  usersTable,
} from "@workspace/db";
import { getResendClient } from "../../lib/resend";
import { computeStatus, daysUntilExpiration, type RegulatoryDocumentStatus } from "./status";

const NOTIFICATION_TYPE_BY_STATUS: Record<Exclude<RegulatoryDocumentStatus, "vigente">, string> = {
  a_vencer: "regulatory_document_expiring",
  vencido: "regulatory_document_expired",
};

const RELATED_ENTITY_TYPE = "regulatory_document";

const IDENTIFIER_TYPE_LABELS: Record<string, string> = {
  licenca_ambiental: "Licença Ambiental",
  avcb: "AVCB",
  alvara: "Alvará",
  outorga: "Outorga",
  certidao: "Certidão",
  outro: "Documento regulatório",
};

export interface RegulatoryAlertsPassResult {
  scanned: number;
  statusChanged: number;
  alertsCreated: number;
  emailsSent: number;
}

// Concurrency for cross-org parallelization. Each batch processes N orgs in
// parallel; docs inside an org are still iterated sequentially so the user
// lookup cache stays race-free.
const DEFAULT_ORG_CONCURRENCY = 5;

/**
 * Scan regulatory documents, persist status transitions, and dispatch alerts
 * (in-app + e-mail) to the responsible user when the doc is `a_vencer` or
 * `vencido`. Idempotent for the same day via per-day dedupe on the
 * notifications table.
 *
 * Responsável is always a user (with login account) — see memory
 * `responsavel-must-be-user`. That means we no longer need to bridge from
 * employees.email to users.email like the older calibration module does.
 *
 * If `orgId` is provided, the scan is restricted to that organization;
 * otherwise it sweeps every org (used by the boot-time scheduler).
 */
export async function runRegulatoryDocumentAlertsPass(
  orgId?: number,
): Promise<RegulatoryAlertsPassResult> {
  const result: RegulatoryAlertsPassResult = {
    scanned: 0,
    statusChanged: 0,
    alertsCreated: 0,
    emailsSent: 0,
  };

  const conditions = [isNotNull(regulatoryDocumentsTable.expirationDate)];
  if (typeof orgId === "number") {
    conditions.push(eq(regulatoryDocumentsTable.organizationId, orgId));
  }

  const docs = await db
    .select()
    .from(regulatoryDocumentsTable)
    .where(and(...conditions));

  result.scanned = docs.length;
  if (docs.length === 0) return result;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Group docs by org so we can fan out across orgs without sharing the per-org
  // user cache (which would race if multiple orgs ran in the same worker).
  const docsByOrg = new Map<number, typeof docs>();
  for (const doc of docs) {
    let bucket = docsByOrg.get(doc.organizationId);
    if (!bucket) {
      bucket = [];
      docsByOrg.set(doc.organizationId, bucket);
    }
    bucket.push(doc);
  }

  const orgIds = Array.from(docsByOrg.keys());
  const concurrency = Math.max(1, Number(process.env.REGULATORY_ALERTS_ORG_CONCURRENCY) || DEFAULT_ORG_CONCURRENCY);

  for (let i = 0; i < orgIds.length; i += concurrency) {
    const batch = orgIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((id) => processOrg(docsByOrg.get(id)!, todayStart)),
    );
    for (const r of batchResults) {
      result.statusChanged += r.statusChanged;
      result.alertsCreated += r.alertsCreated;
      result.emailsSent += r.emailsSent;
    }
  }

  return result;
}

async function processOrg(
  docs: Array<typeof regulatoryDocumentsTable.$inferSelect>,
  todayStart: Date,
): Promise<{ statusChanged: number; alertsCreated: number; emailsSent: number }> {
  const result = { statusChanged: 0, alertsCreated: 0, emailsSent: 0 };

  // Per-org cache for user lookups. Lives only for this org's sequential pass.
  const userCache = new Map<number, { id: number; name: string; email: string } | null>();

  for (const doc of docs) {
    const newStatus = computeStatus(doc.expirationDate, doc.alertDaysOverride);

    if (newStatus !== doc.status) {
      await db
        .update(regulatoryDocumentsTable)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(regulatoryDocumentsTable.id, doc.id));
      result.statusChanged += 1;
    }

    // Only alert for non-vigente. Skip if no responsável (nobody to notify).
    if (newStatus === "vigente") continue;
    if (!doc.responsibleUserId) continue;

    // Resolve responsável user (cached per-org pass).
    let user = userCache.get(doc.responsibleUserId);
    if (user === undefined) {
      const [u] = await db
        .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, doc.responsibleUserId))
        .limit(1);
      user = u ?? null;
      userCache.set(doc.responsibleUserId, user);
    }
    if (!user) continue;

    const notificationType = NOTIFICATION_TYPE_BY_STATUS[newStatus];
    const daysLeft = daysUntilExpiration(doc.expirationDate);
    const label = IDENTIFIER_TYPE_LABELS[doc.identifierType] ?? "Documento regulatório";
    const number = doc.documentNumber ? ` ${doc.documentNumber}` : "";
    const title = newStatus === "vencido"
      ? `${label}${number} vencido`
      : `${label}${number} vence em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}`;
    const description = newStatus === "vencido"
      ? `Documento regulatório expirado em ${formatDateBR(doc.expirationDate)}. Inicie o processo de renovação.`
      : `Documento regulatório expira em ${formatDateBR(doc.expirationDate)} (${daysLeft} dia${daysLeft === 1 ? "" : "s"}).`;

    // Dedupe within today (same doc + user + type).
    const [existing] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.organizationId, doc.organizationId),
          eq(notificationsTable.userId, user.id),
          eq(notificationsTable.relatedEntityType, RELATED_ENTITY_TYPE),
          eq(notificationsTable.relatedEntityId, doc.id),
          eq(notificationsTable.type, notificationType),
          gte(notificationsTable.createdAt, todayStart),
        ),
      )
      .limit(1);

    if (existing) continue;

    await db.insert(notificationsTable).values({
      organizationId: doc.organizationId,
      userId: user.id,
      type: notificationType,
      title,
      description,
      relatedEntityType: RELATED_ENTITY_TYPE,
      relatedEntityId: doc.id,
    });
    result.alertsCreated += 1;

    // E-mail in lockstep with in-app — same dedupe behaviour.
    try {
      await sendExpiryEmail({
        to: user.email,
        responsibleName: user.name,
        title,
        description,
      });
      result.emailsSent += 1;
    } catch (err) {
      console.error("[regulatory-docs] failed to send alert e-mail", err);
    }
  }

  return result;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function sendExpiryEmail({
  to,
  responsibleName,
  title,
  description,
}: {
  to: string;
  responsibleName: string;
  title: string;
  description: string;
}) {
  const { client, fromEmail } = await getResendClient();
  const appUrl = process.env.APP_BASE_URL ?? "";
  const link = appUrl ? `${appUrl.replace(/\/$/, "")}/qualidade/regulatorios` : "";

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
          ? `<p style="margin: 16px 0;"><a href="${link}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Abrir Documentos Regulatórios</a></p>`
          : ""}
        <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
          Mensagem automática do Daton. Você está recebendo este alerta porque é o responsável por este documento regulatório.
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
