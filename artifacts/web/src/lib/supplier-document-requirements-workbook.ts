import * as XLSX from "xlsx";
import type { SupplierDocumentRequirementImportInputRow } from "@/lib/suppliers-client";

const TEMPLATE_HEADERS = {
  NAME: "Nome do Documento *",
  WEIGHT: "Peso (1-5) *",
  DESCRIPTION: "Descrição",
} as const;

const TEMPLATE_HEADER_ORDER = [
  TEMPLATE_HEADERS.NAME,
  TEMPLATE_HEADERS.WEIGHT,
  TEMPLATE_HEADERS.DESCRIPTION,
];

function normalizeCell(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function parseSupplierDocumentRequirementsWorkbook(file: File) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("A planilha não contém nenhuma aba.");
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error("Não foi possível ler a aba da planilha.");
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
  });

  return rows.map((row, index) => ({
    rowNumber: index + 2,
    name: normalizeCell(row[TEMPLATE_HEADERS.NAME]),
    weight: normalizeCell(row[TEMPLATE_HEADERS.WEIGHT]),
    description: normalizeCell(row[TEMPLATE_HEADERS.DESCRIPTION]) || null,
  })) satisfies SupplierDocumentRequirementImportInputRow[];
}

export function downloadSupplierDocumentRequirementsWorkbook(
  rows: Array<{ name: string; weight: number; description: string | null }>,
  fileName: string,
) {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      [TEMPLATE_HEADERS.NAME]: row.name,
      [TEMPLATE_HEADERS.WEIGHT]: row.weight,
      [TEMPLATE_HEADERS.DESCRIPTION]: row.description ?? "",
    })),
    { header: TEMPLATE_HEADER_ORDER },
  );
  worksheet["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 48 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template Documentos");
  XLSX.writeFile(workbook, fileName);
}
