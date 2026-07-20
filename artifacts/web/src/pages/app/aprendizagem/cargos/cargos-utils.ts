// Utilitários puros da tela "Cargos e competências" — separados do render para
// serem testáveis sem DOM.

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove diacríticos (mesmo padrão do slugify de document-pdf.ts)
}

/** Áreas distintas não vazias presentes nos cargos, ordenadas (pt-BR). */
export function deriveAreas(positions: { area?: string | null }[]): string[] {
  const set = new Set<string>();
  for (const p of positions) {
    const a = p.area?.trim();
    if (a) set.add(a);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
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
  formacao: "Formação",
  experiencia: "Experiência",
  habilidade: "Habilidade",
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
