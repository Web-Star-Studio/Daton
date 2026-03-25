import { and, eq, inArray } from "drizzle-orm";
import { db, documentsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const DOCUMENT_NORMATIVE_REQUIREMENTS_SYSTEM_PROMPT = `Você é um especialista em SGQ e requisitos normativos.

Sua tarefa é sugerir requisitos normativos diretamente relacionados a um documento do SGQ com base apenas nos metadados informados.

REGRAS:
1. Retorne somente um JSON válido no formato {"suggestions":["..."]}.
2. Sugira no máximo 8 itens.
3. Prefira referências objetivas de normas ou cláusulas, como "ISO 9001:2015 7.5" ou "ISO 9001:2015 4.4".
4. Não explique o raciocínio.
5. Não repita itens.
6. Se não houver confiança suficiente, retorne {"suggestions":[]}.`;

export function normalizeNormativeRequirements(
  requirements?: string[] | null,
): string[] {
  if (!requirements?.length) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const requirement of requirements) {
    const value = requirement.trim();
    if (!value) {
      continue;
    }

    const key = value.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

export async function getReferenceDocumentTitles(
  docIds: number[],
  orgId: number,
): Promise<string[]> {
  if (docIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
    })
    .from(documentsTable)
    .where(
      and(
        inArray(documentsTable.id, docIds),
        eq(documentsTable.organizationId, orgId),
      ),
    );

  return rows.map((row) => row.title);
}

export async function suggestNormativeRequirements(input: {
  title: string;
  type: string;
  referenceTitles: string[];
  currentRequirements: string[];
}): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini-2025-08-07",
    messages: [
      {
        role: "system",
        content: DOCUMENT_NORMATIVE_REQUIREMENTS_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          `Título: ${input.title}`,
          `Tipo: ${input.type}`,
          input.referenceTitles.length > 0
            ? `Referências relacionadas: ${input.referenceTitles.join("; ")}`
            : "Referências relacionadas: nenhuma",
          input.currentRequirements.length > 0
            ? `Requisitos já selecionados: ${input.currentRequirements.join("; ")}`
            : "Requisitos já selecionados: nenhum",
        ].join("\n"),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 400,
  });

  const raw = response.choices[0]?.message?.content || "{}";

  try {
    const parsed = JSON.parse(raw) as { suggestions?: unknown };
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter(
          (item): item is string => typeof item === "string",
        )
      : [];

    const normalizedSuggestions = normalizeNormativeRequirements(suggestions);
    const existing = new Set(
      input.currentRequirements.map((requirement) =>
        requirement.toLocaleLowerCase("pt-BR"),
      ),
    );

    return normalizedSuggestions
      .filter(
        (suggestion) => !existing.has(suggestion.toLocaleLowerCase("pt-BR")),
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

export async function getNormativeRequirementSuggestions(input: {
  orgId: number;
  title: string;
  type: string;
  referenceIds?: number[];
  currentRequirements?: string[];
}): Promise<string[]> {
  const currentRequirements = normalizeNormativeRequirements(
    input.currentRequirements,
  );
  const referenceTitles = await getReferenceDocumentTitles(
    input.referenceIds ?? [],
    input.orgId,
  );

  return suggestNormativeRequirements({
    title: input.title,
    type: input.type,
    referenceTitles,
    currentRequirements,
  });
}
