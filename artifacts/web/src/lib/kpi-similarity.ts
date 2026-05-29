/**
 * Similaridade de indicadores (nome + forma da fórmula) — usada SÓ para
 * ORDENAR candidatos a filhos na criação de um Corporativo (os prováveis
 * irmãos sobem pro topo). Heurística pura, sem IA, sem backend.
 *
 * Portado de `services/kpi/rollup-clustering.ts` (lado servidor) para rodar
 * no cliente e dar ordenação instantânea conforme o usuário seleciona.
 */

type FormulaVar = { key: string };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Forma normalizada da fórmula: cada variável vira `__VARn__` pela ordem de
 * primeira aparição. Insensível ao nome das variáveis, sensível à ordem.
 */
export function normalizeFormulaShape(
  expression: string | null | undefined,
  variables: FormulaVar[] | null | undefined,
): string {
  if (!expression || expression.trim() === "") return "";
  const vars = variables ?? [];
  const occurrences: Array<{ key: string; index: number }> = [];
  for (const v of vars) {
    const re = new RegExp(`\\b${escapeRegex(v.key)}\\b`);
    const m = re.exec(expression);
    if (m) occurrences.push({ key: v.key, index: m.index });
  }
  occurrences.sort((a, b) => a.index - b.index);
  let shape = expression;
  occurrences.forEach((o, i) => {
    const re = new RegExp(`\\b${escapeRegex(o.key)}\\b`, "g");
    shape = shape.replace(re, ` VAR${i + 1} `);
  });
  shape = shape.replace(/ VAR(\d+) /g, "__VAR$1__");
  return shape.replace(/\s+/g, " ").trim();
}

const PT_STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "e", "no", "na", "em", "por", "para",
  "com", "ao", "à", "as", "os", "a", "o", "um", "uma", "p/", "p", "n",
  "n°", "no.", "media", "média", "total", "geral",
]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeNameForMatch(name: string, branchTokens: Set<string>): string {
  const cleaned = stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned
    .split(" ")
    .filter((t) => t && !PT_STOPWORDS.has(t) && !branchTokens.has(t))
    .join(" ");
}

function trigrams(s: string): Set<string> {
  if (!s) return new Set();
  const padded = `  ${s}  `;
  const set = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) set.add(padded.slice(i, i + 3));
  return set;
}

function wordTokens(s: string): Set<string> {
  return new Set(s.split(" ").filter((t) => t.length >= 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Similaridade de nome (melhor entre trigram e token Jaccard). 0..1. */
export function nameSimilarity(
  nameA: string,
  nameB: string,
  branchTokens: Set<string>,
): number {
  const a = normalizeNameForMatch(nameA, branchTokens);
  const b = normalizeNameForMatch(nameB, branchTokens);
  return Math.max(jaccard(trigrams(a), trigrams(b)), jaccard(wordTokens(a), wordTokens(b)));
}

/**
 * Coleta tokens de nomes de filiais a partir dos valores de `unit` do
 * catálogo (ignora "Corporativo" e nulos) — pra removê-los antes de comparar
 * nomes (senão "Avaria - Piracicaba" e "Avaria - Anápolis" parecem diferentes).
 */
export function collectBranchTokens(units: Array<string | null | undefined>): Set<string> {
  const tokens = new Set<string>();
  for (const u of units) {
    if (!u) continue;
    if (u.trim().toLowerCase() === "corporativo") continue;
    const cleaned = stripAccents(u).toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
    for (const t of cleaned.split(/\s+/)) if (t && t.length >= 2) tokens.add(t);
  }
  return tokens;
}

export type RankableIndicator = {
  name: string;
  unit?: string | null;
  formulaExpression?: string | null;
  formulaVariables?: FormulaVar[] | null;
};

/**
 * Pontua um candidato em relação a um conjunto de já-selecionados: melhor
 * similaridade de nome + bônus quando a forma da fórmula é idêntica. Quando
 * nada está selecionado, cai pra similaridade com a busca digitada.
 */
export function scoreCandidate(
  candidate: RankableIndicator,
  selected: RankableIndicator[],
  query: string,
  branchTokens: Set<string>,
): number {
  const candShape = normalizeFormulaShape(candidate.formulaExpression, candidate.formulaVariables);
  if (selected.length > 0) {
    let best = 0;
    for (const sel of selected) {
      const nameSim = nameSimilarity(candidate.name, sel.name, branchTokens);
      const selShape = normalizeFormulaShape(sel.formulaExpression, sel.formulaVariables);
      const shapeBonus = candShape && selShape && candShape === selShape ? 0.35 : 0;
      best = Math.max(best, nameSim + shapeBonus);
    }
    return best;
  }
  if (query.trim()) {
    return nameSimilarity(candidate.name, query, branchTokens);
  }
  return 0;
}
