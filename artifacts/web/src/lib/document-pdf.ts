import { jsPDF } from "jspdf";
import type { DocumentContentSection, DocumentRecordsTreatment } from "@workspace/api-client-react";

export interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type Block =
  | { kind: "paragraph"; runs: InlineRun[] }
  | { kind: "bullet" | "ordered"; items: InlineRun[][] };

export interface DocumentPdfSignature {
  role: string;
  name: string | null;
  date: string | null;
}

export interface DocumentPdfInput {
  title: string;
  code?: string | null;
  type?: string | null;
  applicableNorm?: string | null;
  version?: number | null;
  validityDate?: string | null;
  approvedByName?: string | null;
  sections: DocumentContentSection[];
  signatures?: DocumentPdfSignature[];
  recordsTreatment?: DocumentRecordsTreatment | null;
}

export function parseInlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push({ text: text.slice(last, m.index), bold: false, italic: false });
    }
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true, italic: false });
    else runs.push({ text: m[3] ?? "", bold: false, italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), bold: false, italic: false });
  }
  return runs;
}

export function parseMarkdownBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let listKind: "bullet" | "ordered" | null = null;
  let items: InlineRun[][] = [];
  const flush = () => {
    if (listKind && items.length) blocks.push({ kind: listKind, items });
    listKind = null;
    items = [];
  };
  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet) {
      if (listKind && listKind !== "bullet") flush();
      listKind = "bullet";
      items.push(parseInlineRuns(bullet[1]));
    } else if (ordered) {
      if (listKind && listKind !== "ordered") flush();
      listKind = "ordered";
      items.push(parseInlineRuns(ordered[1]));
    } else {
      flush();
      if (line.trim()) {
        blocks.push({ kind: "paragraph", runs: parseInlineRuns(line.trim()) });
      }
    }
  }
  flush();
  return blocks;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function pdfFilename(input: DocumentPdfInput): string {
  const base =
    input.code?.trim().replace(/[/\\:?*|"<>]/g, "-") || slugify(input.title) || "documento";
  const suffix = input.version ? `-v${input.version}` : "";
  return `${base}${suffix}.pdf`;
}

function fontStyle(run: InlineRun): "normal" | "bold" | "italic" | "bolditalic" {
  if (run.bold && run.italic) return "bolditalic";
  if (run.bold) return "bold";
  if (run.italic) return "italic";
  return "normal";
}

export function buildDocumentPdf(input: DocumentPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxX = pageW - margin;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const drawRuns = (runs: InlineRun[], size: number) => {
    doc.setFontSize(size);
    const lineHeight = size + 4;
    let x = margin;
    ensureSpace(lineHeight);
    for (const run of runs) {
      doc.setFont("helvetica", fontStyle(run));
      const tokens = run.text.split(/(\s+)/);
      for (const token of tokens) {
        if (token === "") continue;
        const w = doc.getTextWidth(token);
        if (token.trim() !== "" && x + w > maxX) {
          y += lineHeight;
          x = margin;
          ensureSpace(lineHeight);
        }
        doc.text(token, x, y);
        x += w;
      }
    }
    y += lineHeight;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  ensureSpace(20);
  doc.text(input.title || "Documento", margin, y);
  y += 20;

  const headerBits = [
    input.code ? `Código: ${input.code}` : null,
    input.type ? `Tipo: ${input.type}` : null,
    input.applicableNorm ? `Norma: ${input.applicableNorm}` : null,
    input.version ? `Rev: v${input.version}` : null,
    input.validityDate ? `Validade: ${input.validityDate}` : null,
    input.approvedByName ? `Aprovado por: ${input.approvedByName}` : null,
  ]
    .filter(Boolean)
    .join("    ");
  if (headerBits) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    ensureSpace(14);
    const wrapped = doc.splitTextToSize(headerBits, pageW - margin * 2);
    doc.text(wrapped, margin, y);
    y += 13 * wrapped.length;
    doc.setTextColor(0);
  }
  y += 6;
  doc.setDrawColor(200);
  ensureSpace(10);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  const sections = [...input.sections].sort((a, b) => a.order - b.order);
  if (sections.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(120);
    ensureSpace(14);
    doc.text("Sem conteúdo redigido.", margin, y);
    doc.setTextColor(0);
  }
  for (const section of sections) {
    y += 6;
    drawRuns([{ text: section.title || "—", bold: true, italic: false }], 12);
    for (const block of parseMarkdownBlocks(section.body || "")) {
      if (block.kind === "paragraph") {
        drawRuns(block.runs, 10);
      } else {
        let n = 1;
        for (const item of block.items) {
          const marker = block.kind === "ordered" ? `${n}. ` : "•  ";
          drawRuns([{ text: marker, bold: false, italic: false }, ...item], 10);
          n++;
        }
      }
      y += 2;
    }
  }

  // Signatures block
  if (input.signatures && input.signatures.length > 0) {
    y += 10;
    ensureSpace(16);
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
    drawRuns([{ text: "Assinaturas", bold: true, italic: false }], 12);
    for (const sig of input.signatures) {
      const dateStr = sig.date ? ` (${sig.date})` : "";
      drawRuns(
        [{ text: `${sig.role}: ${sig.name ?? "—"}${dateStr}`, bold: false, italic: false }],
        10,
      );
    }
  }

  // Records Treatment (ISO §7.5.3) block
  if (input.recordsTreatment) {
    y += 10;
    ensureSpace(16);
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
    drawRuns([{ text: "Tratativa de Registros (§7.5.3)", bold: true, italic: false }], 12);
    const rt = input.recordsTreatment;
    const rtFields: Array<[string, string | null | undefined]> = [
      ["Local de armazenamento", rt.storageLocation],
      [
        "Tempo de guarda (meses)",
        rt.retentionMonths != null ? String(rt.retentionMonths) : null,
      ],
      ["Forma de descarte", rt.disposalMethod],
      ["Responsável", rt.responsible],
      ["Observações", rt.notes],
    ];
    for (const [label, value] of rtFields) {
      if (value) {
        drawRuns(
          [
            { text: `${label}: `, bold: true, italic: false },
            { text: value, bold: false, italic: false },
          ],
          10,
        );
      }
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`${i} / ${pages}`, pageW - margin, pageH - 24, { align: "right" });
  }
  doc.setTextColor(0);
  return doc;
}

export function exportDocumentPdf(input: DocumentPdfInput): void {
  buildDocumentPdf(input).save(pdfFilename(input));
}
