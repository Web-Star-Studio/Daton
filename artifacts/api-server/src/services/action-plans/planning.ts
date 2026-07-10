import type { ActionPlan5W2H } from "@workspace/db";

/**
 * The block "Sugerir plano (IA)" writes, versioned as one logical field.
 *
 * The activity log stores per-field diffs and the only snapshot it keeps is the
 * creation one (code/title/sourceModule/status). Replaying diffs therefore cannot
 * rebuild "the block as of 12:34" — an entry that only touched the root cause says
 * nothing about the 5W2H at that instant. Storing the whole block in `from`/`to`
 * makes every entry's `to` a complete version, so restoring is just applying it.
 */
export interface PlanningBlock {
  plan5w2h: ActionPlan5W2H | null;
  rootCause: string | null;
  rootCauseWhys: string[] | null;
}

interface PlanningSource {
  plan5w2h?: ActionPlan5W2H | null;
  rootCause?: string | null;
  rootCauseWhys?: string[] | null;
}

export function extractPlanning(row: PlanningSource): PlanningBlock {
  return {
    plan5w2h: row.plan5w2h ?? null,
    rootCause: row.rootCause ?? null,
    rootCauseWhys: row.rootCauseWhys ?? null,
  };
}

/** `null`, `{}`, `""` and `[]` all mean "empty" — collapse them so an autosave that
 *  merely round-trips an empty block never shows up as a version. */
export function normalizePlanning(block: PlanningSource): PlanningBlock {
  const entries = Object.entries(block.plan5w2h ?? {}).filter(
    ([, value]) => typeof value === "string" && value.trim() !== "",
  );
  const plan5w2h = entries.length
    ? (Object.fromEntries(
        entries.map(([k, v]) => [k, (v as string).trim()]),
      ) as ActionPlan5W2H)
    : null;

  const rootCause = block.rootCause?.trim() || null;

  const whys = (block.rootCauseWhys ?? [])
    .map((why) => why.trim())
    .filter(Boolean);

  return { plan5w2h, rootCause, rootCauseWhys: whys.length ? whys : null };
}

/** Deep equality with object keys sorted, so `{what, why}` equals `{why, what}`.
 *  Arrays stay order-sensitive: the 5 whys are a chain, not a set. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonical(source[key])]),
    );
  }
  return value ?? null;
}

export function planningChanged(
  before: PlanningSource,
  after: PlanningSource,
): boolean {
  return (
    JSON.stringify(canonical(normalizePlanning(before))) !==
    JSON.stringify(canonical(normalizePlanning(after)))
  );
}
