/** Transform v1 branch status to v2 unit status */
export function transformUnitStatus(v1Status: string | null): string {
  if (!v1Status) return "ativa";
  const lower = v1Status.toLowerCase();
  if (lower === "ativo" || lower === "ativa") return "ativa";
  if (lower === "inativo" || lower === "inativa") return "inativa";
  return "ativa";
}

/** Transform v1 is_headquarters to v2 unit type */
export function transformUnitType(isHeadquarters: boolean | null): string {
  return isHeadquarters ? "sede" : "filial";
}

/** Transform v1 employee status to v2 */
export function transformEmployeeStatus(v1Status: string | null): string {
  if (!v1Status) return "active";
  const lower = v1Status.toLowerCase();
  if (lower === "ativo" || lower === "active") return "active";
  if (lower === "inativo" || lower === "inactive") return "inactive";
  return "active";
}

/** Transform v1 employment_type to v2 contractType (lowercase) */
export function transformContractType(v1Type: string | null): string {
  if (!v1Type) return "clt";
  return v1Type.toLowerCase();
}

/** Transform v1 required_experience_years (number) to v2 experience (string) */
export function transformExperience(years: number | null): string | null {
  if (years === null || years === undefined) return null;
  if (years === 0) return "Sem experiência necessária";
  if (years === 1) return "1 ano";
  return `${years} anos`;
}

/** Transform v1 array field to v2 newline-joined text */
export function arrayToText(arr: string[] | null): string | null {
  if (!arr || arr.length === 0) return null;
  return arr.join("\n");
}

/**
 * Transform v1 competency_category to v2 type.
 *
 * O v2 só reconhece três valores — o CHA real (`conhecimento`, `habilidade`,
 * `atitude`) do enum do contrato (`lib/api-spec/openapi.yaml`). `formacao` e
 * `experiencia` foram removidos do enum. Esta função alimenta
 * `employee_competencies` (via `migrate-employee-competencies.ts`), tabela que
 * — diferente de `position_competency_requirements`, cuja migração já rodou
 * limpa em produção — ainda carrega linhas legadas exatamente nesses dois
 * valores banidos. Sem o ramo de "atitude" abaixo esta função nunca
 * conseguia produzir esse valor, e o fallback devolvia "formacao": a próxima
 * carga de cliente reintroduziria em silêncio o valor que esta entrega existe
 * para eliminar. Qualquer valor devolvido aqui PRECISA existir no enum do
 * contrato.
 */
export function transformCompetencyType(category: string | null): string {
  if (!category) return "conhecimento";
  const lower = category.toLowerCase();
  if (lower.includes("habilidade") || lower.includes("skill")) return "habilidade";
  if (lower.includes("conhecimento") || lower.includes("knowledge")) return "conhecimento";
  if (lower.includes("atitude") || lower.includes("attitude")) return "atitude";
  // "formação"/"experiência" (removidos do enum) e qualquer categoria
  // desconhecida caem aqui. "conhecimento" é o padrão mais defensável: no v1
  // essas categorias descreviam majoritariamente cursos e certificações
  // formais — aquisição de conhecimento — e é o mesmo valor que já era usado
  // como fallback de "conhecimento"/"knowledge" acima.
  return "conhecimento";
}

/**
 * Transform v1 training status to v2.
 *
 * O v2 só reconhece 4 status de treinamento — `pendente`, `concluido`,
 * `vencido` e `nao_aplicavel` (o enum do OpenAPI e os mapas de rótulo do
 * front). Esta função já emitiu três valores fora dessa lista
 * (`em_andamento`, `cancelado`, `expirado`), e o `em_andamento` chegou a
 * entrar em produção: nenhuma tela sabia rotulá-lo e ele não era contado como
 * pendência nem como concluído, ficando invisível para o RH. Qualquer valor
 * devolvido aqui PRECISA existir no enum do contrato.
 */
export function transformTrainingStatus(v1Status: string | null): string {
  if (!v1Status) return "pendente";
  const lower = v1Status.toLowerCase();
  if (lower === "concluído" || lower === "concluido" || lower === "completed") return "concluido";
  // "expirado" era devolvido cru — o v2 chama esse estado de "vencido".
  if (lower === "expirado" || lower === "expired") return "vencido";
  // Em andamento e cancelado não têm equivalente no v2: em ambos os casos o
  // treinamento não foi concluído, então continua como pendência (é o que o RH
  // precisa enxergar). Marcar como "não aplicável" exigiria um motivo por
  // registro, que a migração não tem como preencher.
  if (lower === "em andamento" || lower === "in_progress") return "pendente";
  if (lower === "cancelado" || lower === "cancelled") return "pendente";
  return "pendente";
}

/** Build v1 migration metadata for onboardingData */
export function buildV1MigrationData(company: {
  sector?: string | null;
  legal_structure?: string | null;
  governance_model?: string | null;
  headquarters_address?: string | null;
}): Record<string, unknown> | null {
  const data: Record<string, unknown> = {};
  if (company.sector) data.sector = company.sector;
  if (company.legal_structure) data.legal_structure = company.legal_structure;
  if (company.governance_model) data.governance_model = company.governance_model;
  if (company.headquarters_address) data.headquarters_address = company.headquarters_address;
  return Object.keys(data).length > 0 ? data : null;
}

/** Safely format a date string or null */
export function formatDate(date: string | Date | null): string | null {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString().split("T")[0];
  return date;
}
