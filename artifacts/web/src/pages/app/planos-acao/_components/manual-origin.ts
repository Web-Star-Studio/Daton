import type { ActionPlanSourceModule, ActionPlanType } from "@/lib/action-plans-client";

/**
 * Origens que o usuário escolhe quando a ação nasce dentro do próprio módulo
 * (o diálogo aberto pelo hub, sem origem imposta por outra tela). A origem
 * legada `manual` fica de fora: ainda é lida e rotulada, mas nunca mais gravada.
 * `satisfies readonly ActionPlanSourceModule[]` amarra a lista ao enum: se um
 * valor for removido/renomeado no schema, o TS acusa aqui.
 */
export const MANUAL_ORIGIN_OPTIONS = [
  "improvement",
  "corrective",
  "norm_requirement",
] as const satisfies readonly ActionPlanSourceModule[];

export type ManualOriginModule = (typeof MANUAL_ORIGIN_OPTIONS)[number];

export const DEFAULT_MANUAL_ORIGIN: ManualOriginModule = "improvement";

/**
 * Tipo da ação que cada origem sugere. Só uma sugestão — o campo "Tipo" segue
 * editável — mas evita perguntar duas vezes quase a mesma coisa e acerta o
 * prefixo do código gerado (AM- para melhoria, AC- para corretiva).
 * `switch` exaustivo: uma 4ª origem futura precisa ganhar um `case` explícito
 * aqui, em vez de cair silenciosamente em "corrective" por um ternário solto.
 */
export function actionTypeForManualOrigin(origin: ManualOriginModule): ActionPlanType {
  switch (origin) {
    case "improvement":
      return "improvement";
    case "corrective":
    case "norm_requirement":
      return "corrective";
    default: {
      const _exhaustive: never = origin;
      return _exhaustive;
    }
  }
}
