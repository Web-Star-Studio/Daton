/**
 * KPI migration — populates objectives, indicators, year configs and monthly values
 * for 2025 based on the provided Excel data.
 *
 * Idempotent: skips objectives/indicators that already exist (matched by name+unit).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts migrate-kpi <orgId>
 *
 * Example (prod org id=2):
 *   pnpm --filter @workspace/scripts migrate-kpi 2
 */
import {
  db,
  pool,
  kpiObjectivesTable,
  kpiIndicatorsTable,
  kpiYearConfigsTable,
  kpiMonthlyValuesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const rawOrgId = process.argv[2];
if (!rawOrgId || isNaN(Number(rawOrgId))) {
  console.error("Usage: migrate-kpi <orgId>");
  process.exit(1);
}
const ORG_ID = Number(rawOrgId);

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
    unit: "Porto Alegre", responsible: "Operacional 1", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 98.90,
    values: [99.51, 99.04, 99.64, 99.51, 99.42, 99.53, 99.69, 68.64, 99.85, 99.63, 99.69, 98.78],
  },
  {
    name: "Atendimento do Prazo de Entrega - Glovis",
    measurement: "(Total de atrasos / Total de CT-e, CRT, MIC-DTA emitidos) * 101",
    unit: "Piracicaba", responsible: "Analista SGI", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 99.99,
    values: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  },
  {
    name: "S.P.U - Geral",
    measurement: "Total de custos com avarias / quantidade de veículos embarcados",
    unit: "Corporativo", responsible: "Analista SGI", measureUnit: "R$", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "Q2", goal: 4.50,
    values: [7.89, 13.80, 9.74, 9.71, 5.68, 15.68, 9.64, 16.70, 2.95, 4.50, N, N],
  },
  {
    name: "S.P.U - Piracicaba",
    measurement: "Total de custos com avarias / quantidade de veículos embarcados",
    unit: "Piracicaba", responsible: "Analista SGI", measureUnit: "R$", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 5.60,
    values: [0.03, 1.79, 0.73, 0.07, 0.08, 0.12, 1.07, 0.13, 0.63, 1.74, 0.13, 0.04],
  },
  {
    name: "S.P.U - Piracicaba_Cliente",
    measurement: "Total de custos com avarias / quantidade de veículos embarcados",
    unit: "Piracicaba", responsible: "Analista SGI", measureUnit: "R$", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 5.60,
    values: [0.07, 0.25, 1.59, 0.14, 0.20, 0.30, N, N, N, N, N, N],
  },
  {
    name: "% de Avaria - Geral",
    measurement: "Número de veículos avariados /Total de veículos transportados",
    unit: "Corporativo", responsible: "Operacional 1", measureUnit: "%", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "Q2", goal: 0.60,
    values: [0.37, 0.31, 0.18, 0.24, 0.21, 0.28, 0.32, 0.30, 0.32, 0.09, 0.02, 0.00],
  },
  {
    name: "% de Avaria - Piracicaba",
    measurement: "Número de veículos avariados /Total de veículos transportados",
    unit: "Piracicaba", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 1.20,
    values: [0.37, 0.77, 0.14, 0.00, N, N, N, N, N, N, N, N],
  },
  {
    name: "% de Avaria - Piracicaba_Cliente",
    measurement: "Número de veículos avariados /Total de veículos transportados",
    unit: "Piracicaba", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 1.20,
    values: [0.01, 0.02, 0.02, 0.01, 0.02, 0.02, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02],
  },
  {
    name: "% de Avaria - Anápolis",
    measurement: "Número de veículos avariados /Total de veículos transportados",
    unit: "Anápolis", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [1.36, 1.17, 0.56, 0.98, 0.97, 1.69, 1.13, 0.83, 0.01, 0.52, 1.09, 1.08],
  },
  {
    name: "% de Avaria - Porto Real",
    measurement: "Número de veículos avariados /Total de veículos transportados",
    unit: "Porto Real", responsible: "Yuri dos Santos", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.070, 0.000, 0.015, 0.030, 0.010, 0.50, 0.64, 0.06, 1.00, 0.60, N, N],
  },
  {
    name: "% de Avaria - São Bernardo do Campo",
    measurement: "Número de veículos avariados /Total de veículos transportados",
    unit: "São Bernardo do Campo", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.008, 0.004, 0.000, 0.010, 0.090, 0.00, 0.03, 0.02, 0.02, 0.07, 0.08, 0.04],
  },
  {
    name: "% de Avaria - Duque de Caxias",
    measurement: "Número de veículos avariados /Total de veículos transportados * 100",
    unit: "Duque de Caxias", responsible: "Ingride Oliveira", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.00, 0.00, 0.00, 0.00, 0.00, 0.12, 0.10, 0.19, 0.20, 0.19, 0.00, 0.00],
  },
  {
    name: "% de Avaria - São José dos Pinhais",
    measurement: "Número de veículos avariados /Total de veículos transportados",
    unit: "São José dos Pinhais", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, N, N],
  },
  {
    name: "% de Avaria - Iracemápolis",
    measurement: "Número de veículos avariados /Total de veículos transportados",
    unit: "Iracemápolis", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
  },
  {
    name: "% de Avaria - Cariacica",
    measurement: "Número de veículos avariados /Total de veículos transportados",
    unit: "Cariacica", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.50,
    values: [0.46, 0.38, 0.05, 0.13, 0.19, 0.31, 0.11, 0.57, 0.30, 1.62, 0.34, 0.56],
  },
  {
    name: "% de Avaria - Carregamento_Piracicaba",
    measurement: "Nº de veículos avariados no carregamento / Nº de veículos carregados",
    unit: "Piracicaba", responsible: "Analista SGI", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.05,
    values: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
  },

  // ── Q2: Treinamentos ─────────────────────────────────────────────────────
  {
    name: "Horas de Treinamento Geral",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores",
    unit: "Corporativo", responsible: "Recursos Humanos", measureUnit: "Hrs", direction: "up", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 3.00,
    values: [6.42, 8.38, 5.30, 6.28, 6.45, 6.70, 7.20, 6.40, 7.15, 7.25, N, N],
  },
  {
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional Porto Alegre",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "Porto Alegre", responsible: "Recursos Humanos", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 2.00,
    values: [4.45, 3.15, 4.32, 2.20, 2.54, 2.77, 3.28, 2.35, 2.40, 3.16, 3.53, 1.80],
  },
  {
    // Time values from Excel converted to decimal hours
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional Piracicaba",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "Piracicaba", responsible: "Psicologia", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 2.00,
    values: [3.76, 7.73, 9.26, 7.50, 3.60, 8.10, 7.47, 6.94, 2.79, 7.47, 10.45, 8.90],
  },
  {
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional Anápolis",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "Anápolis", responsible: "Psicologia", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 2.00,
    values: [1.18, 6.15, 3.25, 2.14, 6.26, 2.05, 2.05, 2.07, 2.02, 5.21, 11.09, 6.37],
  },
  {
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional Porto Real",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "Porto Real", responsible: "Thais Brito", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: N,
    values: [N, 4.14, 0.00, 0.00, 3.75, 3.75, 3.75, 0.00, 0.00, 0.00, 1.07, N],
  },
  {
    name: "Horas de Treinamento - Colaborador Administrativo e Operacional São Bernardo C.",
    measurement: "somatório de horas de treinamento geral do mês / número de colaboradores adm.operacional",
    unit: "São Bernardo do Campo", responsible: "ADM", measureUnit: "Hrs", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 2.00,
    values: [120.00, 120.00, 0.00, 240.00, 120.00, 240.00, 0.00, 240.00, 120.00, N, N, N],
  },
  {
    name: "Horas de Treinamento - Colaborador Motorista",
    measurement: "(Somatório de horas de treinamentos dos motoristas do mês)/ número de colaboradores motoristas - Dados do Departamento Pessoal",
    unit: "Corporativo", responsible: "Psicologia", measureUnit: "Hrs", direction: "up", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 3.00,
    values: [9.13, 8.65, 6.07, 8.65, 6.00, 6.48, 6.90, 5.89, 7.82, 8.04, N, N],
  },

  // ── Q2: Eficácia recrutamento e Turnover ─────────────────────────────────
  {
    name: "Eficácia recrutamento e seleção - Geral",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "Corporativo", responsible: "Psicologia", measureUnit: "%", direction: "up", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 89.00,
    values: [92.56, 91.45, 91.04, 90.22, 90.81, 89.11, 91.51, 90.68, 92.20, 91.60, N, N],
  },
  {
    name: "Eficácia recrutamento e seleção - Piracicaba",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "Piracicaba", responsible: "Psicologia", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 89.00,
    values: [73.33, 80.00, 78.57, 84.62, 76.92, 78.57, 87.50, 81.82, 80.77, 96.66, N, N],
  },
  {
    name: "Eficácia recrutamento e seleção - Anápolis",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "Anápolis", responsible: "Psicologia", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 89.00,
    values: [90.91, 90.00, 90.91, 90.91, 100.00, 100.00, 87.50, 100.00, 83.33, 73.68, 77.27, 38.42],
  },
  {
    name: "Eficácia recrutamento e seleção - Porto Real",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "Porto Real", responsible: "Thais Brito", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 89.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Eficácia recrutamento e seleção - São Bernardo C.",
    measurement: "(soma de demitidos dos últimos três meses que foram admitidos nos últimos 3 meses X100) / soma de admitido dos últimos três meses (resultado diminuir de 100)",
    unit: "São Bernardo do Campo", responsible: "ADM", measureUnit: "%", direction: "up", periodicity: "monthly",
    objectiveKey: "Q2", goal: 89.00,
    values: [33.33, 50.00, 100.00, 100.00, 100.00, 100.00, 50.00, 100.00, 100.00, N, N, N],
  },
  {
    name: "Turnover - Geral",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Corporativo", responsible: "Psicologia", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 3.10,
    values: [3.04, 2.65, 1.87, 2.54, 2.70, 2.38, 3.12, 2.77, 2.64, 2.33, N, N],
  },
  {
    name: "Turnover - Porto Alegre",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Porto Alegre", responsible: "Psicologia", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [0.00, 0.00, 0.00, 1.52, 2.56, 1.58, 1.59, 0.00, 1.50, 2.33, 2.03, 3.73],
  },
  {
    name: "Turnover - Piracicaba",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Piracicaba", responsible: "Psicologia", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [1.13, 2.89, 2.29, 1.11, 1.66, 3.61, 3.57, 3.57, 0.95, 2.87, 2.43, 2.91],
  },
  {
    name: "Turnover - Anápolis",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Anápolis", responsible: "Psicologia", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [0.85, 5.04, 0.00, 4.24, 5.13, 1.71, 1.71, 6.07, 5.88, 5.04, 1.68, 3.73],
  },
  {
    name: "Turnover - Porto Real",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "Porto Real", responsible: "Thais Brito", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [0.00, 3.45, 0.00, 0.00, 0.00, 0.00, 0.06, 0.00, 0.00, 0.00, N, N],
  },
  {
    name: "Turnover - São Bernardo C.",
    measurement: "(Nº de Demissões / funcionário do mês anterior) x 100",
    unit: "São Bernardo do Campo", responsible: "ADM", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 3.10,
    values: [0.00, 10.00, 5.00, 11.11, 10.53, 0.00, 3.44, 11.11, 5.26, N, N, N],
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
    name: "Acuracidade de Estoque - Porto Alegre",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Porto Alegre", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque - Piracicaba",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Piracicaba", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque_EPI - Filial Piracicaba",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Piracicaba", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 88.00,
    values: [N, N, 100.00, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque - Anápolis",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Anápolis", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque - Porto Real",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "Porto Real", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 98.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Acuracidade de Estoque - São Bernardo C.",
    measurement: "Total de acertos x 100/ total de itens em estoque.",
    unit: "São Bernardo do Campo", responsible: "Almoxarife", measureUnit: "%", direction: "up", periodicity: "quarterly",
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
    name: "Diferença do estoque R$ - Porto Alegre",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Porto Alegre", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ - Piracicaba",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Piracicaba", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ _EPI - Piracicaba",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Piracicaba", responsible: "Segurança", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 80.00,
    values: [N, N, 0.00, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ - Anápolis",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Anápolis", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ - Porto Real",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "Porto Real", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Diferença do estoque R$ - São Bernardo C.",
    measurement: "Soma do valor unitário do material com diferença no período.",
    unit: "São Bernardo do Campo", responsible: "Almoxarife", measureUnit: "R$", direction: "down", periodicity: "quarterly",
    objectiveKey: "Q2", goal: 100.00,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── Q2: Taxa de Acidentes ────────────────────────────────────────────────
  {
    name: "Taxa de Acidentes de Trabalho - Geral",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Matriz no mês)",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "Q2", goal: 0.73,
    values: [0.58, 0.68, 0.54, 0.54, 0.95, 0.53, 0.26, 0.13, 0.53, N, N, N],
  },
  {
    name: "Taxa de Acidentes de Trabalho - Porto Alegre",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Matriz no mês)",
    unit: "Porto Alegre", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.73,
    values: [0.58, 0.68, 0.54, 0.54, 0.95, 0.53, 0.26, 0.13, N, N, N, N],
  },
  {
    name: "Taxa de Acidentes de Trabalho - Piracicaba",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Matriz no mês)",
    unit: "Piracicaba", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 1.25,
    values: [0.68, 0.07, 0.00, 0.69, 0.67, 1.36, 2.14, 0.71, 1.26, N, N, N],
  },
  {
    name: "Taxa de Acidentes de Trabalho - Anápolis",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Matriz no mês)",
    unit: "Anápolis", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.81,
    values: [1.19, 0.00, 0.60, 1.19, 0.59, 1.20, 0.59, 0.60, 1.78, 1.78, 0.00, 0.00],
  },
  {
    name: "Taxa de Acidentes de Trabalho - Porto Real",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Matriz no mês)",
    unit: "Porto Real", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
    objectiveKey: "Q2", goal: 0.81,
    values: [0.00, 0.00, 0.00, 0.00, 0.00, N, N, N, N, N, N, N],
  },
  {
    name: "Taxa de Acidentes de Trabalho - São Bernardo C.",
    measurement: "(Número do acidentes do trabalho x 100) / (número de funcionários ativos no cadastro da Matriz no mês)",
    unit: "São Bernardo do Campo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly",
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
    measurement: "Total de Km rodado (por caminhão) / Total de litros abastecidos = média diesel. Total da soma de todas médias diesel (exceto linha DTA Vitória-Anápolis) / Total de caminhões (médias apuradas).",
    unit: "Corporativo", responsible: "Frota", measureUnit: "Km/L", direction: "up", periodicity: "monthly_45d",
    objectiveKey: "Q2", goal: 2.80,
    values: [2.82, 2.83, 2.84, 2.84, 2.85, 2.85, 2.84, 2.84, 2.84, 2.84, 2.84, 2.84],
  },
  {
    name: "Custo de Pneus",
    measurement: "Custo total de pneus mensal (Não incluído custo de pneu novo sem aplicação) x 1000 km rodados por pneu no mês. km rodada por pneu mensal = Multiplicação da quantidade de km rodada geral das frotas por 14 (quantidade média de pneus em uma frota).",
    unit: "Corporativo", responsible: "Frota", measureUnit: "R$/1000 Km", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "Q2", goal: 3.80,
    values: [3.20, 3.00, 3.30, 3.30, 3.20, 3.20, 3.20, 3.00, N, N, N, N],
  },
  {
    name: "Pesquisa de Satisfação de Clientes - Reunião de Análise Crítica",
    measurement: "Buscar a melhoria continua dos processos",
    unit: "Corporativo", responsible: "Analista SGI", measureUnit: "", direction: "up", periodicity: "annual",
    objectiveKey: "Q2", goal: 80.00,
    values: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, N, N],
  },

  // ── Q1: Financeiro ───────────────────────────────────────────────────────
  {
    name: "Custos Fixos",
    measurement: "Custos fixos /Faturamento Bruto * 100",
    unit: "Corporativo", responsible: "Financeiro - POA", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "Q1", goal: 25.00,
    values: [19.01, 18.62, 18.63, 18.50, 18.45, 18.00, 17.90, 17.80, N, N, N, N],
  },
  {
    name: "Custos Variáveis",
    measurement: "Custos variáveis / Faturamento Bruto * 100",
    unit: "Corporativo", responsible: "Financeiro - POA", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "Q1", goal: 73.10,
    values: [73.63, 73.57, 73.49, 73.50, 73.43, 73.36, 73.31, 73.25, N, N, N, N],
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
    unit: "Porto Alegre", responsible: "Tec. Meio Ambiente", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 5.50,
    values: [4.97, 2.68, 2.55, 2.14, 1.71, 1.89, 1.74, 1.72, 1.45, 1.57, N, N],
  },
  {
    name: "Consumo de água",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Piracicaba", responsible: "Aux. SGI", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 5.50,
    values: [5.56, 3.09, 3.93, 2.39, 2.28, 1.30, 1.33, 1.45, 1.67, 1.77, 1.18, 1.35],
  },
  {
    name: "Consumo de água",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Anápolis", responsible: "Aux. SGI", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2.00,
    values: [0.87, 1.71, 1.07, 1.61, 1.52, 4.23, 1.87, 413.00, 468.00, 1.47, 1.67, 1.51],
  },
  {
    name: "Consumo de água",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Porto Real", responsible: "Thais Brito", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 1.07,
    values: [1.13, 0.94, 0.93, 0.82, 0.90, 1.08, 1.07, 1.12, 1.07, 1.17, N, N],
  },
  {
    name: "Consumo de água",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "São Bernardo do Campo", responsible: "ADM", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 0.327,
    values: [0.395, 0.345, 0.377, 0.552, 0.278, 0.40, 0.33, 0.36, 0.41, 0.36, 0.47, 0.35],
  },
  {
    name: "Consumo de água",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "Duque de Caxias", responsible: "Juliana Lobão", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 3.30,
    values: [0.097, 0.104, 0.102, 0.108, 0.101, 0.141, 0.116, 0.142, 0.123, 0.14, 0.18, 0.16],
  },
  {
    name: "Consumo de água",
    measurement: "Consumo total de água M³ no mês / Média funcionários mês /dias do mês*100",
    unit: "São José dos Pinhais", responsible: "ADM", measureUnit: "M3", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [70.00, 63.00, 73.00, 98.00, 133.00, 85.00, 50.00, 65.00, 45.00, 57.00, 61.00, 67.00],
  },

  // ── A1: Consumo de energia elétrica ──────────────────────────────────────
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Porto Alegre", responsible: "Tec. Meio Ambiente", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [67.98, 12.31, 90.09, 94.06, 97.61, 142.01, 120.90, 92.79, 75.19, 66.82, N, N],
  },
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Piracicaba", responsible: "Aux. SGI", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 39.27,
    values: [82.46, 50.50, 53.34, 41.18, 30.29, 35.16, 75.76, 73.49, 67.28, 66.78, 53.29, 43.49],
  },
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Anápolis", responsible: "Aux. SGI", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 83.00,
    values: [57.96, 73.82, 58.41, 56.89, 55.38, 75.70, 56.18, 85.52, 63.93, 68.90, 114.90, 66.54],
  },
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Porto Real", responsible: "Thais Brito", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [34.05, 27.55, 28.56, 22.82, 26.66, 28.94, 32.17, 37.76, 33.96, 39.79, N, N],
  },
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "São Bernardo do Campo", responsible: "ADM", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 13.18,
    values: [14.62, 21.47, 23.37, 28.16, 21.64, 24.82, 21.04, 25.11, 23.02, 22.33, 27.98, 20.92],
  },
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "Duque de Caxias", responsible: "Juliana Lobão", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 6.43,
    values: [3.89, 6.21, 8.55, 5.18, 3.62, 6.19, 4.16, 1.70, 2.94, 2.96, 3.64, 5.68],
  },
  {
    name: "Consumo de energia elétrica",
    measurement: "Consumo total de Energia no mês / Média funcionários mês /dias do mês*100",
    unit: "São José dos Pinhais", responsible: "ADM", measureUnit: "KW", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [1679, 2032, 2269, 1892, 1632, 1605, 1877, 1783, 1923, 2016, 1697, 1829],
  },

  // ── A1: Material Reciclável ───────────────────────────────────────────────
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Porto Alegre", responsible: "Tec. Meio Ambiente", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [15798, 645, 3835, 32016, 10840, 7030, 14055, 459, 5285, 20832, N, N],
  },
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Piracicaba", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 1940,
    values: [5850, 590, 480, 850, 860, 510, 550, 1010, 940, 1010, 4700, 4109],
  },
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Anápolis", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 1500,
    values: [769.30, 2410, 0, 3154.25, 0, 4239.80, 1440.60, 2126.60, 4160, 0, 0, 0],
  },
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Porto Real", responsible: "Thais Brito", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [131.60, 54.30, 63, 150.90, 133.10, 123.98, 63.43, 60.94, 25.90, 56.55, N, N],
  },
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "São Bernardo do Campo", responsible: "ADM", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 20,
    values: [43.56, 0, 0, 79.18, 62.30, 41, 77, 0, 0, 0, 75.80, 0],
  },
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "Duque de Caxias", responsible: "Juliana Lobão", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 50,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 6.88, 4.72, 3.96],
  },
  {
    name: "Material Reciclável",
    measurement: "Valor mensal gerado do Reciclável (Plástico, Papel/Papelão, Vidro e Metal)",
    unit: "São José dos Pinhais", responsible: "ADM", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [19900, 19750, 17800, 22900, 21750, 21700, 22500, 21700, 21300, 19700, 9500, 17750],
  },

  // ── A1: Material contaminado ──────────────────────────────────────────────
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "Porto Alegre", responsible: "Tec. Meio Ambiente", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2667.06,
    values: [12590, 10050, 5750, 14805, 5.52, 1460, 3320, 11640, 1230, 1240, N, N],
  },
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "Piracicaba", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2000,
    values: [1290, 1464, 1390, 2820, 2820, 1618, 1789, 1590, 1716, 1256, 1751, 2064],
  },
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "Anápolis", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 1500,
    values: [1278, 977, 1898.50, 1385, 1385, 1385, 1385, 0, 0, 0, 0, 0],
  },
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "Porto Real", responsible: "Thais Brito", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, N, N],
  },
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "São Bernardo do Campo", responsible: "ADM", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 0,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "Duque de Caxias", responsible: "Juliana Lobão", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 10,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: "Material contaminado",
    measurement: "Volume gerado mensalmente",
    unit: "São José dos Pinhais", responsible: "ADM", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },

  // ── A1: Orgânico ──────────────────────────────────────────────────────────
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "Porto Alegre", responsible: "Tec. Meio Ambiente", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [600, 570, 1060, 690, 1150, 640, 1050, 720, 530, 720, N, N],
  },
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "Piracicaba", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 800,
    values: [1170, 2750, 1420, 550, 630, 610, 690, 630, 2015, 640, 940, 1370],
  },
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "Anápolis", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 400,
    values: [380, 330, 360, 340, 340, 340, 340, 530, 700, 500, 550, 740],
  },
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "Porto Real", responsible: "Thais Brito", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [335.97, 166.04, 113.40, 166.99, 215.11, 183.55, 176.15, 152.48, 171.05, 263.17, N, N],
  },
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "São Bernardo do Campo", responsible: "ADM", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 64.35,
    values: [60.18, 73.36, 69.62, 108.56, 92.72, 88.58, 163.54, 104.96, 139.53, 163.93, 112.37, 163.49],
  },
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "Duque de Caxias", responsible: "Juliana Lobão", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 50,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 16.64, 19.65, 19.72],
  },
  {
    name: "Orgânico",
    measurement: "Volume gerado mensalmente",
    unit: "São José dos Pinhais", responsible: "ADM", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [22450, 25650, 22900, 20000, 25500, 26900, 23100, 25250, 25950, 26900, 17200, 15500],
  },

  // ── A1: Óleo Usado ────────────────────────────────────────────────────────
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "Porto Alegre", responsible: "Tec. Meio Ambiente", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [1100, 0, 1450, 1600, 1500, 0, 1700, 1600, 0, 1900, N, N],
  },
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "Piracicaba", responsible: "Aux. SGI", measureUnit: "l", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2000,
    values: [1250, 0, 1424, 979, 1600, 1300, 1200, 1609, 2480, 1650, 2500, 2700],
  },
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "Anápolis", responsible: "Aux. SGI", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 2223,
    values: [2400, 2800, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "Porto Real", responsible: "Thais Brito", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [0, 0, 0, 0, 0, 580, N, N, N, N, N, N],
  },
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "São Bernardo do Campo", responsible: "ADM", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 50,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "Duque de Caxias", responsible: "Juliana Lobão", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: 50,
    values: [0, 0, 200, 0, 0, 0, 0, 0, 0, 230, 0, 0],
  },
  {
    name: "Óleo Usado",
    measurement: "Volume gerado mensalmente",
    unit: "São José dos Pinhais", responsible: "ADM", measureUnit: "KG", direction: "down", periodicity: "monthly",
    objectiveKey: "A1", goal: N,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },

  // ── A3: Opacidade ─────────────────────────────────────────────────────────
  {
    name: "Monitoramento da Opacidade das Frotas Ativas",
    measurement: "Escala Ringelmann/Despoluir",
    unit: "Corporativo", responsible: "Equipe SGI", measureUnit: "%", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "A3", goal: 10,
    values: [5, 7, 3, 8, 10, 12, 10, N, N, N, N, N],
  },

  // ── GHG: Emissões de GEE ──────────────────────────────────────────────────
  {
    name: "Emissão de tCO2 da Combustão Móvel",
    measurement: "Emissão gerada de CO2 pelas frotas",
    unit: "Corporativo", responsible: "Equipe SGI", measureUnit: "tCO2e", direction: "down", periodicity: "semiannual",
    objectiveKey: "GHG", goal: 9218.20,
    values: [N, N, N, N, N, N, 4735.10, N, N, N, N, N],
  },
  {
    name: "Emissão de tCO2 da Energia Elétrica",
    measurement: "Emissão gerada de CO2 pela energia elétrica de todas filiais",
    unit: "Corporativo", responsible: "Equipe SGI", measureUnit: "tCO2e", direction: "down", periodicity: "semiannual",
    objectiveKey: "GHG", goal: 4.98,
    values: [N, N, N, N, N, N, 1.62, N, N, N, N, N],
  },

  // ── S2: Segurança Viária ──────────────────────────────────────────────────
  {
    name: "Idade média dos veículos de carga",
    measurement: "Soma das idades dos veículos de carga / quantidade de veículos de carga ativos",
    unit: "Corporativo", responsible: "Frota", measureUnit: "Anos", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 4.50,
    values: [3.70, 3.60, 3.60, 3.60, 3.40, 3.30, 3.20, 3.10, 3.00, N, N, N],
  },
  {
    name: "Acidentes de trânsito - Leve",
    measurement: "(Número do acidentes de Trâsito Leve x 100) / (número de funcionários ativos no cadastro da Matriz no mês).",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 0,
    values: [0, 0, 0, 0.18, 0, 0, 0, 0.35, 0.34, N, N, N],
  },
  {
    name: "Acidentes de trânsito - Moderado",
    measurement: "(Número do acidentes de Trâsito moderado x 100) / (número de funcionários ativos no cadastro da Matriz no mês).",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 0,
    values: [0, 0.18, 0, 0, 0, 0, 0, 0, 0, N, N, N],
  },
  {
    name: "Acidentes de trânsito - Grave",
    measurement: "(Número do acidentes de Trâsito Grave x 100) / (número de funcionários ativos no cadastro da Matriz no mês).",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 0,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, N, N, N],
  },
  {
    name: "Afastamento por acidentes de transito - motorista",
    measurement: "(Quantidade de motoristas afastados / quantidade total de motoristas) x 100",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 2,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, N, N, N],
  },
  {
    name: "Vitimas acidentes de trânsito",
    measurement: "Quantidade de vitimas em acidente de trânsito / viagens efetuadas",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "S2", goal: 0,
    values: [0, 0, 0, 0, 0, 0.10, 0, 0, 0, N, N, N],
  },
  {
    name: "Taxa de Sinistros por Viagem",
    measurement: "Percentual = Viagens com excesso no mês/Total de Viagens no mês",
    unit: "Corporativo", responsible: "Sinistros", measureUnit: "%", direction: "down", periodicity: "monthly_45d",
    objectiveKey: "S2", goal: 1,
    values: [6.03, 1.58, 1.48, 1.02, 1.02, 4.83, 1.18, 0.91, 0.58, N, N, N],
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
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, N, N, N],
  },
  {
    name: "Simulações da brigada de emergência - Porto Alegre",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Porto Alegre", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Simulações da brigada de emergência - Piracicaba",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Piracicaba", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, 0, 0, 0, 0, 0, 0, 0, 0, N, N, N],
  },
  {
    name: "Simulações da brigada de emergência - Porto Real",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Porto Real", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Simulações da brigada de emergência - São Bernardo do Campo",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "São Bernardo do Campo", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: "Simulações da brigada de emergência - Anápolis",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Anápolis", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.10],
  },
  {
    name: "Simulações da brigada de emergência - Duque de Caxias",
    measurement: "Somatório de todos os eventos simulados no período.",
    unit: "Duque de Caxias", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: 1,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── A2: Tempo de resposta ─────────────────────────────────────────────────
  {
    name: "Tempo de resposta a emergências - Geral",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Corporativo", responsible: "Segurança", measureUnit: "Minutos/Segundos", direction: "down", periodicity: "annual",
    objectiveKey: "A2", goal: 5,
    values: [0, 0, 0, 0, 0, 0, 0, 0, 0, N, N, N],
  },
  {
    name: "Tempo de resposta a emergências - Porto Alegre",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Porto Alegre", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Tempo de resposta a emergências - Piracicaba",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Piracicaba", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: 3,
    values: [0, 0, 0, 0, 0, 0, 0, 0, N, N, N, N],
  },
  {
    name: "Tempo de resposta a emergências - Porto Real",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Porto Real", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },
  {
    name: "Tempo de resposta a emergências - São Bernardo do Campo",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "São Bernardo do Campo", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: "Tempo de resposta a emergências - Anápolis",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Anápolis", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.10],
  },
  {
    name: "Tempo de resposta a emergências - Duque de Caxias",
    measurement: "(Qtd de simulações realizadas no prazo/ qtd. Simulações previstas) x 100",
    unit: "Duque de Caxias", responsible: "Segurança", measureUnit: "Unidade", direction: "up", periodicity: "annual",
    objectiveKey: "A2", goal: N,
    values: [N, N, N, N, N, N, N, N, N, N, N, N],
  },

  // ── A1_DOC: Documentação ──────────────────────────────────────────────────
  {
    name: "Controlar a Documentação Legal e Ambiental de até 90% de todos os Fornecedores",
    measurement: "Contabilizar todos os fornecedores que estão ativos e com a documentação em ordem e verificar quantidade de fornecedores que não estão em dia. Realizar regra de 3. Objetivo 2: Adequação do processo de documentação de fornecedores.",
    unit: "Corporativo", responsible: "Compras Fornecedores", measureUnit: "%", direction: "down", periodicity: "monthly_15d",
    objectiveKey: "A1_DOC", goal: 10,
    values: [9.61, 10.21, 11.96, 6.16, 8.16, 9.31, 12.12, 10.02, 9.80, 9.93, N, N],
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const orgId = ORG_ID;
  console.log(`Using org id=${orgId}`);

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

    let indicatorId: number;

    if (existingInd) {
      indicatorId = existingInd.id;
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

    // Also upsert year config for current year so the edit form shows meta/objetivo
    if (CURRENT_YEAR !== YEAR) {
      await db.insert(kpiYearConfigsTable).values({
        organizationId: orgId,
        indicatorId,
        objectiveId,
        year: CURRENT_YEAR,
        goal: goalStr,
      })
      .onConflictDoUpdate({
        target: [kpiYearConfigsTable.organizationId, kpiYearConfigsTable.indicatorId, kpiYearConfigsTable.year],
        set: { objectiveId, goal: goalStr },
      });
    }

    // Insert monthly values
    const monthValues = ind.values
      .map((v, i) => ({ month: i + 1, value: v }))
      .filter((mv) => mv.value !== null) as { month: number; value: number }[];

    if (monthValues.length > 0) {
      await db.insert(kpiMonthlyValuesTable).values(
        monthValues.map((mv) => ({
          organizationId: orgId,
          yearConfigId: yc.id,
          month: mv.month,
          value: String(mv.value),
        }))
      ).onConflictDoNothing();
    }
  }

  console.log(`\nDone! ${created} indicators created, ${skipped} already existed.`);
  console.log(`Year configs and monthly values for ${YEAR} upserted.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
