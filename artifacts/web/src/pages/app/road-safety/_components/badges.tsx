import { cn } from "@/lib/utils";
import {
  CONTROL_STATUS_LABELS,
  diagnosisBadgeLabel,
  FACTOR_TYPE_SHORT,
  GUT_RELEVANCE_LABELS,
  gutRelevance,
  type ControlStatus,
  type DiagnosisStatus,
  type FactorType,
} from "@/lib/road-safety-client";

const PILL = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold";

const RELEVANCE_STYLES = {
  extrema: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  alta: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  media: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  baixa: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
} as const;

/** GUT relevance pill — e.g. "EXTREMA · 125". */
export function RelevanceBadge({
  score,
  withScore = true,
  className,
}: {
  score: number;
  withScore?: boolean;
  className?: string;
}) {
  const rel = gutRelevance(score);
  return (
    <span className={cn(PILL, RELEVANCE_STYLES[rel], className)}>
      {GUT_RELEVANCE_LABELS[rel]}
      {withScore ? ` · ${score}` : ""}
    </span>
  );
}

const STATUS_STYLES: Record<ControlStatus, string> = {
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  regularized:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  non_conforming: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  in_progress:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

export function StatusBadge({ status }: { status: string }) {
  const s: ControlStatus =
    status in STATUS_STYLES ? (status as ControlStatus) : "scheduled";
  return <span className={cn(PILL, STATUS_STYLES[s])}>{CONTROL_STATUS_LABELS[s]}</span>;
}

const TYPE_STYLES: Record<FactorType, string> = {
  exposure: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  intermediate:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  final: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

export function TypeBadge({ type }: { type: string }) {
  const t: FactorType =
    type in TYPE_STYLES ? (type as FactorType) : "intermediate";
  return <span className={cn(PILL, TYPE_STYLES[t])}>{FACTOR_TYPE_SHORT[t]}</span>;
}

const DIAGNOSIS_STYLES: Record<DiagnosisStatus, string> = {
  none: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  due_soon: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

/** Vencimento do diagnóstico — e.g. "Vencido", "Vence em 4 dias". */
export function DiagnosisBadge({
  status,
  nextDate,
}: {
  status: DiagnosisStatus;
  nextDate: string | null;
}) {
  return (
    <span className={cn(PILL, DIAGNOSIS_STYLES[status])}>
      {diagnosisBadgeLabel(status, nextDate)}
    </span>
  );
}
