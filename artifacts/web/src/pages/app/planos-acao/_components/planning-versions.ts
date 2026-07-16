import type { ActionPlan5W2H } from "@/lib/action-plans-client";
import { resumoAnalise } from "./analises/registry";
import type { ActionPlanAnalysis, AnalysisMethodKey } from "./analises/types";

export interface PlanningBlock {
  rootCause: string | null;
  analyses: ActionPlanAnalysis[] | null;
  /**
   * Campo LEGADO: entradas do activity log gravadas antes desta feature guardam o
   * 5W2H aqui em vez de `analyses`. Nunca escrito por planejamento novo — mantido
   * só para que o diff tolere essas versões antigas sem quebrar. Ver `diffPlanningFields`.
   */
  plan5w2h?: ActionPlan5W2H | null;
}

export interface PlanningVersion {
  /** Activity entry to send to the restore endpoint — the LAST save of the group,
   *  because that is the one whose `to` holds the final content. */
  activityId: number;
  userId: number | null;
  userName: string | null;
  /** When the author started this run of edits (first save of the group). */
  createdAt: string;
  /** How many saves were folded into this version. */
  saves: number;
  from: PlanningBlock;
  to: PlanningBlock;
  restoredFrom?: { activityId: number; at: string };
}

interface ActivityEntryLike {
  id: number;
  // Optional to match the generated `ActionPlanActivityLogEntry` type, which the
  // caller (Task 6) feeds in directly from `useActionPlanActivity`.
  userId?: number | null;
  userName?: string | null;
  createdAt: string;
  changes?: unknown;
}

/** Consecutive saves by the same author within this window read as one version. */
const GROUP_WINDOW_MS = 10 * 60 * 1000;

/**
 * Rótulos padrão de cada tratativa — usados aqui só como QUEDA (fallback) para o
 * diff, que não tem o catálogo à mão (ele é org-scoped, carregado via hook; esta
 * função é pura e roda fora de componente). MANTER EM SINCRONIA com
 * `DEFAULT_ANALYSIS_METHODS` em `services/action-plans/analysis-methods.ts`. Uma
 * empresa que renomeou o rótulo verá aqui o nome PADRÃO no histórico, não o seu —
 * aceitável: é só o texto da linha de diff, o card da tratativa usa o rótulo real.
 */
const DEFAULT_ANALYSIS_LABELS: Record<AnalysisMethodKey, string> = {
  five_whys: "5 Porquês",
  ishikawa: "Ishikawa + 5 Porquês",
  a3: "A3",
  fmea: "FMEA",
  fault_tree: "Árvore de Falhas",
  kepner_tregoe: "Kepner-Tregoe",
  rca_apollo: "RCA Apollo",
  barrier_analysis: "Análise de Barreiras",
};

const W2H_LABELS: Array<[keyof ActionPlan5W2H, string]> = [
  ["what", "O quê"],
  ["why", "Por quê"],
  ["where", "Onde"],
  ["who", "Quem"],
  ["when", "Quando"],
  ["how", "Como"],
  ["howMuch", "Quanto"],
];

function readPlanning(entry: ActivityEntryLike) {
  const changes = entry.changes as
    | {
        kind?: string;
        fields?: { planning?: { from: PlanningBlock; to: PlanningBlock } };
        restoredFrom?: { activityId: number; at: string };
      }
    | null
    | undefined;
  const planning = changes?.fields?.planning;
  if (!planning) return null;
  return { planning, restoredFrom: changes?.restoredFrom };
}

/**
 * Versions of the planning block, newest first.
 *
 * The autosave writes one activity entry per save, so typing the 5W2H in three
 * pauses leaves three entries. We never touch the log — an ISO audit trail should
 * stay intact — and instead fold what is obviously one editing run into a single
 * version at display time.
 */
export function buildPlanningVersions(
  entries: ActivityEntryLike[],
): PlanningVersion[] {
  const planning = entries
    .map((entry) => ({ entry, read: readPlanning(entry) }))
    .filter(
      (
        item,
      ): item is {
        entry: ActivityEntryLike;
        read: NonNullable<ReturnType<typeof readPlanning>>;
      } => item.read !== null,
    )
    .sort(
      (a, b) => Date.parse(a.entry.createdAt) - Date.parse(b.entry.createdAt),
    );

  const versions: PlanningVersion[] = [];
  for (const { entry, read } of planning) {
    const previous = versions[versions.length - 1];
    // An unknown author (`null`/`undefined`) never groups: the author FK is
    // ON DELETE SET NULL, so two DIFFERENT removed users both read as `null` and
    // `null === null` would wrongly fold them — dropping the intermediate version
    // from the restore list.
    const sameAuthor =
      !!previous &&
      previous.userId != null &&
      entry.userId != null &&
      previous.userId === entry.userId;
    const withinWindow =
      previous &&
      Date.parse(entry.createdAt) - Date.parse(previous.createdAt) <=
        GROUP_WINDOW_MS;
    // A restore is a deliberate act — never fold it into the run before it.
    const foldable =
      sameAuthor &&
      withinWindow &&
      !read.restoredFrom &&
      !previous.restoredFrom;

    if (foldable) {
      previous.activityId = entry.id;
      previous.to = read.planning.to;
      previous.saves += 1;
      continue;
    }

    versions.push({
      activityId: entry.id,
      userId: entry.userId ?? null,
      userName: entry.userName ?? null,
      createdAt: entry.createdAt,
      saves: 1,
      from: read.planning.from,
      to: read.planning.to,
      ...(read.restoredFrom ? { restoredFrom: read.restoredFrom } : {}),
    });
  }

  return versions.reverse();
}

function text(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : "—";
}

/** Texto de uma tratativa preenchida, ou "—" para uma tratativa recém-adicionada
 *  (ainda sem conteúdo) ou removida (nada a mostrar do lado que não a tem). */
function analysisText(analysis: ActionPlanAnalysis | undefined): string {
  return analysis ? resumoAnalise(analysis) : "—";
}

function analysisLabel(key: AnalysisMethodKey): string {
  return DEFAULT_ANALYSIS_LABELS[key] ?? key;
}

/**
 * Diff das tratativas (`analyses`), comparadas por `key` — cada plano tem no
 * máximo uma instância de cada método (Task 12). Percorremos `to` primeiro, na sua
 * ordem, para reportar adições e edições; depois `from`, na sua ordem, para as
 * remoções — assim a ordem da lista de mudanças é estável e previsível.
 */
function diffAnalyses(
  from: ActionPlanAnalysis[] | null | undefined,
  to: ActionPlanAnalysis[] | null | undefined,
): PlanningFieldChange[] {
  const changes: PlanningFieldChange[] = [];
  const fromByKey = new Map((from ?? []).map((a) => [a.key, a]));
  const toByKey = new Map((to ?? []).map((a) => [a.key, a]));

  for (const [key, toAnalysis] of toByKey) {
    const fromAnalysis = fromByKey.get(key);
    if (!fromAnalysis) {
      changes.push({
        label: `${analysisLabel(key)} adicionada`,
        before: "—",
        after: analysisText(toAnalysis),
      });
      continue;
    }
    const before = analysisText(fromAnalysis);
    const after = analysisText(toAnalysis);
    if (before !== after) {
      changes.push({ label: analysisLabel(key), before, after });
    }
  }

  for (const [key, fromAnalysis] of fromByKey) {
    if (toByKey.has(key)) continue;
    changes.push({
      label: `${analysisLabel(key)} removida`,
      before: analysisText(fromAnalysis),
      after: "—",
    });
  }

  return changes;
}

/**
 * Resumo do 5W2H legado, para a linha de compatibilidade — não campo a campo (o
 * formato foi descontinuado), só o suficiente para o histórico não ficar mudo.
 */
function legacyPlan5w2hText(
  plan5w2h: ActionPlan5W2H | null | undefined,
): string {
  if (!plan5w2h) return "—";
  const parts = W2H_LABELS.map(([key, label]) => {
    const value = plan5w2h[key]?.trim();
    return value ? `${label}: ${value}` : null;
  }).filter((part): part is string => part !== null);
  return parts.length ? parts.join(" · ") : "—";
}

export interface PlanningFieldChange {
  label: string;
  before: string;
  after: string;
}

/**
 * What changed between two versions of the block, ready to render.
 *
 * `from`/`to` normally hold the CURRENT shape (`rootCause` + `analyses`). Entries
 * written before this feature still carry the legacy `plan5w2h`/`rootCauseWhys`
 * shape in the activity log — an ISO audit trail is never rewritten — so this
 * tolerates that field instead of assuming it is absent.
 */
export function diffPlanningFields(
  from: PlanningBlock,
  to: PlanningBlock,
): PlanningFieldChange[] {
  const changes: PlanningFieldChange[] = [];

  // Compare the SAME representation that is displayed: `text()` trims, so a legacy
  // `" causa "` collapsing to `"causa"` must not read as a change (before/after
  // would render identically).
  if ((from.rootCause?.trim() ?? "") !== (to.rootCause?.trim() ?? "")) {
    changes.push({
      label: "Causa raiz",
      before: text(from.rootCause),
      after: text(to.rootCause),
    });
  }

  changes.push(...diffAnalyses(from.analyses, to.analyses));

  // Legacy compat: a version written before this feature has no `analyses` at all —
  // the cause analysis lived in `plan5w2h` instead. We do not diff it field by field
  // (that format is retired); we just surface that SOMETHING changed, so the line
  // never silently vanishes nor throws when it finds the old shape.
  const legacyBefore = legacyPlan5w2hText(from.plan5w2h);
  const legacyAfter = legacyPlan5w2hText(to.plan5w2h);
  if (legacyBefore !== legacyAfter) {
    changes.push({
      label: "Plano 5W2H (formato anterior)",
      before: legacyBefore,
      after: legacyAfter,
    });
  }

  return changes;
}
