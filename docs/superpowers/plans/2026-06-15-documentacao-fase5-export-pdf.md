# Documentação Fase 5 — Export PDF baixável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Botão "Exportar PDF" no detalhe do documento que gera e **baixa um `.pdf` de um clique** a partir das seções de conteúdo, via `jspdf` (já instalado), com cabeçalho ISO (código/título/tipo/norma/rev/validade/aprovado por) + numeração de página, **texto selecionável**.

**Architecture:** Módulo `lib/document-pdf.ts` com parsers de markdown **puros e testáveis** (subset da toolbar: negrito/itálico/listas/parágrafos) + um layout `jspdf` que os consome. O detalhe (`[id].tsx`) mapeia o `DocumentDetail` para o input do PDF e chama o export. Sem backend.

**Tech Stack:** React 19, `jspdf` (v4, já dep), Vitest (web-unit/jsdom).

**Spec:** `docs/superpowers/specs/2026-06-15-documentacao-conteudo-na-plataforma-design.md` (§9 export PDF).

**Branch/worktree:** `feat/documentacao-conteudo-na-plataforma` em `/home/jp/daton/Daton-doc-conteudo`.

---

## Fatos do código (verificados)

- jsPDF: `import { jsPDF } from "jspdf";` · `new jsPDF({ unit: "pt", format: "a4" })` (padrão de `regulatorios/_export.ts`).
- `DocumentDetailApproversItem = { id?; userId?; name?; status?; approvedAt?; comment? }` → "aprovado por" = `doc.approvers?.find(a => a.status === "approved")?.name`.
- `DocumentDetail` tem `title, code?, type, applicableNorm?, currentVersion, validityDate?, contentSections, approvers?`.
- `[id].tsx`: `useHeaderActions(` na linha ~640; primeiro botão é "Conteúdo" (navega p/ `/:id/conteudo`). `Download` (lucide) já importado (linha 62). `DocumentContentSection` importável de `@workspace/api-client-react`.
- web-unit: vitest + alias `@/`; jsPDF roda headless (texto) sob jsdom.

---

## File Structure (Fase 5)

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `artifacts/web/src/lib/document-pdf.ts` | parsers markdown puros + layout jspdf + export | Create |
| `artifacts/web/tests/lib/document-pdf.unit.test.ts` | unit dos parsers + filename + smoke | Create |
| `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx` | botão "Exportar PDF" | Modify |

---

## Task 5.1: Módulo `document-pdf.ts` (parsers puros TDD + layout)

**Files:**
- Create: `artifacts/web/src/lib/document-pdf.ts`
- Test: `artifacts/web/tests/lib/document-pdf.unit.test.ts`

- [ ] **Step 1: Teste que falha (parsers + filename + smoke)**

```ts
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
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-pdf.unit.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `document-pdf.ts`**

```ts
import { jsPDF } from "jspdf";
import type { DocumentContentSection } from "@workspace/api-client-react";

export interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type Block =
  | { kind: "paragraph"; runs: InlineRun[] }
  | { kind: "bullet" | "ordered"; items: InlineRun[][] };

export interface DocumentPdfInput {
  title: string;
  code?: string | null;
  type?: string | null;
  applicableNorm?: string | null;
  version?: number | null;
  validityDate?: string | null;
  approvedByName?: string | null;
  sections: DocumentContentSection[];
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
    else runs.push({ text: m[3]!, bold: false, italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), bold: false, italic: false });
  }
  return runs.length ? runs : [{ text, bold: false, italic: false }];
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function pdfFilename(input: DocumentPdfInput): string {
  const base = input.code?.trim() || slugify(input.title) || "documento";
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

  // Cabeçalho
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
    y += 12 * wrapped.length;
    doc.setTextColor(0);
  }
  y += 6;
  doc.setDrawColor(200);
  ensureSpace(10);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  // Seções
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
          const marker =
            block.kind === "ordered" ? `${n}. ` : "•  ";
          drawRuns([{ text: marker, bold: false, italic: false }, ...item], 10);
          n++;
        }
      }
      y += 2;
    }
  }

  // Rodapé: numeração de página
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-pdf.unit.test.ts`
Expected: PASS. Se o smoke do jsPDF NÃO rodar no jsdom (erro de canvas/ambiente), remova APENAS os 2 testes de `buildDocumentPdf` (mantendo parsers + filename) e confie no typecheck + checklist manual para o layout. Os parsers (a lógica de valor) continuam cobertos.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @workspace/web typecheck` → PASS.
```bash
git add artifacts/web/src/lib/document-pdf.ts artifacts/web/tests/lib/document-pdf.unit.test.ts
git commit -m "feat(web/documentacao): módulo de export PDF (parsers markdown + layout jspdf)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5.2: Botão "Exportar PDF" no detalhe

**Files:** Modify `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx`

- [ ] **Step 1: Import**

```tsx
import { exportDocumentPdf } from "@/lib/document-pdf";
```

- [ ] **Step 2: Botão no `useHeaderActions`**

No bloco `useHeaderActions(...)` (linha ~640), logo APÓS o botão "Conteúdo", adicionar:
```tsx
        <HeaderActionButton
          size="sm"
          variant="outline"
          onClick={() =>
            exportDocumentPdf({
              title: doc.title,
              code: doc.code,
              type: TYPE_LABELS[doc.type] || doc.type,
              applicableNorm: doc.applicableNorm,
              version: doc.currentVersion,
              validityDate: formatDate(doc.validityDate),
              approvedByName:
                doc.approvers?.find((a) => a.status === "approved")?.name ??
                null,
              sections: doc.contentSections,
            })
          }
          label="Exportar PDF"
          icon={<Download className="h-3.5 w-3.5" />}
        />
```
(`Download` já está importado; `TYPE_LABELS`/`formatDate` existem no arquivo. Disponível a qualquer um que veja o documento — é ação de leitura.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @workspace/web typecheck` → PASS.
```bash
git add artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx
git commit -m "feat(web/documentacao): botão Exportar PDF no detalhe

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5.3: Verificação final da Fase 5

- [ ] **Step 1: Typecheck completo** — `pnpm typecheck` → PASS.
- [ ] **Step 2: web-unit** — `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-pdf.unit.test.ts` → PASS. (Suíte completa tem OOM/falhas PRÉ-EXISTENTES em operational-planning/environmental-laia-home/suppliers-pages — não são regressão.)
- [ ] **Step 3: Checklist manual (requer dev servers — usuário roda em :3002 + docker DB)**
  1. Abrir um documento com conteúdo → "Exportar PDF" baixa um `.pdf` nomeado pelo código (ou slug do título) + `-v{rev}`.
  2. O PDF mostra cabeçalho (título + código/tipo/norma/rev/validade/aprovado por), as seções com títulos, negrito/itálico e listas renderizados, e "i / n" no rodapé.
  3. Texto do PDF é selecionável (não imagem).
  4. Documento sem conteúdo → PDF só com cabeçalho + "Sem conteúdo redigido." (sem quebrar).
- [ ] **Step 4: Revisão de diff** — `git diff --stat origin/main..HEAD` — só os arquivos previstos.

---

## Self-Review (na escrita do plano)

- **Cobertura:** §9 — `.pdf` baixável de um clique via jspdf, subset de markdown da toolbar, cabeçalho ISO, numeração de página, texto selecionável.
- **Placeholders:** nenhum; código real, com fallback explícito caso o smoke do jsPDF não rode no jsdom.
- **Tests:** parsers (`parseInlineRuns`, `parseMarkdownBlocks`) + `pdfFilename` cobertos por web-unit (lógica pura/valor); `buildDocumentPdf` com smoke (não-lança/≥1 página). O layout fino fica no checklist manual.
- **Consistência:** import do jsPDF igual a `regulatorios/_export.ts`; botão segue o padrão dos `HeaderActionButton` do arquivo; reaproveita `TYPE_LABELS`/`formatDate`.

## Notas / limitações
- Subset de markdown: títulos de seção, parágrafos, negrito/itálico, listas (marcador/numeradas) — o que a toolbar do editor gera. Markdown complexo (tabelas, imagens, links) não é renderizado no PDF v1.
- Continuação de linha de item de lista não indenta sob o marcador (aceitável no v1).
- Fonte Helvetica core do jsPDF (sem acentos exóticos perdidos — Latin-1 ok para PT-BR).
