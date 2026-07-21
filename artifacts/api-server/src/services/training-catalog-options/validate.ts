import { and, eq } from "drizzle-orm";
import { db, trainingCatalogOptionsTable } from "@workspace/db";
import { LEGACY_EVIDENCE_CODES } from "./evidence";

/**
 * True se `code` é vazio (não classificado) ou existe como código de um tipo de
 * evidência no catálogo desta org. O form só oferta códigos do catálogo; esta
 * trava rejeita códigos arbitrários vindos direto da API. Espelha
 * `assertNormsBelongToOrg`.
 *
 * Catálogo VAZIO ⇒ aceita o vocabulário legado (mesmo fallback do resolvedor em
 * [[evidence.getProvingEvidenceCodes]]): na janela entre o DDL e o backfill, um
 * `POST`/`PATCH` que mantém `capacitacao`/`habilitacao`/`conscientizacao` não
 * pode ser rejeitado com 400. Lixo (código fora do vocabulário) continua barrado.
 */
export async function assertEvidenceTypeBelongsToOrg(
  orgId: number,
  code: string | null | undefined,
): Promise<boolean> {
  if (!code) return true; // não classificado é sempre válido
  const rows = await db
    .select({ code: trainingCatalogOptionsTable.code })
    .from(trainingCatalogOptionsTable)
    .where(
      and(
        eq(trainingCatalogOptionsTable.organizationId, orgId),
        eq(trainingCatalogOptionsTable.kind, "evidence_type"),
      ),
    );
  if (rows.length === 0)
    return (LEGACY_EVIDENCE_CODES as readonly string[]).includes(code);
  return rows.some((r) => r.code === code);
}
