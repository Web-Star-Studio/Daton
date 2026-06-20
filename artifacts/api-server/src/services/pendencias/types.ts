export type PendenciaSource =
  | "kpi"
  | "action_plan"
  | "nonconformity"
  | "regulatory_document";

export type PendenciaUrgency = "overdue" | "due_soon" | "upcoming" | "no_due";
export type PendenciaPriority = "p1" | "p2" | "p3";

export interface Pendencia {
  /** estável e único, ex.: "action_plan:123" */
  id: string;
  source: PendenciaSource;
  sourceLabel: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  /** ISO (date-only "YYYY-MM-DD" ou datetime). null = sem prazo. */
  dueDate: string | null;
  urgency: PendenciaUrgency;
  responsibleUserId: number;
  responsibleName?: string;
  link: { route: string; ctaLabel: string };
  meta?: Record<string, unknown>;
}

export interface PendenciaProviderContext {
  orgId: number;
  /** responsáveis que o solicitante pode ver (já resolvido pelo escopo). */
  responsibleUserIds: number[];
  /** "agora" injetável p/ testabilidade. */
  now: Date;
  /** janela de "a vencer em breve" (default 7). */
  dueSoonDays: number;
}

export interface PendenciaProvider {
  source: PendenciaSource;
  listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]>;
  listCompletedToday?(ctx: PendenciaProviderContext): Promise<Pendencia[]>;
}

export const SOURCE_LABELS: Record<PendenciaSource, string> = {
  kpi: "Indicador",
  action_plan: "Plano de ação",
  nonconformity: "Não conformidade",
  regulatory_document: "Documento regulatório",
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse evitando drift de fuso: "YYYY-MM-DD" vira data local, não UTC. */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

export function classifyUrgency(
  dueDate: string | Date | null,
  now: Date,
  dueSoonDays: number,
): PendenciaUrgency {
  if (dueDate == null) return "no_due";
  const dueDay = startOfDay(toDate(dueDate));
  const today = startOfDay(now);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= dueSoonDays) return "due_soon";
  return "upcoming";
}

export function urgencyToPriority(u: PendenciaUrgency): PendenciaPriority | null {
  switch (u) {
    case "overdue":
      return "p1";
    case "due_soon":
      return "p2";
    case "no_due":
      return "p3";
    case "upcoming":
      return null;
  }
}
