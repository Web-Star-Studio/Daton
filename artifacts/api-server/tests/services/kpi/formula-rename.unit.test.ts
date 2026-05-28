import { describe, expect, it } from "vitest";

import {
  detectVariableRenames,
  migrateInputsForRename,
} from "../../../src/services/kpi/formula-rename";

describe("detectVariableRenames", () => {
  it("sem mudança de chaves → []", () => {
    const vars = [
      { key: "a", label: "Alpha" },
      { key: "b", label: "Beta" },
    ];
    expect(detectVariableRenames(vars, vars)).toEqual([]);
  });

  it("rename 1-pra-1 com posições iguais → pareamento posicional", () => {
    const oldVars = [
      { key: "volume_gerado", label: "Volume gerado" },
    ];
    const newVars = [
      { key: "volume_gerado_mensalmente", label: "Volume gerado mensalmente" },
    ];
    expect(detectVariableRenames(oldVars, newVars)).toEqual([
      { from: "volume_gerado", to: "volume_gerado_mensalmente" },
    ]);
  });

  it("rename 2-pra-2 com posições iguais", () => {
    const oldVars = [
      { key: "acidentes_trabalho", label: "Acidentes de trabalho" },
      { key: "funcionarios_ativos", label: "Funcionários ativos" },
    ];
    const newVars = [
      { key: "numero_de_acidentes_de_trabalho", label: "Número de acidentes de trabalho" },
      { key: "funcionarios_ativos_no_cadastro", label: "Funcionários ativos no cadastro" },
    ];
    expect(detectVariableRenames(oldVars, newVars)).toEqual([
      { from: "acidentes_trabalho", to: "numero_de_acidentes_de_trabalho" },
      { from: "funcionarios_ativos", to: "funcionarios_ativos_no_cadastro" },
    ]);
  });

  it("rename misturado com variável inalterada", () => {
    const oldVars = [
      { key: "a", label: "Alpha" },
      { key: "c", label: "Gamma" },
    ];
    const newVars = [
      { key: "alfa", label: "Alfa" },
      { key: "c", label: "Gamma" },
    ];
    expect(detectVariableRenames(oldVars, newVars)).toEqual([
      { from: "a", to: "alfa" },
    ]);
  });

  it("adicionar variável sem remover → ambíguo, []", () => {
    const oldVars = [{ key: "a", label: "Alpha" }];
    const newVars = [
      { key: "a", label: "Alpha" },
      { key: "b", label: "Beta" },
    ];
    expect(detectVariableRenames(oldVars, newVars)).toEqual([]);
  });

  it("remover variável sem adicionar → ambíguo, []", () => {
    const oldVars = [
      { key: "a", label: "Alpha" },
      { key: "b", label: "Beta" },
    ];
    const newVars = [{ key: "a", label: "Alpha" }];
    expect(detectVariableRenames(oldVars, newVars)).toEqual([]);
  });

  it("|removed| != |added| → []", () => {
    const oldVars = [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ];
    const newVars = [
      { key: "x", label: "X" },
      { key: "y", label: "Y" },
      { key: "z", label: "Z" },
    ];
    expect(detectVariableRenames(oldVars, newVars)).toEqual([]);
  });

  it("rename + reordenação → ambíguo, []", () => {
    // Posições não batem com as chaves removidas/adicionadas
    const oldVars = [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ];
    const newVars = [
      { key: "b", label: "B" }, // movida pra posição 0
      { key: "alfa", label: "Alfa" }, // renomeou "a" mas tá na posição 1
    ];
    expect(detectVariableRenames(oldVars, newVars)).toEqual([]);
  });
});

describe("migrateInputsForRename", () => {
  it("renames vazio → inputs inalterado, changed=false", () => {
    const inputs = { a: 1, b: 2 };
    const res = migrateInputsForRename(inputs, []);
    expect(res.changed).toBe(false);
    expect(res.migrated).toEqual({ a: 1, b: 2 });
  });

  it("rename simples", () => {
    const inputs = { volume_gerado: 834 };
    const renames = [{ from: "volume_gerado", to: "volume_gerado_mensalmente" }];
    const res = migrateInputsForRename(inputs, renames);
    expect(res.changed).toBe(true);
    expect(res.migrated).toEqual({ volume_gerado_mensalmente: 834 });
  });

  it("preserva chaves não afetadas pelo rename", () => {
    const inputs = { a: 1, b: 2, c: 3 };
    const renames = [{ from: "b", to: "beta" }];
    const res = migrateInputsForRename(inputs, renames);
    expect(res.changed).toBe(true);
    expect(res.migrated).toEqual({ a: 1, beta: 2, c: 3 });
  });

  it("rename múltiplo", () => {
    const inputs = { acidentes_trabalho: 5, funcionarios_ativos: 100 };
    const renames = [
      { from: "acidentes_trabalho", to: "numero_de_acidentes_de_trabalho" },
      { from: "funcionarios_ativos", to: "funcionarios_ativos_no_cadastro" },
    ];
    const res = migrateInputsForRename(inputs, renames);
    expect(res.changed).toBe(true);
    expect(res.migrated).toEqual({
      numero_de_acidentes_de_trabalho: 5,
      funcionarios_ativos_no_cadastro: 100,
    });
  });

  it("from ausente nos inputs → pula esse rename", () => {
    const inputs = { c: 3 };
    const renames = [{ from: "a", to: "alfa" }];
    const res = migrateInputsForRename(inputs, renames);
    expect(res.changed).toBe(false);
    expect(res.migrated).toEqual({ c: 3 });
  });

  it("to já existe → pula pra não sobrescrever", () => {
    const inputs = { a: 1, alfa: 99 };
    const renames = [{ from: "a", to: "alfa" }];
    const res = migrateInputsForRename(inputs, renames);
    expect(res.changed).toBe(false);
    expect(res.migrated).toEqual({ a: 1, alfa: 99 });
  });

  it("inputs vazio", () => {
    const renames = [{ from: "a", to: "alfa" }];
    const res = migrateInputsForRename({}, renames);
    expect(res.changed).toBe(false);
    expect(res.migrated).toEqual({});
  });

  it("preserva valores null", () => {
    const inputs: Record<string, number | null> = { a: null, b: 2 };
    const renames = [{ from: "a", to: "alfa" }];
    const res = migrateInputsForRename(inputs, renames);
    expect(res.changed).toBe(true);
    expect(res.migrated).toEqual({ alfa: null, b: 2 });
  });
});
