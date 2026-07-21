import { describe, expect, it } from "vitest";
import { parseWhenDate } from "../scripts/src/migrate/tratativas-e-acoes-backfill";

/** O "Quando" legado é texto livre; só datas inequívocas viram `due_date`. O resto
 *  (null) cai no prazo do plano e o texto original é preservado em `notes`. */
describe("parseWhenDate", () => {
  it("aceita dd/mm/aaaa válido", () => {
    expect(parseWhenDate("15/03/2025")?.toISOString().slice(0, 10)).toBe("2025-03-15");
    expect(parseWhenDate("1-1-2026")?.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("aceita ISO aaaa-mm-dd válido", () => {
    expect(parseWhenDate("2025-03-15")?.toISOString().slice(0, 10)).toBe("2025-03-15");
    // aceita sufixo de hora, usando a parte da data
    expect(parseWhenDate("2025-03-15T10:00:00")?.toISOString().slice(0, 10)).toBe("2025-03-15");
  });

  it("REJEITA data ISO impossível em vez de rolar o mês (2025-02-31 ≠ 03/03)", () => {
    expect(parseWhenDate("2025-02-31")).toBeNull();
    expect(parseWhenDate("2025-13-01")).toBeNull();
    expect(parseWhenDate("2025-00-10")).toBeNull();
  });

  it("REJEITA data br impossível", () => {
    expect(parseWhenDate("31/02/2025")).toBeNull();
    expect(parseWhenDate("32/01/2025")).toBeNull();
  });

  it("devolve null para texto não-data e vazio", () => {
    expect(parseWhenDate("Julho/26")).toBeNull();
    expect(parseWhenDate("próxima reunião")).toBeNull();
    expect(parseWhenDate("   ")).toBeNull();
  });
});
