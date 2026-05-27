import { openai } from "@workspace/integrations-openai-ai-server";

export interface LegislationSuggestionInput {
  sectorName?: string | null;
  activityOperation?: string | null;
  environmentalAspect: string;
  environmentalImpact: string;
  controlTypes?: string[] | null;
  existingControls?: string | null;
  lifecycleStages?: string[] | null;
  branchState?: string | null;
  branchCity?: string | null;
}

export interface LegislationSuggestion {
  reference: string;
  url: string | null;
  summary: string;
}

const SYSTEM_PROMPT = `Você é um especialista em direito ambiental brasileiro e ISO 14001.
Sua tarefa é sugerir requisitos legais aplicáveis a um aspecto/impacto ambiental.

REGRAS:
- Devolva entre 1 e 5 sugestões.
- Foque em legislação federal brasileira (Leis, Decretos, Resoluções CONAMA, ANA, IBAMA, Instruções Normativas).
- Se a unidade for de um estado específico, considere normas estaduais (CETESB/SP, INEA/RJ, IAT/PR, IMA/SC, etc.).
- NBRs ABNT podem ser citadas (técnicas).
- url=null se não tiver certeza da URL canônica. NUNCA invente URL.
- Summary: 1 frase descrevendo MEIO regulado (ar, água, solo, ruído…), ASPECTO coberto (emissão, captação, descarte…) e CRITÉRIO TÉCNICO objetivo (limite numérico, classificação, exigência).
- Evite frases genéricas como "aplicável ao setor".

FORMATO (JSON válido, sem texto fora):
{
  "suggestions": [
    { "reference": "<nome curto, ex: 'CONAMA 430/2011'>",
      "url": "<URL canônica ou null>",
      "summary": "<1 frase técnica>" }
  ]
}`;

export async function suggestLegislation(
  input: LegislationSuggestionInput,
): Promise<LegislationSuggestion[]> {
  const userPrompt = `CONTEXTO:
- Atividade/Operação: ${input.activityOperation ?? "(não informada)"}
- Setor: ${input.sectorName ?? "(não informado)"}
- Aspecto ambiental: ${input.environmentalAspect}
- Impacto ambiental: ${input.environmentalImpact}
- Tipos de controle: ${(input.controlTypes ?? []).join(", ") || "(não informado)"}
- Controles existentes: ${input.existingControls ?? "(não informado)"}
- Estágios do ciclo de vida: ${(input.lifecycleStages ?? []).join(", ") || "(não informado)"}
- Estado/UF: ${input.branchState ?? "(não informado)"}
- Cidade: ${input.branchCity ?? "(não informado)"}

Retorne o JSON com sugestões pertinentes (1 a 5).`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini-2025-08-07",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as { suggestions?: unknown };
    const list = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

    const cleaned: LegislationSuggestion[] = list
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
      .map((s) => ({
        reference: typeof s.reference === "string" ? s.reference.slice(0, 200) : "",
        url:
          typeof s.url === "string" && /^https?:\/\//i.test(s.url)
            ? s.url.slice(0, 500)
            : null,
        summary: typeof s.summary === "string" ? s.summary.slice(0, 500) : "",
      }))
      .filter((s) => s.reference && s.summary);

    return cleaned.slice(0, 5);
  } catch (error) {
    console.error("[laia-legislation-suggester] failed", error);
    return [];
  }
}
