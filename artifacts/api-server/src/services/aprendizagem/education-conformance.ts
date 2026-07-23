/**
 * Porta server-side de `compareEducation`
 * (artifacts/web/src/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations.ts).
 * Não há pacote de regras de negócio compartilhado entre web e api-server
 * neste monorepo (mesma situação de `buildCompetencyKey`, duplicado em
 * competency-resolver.ts e routes/employees.ts) — por isso a tabela de
 * níveis é mantida aqui em paralelo. As duas cópias precisam ficar em
 * sincronia manualmente; os testes unitários dos dois lados usam os MESMOS
 * casos (incluindo o caso relatado pela cliente: cargo "Ensino Médio
 * Completo" x colaborador "Fundamental Incompleto") para pegar divergência.
 *
 * Único consumidor hoje: resolução de gap de escolaridade para o
 * self-healing de `employee_gap_deadlines` (gap-deadlines.ts) — decidir se
 * um prazo de regularização continua em aberto ou já foi atendido.
 */

export type EducationVeredito =
  | "atende"
  | "gap"
  | "nao_informado"
  | "sem_requisito";

const EDUCATION_LEVELS: string[][] = [
  ["fundamental incompleto"],
  ["fundamental completo", "ensino fundamental"],
  ["médio incompleto", "medio incompleto"],
  [
    "médio completo",
    "medio completo",
    "ensino médio completo",
    "ensino medio completo",
  ],
  ["técnico", "tecnico"],
  ["superior incompleto"],
  ["superior completo"],
  ["pós-graduação", "pos-graduacao", "pós graduação", "pos graduacao"],
  ["mestrado"],
  ["doutorado"],
];

function eduRank(value: string | null | undefined): number {
  if (!value) return -1;
  const normalized = value.trim().toLowerCase();
  return EDUCATION_LEVELS.findIndex((aliases) => aliases.includes(normalized));
}

export function compareEducation(
  possui: string | null | undefined,
  requerido: string | null | undefined,
): EducationVeredito {
  const rReq = eduRank(requerido);
  if (rReq < 0) return "sem_requisito";
  const rPos = eduRank(possui);
  if (!possui) return "nao_informado";
  if (rPos < 0) return "nao_informado";
  return rPos >= rReq ? "atende" : "gap";
}
