import { describe, expect, it } from "vitest";
import {
  isHowTasksOnlyDoneToggle,
  normalizeActionHowTasks,
  stampHowTasks,
} from "../../../artifacts/api-server/src/services/action-plans/how-tasks";

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

const ACTOR = { userId: 7, userName: "Ana" };
const NOW = "2026-07-21T12:00:00.000Z";

describe("stampHowTasks", () => {
  it("carimba quem/quando num passo recém-concluído", () => {
    const out = stampHowTasks([{ id: "a", text: "Passo", done: true }], [], ACTOR, NOW);
    expect(out).toEqual([
      { id: "a", text: "Passo", done: true, doneAt: NOW, doneByUserId: 7, doneByUserName: "Ana" },
    ]);
  });

  it("preserva o carimbo de um passo que JÁ estava concluído (não reassina)", () => {
    const existing = [
      { id: "a", text: "Passo", done: true, doneAt: "2026-01-01T00:00:00.000Z", doneByUserId: 3, doneByUserName: "Beto" },
    ];
    const out = stampHowTasks([{ id: "a", text: "Passo", done: true }], existing, ACTOR, NOW);
    expect(out![0]).toMatchObject({
      doneAt: "2026-01-01T00:00:00.000Z",
      doneByUserId: 3,
      doneByUserName: "Beto",
    });
  });

  it("passo não-concluído não carrega carimbo (reabrir limpa)", () => {
    const existing = [
      { id: "a", text: "Passo", done: true, doneAt: NOW, doneByUserId: 7, doneByUserName: "Ana" },
    ];
    const out = stampHowTasks([{ id: "a", text: "Passo", done: false }], existing, ACTOR, NOW);
    expect(out).toEqual([{ id: "a", text: "Passo", done: false }]);
  });

  it("null continua null", () => {
    expect(stampHowTasks(null, [], ACTOR, NOW)).toBeNull();
  });
});

describe("isHowTasksOnlyDoneToggle", () => {
  const base = [{ id: "a", text: "Um", done: false }, { id: "b", text: "Dois", done: false }];
  it("só marcação muda → true", () => {
    const after = [{ id: "a", text: "Um", done: true }, { id: "b", text: "Dois", done: false }];
    expect(isHowTasksOnlyDoneToggle(base, after)).toBe(true);
  });
  it("texto muda (renomear) → false", () => {
    const after = [{ id: "a", text: "Um!", done: false }, { id: "b", text: "Dois", done: false }];
    expect(isHowTasksOnlyDoneToggle(base, after)).toBe(false);
  });
  it("incluir/remover passo (tamanho muda) → false", () => {
    expect(isHowTasksOnlyDoneToggle(base, [base[0]])).toBe(false);
  });
  it("null vs vazio → true (nada a registrar)", () => {
    expect(isHowTasksOnlyDoneToggle(null, [])).toBe(true);
  });
});
