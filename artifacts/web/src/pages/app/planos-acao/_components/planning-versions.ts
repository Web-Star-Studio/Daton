import type { ActionPlan5W2H } from "@/lib/action-plans-client";

export interface PlanningBlock {
  plan5w2h: ActionPlan5W2H | null;
  rootCause: string | null;
  rootCauseWhys: string[] | null;
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
  userId: number | null;
  userName: string | null;
  createdAt: string;
  changes: unknown;
}

/** Consecutive saves by the same author within this window read as one version. */
const GROUP_WINDOW_MS = 10 * 60 * 1000;

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
    const sameAuthor = previous && previous.userId === entry.userId;
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
      userId: entry.userId,
      userName: entry.userName,
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

function whysText(whys: string[] | null): string {
  return whys?.length ? whys.join(" · ") : "—";
}

export interface PlanningFieldChange {
  label: string;
  before: string;
  after: string;
}

/** What changed between two versions of the block, ready to render. */
export function diffPlanningFields(
  from: PlanningBlock,
  to: PlanningBlock,
): PlanningFieldChange[] {
  const changes: PlanningFieldChange[] = [];

  for (const [key, label] of W2H_LABELS) {
    const before = from.plan5w2h?.[key] ?? null;
    const after = to.plan5w2h?.[key] ?? null;
    if ((before ?? "") !== (after ?? "")) {
      changes.push({ label, before: text(before), after: text(after) });
    }
  }

  if ((from.rootCause ?? "") !== (to.rootCause ?? "")) {
    changes.push({
      label: "Causa raiz",
      before: text(from.rootCause),
      after: text(to.rootCause),
    });
  }

  const beforeWhys = whysText(from.rootCauseWhys);
  const afterWhys = whysText(to.rootCauseWhys);
  if (beforeWhys !== afterWhys) {
    changes.push({ label: "5 porquês", before: beforeWhys, after: afterWhys });
  }

  return changes;
}
