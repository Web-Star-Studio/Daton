import {
  useListEffectivenessMethods,
  getListEffectivenessMethodsQueryKey,
  type EffectivenessMethod,
} from "@workspace/api-client-react";

/** Catálogo completo (ativos + inativos), para a ficha e para a tela de gestão. */
export function useAllEffectivenessMethods(orgId: number) {
  return useListEffectivenessMethods(orgId, {
    query: {
      enabled: !!orgId,
      queryKey: getListEffectivenessMethodsQueryKey(orgId),
    },
  });
}

/**
 * Opções do seletor: os métodos ativos MAIS o que este plano já referencia,
 * mesmo desativado. Sem essa união, desativar um método faria a seleção do
 * plano sumir da tela sem que ninguém tenha mexido no plano.
 */
export function pickerMethodOptions(
  methods: EffectivenessMethod[],
  selectedId: number | null,
): EffectivenessMethod[] {
  return methods.filter((m) => m.active || m.id === selectedId);
}
