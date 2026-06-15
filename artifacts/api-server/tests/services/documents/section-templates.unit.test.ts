import { describe, it, expect } from "vitest";
import {
  seedSectionsForType,
  SECTION_TEMPLATES,
} from "../../../src/services/documents/section-templates";

describe("seedSectionsForType", () => {
  it("semeia as seções do tipo, em ordem, com corpo vazio", () => {
    const sections = seedSectionsForType("politica");
    expect(sections.map((s) => s.title)).toEqual(SECTION_TEMPLATES.politica);
    expect(sections.every((s) => s.body === "")).toBe(true);
    expect(sections.map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
  });

  it("procedimento e instrucao compartilham o mesmo template", () => {
    expect(seedSectionsForType("instrucao").map((s) => s.title)).toEqual(
      seedSectionsForType("procedimento").map((s) => s.title),
    );
  });

  it("tipo desconhecido cai no template 'outro' (1 seção em branco)", () => {
    const sections = seedSectionsForType("tipo-inexistente");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Conteúdo");
  });
});
