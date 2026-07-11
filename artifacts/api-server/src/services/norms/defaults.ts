import { db, regulatoryNormsTable } from "@workspace/db";

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

/** Resolve códigos KPI legados para ids do catálogo, via mapa lower(label)→id. */
export function codesToNormIds(
  codes: string[],
  labelToId: Map<string, number>,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const code of codes) {
    const label = KPI_CODE_TO_LABEL[code];
    if (!label) continue;
    const id = labelToId.get(label.toLowerCase());
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Insere os defaults na org (idempotente). Usado no register e na migração. */
export async function ensureDefaultNorms(orgId: number): Promise<void> {
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
}
