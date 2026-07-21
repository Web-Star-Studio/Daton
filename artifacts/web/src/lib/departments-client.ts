import {
  useListDepartments,
  getListDepartmentsQueryKey,
  type Department,
} from "@workspace/api-client-react";

/** Lookup id → nome dos departamentos da organização (para resolver o rótulo do cargo). */
export function buildDepartmentLabelMap(
  departments: Department[],
): Map<number, string> {
  return new Map(departments.map((d) => [d.id, d.name]));
}

/** Departamentos da organização (para o seletor de cargo e a resolução do rótulo). */
export function useAllDepartments(orgId: number) {
  return useListDepartments(orgId, {
    query: { enabled: !!orgId, queryKey: getListDepartmentsQueryKey(orgId) },
  });
}
