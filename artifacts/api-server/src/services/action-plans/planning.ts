import type { ActionPlanAnalysis } from "@workspace/db";
import { normalizeAnalyses } from "./analyses";

/**
 * O bloco de análise de causa, versionado como UM campo lógico.
 *
 * O activity log guarda diffs por campo e o único snapshot que ele mantém é o da
 * criação (code/title/sourceModule/status). Reproduzir diffs, portanto, não recompõe
 * "o bloco às 12:34" — uma entrada que só tocou a causa raiz nada diz sobre as
 * tratativas naquele instante. Guardar o bloco inteiro em `from`/`to` faz de todo `to`
 * uma versão completa, e restaurar vira simplesmente aplicá-lo.
 *
 * As AÇÕES do plano ficam de fora deste bloco de propósito: elas têm status e data de
 * conclusão reais, e restaurar um snapshot delas apagaria trabalho executado. Elas têm
 * trilha própria no activity log (`action_added` / `action_updated` / `action_removed`).
 */
export interface PlanningBlock {
  rootCause: string | null;
  analyses: ActionPlanAnalysis[] | null;
}

interface PlanningSource {
  rootCause?: string | null;
  analyses?: ActionPlanAnalysis[] | null;
}

export function extractPlanning(row: PlanningSource): PlanningBlock {
  return {
    rootCause: row.rootCause ?? null,
    analyses: row.analyses ?? null,
  };
}

/** `null`, `""` e `[]` todos querem dizer "vazio" — colapsa-os, para que um autosave que
 *  apenas roda um bloco vazio de ida e volta nunca vire uma versão no histórico. */
export function normalizePlanning(block: PlanningSource): PlanningBlock {
  const rootCause = block.rootCause?.trim() || null;
  const analyses = normalizeAnalyses(block.analyses ?? []);
  return { rootCause, analyses: analyses.length ? analyses : null };
}

/** Igualdade profunda com as chaves de objeto ordenadas, para que `{what, why}` seja igual
 *  a `{why, what}`. Arrays continuam sensíveis à ordem: os 5 porquês são uma cadeia, não um
 *  conjunto — e a ordem das tratativas é a ordem em que o usuário as adicionou. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonical(source[key])]),
    );
  }
  return value ?? null;
}

export function planningChanged(
  before: PlanningSource,
  after: PlanningSource,
): boolean {
  return (
    JSON.stringify(canonical(normalizePlanning(before))) !==
    JSON.stringify(canonical(normalizePlanning(after)))
  );
}
