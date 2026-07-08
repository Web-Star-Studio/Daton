import { normalizeForSearch } from "@/lib/kpi-client";
import { describe, it, expect } from "vitest";

describe("normalizeForSearch — busca sem acento e sem caixa", () => {
  it("remove acentos e baixa a caixa", () => {
    expect(normalizeForSearch("Óleo Usado")).toBe("oleo usado");
    expect(normalizeForSearch("Manutenção")).toBe("manutencao");
    expect(normalizeForSearch("ÁÉÍÓÚç")).toBe("aeiouc");
  });

  it('"oleo" (sem acento) casa com "Óleo Usado"', () => {
    const q = normalizeForSearch("oleo");
    expect(normalizeForSearch("Óleo Usado").includes(q)).toBe(true);
  });

  it('"manutencao" casa com "Manutenção Preventiva"', () => {
    const q = normalizeForSearch("manutencao");
    expect(normalizeForSearch("Manutenção Preventiva").includes(q)).toBe(true);
  });
});
