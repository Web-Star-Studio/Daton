import type { ActionPlanType } from "@/lib/action-plans-client";

/**
 * Origens que o usuário escolhe quando a ação nasce dentro do próprio módulo
 * (o diálogo aberto pelo hub, sem origem imposta por outra tela). A origem
 * legada `manual` fica de fora: ainda é lida e rotulada, mas nunca mais gravada.
 */
export const MANUAL_ORIGIN_OPTIONS = ["improvement", "corrective", "norm_requirement"] as const;

export type ManualOriginModule = (typeof MANUAL_ORIGIN_OPTIONS)[number];

export const DEFAULT_MANUAL_ORIGIN: ManualOriginModule = "improvement";

/**
 * Tipo da ação que cada origem sugere. Só uma sugestão — o campo "Tipo" segue
 * editável — mas evita perguntar duas vezes quase a mesma coisa e acerta o
 * prefixo do código gerado (AM- para melhoria, AC- para corretiva).
 */
export function actionTypeForManualOrigin(origin: ManualOriginModule): ActionPlanType {
  return origin === "improvement" ? "improvement" : "corrective";
}
