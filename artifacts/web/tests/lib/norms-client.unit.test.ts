import { describe, expect, it } from "vitest";
import { buildNormLabelMap, shortNormLabel } from "@/lib/norms-client";

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

describe("shortNormLabel", () => {
  it("keeps only the code when the label is 'código · descrição'", () => {
    // O caso que quebrava o card do catálogo: a descrição espremia o título.
    expect(
      shortNormLabel("NR-11 · Transporte e Movimentação de Materiais"),
    ).toBe("NR-11");
    expect(shortNormLabel("NR-35 · Trabalho em Altura")).toBe("NR-35");
  });

  it("accepts the other separators used in free-text labels", () => {
    expect(shortNormLabel("NR-12 — Segurança em Máquinas")).toBe("NR-12");
    expect(shortNormLabel("NR-10 – Eletricidade")).toBe("NR-10");
    expect(shortNormLabel("ISO 14001 | Ambiental")).toBe("ISO 14001");
  });

  it("returns the whole label when there is no separator", () => {
    expect(shortNormLabel("ISO 9001")).toBe("ISO 9001");
    expect(shortNormLabel("PR 2030")).toBe("PR 2030");
  });

  it("does not split on hyphens inside a code", () => {
    // "NR-11" não tem espaços em volta do hífen — não é separador.
    expect(shortNormLabel("NR-11")).toBe("NR-11");
    expect(shortNormLabel("ISO/IEC 17025")).toBe("ISO/IEC 17025");
  });

  it("trims and survives degenerate labels", () => {
    expect(shortNormLabel("  ISO 9001  ")).toBe("ISO 9001");
    expect(shortNormLabel("· solta")).toBe("· solta");
    expect(shortNormLabel("")).toBe("");
  });
});
