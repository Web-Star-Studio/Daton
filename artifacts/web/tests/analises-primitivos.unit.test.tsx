import { describe, expect, it } from "vitest";
import {
  addSibling,
  indentNode,
  outdentNode,
  removeNode,
  updateNode,
} from "@/pages/app/planos-acao/_components/analises/primitivos/tree-ops";

type N = { id: string; text?: string; children: N[] };
const tree = (): N[] => [
  { id: "a", text: "A", children: [{ id: "a1", text: "A1", children: [] }] },
  { id: "b", text: "B", children: [] },
];

describe("tree-ops", () => {
  it("indentar torna o nó filho do irmão anterior", () => {
    const out = indentNode(tree(), "b");
    expect(out).toHaveLength(1);
    expect(out[0].children.map((c) => c.id)).toEqual(["a1", "b"]);
  });

  it("indentar o primeiro nó do nível não faz nada (não há irmão anterior)", () => {
    expect(indentNode(tree(), "a")).toEqual(tree());
  });

  it("desindentar sobe o nó para o nível do pai, logo depois dele", () => {
    const out = outdentNode(tree(), "a1");
    expect(out.map((n) => n.id)).toEqual(["a", "a1", "b"]);
    expect(out[0].children).toHaveLength(0);
  });

  it("desindentar um nó de raiz não faz nada", () => {
    expect(outdentNode(tree(), "a")).toEqual(tree());
  });

  it("remover um nó leva a subárvore junto e não deixa órfão", () => {
    const out = removeNode(tree(), "a");
    expect(out.map((n) => n.id)).toEqual(["b"]);
    expect(JSON.stringify(out)).not.toContain("a1");
  });

  it("atualizar só toca o nó alvo, em qualquer profundidade", () => {
    const out = updateNode(tree(), "a1", (n) => ({ ...n, text: "editado" }));
    expect(out[0].children[0].text).toBe("editado");
    expect(out[1].text).toBe("B");
  });

  it("addSibling insere logo depois do alvo, no mesmo nível", () => {
    const out = addSibling(tree(), "a1", { id: "novo", children: [] });
    expect(out[0].children.map((c) => c.id)).toEqual(["a1", "novo"]);
  });
});
