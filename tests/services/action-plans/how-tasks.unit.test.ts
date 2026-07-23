import { describe, expect, it } from "vitest";
import {
  applyTaskAssigneeDoneOnly,
  collectTaskAssigneeIds,
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
    expect(out).toEqual([{ id: "a", text: "Comprar material", done: false, assigneeUserId: null }]);
  });

  it("normaliza `done` para booleano e devolve null quando nada sobra", () => {
    const out = normalizeActionHowTasks([
      { id: "a", text: "Passo", done: 1 as unknown as boolean },
    ]);
    expect(out).toEqual([{ id: "a", text: "Passo", done: true, assigneeUserId: null }]);
    expect(normalizeActionHowTasks([{ id: "x", text: "  ", done: true }])).toBeNull();
  });

  it("mantém assigneeUserId válido e zera o inválido", () => {
    const out = normalizeActionHowTasks([
      { id: "a", text: "Com dono", done: false, assigneeUserId: 42 },
      { id: "b", text: "Dono inválido", done: false, assigneeUserId: 0 },
      { id: "c", text: "Dono lixo", done: false, assigneeUserId: "x" as unknown as number },
    ]);
    expect(out).toEqual([
      { id: "a", text: "Com dono", done: false, assigneeUserId: 42 },
      { id: "b", text: "Dono inválido", done: false, assigneeUserId: null },
      { id: "c", text: "Dono lixo", done: false, assigneeUserId: null },
    ]);
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
      { id: "a", text: "Passo", done: true, assigneeUserId: null, doneAt: NOW, doneByUserId: 7, doneByUserName: "Ana" },
    ]);
  });

  it("preserva o dono do passo através do carimbo (concluído e não-concluído)", () => {
    const out = stampHowTasks(
      [
        { id: "a", text: "Concluído", done: true, assigneeUserId: 5 },
        { id: "b", text: "Aberto", done: false, assigneeUserId: 9 },
      ],
      [],
      ACTOR,
      NOW,
    );
    expect(out![0]).toMatchObject({ assigneeUserId: 5, done: true, doneByUserId: 7 });
    expect(out![1]).toEqual({ id: "b", text: "Aberto", done: false, assigneeUserId: 9 });
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
    expect(out).toEqual([{ id: "a", text: "Passo", done: false, assigneeUserId: null }]);
  });

  it("null continua null", () => {
    expect(stampHowTasks(null, [], ACTOR, NOW)).toBeNull();
  });
});

describe("collectTaskAssigneeIds", () => {
  it("devolve ids distintos dos donos, ignorando passos sem dono", () => {
    const ids = collectTaskAssigneeIds([
      { id: "a", text: "x", done: false, assigneeUserId: 5 },
      { id: "b", text: "y", done: false, assigneeUserId: 5 },
      { id: "c", text: "z", done: false, assigneeUserId: 9 },
      { id: "d", text: "w", done: false, assigneeUserId: null },
      { id: "e", text: "v", done: false },
    ]);
    expect(ids.sort()).toEqual([5, 9]);
  });
  it("null/undefined → []", () => {
    expect(collectTaskAssigneeIds(null)).toEqual([]);
    expect(collectTaskAssigneeIds(undefined)).toEqual([]);
  });
});

describe("applyTaskAssigneeDoneOnly", () => {
  const existing = [
    { id: "a", text: "Meu passo", done: false, assigneeUserId: 5 },
    { id: "b", text: "Passo de outro", done: false, assigneeUserId: 9 },
    { id: "c", text: "Sem dono", done: false, assigneeUserId: null },
  ];

  it("aplica o `done` só nos passos do dono; ignora o resto do payload", () => {
    // Cliente tenta: marcar o seu (a), marcar o do outro (b), renomear (a) e sem-dono (c).
    const incoming = [
      { id: "a", text: "RENOMEADO", done: true, assigneeUserId: 999 },
      { id: "b", text: "Passo de outro", done: true, assigneeUserId: 9 },
      { id: "c", text: "Sem dono", done: true, assigneeUserId: null },
    ];
    const out = applyTaskAssigneeDoneOnly(existing, incoming, 5);
    expect(out).toEqual([
      // Só o `done` do passo do 5 mudou; texto/assignee dele intocados.
      { id: "a", text: "Meu passo", done: true, assigneeUserId: 5 },
      { id: "b", text: "Passo de outro", done: false, assigneeUserId: 9 },
      { id: "c", text: "Sem dono", done: false, assigneeUserId: null },
    ]);
  });

  it("não inclui passos novos que o cliente inventou", () => {
    const incoming = [
      { id: "a", text: "Meu passo", done: true, assigneeUserId: 5 },
      { id: "novo", text: "Injetado", done: true, assigneeUserId: 5 },
    ];
    const out = applyTaskAssigneeDoneOnly(existing, incoming, 5);
    expect(out).toHaveLength(3);
    expect(out!.some((t) => t.id === "novo")).toBe(false);
  });

  it("checklist vazia → null", () => {
    expect(applyTaskAssigneeDoneOnly(null, [{ id: "a", text: "x", done: true }], 5)).toBeNull();
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
  it("reatribuir passo (assigneeUserId muda) → false (é replanejamento)", () => {
    const before = [{ id: "a", text: "Um", done: false, assigneeUserId: 5 }];
    const after = [{ id: "a", text: "Um", done: true, assigneeUserId: 9 }];
    expect(isHowTasksOnlyDoneToggle(before, after)).toBe(false);
  });
  it("mesmo dono, só marcação → true", () => {
    const before = [{ id: "a", text: "Um", done: false, assigneeUserId: 5 }];
    const after = [{ id: "a", text: "Um", done: true, assigneeUserId: 5 }];
    expect(isHowTasksOnlyDoneToggle(before, after)).toBe(true);
  });
  it("null vs vazio → true (nada a registrar)", () => {
    expect(isHowTasksOnlyDoneToggle(null, [])).toBe(true);
  });
});
