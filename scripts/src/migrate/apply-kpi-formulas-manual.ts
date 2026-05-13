/**
 * Apply hand-crafted KPI formula mappings to prod.
 *
 * - Idempotent: only updates rows where formula_variables is still empty
 * - Validates each mapping (parens balanced, all tokens in vars list) before applying
 * - Does NOT touch the original `measurement` field — leaves the human-readable text intact
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx --env-file /abs/path/.env \
 *     /abs/path/scripts/src/migrate/apply-kpi-formulas-manual.ts [--dry-run]
 */
import { db, kpiIndicatorsTable, pool } from "@workspace/db";
import { inArray } from "drizzle-orm";

const dryRun = process.argv.includes("--dry-run");

type Mapping = {
  ids: number[];
  variables: { key: string; label: string }[];
  expression: string;
  note?: string;
};

const PLAN: Mapping[] = [
  // ─── Category A: heuristic accepted (cleaned labels/keys) ───
  {
    ids: [1],
    variables: [
      { key: "total_atrasos", label: "Total de atrasos" },
      { key: "total_ctes", label: "Total de CT-e, CRT, MIC-DTA emitidos" },
    ],
    expression: "(total_atrasos / total_ctes) * 100",
  },
  {
    ids: [3, 4, 5],
    variables: [
      { key: "custos_avarias", label: "Total de custos com avarias" },
      { key: "veiculos_embarcados", label: "Quantidade de veículos embarcados" },
    ],
    expression: "custos_avarias / veiculos_embarcados",
  },
  {
    ids: [6, 7, 8, 9, 10, 11, 13, 14, 15],
    variables: [
      { key: "veiculos_avariados", label: "Número de veículos avariados" },
      { key: "total_veiculos_transportados", label: "Total de veículos transportados" },
    ],
    expression: "veiculos_avariados / total_veiculos_transportados",
  },
  {
    ids: [12],
    variables: [
      { key: "veiculos_avariados", label: "Número de veículos avariados" },
      { key: "total_veiculos_transportados", label: "Total de veículos transportados" },
    ],
    expression: "(veiculos_avariados / total_veiculos_transportados) * 100",
  },
  {
    ids: [16],
    variables: [
      { key: "veiculos_avariados_carregamento", label: "Nº de veículos avariados no carregamento" },
      { key: "veiculos_carregados", label: "Nº de veículos carregados" },
    ],
    expression: "veiculos_avariados_carregamento / veiculos_carregados",
  },
  {
    ids: [17],
    variables: [
      { key: "horas_treinamento_geral", label: "Somatório de horas de treinamento geral do mês" },
      { key: "numero_colaboradores", label: "Número de colaboradores" },
    ],
    expression: "horas_treinamento_geral / numero_colaboradores",
  },
  {
    ids: [18, 19, 20, 21, 22],
    variables: [
      { key: "horas_treinamento_geral", label: "Somatório de horas de treinamento geral do mês" },
      { key: "colaboradores_adm_operacional", label: "Número de colaboradores adm./operacional" },
    ],
    expression: "horas_treinamento_geral / colaboradores_adm_operacional",
  },
  {
    ids: [23],
    variables: [
      { key: "horas_treinamento_motoristas", label: "Somatório de horas de treinamentos dos motoristas do mês" },
      { key: "colaboradores_motoristas", label: "Número de colaboradores motoristas" },
    ],
    expression: "horas_treinamento_motoristas / colaboradores_motoristas",
  },
  {
    ids: [29, 30, 31, 32, 33, 34],
    variables: [
      { key: "demissoes", label: "Nº de Demissões" },
      { key: "funcionarios_mes_anterior", label: "Funcionários do mês anterior" },
    ],
    expression: "(demissoes / funcionarios_mes_anterior) * 100",
  },
  {
    ids: [35, 36, 37, 38, 39, 40, 41],
    variables: [
      { key: "acertos", label: "Total de acertos" },
      { key: "itens_estoque", label: "Total de itens em estoque" },
    ],
    expression: "(acertos * 100) / itens_estoque",
  },
  {
    ids: [59],
    variables: [
      { key: "custos_fixos", label: "Custos fixos" },
      { key: "faturamento_bruto", label: "Faturamento Bruto" },
    ],
    expression: "(custos_fixos / faturamento_bruto) * 100",
  },
  {
    ids: [60],
    variables: [
      { key: "custos_variaveis", label: "Custos variáveis" },
      { key: "faturamento_bruto", label: "Faturamento Bruto" },
    ],
    expression: "(custos_variaveis / faturamento_bruto) * 100",
  },
  {
    ids: [107],
    variables: [
      { key: "soma_idades_veiculos", label: "Soma das idades dos veículos de carga" },
      { key: "veiculos_carga_ativos", label: "Quantidade de veículos de carga ativos" },
    ],
    expression: "soma_idades_veiculos / veiculos_carga_ativos",
  },
  {
    ids: [111],
    variables: [
      { key: "motoristas_afastados", label: "Quantidade de motoristas afastados" },
      { key: "total_motoristas", label: "Quantidade total de motoristas" },
    ],
    expression: "(motoristas_afastados / total_motoristas) * 100",
  },
  {
    ids: [112],
    variables: [
      { key: "vitimas_acidente", label: "Quantidade de vítimas em acidente de trânsito" },
      { key: "viagens_efetuadas", label: "Viagens efetuadas" },
    ],
    expression: "vitimas_acidente / viagens_efetuadas",
  },
  {
    ids: [114],
    variables: [
      { key: "viagens_excesso_velocidade", label: "Nº de viagens com excesso de velocidade" },
      { key: "total_viagens", label: "Nº total de viagens" },
    ],
    expression: "(viagens_excesso_velocidade / total_viagens) * 100",
  },
  {
    ids: [122, 123, 124, 125, 126, 127, 128],
    variables: [
      { key: "simulacoes_prazo", label: "Qtd de simulações realizadas no prazo" },
      { key: "simulacoes_previstas", label: "Qtd de simulações previstas" },
    ],
    expression: "(simulacoes_prazo / simulacoes_previstas) * 100",
  },

  // ─── Category B: single-quantity (cleaner labels than the heuristic's fallback) ───
  {
    ids: [42, 43, 44, 45, 46, 47, 48],
    variables: [{ key: "valor_diferenca", label: "Valor unitário da diferença de estoque" }],
    expression: "valor_diferenca",
  },
  {
    ids: [58],
    variables: [{ key: "satisfacao", label: "Resultado da pesquisa de satisfação" }],
    expression: "satisfacao",
  },
  {
    ids: [83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103],
    variables: [{ key: "volume", label: "Volume gerado" }],
    expression: "volume",
  },
  {
    ids: [105],
    variables: [{ key: "co2_frotas", label: "Emissão de CO2 das frotas (tCO2)" }],
    expression: "co2_frotas",
  },
  {
    ids: [106],
    variables: [{ key: "co2_energia", label: "Emissão de CO2 da energia elétrica (tCO2)" }],
    expression: "co2_energia",
  },
  {
    ids: [115, 116, 117, 118, 119, 120, 121],
    variables: [{ key: "eventos_simulados", label: "Eventos simulados no período" }],
    expression: "eventos_simulados",
  },
  {
    ids: [130],
    variables: [{ key: "litros", label: "Litros" }],
    expression: "litros",
  },

  // ─── Category C: manual overrides ───
  {
    // C1 — typo fix: "* 101" was almost certainly meant as "* 100" (mirror of indicator #1)
    ids: [2],
    variables: [
      { key: "total_atrasos", label: "Total de atrasos" },
      { key: "total_ctes", label: "Total de CT-e, CRT, MIC-DTA emitidos" },
    ],
    expression: "(total_atrasos / total_ctes) * 100",
    note: "C1: fixed '* 101' → '* 100' (typo, mirror of #1)",
  },
  {
    // C2 — eficácia recrutamento: "(demitidos * 100) / admitidos (resultado diminuir de 100)"
    ids: [24, 25, 26, 27, 28],
    variables: [
      { key: "demitidos_3m", label: "Demitidos nos últimos 3 meses (recém-admitidos)" },
      { key: "admitidos_3m", label: "Admitidos nos últimos 3 meses" },
    ],
    expression: "100 - (demitidos_3m * 100) / admitidos_3m",
    note: "C2: interpretei a nota '(diminuir de 100)' como taxa de retenção",
  },
  {
    // C9 — acidentes de trabalho
    ids: [49, 50, 51, 52, 53, 54],
    variables: [
      { key: "acidentes_trabalho", label: "Número de acidentes de trabalho" },
      { key: "funcionarios_ativos", label: "Funcionários ativos no cadastro da matriz no mês" },
    ],
    expression: "(acidentes_trabalho * 100) / funcionarios_ativos",
    note: "C9-trabalho: ambos lados estavam em parens, fallback caía",
  },
  {
    // C10a — custo de manutenção (cleanup paren ímpar no label)
    ids: [55],
    variables: [
      { key: "custos_manutencao", label: "Total de custos de manutenção (incluindo rateio)" },
      { key: "km_rodado", label: "Total km rodado" },
    ],
    expression: "custos_manutencao / km_rodado",
  },
  {
    // C3 — combustível: simplificado pra 2 vars
    ids: [56],
    variables: [
      { key: "media_diesel", label: "Média de consumo diesel (km/L) da frota" },
      { key: "total_caminhoes", label: "Total de caminhões (médias apuradas)" },
    ],
    expression: "media_diesel / total_caminhoes",
    note: "C3: original tinha 2 divisões aninhadas + filtros, simplifiquei. Cliente refina se quiser detalhar.",
  },
  {
    // C4 — pneus: R$/km
    ids: [57],
    variables: [
      { key: "custo_pneus_mes", label: "Custo total de pneus mensal (excl. pneu novo sem aplicação)" },
      { key: "km_pneu_mes", label: "Km rodada por pneu no mês" },
    ],
    expression: "custo_pneus_mes / km_pneu_mes",
    note: "C4: original misturava texto+fórmula. Interpretei como R$/km.",
  },
  {
    // C5 — MAM: generalizei pra atual/anterior
    ids: [61],
    variables: [
      { key: "mam_atual", label: "MAM ano atual (Média Anual Mensal)" },
      { key: "mam_anterior", label: "MAM ano anterior" },
    ],
    expression: "((mam_atual - mam_anterior) * 100 / mam_anterior) + 100",
    note: "C5: generalizei 2017/2018 pra atual/anterior. 100 = sem variação, 110 = +10%.",
  },
  {
    // C6 — consumo de água: 3 vars
    ids: [62, 63, 64, 65, 66, 67, 68],
    variables: [
      { key: "consumo_agua_mes", label: "Consumo total de água (m³) no mês" },
      { key: "media_funcionarios", label: "Média de funcionários no mês" },
      { key: "dias_mes", label: "Dias do mês" },
    ],
    expression: "consumo_agua_mes / media_funcionarios / dias_mes * 100",
    note: "C6: heurística mesclou funcionários+dias em 1 var. Separei nas 3 quantidades originais.",
  },
  {
    // C7 — consumo de energia: 3 vars (mesmo padrão de C6)
    ids: [69, 70, 71, 72, 73, 74, 75],
    variables: [
      { key: "consumo_energia_mes", label: "Consumo total de energia no mês" },
      { key: "media_funcionarios", label: "Média de funcionários no mês" },
      { key: "dias_mes", label: "Dias do mês" },
    ],
    expression: "consumo_energia_mes / media_funcionarios / dias_mes * 100",
    note: "C7: 3 vars, igual ao consumo de água",
  },
  {
    // C8 — reciclável: 1 var (valor monetário consolidado)
    ids: [76, 77, 78, 79, 80, 81, 82],
    variables: [{ key: "valor_reciclavel", label: "Valor mensal do material reciclável (plástico, papel, vidro, metal)" }],
    expression: "valor_reciclavel",
    note: "C8: heurística pegava '/' dentro de parens como divisão de fórmula. É soma única.",
  },
  {
    // C10c — opacidade
    ids: [104],
    variables: [{ key: "opacidade", label: "Resultado Ringelmann/Despoluir" }],
    expression: "opacidade",
    note: "C10c: '/' era OU (Ringelmann ou Despoluir), não divisão. Valor único.",
  },
  {
    // C9-leve
    ids: [108],
    variables: [
      { key: "acidentes_transito_leve", label: "Número de acidentes de trânsito - Leve" },
      { key: "funcionarios_ativos", label: "Funcionários ativos no cadastro da matriz no mês" },
    ],
    expression: "(acidentes_transito_leve * 100) / funcionarios_ativos",
  },
  {
    // C9-moderado
    ids: [109],
    variables: [
      { key: "acidentes_transito_moderado", label: "Número de acidentes de trânsito - Moderado" },
      { key: "funcionarios_ativos", label: "Funcionários ativos no cadastro da matriz no mês" },
    ],
    expression: "(acidentes_transito_moderado * 100) / funcionarios_ativos",
  },
  {
    // C9-grave
    ids: [110],
    variables: [
      { key: "acidentes_transito_grave", label: "Número de acidentes de trânsito - Grave" },
      { key: "funcionarios_ativos", label: "Funcionários ativos no cadastro da matriz no mês" },
    ],
    expression: "(acidentes_transito_grave * 100) / funcionarios_ativos",
  },
  {
    // C10b — taxa de sinistros: removi prefixo "Percentual =", adicionei *100
    ids: [113],
    variables: [
      { key: "viagens_excesso", label: "Viagens com excesso no mês" },
      { key: "total_viagens", label: "Total de viagens no mês" },
    ],
    expression: "(viagens_excesso / total_viagens) * 100",
    note: "C10b: 'Percentual =' era declaração de label, removi. Adicionei *100 (indicador é 'Taxa').",
  },
  {
    // #39 — fornecedores: regra de 3 (% em dia)
    ids: [129],
    variables: [
      { key: "fornecedores_em_dia", label: "Fornecedores com documentação em dia" },
      { key: "total_fornecedores_ativos", label: "Total de fornecedores ativos" },
    ],
    expression: "(fornecedores_em_dia / total_fornecedores_ativos) * 100",
    note: "C: descrição menciona 'regra de 3', meta de 90%. Estruturei como percentual.",
  },
];

function validateMapping(m: Mapping): string | null {
  const declaredKeys = new Set(m.variables.map((v) => v.key.toLowerCase()));
  const tokens = m.expression.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [];
  for (const t of tokens) {
    if (!declaredKeys.has(t)) return `Token "${t}" não declarado em variables`;
  }
  let depth = 0;
  for (const c of m.expression) {
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth < 0) return "Parens desbalanceados (fecha antes de abrir)";
    }
  }
  if (depth !== 0) return "Parens desbalanceados (abre sem fechar)";
  if (m.variables.some((v) => !/^[a-z_][a-z0-9_]*$/.test(v.key))) {
    return "Key de variável inválida (precisa ser slug minúsculo)";
  }
  const dupKeys = m.variables.map((v) => v.key);
  if (new Set(dupKeys).size !== dupKeys.length) return "Chaves de variável duplicadas";
  return null;
}

async function main() {
  console.log(`KPI manual formula migration ${dryRun ? "(DRY RUN)" : "(LIVE)"}`);

  // Pre-flight: validate every mapping
  for (const [idx, m] of PLAN.entries()) {
    const err = validateMapping(m);
    if (err) {
      console.error(`Mapping ${idx} (ids ${m.ids.join(",")}) inválido: ${err}`);
      process.exit(2);
    }
  }
  console.log(`✓ ${PLAN.length} mapeamentos validados (parens + tokens + slugs)`);

  // Check ID coverage
  const allIds = PLAN.flatMap((m) => m.ids);
  const dupIds = allIds.filter((id, i) => allIds.indexOf(id) !== i);
  if (dupIds.length > 0) {
    console.error(`IDs duplicados no plano: ${[...new Set(dupIds)].join(", ")}`);
    process.exit(2);
  }
  console.log(`✓ ${allIds.length} IDs únicos cobertos pelo plano\n`);

  let updated = 0;
  let skippedAlreadyDone = 0;
  let skippedNotFound = 0;

  for (const [idx, m] of PLAN.entries()) {
    const rows = await db
      .select({
        id: kpiIndicatorsTable.id,
        formulaVariables: kpiIndicatorsTable.formulaVariables,
        formulaExpression: kpiIndicatorsTable.formulaExpression,
      })
      .from(kpiIndicatorsTable)
      .where(inArray(kpiIndicatorsTable.id, m.ids));

    const found = new Set(rows.map((r) => r.id));
    const missing = m.ids.filter((id) => !found.has(id));

    const toUpdate = rows.filter(
      (r) =>
        !r.formulaVariables ||
        r.formulaVariables.length === 0 ||
        !r.formulaExpression ||
        !r.formulaExpression.trim(),
    );
    const alreadyDone = rows.length - toUpdate.length;

    console.log(`[${idx + 1}/${PLAN.length}] ids=[${m.ids.join(", ")}]`);
    console.log(`  expr: ${m.expression}`);
    console.log(`  vars: ${m.variables.map((v) => `${v.key}="${v.label}"`).join(", ")}`);
    if (m.note) console.log(`  note: ${m.note}`);
    console.log(`  → update: ${toUpdate.length}, skip(already done): ${alreadyDone}, skip(not found): ${missing.length}`);
    if (missing.length > 0) console.log(`    ⚠ ids não encontrados: ${missing.join(", ")}`);

    if (!dryRun && toUpdate.length > 0) {
      await db
        .update(kpiIndicatorsTable)
        .set({ formulaVariables: m.variables, formulaExpression: m.expression })
        .where(inArray(kpiIndicatorsTable.id, toUpdate.map((r) => r.id)));
    }

    updated += toUpdate.length;
    skippedAlreadyDone += alreadyDone;
    skippedNotFound += missing.length;
    console.log("");
  }

  console.log("─".repeat(60));
  console.log(`Total ${dryRun ? "would update" : "updated"}: ${updated}`);
  console.log(`Skipped (já migrados):  ${skippedAlreadyDone}`);
  console.log(`Skipped (não achados):  ${skippedNotFound}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
