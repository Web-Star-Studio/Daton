import * as XLSX from "xlsx";
import type { SupplierDocumentRequirementImportInputRow } from "@/lib/suppliers-client";

const TEMPLATE_HEADERS = ["Nome do Documento *", "Peso (1-5) *", "Descrição"];

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
    name: normalizeCell(row["Nome do Documento *"]),
    weight: normalizeCell(row["Peso (1-5) *"]),
    description: normalizeCell(row["Descrição"]) || null,
  })) satisfies SupplierDocumentRequirementImportInputRow[];
}

export function downloadSupplierDocumentRequirementsWorkbook(
  rows: Array<{ name: string; weight: number; description: string | null }>,
  fileName: string,
) {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      [TEMPLATE_HEADERS[0]]: row.name,
      [TEMPLATE_HEADERS[1]]: row.weight,
      [TEMPLATE_HEADERS[2]]: row.description ?? "",
    })),
    { header: TEMPLATE_HEADERS },
  );
  worksheet["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 48 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template Documentos");
  XLSX.writeFile(workbook, fileName);
}
