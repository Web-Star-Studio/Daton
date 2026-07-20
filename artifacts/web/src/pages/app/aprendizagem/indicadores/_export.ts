/**
 * Export do relatório de Indicadores LMS — PDF e Excel.
 *
 * Substitui o `window.print()` que existia aqui: imprimir a tela levava junto
 * a sidebar e o chrome do app (não há CSS de impressão no projeto), gerando um
 * "print de tela" impróprio para auditoria. Aqui o PDF é desenhado do zero, a
 * partir dos mesmos dados que a tela renderiza.
 *
 * Convenções seguidas de `qualidade/regulatorios/_export.ts` e
 * `lib/document-pdf.ts`: jsPDF em pt/A4, `autoTable(doc, {...})` (v3+),
 * cabeçalho com org + timestamp, rodapé com paginação, paleta Tailwind.
 */
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  LearningSummary,
  LearningSummaryUnitRow,
} from "@workspace/api-client-react";
import type { TrafficLight } from "@/lib/kpi-client";
import {
  LMS_ALL_METRICS,
  STATUS_LABEL,
  findTarget,
  formatMetricValue,
  metricProgress,
  metricStatus,
  type LmsMetricDef,
} from "./_metrics";

export interface LmsExportInput {
  summary: LearningSummary;
  orgName?: string | null;
  year: number;
  /** Nome da filial quando há recorte; null/undefined = todas. */
  unitName?: string | null;
}

// ─── Paleta (RGB Tailwind, mesma de regulatorios/_export.ts) ────────────────

const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_50: [number, number, number] = [248, 250, 252];
const GREEN_700: [number, number, number] = [21, 128, 61];
const AMBER_700: [number, number, number] = [180, 83, 9];
const RED_700: [number, number, number] = [185, 28, 28];
const GREEN_500: [number, number, number] = [34, 197, 94];
const AMBER_500: [number, number, number] = [245, 158, 11];
const RED_500: [number, number, number] = [239, 68, 68];
const SLATE_300: [number, number, number] = [203, 213, 225];

function statusTextColor(s: TrafficLight | null): [number, number, number] {
  if (s === "green") return GREEN_700;
  if (s === "yellow") return AMBER_700;
  if (s === "red") return RED_700;
  return [100, 116, 139]; // slate-500
}

function statusFillColor(s: TrafficLight | null): [number, number, number] {
  if (s === "green") return GREEN_500;
  if (s === "yellow") return AMBER_500;
  if (s === "red") return RED_500;
  return SLATE_300;
}

/**
 * O gráfico por norma da tela não usa o semáforo de meta: usa a escala de 4
 * faixas de `pctColor`/`pctBarColor` (80/60/40 → verde/azul/âmbar/vermelho).
 * O PDF replica exatamente essa escala — colapsar tudo abaixo de 60 em
 * vermelho pintaria de vermelho, no relatório, barras que a tela mostra em
 * âmbar.
 */
type NormTier = "green" | "blue" | "amber" | "red" | null;

function normBarLight(pct: number | null): NormTier {
  if (pct === null) return null;
  if (pct >= 80) return "green";
  if (pct >= 60) return "blue";
  if (pct >= 40) return "amber";
  return "red";
}

function normFillColor(t: NormTier): [number, number, number] {
  if (t === "green") return GREEN_500;
  if (t === "blue") return [59, 130, 246]; // blue-500
  if (t === "amber") return [251, 191, 36]; // amber-400
  if (t === "red") return RED_500;
  return SLATE_300;
}

function normTextColor(t: NormTier): [number, number, number] {
  if (t === "green") return GREEN_700;
  if (t === "blue") return [29, 78, 216]; // blue-700
  if (t === "amber") return AMBER_700;
  if (t === "red") return RED_700;
  return [100, 116, 139];
}

const UNIT_STATUS_LABEL: Record<LearningSummaryUnitRow["status"], string> = {
  ok: "OK",
  atencao: "Atenção",
  critico: "Crítico",
  "sem-dados": "Sem dados",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fileTimestamp(): string {
  // YYYY-MM-DD_HHMM — bom pra arquivar com ordem alfabética cronológica
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DD` → `DD/MM/YYYY` sem passar por `new Date` (evita fuso). */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

/** `autoTable` v5 não retorna a posição final — ela fica no doc. */
type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

function lastY(doc: jsPDF, fallback: number): number {
  return (doc as DocWithAutoTable).lastAutoTable?.finalY ?? fallback;
}

function scopeLabel(input: LmsExportInput): string {
  return input.unitName ? input.unitName : "Todas as filiais";
}

// ─── PDF ────────────────────────────────────────────────────────────────────

/**
 * Monta o documento e o devolve SEM salvar — separação pura/impura na linha do
 * `buildDocumentPdf` de `lib/document-pdf.ts`, que deixa o desenho testável
 * sem depender de download do browser.
 */
export function buildLearningIndicatorsPdf(input: LmsExportInput): jsPDF {
  const { summary, orgName, year } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;

  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin - 24) {
      doc.addPage();
      y = margin;
    }
  };

  const sectionTitle = (text: string) => {
    ensureSpace(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(text.toUpperCase(), margin, y);
    doc.setTextColor(0);
    y += 12;
  };

  // ── Cabeçalho ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Indicadores LMS", margin, y + 4);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  const headerBits = [
    orgName,
    `Exercício ${year}`,
    scopeLabel(input),
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  doc.text(headerBits, margin, y);
  y += 10;
  doc.setTextColor(0);

  doc.setDrawColor(220);
  doc.line(margin, y, pageW - margin, y);
  y += 18;

  // ── Bloco de indicadores (tiles 2 colunas) ──
  sectionTitle("Cumprimento e cobertura");

  const gap = 12;
  const tileW = (contentW - gap) / 2;
  const tileH = 74;

  const drawTile = (def: LmsMetricDef, x: number, top: number) => {
    const value = def.read(summary.cards);
    const target = findTarget(summary.targets, def.key);
    const status = metricStatus(value, target);
    const progress = metricProgress(value, target);

    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.8);
    doc.roundedRect(x, top, tileW, tileH, 5, 5, "S");

    // Nome + cláusula
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(30);
    const nameLines = doc.splitTextToSize(def.label, tileW - 74);
    doc.text(nameLines.slice(0, 2), x + 12, top + 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(130);
    doc.text(def.isoRef, x + 12, top + 16 + Math.min(nameLines.length, 2) * 10);

    // Badge de status (canto superior direito)
    if (status) {
      const label = STATUS_LABEL[status];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      const bw = doc.getTextWidth(label) + 12;
      const [br, bg, bb] = statusTextColor(status);
      doc.setFillColor(br, bg, bb);
      doc.roundedRect(x + tileW - bw - 10, top + 8, bw, 13, 3, 3, "F");
      doc.setTextColor(255);
      doc.text(label, x + tileW - bw - 10 + 6, top + 17);
      doc.setTextColor(0);
    }

    // Valor
    const [vr, vg, vb] = statusTextColor(status);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.setTextColor(vr, vg, vb);
    doc.text(formatMetricValue(value, def.format), x + 12, top + 50);

    // Meta — alinhada à direita do tile para não depender da largura do valor
    // (que varia de "18h" a "100%") e ficar na mesma coluna em todos os cards.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    if (target) {
      doc.text(
        `Meta ${formatMetricValue(target.goal, def.format)}`,
        x + tileW - 12,
        top + 50,
        { align: "right" },
      );
    }
    doc.setTextColor(0);

    // Barra de progresso
    const barY = top + tileH - 13;
    const barW = tileW - 24;
    doc.setFillColor(241, 245, 249); // slate-100
    doc.roundedRect(x + 12, barY, barW, 4, 2, 2, "F");
    if (progress !== null && progress > 0) {
      const [fr, fg, fb] = statusFillColor(status);
      doc.setFillColor(fr, fg, fb);
      doc.roundedRect(x + 12, barY, (barW * progress) / 100, 4, 2, 2, "F");
    }
  };

  LMS_ALL_METRICS.forEach((def, i) => {
    const col = i % 2;
    if (col === 0) ensureSpace(tileH + gap);
    const x = margin + col * (tileW + gap);
    drawTile(def, x, y);
    if (col === 1 || i === LMS_ALL_METRICS.length - 1) y += tileH + gap;
  });

  y += 8;

  // ── Eficácia por norma (gráfico de barras nativo) ──
  if (summary.byNorm.length > 0) {
    sectionTitle("Eficácia por norma");
    const labelW = 150;
    const trackX = margin + labelW + 8;
    const trackW = contentW - labelW - 8 - 44;

    for (const row of summary.byNorm) {
      ensureSpace(18);
      const pct = row.effectiveness;
      const light = normBarLight(pct);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(40);
      const name = doc.splitTextToSize(row.norm, labelW)[0] ?? row.norm;
      doc.text(name, margin, y + 7);

      doc.setFillColor(241, 245, 249);
      doc.roundedRect(trackX, y + 1, trackW, 7, 3.5, 3.5, "F");
      if (pct !== null && pct > 0) {
        const [fr, fg, fb] = normFillColor(light);
        doc.setFillColor(fr, fg, fb);
        doc.roundedRect(
          trackX,
          y + 1,
          (trackW * Math.min(100, pct)) / 100,
          7,
          3.5,
          3.5,
          "F",
        );
      }

      const [tr, tg, tb] = normTextColor(light);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(tr, tg, tb);
      doc.text(fmtPct(pct), pageW - margin, y + 7, { align: "right" });
      doc.setTextColor(0);

      y += 15;
    }
    y += 20;
  }

  // ── Desempenho por filial ──
  if (summary.byUnit.length > 0) {
    sectionTitle("Desempenho por filial");
    autoTable(doc, {
      startY: y,
      head: [["Filial", "Cumprimento", "Eficácia", "Gaps", "Status"]],
      body: summary.byUnit.map((r) => [
        r.unitName,
        fmtPct(r.completion),
        fmtPct(r.effectiveness),
        String(r.gaps),
        UNIT_STATUS_LABEL[r.status],
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: SLATE_900, textColor: 255 },
      alternateRowStyles: { fillColor: SLATE_50 },
      margin: { left: margin, right: margin },
      // Status é redesenhado à mão para sair colorido (mesmo truque do
      // export de regulatórios).
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          data.cell.text = [""];
        }
      },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 4) return;
        const row = summary.byUnit[data.row.index];
        if (!row) return;
        const light: TrafficLight | null =
          row.status === "ok"
            ? "green"
            : row.status === "atencao"
              ? "yellow"
              : row.status === "critico"
                ? "red"
                : null;
        const [r, g, b] = statusTextColor(light);
        doc.setTextColor(r, g, b);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(
          UNIT_STATUS_LABEL[row.status],
          data.cell.x + 4,
          data.cell.y + data.cell.height / 2 + 3,
        );
        doc.setTextColor(0);
        doc.setFont("helvetica", "normal");
      },
    });
    y = lastY(doc, y) + 24;
  }

  // ── Treinamentos vencidos ──
  // Recortado pelo mesmo fim de período dos cards, então já pertence ao
  // exercício do relatório — não precisa mais da ressalva de "posição atual".
  if (summary.expired.length > 0) {
    sectionTitle("Treinamentos vencidos");
    autoTable(doc, {
      startY: y,
      head: [["Colaborador", "Filial", "Treinamento", "Vencimento"]],
      body: summary.expired.map((r) => [
        r.employeeName,
        r.unitName ?? "—",
        r.title,
        fmtDate(r.expirationDate),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: SLATE_900, textColor: 255 },
      alternateRowStyles: { fillColor: SLATE_50 },
      margin: { left: margin, right: margin },
    });
    y = lastY(doc, y) + 24;
  }

  // ── Pendentes de avaliação de eficácia ──
  if (summary.pendingEffectiveness.length > 0) {
    sectionTitle("Pendentes de avaliação de eficácia");
    autoTable(doc, {
      startY: y,
      head: [["Colaborador", "Treinamento"]],
      body: summary.pendingEffectiveness.map((r) => [r.employeeName, r.title]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: SLATE_900, textColor: 255 },
      alternateRowStyles: { fillColor: SLATE_50 },
      margin: { left: margin, right: margin },
    });
    y = lastY(doc, y) + 24;
  }

  // ── Rodapé (paginação + referência normativa) ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      "Relatório de indicadores de treinamento · ISO 9001:2015 §9.1 · ISO 10015",
      margin,
      pageH - 22,
    );
    doc.text(`${i} / ${pages}`, pageW - margin, pageH - 22, { align: "right" });
  }
  doc.setTextColor(0);

  return doc;
}

export function exportLearningIndicatorsToPdf(input: LmsExportInput): void {
  const doc = buildLearningIndicatorsPdf(input);
  doc.save(`indicadores-lms_${input.year}_${fileTimestamp()}.pdf`);
}

// ─── Excel ──────────────────────────────────────────────────────────────────

function autoWidth(rows: Record<string, unknown>[], headers: string[]) {
  return headers.map((h) => {
    const max = Math.max(
      h.length,
      ...rows.map((r) => String(r[h] ?? "").length),
    );
    return { wch: Math.min(max + 2, 60) };
  });
}

function appendSheet(
  wb: XLSX.WorkBook,
  name: string,
  rows: Record<string, unknown>[],
) {
  if (rows.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = autoWidth(rows, Object.keys(rows[0]!));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

export function exportLearningIndicatorsToExcel(input: LmsExportInput): void {
  const { summary, year } = input;
  const wb = XLSX.utils.book_new();

  appendSheet(
    wb,
    "Indicadores",
    LMS_ALL_METRICS.map((def) => {
      const value = def.read(summary.cards);
      const target = findTarget(summary.targets, def.key);
      const status = metricStatus(value, target);
      return {
        Indicador: def.label,
        Norma: def.isoRef,
        Valor: value ?? "",
        Meta: target?.goal ?? "",
        // Sem meta não há direção a declarar — preencher "Maior é melhor" por
        // padrão contradiria a coluna Situação, que diz "Sem dados".
        Direção: !target
          ? ""
          : target.direction === "down"
            ? "Menor é melhor"
            : "Maior é melhor",
        Situação: status ? STATUS_LABEL[status] : "Sem dados",
      };
    }),
  );

  appendSheet(
    wb,
    "Eficácia por norma",
    summary.byNorm.map((r) => ({
      Norma: r.norm,
      "Eficácia (%)": r.effectiveness ?? "",
    })),
  );

  appendSheet(
    wb,
    "Por filial",
    summary.byUnit.map((r) => ({
      Filial: r.unitName,
      "Cumprimento (%)": r.completion ?? "",
      "Eficácia (%)": r.effectiveness ?? "",
      Gaps: r.gaps,
      Status: UNIT_STATUS_LABEL[r.status],
    })),
  );

  appendSheet(
    wb,
    "Vencidos",
    summary.expired.map((r) => ({
      Colaborador: r.employeeName,
      Filial: r.unitName ?? "",
      Treinamento: r.title,
      Vencimento: fmtDate(r.expirationDate),
    })),
  );

  appendSheet(
    wb,
    "Eficácia pendente",
    summary.pendingEffectiveness.map((r) => ({
      Colaborador: r.employeeName,
      Treinamento: r.title,
    })),
  );

  // Uma pasta sem nenhuma aba quebra o writeFile — garante ao menos o resumo.
  if (wb.SheetNames.length === 0) {
    appendSheet(wb, "Indicadores", [{ Aviso: "Sem dados no período." }]);
  }

  XLSX.writeFile(wb, `indicadores-lms_${year}_${fileTimestamp()}.xlsx`);
}
