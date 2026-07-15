/**
 * Helper compartilhado: resolve normas (códigos legados string, ex. "9001")
 * para ids do catálogo por-organização (`regulatory_norms`).
 *
 * Usado por scripts que ainda produzem/atualizam `kpi_indicators.norms` a
 * partir de códigos derivados de heurísticas (seed-kpi, backfill de
 * categoria) — desde a Task 1 dessa feature, `norms` é `number[]` (ids do
 * catálogo), não mais `string[]` (códigos ISO).
 *
 * Fonte de verdade dos labels/mapa: artifacts/api-server/src/services/norms/defaults.ts
 * (não importamos de lá para não acoplar `scripts/` ao build de `api-server`).
 */
import { db, regulatoryNormsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const DEFAULT_NORM_LABELS = [
  "ISO 9001 · cl. 9.1",
  "ISO 14001 · cl. 9.1",
  "ISO 39001 · cl. 9.1",
  "PR 2030",
];

export const KPI_CODE_TO_LABEL: Record<string, string> = {
  "9001": "ISO 9001 · cl. 9.1",
  "14001": "ISO 14001 · cl. 9.1",
  "39001": "ISO 39001 · cl. 9.1",
};

/**
 * De/para das normas legadas do catálogo de treinamentos (lista hardcoded
 * antiga, ex. "ISO 9001 §7.2") para os labels canônicos do catálogo. Chaves em
 * lower-case. As que NÃO aparecem aqui (ex. "NR (MTE)", "ABNT ISO 10015",
 * "Procedimento interno", texto livre) são preservadas: o backfill cria uma
 * entrada no catálogo com o próprio label — nada é perdido.
 */
export const TRAINING_NORM_ALIASES: Record<string, string> = {
  "iso 9001 §7.2": "ISO 9001 · cl. 9.1",
  "iso 14001 §7.2": "ISO 14001 · cl. 9.1",
  "iso 39001 §7.2": "ISO 39001 · cl. 9.1",
  pr2030: "PR 2030",
};

/**
 * Resolve o label legado de treinamento para o label canônico do catálogo:
 * aplica o alias quando conhecido; senão devolve o texto original (trim) para
 * ser criado como norma nova. Nunca descarta.
 */
export function canonicalTrainingNormLabel(raw: string): string {
  const trimmed = raw.trim();
  return TRAINING_NORM_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Semeia os 4 labels padrão na organização (idempotente, ON CONFLICT DO
 * NOTHING) e devolve um mapa código legado (ex. "9001") -> id do catálogo.
 */
export async function ensureOrgNormsAndMap(
  orgId: number,
): Promise<Map<string, number>> {
  for (let i = 0; i < DEFAULT_NORM_LABELS.length; i++) {
    await db
      .insert(regulatoryNormsTable)
      .values({
        organizationId: orgId,
        label: DEFAULT_NORM_LABELS[i],
        sortOrder: i,
      })
      .onConflictDoNothing();
  }

  const rows = await db
    .select({ id: regulatoryNormsTable.id, label: regulatoryNormsTable.label })
    .from(regulatoryNormsTable)
    .where(eq(regulatoryNormsTable.organizationId, orgId));

  const labelToId = new Map(rows.map((r) => [r.label.toLowerCase(), r.id]));

  const codeToId = new Map<string, number>();
  for (const [code, label] of Object.entries(KPI_CODE_TO_LABEL)) {
    const id = labelToId.get(label.toLowerCase());
    if (id != null) codeToId.set(code, id);
  }
  return codeToId;
}

/** Resolve+dedup códigos legados para ids do catálogo, descartando desconhecidos. */
export function codesToNormIds(
  codes: string[],
  codeToId: Map<string, number>,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const code of codes) {
    const id = codeToId.get(code);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
