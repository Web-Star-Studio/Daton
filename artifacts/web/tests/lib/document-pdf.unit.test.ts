import { describe, it, expect } from "vitest";
import {
  parseInlineRuns,
  parseMarkdownBlocks,
  pdfFilename,
  buildDocumentPdf,
} from "@/lib/document-pdf";

describe("parseInlineRuns", () => {
  it("texto simples", () => {
    expect(parseInlineRuns("ola mundo")).toEqual([
      { text: "ola mundo", bold: false, italic: false },
    ]);
  });
  it("negrito e itálico", () => {
    expect(parseInlineRuns("a **b** c *d*")).toEqual([
      { text: "a ", bold: false, italic: false },
      { text: "b", bold: true, italic: false },
      { text: " c ", bold: false, italic: false },
      { text: "d", bold: false, italic: true },
    ]);
  });
  it("string vazia retorna []", () => {
    expect(parseInlineRuns("")).toEqual([]);
  });
  it("asterisco solto vira texto plano", () => {
    expect(parseInlineRuns("hello *world")).toEqual([
      { text: "hello *world", bold: false, italic: false },
    ]);
  });
});

describe("parseMarkdownBlocks", () => {
  it("parágrafos e listas", () => {
    const blocks = parseMarkdownBlocks("Intro\n\n- um\n- dois\n\n1. a\n2. b");
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      runs: [{ text: "Intro", bold: false, italic: false }],
    });
    expect(blocks[1].kind).toBe("bullet");
    expect(blocks[1].items).toHaveLength(2);
    expect(blocks[2].kind).toBe("ordered");
    expect(blocks[2].items).toHaveLength(2);
  });
  it("corpo vazio = nenhum bloco", () => {
    expect(parseMarkdownBlocks("")).toEqual([]);
  });
  it("linha *italico* não é bullet", () => {
    const blocks = parseMarkdownBlocks("*italico*\n\n- bullet");
    expect(blocks[0].kind).toBe("paragraph");
    expect(blocks[1].kind).toBe("bullet");
  });
});

describe("pdfFilename", () => {
  it("usa o código quando presente", () => {
    expect(pdfFilename({ title: "Manual", code: "IT-LOG-001", version: 2, sections: [] })).toBe(
      "IT-LOG-001-v2.pdf",
    );
  });
  it("cai no slug do título sem código", () => {
    expect(pdfFilename({ title: "Manual da Qualidade", sections: [] })).toBe(
      "manual-da-qualidade.pdf",
    );
  });
  it("versão 0 (sem aprovação) não recebe sufixo -v", () => {
    expect(pdfFilename({ title: "Doc", code: "PC-1", version: 0, sections: [] })).toBe("PC-1.pdf");
  });
  it("sanitiza caracteres reservados no código", () => {
    expect(pdfFilename({ title: "T", code: "DOC/2024:01", sections: [] })).toBe("DOC-2024-01.pdf");
  });
});

describe("buildDocumentPdf (smoke)", () => {
  it("gera um PDF com ao menos 1 página, sem lançar", () => {
    const doc = buildDocumentPdf({
      title: "Doc",
      code: "PC-001",
      version: 1,
      sections: [
        { id: "a", title: "Objetivo", body: "Texto **forte** e *ênfase*.\n\n- item 1\n- item 2", order: 0 },
      ],
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
  it("não lança com seções vazias", () => {
    expect(() => buildDocumentPdf({ title: "Doc", sections: [] })).not.toThrow();
  });
  it("renderiza lista ordenada sem lançar", () => {
    expect(() =>
      buildDocumentPdf({
        title: "Doc",
        sections: [{ id: "a", title: "S", body: "1. um\n2. dois", order: 0 }],
      }),
    ).not.toThrow();
  });
});

describe("buildDocumentPdf (assinaturas + tratativa de registros)", () => {
  it("renderiza assinaturas sem lançar e retorna ao menos 1 página", () => {
    const doc = buildDocumentPdf({
      title: "Doc com Assinaturas",
      sections: [],
      signatures: [
        { role: "Elaborado por", name: "João Silva", date: null },
        { role: "Revisado por", name: "Maria Souza", date: "01/06/2026" },
        { role: "Aprovado por", name: "Carlos Lima", date: "02/06/2026" },
      ],
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("renderiza tratativa de registros sem lançar", () => {
    const doc = buildDocumentPdf({
      title: "Doc com Registros",
      sections: [],
      recordsTreatment: {
        storageLocation: "Pasta física / Setor Qualidade",
        retentionMonths: 60,
        disposalMethod: "Trituração",
        responsible: "Gestor de Qualidade",
        notes: "Manter em local seco.",
      },
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("não lança quando recordsTreatment é null", () => {
    expect(() =>
      buildDocumentPdf({
        title: "Doc",
        sections: [],
        recordsTreatment: null,
      }),
    ).not.toThrow();
  });

  it("renderiza assinaturas e tratativa juntos sem lançar", () => {
    expect(() =>
      buildDocumentPdf({
        title: "Doc Completo",
        code: "PC-002",
        version: 2,
        sections: [{ id: "s1", title: "Escopo", body: "Aplica-se a toda a organização.", order: 0 }],
        signatures: [
          { role: "Elaborado por", name: "Ana Costa", date: null },
          { role: "Aprovado por", name: null, date: null },
        ],
        recordsTreatment: {
          storageLocation: "Sistema digital",
          retentionMonths: null,
          disposalMethod: null,
          responsible: null,
          notes: null,
        },
      }),
    ).not.toThrow();
  });
});
