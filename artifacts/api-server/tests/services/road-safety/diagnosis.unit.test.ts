import { describe, expect, it } from "vitest";
import {
  diagnosisStatus,
  nextDiagnosisDate,
} from "../../../src/services/road-safety/diagnosis";

const CREATED = new Date(2026, 0, 10); // 10/01/2026, local

describe("nextDiagnosisDate", () => {
  it("soma o intervalo de cada periodicidade à data do último diagnóstico", () => {
    const base = { factorCreatedAt: CREATED, lastReferenceDate: "2026-01-31" };
    expect(nextDiagnosisDate({ ...base, periodicity: "monthly" })).toBe(
      "2026-02-28",
    );
    expect(nextDiagnosisDate({ ...base, periodicity: "quarterly" })).toBe(
      "2026-04-30",
    );
    expect(nextDiagnosisDate({ ...base, periodicity: "semiannual" })).toBe(
      "2026-07-31",
    );
    expect(nextDiagnosisDate({ ...base, periodicity: "annual" })).toBe(
      "2027-01-31",
    );
  });

  it("sem periodicidade não há vencimento", () => {
    expect(
      nextDiagnosisDate({
        periodicity: null,
        factorCreatedAt: CREATED,
        lastReferenceDate: "2026-01-31",
      }),
    ).toBeNull();
  });

  it("fator sem diagnóstico conta a partir da criação do fator", () => {
    expect(
      nextDiagnosisDate({
        periodicity: "annual",
        factorCreatedAt: CREATED,
        lastReferenceDate: null,
      }),
    ).toBe("2027-01-10");
  });
});

describe("diagnosisStatus", () => {
  const now = new Date(2026, 6, 14); // 14/07/2026

  it("classifica vencido, vence em breve e em dia", () => {
    expect(diagnosisStatus("2026-07-13", now)).toBe("overdue");
    expect(diagnosisStatus("2026-07-18", now)).toBe("due_soon"); // dentro da janela de 7 dias
    expect(diagnosisStatus("2026-07-14", now)).toBe("due_soon"); // vence hoje
    expect(diagnosisStatus("2026-08-30", now)).toBe("ok");
  });

  it("sem data de vencimento o status é 'none'", () => {
    expect(diagnosisStatus(null, now)).toBe("none");
  });

  it("respeita uma janela de 'vence em breve' customizada", () => {
    expect(diagnosisStatus("2026-07-25", now, 30)).toBe("due_soon");
  });
});
