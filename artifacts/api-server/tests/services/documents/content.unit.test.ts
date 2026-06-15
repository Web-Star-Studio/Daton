import { describe, it, expect } from "vitest";
import {
  UpdateDocumentContentBodySchema,
  normalizeContentSections,
  buildVersionMetaSnapshot,
} from "../../../src/services/documents/content";

const section = (over = {}) => ({ id: "a", title: "Objetivo", body: "texto", order: 0, ...over });

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
