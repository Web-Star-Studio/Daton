import { eq } from "drizzle-orm";
import {
  db,
  regulatoryDocumentRenewalsTable,
  regulatoryDocumentsTable,
  unitsTable,
  usersTable,
} from "@workspace/db";
import { computeStatus } from "./status";

// Janela default usada no POST do CRUD para criar o ciclo automático.
const AUTO_RENEWAL_OFFSET_DAYS = 60;

const VALID_IDENTIFIER_TYPES = new Set([
  "licenca_ambiental",
  "avcb",
  "alvara",
  "outorga",
  "certidao",
  "outro",
]);

export interface ImportRegulatoryDocumentRow {
  unitName: string;
  identifierType: string;
  identifierOther?: string | null;
  documentNumber?: string | null;
  issuingBody: string;
  processNumber?: string | null;
  responsibleUserEmail?: string | null;
  issueDate?: string | null; // accepts DD/MM/YYYY or YYYY-MM-DD
  expirationDate: string;    // accepts DD/MM/YYYY or YYYY-MM-DD
  alertDaysOverride?: number | null;
  renewalRequired?: boolean | null;
  notes?: string | null;
}

export interface ImportError {
  row: number; // 1-based row index from the perspective of the spreadsheet (header = row 1, first data row = 2)
  message: string;
}

export interface ImportResult {
  inserted: number;
  errors: ImportError[];
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(isoDateStr: string, days: number): string {
  const [y, m, d] = isoDateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

/**
 * Aceita DD/MM/YYYY ou YYYY-MM-DD. Retorna ISO (YYYY-MM-DD) ou null.
 */
function parseDateFlexible(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/**
 * Resolve a filial por nome (case-insensitive contains). Ambiguidade → null.
 */
function resolveUnit(
  units: { id: number; name: string }[],
  unitName: string,
): { id: number; name: string } | null | "ambiguous" {
  const term = unitName.trim().toLowerCase();
  if (!term) return null;
  const exact = units.find((u) => u.name.trim().toLowerCase() === term);
  if (exact) return exact;
  const matches = units.filter((u) => u.name.toLowerCase().includes(term));
  if (matches.length === 0) return null;
  if (matches.length > 1) return "ambiguous";
  return matches[0];
}

/**
 * Importa em lote documentos regulatórios.
 *
 * Não-transacional por design: validações são por linha. Linhas válidas são
 * inseridas; linhas inválidas viram entradas em `errors` com índice referente
 * à posição na planilha (linha 1 = header, primeira linha de dados = 2).
 *
 * Para cada documento inserido com `renewalRequired=true`, replica o
 * comportamento do POST do CRUD: cria 1 ciclo de renovação `nao_iniciado`
 * com início programado 60 dias antes da validade.
 */
export async function importRegulatoryDocuments(
  organizationId: number,
  rows: ImportRegulatoryDocumentRow[],
): Promise<ImportResult> {
  if (rows.length === 0) return { inserted: 0, errors: [] };

  // Preload lookups once para evitar N queries.
  const units = await db
    .select({ id: unitsTable.id, name: unitsTable.name })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, organizationId));

  const usersList = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.organizationId, organizationId));
  const usersByEmail = new Map<string, number>();
  for (const u of usersList) {
    usersByEmail.set(u.email.trim().toLowerCase(), u.id);
  }

  const errors: ImportError[] = [];
  let inserted = 0;

  for (let i = 0; i < rows.length; i++) {
    // i=0 → linha 2 da planilha (linha 1 é o header).
    const rowNumber = i + 2;
    const row = rows[i];

    try {
      // --- Validação de campos obrigatórios ---
      if (!row.unitName || !String(row.unitName).trim()) {
        errors.push({ row: rowNumber, message: "Campo obrigatório: filial" });
        continue;
      }
      if (!row.identifierType || !String(row.identifierType).trim()) {
        errors.push({ row: rowNumber, message: "Campo obrigatório: tipo" });
        continue;
      }
      if (!VALID_IDENTIFIER_TYPES.has(String(row.identifierType).trim())) {
        errors.push({
          row: rowNumber,
          message: `Tipo inválido: ${row.identifierType}. Use um de: ${[...VALID_IDENTIFIER_TYPES].join(", ")}`,
        });
        continue;
      }
      if (!row.issuingBody || !String(row.issuingBody).trim()) {
        errors.push({ row: rowNumber, message: "Campo obrigatório: orgao (órgão emissor)" });
        continue;
      }
      const expirationDate = parseDateFlexible(row.expirationDate);
      if (!expirationDate) {
        errors.push({
          row: rowNumber,
          message: "Campo obrigatório/inválido: validade (use DD/MM/AAAA ou AAAA-MM-DD)",
        });
        continue;
      }

      // --- Lookup de filial ---
      const unitResolved = resolveUnit(units, String(row.unitName));
      if (unitResolved === null) {
        errors.push({
          row: rowNumber,
          message: `Filial não encontrada: "${row.unitName}"`,
        });
        continue;
      }
      if (unitResolved === "ambiguous") {
        errors.push({
          row: rowNumber,
          message: `Filial ambígua: "${row.unitName}" bate com mais de uma unidade — use um nome mais específico`,
        });
        continue;
      }
      const unit = unitResolved;

      // --- Lookup de responsável (opcional) ---
      let responsibleUserId: number | null = null;
      if (row.responsibleUserEmail && String(row.responsibleUserEmail).trim()) {
        const email = String(row.responsibleUserEmail).trim().toLowerCase();
        const userId = usersByEmail.get(email);
        if (!userId) {
          errors.push({
            row: rowNumber,
            message: `Responsável não encontrado pelo email: "${row.responsibleUserEmail}". Cadastre o usuário em Configurações → Usuários.`,
          });
          continue;
        }
        responsibleUserId = userId;
      }

      // --- Issue date (opcional) ---
      let issueDate: string | null = null;
      if (row.issueDate !== undefined && row.issueDate !== null && String(row.issueDate).trim()) {
        const parsed = parseDateFlexible(row.issueDate);
        if (!parsed) {
          errors.push({
            row: rowNumber,
            message: "Emissão em formato inválido (use DD/MM/AAAA ou AAAA-MM-DD)",
          });
          continue;
        }
        issueDate = parsed;
      }

      // --- alertDaysOverride (opcional) ---
      let alertDaysOverride: number | null = null;
      if (row.alertDaysOverride !== undefined && row.alertDaysOverride !== null) {
        const n = Number(row.alertDaysOverride);
        if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
          errors.push({
            row: rowNumber,
            message: "alerta_dias deve ser um inteiro positivo",
          });
          continue;
        }
        alertDaysOverride = n;
      }

      const renewalRequired = row.renewalRequired ?? true;
      const status = computeStatus(expirationDate, alertDaysOverride);
      const identifierType = String(row.identifierType).trim();
      const identifierOther = identifierType === "outro"
        ? (row.identifierOther ?? null)?.toString().trim() || null
        : null;

      const [doc] = await db
        .insert(regulatoryDocumentsTable)
        .values({
          organizationId,
          unitId: unit.id,
          identifierType,
          identifierOther,
          documentNumber: row.documentNumber?.toString().trim() || null,
          issuingBody: String(row.issuingBody).trim(),
          processNumber: row.processNumber?.toString().trim() || null,
          responsibleUserId,
          issueDate,
          expirationDate,
          renewalRequired,
          alertDaysOverride,
          notes: row.notes?.toString().trim() || null,
          status,
        })
        .returning();

      if (doc.renewalRequired) {
        const scheduledStartDate = addDays(doc.expirationDate, -AUTO_RENEWAL_OFFSET_DAYS);
        await db.insert(regulatoryDocumentRenewalsTable).values({
          organizationId,
          documentId: doc.id,
          status: "nao_iniciado",
          scheduledStartDate,
        });
      }

      inserted++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ row: rowNumber, message: `Erro inesperado: ${message}` });
      console.error(`[regulatory-documents:import] row ${rowNumber} failed:`, err);
    }
  }

  return { inserted, errors };
}
