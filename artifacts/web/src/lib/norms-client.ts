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
