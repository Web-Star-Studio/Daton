import { describe, expect, it } from "vitest";
import { mergeDraftIntoForm } from "@/pages/app/planos-acao/_components/merge-draft";

const empty = { plan5w2h: {}, rootCause: "", rootCauseWhys: [] as string[] };

const draft = {
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
    expect(result.plan5w2h).toEqual(draft.plan5w2h);
    expect(result.rootCause).toBe("Falta de treinamento.");
    expect(result.rootCauseWhys).toEqual(draft.rootCauseWhys);
  });

  it("never overwrites what the user already wrote", () => {
    const filled = {
      plan5w2h: { what: "Minha ação" },
      rootCause: "Minha causa",
      rootCauseWhys: ["Meu porquê"],
    };

    const result = mergeDraftIntoForm(filled, draft);

    expect(result.plan5w2h.what).toBe("Minha ação");
    expect(result.plan5w2h.why).toBe("Garantir conferência");
    expect(result.rootCause).toBe("Minha causa");
    expect(result.rootCauseWhys).toEqual(["Meu porquê"]);
    expect(result.changed).toBe(true);
  });

  it("reports no change when every field the draft offers is already filled", () => {
    const filled = {
      plan5w2h: { what: "Minha ação", why: "Meu porquê" },
      rootCause: "Minha causa",
      rootCauseWhys: ["Meu porquê"],
    };

    expect(mergeDraftIntoForm(filled, draft).changed).toBe(false);
  });

  it("treats whitespace-only fields as blank", () => {
    const blankish = { plan5w2h: { what: "   " }, rootCause: "  ", rootCauseWhys: ["  "] };

    const result = mergeDraftIntoForm(blankish, draft);

    expect(result.changed).toBe(true);
    expect(result.plan5w2h.what).toBe("Reciclar treinamento");
    expect(result.rootCause).toBe("Falta de treinamento.");
    expect(result.rootCauseWhys).toEqual(draft.rootCauseWhys);
  });

  it("reports no change for an empty draft", () => {
    const result = mergeDraftIntoForm(empty, { plan5w2h: {}, rootCause: null, rootCauseWhys: [] });

    expect(result.changed).toBe(false);
  });
});
