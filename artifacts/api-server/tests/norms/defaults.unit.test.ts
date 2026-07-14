import { describe, expect, it } from "vitest";
import {
  codesToNormIds,
  DEFAULT_NORM_LABELS,
  KPI_CODE_TO_LABEL,
} from "../../src/services/norms/defaults";

describe("codesToNormIds", () => {
  const labelToId = new Map<string, number>([
    ["iso 9001 · cl. 9.1", 10],
    ["iso 14001 · cl. 9.1", 11],
    ["iso 39001 · cl. 9.1", 12],
  ]);

  it("maps KPI codes to catalog ids via the label map (case-insensitive)", () => {
    expect(codesToNormIds(["9001", "39001"], labelToId)).toEqual([10, 12]);
  });

  it("drops codes with no catalog entry instead of throwing", () => {
    expect(codesToNormIds(["9001", "99999"], labelToId)).toEqual([10]);
  });

  it("dedupes and preserves first-seen order", () => {
    expect(codesToNormIds(["9001", "9001", "14001"], labelToId)).toEqual([
      10, 11,
    ]);
  });

  it("returns empty for empty input", () => {
    expect(codesToNormIds([], labelToId)).toEqual([]);
  });

  it("has the four seed labels and the three code mappings", () => {
    expect(DEFAULT_NORM_LABELS).toEqual([
      "ISO 9001 · cl. 9.1",
      "ISO 14001 · cl. 9.1",
      "ISO 39001 · cl. 9.1",
      "PR 2030",
    ]);
    expect(KPI_CODE_TO_LABEL).toEqual({
      "9001": "ISO 9001 · cl. 9.1",
      "14001": "ISO 14001 · cl. 9.1",
      "39001": "ISO 39001 · cl. 9.1",
    });
  });
});
