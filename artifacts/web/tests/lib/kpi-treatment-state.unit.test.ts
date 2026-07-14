import { kpiTreatmentState } from "@/lib/kpi-client";
import { describe, it, expect } from "vitest";

// Args: (justificationsCount, openActionPlansCount, completedActionPlansCount)
describe("kpiTreatmentState — resolvido / em tratamento / não tratado", () => {
  it("nada trata o desvio → untreated", () => {
    expect(kpiTreatmentState(0, 0, 0)).toEqual({ kind: "untreated", label: null });
  });

  it("só justificativa → resolved (com justificativa)", () => {
    expect(kpiTreatmentState(2, 0, 0)).toEqual({
      kind: "resolved",
      label: "com justificativa",
    });
  });

  it("só plano CONCLUÍDO → resolved (com plano de ação concluído)", () => {
    expect(kpiTreatmentState(0, 0, 1)).toEqual({
      kind: "resolved",
      label: "com plano de ação concluído",
    });
  });

  it("só plano ABERTO (não concluído) → in_treatment", () => {
    expect(kpiTreatmentState(0, 1, 0)).toEqual({ kind: "in_treatment", label: null });
    expect(kpiTreatmentState(0, 3, 0)).toEqual({ kind: "in_treatment", label: null });
  });

  it("justificativa + plano (aberto ou concluído) → resolved (ambos)", () => {
    expect(kpiTreatmentState(1, 1, 0)).toEqual({
      kind: "resolved",
      label: "com justificativa e plano de ação",
    });
    expect(kpiTreatmentState(1, 0, 1)).toEqual({
      kind: "resolved",
      label: "com justificativa e plano de ação",
    });
  });

  it("plano concluído prevalece sobre plano aberto → resolved", () => {
    expect(kpiTreatmentState(0, 2, 1)).toEqual({
      kind: "resolved",
      label: "com plano de ação concluído",
    });
  });
});
