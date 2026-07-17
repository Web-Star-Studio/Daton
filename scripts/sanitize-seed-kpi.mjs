#!/usr/bin/env node
/**
 * sanitize-seed-kpi.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Reescreve `scripts/src/seed-kpi.ts` IN-PLACE, trocando o dado real do cliente
 * (org 2 / Transportes Gabardo) por fixture sintética equivalente.
 *
 * O seed-kpi é um seed de DEMONSTRAÇÃO (org 3 — "Indústria Aurora Demo"), mas
 * foi montado a partir da planilha real de um cliente: filiais, responsáveis
 * (incluindo nomes de pessoas), fórmulas e — o mais grave — os 12 valores
 * mensais de 2025 de cada indicador são os números de produção dele.
 *
 * O que este script faz:
 *   1. Filiais reais  → filiais fictícias da demo (Sede Principal / Filial Rio
 *      de Janeiro / Filial Belo Horizonte). "Corporativo" é mantido.
 *   2. TODOS os `values: [...]` são regenerados a partir de `goal` + `direction`
 *      com PRNG determinístico semeado pelo nome final do indicador.
 *   3. `responsible` com nome de pessoa ou marca de filial → papel genérico.
 *   4. `measurement`/`name` específicos do cliente → equivalente genérico.
 *
 * O script NÃO toca no banco. Ele só reescreve um arquivo-fonte.
 *
 * Uso:
 *   node scripts/sanitize-seed-kpi.mjs --dry-run   # relatório, não escreve
 *   node scripts/sanitize-seed-kpi.mjs             # reescreve o seed
 *
 * Idempotente: rodar 2x produz byte-a-byte o mesmo arquivo. Todas as regras são
 * ancoradas em tokens que deixam de existir após a 1ª passada, e o PRNG é
 * semeado pelo nome FINAL (já renomeado), que é estável a partir da 1ª passada.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, "src/seed-kpi.ts");
const DRY_RUN = process.argv.includes("--dry-run");

const EXPECTED_INDICATORS = 129;
const MONTHS = 12;

// ─── 1. Mapa de filiais ──────────────────────────────────────────────────────
// A org 3 tem só 3 filiais, o seed carrega 9 filiais reais. Um colapso ingênuo
// 9→3 quebraria o seed: ele deduplica por (name, unit), e 6 grupos de
// indicadores ("Consumo de água", "Orgânico", ...) têm 7 linhas com o MESMO
// name, distinguidas só pelo unit. 7 units → 3 = 4 colisões por grupo = 24
// indicadores silenciosamente fundidos (e seus valores descartados pelo
// onConflictDoNothing).
//
// Solução: o mapa é INJETIVO. `unit` fica sempre em uma das 3 filiais REAIS da
// demo (então um backfill futuro de unit_id por nome casa 100%), e a
// desambiguação vai para uma ÁREA dentro da filial — coerente com a operação da
// org 3 (indústria com cross-docking / armazém / pátio). A unicidade de
// (name, unit) é verificada por assert no fim.
const SITES = {
  "Porto Alegre":          { unit: "Sede Principal",        area: null },
  "Piracicaba":            { unit: "Filial Rio de Janeiro", area: null },
  "Anápolis":              { unit: "Filial Belo Horizonte", area: null },
  "Porto Real":            { unit: "Sede Principal",        area: "Armazém" },
  "São Bernardo do Campo": { unit: "Filial Rio de Janeiro", area: "Armazém" },
  "Duque de Caxias":       { unit: "Filial Belo Horizonte", area: "Armazém" },
  "São José dos Pinhais":  { unit: "Sede Principal",        area: "Cross-docking" },
  "Iracemápolis":          { unit: "Filial Rio de Janeiro", area: "Pátio" },
  "Cariacica":             { unit: "Filial Belo Horizonte", area: "Pátio" },
};

/** Rótulo usado DENTRO de `name` (ex.: "% de Avaria - Porto Real"). */
const siteLabel = (key) => {
  const s = SITES[key];
  return s.area ? `${s.unit} - ${s.area}` : s.unit;
};

// Grafias com que as filiais aparecem em `name`. Ordenado por comprimento desc
// para que "São Bernardo do Campo" case antes de "São Bernardo C.", e
// "Filial Piracicaba" antes de "Piracicaba" (senão viraria "Filial Filial RJ").
const SITE_TOKENS = [
  ["Filial Piracicaba", "Piracicaba"],
  ["São Bernardo do Campo", "São Bernardo do Campo"],
  ["São Bernardo C.", "São Bernardo do Campo"],
  ["São José dos Pinhais", "São José dos Pinhais"],
  ["Duque de Caxias", "Duque de Caxias"],
  ["Iracemápolis", "Iracemápolis"],
  ["Porto Alegre", "Porto Alegre"],
  ["Porto Real", "Porto Real"],
  ["Piracicaba", "Piracicaba"],
  ["Anápolis", "Anápolis"],
  ["Cariacica", "Cariacica"],
].sort((a, b) => b[0].length - a[0].length);

// ─── 2. Responsáveis ─────────────────────────────────────────────────────────
// Match EXATO no valor inteiro (não substring) — por isso é idempotente: nenhum
// valor de destino é também uma chave.
//
// Mantidos por serem papéis genéricos de ISO/organograma padrão: "Segurança",
// "Almoxarife", "Psicologia", "Recursos Humanos", "Frota", "Sinistros",
// "Tec. Meio Ambiente", "Diretor Operacional", "Compras Fornecedores" e os
// "*SGI" (SGI = Sistema de Gestão Integrado, termo genérico da norma).
const RESPONSIBLE_MAP = {
  // Nomes de pessoas reais (PII do cliente) → papel.
  "Thais Brito": "Coordenação Administrativa",
  "Juliana Lobão": "Coordenação Ambiental",
  "Yuri dos Santos": "Coordenação de Operações",
  "Ingride Oliveira": "Coordenação de Operações",
  // "POA" = código da filial Porto Alegre do cliente.
  "Financeiro - POA": "Financeiro",
  // Numeração interna do organograma do cliente.
  "Operacional 1": "Operacional",
  "ADM": "Administrativo",
};

// ─── 3. Regras de `measurement` ──────────────────────────────────────────────
// Critério: fórmula genérica de ISO/gestão FICA (turnover, recrutamento, horas
// de treinamento, acuracidade e diferença de estoque, consumo de água/energia,
// resíduos, opacidade, tCO2e, brigada, custos fixos/variáveis, documentação de
// fornecedores, taxa de acidentes). Só sai o que é específico do cliente:
//
//  - "veículos embarcados/avariados/transportados/carregados": o cliente é
//    transportador de VEÍCULOS (cegonha). Além de identificar o ramo, não bate
//    com a org 3 (indústria com operação logística) → vira "volumes".
//    "veículos de carga" (idade da frota) FICA: frota própria é genérica.
//  - "linha DTA Vitória-Anápolis": rota real do cliente → "linha dedicada".
//  - "Matriz": aqui é a palavra comum "matriz" (sede) dentro de uma fórmula de
//    headcount — "nº de funcionários ativos no cadastro da Matriz no mês" — e
//    NÃO a filial "Matriz" do cliente (nenhum indicador tem unit: "Matriz").
//    Não identifica ninguém, mas troco por "Sede" porque a sede da demo é a
//    "Sede Principal": some a ambiguidade com a filial homônima do cliente e a
//    fórmula fica coerente com a org 3. Troca de baixo risco.
const MEASUREMENT_RULES = [
  [/\(exceto linha DTA [^)]*\)/g, "(exceto linha dedicada)"],
  [/veículos embarcados/g, "volumes expedidos"],
  [/veículos avariados/g, "volumes avariados"],
  [/veículos transportados/g, "volumes movimentados"],
  [/veículos carregados/g, "volumes carregados"],
  [/\bMatriz\b/g, "Sede"],
];

// ─── 4. Regras de `name` ─────────────────────────────────────────────────────
// Aplicadas DEPOIS da troca de filial.
//  - "Glovis" = cliente real do cliente (montadora) → cliente fictício.
//  - "S.P.U" = jargão interno opaco; o measurement diz que é custo de avaria
//    por unidade → passa a se chamar o que de fato mede.
// "Clientes ISO", "EPI", "CT-e/CRT/MIC-DTA" ficam: são termos genéricos do
// setor/norma, não identificam o cliente.
const NAME_RULES = [
  [/Glovis/g, "Cliente Estratégico"],
  [/^S\.P\.U\b/, "Custo de Avaria por Unidade"],
];

// ─── 5. Tokens que não podem sobrar ──────────────────────────────────────────
const FORBIDDEN = [
  "Piracicaba", "Porto Alegre", "Porto Real", "Anápolis", "Duque de Caxias",
  "Cariacica", "São Bernardo", "São José dos Pinhais", "Iracemápolis",
  "Camaçari", "Chuí", "Eusébio", "Jacareí", "Palhoça", "Suape",
  "Gabardo", "Motorista Terceiro", "Glovis", "S.P.U", "POA", "Matriz",
  "Vitória", "Thais Brito", "Juliana Lobão", "Yuri dos Santos",
  "Ingride Oliveira", "Excel",
];

// ─── PRNG determinístico ─────────────────────────────────────────────────────
// Semeado pelo nome FINAL do indicador. Nunca Math.random(): o resultado tem que
// ser reproduzível e revisável em diff.

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Geração de valores ──────────────────────────────────────────────────────

// Base para indicadores SEM meta (goal: N) — não dá pra derivar do goal, e usar
// a ordem de grandeza dos valores originais vazaria dado do cliente. Então a
// escala vem da unidade de medida.
const FALLBACK_BASE = {
  "%": 5, "R$": 5, "Hrs": 4, "KG": 500, "l": 1500, "KW": 60, "M3": 3,
  "Km/L": 3, "R$/Km": 0.5, "R$/1000 Km": 3.5, "Anos": 4, "tCO2e": 5000,
  "Unidade": 2, "Minutos/Segundos": 5,
};

function baseFor(goal, measureUnit, direction) {
  if (goal !== null) return goal;
  if (measureUnit === "%" && direction === "up") return 95;
  const b = FALLBACK_BASE[measureUnit];
  return b === undefined ? 50 : b;
}

function decimalsFor(base, measureUnit) {
  if (measureUnit === "Unidade") return 0;
  const b = Math.abs(base);
  if (b === 0) return 2;
  if (b < 0.1) return 3;
  if (b < 100) return 2;
  if (b < 1000) return 1;
  return 0;
}

/** Valor DENTRO da meta. */
function onTarget(base, direction, measureUnit, rnd) {
  // % "maior é melhor" com meta alta (98,9%): folga entre a meta e o teto de
  // 100 — crescer 10% acima estouraria o domínio.
  if (measureUnit === "%" && direction === "up" && base <= 100) {
    return base + rnd() * (100 - base) * 0.9;
  }
  if (direction === "up") return base * (1 + rnd() * 0.10);
  return base * (1 - rnd() * 0.30);
}

/** Valor FORA da meta — a demo precisa disso pra mostrar o fluxo de tratativa. */
function offTarget(base, direction, rnd) {
  if (direction === "up") return base * (1 - (0.03 + rnd() * 0.18));
  return base * (1 + 0.10 + rnd() * 0.40);
}

/**
 * Regenera os 12 meses preservando o padrão de nulos (N = "sem lançamento";
 * isso é estrutura — periodicidade, mês de referência, meses futuros — não é
 * dado do cliente).
 */
function generateValues(rawItems, { name, unit, goal, direction, measureUnit }) {
  const rnd = mulberry32(fnv1a(`${name}|${unit}|kpi-demo-v1`));
  const base = baseFor(goal, measureUnit, direction);
  const decimals = decimalsFor(base, measureUnit);
  const hasGoal = goal !== null;

  const filled = [];
  rawItems.forEach((item, i) => { if (item !== "N") filled.push(i); });

  // Quais meses estouram a meta. Determinístico. ~45% dos indicadores têm 1–2.
  const breaches = new Set();
  if (hasGoal && filled.length > 0 && rnd() < 0.45) {
    const howMany = rnd() < 0.6 ? 1 : 2;
    for (let k = 0; k < howMany; k++) {
      breaches.add(filled[Math.floor(rnd() * filled.length)]);
    }
  }

  return rawItems.map((item, i) => {
    if (item === "N") return "N";

    let v;
    if (base === 0) {
      // Meta zero (ex.: "Acidentes de trânsito - Grave", meta 0, menor é
      // melhor): quase sempre 0, com ocorrência esporádica.
      v = rnd() < 0.8 ? 0 : 0.05 + rnd() * 0.35;
    } else if (!hasGoal) {
      v = base * (0.7 + rnd() * 0.6);
    } else if (breaches.has(i)) {
      v = offTarget(base, direction, rnd);
    } else {
      v = onTarget(base, direction, measureUnit, rnd);
    }

    if (v < 0) v = 0;
    if (measureUnit === "%" && v > 100 && base <= 100) v = 100;
    return v.toFixed(decimals);
  });
}

// ─── Parsing do arquivo ──────────────────────────────────────────────────────

// Lookahead no \n final em vez de consumi-lo: objetos coladinhos ("},\n  {")
// precisam que o \n continue disponível pra iniciar o match seguinte, senão só
// os alternados casam. Os objetos não aninham chaves, então o não-guloso basta.
const OBJECT_RE = /\n  \{\n[\s\S]*?\n  \},(?=\n)/g;
// O literal fica no grupo nomeado `lit` e SEMPRE no fim do match — writeField
// depende disso pra localizar o offset sem tocar no resto da linha.
const FIELD_RES = {
  name: /\n\s*name: (?<lit>"(?:[^"\\]|\\.)*")/,
  measurement: /\n\s*measurement: (?<lit>"(?:[^"\\]|\\.)*")/,
  unit: /\n\s*unit: (?<lit>"(?:[^"\\]|\\.)*")/, // ancorado no início da linha → não pega measureUnit
  responsible: /responsible: (?<lit>"(?:[^"\\]|\\.)*")/,
  measureUnit: /measureUnit: (?<lit>"(?:[^"\\]|\\.)*")/,
};
const DIRECTION_RE = /direction: "(up|down)"/;
const GOAL_RE = /goal: (N|-?\d+(?:\.\d+)?)/;
const VALUES_RE = /\n(\s*)values: \[([^\]]*)\],/;

function readField(chunk, field) {
  const m = chunk.match(FIELD_RES[field]);
  if (!m) throw new Error(`Campo "${field}" não encontrado no objeto:\n${chunk}`);
  return JSON.parse(m.groups.lit);
}

/** Troca o literal do campo preservando o resto da linha byte-a-byte. */
function writeField(chunk, field, newValue) {
  const m = chunk.match(FIELD_RES[field]);
  if (!m) throw new Error(`Campo "${field}" não encontrado`);
  const literal = m.groups.lit;
  const start = m.index + m[0].length - literal.length;
  return chunk.slice(0, start) + JSON.stringify(newValue) + chunk.slice(start + literal.length);
}

// ─── Transformação de um indicador ───────────────────────────────────────────

function transformName(name, unitKey) {
  const site = SITES[unitKey] ?? null;
  const hadToken = SITE_TOKENS.some(([token]) => name.includes(token));

  let out = name;
  for (const [token, key] of SITE_TOKENS) {
    if (out.includes(token)) out = out.split(token).join(siteLabel(key));
  }

  // O nome não carrega a filial (ex.: "Consumo de água" x7) → a área desambigua.
  // Sem isso, 7 linhas colapsariam em 3 pares (name, unit) e o seed fundiria 4.
  if (!hadToken && site && site.area) out = `${out} - ${site.area}`;

  out = out.replace(/_(?=Sede|Filial)/g, " - "); // "Carregamento_Piracicaba"
  out = out.replace(/_Cliente\b/g, " (Cliente)"); // "..._Cliente"
  for (const [re, to] of NAME_RULES) out = out.replace(re, to);
  return out;
}

function transformChunk(chunk, stats) {
  const name = readField(chunk, "name");
  const unit = readField(chunk, "unit");
  const measurement = readField(chunk, "measurement");
  const responsible = readField(chunk, "responsible");
  const measureUnit = readField(chunk, "measureUnit");

  const dirMatch = chunk.match(DIRECTION_RE);
  const goalMatch = chunk.match(GOAL_RE);
  if (!dirMatch || !goalMatch) throw new Error(`direction/goal ausente:\n${chunk}`);
  const direction = dirMatch[1];
  const goal = goalMatch[1] === "N" ? null : Number(goalMatch[1]);

  const newUnit = SITES[unit]?.unit ?? unit; // "Corporativo" e já-migrados passam batido
  const newName = transformName(name, unit);

  let newMeasurement = measurement;
  for (const [re, to] of MEASUREMENT_RULES) newMeasurement = newMeasurement.replace(re, to);

  const newResponsible = RESPONSIBLE_MAP[responsible] ?? responsible;

  if (newName !== name) stats.renamedNames++;
  if (newUnit !== unit) stats.renamedUnits++;
  if (newMeasurement !== measurement) stats.renamedMeasurements++;
  if (newResponsible !== responsible) stats.renamedResponsibles++;

  let out = chunk;
  if (newName !== name) out = writeField(out, "name", newName);
  if (newMeasurement !== measurement) out = writeField(out, "measurement", newMeasurement);
  if (newUnit !== unit) out = writeField(out, "unit", newUnit);
  if (newResponsible !== responsible) out = writeField(out, "responsible", newResponsible);

  // ── values ──
  const vm = out.match(VALUES_RE);
  if (!vm) throw new Error(`values ausente (ou multi-linha) em "${name}"`);
  const indent = vm[1];
  const rawItems = vm[2].split(",").map((s) => s.trim());
  if (rawItems.length !== MONTHS) {
    throw new Error(`"${name}": ${rawItems.length} valores, esperado ${MONTHS}`);
  }

  const newItems = generateValues(rawItems, {
    name: newName, unit: newUnit, goal, direction, measureUnit,
  });

  // Padrão de nulos preservado.
  for (let i = 0; i < MONTHS; i++) {
    if ((rawItems[i] === "N") !== (newItems[i] === "N")) {
      throw new Error(`"${name}": padrão de nulos alterado no mês ${i + 1}`);
    }
  }

  const oldLine = vm[0];
  const newLine = `\n${indent}values: [${newItems.join(", ")}],`;
  if (newLine !== oldLine) stats.regeneratedValueRows++;
  stats.regeneratedValues += newItems.filter((x) => x !== "N").length;

  out = out.slice(0, vm.index) + newLine + out.slice(vm.index + oldLine.length);

  stats.pairs.push(`${newName} ${newUnit}`);
  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const original = readFileSync(TARGET, "utf8");
  let text = original;

  // Comentários que afirmam a procedência real dos dados.
  text = text.replace(
    " * for 2025 based on the provided Excel data.",
    " * for 2025. Todos os dados são SINTÉTICOS (fixture de demonstração):\n" +
      " * valores mensais gerados deterministicamente a partir de meta+direção.\n" +
      " * Não usar como referência de desempenho de nenhuma organização real.",
  );
  text = text.replace(/^\s*\/\/ Time values from Excel converted to decimal hours\n/m, "");

  const stats = {
    indicators: 0, renamedNames: 0, renamedUnits: 0, renamedMeasurements: 0,
    renamedResponsibles: 0, regeneratedValueRows: 0, regeneratedValues: 0, pairs: [],
  };

  const start = text.indexOf("const INDICATORS: IndicatorSeed[] = [");
  if (start === -1) throw new Error("Bloco INDICATORS não encontrado");
  const end = text.indexOf("\n];\n", start);
  if (end === -1) throw new Error("Fim do bloco INDICATORS não encontrado");

  // +1 inclui o \n que fecha o último "  }," — o lookahead do OBJECT_RE precisa
  // dele, senão o último indicador do array não casa.
  const head = text.slice(0, start);
  const block = text.slice(start, end + 1);
  const tail = text.slice(end + 1);

  const newBlock = block.replace(OBJECT_RE, (chunk) => {
    stats.indicators++;
    return transformChunk(chunk, stats);
  });

  text = head + newBlock + tail;

  // ── Asserts ──
  if (stats.indicators !== EXPECTED_INDICATORS) {
    throw new Error(`Esperado ${EXPECTED_INDICATORS} indicadores, processados ${stats.indicators}`);
  }

  // O seed deduplica por (name, unit): par repetido = indicador fundido em
  // silêncio + valores descartados. É erro, não aviso.
  const seen = new Set();
  const dups = [];
  for (const p of stats.pairs) {
    if (seen.has(p)) dups.push(p.replace(" ", " @ "));
    seen.add(p);
  }
  if (dups.length > 0) {
    throw new Error(`Colisão de (name, unit) — o seed fundiria estes indicadores:\n  ${dups.join("\n  ")}`);
  }

  const leaked = FORBIDDEN.filter((t) => text.includes(t));
  if (leaked.length > 0) {
    throw new Error(`Resíduo de dado do cliente no arquivo: ${leaked.join(", ")}`);
  }

  const units = new Set(stats.pairs.map((p) => p.split(" ")[1]));
  const allowed = new Set(["Corporativo", "Sede Principal", "Filial Rio de Janeiro", "Filial Belo Horizonte"]);
  const stray = [...units].filter((u) => !allowed.has(u));
  if (stray.length > 0) throw new Error(`unit fora das filiais da org 3: ${stray.join(", ")}`);

  // ── Relatório ──
  const changedLines = original.split("\n").reduce((acc, line, i) => {
    const now = text.split("\n")[i];
    return acc + (now === line ? 0 : 1);
  }, 0);

  console.log(`indicadores processados ......... ${stats.indicators}`);
  console.log(`  name alterado ................. ${stats.renamedNames}`);
  console.log(`  unit alterado ................. ${stats.renamedUnits}`);
  console.log(`  measurement alterado .......... ${stats.renamedMeasurements}`);
  console.log(`  responsible alterado .......... ${stats.renamedResponsibles}`);
  console.log(`linhas values regeneradas ....... ${stats.regeneratedValueRows}`);
  console.log(`valores mensais sintéticos ...... ${stats.regeneratedValues}`);
  console.log(`pares (name, unit) únicos ....... ${seen.size}`);
  console.log(`units resultantes ............... ${[...units].sort().join(" | ")}`);
  console.log(`linhas alteradas (aprox.) ....... ${changedLines}`);

  if (DRY_RUN) {
    console.log("\n--dry-run: nada foi escrito.");
    return;
  }
  if (text === original) {
    console.log("\nArquivo já sanitizado — nada a fazer (idempotente).");
    return;
  }
  writeFileSync(TARGET, text, "utf8");
  console.log(`\nReescrito: ${TARGET}`);
}

main();
