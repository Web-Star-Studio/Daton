import type { ActionPlan5W2H } from "@/lib/action-plans-client";

/** Mirrors the API response, where every field is optional. */
interface DraftFields {
  plan5w2h?: ActionPlan5W2H;
  rootCause?: string | null;
  rootCauseWhys?: string[];
}

interface FormFields {
  plan5w2h: ActionPlan5W2H;
  rootCause: string;
  rootCauseWhys: string[];
}

/**
 * Fill-only merge of an AI draft into the form: it never overwrites what the user
 * already wrote, and it reports whether anything was actually added.
 *
 * Pure on purpose. This used to live inside a `setForm(f => ...)` updater that
 * flipped a `changed` flag read on the very next line — but React runs the updater
 * during render, so the flag was still false. The form never went dirty, the
 * autosave never fired, and the draft vanished on reload while the toast said the
 * AI "had nothing to add".
 */
export function mergeDraftIntoForm(
  form: FormFields,
  draft: DraftFields,
): FormFields & { changed: boolean } {
  let changed = false;

  const draft5w2h = draft.plan5w2h ?? {};
  const draftWhys = draft.rootCauseWhys ?? [];

  const plan5w2h: ActionPlan5W2H = { ...form.plan5w2h };
  for (const key of Object.keys(draft5w2h) as (keyof ActionPlan5W2H)[]) {
    const value = draft5w2h[key];
    if (value && !plan5w2h[key]?.trim()) {
      plan5w2h[key] = value;
      changed = true;
    }
  }

  let rootCause = form.rootCause;
  if (!rootCause.trim() && draft.rootCause) {
    rootCause = draft.rootCause;
    changed = true;
  }

  let rootCauseWhys = form.rootCauseWhys;
  const hasWhys = rootCauseWhys.some((why) => why.trim());
  if (!hasWhys && draftWhys.length > 0) {
    rootCauseWhys = draftWhys;
    changed = true;
  }

  return { plan5w2h, rootCause, rootCauseWhys, changed };
}
