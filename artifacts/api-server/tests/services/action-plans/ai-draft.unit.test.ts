import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: createMock } } },
}));

import { draftActionPlanFromProblem } from "../../../src/services/action-plans/ai-draft";
import { AiCompletionError } from "../../../src/services/ai/json-completion";

const VALID = JSON.stringify({
  plan5w2h: {
    what: "Reciclar o treinamento de conferência do rastreador",
    why: "Garantir que o teste do motorista seja verificado",
    where: "Porto Real",
    who: "Auxiliar administrativo",
    when: "Em até 30 dias",
    how: "Treinamento com lista de presença",
    howMuch: "Custo baixo",
  },
  rootCause: "Falta de treinamento sobre o procedimento de conferência.",
  rootCauseWhys: ["O teste não foi conferido.", "Porque o colaborador não foi treinado."],
});

function reply(content: string | null, finishReason = "stop") {
  return {
    choices: [{ finish_reason: finishReason, message: { content } }],
    usage: { completion_tokens_details: { reasoning_tokens: 900 } },
  };
}

const input = { problem: "Ficha preenchida sem conferência do rastreador no sistema." };

describe("draftActionPlanFromProblem", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the 5W2H plan and the whys chain from a valid completion", async () => {
    createMock.mockResolvedValue(reply(VALID));

    const draft = await draftActionPlanFromProblem(input);

    expect(Object.keys(draft.plan5w2h)).toHaveLength(7);
    expect(draft.rootCause).toContain("Falta de treinamento");
    expect(draft.rootCauseWhys).toHaveLength(2);
  });

  /**
   * gpt-5-mini is a reasoning model: reasoning tokens come out of the same
   * max_completion_tokens budget as the visible answer. With the old budget the
   * call sometimes came back empty, and `content || "{}"` turned that into a
   * successful-looking draft with every field blank.
   */
  it("reserves enough budget for reasoning and caps the reasoning effort", async () => {
    createMock.mockResolvedValue(reply(VALID));

    await draftActionPlanFromProblem(input);

    const params = createMock.mock.calls[0][0];
    expect(params.max_completion_tokens).toBeGreaterThanOrEqual(4000);
    expect(params.reasoning_effort).toBe("low");
  });

  it("fails loudly when reasoning ate the whole budget, instead of returning a blank draft", async () => {
    createMock.mockResolvedValue(reply("", "length"));

    await expect(draftActionPlanFromProblem(input)).rejects.toThrow(AiCompletionError);
    await expect(draftActionPlanFromProblem(input)).rejects.toThrow(/limite de tokens/i);
  });

  it("fails loudly when the JSON was cut in half by the token limit", async () => {
    createMock.mockResolvedValue(reply('{"plan5w2h": {"what": "Recic', "length"));

    await expect(draftActionPlanFromProblem(input)).rejects.toThrow(/cortada pelo limite de tokens/i);
  });

  it("still drops fields the model omitted, without failing", async () => {
    createMock.mockResolvedValue(reply(JSON.stringify({ plan5w2h: { what: "Fazer X" } })));

    const draft = await draftActionPlanFromProblem(input);

    expect(draft.plan5w2h).toEqual({ what: "Fazer X" });
    expect(draft.rootCause).toBeNull();
    expect(draft.rootCauseWhys).toEqual([]);
  });
});
