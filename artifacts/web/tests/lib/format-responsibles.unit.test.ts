import { describe, expect, it } from "vitest";
import { formatResponsibles } from "@/lib/action-plans-client";

describe("formatResponsibles", () => {
  it("devolve null quando não há ninguém", () => {
    expect(formatResponsibles(null, [])).toBeNull();
    expect(formatResponsibles(undefined, undefined)).toBeNull();
  });

  it("devolve só o ponto focal quando não há co-responsável", () => {
    expect(formatResponsibles("Maria Silva", [])).toBe("Maria Silva");
  });

  it("resume com +N quando há co-responsáveis", () => {
    expect(
      formatResponsibles("Maria Silva", [
        { userId: 2, name: "João Souza" },
        { userId: 3, name: "Ana Costa" },
      ]),
    ).toBe("Maria Silva +2");
  });

  it("sem ponto focal, mostra o primeiro co-responsável", () => {
    expect(
      formatResponsibles(null, [
        { userId: 2, name: "João Souza" },
        { userId: 3, name: "Ana Costa" },
      ]),
    ).toBe("João Souza +1");
  });
});
