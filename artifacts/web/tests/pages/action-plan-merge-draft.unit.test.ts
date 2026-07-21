import { describe, expect, it } from "vitest";
import { mergeDraftIntoForm } from "@/pages/app/planos-acao/_components/merge-draft";
import type { ActionPlanAnalysis } from "@/pages/app/planos-acao/_components/analises/types";

const empty = { analyses: [] as ActionPlanAnalysis[], rootCause: "" };

const draft = {
  // Task 14: plan5w2h is intentionally ignored by mergeDraftIntoForm (see the
  // TODO(Task 15) in merge-draft.ts) — kept here only to mirror the real API
  // response shape and confirm it never leaks into the result.
  plan5w2h: { what: "Reciclar treinamento", why: "Garantir conferência" },
  rootCause: "Falta de treinamento.",
  rootCauseWhys: ["O teste não foi conferido.", "Porque ninguém treinou."],
};

describe("mergeDraftIntoForm", () => {
  /**
   * The old code flipped a `changed` flag inside the setForm updater and read it
   * on the next line. React runs that updater during render, so the flag was still
   * false: the form never went dirty, the autosave never fired, and the whole AI
   * draft was lost on reload — while the toast claimed nothing had been added.
   */
  it("reports changed when it fills blank fields", () => {
    const result = mergeDraftIntoForm(empty, draft);

    expect(result.changed).toBe(true);
    expect(result.rootCause).toBe("Falta de treinamento.");
    expect(result.analyses).toEqual([{ key: "five_whys", data: { whys: draft.rootCauseWhys } }]);
  });

  it("never overwrites what the user already wrote", () => {
    const filled = {
      analyses: [{ key: "five_whys", data: { whys: ["Meu porquê"] } }] as ActionPlanAnalysis[],
      rootCause: "Minha causa",
    };

    const result = mergeDraftIntoForm(filled, draft);

    expect(result.rootCause).toBe("Minha causa");
    expect(result.analyses).toEqual(filled.analyses);
    expect(result.changed).toBe(false);
  });

  it("adds a five_whys tratativa when the draft has whys but the plan has none yet", () => {
    const filled = { analyses: [] as ActionPlanAnalysis[], rootCause: "Minha causa" };

    const result = mergeDraftIntoForm(filled, draft);

    expect(result.rootCause).toBe("Minha causa");
    expect(result.analyses).toEqual([{ key: "five_whys", data: { whys: draft.rootCauseWhys } }]);
    expect(result.changed).toBe(true);
  });

  it("preserves other tratativas already on the plan untouched", () => {
    const ishikawa: ActionPlanAnalysis = { key: "ishikawa", data: { causes: [], whys: [] } };
    const filled = { analyses: [ishikawa], rootCause: "" };

    const result = mergeDraftIntoForm(filled, draft);

    expect(result.analyses).toEqual([ishikawa, { key: "five_whys", data: { whys: draft.rootCauseWhys } }]);
  });

  it("treats whitespace-only fields as blank", () => {
    const blankish = {
      analyses: [{ key: "five_whys", data: { whys: ["  "] } }] as ActionPlanAnalysis[],
      rootCause: "  ",
    };

    const result = mergeDraftIntoForm(blankish, draft);

    expect(result.changed).toBe(true);
    expect(result.rootCause).toBe("Falta de treinamento.");
    expect(result.analyses).toEqual([{ key: "five_whys", data: { whys: draft.rootCauseWhys } }]);
  });

  it("reports no change for an empty draft", () => {
    const result = mergeDraftIntoForm(empty, { plan5w2h: {}, rootCause: null, rootCauseWhys: [] });

    expect(result.changed).toBe(false);
    expect(result.analyses).toEqual([]);
    expect(result.rootCause).toBe("");
  });
});
