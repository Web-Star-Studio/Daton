export type CatalogMeta = { normLabels: string[]; isCritical: boolean };

type CatalogItemLike = {
  id: number;
  normIds?: number[] | null;
  isCritical?: boolean | null;
};

/** Mapa catalogItemId → { normLabels, isCritical }, resolvendo os rótulos de
 *  norma pelos ids. normId sem rótulo conhecido é descartado. */
export function buildCatalogMeta(
  catalog: CatalogItemLike[],
  normLabelById: Map<number, string>,
): Map<number, CatalogMeta> {
  const out = new Map<number, CatalogMeta>();
  for (const item of catalog) {
    const normLabels = (item.normIds ?? [])
      .map((id) => normLabelById.get(id))
      .filter((l): l is string => !!l);
    out.set(item.id, { normLabels, isCritical: !!item.isCritical });
  }
  return out;
}
