function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural equality for the JSON-shaped values an action-plan payload carries. */
function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isDeepEqual(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((key) => isDeepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Fields this tab actually changed, relative to the plan it was loaded from.
 *
 * The autosave used to PATCH the whole form. Two people on the same plan meant the
 * last tab to save silently reverted every field the other had touched — a real
 * one, in production: Ana assigned the plan to Thais at 13:00:10, and twenty
 * seconds later Thais's tab (loaded while the plan had no responsible) autosaved an
 * edit to the root cause and wiped the assignment. Sending only what changed keeps
 * an untouched field out of the request entirely, so it cannot be reverted.
 *
 * `baseline` is the payload shape of the last server state this tab synced to — set
 * at hydration and after each successful save. `null` means "never synced", so send
 * everything.
 */
export function diffActionPlanPayload<T extends object>(
  baseline: T | null,
  next: T,
): Partial<T> {
  if (!baseline) return { ...next };

  const changed: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (!isDeepEqual(baseline[key], next[key])) {
      changed[key] = next[key];
    }
  }
  return changed;
}
