import { describe, expect, it } from "vitest";
import { buildNormLabelMap } from "@/lib/norms-client";

describe("buildNormLabelMap", () => {
  it("maps id to label, including inactive (so referenced items still render)", () => {
    const map = buildNormLabelMap([
      {
        id: 1,
        organizationId: 9,
        label: "ISO 9001",
        active: true,
        sortOrder: 0,
      },
      {
        id: 2,
        organizationId: 9,
        label: "PR 2030",
        active: false,
        sortOrder: 1,
      },
    ]);
    expect(map.get(1)).toBe("ISO 9001");
    expect(map.get(2)).toBe("PR 2030");
    expect(map.get(999)).toBeUndefined();
  });
});
