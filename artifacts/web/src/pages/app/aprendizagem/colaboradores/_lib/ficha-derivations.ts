import {
  CreateCompetencyBodyType as CreateCompetencyBodyTypeValues,
  type CreateCompetencyBodyType,
  type EmployeeCompetency,
} from "@workspace/api-client-react";

/**
 * Normaliza um `type` de competência para um valor CHA válido, com fallback
 * "conhecimento" — mesmo default usado em `transformCompetencyType()`
 * (migração) e no POST de competência (`routes/employees.ts`). Necessário ao
 * ABRIR o form de edição de uma competência do colaborador: há 7 linhas
 * legadas de `employee_competencies` em produção com `formacao`/`experiencia`
 * (enum estreitado para CHA, backfill pendente). Sem isso, o `<Select>` (só 3
 * opções CHA) ficaria sem valor correspondente e, ao salvar sem tocar no
 * campo, o PATCH reenviaria o valor legado — o contrato (enum CHA) rejeita
 * com 400. Reusa o enum gerado (`CreateCompetencyBodyType`) em vez de
 * duplicar a lista CHA como literal. A EXIBIÇÃO da lista (fora do form) não
 * passa por aqui — continua mostrando o rótulo original do valor legado.
 */
export function toChaCompetencyType(value: string): CreateCompetencyBodyType {
  return (Object.values(CreateCompetencyBodyTypeValues) as string[]).includes(
    value,
  )
    ? (value as CreateCompetencyBodyType)
    : CreateCompetencyBodyTypeValues.conhecimento;
}

/**
 * Filtra a lista de competências do colaborador para a seção manual "Outras
 * competências" (rodapé da ficha): mostra só o que NÃO é requisito do cargo
 * — requisitos de cargo agora entram via as linhas de "Competências do
 * cargo" (evidência ligada ao requisito), então repeti-los aqui duplicaria a
 * competência na tela. `isPositionRequirement` vem pronto do backend
 * (join por `nome::tipo` contra os requisitos vigentes do cargo).
 */
export function selectOtherCompetencies(
  competencies: EmployeeCompetency[],
): EmployeeCompetency[] {
  return competencies.filter((c) => !c.isPositionRequirement);
}

export function computeTrainingCounters(
  trainings: { status?: string | null; expirationDate?: string | null }[],
  today: string = new Date().toISOString().slice(0, 10),
): {
  total: number;
  feitos: number;
  pendentes: number;
  vencidos: number;
  naoAplicavel: number;
} {
  let feitos = 0;
  let pendentes = 0;
  let vencidos = 0;
  let naoAplicavel = 0;
  for (const t of trainings) {
    // "Não aplicável" sai de toda contagem de obrigação — inclusive do total.
    if (t.status === "nao_aplicavel") {
      naoAplicavel++;
      continue;
    }
    const expired = !!t.expirationDate && t.expirationDate < today;
    if (t.status === "vencido" || (t.status === "concluido" && expired)) {
      vencidos++;
    } else if (t.status === "concluido") {
      feitos++;
    } else if (t.status === "pendente") {
      pendentes++;
    }
  }
  return {
    total: trainings.length - naoAplicavel,
    feitos,
    pendentes,
    vencidos,
    naoAplicavel,
  };
}

export function computeTenure(
  admissionDate: string | null | undefined,
  today: Date = new Date(),
): string {
  if (!admissionDate) return "";
  // Data-only ("YYYY-MM-DD") ancorada na meia-noite LOCAL, para os getters
  // locais abaixo baterem com `today` (senão o parse UTC gera off-by-one de mês
  // em fusos negativos, ex.: BRT). slice(0,10) tolera um timestamp completo.
  const start = new Date(`${admissionDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "";
  let months =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) months--;
  if (months < 0) months = 0;
  const anos = Math.floor(months / 12);
  const meses = months % 12;
  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? "ano" : "anos"}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mês" : "meses"}`);
  return partes.join(" e ") || "menos de 1 mês";
}

export type EscolaridadeVeredito =
  | "atende"
  | "gap"
  | "nao_informado"
  | "sem_requisito";

// Ordem crescente dos níveis conhecidos. Valores fora daqui (ex.: "Não
// Aplicável") não têm ordem -> não geram veredito.
const EDUCATION_ORDER = [
  "fundamental incompleto",
  "fundamental completo",
  "médio incompleto",
  "medio incompleto",
  "médio completo",
  "medio completo",
  "superior incompleto",
  "superior completo",
  "pós-graduação",
  "pos-graduacao",
  "pós graduação",
  "mestrado",
  "doutorado",
];

function eduRank(value: string | null | undefined): number {
  if (!value) return -1;
  return EDUCATION_ORDER.indexOf(value.trim().toLowerCase());
}

export function compareEducation(
  possui: string | null | undefined,
  requerido: string | null | undefined,
): EscolaridadeVeredito {
  const rReq = eduRank(requerido);
  if (rReq < 0) return "sem_requisito";
  const rPos = eduRank(possui);
  if (!possui) return "nao_informado";
  if (rPos < 0) return "nao_informado";
  return rPos >= rReq ? "atende" : "gap";
}
