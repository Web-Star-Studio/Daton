import { db, effectivenessMethodsTable } from "@workspace/db";

/** Os 6 métodos que eram fixos em código, na mesma ordem em que apareciam na tela. */
export const DEFAULT_EFFECTIVENESS_METHOD_LABELS = [
  "Verificação por indicador",
  "Auditoria interna",
  "Inspeção física (campo)",
  "Verificação por treinamento",
  "Verificação por amostragem",
  "Redução de risco",
];

/**
 * Código do enum legado (`action_plan_effectiveness_method`) → rótulo da semente.
 * Usado só pelo backfill e pela exibição de planos ainda não migrados.
 */
export const LEGACY_METHOD_TO_LABEL: Record<string, string> = {
  indicator: "Verificação por indicador",
  internal_audit: "Auditoria interna",
  field_inspection: "Inspeção física (campo)",
  training: "Verificação por treinamento",
  sampling: "Verificação por amostragem",
  risk_reduction: "Redução de risco",
};

/** Insere as sementes na org (idempotente). Usado no register e na migração. */
export async function ensureDefaultEffectivenessMethods(
  orgId: number,
): Promise<void> {
  for (let i = 0; i < DEFAULT_EFFECTIVENESS_METHOD_LABELS.length; i++) {
    await db
      .insert(effectivenessMethodsTable)
      .values({
        organizationId: orgId,
        label: DEFAULT_EFFECTIVENESS_METHOD_LABELS[i],
        sortOrder: i,
      })
      .onConflictDoNothing();
  }
}
