import { describe, it, expect } from "vitest";
import { compareEducation } from "../../../src/services/aprendizagem/education-conformance";

// Mesmos casos de artifacts/web/tests/pages/aprendizagem/ficha-derivations.unit.test.ts
// — as duas cópias (client/ficha-derivations.ts, server/education-conformance.ts)
// precisam concordar; qualquer divergência futura tem que quebrar AMBOS os
// arquivos de teste, não só um.
describe("compareEducation (porta server-side)", () => {
  it("possui >= requerido -> atende", () => {
    expect(compareEducation("Superior Completo", "Médio Completo")).toBe(
      "atende",
    );
    expect(compareEducation("Médio Completo", "Médio Completo")).toBe("atende");
  });
  it("possui < requerido -> gap", () => {
    expect(compareEducation("Médio Incompleto", "Médio Completo")).toBe("gap");
  });
  it("sem requerido (ou fora do mapa) -> sem_requisito", () => {
    expect(compareEducation("Médio Completo", null)).toBe("sem_requisito");
    expect(compareEducation("Médio Completo", "Não Aplicável")).toBe(
      "sem_requisito",
    );
  });
  it("sem possui -> nao_informado", () => {
    expect(compareEducation(null, "Médio Completo")).toBe("nao_informado");
  });

  // Caso relatado pela cliente: cargo com escolaridade mínima do vocabulário
  // de EDUCATION_OPTIONS (position-form-dialog.tsx), colaborador com o
  // vocabulário de colaboradores/index.tsx.
  it("cargo exige Ensino Médio Completo, colaborador tem Fundamental Incompleto -> gap", () => {
    expect(
      compareEducation("Fundamental Incompleto", "Ensino Médio Completo"),
    ).toBe("gap");
  });
  it("cargo exige Técnico, colaborador tem Superior Completo -> atende", () => {
    expect(compareEducation("Superior Completo", "Técnico")).toBe("atende");
  });
});
