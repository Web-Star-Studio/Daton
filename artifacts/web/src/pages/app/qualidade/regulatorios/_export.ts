// Export helpers — converte a lista de documentos regulatórios (já filtrada)
// para Excel (xlsx) ou PDF (jspdf + autoTable). Os 2 formatos compartilham o
// mesmo dataset/header pra consistência (auditor que pega o PDF vê os mesmos
// campos do colega que abriu no Excel).
//
// Chamado pelo dropdown "Exportar" no header da página regulatórios.

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RegulatoryDocument } from "@workspace/api-client-react";

const IDENTIFIER_LABELS: Record<string, string> = {
  licenca_ambiental: "Licença Ambiental",
  avcb: "AVCB",
  alvara: "Alvará",
  outorga: "Outorga",
  certidao: "Certidão",
  outro: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  vigente: "Vigente",
  a_vencer: "A vencer",
  vencido: "Vencido",
};

const RENEWAL_LABELS: Record<string, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  protocolado: "Protocolado",
  renovado: "Renovado",
  indeferido: "Indeferido",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Linha plana com labels em PT-BR e valores legíveis. Reusada pelos 2 formatos.
function toRow(d: RegulatoryDocument) {
  return {
    Tipo: IDENTIFIER_LABELS[d.identifierType] ?? d.identifierType,
    "Nº documento": d.documentNumber ?? "",
    "Órgão emissor": d.issuingBody,
    "Nº processo": d.processNumber ?? "",
    Filial: d.unitName ?? "",
    Responsável: d.responsibleUserName ?? "",
    "Email responsável": d.responsibleUserEmail ?? "",
    Emissão: fmtDate(d.issueDate),
    Validade: fmtDate(d.expirationDate),
    Status: STATUS_LABELS[d.status] ?? d.status,
    Renovação: d.latestRenewalStatus ? (RENEWAL_LABELS[d.latestRenewalStatus] ?? d.latestRenewalStatus) : "",
    Anexos: d.attachmentCount,
    Observações: d.notes ?? "",
  };
}

function fileTimestamp(): string {
  // YYYY-MM-DD_HHMM — bom pra arquivar com ordem alfabética cronológica
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function exportRegulatoryToExcel(docs: RegulatoryDocument[]) {
  const rows = docs.map(toRow);
  const ws = XLSX.utils.json_to_sheet(rows);
  // Largura confortável por coluna pra leitura sem truncar.
  const headers = Object.keys(rows[0] ?? toRow({
    identifierType: "", documentNumber: null, issuingBody: "", processNumber: null,
    unitName: null, responsibleUserName: null, responsibleUserEmail: null,
    issueDate: null, expirationDate: "", status: "", latestRenewalStatus: null,
    attachmentCount: 0, notes: null,
  } as unknown as RegulatoryDocument));
  ws["!cols"] = headers.map((h) => {
    const max = Math.max(h.length, ...rows.map((r) => String((r as Record<string, unknown>)[h] ?? "").length));
    return { wch: Math.min(max + 2, 50) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Documentos");
  XLSX.writeFile(wb, `documentos-regulatorios_${fileTimestamp()}.xlsx`);
}

export function exportRegulatoryToPdf(docs: RegulatoryDocument[], orgName?: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Documentos Regulatórios", 40, 40);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const subtitle = [orgName, `Gerado em ${new Date().toLocaleString("pt-BR")}`, `${docs.length} registro${docs.length === 1 ? "" : "s"}`].filter(Boolean).join("  ·  ");
  doc.text(subtitle, 40, 58);

  // Para PDF, dropamos colunas verbosas (Email, Observações) pra caber melhor
  // em paisagem. Quem precisa do detalhe completo abre o Excel.
  const headers = ["Tipo", "Nº doc", "Órgão", "Processo", "Filial", "Responsável", "Validade", "Status", "Renovação", "Anexos"];
  const body = docs.map((d) => {
    const r = toRow(d);
    return [
      r.Tipo,
      r["Nº documento"],
      r["Órgão emissor"],
      r["Nº processo"],
      r.Filial,
      r.Responsável,
      r.Validade,
      r.Status,
      r.Renovação,
      r.Anexos,
    ];
  });

  autoTable(doc, {
    startY: 75,
    head: [headers],
    body,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 }, // slate-900
    alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
    margin: { left: 40, right: 40 },
    didDrawCell: (data) => {
      // Status column → cor diferente por valor (linha-bold pro vencido)
      if (data.section === "body" && data.column.index === 7 /* Status */) {
        const cellText = String(data.cell.text[0] ?? "");
        if (cellText === "Vencido") {
          doc.setTextColor(185, 28, 28); // red-700
        } else if (cellText === "A vencer") {
          doc.setTextColor(180, 83, 9); // amber-700
        } else {
          doc.setTextColor(21, 128, 61); // green-700
        }
        doc.text(cellText, data.cell.x + 4, data.cell.y + data.cell.height / 2 + 3);
        doc.setTextColor(0, 0, 0);
      }
    },
    didParseCell: (data) => {
      // Limpa o text default da Status cell (vamos redesenhar com cor no didDrawCell)
      if (data.section === "body" && data.column.index === 7) {
        data.cell.text = [""];
      }
    },
  });

  // Footer com paginação
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 80, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(`documentos-regulatorios_${fileTimestamp()}.pdf`);
}
