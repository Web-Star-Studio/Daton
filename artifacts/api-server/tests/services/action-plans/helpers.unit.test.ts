import { describe, expect, it } from "vitest";

import { gutScore } from "../../../src/services/action-plans/gut";
import { buildDiff } from "../../../src/services/action-plans/activity-diff";

describe("gutScore", () => {
  it("multiplica os três eixos (1–5 → 1–125)", () => {
    expect(gutScore(3, 3, 3)).toBe(27);
    expect(gutScore(5, 5, 5)).toBe(125);
    expect(gutScore(1, 1, 1)).toBe(1);
  });

  it("retorna null quando qualquer eixo está ausente", () => {
    expect(gutScore(null, 3, 3)).toBeNull();
    expect(gutScore(3, undefined, 3)).toBeNull();
    expect(gutScore(3, 3, null)).toBeNull();
  });
});

describe("buildDiff", () => {
  it("retorna null quando nenhum campo rastreado mudou", () => {
    const before = { title: "A", priority: "high", extra: 1 };
    const after = { title: "A", priority: "high", extra: 2 };
    expect(buildDiff(before, after, ["title", "priority"])).toBeNull();
  });

  it("captura apenas os campos rastreados que mudaram", () => {
    const before = { title: "A", priority: "high", dueDate: null };
    const after = { title: "B", priority: "high", dueDate: null };
    expect(buildDiff(before, after, ["title", "priority", "dueDate"])).toEqual({
      kind: "diff",
      fields: { title: { from: "A", to: "B" } },
    });
  });

  it("trata null e undefined como equivalentes (sem ruído)", () => {
    const before = { responsibleUserId: null };
    const after = { responsibleUserId: undefined };
    expect(buildDiff(before, after, ["responsibleUserId"])).toBeNull();
  });

  it("compara estruturas (arrays/objetos) por valor", () => {
    const before = { rootCauseWhys: ["a", "b"] };
    const after = { rootCauseWhys: ["a", "c"] };
    expect(buildDiff(before, after, ["rootCauseWhys"])).toEqual({
      kind: "diff",
      fields: { rootCauseWhys: { from: ["a", "b"], to: ["a", "c"] } },
    });
  });
});
