/**
 * Detecta e migra renames de variável de fórmula entre dois estados de
 * `formulaVariables` de um indicador KPI.
 *
 * Motivação: `parseNaturalFormula` no frontend gera o `key` de cada variável
 * a partir do `label` digitado (slug). Quando a Ana edita o texto da fórmula
 * — mesmo só pra ajustar a redação do label — o slug pode mudar e os
 * `inputs` JSON gravados em `kpi_monthly_values` ficam com chaves órfãs.
 *
 * Sem detecção de rename + migração, o `evaluateFormula(novaExpressão,
 * inputs)` retorna null e a rota PATCH apagaria o valor histórico. Com a
 * detecção, os `inputs` são migrados pra chave nova e o recompute fecha o
 * ciclo automaticamente.
 *
 * Política conservadora: só auto-migra quando o pareamento é inequívoco
 * (mesmo número de chaves removidas/adicionadas E posições batem). Em
 * qualquer ambiguidade, devolve [] e deixa o guard de NULL (na rota
 * PATCH) preservar o valor visível.
 */
export type FormulaVar = { key: string; label: string };

export type RenamePair = { from: string; to: string };

/**
 * Identifica pares (chaveAntiga → chaveNova) representando renames
 * inequívocos entre `oldVars` e `newVars`.
 *
 * Algoritmo:
 *  1. removed = oldKeys \ newKeys; added = newKeys \ oldKeys.
 *  2. Se removed e added são vazios → nenhum rename.
 *  3. Se |removed| != |added| → ambíguo (houve adição/remoção real), devolve [].
 *  4. Pareamento posicional: pra cada i tal que oldVars[i].key ∈ removed e
 *     newVars[i].key ∈ added, adiciona o par.
 *  5. Se os pares cobrem EXATAMENTE `removed` e `added` → devolve a lista.
 *     Caso contrário → ambíguo, devolve [].
 */
export function detectVariableRenames(
  oldVars: FormulaVar[],
  newVars: FormulaVar[],
): RenamePair[] {
  const oldKeys = new Set(oldVars.map((v) => v.key));
  const newKeys = new Set(newVars.map((v) => v.key));
  const removed = new Set([...oldKeys].filter((k) => !newKeys.has(k)));
  const added = new Set([...newKeys].filter((k) => !oldKeys.has(k)));

  if (removed.size === 0 && added.size === 0) return [];
  if (removed.size !== added.size) return [];

  const renames: RenamePair[] = [];
  const maxLen = Math.max(oldVars.length, newVars.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldVars[i];
    const n = newVars[i];
    if (o && n && o.key !== n.key && removed.has(o.key) && added.has(n.key)) {
      renames.push({ from: o.key, to: n.key });
    }
  }

  // Sanidade: o pareamento posicional cobriu todas as chaves removidas/adicionadas.
  // Caso contrário, há reordenação + rename misturados — ambíguo demais pra automigrar.
  const coveredFrom = new Set(renames.map((r) => r.from));
  const coveredTo = new Set(renames.map((r) => r.to));
  if (
    coveredFrom.size !== removed.size ||
    coveredTo.size !== added.size ||
    [...removed].some((k) => !coveredFrom.has(k)) ||
    [...added].some((k) => !coveredTo.has(k))
  ) {
    return [];
  }

  return renames;
}

/**
 * Aplica renames de variável a um único `inputs` JSON.
 *
 * Pra cada par `from → to`:
 *  - se `from` existe e `to` não existe → renomeia (preserva o valor);
 *  - se `to` já existe → pula esse par específico (proteção contra
 *    sobrescrever outro dado por colisão acidental).
 *
 * `changed` é true se pelo menos um rename foi aplicado.
 */
export function migrateInputsForRename(
  inputs: Record<string, number | null>,
  renames: RenamePair[],
): { migrated: Record<string, number | null>; changed: boolean } {
  if (renames.length === 0) return { migrated: inputs, changed: false };
  const migrated: Record<string, number | null> = { ...inputs };
  let changed = false;
  for (const { from, to } of renames) {
    if (from in migrated && !(to in migrated)) {
      migrated[to] = migrated[from];
      delete migrated[from];
      changed = true;
    }
  }
  return { migrated, changed };
}
