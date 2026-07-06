import { describe, it, expect } from "vitest";
import { toNameOptions } from "@/components/ui/searchable-select";

describe("toNameOptions", () => {
  it("mapeia nomes para { value, label } iguais", () => {
    expect(toNameOptions(["Ana", "Bruno"])).toEqual([
      { value: "Ana", label: "Ana" },
      { value: "Bruno", label: "Bruno" },
    ]);
  });

  it("faz trim e ignora vazios/nulos", () => {
    expect(toNameOptions(["  Ana  ", "", null, undefined, "   "])).toEqual([
      { value: "Ana", label: "Ana" },
    ]);
  });

  it("deduplica case-insensitive (mantém a primeira grafia)", () => {
    expect(toNameOptions(["Ana", "ANA", "ana"])).toEqual([
      { value: "Ana", label: "Ana" },
    ]);
  });

  it("injeta o valor atual (externo/legado) no topo quando não está na lista", () => {
    const opts = toNameOptions(["Ana", "Bruno"], "SENAI");
    expect(opts[0]).toEqual({ value: "SENAI", label: "SENAI" });
    expect(opts).toHaveLength(3);
  });

  it("não injeta o valor atual se já existir na lista (case-insensitive)", () => {
    const opts = toNameOptions(["Ana", "Bruno"], "ana");
    expect(opts).toHaveLength(2);
    expect(opts.map((o) => o.value)).toEqual(["Ana", "Bruno"]);
  });

  it("ignora valor atual vazio", () => {
    expect(toNameOptions(["Ana"], "")).toEqual([{ value: "Ana", label: "Ana" }]);
    expect(toNameOptions(["Ana"], "   ")).toEqual([
      { value: "Ana", label: "Ana" },
    ]);
  });
});
