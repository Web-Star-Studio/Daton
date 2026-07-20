import { describe, expect, it } from "vitest";
import {
  DIAGNOSIS_PERIODICITY_LABELS,
  diagnosisBadgeLabel,
} from "@/lib/road-safety-client";

describe("diagnosisBadgeLabel", () => {
  const now = new Date(2026, 6, 14); // 14/07/2026

  it("sem revisão programada mostra travessão", () => {
    expect(diagnosisBadgeLabel("none", null, now)).toBe("—");
  });

  it("vencido mostra 'Vencido'", () => {
    expect(diagnosisBadgeLabel("overdue", "2026-07-01", now)).toBe("Vencido");
  });

  it("a vencer mostra a contagem de dias", () => {
    expect(diagnosisBadgeLabel("due_soon", "2026-07-18", now)).toBe(
      "Vence em 4 dias",
    );
    expect(diagnosisBadgeLabel("due_soon", "2026-07-15", now)).toBe(
      "Vence em 1 dia",
    );
    expect(diagnosisBadgeLabel("due_soon", "2026-07-14", now)).toBe(
      "Vence hoje",
    );
  });

  it("em dia mostra a data do próximo", () => {
    expect(diagnosisBadgeLabel("ok", "2027-01-31", now)).toBe(
      "Próximo em 31/01/2027",
    );
  });
});

describe("DIAGNOSIS_PERIODICITY_LABELS", () => {
  it("tem rótulo em PT-BR para as quatro cadências", () => {
    expect(DIAGNOSIS_PERIODICITY_LABELS.monthly).toBe("Mensal");
    expect(DIAGNOSIS_PERIODICITY_LABELS.quarterly).toBe("Trimestral");
    expect(DIAGNOSIS_PERIODICITY_LABELS.semiannual).toBe("Semestral");
    expect(DIAGNOSIS_PERIODICITY_LABELS.annual).toBe("Anual");
  });
});
