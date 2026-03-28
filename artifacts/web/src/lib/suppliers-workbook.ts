import * as XLSX from "xlsx";
import type { SupplierImportInputRow } from "@/lib/suppliers-client";

const SUPPLIER_HEADERS = [
  "CNPJ/CPF *",
  "Tipo (PF/PJ) *",
  "Razão Social/Nome *",
  "Nome Fantasia",
  "Responsável (obrigatório PJ)",
  "Telefone *",
  "Email (obrigatório PJ)",
  "CEP *",
  "Logradouro *",
  "Número *",
  "Bairro *",
  "Cidade *",
  "Estado *",
  "Unidade de Negócio *",
  "Categoria *",
  "Tipo de Fornecedor *",
  "Observações",
] as const;

function normalizeCell(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function parseSuppliersWorkbook(file: File) {
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
    legalIdentifier: normalizeCell(row[SUPPLIER_HEADERS[0]]),
    personType: normalizeCell(row[SUPPLIER_HEADERS[1]]),
    legalName: normalizeCell(row[SUPPLIER_HEADERS[2]]),
    tradeName: normalizeCell(row[SUPPLIER_HEADERS[3]]) || null,
    responsibleName: normalizeCell(row[SUPPLIER_HEADERS[4]]) || null,
    phone: normalizeCell(row[SUPPLIER_HEADERS[5]]) || null,
    email: normalizeCell(row[SUPPLIER_HEADERS[6]]) || null,
    postalCode: normalizeCell(row[SUPPLIER_HEADERS[7]]) || null,
    street: normalizeCell(row[SUPPLIER_HEADERS[8]]) || null,
    streetNumber: normalizeCell(row[SUPPLIER_HEADERS[9]]) || null,
    neighborhood: normalizeCell(row[SUPPLIER_HEADERS[10]]) || null,
    city: normalizeCell(row[SUPPLIER_HEADERS[11]]) || null,
    state: normalizeCell(row[SUPPLIER_HEADERS[12]]) || null,
    unitNames: normalizeCell(row[SUPPLIER_HEADERS[13]]),
    categoryName: normalizeCell(row[SUPPLIER_HEADERS[14]]),
    typeNames: normalizeCell(row[SUPPLIER_HEADERS[15]]),
    notes: normalizeCell(row[SUPPLIER_HEADERS[16]]) || null,
  })) satisfies SupplierImportInputRow[];
}

export function downloadSuppliersWorkbook(
  rows: Array<{
    legalIdentifier: string;
    personType: string;
    legalName: string;
    tradeName: string;
    responsibleName: string;
    phone: string;
    email: string;
    postalCode: string;
    street: string;
    streetNumber: string;
    neighborhood: string;
    city: string;
    state: string;
    unitNames: string;
    categoryName: string;
    typeNames: string;
    notes: string;
  }>,
  fileName: string,
) {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      [SUPPLIER_HEADERS[0]]: row.legalIdentifier,
      [SUPPLIER_HEADERS[1]]: row.personType,
      [SUPPLIER_HEADERS[2]]: row.legalName,
      [SUPPLIER_HEADERS[3]]: row.tradeName,
      [SUPPLIER_HEADERS[4]]: row.responsibleName,
      [SUPPLIER_HEADERS[5]]: row.phone,
      [SUPPLIER_HEADERS[6]]: row.email,
      [SUPPLIER_HEADERS[7]]: row.postalCode,
      [SUPPLIER_HEADERS[8]]: row.street,
      [SUPPLIER_HEADERS[9]]: row.streetNumber,
      [SUPPLIER_HEADERS[10]]: row.neighborhood,
      [SUPPLIER_HEADERS[11]]: row.city,
      [SUPPLIER_HEADERS[12]]: row.state,
      [SUPPLIER_HEADERS[13]]: row.unitNames,
      [SUPPLIER_HEADERS[14]]: row.categoryName,
      [SUPPLIER_HEADERS[15]]: row.typeNames,
      [SUPPLIER_HEADERS[16]]: row.notes,
    })),
    { header: [...SUPPLIER_HEADERS] },
  );

  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 34 },
    { wch: 24 },
    { wch: 24 },
    { wch: 18 },
    { wch: 28 },
    { wch: 12 },
    { wch: 28 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 10 },
    { wch: 24 },
    { wch: 18 },
    { wch: 24 },
    { wch: 30 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
  XLSX.writeFile(workbook, fileName);
}
