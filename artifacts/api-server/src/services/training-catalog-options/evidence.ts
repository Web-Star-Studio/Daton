import { and, eq } from "drizzle-orm";
import { db, trainingCatalogOptionsTable } from "@workspace/db";

/**
 * Códigos legados que comprovavam competência antes do catálogo gerenciável.
 * Usados como fallback quando a org ainda não tem NENHUM tipo de evidência no
 * catálogo (ex.: backfill não rodou, ou ambiente de teste) — assim a derivação
 * de competência nunca quebra por um catálogo vazio. Quando existe ao menos um
 * tipo, o catálogo manda (mesmo que nenhum comprove: respeita a escolha).
 */
const LEGACY_PROVING_CODES = ["capacitacao", "habilitacao"] as const;

/**
 * Gera um código estável (máquina) a partir do rótulo de um tipo de evidência.
 * Remove acentos e reduz a [a-z0-9_]. Ex.: "Capacitação" → "capacitacao",
 * "Palestra externa" → "palestra_externa". Os 3 tipos padrão reusam exatamente
 * os códigos legados (`capacitacao`/`habilitacao`/`conscientizacao`), que é o
 * que este slug produz para eles — assim as linhas já gravadas seguem válidas.
 */
export function slugifyEvidenceCode(label: string): string {
  const base = label
    .normalize("NFD")
    // Remove marcas diacríticas combinantes (U+0300–U+036F) sem depender de um
    // literal não-ASCII no fonte: "Capacitação" → "Capacitacao".
    .split("")
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c < 0x0300 || c > 0x036f;
    })
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "tipo";
}

/**
 * Conjunto de códigos de tipo de evidência que COMPROVAM competência nesta org.
 * Substitui o antigo array fixo `PROVING_EVIDENCE_TYPES`. Considera qualquer
 * option com `proves_competency = true` — INDEPENDENTE de `active`: desativar um
 * tipo só o tira do seletor de novos itens, mas os treinos já classificados com
 * aquele código devem continuar comprovando (senão o elo treinamento↔competência
 * quebraria em silêncio para o dado existente).
 *
 * Catálogo VAZIO (nenhum tipo de evidência na org) ⇒ fallback para os códigos
 * legados: cobre o intervalo entre o deploy do código e o backfill, e os testes.
 */
export async function getProvingEvidenceCodes(
  database: Pick<typeof db, "select">,
  orgId: number,
): Promise<string[]> {
  const rows = await database
    .select({
      code: trainingCatalogOptionsTable.code,
      provesCompetency: trainingCatalogOptionsTable.provesCompetency,
    })
    .from(trainingCatalogOptionsTable)
    .where(
      and(
        eq(trainingCatalogOptionsTable.organizationId, orgId),
        eq(trainingCatalogOptionsTable.kind, "evidence_type"),
      ),
    );

  if (rows.length === 0) return [...LEGACY_PROVING_CODES];

  return rows
    .filter((r) => r.provesCompetency)
    .map((r) => r.code)
    .filter((c): c is string => Boolean(c));
}
