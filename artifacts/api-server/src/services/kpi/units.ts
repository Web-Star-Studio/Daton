/**
 * String canônica para indicadores KPI que representam um rollup corporativo
 * (compilado de todas as filiais). Mantida em sync com o frontend em
 * `artifacts/web/src/lib/kpi-constants.ts` — esses dois valores DEVEM bater.
 *
 * Não há FK pra `units` table porque `kpi_indicators.unit` é varchar livre
 * (suporta nomes de filiais arbitrários vindos de imports Excel).
 */
export const CORPORATE_UNIT_LABEL = "Corporativo";

/**
 * Normaliza um nome de unidade antes de gravar.
 *
 * - `trim()` remove espaços acidentais (Excel comum)
 * - case-insensitive match para "Corporativo" canônico → coerção
 * - mantém demais valores como vieram (são livres por design)
 *
 * Usado em todos os pontos de escrita (POST, PATCH, import). Evita
 * duplicação invisível tipo `"corporativo"` vs `"Corporativo"` no banco.
 */
export function normalizeKpiUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === CORPORATE_UNIT_LABEL.toLowerCase()) {
    return CORPORATE_UNIT_LABEL;
  }
  return trimmed;
}
