import { describe, it, expect } from "vitest";
import { buildCatalogMeta } from "@/pages/app/aprendizagem/gestao/_lib/catalog-meta";

describe("buildCatalogMeta", () => {
  const normLabelById = new Map([
    [1, "ISO 9001"],
    [2, "ISO 14001"],
  ]);

  it("mapeia normLabels por item", () => {
    const meta = buildCatalogMeta(
      [
        { id: 10, normIds: [1, 2] },
        { id: 11, normIds: [] },
      ],
      normLabelById,
    );
    expect(meta.get(10)).toEqual({ normLabels: ["ISO 9001", "ISO 14001"] });
    expect(meta.get(11)).toEqual({ normLabels: [] });
  });

  it("ignora normId sem rótulo conhecido e trata campos ausentes", () => {
    const meta = buildCatalogMeta(
      [{ id: 12, normIds: [1, 99] }],
      normLabelById,
    );
    expect(meta.get(12)).toEqual({ normLabels: ["ISO 9001"] });
  });
});
