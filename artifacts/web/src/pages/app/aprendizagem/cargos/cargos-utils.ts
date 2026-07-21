// Utilitários puros da tela "Cargos e competências" — separados do render para
// serem testáveis sem DOM.

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove diacríticos (mesmo padrão do slugify de document-pdf.ts)
}

/**
 * Valores distintos não vazios de um campo-texto dos cargos, ordenados (pt-BR).
 * Usado para "puxar" as taxonomias já digitadas (área/nível/escolaridade) e
 * oferecê-las de volta como sugestões — sem catálogo dedicado.
 */
export function deriveDistinct<K extends string>(
  rows: Array<Partial<Record<K, string | null | undefined>>>,
  key: K,
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key]?.trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Áreas distintas não vazias presentes nos cargos, ordenadas (pt-BR). */
export function deriveAreas(positions: { area?: string | null }[]): string[] {
  return deriveDistinct(positions, "area");
}

/** Filtra por nome (caixa/acento-insensível) e área (`""` = todas). */
export function filterPositions<T extends { name: string; area?: string | null }>(
  positions: T[],
  search: string,
  area: string,
): T[] {
  const q = norm(search.trim());
  return positions.filter((p) => {
    const matchesSearch = !q || norm(p.name).includes(q);
    const matchesArea = !area || (p.area ?? "") === area;
    return matchesSearch && matchesArea;
  });
}

/** Subtítulo do painel: "Área · N competências · ISO ⟨norma⟩", omitindo partes ausentes. */
export function buildPositionSubline(input: {
  area?: string | null;
  competencyCount?: number;
  normLabel?: string | null;
}): string {
  const parts: string[] = [];
  if (input.area?.trim()) parts.push(input.area.trim());
  if (input.competencyCount != null) {
    parts.push(
      `${input.competencyCount} ${input.competencyCount === 1 ? "competência" : "competências"}`,
    );
  }
  if (input.normLabel?.trim()) parts.push(input.normLabel.trim());
  return parts.join(" · ");
}

// --- Competências (matriz do cargo) ---

export const COMPETENCY_TYPE_LABELS: Record<string, string> = {
  conhecimento: "Conhecimento",
  habilidade: "Habilidade",
  atitude: "Atitude",
};

/** Nível requerido (0–5) → rótulo (Básico/Intermediário/Avançado). */
export function levelLabel(level: number): string {
  if (level >= 4) return "Avançado";
  if (level >= 3) return "Intermediário";
  if (level >= 1) return "Básico";
  return "—";
}

export function levelBadgeClass(level: number): string {
  if (level >= 4) return "bg-red-50 text-red-700 border-red-200";
  if (level >= 3) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

/** Nível requerido alto (≥ 4) marca a competência como crítica. */
export function isCritical(level: number): boolean {
  return level >= 4;
}

/** Aproxima um nível arbitrário para o bucket do seletor de 3 níveis (1/3/5). */
export function levelBucket(level: number): number {
  if (level >= 4) return 5;
  if (level >= 3) return 3;
  return 1;
}

export type CompetencyBankLookupItem = {
  name: string;
  competencyType?: string | null;
};

/**
 * Rede de segurança: tipo CHA usado quando nem o catálogo nem `chosenType`
 * trazem um tipo válido. O contrato (`competencyType`) é um enum obrigatório
 * no vínculo — nunca pode sair "" daqui, ou o POST volta 400. Mesmo default do
 * fluxo "criar na hora" (CHA_TYPE_OPTIONS[0] em VincularCompetenciaForm.tsx).
 */
const FALLBACK_COMPETENCY_TYPE = "conhecimento";

/**
 * Acha um item do catálogo por nome (caixa/espaços-nas-pontas insensível).
 * Nome vazio (após trim) nunca casa — mesmo que algum item tenha nome vazio.
 */
export function findBankItemByName<T extends CompetencyBankLookupItem>(
  items: T[],
  name: string,
): T | undefined {
  const target = name.trim().toLowerCase();
  if (!target) return undefined;
  return items.find((i) => i.name.trim().toLowerCase() === target);
}

/**
 * Decide qual `competencyType` gravar ao vincular uma competência a um cargo.
 * O tipo é propriedade da COMPETÊNCIA (catálogo), não do vínculo: para uma
 * competência já existente, usa o tipo dela no catálogo — não o que porventura
 * esteja em `chosenType` (que só é editável no fluxo "criar na hora"). Se a
 * competência não existe no catálogo, ou existe mas sem tipo definido, usa
 * `chosenType`.
 *
 * Nunca devolve "": uma competência legada (ou criada por outro caminho) pode
 * chegar ao catálogo sem tipo definido; se `chosenType` também vier vazio,
 * cai no `FALLBACK_COMPETENCY_TYPE` para não estourar 400 no POST do vínculo.
 */
export function resolveLinkedCompetencyType(
  bankItems: CompetencyBankLookupItem[],
  name: string,
  chosenType: string,
): string {
  const existing = findBankItemByName(bankItems, name);
  return existing?.competencyType || chosenType || FALLBACK_COMPETENCY_TYPE;
}
