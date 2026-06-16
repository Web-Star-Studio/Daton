import { describe, it, expect } from "vitest";

import {
  UpdateDocumentContentBodySchema,
  normalizeContentSections,
  buildVersionMetaSnapshot,
  isDuplicateCodeError,
  blankToNull,
} from "../../../src/services/documents/content";

const section = (over: Partial<{ id: string; title: string; body: string; order: number }> = {}) => ({ id: "a", title: "Objetivo", body: "texto", order: 0, ...over });

describe("UpdateDocumentContentBodySchema", () => {
  it("aceita até 50 seções", () => {
    const sections = Array.from({ length: 50 }, (_, i) => section({ id: `s${i}`, order: i }));
    expect(UpdateDocumentContentBodySchema.safeParse({ contentSections: sections }).success).toBe(true);
  });
  it("rejeita mais de 50 seções", () => {
    const sections = Array.from({ length: 51 }, (_, i) => section({ id: `s${i}`, order: i }));
    expect(UpdateDocumentContentBodySchema.safeParse({ contentSections: sections }).success).toBe(false);
  });
  it("rejeita título vazio", () => {
    expect(UpdateDocumentContentBodySchema.safeParse({ contentSections: [section({ title: "   " })] }).success).toBe(false);
  });
  it("rejeita IDs de seção duplicados", () => {
    expect(
      UpdateDocumentContentBodySchema.safeParse({
        contentSections: [section({ id: "dup" }), section({ id: "dup", order: 1 })],
      }).success,
    ).toBe(false);
  });
});

describe("normalizeContentSections", () => {
  it("ordena por order, reindexa de 0 e faz trim do título", () => {
    const out = normalizeContentSections([
      section({ id: "b", title: " B ", order: 5 }),
      section({ id: "a", title: "A", order: 2 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["a", "b"]);
    expect(out.map((s) => s.order)).toEqual([0, 1]);
    expect(out[1].title).toBe("B");
  });

  it("não muta o array de entrada", () => {
    const input = [section({ id: "a", order: 1 }), section({ id: "b", order: 0 })];
    normalizeContentSections(input);
    expect(input.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("array vazio retorna vazio", () => {
    expect(normalizeContentSections([])).toEqual([]);
  });
});

describe("isDuplicateCodeError", () => {
  it("reconhece violação 23505 da constraint de código", () => {
    expect(isDuplicateCodeError({ code: "23505", constraint: "documents_org_code_unique" })).toBe(true);
  });
  it("reconhece violação quando encapsulada em .cause (padrão DrizzleQueryError)", () => {
    const drizzleWrapped = { message: "Failed query", cause: { code: "23505", constraint: "documents_org_code_unique" } };
    expect(isDuplicateCodeError(drizzleWrapped)).toBe(true);
  });
  it("ignora outras violações", () => {
    expect(isDuplicateCodeError({ code: "23505", constraint: "outra_constraint" })).toBe(false);
    expect(isDuplicateCodeError({ code: "23502" })).toBe(false);
    expect(isDuplicateCodeError(new Error("x"))).toBe(false);
    expect(isDuplicateCodeError(null)).toBe(false);
  });
});

describe("blankToNull", () => {
  it("converte vazio/espaços/undefined/null em null", () => {
    expect(blankToNull("")).toBeNull();
    expect(blankToNull("   ")).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
    expect(blankToNull(null)).toBeNull();
  });
  it("faz trim e preserva valor não-vazio", () => {
    expect(blankToNull("  IT-LOG-001  ")).toBe("IT-LOG-001");
  });
});

describe("buildVersionMetaSnapshot", () => {
  it("mapeia os campos de identificação, normalizando nulos", () => {
    const snap = buildVersionMetaSnapshot({
      title: "Doc", code: "IT-LOG-001", area: null, applicableNorm: "ISO 9001", normativeRequirements: ["7.5"],
    });
    expect(snap).toEqual({
      title: "Doc", code: "IT-LOG-001", area: null, applicableNorm: "ISO 9001", normativeRequirements: ["7.5"],
    });
  });
});
