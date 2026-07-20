import { describe, it, expect } from "vitest";
import { buildCatalogMeta } from "@/pages/app/aprendizagem/gestao/_lib/catalog-meta";

describe("buildCatalogMeta", () => {
  const normLabelById = new Map([[1, "ISO 9001"], [2, "ISO 14001"]]);

  it("mapeia normLabels e isCritical por item", () => {
    const meta = buildCatalogMeta(
      [
        { id: 10, normIds: [1, 2], isCritical: true },
        { id: 11, normIds: [], isCritical: false },
      ],
      normLabelById,
    );
    expect(meta.get(10)).toEqual({ normLabels: ["ISO 9001", "ISO 14001"], isCritical: true });
    expect(meta.get(11)).toEqual({ normLabels: [], isCritical: false });
  });

  it("ignora normId sem rótulo conhecido e trata campos ausentes", () => {
    const meta = buildCatalogMeta([{ id: 12, normIds: [1, 99] }], normLabelById);
    expect(meta.get(12)).toEqual({ normLabels: ["ISO 9001"], isCritical: false });
  });
});
