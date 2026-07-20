export type CatalogMeta = { normLabels: string[] };

type CatalogItemLike = {
  id: number;
  normIds?: number[] | null;
};

/** Mapa catalogItemId → { normLabels }, resolvendo os rótulos de norma pelos
 *  ids. normId sem rótulo conhecido é descartado.
 *
 *  Nota: criticidade NÃO vem do catálogo — `training_catalog` não tem
 *  `isCritical`. Essa flag vive em `training_requirements` (obrigatoriedade)
 *  e deve ser resolvida via `OrganizationTraining.requirementId`, não por
 *  aqui (ver `requirementCriticalById` em `PorColaboradorTable`). */
export function buildCatalogMeta(
  catalog: CatalogItemLike[],
  normLabelById: Map<number, string>,
): Map<number, CatalogMeta> {
  const out = new Map<number, CatalogMeta>();
  for (const item of catalog) {
    const normLabels = (item.normIds ?? [])
      .map((id) => normLabelById.get(id))
      .filter((l): l is string => !!l);
    out.set(item.id, { normLabels });
  }
  return out;
}
