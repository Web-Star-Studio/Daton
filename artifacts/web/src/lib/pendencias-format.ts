export type PendenciaSource =
  | "kpi"
  | "action_plan"
  | "action_plan_action"
  | "nonconformity"
  | "regulatory_document"
  | "training_effectiveness"
  | "training_class_responsible";
export type PendenciaUrgency = "overdue" | "due_soon" | "upcoming" | "no_due";
export type PendenciaPriority = "p1" | "p2" | "p3";

export interface Pendencia {
  id: string;
  source: PendenciaSource;
  sourceLabel: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  dueDate: string | null;
  urgency: PendenciaUrgency;
  responsibleUserId: number;
  responsibleName?: string;
  link: { route: string; ctaLabel: string };
  meta?: Record<string, unknown>;
}

export interface PendenciasCounts {
  total: number;
  overdue: number;
  dueSoon: number;
  noDue: number;
  upcoming: number;
  completedToday: number;
  bySource: Record<PendenciaSource, number>;
}

export interface PendenciaUserBlock {
  id: number;
  name: string;
  role: string;
  lastLoginAt: string | null;
  filial: { id: number; name: string } | null;
}

export interface PendenciasResponse {
  user: PendenciaUserBlock;
  scope: "mine" | "unit" | "org";
  counts: PendenciasCounts;
  items: Pendencia[];
  completedToday: Pendencia[];
}

export const SOURCE_LABELS: Record<PendenciaSource, string> = {
  kpi: "Indicador",
  action_plan: "Plano de ação",
  action_plan_action: "Ação de plano",
  nonconformity: "Não conformidade",
  regulatory_document: "Documento regulatório",
  training_effectiveness: "Eficácia de treinamento",
  training_class_responsible: "Turma sob sua responsabilidade",
};

export const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Admin Plataforma",
  org_admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  analyst: "Analista",
};

export const URGENCY_META: Record<
  PendenciaUrgency,
  {
    priority: PendenciaPriority | null;
    sectionTitle: string;
    badgeVariant: "danger" | "warning" | "info";
    badgeLabel: string;
  }
> = {
  overdue: { priority: "p1", sectionTitle: "Fazer agora", badgeVariant: "danger", badgeLabel: "Vencido" },
  due_soon: { priority: "p2", sectionTitle: "Em breve", badgeVariant: "warning", badgeLabel: "A vencer" },
  no_due: { priority: "p3", sectionTitle: "Atenção", badgeVariant: "info", badgeLabel: "Aberto" },
  upcoming: { priority: null, sectionTitle: "Futuro", badgeVariant: "info", badgeLabel: "Futuro" },
};

export function priorityOf(urgency: PendenciaUrgency): PendenciaPriority | null {
  return URGENCY_META[urgency].priority;
}

function dueRank(p: Pendencia): number {
  return p.dueDate ? new Date(p.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
}

export function groupByPriority(items: Pendencia[]): {
  p1: Pendencia[];
  p2: Pendencia[];
  p3: Pendencia[];
} {
  const groups = { p1: [] as Pendencia[], p2: [] as Pendencia[], p3: [] as Pendencia[] };
  for (const it of items) {
    const prio = priorityOf(it.urgency);
    if (prio === "p1") groups.p1.push(it);
    else if (prio === "p2") groups.p2.push(it);
    else if (prio === "p3") groups.p3.push(it);
    // upcoming (prio null) excluded — calendar-only (F4)
  }
  const byDue = (a: Pendencia, b: Pendencia) => dueRank(a) - dueRank(b);
  groups.p1.sort(byDue);
  groups.p2.sort(byDue);
  groups.p3.sort(byDue);
  return groups;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

export function formatRelativeDue(dueDate: string | null, now: Date): string {
  if (dueDate == null) return "sem prazo";
  const diff = Math.round(
    (startOfDay(parseDateOnly(dueDate)).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (diff < -1) return `venceu há ${Math.abs(diff)} dias`;
  if (diff === -1) return "venceu ontem";
  if (diff === 0) return "vence hoje";
  if (diff === 1) return "vence amanhã";
  return `vence em ${diff} dias`;
}

export function itemsByDay(items: Pendencia[]): Map<string, Pendencia[]> {
  const map = new Map<string, Pendencia[]>();
  for (const it of items) {
    if (!it.dueDate) continue;
    const d = it.dueDate.slice(0, 10); // "YYYY-MM-DD"
    const list = map.get(d);
    if (list) list.push(it);
    else map.set(d, [it]);
  }
  return map;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatLastAccess(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `hoje às ${hm}`;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} às ${hm}`;
}
