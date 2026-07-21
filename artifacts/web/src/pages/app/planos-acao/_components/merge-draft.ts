import type { ActionPlan5W2H } from "@/lib/action-plans-client";
import type { ActionPlanAnalysis } from "./analises/types";

/** Mirrors the API response, where every field is optional. */
interface DraftFields {
  plan5w2h?: ActionPlan5W2H;
  rootCause?: string | null;
  rootCauseWhys?: string[];
}

interface FormFields {
  analyses: ActionPlanAnalysis[];
  rootCause: string;
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
 *
 * `draft.plan5w2h` is intentionally NOT mapped here.
 * TODO(Task 15): mapear draft.plan5w2h para a primeira ação quando a seção de
 * Ações existir — o endpoint de IA continua devolvendo o 5W2H, mas o form da
 * ficha não tem mais onde colocá-lo até a Task 15 criar a seção de Ações.
 */
export function mergeDraftIntoForm(
  form: FormFields,
  draft: DraftFields,
): FormFields & { changed: boolean } {
  let changed = false;

  let rootCause = form.rootCause;
  if (!rootCause.trim() && draft.rootCause) {
    rootCause = draft.rootCause;
    changed = true;
  }

  const draftWhys = (draft.rootCauseWhys ?? []).map((w) => w.trim()).filter(Boolean);
  let analyses = form.analyses;
  if (draftWhys.length > 0) {
    const existing = form.analyses.find(
      (a): a is Extract<ActionPlanAnalysis, { key: "five_whys" }> => a.key === "five_whys",
    );
    const hasWhys = existing ? existing.data.whys.some((w) => w.trim()) : false;
    if (!hasWhys) {
      const fiveWhys: ActionPlanAnalysis = { key: "five_whys", data: { whys: draftWhys } };
      analyses = existing
        ? form.analyses.map((a) => (a.key === "five_whys" ? fiveWhys : a))
        : [...form.analyses, fiveWhys];
      changed = true;
    }
  }

  return { analyses, rootCause, changed };
}
