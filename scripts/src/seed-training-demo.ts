/**
 * Seed do módulo de Aprendizagem/LMS para uma organização de demonstração.
 *
 * Popula o módulo inteiro de forma coerente: catálogo, banco de competências,
 * matriz de competências por cargo, obrigatoriedades, turmas, PAT, treinos por
 * colaborador e avaliações de eficácia.
 *
 * Duas garantias de segurança, deliberadas:
 *
 *  1. `--org-id` é OBRIGATÓRIO. Não existe fallback para "a primeira org que o
 *     banco devolver": um `select().limit(1)` sem `order by` retorna linha
 *     arbitrária no Postgres e já quase escreveu dados de demonstração num
 *     tenant real.
 *  2. NENHUM delete. Tudo é idempotente por chave natural dentro da org — rodar
 *     de novo não duplica e não apaga. Sem delete não há delete que escape do
 *     tenant, que foi o bug corrigido em seed-assets/seed-operational-planning.
 *
 * Uso:
 *   pnpm --filter @workspace/scripts seed-training-demo --org-id 3
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import {
  db,
  pool,
  organizationsTable,
  usersTable,
  unitsTable,
  positionsTable,
  employeesTable,
  regulatoryNormsTable,
  trainingCatalogTable,
  competencyCatalogTable,
  trainingRequirementsTable,
  trainingClassesTable,
  trainingClassParticipantsTable,
  annualTrainingProgramTable,
  employeeTrainingsTable,
  employeeCompetenciesTable,
  positionCompetencyRequirementsTable,
  trainingEffectivenessReviewsTable,
} from "@workspace/db";

// ── Datas ────────────────────────────────────────────────────────────────────
const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();
const CURRENT_MONTH = NOW.getMonth() + 1;

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addMonths = (d: Date, months: number): Date => {
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + months);
  return out;
};
const addDays = (d: Date, days: number): Date => {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + days);
  return out;
};
/** Data dentro do mês corrente — o card de eficácia do dashboard só conta reviews do mês. */
const dayThisMonth = (day: number): string =>
  iso(new Date(CURRENT_YEAR, CURRENT_MONTH - 1, Math.min(day, 28)));

// ── Conteúdo ─────────────────────────────────────────────────────────────────
// A org demo é uma indústria com operação logística (departamentos Produção,
// Manutenção, Qualidade, Logística), então o catálogo mistura NRs de chão de
// fábrica, movimentação de materiais e gestão da qualidade.

const NORMS = [
  "NR-06 · Equipamento de Proteção Individual",
  "NR-10 · Segurança em Instalações Elétricas",
  "NR-11 · Transporte e Movimentação de Materiais",
  "NR-12 · Segurança em Máquinas e Equipamentos",
  "NR-35 · Trabalho em Altura",
  "ISO 9001 · cl. 7.2",
  "ISO 14001 · cl. 7.2",
];

type CompetencyType = "conhecimento" | "habilidade" | "atitude";

const COMPETENCIES: Array<{ name: string; type: CompetencyType; category: string }> = [
  { name: "Interpretação da ISO 9001", type: "conhecimento", category: "Qualidade" },
  { name: "Auditoria Interna", type: "habilidade", category: "Qualidade" },
  { name: "Controle de Qualidade", type: "habilidade", category: "Qualidade" },
  { name: "Análise Crítica de Indicadores", type: "conhecimento", category: "Gestão" },
  { name: "Gestão de Pessoas", type: "atitude", category: "Gestão" },
  { name: "Segurança em Máquinas", type: "habilidade", category: "Segurança" },
  { name: "Instalações Elétricas", type: "habilidade", category: "Manutenção" },
  { name: "Trabalho em Altura", type: "habilidade", category: "Segurança" },
  { name: "Operação Segura de Empilhadeira", type: "habilidade", category: "Logística" },
  { name: "Uso de EPI", type: "atitude", category: "Segurança" },
  { name: "Manutenção Preventiva", type: "habilidade", category: "Manutenção" },
  { name: "Boas Práticas de Fabricação", type: "conhecimento", category: "Produção" },
];

type CatalogSpec = {
  title: string;
  category: string;
  modality: "Presencial" | "EAD" | "Híbrido" | "Externo";
  norms: string[];
  workloadHours: number;
  validityMonths: number | null;
  isMandatory: boolean;
  competency: string | null;
  competencyLevel: number;
  instructor: string;
  objective: string;
  programContent: string;
  evaluationMethod: string;
};

const CATALOG: CatalogSpec[] = [
  {
    title: "NR-06 — Uso e Conservação de EPI",
    category: "Segurança do Trabalho",
    modality: "Presencial",
    norms: ["NR-06 · Equipamento de Proteção Individual"],
    workloadHours: 4,
    validityMonths: 12,
    isMandatory: true,
    competency: "Uso de EPI",
    competencyLevel: 3,
    instructor: "SESMT — Equipe Interna",
    objective:
      "Capacitar o colaborador quanto à seleção, uso, guarda e conservação dos equipamentos de proteção individual aplicáveis à sua função.",
    programContent:
      "Fundamentos legais da NR-06; tipos de EPI por risco; higienização e guarda; responsabilidades do empregador e do empregado; prática de inspeção.",
    evaluationMethod: "Prova teórica + observação em campo",
  },
  {
    title: "NR-10 — Segurança em Instalações e Serviços em Eletricidade",
    category: "Segurança do Trabalho",
    modality: "Presencial",
    norms: ["NR-10 · Segurança em Instalações Elétricas"],
    workloadHours: 40,
    validityMonths: 24,
    isMandatory: true,
    competency: "Instalações Elétricas",
    competencyLevel: 4,
    instructor: "Instituto Técnico Aurora (externo)",
    objective:
      "Habilitar profissionais que intervêm em instalações elétricas energizadas ou em suas proximidades, conforme NR-10.",
    programContent:
      "Riscos elétricos; medidas de controle; aterramento; EPC e EPI; primeiros socorros; análise de risco; procedimentos de trabalho.",
    evaluationMethod: "Prova teórica + avaliação prática",
  },
  {
    title: "NR-11 — Operação Segura de Empilhadeira",
    category: "Logística",
    modality: "Presencial",
    norms: ["NR-11 · Transporte e Movimentação de Materiais"],
    workloadHours: 16,
    validityMonths: 12,
    isMandatory: true,
    competency: "Operação Segura de Empilhadeira",
    competencyLevel: 4,
    instructor: "Instituto Técnico Aurora (externo)",
    objective:
      "Capacitar operadores para condução segura de empilhadeiras na movimentação e armazenagem de materiais.",
    programContent:
      "Legislação aplicável; componentes e checklist diário; estabilidade da carga; circulação em doca; abastecimento; situações de emergência.",
    evaluationMethod: "Prova teórica + avaliação prática de operação",
  },
  {
    title: "NR-12 — Segurança em Máquinas e Equipamentos",
    category: "Segurança do Trabalho",
    modality: "Presencial",
    norms: ["NR-12 · Segurança em Máquinas e Equipamentos"],
    workloadHours: 8,
    validityMonths: 24,
    isMandatory: true,
    competency: "Segurança em Máquinas",
    competencyLevel: 3,
    instructor: "SESMT — Equipe Interna",
    objective:
      "Apresentar os dispositivos de segurança das máquinas do parque fabril e os procedimentos seguros de operação e bloqueio.",
    programContent:
      "Princípios da NR-12; proteções fixas e móveis; dispositivos de parada de emergência; bloqueio e etiquetagem (LOTO); análise de risco.",
    evaluationMethod: "Prova teórica",
  },
  {
    title: "NR-35 — Trabalho em Altura",
    category: "Segurança do Trabalho",
    modality: "Presencial",
    norms: ["NR-35 · Trabalho em Altura"],
    workloadHours: 8,
    validityMonths: 24,
    isMandatory: true,
    competency: "Trabalho em Altura",
    competencyLevel: 4,
    instructor: "Instituto Técnico Aurora (externo)",
    objective:
      "Capacitar para execução de atividades acima de 2 metros com controle dos riscos de queda.",
    programContent:
      "Análise de risco e permissão de trabalho; sistemas de ancoragem; cinturão e talabarte; resgate em altura; prática supervisionada.",
    evaluationMethod: "Prova teórica + avaliação prática",
  },
  {
    title: "ISO 9001:2015 — Interpretação dos Requisitos",
    category: "Sistema de Gestão",
    modality: "Híbrido",
    norms: ["ISO 9001 · cl. 7.2"],
    workloadHours: 16,
    validityMonths: 36,
    isMandatory: false,
    competency: "Interpretação da ISO 9001",
    competencyLevel: 3,
    instructor: "Consultoria Aurora QMS",
    objective:
      "Nivelar o entendimento dos requisitos da ISO 9001:2015 e sua aplicação nos processos da organização.",
    programContent:
      "Estrutura de alto nível; contexto e partes interessadas; mentalidade de risco; abordagem por processos; requisitos 4 a 10.",
    evaluationMethod: "Prova teórica",
  },
  {
    title: "ISO 9001:2015 — Formação de Auditor Interno",
    category: "Sistema de Gestão",
    modality: "Presencial",
    norms: ["ISO 9001 · cl. 7.2"],
    workloadHours: 24,
    validityMonths: 36,
    isMandatory: false,
    competency: "Auditoria Interna",
    competencyLevel: 4,
    instructor: "Consultoria Aurora QMS",
    objective:
      "Formar auditores internos aptos a planejar, executar e reportar auditorias do sistema de gestão da qualidade.",
    programContent:
      "ISO 19011; planejamento e programa de auditoria; técnicas de entrevista e amostragem; evidência objetiva; redação de constatações; follow-up.",
    evaluationMethod: "Prova teórica + auditoria supervisionada",
  },
  {
    title: "ISO 14001:2015 — Gestão Ambiental na Operação",
    category: "Sistema de Gestão",
    modality: "EAD",
    norms: ["ISO 14001 · cl. 7.2"],
    workloadHours: 12,
    validityMonths: 36,
    isMandatory: false,
    competency: null,
    competencyLevel: 0,
    instructor: "Plataforma EAD Aurora",
    objective:
      "Apresentar os aspectos e impactos ambientais das atividades e os controles operacionais associados.",
    programContent:
      "Requisitos da ISO 14001; aspectos e impactos; controle operacional; resposta a emergências ambientais; destinação de resíduos.",
    evaluationMethod: "Questionário online",
  },
  {
    title: "Boas Práticas de Fabricação (BPF)",
    category: "Produção",
    modality: "Presencial",
    norms: [],
    workloadHours: 8,
    validityMonths: 12,
    isMandatory: true,
    competency: "Boas Práticas de Fabricação",
    competencyLevel: 3,
    instructor: "Qualidade — Equipe Interna",
    objective:
      "Padronizar as práticas de higiene, manipulação e controle de processo no chão de fábrica.",
    programContent:
      "Higiene pessoal e das instalações; contaminação cruzada; controle de pragas; rastreabilidade; registros de processo.",
    evaluationMethod: "Prova teórica + observação em campo",
  },
  {
    title: "Integração de Novos Colaboradores",
    category: "Recursos Humanos",
    modality: "Presencial",
    norms: [],
    workloadHours: 4,
    validityMonths: null,
    isMandatory: true,
    competency: null,
    competencyLevel: 0,
    instructor: "Recursos Humanos — Equipe Interna",
    objective:
      "Apresentar a organização, a política da qualidade, as regras de segurança e os canais internos ao colaborador recém-admitido.",
    programContent:
      "História e estrutura; política e objetivos da qualidade; regras de segurança; código de conduta; canais de comunicação e ouvidoria.",
    evaluationMethod: "Lista de presença + questionário de fixação",
  },
  {
    title: "Brigada de Emergência e Primeiros Socorros",
    category: "Segurança do Trabalho",
    modality: "Presencial",
    norms: [],
    workloadHours: 20,
    validityMonths: 12,
    isMandatory: false,
    competency: null,
    competencyLevel: 0,
    instructor: "Corpo de Bombeiros (externo)",
    objective:
      "Formar a brigada de emergência para atuação em princípios de incêndio, evacuação e atendimento pré-hospitalar.",
    programContent:
      "Teoria do fogo; extintores e hidrantes; plano de abandono; suporte básico de vida; imobilização e transporte de vítimas.",
    evaluationMethod: "Prova teórica + simulado prático",
  },
  {
    title: "Programa 5S",
    category: "Produção",
    modality: "Presencial",
    norms: [],
    workloadHours: 4,
    validityMonths: null,
    isMandatory: false,
    competency: null,
    competencyLevel: 0,
    instructor: "Qualidade — Equipe Interna",
    objective:
      "Difundir os cinco sensos como base para organização, padronização e disciplina nas áreas produtivas.",
    programContent:
      "Seiri, Seiton, Seiso, Seiketsu, Shitsuke; auditoria 5S; gestão visual; plano de ação por área.",
    evaluationMethod: "Auditoria de área",
  },
  {
    title: "LGPD — Proteção de Dados Pessoais",
    category: "Compliance",
    modality: "EAD",
    norms: [],
    workloadHours: 2,
    validityMonths: 24,
    isMandatory: false,
    competency: null,
    competencyLevel: 0,
    instructor: "Plataforma EAD Aurora",
    objective:
      "Conscientizar sobre o tratamento de dados pessoais e as obrigações da Lei 13.709/2018.",
    programContent:
      "Conceitos e bases legais; direitos do titular; incidentes e comunicação; boas práticas no dia a dia.",
    evaluationMethod: "Questionário online",
  },
  {
    title: "Liderança e Gestão de Equipes",
    category: "Desenvolvimento",
    modality: "Híbrido",
    norms: [],
    workloadHours: 16,
    validityMonths: null,
    isMandatory: false,
    competency: "Gestão de Pessoas",
    competencyLevel: 4,
    instructor: "Consultoria Aurora Desenvolvimento",
    objective:
      "Desenvolver competências de liderança situacional, feedback e gestão de desempenho.",
    programContent:
      "Estilos de liderança; feedback e escuta ativa; delegação; gestão de conflitos; acompanhamento de metas.",
    evaluationMethod: "Autoavaliação + avaliação do gestor",
  },
  {
    title: "Análise Crítica de Indicadores",
    category: "Sistema de Gestão",
    modality: "Presencial",
    norms: ["ISO 9001 · cl. 7.2"],
    workloadHours: 8,
    validityMonths: null,
    isMandatory: false,
    competency: "Análise Crítica de Indicadores",
    competencyLevel: 3,
    instructor: "Qualidade — Equipe Interna",
    objective:
      "Capacitar para leitura de indicadores, identificação de desvios e tratamento via justificativa ou plano de ação.",
    programContent:
      "Metas e tolerâncias; carta de tendência; análise de causa; quando abrir plano de ação; reunião de análise crítica.",
    evaluationMethod: "Estudo de caso",
  },
  {
    // Carga horária fracionada — exercita workload_hours numeric(6,2).
    title: "DDS — Diálogo Diário de Segurança",
    category: "Segurança do Trabalho",
    modality: "Presencial",
    norms: ["NR-06 · Equipamento de Proteção Individual"],
    workloadHours: 0.5,
    validityMonths: null,
    isMandatory: false,
    competency: null,
    competencyLevel: 0,
    instructor: "Liderança de Área",
    objective:
      "Reforçar diariamente um tema de segurança antes do início do turno.",
    programContent:
      "Tema do dia; quase-acidentes recentes; checagem de EPI; espaço para relato do time.",
    evaluationMethod: "Lista de presença",
  },
];

/** Competências exigidas por cargo (alimenta a matriz e o cálculo de gap). */
const POSITION_COMPETENCIES: Record<string, Array<{ name: string; level: number }>> = {
  "Gerente da Qualidade": [
    { name: "Interpretação da ISO 9001", level: 4 },
    { name: "Auditoria Interna", level: 4 },
    { name: "Análise Crítica de Indicadores", level: 4 },
    { name: "Gestão de Pessoas", level: 4 },
  ],
  "Analista da Qualidade": [
    { name: "Interpretação da ISO 9001", level: 3 },
    { name: "Auditoria Interna", level: 3 },
    { name: "Controle de Qualidade", level: 4 },
    { name: "Análise Crítica de Indicadores", level: 3 },
  ],
  "Supervisor de Produção": [
    { name: "Segurança em Máquinas", level: 4 },
    { name: "Boas Práticas de Fabricação", level: 3 },
    { name: "Gestão de Pessoas", level: 3 },
    { name: "Uso de EPI", level: 3 },
  ],
  "Técnico de Manutenção": [
    { name: "Instalações Elétricas", level: 4 },
    { name: "Manutenção Preventiva", level: 4 },
    { name: "Trabalho em Altura", level: 3 },
    { name: "Uso de EPI", level: 3 },
  ],
  "Analista de RH": [
    { name: "Gestão de Pessoas", level: 3 },
    { name: "Interpretação da ISO 9001", level: 2 },
  ],
  "Operador de Produção": [
    { name: "Segurança em Máquinas", level: 3 },
    { name: "Boas Práticas de Fabricação", level: 2 },
    { name: "Uso de EPI", level: 3 },
    { name: "Operação Segura de Empilhadeira", level: 2 },
  ],
};

/** Obrigatoriedades por cargo: quais itens do catálogo o cargo precisa ter. */
const POSITION_REQUIREMENTS: Record<
  string,
  Array<{ title: string; critical: boolean; recurrence: "nao_repete" | "anual" | "bienal" }>
> = {
  "Gerente da Qualidade": [
    { title: "ISO 9001:2015 — Interpretação dos Requisitos", critical: true, recurrence: "nao_repete" },
    { title: "ISO 9001:2015 — Formação de Auditor Interno", critical: true, recurrence: "nao_repete" },
    { title: "Liderança e Gestão de Equipes", critical: false, recurrence: "nao_repete" },
    { title: "Integração de Novos Colaboradores", critical: false, recurrence: "nao_repete" },
  ],
  "Analista da Qualidade": [
    { title: "ISO 9001:2015 — Interpretação dos Requisitos", critical: true, recurrence: "nao_repete" },
    { title: "ISO 9001:2015 — Formação de Auditor Interno", critical: false, recurrence: "nao_repete" },
    { title: "Análise Crítica de Indicadores", critical: false, recurrence: "nao_repete" },
    { title: "Integração de Novos Colaboradores", critical: false, recurrence: "nao_repete" },
  ],
  "Supervisor de Produção": [
    { title: "NR-06 — Uso e Conservação de EPI", critical: true, recurrence: "anual" },
    { title: "NR-12 — Segurança em Máquinas e Equipamentos", critical: true, recurrence: "bienal" },
    { title: "Boas Práticas de Fabricação (BPF)", critical: false, recurrence: "anual" },
    { title: "Liderança e Gestão de Equipes", critical: false, recurrence: "nao_repete" },
    { title: "Integração de Novos Colaboradores", critical: false, recurrence: "nao_repete" },
  ],
  "Técnico de Manutenção": [
    { title: "NR-06 — Uso e Conservação de EPI", critical: true, recurrence: "anual" },
    { title: "NR-10 — Segurança em Instalações e Serviços em Eletricidade", critical: true, recurrence: "bienal" },
    { title: "NR-35 — Trabalho em Altura", critical: true, recurrence: "bienal" },
    { title: "NR-12 — Segurança em Máquinas e Equipamentos", critical: false, recurrence: "bienal" },
    { title: "Integração de Novos Colaboradores", critical: false, recurrence: "nao_repete" },
  ],
  "Analista de RH": [
    { title: "LGPD — Proteção de Dados Pessoais", critical: false, recurrence: "bienal" },
    { title: "Integração de Novos Colaboradores", critical: false, recurrence: "nao_repete" },
  ],
  "Operador de Produção": [
    { title: "NR-06 — Uso e Conservação de EPI", critical: true, recurrence: "anual" },
    { title: "NR-12 — Segurança em Máquinas e Equipamentos", critical: true, recurrence: "bienal" },
    { title: "NR-11 — Operação Segura de Empilhadeira", critical: false, recurrence: "anual" },
    { title: "Boas Práticas de Fabricação (BPF)", critical: false, recurrence: "anual" },
    { title: "Integração de Novos Colaboradores", critical: false, recurrence: "nao_repete" },
  ],
};

// ── Args ─────────────────────────────────────────────────────────────────────
function parseOrgId(argv: string[]): number {
  const flagIndex = argv.indexOf("--org-id");
  const raw = flagIndex >= 0 ? argv[flagIndex + 1] : argv[0];

  if (!raw) {
    throw new Error(
      "--org-id é obrigatório.\n" +
        "Uso: pnpm --filter @workspace/scripts seed-training-demo --org-id <id>\n" +
        "Sem org explícita este seed não roda: escolher a org sozinho já quase\n" +
        "escreveu dados de demonstração num tenant real.",
    );
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--org-id inválido: ${raw}`);
  }
  return parsed;
}

// ── Passos ───────────────────────────────────────────────────────────────────

/** regulatory_norms: unique (org, lower(label)) → onConflictDoNothing basta. */
async function ensureNorms(orgId: number): Promise<Map<string, number>> {
  await db
    .insert(regulatoryNormsTable)
    .values(NORMS.map((label, i) => ({ organizationId: orgId, label, sortOrder: 100 + i })))
    .onConflictDoNothing();

  const rows = await db
    .select({ id: regulatoryNormsTable.id, label: regulatoryNormsTable.label })
    .from(regulatoryNormsTable)
    .where(eq(regulatoryNormsTable.organizationId, orgId));

  const map = new Map(rows.map((r) => [r.label.toLowerCase(), r.id]));
  console.log(`  normas: ${rows.length} no catálogo da org`);
  return map;
}

/** competency_catalog: unique (org, lower(name)). */
async function ensureCompetencies(orgId: number): Promise<number> {
  await db
    .insert(competencyCatalogTable)
    .values(
      COMPETENCIES.map((c) => ({
        organizationId: orgId,
        name: c.name,
        competencyType: c.type,
        category: c.category,
        isMandatory: c.type !== "conhecimento",
      })),
    )
    .onConflictDoNothing();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(competencyCatalogTable)
    .where(eq(competencyCatalogTable.organizationId, orgId));
  console.log(`  competências: ${count} no banco de competências`);
  return count;
}

/**
 * training_catalog não tem unique — dedup manual por (org, title).
 * `status: "ativo"` é obrigatório: a listagem filtra ativos por padrão e um item
 * criado com outro status simplesmente não aparece.
 */
async function ensureCatalog(
  orgId: number,
  normIdByLabel: Map<string, number>,
): Promise<Map<string, number>> {
  const existing = await db
    .select({ id: trainingCatalogTable.id, title: trainingCatalogTable.title })
    .from(trainingCatalogTable)
    .where(eq(trainingCatalogTable.organizationId, orgId));

  const byTitle = new Map(existing.map((r) => [r.title, r.id]));
  const missing = CATALOG.filter((c) => !byTitle.has(c.title));

  if (missing.length > 0) {
    const inserted = await db
      .insert(trainingCatalogTable)
      .values(
        missing.map((c) => ({
          organizationId: orgId,
          title: c.title,
          category: c.category,
          modality: c.modality,
          normIds: c.norms
            .map((label) => normIdByLabel.get(label.toLowerCase()))
            .filter((id): id is number => typeof id === "number"),
          workloadHours: c.workloadHours,
          validityMonths: c.validityMonths,
          isMandatory: c.isMandatory,
          status: "ativo",
          targetCompetencyName: c.competency,
          targetCompetencyType: c.competency
            ? COMPETENCIES.find((x) => x.name === c.competency)?.type
            : null,
          targetCompetencyLevel: c.competency ? c.competencyLevel : null,
          defaultInstructor: c.instructor,
          objective: c.objective,
          programContent: c.programContent,
          evaluationMethod: c.evaluationMethod,
        })),
      )
      .returning({ id: trainingCatalogTable.id, title: trainingCatalogTable.title });

    for (const row of inserted) byTitle.set(row.title, row.id);
  }

  console.log(`  catálogo: ${missing.length} criados, ${existing.length} já existiam`);
  return byTitle;
}

async function ensurePositionCompetencies(
  orgId: number,
  positionIdByName: Map<string, number>,
  authorUserId: number,
): Promise<number> {
  const positionIds = [...positionIdByName.values()];
  const existing = positionIds.length
    ? await db
        .select({
          positionId: positionCompetencyRequirementsTable.positionId,
          name: positionCompetencyRequirementsTable.competencyName,
        })
        .from(positionCompetencyRequirementsTable)
        .where(inArray(positionCompetencyRequirementsTable.positionId, positionIds))
    : [];

  const seen = new Set(existing.map((r) => `${r.positionId}::${r.name.toLowerCase()}`));
  const values: Array<typeof positionCompetencyRequirementsTable.$inferInsert> = [];

  for (const [positionName, comps] of Object.entries(POSITION_COMPETENCIES)) {
    const positionId = positionIdByName.get(positionName);
    if (!positionId) continue;

    comps.forEach((comp, index) => {
      if (seen.has(`${positionId}::${comp.name.toLowerCase()}`)) return;
      values.push({
        positionId,
        competencyName: comp.name,
        // O tipo tem que bater com employee_competencies.type: o gap é calculado
        // por chave normalizada `nome::tipo`, então divergir aqui inventa um gap.
        competencyType: COMPETENCIES.find((c) => c.name === comp.name)?.type ?? "habilidade",
        requiredLevel: comp.level,
        sortOrder: index,
        createdById: authorUserId,
        updatedById: authorUserId,
      });
    });
  }

  if (values.length > 0) await db.insert(positionCompetencyRequirementsTable).values(values);
  console.log(`  matriz de competências por cargo: ${values.length} criadas`);
  return values.length;
}

async function ensureRequirements(
  orgId: number,
  catalogIdByTitle: Map<string, number>,
  positionIdByName: Map<string, number>,
  normIdByLabel: Map<string, number>,
): Promise<Map<string, number>> {
  const values: Array<typeof trainingRequirementsTable.$inferInsert> = [];

  for (const [positionName, reqs] of Object.entries(POSITION_REQUIREMENTS)) {
    const positionId = positionIdByName.get(positionName);
    if (!positionId) continue;

    for (const req of reqs) {
      const catalogItemId = catalogIdByTitle.get(req.title);
      if (!catalogItemId) continue;

      const spec = CATALOG.find((c) => c.title === req.title);
      values.push({
        organizationId: orgId,
        positionId,
        catalogItemId,
        deadlineType: "fixo",
        deadlineDays: req.critical ? 30 : 90,
        scope: "geral",
        recurrence: req.recurrence,
        isCritical: req.critical,
        normIds: (spec?.norms ?? [])
          .map((label) => normIdByLabel.get(label.toLowerCase()))
          .filter((id): id is number => typeof id === "number"),
      });
    }
  }

  // unique (org, position, catalog_item, scope) → idempotente de graça.
  if (values.length > 0)
    await db.insert(trainingRequirementsTable).values(values).onConflictDoNothing();

  const rows = await db
    .select({
      id: trainingRequirementsTable.id,
      positionId: trainingRequirementsTable.positionId,
      catalogItemId: trainingRequirementsTable.catalogItemId,
    })
    .from(trainingRequirementsTable)
    .where(eq(trainingRequirementsTable.organizationId, orgId));

  console.log(`  obrigatoriedades: ${rows.length} regras ativas`);
  return new Map(rows.map((r) => [`${r.positionId}::${r.catalogItemId}`, r.id]));
}

async function ensureClasses(
  orgId: number,
  catalogIdByTitle: Map<string, number>,
  unitIdByName: Map<string, number>,
  employees: Array<{ id: number; position: string | null }>,
): Promise<number> {
  const existing = await db
    .select({ code: trainingClassesTable.code })
    .from(trainingClassesTable)
    .where(eq(trainingClassesTable.organizationId, orgId));
  const seen = new Set(existing.map((r) => r.code).filter(Boolean));

  const firstUnit = [...unitIdByName.values()][0] ?? null;

  const plan: Array<{
    code: string;
    title: string;
    status: "realizada" | "em_andamento" | "agendada";
    startOffsetDays: number;
    participants: string[];
  }> = [
    {
      code: `T-${CURRENT_YEAR}-001`,
      title: "NR-06 — Uso e Conservação de EPI",
      status: "realizada",
      startOffsetDays: -45,
      participants: ["Operador de Produção", "Técnico de Manutenção", "Supervisor de Produção"],
    },
    {
      code: `T-${CURRENT_YEAR}-002`,
      title: "NR-12 — Segurança em Máquinas e Equipamentos",
      status: "realizada",
      startOffsetDays: -30,
      participants: ["Operador de Produção", "Supervisor de Produção"],
    },
    {
      code: `T-${CURRENT_YEAR}-003`,
      title: "ISO 9001:2015 — Formação de Auditor Interno",
      status: "em_andamento",
      startOffsetDays: -3,
      participants: ["Gerente da Qualidade", "Analista da Qualidade"],
    },
    {
      code: `T-${CURRENT_YEAR}-004`,
      title: "NR-35 — Trabalho em Altura",
      status: "agendada",
      startOffsetDays: 21,
      participants: ["Técnico de Manutenção"],
    },
    {
      code: `T-${CURRENT_YEAR}-005`,
      title: "Brigada de Emergência e Primeiros Socorros",
      status: "agendada",
      startOffsetDays: 40,
      participants: ["Operador de Produção", "Analista de RH"],
    },
  ];

  let created = 0;
  for (const item of plan) {
    if (seen.has(item.code)) continue;
    const catalogItemId = catalogIdByTitle.get(item.title);
    if (!catalogItemId) continue;
    const spec = CATALOG.find((c) => c.title === item.title);

    const start = addDays(NOW, item.startOffsetDays);
    const [cls] = await db
      .insert(trainingClassesTable)
      .values({
        organizationId: orgId,
        catalogItemId,
        code: item.code,
        startDate: iso(start),
        endDate: iso(addDays(start, spec && spec.workloadHours > 8 ? 2 : 0)),
        unitId: firstUnit,
        location: "Sala de Treinamento — Sede",
        instructor: spec?.instructor ?? null,
        modality: spec?.modality ?? "Presencial",
        workloadHours: spec?.workloadHours ?? null,
        capacity: 20,
        minScore: 70,
        status: item.status,
      })
      .returning({ id: trainingClassesTable.id });

    const targets = employees.filter((e) => e.position && item.participants.includes(e.position));
    if (targets.length > 0) {
      await db
        .insert(trainingClassParticipantsTable)
        .values(
          targets.map((e, i) => ({
            classId: cls.id,
            employeeId: e.id,
            attendance: item.status === "realizada" ? "presente" : null,
            score: item.status === "realizada" ? 80 + ((i * 5) % 20) : null,
            result: item.status === "realizada" ? "aprovado" : null,
          })),
        )
        .onConflictDoNothing();
    }
    created += 1;
  }

  console.log(`  turmas: ${created} criadas (${plan.length - created} já existiam)`);
  return created;
}

/** PAT: `year` tem que ser o ano corrente, senão a tela abre vazia. */
async function ensureProgram(
  orgId: number,
  catalogIdByTitle: Map<string, number>,
  unitIdByName: Map<string, number>,
): Promise<number> {
  const existing = await db
    .select({ catalogItemId: annualTrainingProgramTable.catalogItemId })
    .from(annualTrainingProgramTable)
    .where(
      and(
        eq(annualTrainingProgramTable.organizationId, orgId),
        eq(annualTrainingProgramTable.year, CURRENT_YEAR),
      ),
    );
  const seen = new Set(existing.map((r) => r.catalogItemId));
  const firstUnit = [...unitIdByName.values()][0] ?? null;

  const plan: Array<{ title: string; month: number; qty: number; responsible: string }> = [
    { title: "NR-06 — Uso e Conservação de EPI", month: 2, qty: 25, responsible: "SESMT" },
    { title: "NR-12 — Segurança em Máquinas e Equipamentos", month: 3, qty: 18, responsible: "SESMT" },
    { title: "Integração de Novos Colaboradores", month: 1, qty: 12, responsible: "Recursos Humanos" },
    { title: "Boas Práticas de Fabricação (BPF)", month: 4, qty: 20, responsible: "Qualidade" },
    { title: "ISO 9001:2015 — Interpretação dos Requisitos", month: 5, qty: 10, responsible: "Qualidade" },
    { title: "ISO 9001:2015 — Formação de Auditor Interno", month: 7, qty: 6, responsible: "Qualidade" },
    { title: "NR-10 — Segurança em Instalações e Serviços em Eletricidade", month: 6, qty: 4, responsible: "Manutenção" },
    { title: "NR-35 — Trabalho em Altura", month: 8, qty: 5, responsible: "Manutenção" },
    { title: "NR-11 — Operação Segura de Empilhadeira", month: 9, qty: 8, responsible: "Logística" },
    { title: "Brigada de Emergência e Primeiros Socorros", month: 10, qty: 15, responsible: "SESMT" },
    { title: "LGPD — Proteção de Dados Pessoais", month: 11, qty: 30, responsible: "Compliance" },
    { title: "Programa 5S", month: 11, qty: 30, responsible: "Qualidade" },
  ];

  const values = plan
    .map((item) => {
      const catalogItemId = catalogIdByTitle.get(item.title);
      if (!catalogItemId || seen.has(catalogItemId)) return null;
      return {
        organizationId: orgId,
        year: CURRENT_YEAR,
        catalogItemId,
        unitId: firstUnit,
        plannedMonth: item.month,
        modality: CATALOG.find((c) => c.title === item.title)?.modality ?? "Presencial",
        plannedQuantity: item.qty,
        responsible: item.responsible,
        // Só 'realizada' conta no % de cumprimento do PAT. O que já passou do mês
        // corrente entra como realizada; o resto fica planejado.
        status: item.month < CURRENT_MONTH ? "realizada" : "planejada",
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (values.length > 0) await db.insert(annualTrainingProgramTable).values(values);
  console.log(`  PAT ${CURRENT_YEAR}: ${values.length} itens criados`);
  return values.length;
}

/**
 * Treinos por colaborador. Dois cuidados que decidem se o dashboard mostra algo:
 *  - `catalogItemId` preenchido: o gráfico por norma faz INNER JOIN no catálogo;
 *  - `requirementId` preenchido: a cobertura de obrigatórios só conta quem tem.
 */
async function ensureEmployeeTrainings(
  employees: Array<{ id: number; name: string; position: string | null; status: string }>,
  catalogIdByTitle: Map<string, number>,
  positionIdByName: Map<string, number>,
  requirementIdByKey: Map<string, number>,
): Promise<{ created: number; concluidos: number }> {
  const employeeIds = employees.map((e) => e.id);
  const existing = employeeIds.length
    ? await db
        .select({
          employeeId: employeeTrainingsTable.employeeId,
          title: employeeTrainingsTable.title,
        })
        .from(employeeTrainingsTable)
        .where(inArray(employeeTrainingsTable.employeeId, employeeIds))
    : [];
  const seen = new Set(existing.map((r) => `${r.employeeId}::${r.title}`));

  const values: Array<typeof employeeTrainingsTable.$inferInsert> = [];
  let concluidos = 0;

  employees.forEach((emp, empIndex) => {
    if (!emp.position) return;
    const reqs = POSITION_REQUIREMENTS[emp.position] ?? [];
    const positionId = positionIdByName.get(emp.position);

    reqs.forEach((req, reqIndex) => {
      if (seen.has(`${emp.id}::${req.title}`)) return;
      const catalogItemId = catalogIdByTitle.get(req.title);
      if (!catalogItemId) return;
      const spec = CATALOG.find((c) => c.title === req.title);
      if (!spec) return;

      // Mix determinístico: a maioria concluída, alguns pendentes, um vencido.
      // Colaborador inativo fica só com histórico concluído.
      const slot = (empIndex + reqIndex) % 6;
      let status: "concluido" | "pendente" | "vencido";
      if (emp.status !== "active") status = "concluido";
      else if (slot === 4) status = "pendente";
      else if (slot === 5 && spec.validityMonths) status = "vencido";
      else status = "concluido";

      let completionDate: string | null = null;
      let expirationDate: string | null = null;
      let dueDate: string | null = null;

      if (status === "concluido") {
        const done = addDays(NOW, -30 - reqIndex * 25 - empIndex * 7);
        completionDate = iso(done);
        expirationDate = spec.validityMonths ? iso(addMonths(done, spec.validityMonths)) : null;
        concluidos += 1;
      } else if (status === "vencido") {
        // Vencido = concluído há mais tempo que a validade. O card de vencidos só
        // conta status <> 'concluido', então o status carrega a informação.
        const done = addMonths(NOW, -(spec.validityMonths ?? 12) - 2);
        completionDate = iso(done);
        expirationDate = iso(addMonths(done, spec.validityMonths ?? 12));
      } else {
        dueDate = iso(addDays(NOW, req.critical ? 15 : 45));
      }

      values.push({
        employeeId: emp.id,
        title: spec.title,
        description: spec.objective,
        objective: spec.objective,
        institution: spec.instructor,
        targetCompetencyName: spec.competency,
        targetCompetencyType: spec.competency
          ? COMPETENCIES.find((c) => c.name === spec.competency)?.type
          : null,
        targetCompetencyLevel: spec.competency ? spec.competencyLevel : null,
        evaluationMethod: spec.evaluationMethod,
        renewalMonths: spec.validityMonths,
        workloadHours: spec.workloadHours,
        completionDate,
        expirationDate,
        dueDate,
        status,
        catalogItemId,
        requirementId:
          positionId != null
            ? (requirementIdByKey.get(`${positionId}::${catalogItemId}`) ?? null)
            : null,
      });
    });
  });

  if (values.length > 0) await db.insert(employeeTrainingsTable).values(values);
  console.log(`  treinos por colaborador: ${values.length} criados (${concluidos} concluídos)`);
  return { created: values.length, concluidos };
}

/**
 * Eficácia. O board tem 3 colunas e filtros fixos (status concluído + escopo
 * "precisa avaliação"). Distribuímos os concluídos nas três para nenhuma abrir
 * vazia:
 *   - Pendentes:   sem review, sem papel/prazo (entra pelo evaluationMethod)
 *   - Em avaliação: sem review, com papel + prazo
 *   - Concluídas:  com review — evaluation_date no mês corrente, senão o card
 *                  de eficácia do dashboard mostra "—".
 */
async function ensureEffectiveness(
  employees: Array<{ id: number }>,
  evaluatorUserId: number,
): Promise<{ emAvaliacao: number; reviews: number }> {
  const employeeIds = employees.map((e) => e.id);
  if (employeeIds.length === 0) return { emAvaliacao: 0, reviews: 0 };

  const concluded = await db
    .select({ id: employeeTrainingsTable.id })
    .from(employeeTrainingsTable)
    .where(
      and(
        inArray(employeeTrainingsTable.employeeId, employeeIds),
        eq(employeeTrainingsTable.status, "concluido"),
      ),
    )
    .orderBy(employeeTrainingsTable.id);

  const withReview = await db
    .select({ trainingId: trainingEffectivenessReviewsTable.trainingId })
    .from(trainingEffectivenessReviewsTable)
    .where(
      inArray(
        trainingEffectivenessReviewsTable.trainingId,
        concluded.map((c) => c.id),
      ),
    );
  const reviewed = new Set(withReview.map((r) => r.trainingId));

  const pending = concluded.filter((c) => !reviewed.has(c.id));
  const emAvaliacaoIds: number[] = [];
  const reviewValues: Array<typeof trainingEffectivenessReviewsTable.$inferInsert> = [];

  pending.forEach((training, index) => {
    const bucket = index % 3;
    if (bucket === 1) {
      emAvaliacaoIds.push(training.id);
    } else if (bucket === 2) {
      reviewValues.push({
        trainingId: training.id,
        evaluatorUserId,
        evaluationDate: dayThisMonth(5 + (index % 20)),
        score: 75 + (index % 25),
        // ~1 em 6 avaliado como não eficaz — um board 100% verde não demonstra
        // o fluxo de tratativa.
        isEffective: index % 6 !== 3,
        resultLevel: index % 6 !== 3 ? 4 : 2,
        evaluatorRole: "gestor",
        comments:
          index % 6 !== 3
            ? "Aplicação observada em campo; colaborador demonstra domínio do conteúdo."
            : "Aplicação parcial. Reforço agendado e acompanhamento pelo supervisor da área.",
      });
    }
  });

  if (emAvaliacaoIds.length > 0) {
    await db
      .update(employeeTrainingsTable)
      .set({
        effectivenessAssignedRole: "gestor",
        effectivenessDueDate: iso(addDays(NOW, 20)),
      })
      .where(inArray(employeeTrainingsTable.id, emAvaliacaoIds));
  }
  if (reviewValues.length > 0) {
    await db.insert(trainingEffectivenessReviewsTable).values(reviewValues);
  }

  console.log(
    `  eficácia: ${emAvaliacaoIds.length} em avaliação, ${reviewValues.length} avaliadas`,
  );
  return { emAvaliacao: emAvaliacaoIds.length, reviews: reviewValues.length };
}

/**
 * Competências adquiridas. O gap NÃO vem do treinamento concluído — é composto
 * em leitura comparando position_competency_requirements × employee_competencies
 * por chave normalizada `nome::tipo`. Por isso os nomes e tipos aqui espelham
 * exatamente a matriz do cargo.
 */
async function ensureEmployeeCompetencies(
  employees: Array<{ id: number; position: string | null; status: string }>,
): Promise<number> {
  const employeeIds = employees.map((e) => e.id);
  const existing = employeeIds.length
    ? await db
        .select({
          employeeId: employeeCompetenciesTable.employeeId,
          name: employeeCompetenciesTable.name,
        })
        .from(employeeCompetenciesTable)
        .where(inArray(employeeCompetenciesTable.employeeId, employeeIds))
    : [];
  const seen = new Set(existing.map((r) => `${r.employeeId}::${r.name.toLowerCase()}`));

  const values: Array<typeof employeeCompetenciesTable.$inferInsert> = [];

  employees.forEach((emp, empIndex) => {
    if (!emp.position) return;
    const comps = POSITION_COMPETENCIES[emp.position] ?? [];

    comps.forEach((comp, compIndex) => {
      if (seen.has(`${emp.id}::${comp.name.toLowerCase()}`)) return;

      // Mix deliberado: maioria atendida, alguns com gap de 1, poucos críticos
      // (gap >= 2). Um quadro 100% verde não demonstra o módulo.
      const slot = (empIndex * 3 + compIndex) % 10;
      let acquired: number;
      if (slot === 7) acquired = Math.max(comp.level - 2, 0);
      else if (slot === 3 || slot === 8) acquired = Math.max(comp.level - 1, 0);
      else acquired = comp.level;

      values.push({
        employeeId: emp.id,
        name: comp.name,
        type: COMPETENCIES.find((c) => c.name === comp.name)?.type ?? "habilidade",
        requiredLevel: comp.level,
        acquiredLevel: acquired,
        evidence:
          acquired >= comp.level
            ? "Certificado de treinamento e avaliação prática em campo."
            : "Em desenvolvimento — treinamento previsto no PAT.",
      });
    });
  });

  if (values.length > 0) await db.insert(employeeCompetenciesTable).values(values);
  console.log(`  competências por colaborador: ${values.length} criadas`);
  return values.length;
}

/**
 * "Minha área" abre o empty state "Sua conta não está vinculada a um
 * colaborador" quando users.employee_id é NULL — vincula os usuários da org aos
 * colaboradores por e-mail e, no que sobrar, por nome.
 */
async function linkUsersToEmployees(
  orgId: number,
  employees: Array<{ id: number; name: string; email: string | null; status: string }>,
): Promise<number> {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      employeeId: usersTable.employeeId,
    })
    .from(usersTable)
    .where(eq(usersTable.organizationId, orgId));

  const active = employees.filter((e) => e.status === "active");
  const taken = new Set(users.map((u) => u.employeeId).filter((id): id is number => id != null));
  let linked = 0;

  for (const user of users) {
    if (user.employeeId != null) continue;

    const byEmail = user.email
      ? active.find((e) => e.email?.toLowerCase() === user.email.toLowerCase())
      : undefined;
    const byName = active.find(
      (e) => e.name.toLowerCase() === user.name.toLowerCase() && !taken.has(e.id),
    );
    const free = active.find((e) => !taken.has(e.id));
    const target = byEmail ?? byName ?? free;
    if (!target) continue;

    await db
      .update(usersTable)
      .set({ employeeId: target.id })
      .where(eq(usersTable.id, user.id));
    taken.add(target.id);
    linked += 1;
    console.log(`  vínculo: ${user.email} → colaborador #${target.id} (${target.name})`);
  }

  return linked;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const orgId = parseOrgId(process.argv.slice(2));

  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  if (!org) throw new Error(`Organização ${orgId} não encontrada.`);

  console.log(`\n🎓 Seed de Aprendizagem — org #${org.id} ${org.name}\n`);

  const [positions, units, employees] = await Promise.all([
    db
      .select({ id: positionsTable.id, name: positionsTable.name })
      .from(positionsTable)
      .where(eq(positionsTable.organizationId, orgId)),
    db
      .select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable)
      .where(eq(unitsTable.organizationId, orgId)),
    db
      .select({
        id: employeesTable.id,
        name: employeesTable.name,
        email: employeesTable.email,
        position: employeesTable.position,
        status: employeesTable.status,
      })
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, orgId)),
  ]);

  if (positions.length === 0 || employees.length === 0) {
    throw new Error(
      `Org ${orgId} não tem cargos e/ou colaboradores — popule a estrutura básica antes.`,
    );
  }

  const [author] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.organizationId, orgId))
    .orderBy(usersTable.id);
  if (!author) throw new Error(`Org ${orgId} não tem usuários — necessário para autoria/avaliação.`);

  const positionIdByName = new Map(positions.map((p) => [p.name, p.id]));
  const unitIdByName = new Map(units.map((u) => [u.name, u.id]));

  // O motor de obrigatoriedade casa employees.position (texto) com
  // positions.name por igualdade exata — avisa se algum cargo não casar.
  const orphans = [
    ...new Set(
      employees
        .map((e) => e.position)
        .filter((p): p is string => !!p && !positionIdByName.has(p)),
    ),
  ];
  if (orphans.length > 0) {
    console.log(`  ⚠️  cargos sem correspondência em positions: ${orphans.join(", ")}`);
  }

  const normIdByLabel = await ensureNorms(orgId);
  await ensureCompetencies(orgId);
  const catalogIdByTitle = await ensureCatalog(orgId, normIdByLabel);
  await ensurePositionCompetencies(orgId, positionIdByName, author.id);
  const requirementIdByKey = await ensureRequirements(
    orgId,
    catalogIdByTitle,
    positionIdByName,
    normIdByLabel,
  );
  await ensureClasses(orgId, catalogIdByTitle, unitIdByName, employees);
  await ensureProgram(orgId, catalogIdByTitle, unitIdByName);
  await ensureEmployeeTrainings(employees, catalogIdByTitle, positionIdByName, requirementIdByKey);
  await ensureEffectiveness(employees, author.id);
  await ensureEmployeeCompetencies(employees);
  const linked = await linkUsersToEmployees(orgId, employees);

  console.log(`\n✅ Seed de Aprendizagem concluído (${linked} usuário(s) vinculado(s)).`);
  console.log("   Telas populadas: Catálogo · Obrigatoriedade · Turmas · PAT ·");
  console.log("   Eficácia · Cargos/Matriz · Colaboradores · Minha área · Dashboard\n");
}

main()
  .catch((error: unknown) => {
    console.error(
      `seed-training-demo falhou: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
