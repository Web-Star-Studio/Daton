import { describe, expect, it } from "vitest";
import { describeChanges } from "@/pages/app/planos-acao/_components/comentarios-historico";

const planning = {
  from: { plan5w2h: { what: "A" }, rootCause: null, rootCauseWhys: null },
  to: { plan5w2h: { what: "B" }, rootCause: "Nova causa", rootCauseWhys: null },
};

describe("describeChanges", () => {
  it("summarizes a planning version in words, never as [object Object]", () => {
    const text = describeChanges({
      changes: { kind: "diff", fields: { planning } },
    });

    expect(text).toBe("Planejamento: O quê, Causa raiz");
    expect(text).not.toContain("[object Object]");
  });

  it("marks an entry that came from a restore", () => {
    const text = describeChanges({
      changes: {
        kind: "diff",
        fields: { planning },
        restoredFrom: { activityId: 3, at: "2026-07-10T12:00:00.000Z" },
      },
    });

    expect(text).toContain("Planejamento restaurado");
  });

  it("keeps rendering plain fields as before", () => {
    const text = describeChanges({
      changes: {
        kind: "diff",
        fields: { priority: { from: "medium", to: "high" } },
      },
    });

    expect(text).toBe("priority: medium → high");
  });

  it("still renders legacy loose rootCause entries", () => {
    const text = describeChanges({
      changes: { kind: "diff", fields: { rootCause: { from: "x", to: "y" } } },
    });

    expect(text).toBe("rootCause: x → y");
  });

  it("returns null when there is nothing to describe", () => {
    expect(describeChanges({ changes: null })).toBeNull();
  });

  it("surfaces the snapshotted `what` for a plan-action entry", () => {
    const text = describeChanges({
      changes: { kind: "action", actionId: 7, what: "Trocar o filtro da bomba" },
    });
    expect(text).toBe("Trocar o filtro da bomba");
  });
});
