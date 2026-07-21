import {
  useListAreas,
  getListAreasQueryKey,
  type Area,
} from "@workspace/api-client-react";

/**
 * Lookup id → label do catálogo de áreas (setores) de cargo da organização.
 * Inclui inativas de propósito: uma área pode ser desativada depois de já ter
 * sido referenciada por um cargo, e essas referências ainda precisam renderizar
 * o rótulo em vez de cair para "—".
 */
export function buildAreaLabelMap(areas: Area[]): Map<number, string> {
  return new Map(areas.map((a) => [a.id, a.label]));
}

/** Catálogo completo (ativas + inativas), para a tela de gestão e para resolver rótulos. */
export function useAllAreas(orgId: number) {
  return useListAreas(orgId, {
    query: { enabled: !!orgId, queryKey: getListAreasQueryKey(orgId) },
  });
}

/** Apenas as áreas ativas, para o seletor do formulário de cargo. */
export function useActiveAreas(orgId: number) {
  const q = useAllAreas(orgId);
  const data = (q.data ?? []).filter((a) => a.active);
  return { ...q, data };
}
