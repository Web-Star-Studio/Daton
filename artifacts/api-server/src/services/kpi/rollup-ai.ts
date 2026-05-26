import { openai } from "@workspace/integrations-openai-ai-server";
import { and, eq, ne, sql } from "drizzle-orm";
import {
  db,
  kpiIndicatorsTable,
  type KpiFormulaVariable,
} from "@workspace/db";

/**
 * Recomendação de filho via IA. Frontend usa essa estrutura pra pré-marcar
 * checkboxes (auto-mode quando confidence ≥ 0.85).
 */
export interface RollupChildSuggestion {
  childIndicatorId: number;
  confidence: number;
  reason: string;
  /** parent_var_key → child_var_key */
  variableMapping: Record<string, string>;
}

interface CandidateInput {
  id: number;
  name: string;
  measurement: string;
  formulaVariables: KpiFormulaVariable[];
  formulaExpression: string;
  unit: string | null;
  measureUnit: string | null;
  periodicity: string;
}

/**
 * Recebe um indicador "pai" candidato a rollup corporativo e devolve a lista
 * dos indicadores filhos prováveis (com confidence + mapping de variáveis).
 *
 * Filtra primeiro candidatos óbvios por SQL (mesma periodicidade, mesma
 * unidade de medida, NÃO Corporativo) pra reduzir o input do LLM e custo.
 *
 * O LLM faz o match conceitual (nome + medição + fórmula) e o mapeamento de
 * variáveis (que é o ponto crítico — chaves diferem entre Excel imports).
 */
export async function suggestRollupChildren(
  orgId: number,
  parentIndicatorId: number,
): Promise<RollupChildSuggestion[]> {
  const [parent] = await db
    .select()
    .from(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, parentIndicatorId), eq(kpiIndicatorsTable.organizationId, orgId)));
  if (!parent) return [];

  // Pega candidatos da org: NÃO o próprio pai, NÃO outros corporativos
  // (assumimos que rollup não tem filho que também é rollup — pra evitar
  // ciclo). Filtra por mesma periodicidade e measureUnit pra reduzir noise.
  const candidates = await db
    .select({
      id: kpiIndicatorsTable.id,
      name: kpiIndicatorsTable.name,
      measurement: kpiIndicatorsTable.measurement,
      formulaVariables: kpiIndicatorsTable.formulaVariables,
      formulaExpression: kpiIndicatorsTable.formulaExpression,
      unit: kpiIndicatorsTable.unit,
      measureUnit: kpiIndicatorsTable.measureUnit,
      periodicity: kpiIndicatorsTable.periodicity,
    })
    .from(kpiIndicatorsTable)
    .where(and(
      eq(kpiIndicatorsTable.organizationId, orgId),
      ne(kpiIndicatorsTable.id, parentIndicatorId),
      eq(kpiIndicatorsTable.periodicity, parent.periodicity),
      // unit !== 'Corporativo' (case-insensitive) — assumimos corporativo não vira filho
      sql`lower(coalesce(${kpiIndicatorsTable.unit}, '')) != 'corporativo'`,
    ));

  if (candidates.length === 0) return [];

  // Se measureUnit do pai está definida, prioriza candidatos com a mesma
  // (mas não bloqueia — % pode aparecer como "%" ou "" às vezes)
  const candidatesForPrompt: CandidateInput[] = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    measurement: c.measurement,
    formulaVariables: c.formulaVariables,
    formulaExpression: c.formulaExpression,
    unit: c.unit,
    measureUnit: c.measureUnit,
    periodicity: c.periodicity,
  }));

  const systemPrompt = `Você é um analista de KPIs/SGQ (ISO 9001/14001/39001). Sua tarefa é identificar quais indicadores são versões filial-level (de uma unidade/CNPJ específico) de um indicador corporativo (rollup de TODAS as filiais).

REGRAS:
- "É filho" quando o indicador candidato mede a MESMA coisa que o pai, mas restrito a uma filial específica.
- Use o nome (ex.: "% de Avaria - Anápolis" é claramente filho de "% de Avaria - Geral"), a medição/fórmula (mesma estrutura matemática), e as variáveis (mesmos conceitos com nomes potencialmente diferentes).
- Pra cada candidato, retorne:
  * id (do candidato)
  * confidence (0.0 a 1.0)
  * reason (PT-BR curto, 1 frase)
  * variableMapping (parent_var_key → child_var_key — só inclua candidatos com confidence >= 0.5)

CONFIDENCE:
- 0.9-1.0 = óbvio (nome similar + mesma estrutura)
- 0.7-0.9 = provável (estrutura bate, nome difere)
- 0.5-0.7 = duvidoso (algo bate mas há discrepâncias)
- < 0.5 = NÃO retornar

MAPEAMENTO DE VARIÁVEIS:
- Match por LABEL semântico (o label é texto humano, comparar significado, não chave)
- Ex.: parent var label "Número de veículos avariados" (key: veiculos_avariados) bate com child var label "Número de veículos avariados" (key: numero_de_veiculos_avariados) → mapping: { "veiculos_avariados": "numero_de_veiculos_avariados" }

FORMATO DE SAÍDA (JSON object com array "suggestions"):
{
  "suggestions": [
    { "id": 9, "confidence": 0.98, "reason": "Mesmo nome e fórmula, filial Anápolis", "variableMapping": { "veiculos_avariados": "numero_de_veiculos_avariados", "total_veiculos_transportados": "total_de_veiculos_transportados" } }
  ]
}`;

  const userPrompt = `INDICADOR PAI (rollup corporativo):
- Nome: ${parent.name}
- Medição: ${parent.measurement}
- Fórmula: ${parent.formulaExpression}
- Variáveis: ${JSON.stringify(parent.formulaVariables)}
- Periodicidade: ${parent.periodicity}
- Unidade de medida: ${parent.measureUnit ?? "(não definida)"}

CANDIDATOS (${candidatesForPrompt.length}):
${JSON.stringify(candidatesForPrompt, null, 2)}

Retorne o JSON com as sugestões (apenas candidatos com confidence >= 0.5).`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const suggestions: unknown = parsed.suggestions ?? [];
    if (!Array.isArray(suggestions)) return [];

    // Sanitiza output do LLM
    const validIds = new Set(candidatesForPrompt.map((c) => c.id));
    const cleaned: RollupChildSuggestion[] = suggestions
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
      .map((s) => ({
        childIndicatorId: typeof s.id === "number" ? s.id : -1,
        confidence: typeof s.confidence === "number" ? Math.max(0, Math.min(1, s.confidence)) : 0,
        reason: typeof s.reason === "string" ? s.reason.slice(0, 200) : "",
        variableMapping: typeof s.variableMapping === "object" && s.variableMapping !== null
          ? Object.fromEntries(
              Object.entries(s.variableMapping as Record<string, unknown>)
                .filter(([k, v]) => typeof k === "string" && typeof v === "string"),
            ) as Record<string, string>
          : {},
      }))
      .filter((s) => validIds.has(s.childIndicatorId) && s.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence);

    return cleaned;
  } catch (err) {
    console.error("[kpi-rollup-ai] suggestion failed", err);
    return [];
  }
}

// ─── Cluster validation (novo fluxo) ──────────────────────────────────────
// Diferente de suggestRollupChildren (que assume um pai já existente e
// procura filhos no catálogo), validateCluster recebe N candidatos JÁ
// pré-agrupados pela heurística e pede pra IA confirmar/refinar.

export interface ClusterValidationInput {
  indicatorId: number;
  name: string;
  measurement: string;
  measureUnit: string | null;
  formulaExpression: string;
  formulaVariables: KpiFormulaVariable[];
}

export interface ClusterValidationResult {
  /** A IA confirma que esses indicadores medem a mesma coisa? */
  isValid: boolean;
  /** 0-1; quão certa a IA está dessa avaliação. */
  confidence: number;
  /** Nome humano proposto pra o Corporativo (ex.: "Taxa de avarias no transporte"). */
  canonicalName: string;
  /** Indicadores que a IA acha que NÃO pertencem ao grupo. */
  outlierIndicatorIds: number[];
  /** Justificativa curta (PT-BR), pra UI exibir como tooltip. */
  reasoning: string;
}

const FALLBACK_VALIDATION = (members: ClusterValidationInput[]): ClusterValidationResult => ({
  isValid: true,
  confidence: 0.5,
  canonicalName: members[0]?.name ?? "Corporativo",
  outlierIndicatorIds: [],
  reasoning: "Validação automática indisponível; cluster mantido pela heurística.",
});

/**
 * Pede ao LLM uma "segunda opinião" sobre um cluster pré-detectado: são
 * realmente o mesmo indicador? Qual o nome canônico mais natural? Algum
 * membro é outlier? Usado como refinement opcional — a heurística já entrega
 * resultados utilizáveis sozinha, isto é só pra polir.
 *
 * Se a IA falha (timeout, parse error, etc), devolve um fallback "aceita
 * tudo como veio" — nunca quebra o fluxo da UI.
 */
export async function validateCluster(
  members: ClusterValidationInput[],
): Promise<ClusterValidationResult> {
  if (members.length < 2) return FALLBACK_VALIDATION(members);

  const systemPrompt = `Você é um analista de KPIs/SGQ. Recebeu uma proposta de agrupamento de indicadores que (segundo uma heurística) medem a mesma coisa em filiais diferentes. Avalie criticamente.

REGRAS:
- "É o mesmo indicador" significa: mede o MESMO conceito, em filiais diferentes (ex.: "% de avaria por mil transportados em SP" e "Avarias / total transportado RJ" → SIM, mesma coisa, expresso diferente).
- Ignore diferenças de NOME no token de filial (SP/RJ/MG são filiais, não conceito).
- Ignore diferenças de NOMES DE VARIÁVEIS na fórmula ("avarias" e "ocorrencias" podem ser sinônimos).
- O que importa é a ESTRUTURA da medição e do cálculo.

RESPONDA SEMPRE EM JSON COM ESTA ESTRUTURA EXATA:
{
  "isValid": boolean,            // true se ≥2 membros realmente medem a mesma coisa
  "confidence": number,           // 0.0 a 1.0
  "canonicalName": string,        // nome humano natural do indicador corporativo, em pt-BR, sem o token de filial. Ex: "Taxa de avarias no transporte"
  "outlierIndicatorIds": number[],// ids dos membros que NÃO pertencem ao grupo
  "reasoning": string             // 1 frase curta (≤140 chars) em pt-BR
}`;

  const userPrompt = `Cluster proposto (${members.length} membros):

${members.map((m, i) => `
[${i + 1}] id=${m.indicatorId}
  Nome: ${m.name}
  Medição: ${m.measurement}
  Fórmula: ${m.formulaExpression}
  Variáveis: ${JSON.stringify(m.formulaVariables)}
  Unidade: ${m.measureUnit ?? "(não definida)"}
`).join("\n")}

Avalie e retorne o JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const validIds = new Set(members.map((m) => m.indicatorId));
    return {
      isValid: typeof parsed.isValid === "boolean" ? parsed.isValid : true,
      confidence: typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
      canonicalName: typeof parsed.canonicalName === "string" && parsed.canonicalName.trim()
        ? parsed.canonicalName.trim().slice(0, 200)
        : members[0].name,
      outlierIndicatorIds: Array.isArray(parsed.outlierIndicatorIds)
        ? (parsed.outlierIndicatorIds as unknown[])
            .filter((x): x is number => typeof x === "number" && validIds.has(x))
        : [],
      reasoning: typeof parsed.reasoning === "string"
        ? parsed.reasoning.slice(0, 200)
        : "",
    };
  } catch (err) {
    console.error("[kpi-rollup-ai] validateCluster failed", err);
    return FALLBACK_VALIDATION(members);
  }
}
