/**
 * KPI seed — populates objectives, indicators, year configs and monthly values
 * for 2025. Todos os dados são SINTÉTICOS (fixture de demonstração):
 * valores mensais gerados deterministicamente a partir de meta+direção.
 * Não usar como referência de desempenho de nenhuma organização real.
 *
 * Idempotent: skips objectives/indicators that already exist (matched by name+unit).
 * Run: pnpm --filter @workspace/scripts seed-kpi
 */
import {
  db,
  kpiObjectivesTable,
  kpiIndicatorsTable,
  kpiYearConfigsTable,
  kpiMonthlyValuesTable,
  organizationsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ensureOrgNormsAndMap, codesToNormIds } from "./migrate/norm-catalog";

const YEAR = 2025;
const CURRENT_YEAR = new Date().getFullYear();

// ─── Objectives ─────────────────────────────────────────────────────────────

const OBJECTIVES = [
  { key: "Q1", code: "Q1", name: "AUMENTAR RECEITA DE FORMA SUSTENTÁVEL" },
  { key: "Q2", code: "Q2", name: "AUMENTAR A EFICIÊNCIA OPERACIONAL DOS PROCESSOS" },
  { key: "Q3", code: "Q3", name: "DESENVOLVER LIDERANÇAS E EQUIPES" },
  { key: "S1", code: "S1", name: "PROMOVER O DESENVOLVIMENTO DE COMPETÊNCIAS DOS COLABORADORES" },
  { key: "A1", code: "A1", name: "MELHORAR O DESEMPENHO AMBIENTAL DAS ATIVIDADES" },
  { key: "A3", code: "A3", name: "REDUZIR A EMISSÃO DE POLUENTES ATMOSFÉRICOS_ESG" },
  { key: "S2", code: "S2", name: "PROMOVER A CULTURA DE SAÚDE E SEGURANÇA OCUPACIONAL E VIÁRIA COM FOCO NA ELIMINAÇÃO DAS LESÕES GRAVES EM ACIDENTES" },
  { key: "S1_VIA", code: "S1", name: "MELHORAR O DESEMPENHO DA SEGURANÇA VIÁRIA" },
  { key: "A2", code: "A2", name: "MELHORAR A CAPACIDADE DE RESPOSTA ÀS SITUAÇÕES DE EMERGÊNCIA" },
  { key: "GHG", code: null, name: "REDUÇÃO DA EMSSÃO DE GASES DO EFEITO ESTUFA" },
  { key: "A1_DOC", code: "A1", name: "GESTÃO DE DOCUMENTAÇÃO LEGAL E AMBIENTAL" },
] as const;

type ObjKey = typeof OBJECTIVES[number]["key"];

// ─── Indicators ─────────────────────────────────────────────────────────────

type IndicatorSeed = {
  name: string;
  measurement: string;
  unit: string;
  responsible: string;
  measureUnit: string;
  direction: "up" | "down";
  periodicity: string;
  objectiveKey: ObjKey;
  goal: number | null;
  /** 12 values Jan–Dec for YEAR, null = no data */
  values: (number | null)[];
};

const N = null; // shorthand for null month value

const INDICATORS: IndicatorSeed[] = [
  // ── Q2: Atendimento de Prazo / Avaria ────────────────────────────────────
  {
    name: "Atendimento do Prazo de Entrega - Clientes ISO",
    measurement: "(Total de atrasos / Total de CT-e, CRT, MIC-DTA emitidos) * 100",
    unit: "Sede Principal", responsible: "Operacional", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 98.90,
    values: [99.62, 99.28, 99.57, 99.58, 99.12, 99.08, 99.74, 98.98, 99.83, 99.71, 99.75, 99.48],
  },
  {
    name: "Atendimento do Prazo de Entrega - Cliente Estratégico",
    measurement: "(Total de atrasos / Total de CT-e, CRT, MIC-DTA emitidos) * 101",
    unit: "Filial Rio de Janeiro", responsible: "Analista SGI", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 99.99,
    values: [99.99, 99.99, 100.00, 99.99, 100.00, 100.00, 100.00, 99.99, 99.99, 99.99, 99.99, 99.99],
  },
  {
    name: "Custo de Avaria por Unidade - Geral",
    measurement: "Total de custos com avarias / quantidade de volumes expedidos",
    unit: "Corporativo", responsible: "Analista SGI", measureUnit: "R$", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "Q2", goal: 4.50,
    values: [3.73, 3.83, 4.32, 4.28, 4.40, 3.31, 6.46, 3.55, 3.70, 3.49, N, N],
  },
  {
    name: "Custo de Avaria por Unidade - Filial Rio de Janeiro",
    measurement: "Total de custos com avarias / quantidade de volumes expedidos",
    unit: "Filial Rio de Janeiro", responsible: "Analista SGI", measureUnit: "R$", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 5.60,
    values: [4.31, 5.19, 6.16, 4.46, 5.26, 4.19, 4.28, 6.83, 4.88, 4.57, 4.78, 4.13],
  },
  {
    name: "Custo de Avaria por Unidade - Filial Rio de Janeiro (Cliente)",
    measurement: "Total de custos com avarias / quantidade de volumes expedidos",
    unit: "Filial Rio de Janeiro", responsible: "Analista SGI", measureUnit: "R$", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 5.60,
    values: [4.52, 5.04, 5.41, 4.02, 5.03, 4.04, N, N, N, N, N, N],
  },
  {
    name: "% de Avaria - Geral",
    measurement: "Número de volumes avariados /Total de volumes movimentados",
    unit: "Corporativo", responsible: "Operacional", measureUnit: "%", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "Q2", goal: 0.60,
    values: [0.44, 0.58, 0.59, 0.50, 0.43, 0.53, 0.49, 0.56, 0.82, 0.51, 0.45, 0.58],
  },
  {
    name: "% de Avaria - Filial Rio de Janeiro",
    measurement: "Número de volumes avariados /Total de volumes movimentados",
    unit: "Filial Rio de Janeiro", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 1.20,
    values: [0.96, 1.04, 0.92, 1.07, N, N, N, N, N, N, N, N],
  },
  {
    name: "% de Avaria - Filial Rio de Janeiro (Cliente)",
    measurement: "Número de volumes avariados /Total de volumes movimentados",
    unit: "Filial Rio de Janeiro", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 1.20,
    values: [0.94, 0.90, 1.17, 0.94, 1.78, 0.96, 0.90, 1.07, 0.88, 1.02, 1.78, 0.92],
  },
  {
    name: "% de Avaria - Filial Belo Horizonte",
    measurement: "Número de volumes avariados /Total de volumes movimentados",
    unit: "Filial Belo Horizonte", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.47, 0.36, 0.36, 0.48, 0.50, 0.37, 0.38, 0.45, 0.42, 0.47, 0.40, 0.47],
  },
  {
    name: "% de Avaria - Sede Principal - Armazém",
    measurement: "Número de volumes avariados /Total de volumes movimentados",
    unit: "Sede Principal", responsible: "Coordenação de Operações", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.42, 0.49, 0.43, 0.37, 0.44, 0.44, 0.37, 0.43, 0.39, 0.40, N, N],
  },
  {
    name: "% de Avaria - Filial Rio de Janeiro - Armazém",
    measurement: "Número de volumes avariados /Total de volumes movimentados",
    unit: "Filial Rio de Janeiro", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.41, 0.46, 0.44, 0.39, 0.36, 0.50, 0.42, 0.43, 0.40, 0.35, 0.35, 0.47],
  },
  {
    name: "% de Avaria - Filial Belo Horizonte - Armazém",
    measurement: "Número de volumes avariados /Total de volumes movimentados * 100",
    unit: "Filial Belo Horizonte", responsible: "Coordenação de Operações", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.40, 0.41, 0.49, 0.37, 0.42, 0.46, 0.48, 0.39, 0.40, 0.42, 0.49, 0.49],
  },
  {
    name: "% de Avaria - Sede Principal - Cross-docking",
    measurement: "Número de volumes avariados /Total de volumes movimentados",
    unit: "Sede Principal", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.37, 0.36, 0.36, 0.69, 0.37, 0.40, 0.38, 0.46, 0.38, 0.63, N, N],
  },
  {
    name: "% de Avaria - Filial Rio de Janeiro - Pátio",
    measurement: "Número de volumes avariados /Total de volumes movimentados",
    unit: "Filial Rio de Janeiro", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.44, 0.47, 0.37, 0.36, 0.38, 0.75, 0.44, 0.74, 0.46, 0.44, 0.47, 0.38],
  },
  {
    name: "% de Avaria - Filial Belo Horizonte - Pátio",
    measurement: "Número de volumes avariados /Total de volumes movimentados",
    unit: "Filial Belo Horizonte", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.47, 0.37, 0.37, 0.42, 0.46, 0.47, 0.36, 0.45, 0.39, 0.41, 0.43, 0.39],
  },
  {
    name: "% de Avaria - Carregamento - Filial Rio de Janeiro",
    measurement: "Nº de volumes avariados no carregamento / Nº de volumes carregados",
    unit: "Filial Rio de Janeiro", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.05,
    values: [0.047, 0.044, 0.044, 0.037, 0.038, 0.035, 0.037, 0.037, 0.044, 0.037, 0.040, 0.044],
  },

  // ── Q2: Treinamentos ─────────────────────────────────────────────────────
  {
    name: "Horas de Treinamento Geral",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores",
    unit: "Corporativo", responsible: "Recursos Humanos", measureUnit: "Hrs", direction: "up", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 3.00,
    values: [3.19, 3.17, 2.68, 3.08, 3.16, 3.00, 3.22, 3.25, 3.22, 3.12, N, N],
  },
  {
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional Sede Principal",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "Sede Principal", responsible: "Recursos Humanos", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 2.00,
    values: [2.15, 2.07, 2.00, 2.13, 2.09, 2.17, 2.17, 2.12, 2.02, 2.15, 2.15, 2.04],
  },
  {
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional Filial Rio de Janeiro",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "Filial Rio de Janeiro", responsible: "Psicologia", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 2.00,
    values: [2.10, 2.02, 2.18, 2.01, 2.16, 2.03, 1.72, 2.02, 2.04, 2.01, 2.17, 2.06],
  },
  {
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional Filial Belo Horizonte",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "Filial Belo Horizonte", responsible: "Psicologia", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 2.00,
    values: [2.20, 2.13, 2.12, 2.09, 2.09, 2.13, 2.01, 2.17, 2.15, 2.11, 2.12, 2.16],
  },
  {
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional Sede Principal - Armazém",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "Sede Principal", responsible: "Coordenação Administrativa", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: N,
    values: [N, 4.45, 3.84, 4.20, 4.20, 4.48, 3.29, 3.53, 4.30, 2.90, 3.61, N],
  },
  {
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional Filial Rio de Janeiro - Armazém",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "Filial Rio de Janeiro", responsible: "Administrativo", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 2.00,
    values: [2.17, 2.08, 2.18, 2.13, 2.08, 2.06, 2.19, 2.08, 2.13, N, N, N],
  },
  {
    name: "Horas de Treinamento - Colaborador Motorista",
    measurement: "(Somatório de horas de treinamentos dos motoristas do mês)/ número de colaboradores motoristas - Dados do Departamento Pessoal",
    unit: "Corporativo", responsible: "Psicologia", measureUnit: "Hrs", direction: "up", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 3.00,
    values: [3.13, 3.10, 3.15, 3.13, 3.08, 3.05, 3.03, 3.05, 3.02, 3.30, N, N],
  },

  // ── Q2: Eficácia recrutamento e Turnover ─────────────────────────────────
  {
    name: "Eficácia recrutamento e seleção - Geral",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "Corporativo", responsible: "Psicologia", measureUnit: "%", direction: "up", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 89.00,
    values: [90.70, 97.50, 92.09, 90.48, 91.38, 96.69, 94.98, 93.58, 98.81, 96.21, N, N],
  },
  {
    name: "Eficácia recrutamento e seleção - Filial Rio de Janeiro",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "Filial Rio de Janeiro", responsible: "Psicologia", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 89.00,
    values: [98.25, 89.71, 89.16, 73.82, 97.35, 97.35, 93.16, 90.16, 92.30, 89.11, N, N],
  },
  {
    name: "Eficácia recrutamento e seleção - Filial Belo Horizonte",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "Filial Belo Horizonte", responsible: "Psicologia", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 89.00,
    values: [96.70, 92.27, 94.63, 92.26, 94.92, 95.58, 92.24, 89.56, 90.09, 95.97, 91.28, 89.30],
  },
  {
    name: "Eficácia recrutamento e seleção - Sede Principal - Armazém",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "Sede Principal", responsible: "Coordenação Administrativa", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 89.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Eficácia recrutamento e seleção - Filial Rio de Janeiro - Armazém",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "Filial Rio de Janeiro", responsible: "Administrativo", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 89.00,
    values: [94.25, 91.99, 96.75, 73.71, 98.45, 81.72, 95.74, 98.22, 97.60, N, N, N],
  },
  {
    name: "Turnover - Geral",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Corporativo", responsible: "Psicologia", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 3.10,
    values: [2.88, 2.86, 2.74, 3.08, 2.83, 2.72, 2.24, 2.72, 2.36, 2.54, N, N],
  },
  {
    name: "Turnover - Sede Principal",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Sede Principal", responsible: "Psicologia", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [2.30, 2.46, 2.98, 2.99, 2.41, 2.31, 2.88, 4.12, 2.34, 2.54, 2.71, 2.91],
  },
  {
    name: "Turnover - Filial Rio de Janeiro",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Filial Rio de Janeiro", responsible: "Psicologia", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [2.95, 2.39, 2.77, 2.35, 2.93, 3.03, 2.49, 2.30, 3.06, 2.41, 2.79, 2.44],
  },
  {
    name: "Turnover - Filial Belo Horizonte",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Filial Belo Horizonte", responsible: "Psicologia", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [2.22, 2.78, 2.20, 2.26, 2.22, 2.80, 2.84, 2.40, 4.43, 2.37, 2.80, 3.01],
  },
  {
    name: "Turnover - Sede Principal - Armazém",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Sede Principal", responsible: "Coordenação Administrativa", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [2.49, 2.87, 2.68, 2.53, 2.86, 2.78, 2.75, 2.21, 2.86, 2.88, N, N],
  },
  {
    name: "Turnover - Filial Rio de Janeiro - Armazém",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Filial Rio de Janeiro", responsible: "Administrativo", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [4.42, 2.44, 2.90, 2.66, 2.37, 3.06, 2.76, 2.47, 2.48, N, N, N],
  },

  // ── Q2: Acuracidade de Estoque ───────────────────────────────────────────
  {
    name: "Acuracidade de Estoque - Geral",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Corporativo", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque - Sede Principal",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Sede Principal", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque - Filial Rio de Janeiro",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Filial Rio de Janeiro", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque_EPI - Filial Rio de Janeiro",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Filial Rio de Janeiro", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 88.00,
    values: [N, N, 96.43, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque - Filial Belo Horizonte",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Filial Belo Horizonte", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque - Sede Principal - Armazém",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Sede Principal", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque - Filial Rio de Janeiro - Armazém",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Filial Rio de Janeiro", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── Q2: Diferença de Estoque ─────────────────────────────────────────────
  {
    name: "Diferença do estoque R$ - Geral",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Corporativo", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ - Sede Principal",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Sede Principal", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ - Filial Rio de Janeiro",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Filial Rio de Janeiro", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ _EPI - Filial Rio de Janeiro",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Filial Rio de Janeiro", responsible: "Segurança", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 80.00,
    values: [N, N, 58.65, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ - Filial Belo Horizonte",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Filial Belo Horizonte", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ - Sede Principal - Armazém",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Sede Principal", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ - Filial Rio de Janeiro - Armazém",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Filial Rio de Janeiro", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── Q2: Taxa de Acidentes ────────────────────────────────────────────────
  {
    name: "Taxa de Acidentes de Trabalho - Geral",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Sede no mês)",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 0.73,
    values: [1.03, 0.65, 0.54, 0.70, 0.65, 0.54, 1.03, 0.61, 0.52, N, N, N],
  },
  {
    name: "Taxa de Acidentes de Trabalho - Sede Principal",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Sede no mês)",
    unit: "Sede Principal", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.73,
    values: [0.63, 0.92, 0.54, 0.56, 0.60, 0.54, 1.01, 0.61, N, N, N, N],
  },
  {
    name: "Taxa de Acidentes de Trabalho - Filial Rio de Janeiro",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Sede no mês)",
    unit: "Filial Rio de Janeiro", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 1.25,
    values: [1.11, 1.18, 0.93, 0.99, 1.14, 1.21, 0.88, 1.04, 0.91, N, N, N],
  },
  {
    name: "Taxa de Acidentes de Trabalho - Filial Belo Horizonte",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Sede no mês)",
    unit: "Filial Belo Horizonte", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.81,
    values: [0.57, 0.72, 0.76, 0.68, 0.99, 0.61, 0.65, 0.63, 0.59, 0.61, 0.78, 0.74],
  },
  {
    name: "Taxa de Acidentes de Trabalho - Sede Principal - Armazém",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Sede no mês)",
    unit: "Sede Principal", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.81,
    values: [0.58, 0.76, 0.70, 0.58, 0.63, N, N, N, N, N, N, N],
  },
  {
    name: "Taxa de Acidentes de Trabalho - Filial Rio de Janeiro - Armazém",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Sede no mês)",
    unit: "Filial Rio de Janeiro", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.81,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── Q2: Frota ────────────────────────────────────────────────────────────
  {
    name: "Custo de manutenção",
    measurement: "Total de custos de manutenção (incluindo custos de rateio) / Total km rodado",
    unit: "Corporativo", responsible: "Frota", measureUnit: "R$/Km", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.47,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Consumo de Combustivel",
    measurement: "Total de Km rodado (por caminhão) / Total de litros abastecidos = média diesel. Total da soma de todas médias diesel (exceto linha dedicada) / Total de caminhões (médias apuradas).",
    unit: "Corporativo", responsible: "Frota", measureUnit: "Km/L", direction: "up", periodicity: "monthly_45d",
    objectiveKey: "Q2", goal: 2.80,
    values: [2.98, 2.88, 3.03, 2.85, 3.05, 2.86, 2.90, 3.07, 2.83, 3.00, 3.07, 3.01],
  },
  {
    name: "Custo de Pneus",
    measurement: "Custo total de pneus mensal (Não incluído custo de pneu novo sem aplicação) x 1000 km rodados por pneu no mês. km rodada por pneu mensal = Multiplicação da quantidade de km rodada geral das frotas por 14 (quantidade média de pneus em uma frota).",
    unit: "Corporativo", responsible: "Frota", measureUnit: "R$/1000 Km", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "Q2", goal: 3.80,
    values: [3.37, 2.71, 2.82, 3.36, 3.75, 3.44, 2.88, 3.60, N, N, N, N],
  },
  {
    name: "Pesquisa de Satisfação de Clientes - Reunião de Análise Crítica",
    measurement: "Buscar a melhoria continua dos processos",
    unit: "Corporativo", responsible: "Analista SGI", measureUnit: "", direction: "up", periodicity: "annual",
    objectiveKey: "Q2", goal: 80.00,
    values: [87.17, 84.13, 87.14, 81.01, 82.87, 81.24, 82.47, 86.38, 64.22, 82.73, N, N],
  },

  // ── Q1: Financeiro ───────────────────────────────────────────────────────
  {
    name: "Custos Fixos",
    measurement: "Custos fixos /Faturamento Bruto * 100",
    unit: "Corporativo", responsible: "Financeiro", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "Q1", goal: 25.00,
    values: [17.58, 35.84, 18.95, 21.44, 18.35, 23.07, 20.37, 22.43, N, N, N, N],
  },
  {
    name: "Custos Variáveis",
    measurement: "Custos variáveis / Faturamento Bruto * 100",
    unit: "Corporativo", responsible: "Financeiro", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "Q1", goal: 73.10,
    values: [72.59, 60.70, 82.10, 60.18, 57.70, 68.45, 57.40, 68.65, N, N, N, N],
  },
  {
    name: "Faturamento",
    measurement: "(MAM 2018 - MAM 2017 * 100 / MAM 2017) + 100. OBS: MAM = Média Anual Mensal",
    unit: "Corporativo", responsible: "Diretor Operacional", measureUnit: "%", direction: "up", periodicity: "monthly_15d",
    objectiveKey: "Q1", goal: 72.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── A1: Consumo de água ───────────────────────────────────────────────────
  {
    name: "Consumo de água",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Sede Principal", responsible: "Tec. Meio Ambiente", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 5.50,
    values: [5.43, 4.30, 3.90, 5.49, 4.38, 4.16, 6.89, 4.86, 4.11, 4.42, N, N],
  },
  {
    name: "Consumo de água",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Filial Rio de Janeiro", responsible: "Aux. SGI", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 5.50,
    values: [4.93, 4.69, 4.95, 4.01, 4.47, 5.30, 4.48, 5.40, 4.38, 4.61, 5.48, 5.00],
  },
  {
    name: "Consumo de água",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Filial Belo Horizonte", responsible: "Aux. SGI", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2.00,
    values: [1.45, 1.80, 1.75, 1.55, 1.91, 1.72, 1.41, 2.59, 1.89, 1.45, 1.59, 1.72],
  },
  {
    name: "Consumo de água - Armazém",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Sede Principal", responsible: "Coordenação Administrativa", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 1.07,
    values: [0.75, 1.03, 0.84, 0.78, 0.90, 0.97, 0.86, 0.99, 1.05, 1.31, N, N],
  },
  {
    name: "Consumo de água - Armazém",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Filial Rio de Janeiro", responsible: "Administrativo", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 0.327,
    values: [0.30, 0.24, 0.30, 0.24, 0.24, 0.27, 0.24, 0.29, 0.27, 0.29, 0.42, 0.33],
  },
  {
    name: "Consumo de água - Armazém",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Filial Belo Horizonte", responsible: "Coordenação Ambiental", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 3.30,
    values: [2.56, 2.57, 3.99, 3.25, 2.78, 2.73, 3.12, 2.31, 4.69, 2.82, 2.59, 2.71],
  },
  {
    name: "Consumo de água - Cross-docking",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Sede Principal", responsible: "Administrativo", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [2.34, 2.82, 2.19, 2.53, 2.42, 3.10, 2.71, 3.88, 2.34, 2.92, 3.32, 2.51],
  },

  // ── A1: Consumo de energia elétrica ──────────────────────────────────────
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Sede Principal", responsible: "Tec. Meio Ambiente", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [61.62, 51.84, 52.57, 47.90, 42.03, 46.40, 46.93, 55.60, 49.09, 71.34, N, N],
  },
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Filial Rio de Janeiro", responsible: "Aux. SGI", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 39.27,
    values: [33.02, 38.14, 33.89, 28.33, 37.98, 32.87, 30.47, 27.50, 33.65, 32.12, 36.16, 34.17],
  },
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Filial Belo Horizonte", responsible: "Aux. SGI", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 83.00,
    values: [67.68, 68.45, 64.60, 68.78, 66.14, 75.21, 69.62, 81.49, 80.56, 64.62, 66.46, 70.38],
  },
  {
    name: "Consumo de energia elétrica - Armazém",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Sede Principal", responsible: "Coordenação Administrativa", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [61.21, 53.60, 57.03, 54.31, 71.56, 58.31, 59.30, 45.29, 53.81, 49.53, N, N],
  },
  {
    name: "Consumo de energia elétrica - Armazém",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Filial Rio de Janeiro", responsible: "Administrativo", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 13.18,
    values: [10.41, 10.70, 11.55, 11.68, 11.05, 9.66, 9.66, 11.21, 12.10, 9.89, 12.75, 9.44],
  },
  {
    name: "Consumo de energia elétrica - Armazém",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Filial Belo Horizonte", responsible: "Coordenação Ambiental", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 6.43,
    values: [5.72, 5.09, 5.00, 5.83, 4.65, 5.60, 4.65, 4.93, 9.29, 6.17, 5.76, 5.45],
  },
  {
    name: "Consumo de energia elétrica - Cross-docking",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Sede Principal", responsible: "Administrativo", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [56.56, 64.37, 66.59, 73.89, 77.33, 49.44, 43.36, 46.36, 63.53, 63.11, 61.38, 50.08],
  },

  // ── A1: Material Reciclável ───────────────────────────────────────────────
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Sede Principal", responsible: "Tec. Meio Ambiente", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [471.5, 388.9, 634.9, 629.7, 502.7, 531.6, 396.1, 607.4, 409.2, 456.3, N, N],
  },
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Filial Rio de Janeiro", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 1940,
    values: [1585, 1779, 1453, 1600, 1764, 1504, 1736, 1435, 1594, 1876, 1360, 1807],
  },
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Filial Belo Horizonte", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 1500,
    values: [1314, 1414, 1079, 1178, 1054, 1269, 1337, 1340, 1427, 1791, 1499, 1400],
  },
  {
    name: "Material Reciclável - Armazém",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Sede Principal", responsible: "Coordenação Administrativa", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [518.5, 458.4, 439.9, 537.1, 489.3, 465.0, 396.2, 489.2, 403.0, 639.5, N, N],
  },
  {
    name: "Material Reciclável - Armazém",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Filial Rio de Janeiro", responsible: "Administrativo", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 20,
    values: [14.05, 17.24, 15.29, 19.50, 17.37, 14.49, 18.61, 19.06, 19.46, 16.13, 14.56, 16.64],
  },
  {
    name: "Material Reciclável - Armazém",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Filial Belo Horizonte", responsible: "Coordenação Ambiental", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 50,
    values: [41.64, 42.24, 38.08, 36.70, 44.35, 40.64, 46.69, 37.84, 47.24, 46.10, 38.78, 42.84],
  },
  {
    name: "Material Reciclável - Cross-docking",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Sede Principal", responsible: "Administrativo", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [453.8, 402.2, 611.4, 557.2, 629.0, 390.3, 605.2, 392.3, 461.3, 607.8, 389.1, 425.1],
  },

  // ── A1: Material contaminado ──────────────────────────────────────────────
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "Sede Principal", responsible: "Tec. Meio Ambiente", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2667.06,
    values: [3396, 2295, 2592, 2289, 1992, 2084, 2633, 1985, 2177, 2090, N, N],
  },
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Rio de Janeiro", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2000,
    values: [1720, 1547, 1626, 1663, 1579, 1730, 1590, 1891, 1679, 1411, 1904, 1867],
  },
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Belo Horizonte", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 1500,
    values: [1465, 1153, 1118, 1497, 1382, 1399, 1450, 1123, 1139, 1447, 1357, 1918],
  },
  {
    name: "Material contaminado - Armazém",
    measurement: "Volume gerado mensalmente",
    unit: "Sede Principal", responsible: "Coordenação Administrativa", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [502.1, 646.9, 504.5, 490.3, 392.9, 441.0, 607.1, 631.2, 474.4, 514.6, N, N],
  },
  {
    name: "Material contaminado - Armazém",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Rio de Janeiro", responsible: "Administrativo", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 0,
    values: [0.24, 0.00, 0.00, 0.08, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
  },
  {
    name: "Material contaminado - Armazém",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Belo Horizonte", responsible: "Coordenação Ambiental", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 10,
    values: [9.99, 8.98, 8.20, 9.41, 9.37, 7.94, 7.97, 9.98, 8.90, 8.45, 8.16, 8.24],
  },
  {
    name: "Material contaminado - Cross-docking",
    measurement: "Volume gerado mensalmente",
    unit: "Sede Principal", responsible: "Administrativo", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [454.2, 462.5, 453.5, 404.8, 462.1, 421.2, 575.4, 488.8, 490.6, 587.2, 629.5, 461.4],
  },

  // ── A1: Orgânico ──────────────────────────────────────────────────────────
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "Sede Principal", responsible: "Tec. Meio Ambiente", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [538.8, 528.4, 516.9, 491.4, 463.3, 586.6, 551.5, 516.0, 608.5, 433.8, N, N],
  },
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Rio de Janeiro", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 800,
    values: [598.7, 625.5, 786.8, 616.4, 792.8, 614.5, 626.5, 562.6, 715.1, 774.4, 595.7, 583.8],
  },
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Belo Horizonte", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 400,
    values: [365.5, 359.4, 313.4, 395.1, 328.4, 296.5, 328.4, 289.7, 340.6, 381.6, 362.1, 379.2],
  },
  {
    name: "Orgânico - Armazém",
    measurement: "Volume gerado mensalmente",
    unit: "Sede Principal", responsible: "Coordenação Administrativa", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [417.9, 529.2, 415.9, 449.0, 425.4, 495.2, 590.7, 393.5, 448.8, 365.0, N, N],
  },
  {
    name: "Orgânico - Armazém",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Rio de Janeiro", responsible: "Administrativo", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 64.35,
    values: [59.38, 47.18, 72.43, 60.95, 56.55, 53.81, 56.78, 63.26, 60.47, 76.64, 53.27, 52.61],
  },
  {
    name: "Orgânico - Armazém",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Belo Horizonte", responsible: "Coordenação Ambiental", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 50,
    values: [47.86, 38.66, 45.10, 48.47, 46.64, 58.78, 44.12, 67.52, 37.39, 38.99, 42.41, 45.98],
  },
  {
    name: "Orgânico - Cross-docking",
    measurement: "Volume gerado mensalmente",
    unit: "Sede Principal", responsible: "Administrativo", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [450.9, 387.0, 535.5, 445.2, 533.3, 615.3, 622.6, 429.5, 432.8, 355.9, 637.8, 432.6],
  },

  // ── A1: Óleo Usado ────────────────────────────────────────────────────────
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "Sede Principal", responsible: "Tec. Meio Ambiente", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [534.6, 517.3, 426.8, 510.2, 624.4, 649.2, 406.7, 472.7, 642.0, 368.9, N, N],
  },
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Rio de Janeiro", responsible: "Aux. SGI", measureUnit: "l", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2000,
    values: [1756, 1730, 2841, 1601, 1413, 1422, 1852, 1695, 1950, 1436, 1838, 1914],
  },
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Belo Horizonte", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2223,
    values: [1755, 2197, 2222, 1610, 1729, 3247, 1687, 1969, 1826, 1707, 1854, 1722],
  },
  {
    name: "Óleo Usado - Armazém",
    measurement: "Volume gerado mensalmente",
    unit: "Sede Principal", responsible: "Coordenação Administrativa", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [649.5, 583.2, 361.0, 356.9, 410.4, 601.6, N, N, N, N, N, N],
  },
  {
    name: "Óleo Usado - Armazém",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Rio de Janeiro", responsible: "Administrativo", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 50,
    values: [44.18, 37.05, 47.93, 41.84, 73.89, 42.46, 44.78, 38.42, 44.20, 41.81, 38.59, 44.67],
  },
  {
    name: "Óleo Usado - Armazém",
    measurement: "Volume gerado mensalmente",
    unit: "Filial Belo Horizonte", responsible: "Coordenação Ambiental", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 50,
    values: [38.31, 40.64, 38.65, 49.99, 41.19, 36.00, 37.88, 49.93, 42.91, 45.56, 40.30, 45.40],
  },
  {
    name: "Óleo Usado - Cross-docking",
    measurement: "Volume gerado mensalmente",
    unit: "Sede Principal", responsible: "Administrativo", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [483.9, 626.0, 365.4, 439.2, 453.9, 425.2, 360.1, 372.8, 473.3, 615.5, 579.1, 534.3],
  },

  // ── A3: Opacidade ─────────────────────────────────────────────────────────
  {
    name: "Monitoramento da Opacidade das Frotas Ativas",
    measurement: "Escala Ringelmann/Despoluir",
    unit: "Corporativo", responsible: "Equipe SGI", measureUnit: "%", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "A3", goal: 10,
    values: [8.62, 8.87, 13.60, 9.91, 7.08, 8.29, 9.16, N, N, N, N, N],
  },

  // ── GHG: Emissões de GEE ──────────────────────────────────────────────────
  {
    name: "Emissão de tCO2 da Combustão Móvel",
    measurement: "Emissão gerada de CO2 pelas frotas",
    unit: "Corporativo", responsible: "Equipe SGI", measureUnit: "tCO2e", direction: "down", periodicity: "semiannual",
    objectiveKey: "GHG", goal: 9218.20,
    values: [N, N, N, N, N, N, 12068, N, N, N, N, N],
  },
  {
    name: "Emissão de tCO2 da Energia Elétrica",
    measurement: "Emissão gerada de CO2 pela energia elétrica de todas filiais",
    unit: "Corporativo", responsible: "Equipe SGI", measureUnit: "tCO2e", direction: "down", periodicity: "semiannual",
    objectiveKey: "GHG", goal: 4.98,
    values: [N, N, N, N, N, N, 4.40, N, N, N, N, N],
  },

  // ── S2: Segurança Viária ──────────────────────────────────────────────────
  {
    name: "Idade média dos veículos de carga",
    measurement: "Soma das idades dos veículos de carga / quantidade de veículos de carga ativos",
    unit: "Corporativo", responsible: "Frota", measureUnit: "Anos", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 4.50,
    values: [4.14, 4.43, 4.49, 3.19, 4.28, 4.23, 3.20, 3.89, 3.43, N, N, N],
  },
  {
    name: "Acidentes de trânsito - Leve",
    measurement: "(Número do acidentes de Trâsito Leve x 100) / (número de funcionários ativos no cadastro da Sede no mês).",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 0,
    values: [0.00, 0.13, 0.00, 0.06, 0.00, 0.00, 0.00, 0.00, 0.31, N, N, N],
  },
  {
    name: "Acidentes de trânsito - Moderado",
    measurement: "(Número do acidentes de Trâsito moderado x 100) / (número de funcionários ativos no cadastro da Sede no mês).",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 0,
    values: [0.00, 0.00, 0.00, 0.00, 0.00, 0.29, 0.00, 0.00, 0.00, N, N, N],
  },
  {
    name: "Acidentes de trânsito - Grave",
    measurement: "(Número do acidentes de Trâsito Grave x 100) / (número de funcionários ativos no cadastro da Sede no mês).",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 0,
    values: [0.00, 0.00, 0.31, 0.40, 0.34, 0.22, 0.00, 0.00, 0.00, N, N, N],
  },
  {
    name: "Afastamento por acidentes de transito - motorista",
    measurement: "(Quantidade de motoristas afastados / quantidade total de motoristas) x 100",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 2,
    values: [1.60, 1.76, 1.94, 1.90, 1.67, 1.85, 1.83, 1.49, 2.93, N, N, N],
  },
  {
    name: "Vitimas acidentes de trânsito",
    measurement: "Quantidade de vitimas em acidente de trânsito / viagens efetuadas",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 0,
    values: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, N, N, N],
  },
  {
    name: "Taxa de Sinistros por Viagem",
    measurement: "Percentual = Viagens com excesso no mês/Total de Viagens no mês",
    unit: "Corporativo", responsible: "Sinistros", measureUnit: "%", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "S2", goal: 1,
    values: [0.95, 1.00, 0.95, 0.75, 0.93, 0.94, 0.94, 0.79, 0.81, N, N, N],
  },
  {
    name: "Percentual de Viagens com Excesso de Velocidade",
    measurement: "Nº de viagens com excesso de velocidade /Nº total de viagens ×100",
    unit: "Corporativo", responsible: "Sinistros", measureUnit: "%", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "S2", goal: 0.20,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── A2: Simulações da brigada ─────────────────────────────────────────────
  {
    name: "Simulações da brigada de emergência - Geral",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "Unidade", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: 1,
    values: [1, 1, 1, 1, 1, 1, 1, 1, 1, N, N, N],
  },
  {
    name: "Simulações da brigada de emergência - Sede Principal",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Sede Principal", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Simulações da brigada de emergência - Filial Rio de Janeiro",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Filial Rio de Janeiro", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, 3.57, 4.81, 5.26, 5.42, 4.42, 4.51, 5.74, 4.16, N, N, N],
  },
  {
    name: "Simulações da brigada de emergência - Sede Principal - Armazém",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Sede Principal", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Simulações da brigada de emergência - Filial Rio de Janeiro - Armazém",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Filial Rio de Janeiro", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, 6.31, 3.88, 3.92, 3.61, 4.53, 6.12, 5.18, 4.72, 3.53, 5.58, 5.14],
  },
  {
    name: "Simulações da brigada de emergência - Filial Belo Horizonte",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Filial Belo Horizonte", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [3.95, 4.10, 5.96, 3.79, 6.05, 4.09, 3.83, 5.05, 5.14, 3.94, 3.79, 5.89],
  },
  {
    name: "Simulações da brigada de emergência - Filial Belo Horizonte - Armazém",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Filial Belo Horizonte", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: 1,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── A2: Tempo de resposta ─────────────────────────────────────────────────
  {
    name: "Tempo de resposta a emergências - Geral",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: 5,
    values: [4.07, 4.34, 3.51, 4.00, 3.65, 4.61, 5.00, 4.07, 4.01, N, N, N],
  },
  {
    name: "Tempo de resposta a emergências - Sede Principal",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Sede Principal", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Tempo de resposta a emergências - Filial Rio de Janeiro",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Filial Rio de Janeiro", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: 3,
    values: [3, 3, 3, 3, 3, 3, 3, 3, N, N, N, N],
  },
  {
    name: "Tempo de resposta a emergências - Sede Principal - Armazém",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Sede Principal", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Tempo de resposta a emergências - Filial Rio de Janeiro - Armazém",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Filial Rio de Janeiro", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, 3, 2, 2, 3, 2, 3, 2, 2, 2, 1, 2],
  },
  {
    name: "Tempo de resposta a emergências - Filial Belo Horizonte",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Filial Belo Horizonte", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, 2, 2, 2, 2, 3, 2, 2, 3, 2, 2, 2],
  },
  {
    name: "Tempo de resposta a emergências - Filial Belo Horizonte - Armazém",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Filial Belo Horizonte", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── A1_DOC: Documentação ──────────────────────────────────────────────────
  {
    name: "Controlar a Documentação Legal e Ambiental de até 90% de todos os Fornecedores",
    measurement: "Contabilizar todos os fornecedores que estão ativos e com a documentação em ordem e verificar quantidade de fornecedores que não estão em dia. Realizar regra de 3. Objetivo 2: Adequação do processo de documentação de fornecedores.",
    unit: "Corporativo", responsible: "Compras Fornecedores", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "A1_DOC", goal: 10,
    values: [9.50, 7.35, 8.33, 8.39, 8.75, 8.39, 8.96, 9.87, 9.23, 7.02, N, N],
  },
];

// ─── Category / norm derivation ──────────────────────────────────────────────
// The prototype dashboard groups indicators by category and tags them with the
// ISO norm(s) they attend. We derive both from the indicator's objective + name.

function deriveCategory(ind: IndicatorSeed): string {
  const k = ind.objectiveKey;
  if (k === "A1" || k === "A3" || k === "GHG" || k === "A1_DOC" || k === "A2") {
    return "Ambiental";
  }
  if (k === "S2" || k === "S1_VIA") return "Seg. Viária";
  if (k === "Q1") return "Financeiro";
  const name = ind.name.toLowerCase();
  const resp = ind.responsible.toLowerCase();
  if (resp.includes("frota") || /combust|pneu|manuten|idade m/.test(name)) {
    return "Frota";
  }
  if (
    resp.includes("psicolog") ||
    resp.includes("recursos humanos") ||
    /treinamento|turnover|recrutamento/.test(name)
  ) {
    return "RH";
  }
  return "Qualidade";
}

function deriveNorms(category: string): string[] {
  if (category === "Ambiental") return ["14001"];
  if (category === "Seg. Viária") return ["9001", "39001"];
  return ["9001"];
}

// ─── Formula ─────────────────────────────────────────────────────────────────
// Parses the human "measurement" text into structured variables + a key-based
// expression, so the "Lançar" screen renders one field per real formula
// variable (not a generic numerador/denominador).

const ACCENT_MAP: Record<string, string> = {
  á: "a", à: "a", ã: "a", â: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", õ: "o", ô: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

function slugifyKey(label: string): string {
  let out = "";
  for (const ch of label.toLowerCase()) {
    if (ACCENT_MAP[ch]) out += ACCENT_MAP[ch];
    else if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) out += ch;
    else if (ch === " " || ch === "_" || ch === "-") out += "_";
  }
  out = out.replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!out) return "var";
  if (out[0] >= "0" && out[0] <= "9") out = `v_${out}`;
  return out;
}

const isNumericLiteral = (s: string): boolean => /^\d+([.,]\d+)?$/.test(s.trim());

function deriveFormula(measurement: string): {
  variables: { key: string; label: string }[];
  expression: string;
} {
  // Normalize multiplication aliases (× and the standalone word "x") to "*".
  const text = (measurement || "").replace(/×/g, " * ").replace(/\bx\b/gi, " * ");
  // Tokenize on the safe operators only — "-" stays inside words (e.g. "CT-e").
  const tokens: { type: "op" | "term"; value: string }[] = [];
  let buf = "";
  for (const ch of text) {
    if ("/*+()".includes(ch)) {
      if (buf.trim()) tokens.push({ type: "term", value: buf.trim() });
      buf = "";
      tokens.push({ type: "op", value: ch });
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) tokens.push({ type: "term", value: buf.trim() });

  const cleanTerm = (s: string) => s.replace(/\.+$/, "").trim();
  const variables: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (t.type !== "term" || isNumericLiteral(t.value)) continue;
    const label = cleanTerm(t.value);
    const key = slugifyKey(label);
    if (!seen.has(key)) {
      seen.add(key);
      variables.push({ key, label });
    }
  }

  // Descriptive measurement with no operators → a single direct-value variable.
  if (variables.length === 0) {
    const label = (measurement || "").trim() || "Valor apurado";
    return { variables: [{ key: "valor", label }], expression: "valor" };
  }

  const expression = tokens
    .map((t) => {
      if (t.type === "op") {
        return t.value === "(" || t.value === ")" ? t.value : ` ${t.value} `;
      }
      return isNumericLiteral(t.value)
        ? t.value.replace(",", ".")
        : slugifyKey(cleanTerm(t.value));
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return { variables, expression };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Resolve the target org — CLI arg (e.g. `seed-kpi 3`) or the first org.
  const orgArg = process.argv[2];
  let orgId: number;
  let orgName: string;
  if (orgArg) {
    const parsed = Number(orgArg);
    if (!Number.isInteger(parsed)) throw new Error(`Org id inválido: ${orgArg}`);
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, parsed));
    if (!org) throw new Error(`Organização ${parsed} não encontrada`);
    orgId = org.id;
    orgName = org.name;
  } else {
    const orgs = await db.select().from(organizationsTable).limit(1);
    if (orgs.length === 0) throw new Error("No organization found — run seed.ts first");
    orgId = orgs[0].id;
    orgName = orgs[0].name;
  }
  console.log(`Using org: ${orgName} (id=${orgId})`);

  // Códigos legados (ex. "9001") -> ids do catálogo de normas da org
  // (kpi_indicators.norms é number[] desde o Catálogo de Normas).
  const codeToId = await ensureOrgNormsAndMap(orgId);

  // 2. Upsert objectives (match by name to avoid duplicates)
  const existingObjectives = await db.select().from(kpiObjectivesTable)
    .where(eq(kpiObjectivesTable.organizationId, orgId));
  const existingObjectiveNames = new Set(existingObjectives.map((o) => o.name));
  const objectiveIdByKey = new Map<ObjKey, number>();

  // Populate from existing
  for (const obj of existingObjectives) {
    const def = OBJECTIVES.find((o) => o.name === obj.name);
    if (def) objectiveIdByKey.set(def.key, obj.id);
  }

  for (const def of OBJECTIVES) {
    if (existingObjectiveNames.has(def.name)) {
      console.log(`  ✓ Objective exists: ${def.name}`);
      continue;
    }
    const [created] = await db.insert(kpiObjectivesTable).values({
      organizationId: orgId,
      code: def.code ?? undefined,
      name: def.name,
    }).returning();
    objectiveIdByKey.set(def.key, created.id);
    console.log(`  + Objective created: ${def.name}`);
  }

  // 3. Create indicators + year configs + monthly values
  let created = 0, skipped = 0;

  for (const ind of INDICATORS) {
    // Check by name + unit (many "Consumo de água" share the same name, different unit)
    const existingInds = await db.select().from(kpiIndicatorsTable)
      .where(and(
        eq(kpiIndicatorsTable.organizationId, orgId),
        eq(kpiIndicatorsTable.name, ind.name),
      ));

    const existingInd = existingInds.find((e) => (e.unit ?? "") === ind.unit);

    const category = deriveCategory(ind);
    const norms = deriveNorms(category);

    const formula = deriveFormula(ind.measurement);

    let indicatorId: number;

    if (existingInd) {
      indicatorId = existingInd.id;
      // Backfill category + norms + formula onto indicators created before
      // these fields existed.
      await db.update(kpiIndicatorsTable)
        .set({
          category,
          norms: codesToNormIds(norms, codeToId),
          formulaVariables: formula.variables,
          formulaExpression: formula.expression,
        })
        .where(eq(kpiIndicatorsTable.id, existingInd.id));
      skipped++;
    } else {
      const [newInd] = await db.insert(kpiIndicatorsTable).values({
        organizationId: orgId,
        name: ind.name,
        measurement: ind.measurement,
        unit: ind.unit || undefined,
        responsible: ind.responsible || undefined,
        measureUnit: ind.measureUnit || undefined,
        direction: ind.direction,
        periodicity: ind.periodicity,
        category,
        norms: codesToNormIds(norms, codeToId),
        formulaVariables: formula.variables,
        formulaExpression: formula.expression,
      }).returning();
      indicatorId = newInd.id;
      created++;
    }

    const objectiveId = objectiveIdByKey.get(ind.objectiveKey) ?? null;

    const goalStr = ind.goal != null ? String(ind.goal) : null;

    // Upsert year config for historical year (YEAR)
    const [yc] = await db.insert(kpiYearConfigsTable).values({
      organizationId: orgId,
      indicatorId,
      objectiveId,
      year: YEAR,
      goal: goalStr,
    })
    .onConflictDoUpdate({
      target: [kpiYearConfigsTable.organizationId, kpiYearConfigsTable.indicatorId, kpiYearConfigsTable.year],
      set: { objectiveId, goal: goalStr },
    })
    .returning();

    // Also upsert year config for current year so the dashboard (which defaults
    // to the current year) renders populated data for the demo org.
    let currentYearConfigId: number | null = null;
    if (CURRENT_YEAR !== YEAR) {
      const [ycCurrent] = await db.insert(kpiYearConfigsTable).values({
        organizationId: orgId,
        indicatorId,
        objectiveId,
        year: CURRENT_YEAR,
        goal: goalStr,
      })
      .onConflictDoUpdate({
        target: [kpiYearConfigsTable.organizationId, kpiYearConfigsTable.indicatorId, kpiYearConfigsTable.year],
        set: { objectiveId, goal: goalStr },
      })
      .returning();
      currentYearConfigId = ycCurrent.id;
    }

    // Insert monthly values into every relevant year config.
    const monthValues = ind.values
      .map((v, i) => ({ month: i + 1, value: v }))
      .filter((mv) => mv.value !== null) as { month: number; value: number }[];

    if (monthValues.length > 0) {
      const targetConfigIds = [yc.id];
      if (currentYearConfigId !== null) targetConfigIds.push(currentYearConfigId);
      for (const configId of targetConfigIds) {
        await db.insert(kpiMonthlyValuesTable).values(
          monthValues.map((mv) => ({
            organizationId: orgId,
            yearConfigId: configId,
            month: mv.month,
            value: String(mv.value),
          }))
        ).onConflictDoNothing();
      }
    }
  }

  console.log(`\nDone! ${created} indicators created, ${skipped} already existed.`);
  console.log(`Year configs and monthly values for ${YEAR} upserted.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
