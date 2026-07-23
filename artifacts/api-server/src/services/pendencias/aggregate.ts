import { and, eq, inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  urgencyToPriority,
  type Pendencia,
  type PendenciaProviderContext,
  type PendenciaSource,
} from "./types";
import { pendenciaProviders } from "./registry";

export interface PendenciaCounts {
  total: number;
  overdue: number;
  dueSoon: number;
  noDue: number;
  upcoming: number;
  completedToday: number;
  bySource: Record<PendenciaSource, number>;
}

export interface AggregateResult {
  items: Pendencia[];
  counts: PendenciaCounts;
  completedToday: Pendencia[];
}

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

function sortKey(p: Pendencia): [number, number] {
  const prio = urgencyToPriority(p.urgency);
  const prioRank = prio ? PRIORITY_RANK[prio] : 3; // upcoming last
  const dueRank = p.dueDate ? new Date(p.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  return [prioRank, dueRank];
}

export async function aggregatePendencias(
  ctx: PendenciaProviderContext,
): Promise<AggregateResult> {
  // Fan out with graceful degradation: one broken provider must not sink the panel.
  const settled = await Promise.allSettled(
    pendenciaProviders.map((p) => p.listPending(ctx)),
  );
  const items: Pendencia[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      items.push(...r.value);
    } else {
      console.error(
        `[pendencias] provider "${pendenciaProviders[i].source}" failed:`,
        r.reason,
      );
    }
  }

  // Completed-today fan-out (providers may not implement it).
  const completedSettled = await Promise.allSettled(
    pendenciaProviders.map((p) =>
      p.listCompletedToday ? p.listCompletedToday(ctx) : Promise.resolve([]),
    ),
  );
  const completedToday: Pendencia[] = [];
  for (let i = 0; i < completedSettled.length; i++) {
    const r = completedSettled[i];
    if (r.status === "fulfilled") completedToday.push(...r.value);
    else
      console.error(
        `[pendencias] provider "${pendenciaProviders[i].source}" listCompletedToday failed:`,
        r.reason,
      );
  }

  // Enrich responsibleName (needed by the unit/org scopes). Um item pode ter mais de
  // um responsável (planos de ação: ponto focal + co-responsáveis) — aí o rótulo
  // vira "Maria Silva +2".
  const ids = [
    ...new Set(
      [...items, ...completedToday].flatMap((i) => i.responsibleUserIds ?? [i.responsibleUserId]),
    ),
  ];
  if (ids.length > 0) {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(eq(usersTable.organizationId, ctx.orgId), inArray(usersTable.id, ids)));
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    for (const item of [...items, ...completedToday]) {
      item.responsibleName = composeResponsibleName(item, nameById);
    }
  }

  // Sort by priority then due date.
  items.sort((a, b) => {
    const [pa, da] = sortKey(a);
    const [pb, db_] = sortKey(b);
    return pa - pb || da - db_;
  });

  // Counts cover what the list exposes (upcoming counted separately, calendar-only).
  const counts: PendenciaCounts = {
    total: 0,
    overdue: 0,
    dueSoon: 0,
    noDue: 0,
    upcoming: 0,
    completedToday: 0,
    bySource: {
      kpi: 0,
      action_plan: 0,
      action_plan_action: 0,
      nonconformity: 0,
      regulatory_document: 0,
      training_effectiveness: 0,
      training_class_responsible: 0,
    },
  };
  for (const item of items) {
    if (item.urgency === "overdue") counts.overdue++;
    else if (item.urgency === "due_soon") counts.dueSoon++;
    else if (item.urgency === "no_due") counts.noDue++;
    else if (item.urgency === "upcoming") counts.upcoming++;
    if (item.urgency !== "upcoming") {
      counts.total++;
      counts.bySource[item.source]++;
    }
  }
  counts.completedToday = completedToday.length;

  return { items, counts, completedToday };
}

/** "Maria Silva" para um; "Maria Silva +2" para três. Ordem alfabética para o
 *  rótulo não dançar entre requisições. */
function composeResponsibleName(
  item: Pendencia,
  nameById: Map<number, string>,
): string | undefined {
  const ids = item.responsibleUserIds ?? [item.responsibleUserId];
  const names = ids
    .map((id) => nameById.get(id))
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (names.length === 0) return undefined;
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}
