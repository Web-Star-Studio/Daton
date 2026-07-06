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

  it("casa case-insensitive: usa a grafia atual como value + label canônico (sem duplicar)", () => {
    const opts = toNameOptions(["Ana", "Bruno"], "ana");
    expect(opts).toHaveLength(2);
    // value = grafia atual ("ana") p/ o SearchableSelect casar exatamente; label canônico
    expect(opts[0]).toEqual({ value: "ana", label: "Ana" });
    expect(opts[1]).toEqual({ value: "Bruno", label: "Bruno" });
  });

  it("#118: valor legado com grafia diferente do catálogo continua selecionável (não vira placeholder)", () => {
    const opts = toNameOptions(["João Silva", "Maria"], "joão silva");
    const match = opts.find((o) => o.value === "joão silva");
    expect(match).toBeDefined();
    expect(match?.label).toBe("João Silva");
    expect(opts).toHaveLength(2); // não duplica
  });

  it("ignora valor atual vazio", () => {
    expect(toNameOptions(["Ana"], "")).toEqual([{ value: "Ana", label: "Ana" }]);
    expect(toNameOptions(["Ana"], "   ")).toEqual([
      { value: "Ana", label: "Ana" },
    ]);
  });
});
