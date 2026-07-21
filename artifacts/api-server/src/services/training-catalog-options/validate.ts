import { and, eq } from "drizzle-orm";
import { db, trainingCatalogOptionsTable } from "@workspace/db";

/**
 * True se `code` é vazio (não classificado) ou existe como código de um tipo de
 * evidência no catálogo desta org. O form só oferta códigos do catálogo; esta
 * trava rejeita códigos arbitrários vindos direto da API. Espelha
 * `assertNormsBelongToOrg`.
 */
export async function assertEvidenceTypeBelongsToOrg(
  orgId: number,
  code: string | null | undefined,
): Promise<boolean> {
  if (!code) return true; // não classificado é sempre válido
  const [row] = await db
    .select({ id: trainingCatalogOptionsTable.id })
    .from(trainingCatalogOptionsTable)
    .where(
      and(
        eq(trainingCatalogOptionsTable.organizationId, orgId),
        eq(trainingCatalogOptionsTable.kind, "evidence_type"),
        eq(trainingCatalogOptionsTable.code, code),
      ),
    );
  return Boolean(row);
}
