import type { PendenciaProvider } from "./types";
import { kpiPendenciaProvider } from "./providers/kpi";
import { actionPlanPendenciaProvider } from "./providers/action-plans";
import { nonconformityPendenciaProvider } from "./providers/nonconformities";
import { regulatoryDocumentPendenciaProvider } from "./providers/regulatory-documents";
import { trainingEffectivenessPendenciaProvider } from "./providers/training-effectiveness";

/**
 * Ponto único de extensão: um módulo novo com "responsável + prazo" entra aqui
 * como mais um provider e passa a aparecer no painel, contadores e calendário.
 */
export const pendenciaProviders: PendenciaProvider[] = [
  kpiPendenciaProvider,
  actionPlanPendenciaProvider,
  nonconformityPendenciaProvider,
  regulatoryDocumentPendenciaProvider,
  trainingEffectivenessPendenciaProvider,
];
