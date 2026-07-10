import { describe, expect, it } from "vitest";
import {
  extractPlanning,
  normalizePlanning,
  planningChanged,
} from "../../../src/services/action-plans/planning";

const row = {
  plan5w2h: { what: "Treinar", why: "Garantir conferência" },
  rootCause: "Falta de treinamento.",
  rootCauseWhys: ["Não foi conferido."],
  title: "irrelevante",
};

describe("extractPlanning", () => {
  it("keeps only the three planning fields", () => {
    expect(extractPlanning(row)).toEqual({
      plan5w2h: { what: "Treinar", why: "Garantir conferência" },
      rootCause: "Falta de treinamento.",
      rootCauseWhys: ["Não foi conferido."],
    });
  });
});

describe("normalizePlanning", () => {
  // The form sends `null` when the block is emptied; the database may have `{}` or `[]`.
  // Treating both shapes as "empty" avoids phantom versions in the history.
  it("collapses empty shapes to null", () => {
    expect(
      normalizePlanning({ plan5w2h: {}, rootCause: "", rootCauseWhys: [] }),
    ).toEqual({
      plan5w2h: null,
      rootCause: null,
      rootCauseWhys: null,
    });
  });

  it("drops blank 5W2H fields and blank whys", () => {
    expect(
      normalizePlanning({
        plan5w2h: { what: "Treinar", why: "   " },
        rootCause: "  Causa  ",
        rootCauseWhys: ["  ", "Porque sim"],
      }),
    ).toEqual({
      plan5w2h: { what: "Treinar" },
      rootCause: "Causa",
      rootCauseWhys: ["Porque sim"],
    });
  });

  // jsonb columns only enforce their shape at compile time via `.$type<>()` — at
  // runtime Postgres (and any code path that skipped validation) happily stores
  // whatever JSON it was given. A row with non-string elements in `rootCauseWhys`
  // or a non-string `plan5w2h` value must not crash `normalizePlanning`; those
  // elements should just be discarded like other unusable values. The cast below
  // escapes the compile-time type on purpose, since the point is runtime behavior.
  it("discards non-string elements instead of throwing", () => {
    expect(
      normalizePlanning({
        plan5w2h: { what: "Treinar", why: 123 },
        rootCause: "Causa",
        rootCauseWhys: ["Porque sim", null, 42, { note: "not a string" }],
      } as unknown as Parameters<typeof normalizePlanning>[0]),
    ).toEqual({
      plan5w2h: { what: "Treinar" },
      rootCause: "Causa",
      rootCauseWhys: ["Porque sim"],
    });
  });
});

describe("planningChanged", () => {
  const base = extractPlanning(row);

  it("is false for the same content", () => {
    expect(planningChanged(base, { ...base })).toBe(false);
  });

  it("ignores 5W2H key order", () => {
    const reordered = {
      ...base,
      plan5w2h: { why: "Garantir conferência", what: "Treinar" },
    };
    expect(planningChanged(base, reordered)).toBe(false);
  });

  it("treats null, empty object and empty array as the same emptiness", () => {
    const a = { plan5w2h: null, rootCause: null, rootCauseWhys: null };
    const b = { plan5w2h: {}, rootCause: "", rootCauseWhys: [] };
    expect(planningChanged(a, b)).toBe(false);
  });

  it("is true when a 5W2H field changes", () => {
    expect(
      planningChanged(base, { ...base, plan5w2h: { what: "Outra coisa" } }),
    ).toBe(true);
  });

  it("is true when the whys are reordered", () => {
    const a = { ...base, rootCauseWhys: ["a", "b"] };
    const b = { ...base, rootCauseWhys: ["b", "a"] };
    expect(planningChanged(a, b)).toBe(true);
  });

  it("is true when the root cause changes", () => {
    expect(planningChanged(base, { ...base, rootCause: "Outra causa" })).toBe(
      true,
    );
  });
});
