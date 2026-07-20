import {
  useListNorms,
  getListNormsQueryKey,
  type RegulatoryNorm,
} from "@workspace/api-client-react";

/**
 * Pure id → label lookup for the organization's regulatory norm catalog.
 * Includes inactive norms on purpose: a norm can be deactivated after it was
 * already referenced by a KPI or a training requirement, and those references
 * still need to render their label instead of falling back to a blank/"—".
 */
export function buildNormLabelMap(
  norms: RegulatoryNorm[],
): Map<number, string> {
  return new Map(norms.map((n) => [n.id, n.label]));
}

/**
 * Forma curta de um rótulo de norma, para caber em espaços apertados (o badge
 * do card do catálogo). O rótulo é texto livre por organização, e a convenção
 * usada é "código · descrição" ("NR-11 · Transporte e Movimentação de
 * Materiais") — nesses casos só o código identifica a norma, e a descrição
 * estourava o cabeçalho do card, espremendo o título.
 *
 * Sem separador (ex.: "ISO 9001") devolve o rótulo inteiro: quem chama ainda
 * precisa truncar no CSS, já que um rótulo longo sem separador continua longo.
 * O rótulo completo fica no `title` do badge e na ficha.
 */
export function shortNormLabel(label: string): string {
  const head = label.split(/\s+[·•—–|]\s+/)[0]?.trim();
  return head || label.trim();
}

/** The organization's full norm catalog (active + inactive), for management screens. */
export function useAllNorms(orgId: number) {
  return useListNorms(orgId, {
    query: { enabled: !!orgId, queryKey: getListNormsQueryKey(orgId) },
  });
}

/** Only the active norms, for pickers (KPI, obrigatoriedade) that shouldn't offer retired entries. */
export function useActiveNorms(orgId: number) {
  const q = useAllNorms(orgId);
  const data = (q.data ?? []).filter((n) => n.active);
  return { ...q, data };
}
