import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAINING_CATEGORIES,
  DEFAULT_TRAINING_MODALITIES,
  DEFAULT_TRAINING_EVIDENCE_TYPES,
} from "../../src/services/training-catalog-options/defaults";
import { slugifyEvidenceCode } from "../../src/services/training-catalog-options/evidence";

describe("training catalog option defaults", () => {
  it("keeps the 5 categories that were hardcoded, in screen order", () => {
    expect(DEFAULT_TRAINING_CATEGORIES).toEqual([
      "Integração",
      "Reciclagem",
      "Capacitação",
      "Certificação",
      "Reunião",
    ]);
  });

  it("keeps the 4 modalities that were hardcoded, in screen order", () => {
    expect(DEFAULT_TRAINING_MODALITIES).toEqual([
      "Presencial",
      "EAD",
      "Híbrido",
      "Externo",
    ]);
  });

  it("seeds the 3 evidence types reusing the legacy codes + semantics", () => {
    expect(DEFAULT_TRAINING_EVIDENCE_TYPES).toEqual([
      {
        label: "Capacitação",
        code: "capacitacao",
        provesCompetency: true,
        requiresValidity: false,
      },
      {
        label: "Habilitação",
        code: "habilitacao",
        provesCompetency: true,
        requiresValidity: true,
      },
      {
        label: "Conscientização",
        code: "conscientizacao",
        provesCompetency: false,
        requiresValidity: false,
      },
    ]);
  });

  it("derives each default code from its label via slugify (rows stay valid)", () => {
    for (const t of DEFAULT_TRAINING_EVIDENCE_TYPES) {
      expect(slugifyEvidenceCode(t.label)).toBe(t.code);
    }
  });

  it("the proving default codes match the legacy proving set", () => {
    const proving = DEFAULT_TRAINING_EVIDENCE_TYPES.filter(
      (t) => t.provesCompetency,
    ).map((t) => t.code);
    expect(proving).toEqual(["capacitacao", "habilitacao"]);
  });
});

describe("slugifyEvidenceCode", () => {
  it("strips accents and lowercases", () => {
    expect(slugifyEvidenceCode("Capacitação")).toBe("capacitacao");
    expect(slugifyEvidenceCode("Habilitação")).toBe("habilitacao");
    expect(slugifyEvidenceCode("Conscientização")).toBe("conscientizacao");
  });

  it("reduces spaces/symbols to single underscores and trims them", () => {
    expect(slugifyEvidenceCode("  Palestra externa!! ")).toBe(
      "palestra_externa",
    );
    expect(slugifyEvidenceCode("DDS / Diário")).toBe("dds_diario");
  });

  it("never returns an empty string", () => {
    expect(slugifyEvidenceCode("—")).toBe("tipo");
    expect(slugifyEvidenceCode("")).toBe("tipo");
  });
});
