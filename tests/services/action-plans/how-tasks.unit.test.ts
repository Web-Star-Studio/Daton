import { describe, expect, it } from "vitest";
import { normalizeActionHowTasks } from "../../../artifacts/api-server/src/services/action-plans/how-tasks";

describe("normalizeActionHowTasks", () => {
  it("devolve null para entrada vazia ou não-array", () => {
    expect(normalizeActionHowTasks(null)).toBeNull();
    expect(normalizeActionHowTasks(undefined)).toBeNull();
    expect(normalizeActionHowTasks([])).toBeNull();
    // Entrada corrompida não derruba o servidor.
    expect(normalizeActionHowTasks("nope" as unknown as never)).toBeNull();
  });

  it("descarta passos de texto vazio (ou só espaços) e apara o texto", () => {
    const out = normalizeActionHowTasks([
      { id: "a", text: "  Comprar material  ", done: false },
      { id: "b", text: "   ", done: true },
      { id: "c", text: "", done: false },
    ]);
    expect(out).toEqual([{ id: "a", text: "Comprar material", done: false }]);
  });

  it("normaliza `done` para booleano e devolve null quando nada sobra", () => {
    const out = normalizeActionHowTasks([
      { id: "a", text: "Passo", done: 1 as unknown as boolean },
    ]);
    expect(out).toEqual([{ id: "a", text: "Passo", done: true }]);
    expect(normalizeActionHowTasks([{ id: "x", text: "  ", done: true }])).toBeNull();
  });

  it("gera id para item sem id e desambigua ids repetidos", () => {
    const out = normalizeActionHowTasks([
      { id: "", text: "Sem id", done: false },
      { id: "dup", text: "Um", done: false },
      { id: "dup", text: "Dois", done: false },
    ]);
    expect(out).toHaveLength(3);
    const ids = out!.map((t) => t.id);
    expect(new Set(ids).size).toBe(3); // todos únicos
    expect(ids[0]).not.toBe("");
  });

  it("corta a lista e o texto nos limites defensivos", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: `t${i}`,
      text: `Passo ${i}`,
      done: false,
    }));
    expect(normalizeActionHowTasks(many)).toHaveLength(200);

    const long = normalizeActionHowTasks([{ id: "a", text: "x".repeat(1000), done: false }]);
    expect(long![0].text).toHaveLength(500);
  });
});
