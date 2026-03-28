import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { and, eq, lte, sql } from "drizzle-orm";
import {
  db,
  supplierCategoriesTable,
  supplierDocumentRequirementsTable,
  supplierImportPreviewsTable,
  supplierTypesTable,
  suppliersTable,
  unitsTable,
} from "@workspace/db";

type SupplierDocumentRequirementImportInputRow = {
  rowNumber?: number;
  name?: unknown;
  weight?: unknown;
  description?: unknown;
};

type SupplierDocumentRequirementPreviewRow = {
  rowNumber: number;
  name: string;
  description: string | null;
  weight: number | null;
  action: "create" | "update" | "invalid";
  existingRequirementId: number | null;
  errors: string[];
};

type SupplierImportInputRow = {
  rowNumber?: number;
  legalIdentifier?: unknown;
  personType?: unknown;
  legalName?: unknown;
  tradeName?: unknown;
  responsibleName?: unknown;
  phone?: unknown;
  email?: unknown;
  postalCode?: unknown;
  street?: unknown;
  streetNumber?: unknown;
  neighborhood?: unknown;
  city?: unknown;
  state?: unknown;
  unitNames?: unknown;
  categoryName?: unknown;
  typeNames?: unknown;
  notes?: unknown;
};

type SupplierImportPreviewRow = {
  rowNumber: number;
  action: "create" | "update" | "invalid";
  personType: "pj" | "pf" | null;
  legalIdentifier: string;
  legalIdentifierDigits: string;
  legalName: string;
  tradeName: string | null;
  responsibleName: string | null;
  phone: string | null;
  email: string | null;
  postalCode: string | null;
  street: string | null;
  streetNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  categoryId: number | null;
  unitIds: number[];
  typeIds: number[];
  existingSupplierId: number | null;
  errors: string[];
};

type PreviewSummary = {
  totalRows: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
};

type SupplierDocumentRequirementPreview = {
  previewToken: string;
  rows: SupplierDocumentRequirementPreviewRow[];
  summary: PreviewSummary;
};

type SupplierImportPreview = {
  previewToken: string;
  rows: SupplierImportPreviewRow[];
  summary: PreviewSummary;
};

type PreviewTokenKind = "supplier-document-requirements-import" | "suppliers-import";

type PreviewTokenPayload = {
  kind: PreviewTokenKind;
  orgId: number;
  previewId: string;
};

type PreviewStoreRows = SupplierDocumentRequirementPreviewRow[] | SupplierImportPreviewRow[];

const PREVIEW_TTL_MS = 15 * 60 * 1000;
let previewStoreTableReady: Promise<void> | null = null;

function getPreviewTokenSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

function normalizeOptionalString(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeImportCell(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeRequirementKey(name: string): string {
  return normalizeImportCell(name).toLocaleLowerCase("pt-BR");
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePersonType(value: unknown): "pj" | "pf" | null {
  const normalized = normalizeImportCell(value).toLocaleLowerCase("pt-BR");
  if (normalized === "pj" || normalized === "pessoa jurídica" || normalized === "pessoa juridica") {
    return "pj";
  }
  if (normalized === "pf" || normalized === "pessoa física" || normalized === "pessoa fisica") {
    return "pf";
  }
  return null;
}

function splitImportList(value: unknown) {
  return Array.from(
    new Set(
      normalizeImportCell(value)
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function summarizePreviewRows<T extends { action: string; errors: string[] }>(rows: T[]): PreviewSummary {
  return {
    totalRows: rows.length,
    createCount: rows.filter((row) => row.action === "create").length,
    updateCount: rows.filter((row) => row.action === "update").length,
    errorCount: rows.filter((row) => row.errors.length > 0).length,
  };
}

async function ensurePreviewStoreTable() {
  if (!previewStoreTableReady) {
    previewStoreTableReady = db.execute(sql`
      CREATE TABLE IF NOT EXISTS supplier_import_previews (
        preview_id text PRIMARY KEY,
        organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        kind text NOT NULL,
        rows jsonb NOT NULL DEFAULT '[]'::jsonb,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `).then(() => undefined);
  }

  await previewStoreTableReady;
}

async function cleanupExpiredPreviewEntries(now = new Date()) {
  await ensurePreviewStoreTable();
  await db
    .delete(supplierImportPreviewsTable)
    .where(lte(supplierImportPreviewsTable.expiresAt, now));
}

async function persistPreviewRows(kind: PreviewTokenKind, orgId: number, rows: PreviewStoreRows) {
  await cleanupExpiredPreviewEntries();
  const previewId = randomUUID();
  await db.insert(supplierImportPreviewsTable).values({
    previewId,
    organizationId: orgId,
    kind,
    rows,
    expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
  });
  return previewId;
}

function signPreviewToken(kind: PreviewTokenKind, orgId: number, previewId: string) {
  return jwt.sign(
    {
      kind,
      orgId,
      previewId,
    },
    getPreviewTokenSecret(),
    {
      expiresIn: "15m",
      audience: kind,
    },
  );
}

async function verifyPreviewToken(kind: "supplier-document-requirements-import", orgId: number, token: string): Promise<SupplierDocumentRequirementPreviewRow[]>;
async function verifyPreviewToken(kind: "suppliers-import", orgId: number, token: string): Promise<SupplierImportPreviewRow[]>;
async function verifyPreviewToken(kind: PreviewTokenKind, orgId: number, token: string) {
  try {
    await cleanupExpiredPreviewEntries();
    const payload = jwt.verify(token, getPreviewTokenSecret(), {
      audience: kind,
    }) as PreviewTokenPayload;

    if (payload.orgId !== orgId || payload.kind !== kind || !payload.previewId) {
      throw new Error("Prévia de importação inválida ou expirada.");
    }

    const [previewEntry] = await db
      .select({
        organizationId: supplierImportPreviewsTable.organizationId,
        kind: supplierImportPreviewsTable.kind,
        rows: supplierImportPreviewsTable.rows,
        expiresAt: supplierImportPreviewsTable.expiresAt,
      })
      .from(supplierImportPreviewsTable)
      .where(
        and(
          eq(supplierImportPreviewsTable.previewId, payload.previewId),
          eq(supplierImportPreviewsTable.organizationId, orgId),
          eq(supplierImportPreviewsTable.kind, kind),
        ),
      );

    if (!previewEntry || previewEntry.organizationId !== orgId || previewEntry.kind !== kind) {
      throw new Error("Prévia de importação inválida ou expirada.");
    }

    if (previewEntry.expiresAt <= new Date()) {
      throw new Error("Prévia de importação inválida ou expirada.");
    }

    return previewEntry.rows as PreviewStoreRows;
  } catch {
    throw new Error("Prévia de importação inválida ou expirada.");
  }
}

export async function buildSupplierDocumentRequirementImportPreview(
  orgId: number,
  rows: SupplierDocumentRequirementImportInputRow[],
): Promise<SupplierDocumentRequirementPreview> {
  const existingRequirements = await db
    .select({
      id: supplierDocumentRequirementsTable.id,
      name: supplierDocumentRequirementsTable.name,
    })
    .from(supplierDocumentRequirementsTable)
    .where(eq(supplierDocumentRequirementsTable.organizationId, orgId));

  const existingByName = new Map(
    existingRequirements.map((requirement) => [
      normalizeRequirementKey(requirement.name),
      requirement,
    ]),
  );
  const seenImportKeys = new Map<string, number>();

  const previewRows = rows.map((row, index) => {
    const rowNumber = row.rowNumber ?? index + 2;
    const name = normalizeImportCell(row.name);
    const description = normalizeOptionalString(normalizeImportCell(row.description));
    const rawWeight = normalizeImportCell(row.weight);
    const parsedWeight = rawWeight ? Number(rawWeight) : Number.NaN;
    const errors: string[] = [];

    if (!name) {
      errors.push("Informe o nome do documento.");
    }

    if (!rawWeight || !Number.isInteger(parsedWeight) || parsedWeight < 1 || parsedWeight > 5) {
      errors.push("O peso deve ser um número inteiro entre 1 e 5.");
    }

    const normalizedName = name ? normalizeRequirementKey(name) : "";
    const duplicateRow = normalizedName ? seenImportKeys.get(normalizedName) : undefined;
    if (normalizedName) {
      if (duplicateRow) {
        errors.push(`Documento repetido na planilha. A primeira ocorrência está na linha ${duplicateRow}.`);
      } else {
        seenImportKeys.set(normalizedName, rowNumber);
      }
    }

    const existingRequirement = normalizedName ? existingByName.get(normalizedName) : undefined;
    const action = errors.length > 0 ? "invalid" : existingRequirement ? "update" : "create";

    return {
      rowNumber,
      name,
      description,
      weight: Number.isInteger(parsedWeight) ? parsedWeight : null,
      action,
      existingRequirementId: existingRequirement?.id ?? null,
      errors,
    } satisfies SupplierDocumentRequirementPreviewRow;
  });

  const previewId = await persistPreviewRows("supplier-document-requirements-import", orgId, previewRows);
  return {
    previewToken: signPreviewToken("supplier-document-requirements-import", orgId, previewId),
    rows: previewRows,
    summary: summarizePreviewRows(previewRows),
  };
}

export function readSupplierDocumentRequirementImportPreview(
  orgId: number,
  previewToken: string,
): Promise<SupplierDocumentRequirementPreview> {
  const rowsPromise = verifyPreviewToken("supplier-document-requirements-import", orgId, previewToken);
  return rowsPromise.then((rows) => ({
    previewToken,
    rows,
    summary: summarizePreviewRows(rows),
  }));
}

export async function buildSupplierImportPreview(
  orgId: number,
  rows: SupplierImportInputRow[],
): Promise<SupplierImportPreview> {
  const [existingSuppliers, units, categories, types] = await Promise.all([
    db
      .select({
        id: suppliersTable.id,
        legalIdentifier: suppliersTable.legalIdentifier,
      })
      .from(suppliersTable)
      .where(eq(suppliersTable.organizationId, orgId)),
    db
      .select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable)
      .where(eq(unitsTable.organizationId, orgId)),
    db
      .select({ id: supplierCategoriesTable.id, name: supplierCategoriesTable.name })
      .from(supplierCategoriesTable)
      .where(eq(supplierCategoriesTable.organizationId, orgId)),
    db
      .select({ id: supplierTypesTable.id, name: supplierTypesTable.name })
      .from(supplierTypesTable)
      .where(eq(supplierTypesTable.organizationId, orgId)),
  ]);

  const suppliersByIdentifier = new Map(
    existingSuppliers.map((supplier) => [normalizeDigits(supplier.legalIdentifier), supplier]),
  );
  const unitsByName = new Map(units.map((unit) => [normalizeRequirementKey(unit.name), unit]));
  const categoriesByName = new Map(categories.map((category) => [normalizeRequirementKey(category.name), category]));
  const typesByName = new Map(types.map((type) => [normalizeRequirementKey(type.name), type]));
  const seenIdentifiers = new Map<string, number>();

  const previewRows = rows.map((row, index) => {
    const rowNumber = row.rowNumber ?? index + 2;
    const personType = normalizePersonType(row.personType);
    const legalIdentifier = normalizeImportCell(row.legalIdentifier);
    const legalIdentifierDigits = normalizeDigits(legalIdentifier);
    const legalName = normalizeImportCell(row.legalName);
    const tradeName = normalizeOptionalString(normalizeImportCell(row.tradeName));
    const responsibleName = normalizeOptionalString(normalizeImportCell(row.responsibleName));
    const phone = normalizeOptionalString(normalizeImportCell(row.phone));
    const email = normalizeOptionalString(normalizeImportCell(row.email));
    const postalCode = normalizeOptionalString(normalizeImportCell(row.postalCode));
    const street = normalizeOptionalString(normalizeImportCell(row.street));
    const streetNumber = normalizeOptionalString(normalizeImportCell(row.streetNumber));
    const neighborhood = normalizeOptionalString(normalizeImportCell(row.neighborhood));
    const city = normalizeOptionalString(normalizeImportCell(row.city));
    const state = normalizeOptionalString(normalizeImportCell(row.state));
    const categoryName = normalizeImportCell(row.categoryName);
    const unitNames = splitImportList(row.unitNames);
    const typeNames = splitImportList(row.typeNames);
    const notes = normalizeOptionalString(normalizeImportCell(row.notes));
    const errors: string[] = [];

    if (!personType) {
      errors.push("Informe o tipo como PF ou PJ.");
    }
    if (!legalIdentifierDigits) {
      errors.push("Informe o CNPJ/CPF.");
    }
    if (personType === "pj" && legalIdentifierDigits.length !== 14) {
      errors.push("CNPJ inválido. Informe 14 dígitos.");
    }
    if (personType === "pf" && legalIdentifierDigits.length !== 11) {
      errors.push("CPF inválido. Informe 11 dígitos.");
    }
    if (!legalName) {
      errors.push("Informe a razão social ou nome.");
    }
    if (personType === "pj" && !responsibleName) {
      errors.push("Informe o responsável para fornecedores PJ.");
    }
    if (personType === "pj" && !email) {
      errors.push("Informe o email para fornecedores PJ.");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Email inválido.");
    }

    const duplicateRow = legalIdentifierDigits ? seenIdentifiers.get(legalIdentifierDigits) : undefined;
    if (legalIdentifierDigits) {
      if (duplicateRow) {
        errors.push(`Documento fiscal repetido na planilha. A primeira ocorrência está na linha ${duplicateRow}.`);
      } else {
        seenIdentifiers.set(legalIdentifierDigits, rowNumber);
      }
    }

    const category = categoryName ? categoriesByName.get(normalizeRequirementKey(categoryName)) : undefined;
    if (categoryName && !category) {
      errors.push(`Categoria não encontrada: ${categoryName}.`);
    }

    const unitIds = unitNames.map((name) => unitsByName.get(normalizeRequirementKey(name))?.id ?? null);
    unitNames.forEach((name, index) => {
      if (!unitIds[index]) {
        errors.push(`Unidade de negócio não encontrada: ${name}.`);
      }
    });

    const typeIds = typeNames.map((name) => typesByName.get(normalizeRequirementKey(name))?.id ?? null);
    typeNames.forEach((name, index) => {
      if (!typeIds[index]) {
        errors.push(`Tipo de fornecedor não encontrado: ${name}.`);
      }
    });

    const existingSupplier = legalIdentifierDigits
      ? suppliersByIdentifier.get(legalIdentifierDigits)
      : undefined;
    const action = errors.length > 0 ? "invalid" : existingSupplier ? "update" : "create";

    return {
      rowNumber,
      action,
      personType,
      legalIdentifier,
      legalIdentifierDigits,
      legalName,
      tradeName,
      responsibleName,
      phone,
      email,
      postalCode,
      street,
      streetNumber,
      neighborhood,
      city,
      state,
      notes,
      categoryId: category?.id ?? null,
      unitIds: unitIds.filter((value): value is number => Boolean(value)),
      typeIds: typeIds.filter((value): value is number => Boolean(value)),
      existingSupplierId: existingSupplier?.id ?? null,
      errors,
    } satisfies SupplierImportPreviewRow;
  });

  const previewId = await persistPreviewRows("suppliers-import", orgId, previewRows);
  return {
    previewToken: signPreviewToken("suppliers-import", orgId, previewId),
    rows: previewRows,
    summary: summarizePreviewRows(previewRows),
  };
}

export function readSupplierImportPreview(
  orgId: number,
  previewToken: string,
): Promise<SupplierImportPreview> {
  const rowsPromise = verifyPreviewToken("suppliers-import", orgId, previewToken);
  return rowsPromise.then((rows) => ({
    previewToken,
    rows,
    summary: summarizePreviewRows(rows),
  }));
}
