import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionMock } = vi.hoisted(() => ({ createCompletionMock: vi.fn() }));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: createCompletionMock } } },
}));

import { suggestLegislation } from "../../../src/services/laia/legislation-suggester";
import { AiCompletionError } from "../../../src/services/ai/json-completion";

const input = {
  environmentalAspect: "Geração de óleo lubrificante usado",
  environmentalImpact: "Contaminação de solo e água",
  branchState: "RJ",
};

function reply(content: string | null, finishReason = "stop") {
  return {
    choices: [{ finish_reason: finishReason, message: { content } }],
    usage: { completion_tokens_details: { reasoning_tokens: 900 } },
  };
}

describe("suggestLegislation", () => {
  beforeEach(() => {
    createCompletionMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reserves budget for reasoning and caps the effort", async () => {
    createCompletionMock.mockResolvedValue(
      reply(JSON.stringify({ suggestions: [] })),
    );

    await suggestLegislation(input);

    const params = createCompletionMock.mock.calls[0][0];
    expect(params.max_completion_tokens).toBeGreaterThanOrEqual(4000);
    expect(params.reasoning_effort).toBe("low");
  });

  it("returns the cleaned suggestions on a valid completion", async () => {
    createCompletionMock.mockResolvedValue(
      reply(
        JSON.stringify({
          suggestions: [
            {
              reference: "Resolução CONAMA 362/2005",
              url: "https://example.gov.br/conama362",
              summary: "Destinação de óleo lubrificante usado.",
            },
          ],
        }),
      ),
    );

    const out = await suggestLegislation(input);

    expect(out).toHaveLength(1);
    expect(out[0].reference).toBe("Resolução CONAMA 362/2005");
  });

  /**
   * The bug in production: reasoning ate the whole 1500-token budget, the API
   * returned finish_reason "length" with empty content, and the surrounding
   * try/catch swallowed it into an empty list. It must now surface as a failure,
   * so the route answers 502 instead of "no legislation found".
   */
  it("throws when reasoning consumed the whole budget, rather than returning []", async () => {
    createCompletionMock.mockResolvedValue(reply("", "length"));

    await expect(suggestLegislation(input)).rejects.toThrow(AiCompletionError);
    await expect(suggestLegislation(input)).rejects.toThrow(/limite de tokens/i);
  });
});
