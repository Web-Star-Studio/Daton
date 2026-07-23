/**
 * Escalonamento de prazo de regularização de gap (Fase 2) — espelha
 * services/action-plans/escalation.ts. Varre `employee_gap_deadlines`
 * vencidos e ainda não resolvidos, CONFIRMA que o gap continua aberto
 * agora (recompõe a conformidade com o mesmo motor do GET
 * .../employees/:empId, self-healing eager) e escala para os org_admin da
 * organização via notificação in-app + e-mail.
 *
 * Um único envio por (colaborador, admin, dia) — não por requisito — para
 * não inundar o admin quando um colaborador acumula vários gaps; a
 * descrição lista todos os requisitos vencidos daquele colaborador.
 *
 * Mesma regra de confirmação do achado do revisor na Fase 1 (PR #201):
 * nunca escala (nem resolve) por ambiguidade. Se o cargo do colaborador
 * não casar por nome nesta leitura (positionMatched=false — ex.: cargo
 * renomeado), o colaborador é pulado nesta rodada: sem aviso falso, sem
 * resolver um prazo real por engano.
 */
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  db,
  employeeGapDeadlinesTable,
  employeesTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { getResendClient } from "../../lib/resend";
import {
  buildCompetencyKey,
  resolveEmployeeCompetencies,
} from "./competency-resolver";
import { compareEducation } from "./education-conformance";
import {
  buildGapRequirementKey,
  resolveGapDeadlinesForEmployee,
} from "./gap-deadlines";

const NOTIFICATION_TYPE = "employee_gap_overdue";
const RELATED_ENTITY_TYPE = "employee_gap";
const DEFAULT_ORG_CONCURRENCY = 5;
const SCHEDULER_TIMEZONE = process.env.SCHEDULER_TIMEZONE ?? "America/Sao_Paulo";

/**
 * Meia-noite de "hoje" NO FUSO DO AGENDADOR (America/Sao_Paulo por padrão),
 * não no fuso do processo Node — que em produção normalmente é UTC. Achado
 * do revisor: usar `new Date().setHours(0,0,0,0)` (fuso do processo) faz o
 * boot warmup — que roda a qualquer hora, no deploy — tratar um prazo que
 * ainda não venceu no horário local como já vencido perto da meia-noite em
 * São Paulo, e estreita a janela de dedupe do dia pelo mesmo motivo.
 */
function todayBoundaryInSchedulerTimezone(): { todayIso: string; todayStart: Date } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);

  // Os campos formatados no fuso-alvo, tratados como se fossem UTC — dá pra
  // calcular o offset comparando com o instante real (`now`), e esse offset
  // já reflete horário de verão se algum dia existir de novo.
  const nowAsIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = now.getTime() - nowAsIfUtc;

  const y = get("year");
  const m = get("month");
  const d = get("day");
  const midnightAsIfUtc = Date.UTC(y, m - 1, d, 0, 0, 0);

  return {
    todayIso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    todayStart: new Date(midnightAsIfUtc + offsetMs),
  };
}

export interface GapDeadlineEscalationResult {
  scanned: number;
  alertsCreated: number;
  emailsSent: number;
}

interface OverdueDetail {
  requirementType: "education" | "competency";
  requirementKey: string;
  label: string;
  dueDate: string;
}

type EmployeeRow = {
  id: number;
  organizationId: number;
  name: string;
  position: string | null;
  education: string | null;
};

export async function runGapDeadlineEscalationPass(
  orgId?: number,
): Promise<GapDeadlineEscalationResult> {
  const result: GapDeadlineEscalationResult = {
    scanned: 0,
    alertsCreated: 0,
    emailsSent: 0,
  };

  const { todayIso, todayStart } = todayBoundaryInSchedulerTimezone();

  const conditions = [
    lt(employeeGapDeadlinesTable.dueDate, todayIso),
    isNull(employeeGapDeadlinesTable.resolvedAt),
    or(
      isNull(employeeGapDeadlinesTable.lastNotifiedOverdueAt),
      lt(employeeGapDeadlinesTable.lastNotifiedOverdueAt, todayStart),
    ),
  ];
  if (typeof orgId === "number") {
    conditions.push(eq(employeeGapDeadlinesTable.organizationId, orgId));
  }

  const candidates = await db
    .select()
    .from(employeeGapDeadlinesTable)
    .where(and(...conditions));
  if (candidates.length === 0) return result;

  const employeeIds = [...new Set(candidates.map((c) => c.employeeId))];
  const employeeRows: EmployeeRow[] = await db
    .select({
      id: employeesTable.id,
      organizationId: employeesTable.organizationId,
      name: employeesTable.name,
      position: employeesTable.position,
      education: employeesTable.education,
    })
    .from(employeesTable)
    .where(inArray(employeesTable.id, employeeIds));

  const employeesByOrg = new Map<number, EmployeeRow[]>();
  for (const e of employeeRows) {
    const bucket = employeesByOrg.get(e.organizationId) ?? [];
    bucket.push(e);
    employeesByOrg.set(e.organizationId, bucket);
  }

  const overdueDetailsByEmployee = new Map<number, OverdueDetail[]>();
  const orgIdsWithCandidates = [...employeesByOrg.keys()];
  const concurrency = Math.max(
    1,
    Number(process.env.GAP_DEADLINE_ESCALATION_ORG_CONCURRENCY) ||
      DEFAULT_ORG_CONCURRENCY,
  );

  for (let i = 0; i < orgIdsWithCandidates.length; i += concurrency) {
    const batch = orgIdsWithCandidates.slice(i, i + concurrency);
    await Promise.all(
      batch.map((orgIdKey) =>
        processOrgEmployees(
          orgIdKey,
          employeesByOrg.get(orgIdKey)!,
          candidates,
          overdueDetailsByEmployee,
        ),
      ),
    );
  }

  result.scanned = [...overdueDetailsByEmployee.values()].reduce(
    (n, d) => n + d.length,
    0,
  );
  if (overdueDetailsByEmployee.size === 0) return result;

  const orgIdsToNotify = [
    ...new Set(
      [...overdueDetailsByEmployee.keys()].map(
        (empId) => employeeRows.find((e) => e.id === empId)!.organizationId,
      ),
    ),
  ];
  const admins = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      organizationId: usersTable.organizationId,
    })
    .from(usersTable)
    .where(
      and(
        inArray(usersTable.organizationId, orgIdsToNotify),
        eq(usersTable.role, "org_admin"),
      ),
    );
  const adminsByOrg = new Map<number, typeof admins>();
  for (const a of admins) {
    const bucket = adminsByOrg.get(a.organizationId) ?? [];
    bucket.push(a);
    adminsByOrg.set(a.organizationId, bucket);
  }

  const employeeById = new Map(employeeRows.map((e) => [e.id, e]));
  const notifiedDeadlineIds = new Set<number>();

  for (const [employeeId, details] of overdueDetailsByEmployee) {
    const emp = employeeById.get(employeeId)!;
    const recipients = adminsByOrg.get(emp.organizationId) ?? [];

    const labels = details.map((d) => d.label);
    const title = `Gap de requisito vencido: ${emp.name}`;
    const description =
      details.length === 1
        ? `${emp.name} continua sem atender "${labels[0]}" — prazo vencido em ${formatDateBR(details[0].dueDate)}.`
        : `${emp.name} continua sem atender ${details.length} requisitos do cargo (${labels.join(", ")}) — prazos vencidos.`;

    for (const admin of recipients) {
      // Achado do revisor: check-then-insert puro é sujeito a corrida (duas
      // instâncias da passada rodando ao mesmo tempo poderiam ambas passar
      // no SELECT antes de qualquer uma inserir). O advisory lock (escopo da
      // transação) serializa tentativas para a MESMA tripla
      // (colaborador, admin, tipo) — mesmo padrão já usado no upsert de
      // evidência de competência (routes/employees.ts).
      const dedupeKey = `${employeeId}:${admin.id}:${NOTIFICATION_TYPE}`;
      const created = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(${emp.organizationId}, hashtext(${dedupeKey}))`,
        );

        const [existing] = await tx
          .select({ id: notificationsTable.id })
          .from(notificationsTable)
          .where(
            and(
              eq(notificationsTable.organizationId, emp.organizationId),
              eq(notificationsTable.userId, admin.id),
              eq(notificationsTable.relatedEntityType, RELATED_ENTITY_TYPE),
              eq(notificationsTable.relatedEntityId, employeeId),
              eq(notificationsTable.type, NOTIFICATION_TYPE),
              gte(notificationsTable.createdAt, todayStart),
            ),
          )
          .limit(1);
        if (existing) return false;

        await tx.insert(notificationsTable).values({
          organizationId: emp.organizationId,
          userId: admin.id,
          type: NOTIFICATION_TYPE,
          title,
          description,
          relatedEntityType: RELATED_ENTITY_TYPE,
          relatedEntityId: employeeId,
        });
        return true;
      });
      if (!created) continue;
      result.alertsCreated += 1;

      try {
        await sendOverdueEmail({
          to: admin.email,
          adminName: admin.name,
          title,
          description,
          employeeId,
        });
        result.emailsSent += 1;
      } catch (err) {
        console.error(
          "[aprendizagem] failed to send gap-deadline escalation e-mail",
          err,
        );
      }
    }

    for (const d of details) {
      const cand = candidates.find(
        (c) =>
          c.employeeId === employeeId &&
          c.requirementType === d.requirementType &&
          c.requirementKey === d.requirementKey,
      );
      if (cand) notifiedDeadlineIds.add(cand.id);
    }
  }

  if (notifiedDeadlineIds.size > 0) {
    await db
      .update(employeeGapDeadlinesTable)
      .set({ lastNotifiedOverdueAt: new Date() })
      .where(inArray(employeeGapDeadlinesTable.id, [...notifiedDeadlineIds]));
  }

  return result;
}

/**
 * Recompõe a conformidade dos colaboradores de UMA org e, pra cada um:
 * self-heala os prazos abertos (mesma regra do GET da ficha) e — se o
 * cargo casou por nome — coleta os detalhes do que continua vencido E
 * ainda em aberto, para a fase de notificação usar depois.
 */
async function processOrgEmployees(
  orgIdKey: number,
  orgEmployees: EmployeeRow[],
  candidates: (typeof employeeGapDeadlinesTable.$inferSelect)[],
  overdueDetailsByEmployee: Map<number, OverdueDetail[]>,
): Promise<void> {
  const conformanceMap = await resolveEmployeeCompetencies(
    db,
    orgIdKey,
    orgEmployees.map((e) => ({ id: e.id, position: e.position })),
  );

  for (const emp of orgEmployees) {
    const conf = conformanceMap.get(emp.id) ?? null;
    const positionMatched = conf !== null && conf.positionName !== null;
    if (!positionMatched) continue;

    const empCandidates = candidates.filter((c) => c.employeeId === emp.id);
    const details: OverdueDetail[] = [];
    const openKeys = new Set<string>();

    for (const req of conf!.requirements) {
      if (req.status === "atende") continue;
      const key = `competency::${buildCompetencyKey(req.competencyName, req.competencyType)}`;
      openKeys.add(key);
      const match = empCandidates.find(
        (c) => `${c.requirementType}::${c.requirementKey}` === key,
      );
      if (match) {
        details.push({
          requirementType: "competency",
          requirementKey: match.requirementKey,
          label: req.competencyName,
          dueDate: match.dueDate,
        });
      }
    }

    const educationVeredito = compareEducation(
      emp.education,
      conf!.positionEducation,
    );
    if (educationVeredito !== "atende") {
      const key = `education::${buildGapRequirementKey("education")}`;
      openKeys.add(key);
      const match = empCandidates.find(
        (c) => `${c.requirementType}::${c.requirementKey}` === key,
      );
      if (match) {
        details.push({
          requirementType: "education",
          requirementKey: match.requirementKey,
          label: "Escolaridade",
          dueDate: match.dueDate,
        });
      }
    }

    await resolveGapDeadlinesForEmployee(db, emp.id, openKeys);

    if (details.length > 0) overdueDetailsByEmployee.set(emp.id, details);
  }
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function sendOverdueEmail({
  to,
  adminName,
  title,
  description,
  employeeId,
}: {
  to: string;
  adminName: string;
  title: string;
  description: string;
  employeeId: number;
}) {
  const { client, fromEmail } = await getResendClient();
  const appUrl = process.env.APP_BASE_URL ?? "";
  const link = appUrl
    ? `${appUrl.replace(/\/$/, "")}/aprendizagem/colaboradores/${employeeId}`
    : "";

  await client.emails.send({
    from: fromEmail,
    to,
    subject: `[Daton] ${title}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; max-width: 560px;">
        <h2 style="font-size: 18px; margin: 0 0 12px;">${escapeHtml(title)}</h2>
        <p style="margin: 0 0 12px;">Olá ${escapeHtml(adminName)},</p>
        <p style="margin: 0 0 16px;">${escapeHtml(description)}</p>
        ${
          link
            ? `<p style="margin: 16px 0;"><a href="${link}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Abrir a ficha do colaborador</a></p>`
            : ""
        }
        <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
          Mensagem automática do Daton. Você está recebendo este alerta porque é administrador da organização.
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
