import { describe, it, expect } from "vitest";
import {
  addSection,
  removeSection,
  updateSection,
  moveSection,
  sectionsAreEqual,
  applyInlineMarkup,
  applyLinePrefix,
} from "@/lib/document-content-sections";

const S = (over = {}) => ({ id: "x", title: "T", body: "B", order: 0, ...over });

describe("addSection", () => {
  it("acrescenta seção com id único, corpo vazio e order no fim", () => {
    const out = addSection([S({ id: "a", order: 0 })], "Nova");
    expect(out).toHaveLength(2);
    expect(out[1].title).toBe("Nova");
    expect(out[1].body).toBe("");
    expect(out[1].order).toBe(1);
    expect(out[1].id).toBeTruthy();
    expect(out[1].id).not.toBe("a");
  });
});

describe("removeSection", () => {
  it("remove e reindexa order", () => {
    const out = removeSection([S({ id: "a", order: 0 }), S({ id: "b", order: 1 }), S({ id: "c", order: 2 })], "b");
    expect(out.map((s) => s.id)).toEqual(["a", "c"]);
    expect(out.map((s) => s.order)).toEqual([0, 1]);
  });
});

describe("updateSection", () => {
  it("aplica patch só na seção alvo", () => {
    const out = updateSection([S({ id: "a" }), S({ id: "b" })], "b", { title: "Novo" });
    expect(out[1].title).toBe("Novo");
    expect(out[0].title).toBe("T");
  });
});

describe("moveSection", () => {
  it("sobe/desce e reindexa; no-op nas bordas", () => {
    const base = [S({ id: "a", order: 0 }), S({ id: "b", order: 1 }), S({ id: "c", order: 2 })];
    expect(moveSection(base, "b", "up").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(moveSection(base, "b", "down").map((s) => s.id)).toEqual(["a", "c", "b"]);
    expect(moveSection(base, "a", "up")).toBe(base);
    expect(moveSection(base, "c", "down")).toBe(base);
    expect(moveSection(moveSection(base, "b", "up"), "a", "down").map((s) => s.order)).toEqual([0, 1, 2]);
  });
});

describe("sectionsAreEqual", () => {
  it("compara id/title/body/order", () => {
    const a = [S({ id: "a", title: "x", body: "y", order: 0 })];
    expect(sectionsAreEqual(a, [S({ id: "a", title: "x", body: "y", order: 0 })])).toBe(true);
    expect(sectionsAreEqual(a, [S({ id: "a", title: "z", body: "y", order: 0 })])).toBe(false);
    expect(sectionsAreEqual(a, [])).toBe(false);
  });
});

describe("applyInlineMarkup", () => {
  it("envolve a seleção e reposiciona", () => {
    const r = applyInlineMarkup("ola mundo", 0, 3, "**");
    expect(r.value).toBe("**ola** mundo");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("ola");
  });
  it("seleção vazia insere placeholder", () => {
    const r = applyInlineMarkup("", 0, 0, "*");
    expect(r.value).toBe("*texto*");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("texto");
  });
});

describe("applyLinePrefix", () => {
  it("prefixa cada linha da seleção", () => {
    const r = applyLinePrefix("um\ndois\ntres", 0, 8, "- ");
    expect(r.value).toBe("- um\n- dois\ntres");
  });
});
