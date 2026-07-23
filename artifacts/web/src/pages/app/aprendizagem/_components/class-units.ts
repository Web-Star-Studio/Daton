import type { TrainingClassUnit } from "@workspace/api-client-react";

/** O que basta saber de uma turma para exibir as filiais dela. */
type ClassUnitsSource = {
  units?: TrainingClassUnit[] | undefined;
  unitId?: number | null | undefined;
};

/**
 * Nomes das filiais de uma turma, na ordem em que vieram.
 *
 * Cai para o `unitId` legado quando `units` está vazio: um payload gravado
 * antes da migração (ou já em cache do React Query no momento do deploy) tem só
 * o campo antigo, e sem esse fallback a filial simplesmente sumiria da tela.
 */
export function classUnitNames(
  cls: ClassUnitsSource,
  unitNameById: Map<number, string>,
): string[] {
  const list = cls.units ?? [];
  if (list.length === 0) {
    if (cls.unitId == null) return [];
    return [unitNameById.get(cls.unitId) ?? `#${cls.unitId}`];
  }
  return list.map(
    (u) => u.unitName ?? unitNameById.get(u.unitId) ?? `#${u.unitId}`,
  );
}

/**
 * Rótulo da coluna "Filial" de uma turma, que passou a abranger N filiais.
 * O tamanho do mapa de filiais é o total da organização — é o que permite dizer
 * "Todas as filiais" em vez de despejar 24 nomes numa célula.
 */
export function formatClassUnitsLabel(
  cls: ClassUnitsSource,
  unitNameById: Map<number, string>,
): { text: string; title: string | undefined } {
  const names = classUnitNames(cls, unitNameById);
  if (names.length === 0) return { text: "—", title: undefined };

  const title = names.join(", ");
  if (names.length === 1) return { text: names[0], title: names[0] };

  const totalUnits = unitNameById.size;
  if (totalUnits > 0 && names.length >= totalUnits) {
    return { text: `Todas as filiais (${names.length})`, title };
  }
  return { text: `${names.length} filiais`, title };
}
