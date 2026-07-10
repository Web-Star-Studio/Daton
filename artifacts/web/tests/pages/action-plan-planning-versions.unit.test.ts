import { describe, expect, it } from "vitest";
import {
  buildPlanningVersions,
  diffPlanningFields,
} from "@/pages/app/planos-acao/_components/planning-versions";

function entry(
  id: number,
  minutes: number,
  userId: number,
  from: unknown,
  to: unknown,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    userId,
    userName: `Usuário ${userId}`,
    createdAt: `2026-07-10T12:${String(minutes).padStart(2, "0")}:00.000Z`,
    changes: { kind: "diff", fields: { planning: { from, to } }, ...extra },
  };
}

const empty = { plan5w2h: null, rootCause: null, rootCauseWhys: null };
const a = { plan5w2h: { what: "A" }, rootCause: null, rootCauseWhys: null };
const b = { plan5w2h: { what: "B" }, rootCause: null, rootCauseWhys: null };
const c = { plan5w2h: { what: "C" }, rootCause: null, rootCauseWhys: null };

describe("buildPlanningVersions", () => {
  it("returns versions newest first", () => {
    const versions = buildPlanningVersions([
      entry(1, 0, 7, empty, a),
      entry(2, 30, 7, a, b),
    ]);

    expect(versions.map((v) => v.activityId)).toEqual([2, 1]);
  });

  /**
   * The autosave writes one entry per save; typing in three pauses leaves three entries.
   * The log stays intact (audit trail); the screen folds what is obviously the same session.
   */
  it("groups consecutive saves by the same author inside the 10-minute window", () => {
    const versions = buildPlanningVersions([
      entry(1, 0, 7, empty, a),
      entry(2, 3, 7, a, b),
      entry(3, 6, 7, b, c),
    ]);

    expect(versions).toHaveLength(1);
    expect(versions[0].activityId).toBe(3);
    expect(versions[0].to).toEqual(c);
    // The `from` is the FIRST save of the group: it shows the jump from what existed before.
    expect(versions[0].from).toEqual(empty);
    expect(versions[0].createdAt).toBe("2026-07-10T12:00:00.000Z");
    expect(versions[0].saves).toBe(3);
  });

  it("does not group different authors", () => {
    const versions = buildPlanningVersions([
      entry(1, 0, 7, empty, a),
      entry(2, 1, 9, a, b),
    ]);
    expect(versions).toHaveLength(2);
  });

  it("does not group saves further apart than the window", () => {
    const versions = buildPlanningVersions([
      entry(1, 0, 7, empty, a),
      entry(2, 45, 7, a, b),
    ]);
    expect(versions).toHaveLength(2);
  });

  it("ignores entries without a planning block", () => {
    const legacy = {
      id: 9,
      userId: 7,
      userName: "Usuário 7",
      createdAt: "2026-07-10T12:00:00.000Z",
      changes: { kind: "diff", fields: { rootCause: { from: "x", to: "y" } } },
    };
    expect(buildPlanningVersions([legacy])).toEqual([]);
  });

  it("marks a version that came from a restore", () => {
    const versions = buildPlanningVersions([
      entry(5, 0, 7, b, a, {
        restoredFrom: { activityId: 1, at: "2026-07-10T11:00:00.000Z" },
      }),
    ]);
    expect(versions[0].restoredFrom?.activityId).toBe(1);
  });
});

describe("diffPlanningFields", () => {
  it("labels changed 5W2H fields, the root cause and the whys", () => {
    const changes = diffPlanningFields(
      {
        plan5w2h: { what: "A", how: "igual" },
        rootCause: "Antes",
        rootCauseWhys: ["p1"],
      },
      {
        plan5w2h: { what: "B", how: "igual" },
        rootCause: "Depois",
        rootCauseWhys: ["p1", "p2"],
      },
    );

    expect(changes).toEqual([
      { label: "O quê", before: "A", after: "B" },
      { label: "Causa raiz", before: "Antes", after: "Depois" },
      { label: "5 porquês", before: "p1", after: "p1 · p2" },
    ]);
  });

  it("shows an em dash for what did not exist before", () => {
    const changes = diffPlanningFields(
      { plan5w2h: null, rootCause: null, rootCauseWhys: null },
      { plan5w2h: { what: "Novo" }, rootCause: null, rootCauseWhys: null },
    );
    expect(changes).toEqual([{ label: "O quê", before: "—", after: "Novo" }]);
  });

  it("returns an empty list when nothing changed", () => {
    const same = {
      plan5w2h: { what: "A" },
      rootCause: null,
      rootCauseWhys: null,
    };
    expect(diffPlanningFields(same, { ...same })).toEqual([]);
  });
});
