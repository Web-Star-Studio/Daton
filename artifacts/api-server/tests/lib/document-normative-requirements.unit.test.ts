import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createCompletionMock,
  selectMock,
  fromMock,
  whereMock,
  andMock,
  eqMock,
  inArrayMock,
} = vi.hoisted(() => ({
  createCompletionMock: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
  andMock: vi.fn(() => "and-clause"),
  eqMock: vi.fn(() => "eq-clause"),
  inArrayMock: vi.fn(() => "in-array-clause"),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: createCompletionMock,
      },
    },
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: selectMock,
  },
  documentsTable: {
    id: "documents.id",
    title: "documents.title",
    organizationId: "documents.organization_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: andMock,
  eq: eqMock,
  inArray: inArrayMock,
}));

import {
  getNormativeRequirementSuggestions,
  normalizeNormativeRequirements,
} from "../../src/lib/document-normative-requirements";

describe("document normative requirements service", () => {
  beforeEach(() => {
    createCompletionMock.mockReset();
    selectMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    andMock.mockClear();
    eqMock.mockClear();
    inArrayMock.mockClear();

    whereMock.mockResolvedValue([{ id: 10, title: "Manual da Qualidade" }]);
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
    createCompletionMock.mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              suggestions: [
                " ISO 9001:2015 7.5 ",
                "iso 9001:2015 7.5",
                "ISO 14001:2015 6.1.3",
              ],
            }),
          },
        },
      ],
      usage: { completion_tokens_details: { reasoning_tokens: 500 } },
    });
  });

  it("normalizes free-text requirements", () => {
    expect(
      normalizeNormativeRequirements([
        " ISO 9001:2015 7.5 ",
        "",
        "iso 9001:2015 7.5",
        "ISO 14001:2015 6.1.3",
      ]),
    ).toEqual(["ISO 9001:2015 7.5", "ISO 14001:2015 6.1.3"]);
  });

  it("loads references from the database and excludes already selected requirements", async () => {
    const result = await getNormativeRequirementSuggestions({
      orgId: 42,
      title: "Procedimento de controle documental",
      type: "procedimento",
      referenceIds: [10],
      currentRequirements: ["ISO 9001:2015 7.5"],
    });

    expect(result).toEqual(["ISO 14001:2015 6.1.3"]);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(inArrayMock).toHaveBeenCalledWith("documents.id", [10]);
    expect(eqMock).toHaveBeenCalledWith("documents.organization_id", 42);
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
    expect(createCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini-2025-08-07",
        max_completion_tokens: 4000,
        reasoning_effort: "low",
      }),
    );
    expect(createCompletionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: expect.anything(),
      }),
    );
    expect(createCompletionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: expect.anything(),
      }),
    );
  });

  // With gpt-5-mini this was the real production behavior: reasoning tokens ate the
  // whole 400-token budget, the API returned finish_reason "length" with empty
  // content, and `content || "{}"` turned that into a silent empty list. The guard
  // must fail loudly instead.
  it("throws when the model spent the whole budget reasoning", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createCompletionMock.mockResolvedValueOnce({
      choices: [{ finish_reason: "length", message: { content: "" } }],
      usage: { completion_tokens_details: { reasoning_tokens: 4000 } },
    });

    await expect(
      getNormativeRequirementSuggestions({
        orgId: 42,
        title: "Procedimento",
        type: "procedimento",
        referenceIds: [10],
        currentRequirements: [],
      }),
    ).rejects.toThrow(/limite de tokens/i);
  });
});
