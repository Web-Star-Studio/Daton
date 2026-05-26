/**
 * String canônica para indicadores KPI que são compilado/rollup de TODAS as
 * filiais (não é um CNPJ real, por isso não vive na tabela `units`).
 *
 * Centralizada aqui pra garantir match exato entre:
 * - Form de cadastro de indicador (dropdown "Unidade / filial")
 * - Dashboard (filtro + título)
 * - Tabela de indicadores (badge visual)
 * - Excel import normalization (server-side coerção pra capitalização canônica)
 *
 * Confirmado com a cliente (Ana Corrêa): "é um indicador que é o compilado de
 * todas as unidades juntas". Cada filial tem seu indicador próprio; o
 * Corporativo é o agregado.
 */
export const CORPORATE_UNIT_LABEL = "Corporativo";

/**
 * Normaliza um nome de unidade para a forma canônica. Aplica:
 * - `trim()` de espaços
 * - coerção case-insensitive para "Corporativo" canônico
 * - mantém demais valores como vieram (são livres por design — clientes
 *   importam filiais com nomes arbitrários)
 *
 * Use no client antes de salvar OU no server (já fazemos no route handler).
 */
export function normalizeUnitName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === CORPORATE_UNIT_LABEL.toLowerCase()) {
    return CORPORATE_UNIT_LABEL;
  }
  return trimmed;
}

/** Helper visual: este indicador é o rollup corporativo? */
export function isCorporateUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  return unit.trim().toLowerCase() === CORPORATE_UNIT_LABEL.toLowerCase();
}
