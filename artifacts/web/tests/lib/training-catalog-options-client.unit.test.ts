import { describe, expect, it } from "vitest";
import {
  optionsOfKind,
  activeLabelsOfKind,
  mergeLabelOptions,
  activeEvidenceTypes,
  evidenceTypeByCode,
  evidenceCodeProves,
  type TrainingCatalogOption,
} from "@/lib/training-catalog-options-client";

function opt(p: Partial<TrainingCatalogOption>): TrainingCatalogOption {
  return {
    id: p.id ?? 1,
    organizationId: 1,
    kind: p.kind ?? "category",
    label: p.label ?? "X",
    code: p.code ?? null,
    active: p.active ?? true,
    sortOrder: p.sortOrder ?? 0,
    provesCompetency: p.provesCompetency ?? false,
    requiresValidity: p.requiresValidity ?? false,
  };
}

const all: TrainingCatalogOption[] = [
  opt({ id: 1, kind: "category", label: "Integração", active: true }),
  opt({ id: 2, kind: "category", label: "Reciclagem", active: false }),
  opt({ id: 3, kind: "modality", label: "Presencial", active: true }),
  opt({
    id: 4,
    kind: "evidence_type",
    label: "Capacitação",
    code: "capacitacao",
    active: true,
    provesCompetency: true,
  }),
  opt({
    id: 5,
    kind: "evidence_type",
    label: "Conscientização",
    code: "conscientizacao",
    active: true,
    provesCompetency: false,
  }),
  opt({
    id: 6,
    kind: "evidence_type",
    label: "Habilitação (arquivada)",
    code: "habilitacao",
    active: false,
    provesCompetency: true,
    requiresValidity: true,
  }),
];

describe("optionsOfKind / activeLabelsOfKind", () => {
  it("filters by kind", () => {
    expect(optionsOfKind(all, "category").map((o) => o.id)).toEqual([1, 2]);
  });
  it("returns only active labels of a kind", () => {
    expect(activeLabelsOfKind(all, "category")).toEqual(["Integração"]);
  });
});

describe("mergeLabelOptions", () => {
  it("appends extras not already present, dedup case-insensitive, catalog order first", () => {
    expect(
      mergeLabelOptions(["Integração"], ["reciclagem", "Integração", "Reunião"]),
    ).toEqual(["Integração", "reciclagem", "Reunião"]);
  });
  it("ignores empty/nullish extras", () => {
    expect(mergeLabelOptions(["A"], ["", null, undefined, "  "])).toEqual(["A"]);
  });
});

describe("evidence type helpers", () => {
  it("activeEvidenceTypes drops inactive ones", () => {
    expect(activeEvidenceTypes(all).map((o) => o.code)).toEqual([
      "capacitacao",
      "conscientizacao",
    ]);
  });

  it("evidenceTypeByCode includes inactive (so classified items still resolve)", () => {
    const byCode = evidenceTypeByCode(all);
    expect(byCode.get("habilitacao")?.label).toBe("Habilitação (arquivada)");
  });

  it("evidenceCodeProves resolves proves flag, even for inactive types", () => {
    const byCode = evidenceTypeByCode(all);
    expect(evidenceCodeProves(byCode, "capacitacao")).toBe(true);
    expect(evidenceCodeProves(byCode, "habilitacao")).toBe(true); // inativo mas comprova
    expect(evidenceCodeProves(byCode, "conscientizacao")).toBe(false);
    expect(evidenceCodeProves(byCode, "")).toBe(false);
    expect(evidenceCodeProves(byCode, null)).toBe(false);
    expect(evidenceCodeProves(byCode, "inexistente")).toBe(false);
  });
});
