import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFECTIVENESS_METHOD_LABELS,
  LEGACY_METHOD_TO_LABEL,
} from "../../src/services/effectiveness-methods/defaults";

describe("effectiveness method defaults", () => {
  it("has the six seed labels, in screen order", () => {
    expect(DEFAULT_EFFECTIVENESS_METHOD_LABELS).toEqual([
      "Verificação por indicador",
      "Auditoria interna",
      "Inspeção física (campo)",
      "Verificação por treinamento",
      "Verificação por amostragem",
      "Redução de risco",
    ]);
  });

  it("maps every legacy enum code to a seed label", () => {
    expect(LEGACY_METHOD_TO_LABEL).toEqual({
      indicator: "Verificação por indicador",
      internal_audit: "Auditoria interna",
      field_inspection: "Inspeção física (campo)",
      training: "Verificação por treinamento",
      sampling: "Verificação por amostragem",
      risk_reduction: "Redução de risco",
    });
    // Todo código legado tem semente correspondente — senão o backfill perderia dados.
    for (const label of Object.values(LEGACY_METHOD_TO_LABEL)) {
      expect(DEFAULT_EFFECTIVENESS_METHOD_LABELS).toContain(label);
    }
  });
});
