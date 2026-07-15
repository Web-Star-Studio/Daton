import { db, actionPlanAnalysisMethodsTable, type ActionPlanAnalysisMethodKey } from "@workspace/db";

/**
 * As 8 tratativas que o produto conhece. A ESTRUTURA de cada uma vive no código, por isso
 * o catálogo é semeado (não há POST): a empresa liga, desliga, renomeia e reordena.
 *
 * Só `five_whys` nasce como padrão — é exatamente o comportamento de hoje, então nenhuma
 * organização existente vê seu fluxo mudar. As demais a empresa adota quando quiser.
 */
export const DEFAULT_ANALYSIS_METHODS: ReadonlyArray<{
  key: ActionPlanAnalysisMethodKey;
  label: string;
  isDefault: boolean;
}> = [
  { key: "five_whys", label: "5 Porquês", isDefault: true },
  { key: "ishikawa", label: "Ishikawa + 5 Porquês", isDefault: false },
  { key: "a3", label: "A3", isDefault: false },
  { key: "fmea", label: "FMEA", isDefault: false },
  { key: "fault_tree", label: "Árvore de Falhas", isDefault: false },
  { key: "kepner_tregoe", label: "Kepner-Tregoe", isDefault: false },
  { key: "rca_apollo", label: "RCA Apollo", isDefault: false },
  { key: "barrier_analysis", label: "Análise de Barreiras", isDefault: false },
];

/**
 * Garante que a organização tem as 8 linhas. Idempotente por `(organizationId, key)`, e é
 * isso que faz um método NOVO lançado no futuro entrar nas orgs existentes só rodando isto
 * de novo — sem tocar no que a empresa já configurou (label/active/isDefault preservados).
 */
export async function ensureAnalysisMethods(orgId: number): Promise<void> {
  for (let i = 0; i < DEFAULT_ANALYSIS_METHODS.length; i++) {
    const method = DEFAULT_ANALYSIS_METHODS[i];
    await db
      .insert(actionPlanAnalysisMethodsTable)
      .values({
        organizationId: orgId,
        key: method.key,
        label: method.label,
        isDefault: method.isDefault,
        sortOrder: i,
      })
      .onConflictDoNothing();
  }
}
