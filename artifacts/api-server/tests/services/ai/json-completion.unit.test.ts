import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiCompletionError,
  readJsonCompletion,
} from "../../../src/services/ai/json-completion";

function completion(options: {
  content?: string | null;
  finishReason?: string | null;
  reasoningTokens?: number;
}) {
  return {
    choices: [
      {
        finish_reason: options.finishReason ?? "stop",
        message: { content: options.content ?? null },
      },
    ],
    usage: {
      completion_tokens: 1500,
      completion_tokens_details: { reasoning_tokens: options.reasoningTokens ?? 0 },
    },
  };
}

describe("readJsonCompletion", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a well-formed JSON completion", () => {
    const parsed = readJsonCompletion<{ ok: boolean }>(
      completion({ content: '{"ok":true}' }),
      "teste",
    );

    expect(parsed).toEqual({ ok: true });
  });

  // gpt-5 spends reasoning tokens out of the same max_completion_tokens budget as
  // the visible answer. Exhausting it yields finish_reason="length" with no content —
  // the failure that made "Sugerir plano (IA)" look broken for one user and fine for
  // another on the very same input.
  it("throws a token-budget error when reasoning consumed the whole budget", () => {
    expect(() =>
      readJsonCompletion(
        completion({ content: "", finishReason: "length", reasoningTokens: 1500 }),
        "teste",
      ),
    ).toThrow(AiCompletionError);

    expect(() =>
      readJsonCompletion(
        completion({ content: "", finishReason: "length", reasoningTokens: 1500 }),
        "teste",
      ),
    ).toThrow(/limite de tokens/i);
  });

  it("throws when the answer was cut mid-JSON by the token limit", () => {
    expect(() =>
      readJsonCompletion(
        completion({ content: '{"plan5w2h": {"what": "Reali', finishReason: "length" }),
        "teste",
      ),
    ).toThrow(/cortada pelo limite de tokens/i);
  });

  it("throws a distinct error for an empty answer that was not truncated", () => {
    expect(() => readJsonCompletion(completion({ content: null }), "teste")).toThrow(
      /resposta vazia/i,
    );
  });

  it("throws a distinct error for malformed JSON that was not truncated", () => {
    expect(() => readJsonCompletion(completion({ content: "desculpe, não sei" }), "teste")).toThrow(
      /formato inválido/i,
    );
  });

  it("logs finish_reason and usage so the next failure is diagnosable from the server log", () => {
    const spy = vi.spyOn(console, "error");

    expect(() =>
      readJsonCompletion(
        completion({ content: "", finishReason: "length", reasoningTokens: 1490 }),
        "action-plans/ai-draft",
      ),
    ).toThrow(AiCompletionError);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("action-plans/ai-draft"),
      expect.objectContaining({
        finishReason: "length",
        usage: expect.objectContaining({
          completion_tokens_details: { reasoning_tokens: 1490 },
        }),
      }),
    );
  });
});
