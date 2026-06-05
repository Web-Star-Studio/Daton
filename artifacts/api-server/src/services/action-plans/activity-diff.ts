import type { ActionPlanActivityChanges } from "@workspace/db";

/**
 * Field-level diff for tracked columns. Returns a `diff` change payload, or null
 * when nothing in `fields` changed (compared structurally via JSON). Pure (no DB
 * import) so it stays unit-testable without a database.
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): ActionPlanActivityChanges | null {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) changed[f] = { from: a, to: b };
  }
  return Object.keys(changed).length > 0 ? { kind: "diff", fields: changed } : null;
}
