/**
 * Gera o modelo de planilha padrão para o import de Governança.
 *
 * O layout das células espelha exatamente o que `governance-import.ts` lê —
 * o import é baseado em posições fixas, então o modelo precisa replicá-las.
 * Saída: artifacts/web/public/templates/modelo-planejamento-governanca.xlsx
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const XLSX = require(
  "/home/jp/daton/Daton/node_modules/.pnpm/xlsx@0.18.5/node_modules/xlsx",
);

/** Constrói uma worksheet a partir de um mapa célula→texto. */
function sheet(cells: Record<string, string>, lastRef: string) {
  const ws: Record<string, unknown> = { "!ref": `A1:${lastRef}` };
  for (const [ref, val] of Object.entries(cells)) {
    ws[ref] = { t: "s", v: val };
  }
  return ws;
}

const wb = XLSX.utils.book_new();
const add = (name: string, ws: unknown) =>
  XLSX.utils.book_append_sheet(wb, ws, name);

// ─── Instruções ──────────────────────────────────────────────────────────────
add(
  "Instruções",
  sheet(
    {
      A1: "MODELO — Planejamento Estratégico / Governança",
      A3: "Como preencher:",
      A4: "• Preencha apenas as células indicadas em cada aba.",
      A5: "• NÃO renomeie, mova, adicione ou remova abas.",
      A6: "• NÃO insira nem remova linhas — o sistema lê posições fixas.",
      A7: "• Nas abas de lista (SWOT, Partes Interessadas, Histórico), preencha",
      A8: "  uma linha por item, a partir da linha indicada no cabeçalho.",
      A10: "Abas do modelo:",
      A11: "CAPA — título do planejamento",
      A12: "A0) Metodologia — observações de metodologia",
      A13: "Histórico de Revisões — uma linha por revisão",
      A14: "A) SWOT — fatores SWOT do sistema de gestão",
      A15: "A2) SWOT Ambiental — fatores SWOT ambientais",
      A16: "B) Direcionamento Estratégico — resumo executivo",
      A17: "B) Partes Interessadas — partes interessadas",
      A18: "C) Escopo, Política e Objetivos — escopo, política, missão, objetivos",
      A19: "D) Indicadores e Objetivos — notas dos objetivos",
    },
    "A20",
  ),
);

// ─── CAPA — título em B13 ────────────────────────────────────────────────────
add(
  "CAPA",
  sheet(
    {
      A1: "CAPA — Identificação do Planejamento",
      A13: "Título do Planejamento → preencha em B13:",
    },
    "B13",
  ),
);

// ─── A0) Metodologia — observações na linha 19 (B:E) ─────────────────────────
add(
  "A0) Metodologia",
  sheet(
    {
      A1: "A0) Metodologia",
      A19: "Metodologia / observações → preencha de B19 a E19:",
    },
    "E19",
  ),
);

// ─── Histórico de Revisões — lista a partir da linha 3 ───────────────────────
add(
  "Histórico de Revisões",
  sheet(
    {
      A1: "Histórico de Revisões — uma linha por revisão, a partir da linha 3",
      B2: "Data",
      C2: "Motivo",
      D2: "Item Alterado",
      E2: "Revisão",
      F2: "Alterado por",
    },
    "F80",
  ),
);

// ─── A) SWOT — lista a partir da linha 3 ─────────────────────────────────────
add(
  "A) SWOT",
  sheet(
    {
      A1: "A) SWOT — uma linha por fator, a partir da linha 3",
      C2: "Descrição",
      E2: "Tipo (Força / Fraqueza / Oportunidade / Ameaça)",
      F2: "Ambiente (Interno / Externo)",
      G2: "Domínio (Qualidade / Ambiental / Seg. Viária / ESG / Governança)",
      H2: "Desempenho",
      I2: "Relevância",
      J2: "Resultado",
      K2: "Decisão de Tratamento",
      M2: "Objetivo (alternativo)",
      N2: "Ref. Ação",
      O2: "Cód. Objetivo",
      P2: "Objetivo",
    },
    "P200",
  ),
);

// ─── A2) SWOT Ambiental — seções por tipo, itens nas linhas entre elas ───────
add(
  "A2) SWOT Ambiental",
  sheet(
    {
      A1: "A2) SWOT Ambiental — preencha uma linha por item dentro de cada seção",
      B2: "Descrição",
      E2: "Resultado",
      F2: "Objetivo",
      G2: "Correlação",
      H2: "Ref. Ação",
      B3: "Forças",
      B16: "Fraquezas",
      B29: "Oportunidades",
      B42: "Ameaças",
    },
    "H160",
  ),
);

// ─── B) Direcionamento Estratégico — resumo/conclusão na linha 65 ────────────
add(
  "B) Direcionamento Estratégico",
  sheet(
    {
      A1: "B) Direcionamento Estratégico",
      A2: "Preencha o resumo executivo (B65) e a conclusão (N65) — role até a linha 65.",
      A65: "Resumo Executivo → B65:",
      M65: "Conclusão Estratégica → N65:",
    },
    "N65",
  ),
);

// ─── B) Partes Interessadas — lista a partir da linha 3 ──────────────────────
add(
  "B) Partes Interessadas",
  sheet(
    {
      A1: "B) Partes Interessadas — uma linha por parte, a partir da linha 3",
      C2: "Nome",
      D2: "Requisitos Esperados",
      E2: "Função na Empresa",
      F2: "Resumo do Papel",
      G2: "Relevante ao Sistema de Gestão (Sim / Não)",
      H2: "Requisito Legal Aplicável (Sim / Não)",
      I2: "Método de Monitoramento",
    },
    "I120",
  ),
);

// ─── C) Escopo, Política e Objetivos — células fixas ─────────────────────────
add(
  "C) Escopo, Política e Objetivos",
  sheet(
    {
      A1: "C) Escopo, Política e Objetivos",
      A4: "Escopo Técnico → B4:",
      A6: "Escopo Geográfico → B6:",
      A12: "Política → B12:",
      A15: "Objetivos — uma linha de 16 a 22:",
      B15: "Domínio do Sistema",
      D15: "Objetivo (formato: A1) Descrição do objetivo)",
      A25: "Missão → B25:",
      A27: "Visão → B27:",
      A29: "Valores → B29:",
    },
    "D29",
  ),
);

// ─── D) Indicadores e Objetivos — notas nas linhas 7,13,19,25,31 ─────────────
add(
  "D) Indicadores e Objetivos",
  sheet(
    {
      A1: "D) Indicadores e Objetivos — código na coluna A, descrição na coluna C",
      A6: "Objetivo 1 → linha 7",
      A12: "Objetivo 2 → linha 13",
      A18: "Objetivo 3 → linha 19",
      A24: "Objetivo 4 → linha 25",
      A30: "Objetivo 5 → linha 31",
    },
    "C31",
  ),
);

const outDir = "/home/jp/daton/Daton/artifacts/web/public/templates";
mkdirSync(outDir, { recursive: true });
const outPath = `${outDir}/modelo-planejamento-governanca.xlsx`;
XLSX.writeFile(wb, outPath);
console.log(`✓ Modelo gerado: ${outPath}`);
console.log(`  Abas: ${wb.SheetNames.join(" · ")}`);
void dirname;
