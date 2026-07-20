import { describe, it, expect } from "vitest";
import { computeTrainingCounters } from "@/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations";

describe("computeTrainingCounters — não aplicável", () => {
  it("NA fica fora do total e dos 3 contadores, e tem contagem própria", () => {
    const r = computeTrainingCounters(
      [
        { status: "concluido", expirationDate: null },
        { status: "pendente", expirationDate: null },
        { status: "nao_aplicavel", expirationDate: null },
        // NA com validade vencida continua NA — não conta como vencido
        { status: "nao_aplicavel", expirationDate: "2020-01-01" },
      ],
      "2026-07-20",
    );
    expect(r.feitos).toBe(1);
    expect(r.pendentes).toBe(1);
    expect(r.vencidos).toBe(0);
    expect(r.naoAplicavel).toBe(2);
    expect(r.total).toBe(2); // total ignora os NA
  });
});
