import { describe, expect, it } from "vitest";
import type { ActionPlanActivityLogEntry } from "@/lib/action-plans-client";
import {
  buildPlanningVersions,
  diffPlanningFields,
  type PlanningBlock,
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

const empty: PlanningBlock = { rootCause: null, analyses: null };
const a: PlanningBlock = { rootCause: "A", analyses: null };
const b: PlanningBlock = { rootCause: "B", analyses: null };
const c: PlanningBlock = { rootCause: "C", analyses: null };

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

  /**
   * The author FK is `ON DELETE SET NULL`, so two DIFFERENT removed users read as
   * `userId: null`. `null === null` would fold them into one version — and the
   * intermediate version would vanish from the restore list. An unknown author
   * must never group.
   */
  it("never groups entries whose author is unknown, even inside the window", () => {
    const unknownAuthor = (
      id: number,
      minutes: number,
      from: unknown,
      to: unknown,
    ) => ({
      id,
      userId: null,
      userName: null,
      createdAt: `2026-07-10T12:${String(minutes).padStart(2, "0")}:00.000Z`,
      changes: { kind: "diff", fields: { planning: { from, to } } },
    });

    const versions = buildPlanningVersions([
      unknownAuthor(1, 0, empty, a),
      unknownAuthor(2, 1, a, b),
    ]);

    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.activityId)).toEqual([2, 1]);
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

  /**
   * `useActionPlanActivity` (Task 6) hands `buildPlanningVersions` the raw generated
   * type straight from the API — `userId`, `userName` and `changes` are optional there,
   * unlike a hand-picked fixture. This must typecheck without a cast.
   */
  it("accepts the generated ActionPlanActivityLogEntry type as-is", () => {
    const raw: ActionPlanActivityLogEntry[] = [
      {
        id: 1,
        actionPlanId: 10,
        action: "updated",
        createdAt: "2026-07-10T12:00:00.000Z",
        changes: { kind: "diff", fields: { planning: { from: empty, to: a } } },
      },
    ];

    const versions = buildPlanningVersions(raw);

    expect(versions).toHaveLength(1);
    expect(versions[0].userId).toBeNull();
    expect(versions[0].userName).toBeNull();
  });
});

describe("diffPlanningFields", () => {
  it("labels a changed root cause", () => {
    const changes = diffPlanningFields(
      { rootCause: "Antes", analyses: null },
      { rootCause: "Depois", analyses: null },
    );

    expect(changes).toEqual([
      { label: "Causa raiz", before: "Antes", after: "Depois" },
    ]);
  });

  it("returns an empty list when nothing changed", () => {
    const same: PlanningBlock = {
      rootCause: "Causa",
      analyses: [{ key: "five_whys", data: { whys: ["Por que 1"] } }],
    };
    expect(diffPlanningFields(same, { ...same })).toEqual([]);
  });

  /**
   * The root cause is DISPLAYED trimmed (via `text()`), so it must be COMPARED
   * trimmed too — otherwise a legacy `" causa "` collapsing to `"causa"` would
   * render a history line whose before and after are identical on screen.
   */
  it("does not flag a root cause that only differs by surrounding whitespace", () => {
    const changes = diffPlanningFields(
      { rootCause: " causa ", analyses: null },
      { rootCause: "causa", analyses: null },
    );
    expect(changes).toEqual([]);
  });

  describe("tratativas (analyses)", () => {
    it("flags a tratativa added between versions, using its default catalog label", () => {
      const changes = diffPlanningFields(
        { rootCause: null, analyses: null },
        {
          rootCause: null,
          analyses: [
            { key: "ishikawa", data: { causes: [], whys: ["Por que trava?"] } },
          ],
        },
      );

      expect(changes).toEqual([
        {
          label: "Ishikawa + 5 Porquês adicionada",
          before: "—",
          after: "1 porquê",
        },
      ]);
    });

    it("shows 'Não preenchida' as the after when the added tratativa has no content yet", () => {
      const changes = diffPlanningFields(
        { rootCause: null, analyses: null },
        { rootCause: null, analyses: [{ key: "fmea", data: { rows: [] } }] },
      );

      expect(changes).toEqual([
        { label: "FMEA adicionada", before: "—", after: "Não preenchida" },
      ]);
    });

    it("flags a tratativa removed between versions", () => {
      const changes = diffPlanningFields(
        {
          rootCause: null,
          analyses: [
            {
              key: "fmea",
              data: { rows: [{ id: "1", failureMode: "Vazamento" }] },
            },
          ],
        },
        { rootCause: null, analyses: null },
      );

      expect(changes).toEqual([
        { label: "FMEA removida", before: "1 modo de falha", after: "—" },
      ]);
    });

    it("flags a tratativa edited between versions, comparing its resumo before and after", () => {
      const changes = diffPlanningFields(
        {
          rootCause: null,
          analyses: [{ key: "five_whys", data: { whys: ["Por que 1"] } }],
        },
        {
          rootCause: null,
          analyses: [
            { key: "five_whys", data: { whys: ["Por que 1", "Por que 2"] } },
          ],
        },
      );

      expect(changes).toEqual([
        { label: "5 Porquês", before: "1 porquê", after: "2 porquês" },
      ]);
    });

    it("does not flag a tratativa whose resumo is unchanged, even if its underlying data changed", () => {
      const changes = diffPlanningFields(
        {
          rootCause: null,
          analyses: [{ key: "five_whys", data: { whys: ["Por que 1"] } }],
        },
        {
          rootCause: null,
          analyses: [
            { key: "five_whys", data: { whys: ["Por que 1 (revisado)"] } },
          ],
        },
      );

      // Both sides summarize to "1 porquê" — the diff compares `resumoAnalise`,
      // not the raw data, so this reads as unchanged.
      expect(changes).toEqual([]);
    });

    it("diffs a full analyses array: additions, edits and removals together", () => {
      const changes = diffPlanningFields(
        {
          rootCause: null,
          analyses: [
            { key: "five_whys", data: { whys: ["Por que 1"] } },
            { key: "fmea", data: { rows: [] } },
          ],
        },
        {
          rootCause: null,
          analyses: [
            {
              key: "five_whys",
              data: { whys: ["Por que 1", "Por que 2"] },
            },
            { key: "ishikawa", data: { causes: [], whys: [] } },
          ],
        },
      );

      expect(changes).toEqual([
        { label: "5 Porquês", before: "1 porquê", after: "2 porquês" },
        {
          label: "Ishikawa + 5 Porquês adicionada",
          before: "—",
          after: "Não preenchida",
        },
        { label: "FMEA removida", before: "Não preenchida", after: "—" },
      ]);
    });
  });

  describe("compatibilidade com versões antigas (plan5w2h legado)", () => {
    /**
     * Entradas do activity log gravadas ANTES desta feature guardam o 5W2H em
     * `plan5w2h` em vez de `analyses` — o formato real no banco, não um fixture
     * ajustado ao tipo novo. O diff precisa tolerar isso sem lançar.
     */
    it("renders a legacy plan5w2h block as a single fallback line, without crashing on the old shape", () => {
      const legacyFrom = {
        plan5w2h: { what: "O quê antigo", why: "Por quê antigo" },
        rootCause: "Causa legada",
        rootCauseWhys: ["Porquê legado 1"],
      } as unknown as PlanningBlock;
      const legacyTo = {
        plan5w2h: { what: "O quê editado", why: "Por quê antigo" },
        rootCause: "Causa legada",
        rootCauseWhys: ["Porquê legado 1"],
      } as unknown as PlanningBlock;

      expect(() => diffPlanningFields(legacyFrom, legacyTo)).not.toThrow();

      const changes = diffPlanningFields(legacyFrom, legacyTo);
      expect(changes).toEqual([
        {
          label: "Plano 5W2H (formato anterior)",
          before: "O quê: O quê antigo · Por quê: Por quê antigo",
          after: "O quê: O quê editado · Por quê: Por quê antigo",
        },
      ]);
    });

    it("does not flag the legacy line when plan5w2h did not change", () => {
      const legacy = {
        plan5w2h: { what: "O quê antigo" },
        rootCause: "Causa legada",
        rootCauseWhys: ["Porquê legado 1"],
      } as unknown as PlanningBlock;

      expect(diffPlanningFields(legacy, { ...legacy })).toEqual([]);
    });

    /**
     * The realistic transition point: the FIRST save after this feature shipped has
     * a legacy `from` (no `analyses` key at all) and a current-shape `to`. Neither
     * side should crash the other's reader.
     */
    it("diffs across the format transition (legacy from, current to) without crashing", () => {
      const legacyFrom = {
        plan5w2h: { what: "O quê antigo" },
        rootCause: "Causa legada",
        rootCauseWhys: ["Porquê legado 1"],
      } as unknown as PlanningBlock;
      const currentTo: PlanningBlock = {
        rootCause: "Causa legada",
        analyses: [{ key: "five_whys", data: { whys: ["Porquê legado 1"] } }],
      };

      const changes = diffPlanningFields(legacyFrom, currentTo);

      expect(changes).toEqual([
        {
          label: "5 Porquês adicionada",
          before: "—",
          after: "1 porquê",
        },
        {
          label: "Plano 5W2H (formato anterior)",
          before: "O quê: O quê antigo",
          after: "—",
        },
      ]);
    });
  });
});
