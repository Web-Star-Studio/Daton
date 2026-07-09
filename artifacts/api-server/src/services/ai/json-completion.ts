/** Raised when the model answered, but not with usable JSON. Carries a message fit for the UI. */
export class AiCompletionError extends Error {
  override readonly name = "AiCompletionError";
}

interface ChatCompletionLike {
  choices?: Array<
    | {
        finish_reason?: string | null;
        message?: { content?: string | null } | null;
      }
    | undefined
  >;
  usage?: unknown;
}

/**
 * Reads the JSON payload out of a chat completion, refusing to invent success.
 *
 * The gpt-5 family reasons before answering, and those reasoning tokens come out
 * of the same `max_completion_tokens` budget as the visible text. Exhaust it and
 * the API returns `finish_reason: "length"` with the content empty or cut mid-JSON.
 * A `content || "{}"` fallback turns that into a draft where every field is blank —
 * the user is told the AI "had no suggestions" and the server logs nothing.
 *
 * So: fail loudly, say which limit was hit, and log `usage` so the next occurrence
 * is diagnosable without reproducing it.
 */
export function readJsonCompletion<T>(response: ChatCompletionLike, label: string): T {
  const choice = response.choices?.[0];
  const finishReason = choice?.finish_reason ?? null;
  const content = choice?.message?.content?.trim() ?? "";
  const truncated = finishReason === "length";

  if (!content) {
    console.error(`[${label}] resposta vazia da IA`, { finishReason, usage: response.usage });
    throw new AiCompletionError(
      truncated
        ? "A IA consumiu todo o limite de tokens raciocinando e não chegou a responder. Tente novamente."
        : "A IA devolveu uma resposta vazia. Tente novamente.",
    );
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    console.error(`[${label}] JSON inválido da IA`, {
      finishReason,
      usage: response.usage,
      contentLength: content.length,
    });
    throw new AiCompletionError(
      truncated
        ? "A resposta da IA foi cortada pelo limite de tokens. Tente novamente."
        : "A IA devolveu uma resposta em formato inválido. Tente novamente.",
    );
  }
}
