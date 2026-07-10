import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createCompletionMock,
  selectMock,
  fromMock,
  whereSelectMock,
  updateMock,
  setMock,
  whereUpdateMock,
  eqMock,
  andMock,
  notifyLegislationBecameRelevantMock,
} = vi.hoisted(() => ({
  createCompletionMock: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereSelectMock: vi.fn(),
  updateMock: vi.fn(),
  setMock: vi.fn(),
  whereUpdateMock: vi.fn(),
  eqMock: vi.fn((...args: unknown[]) => ({ kind: "eq", args })),
  andMock: vi.fn((...args: unknown[]) => ({ kind: "and", args })),
  notifyLegislationBecameRelevantMock: vi.fn(),
}));

vi.mock("../../src/middlewares/auth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = {
      userId: 1,
      organizationId: 1,
      role: "org_admin",
    };
    next();
  },
  requireWriteAccess: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next();
  },
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

vi.mock("../../src/lib/legislations", () => ({
  notifyLegislationBecameRelevant: notifyLegislationBecameRelevantMock,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: selectMock,
    update: updateMock,
  },
  legislationsTable: {
    id: "legislations.id",
    organizationId: "legislations.organization_id",
    tags: "legislations.tags",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: eqMock,
  and: andMock,
  inArray: vi.fn(),
  sql: vi.fn(),
}));

import router from "../../src/routes/auto-tag";

describe("auto-tag route", () => {
  beforeEach(() => {
    createCompletionMock.mockReset();
    selectMock.mockReset();
    fromMock.mockReset();
    whereSelectMock.mockReset();
    updateMock.mockReset();
    setMock.mockReset();
    whereUpdateMock.mockReset();
    eqMock.mockClear();
    andMock.mockClear();
    notifyLegislationBecameRelevantMock.mockReset();

    createCompletionMock.mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              tags: ["saude_trabalhador", "nr17_ergonomia"],
            }),
          },
        },
      ],
      usage: { completion_tokens_details: { reasoning_tokens: 700 } },
    });

    whereSelectMock.mockResolvedValue([
      {
        id: 10,
        organizationId: 1,
        title: "NR-17 Ergonomia",
        description: "Dispõe sobre ergonomia e saúde do trabalhador.",
        macrotema: "Saúde e Segurança do Trabalho",
        subtema: "Ergonomia",
        tipoNorma: "NR",
        emissor: "MTE",
      },
    ]);
    fromMock.mockReturnValue({ where: whereSelectMock });
    selectMock.mockReturnValue({ from: fromMock });
    whereUpdateMock.mockResolvedValue(undefined);
    setMock.mockReturnValue({ where: whereUpdateMock });
    updateMock.mockReturnValue({ set: setMock });
    notifyLegislationBecameRelevantMock.mockResolvedValue(undefined);
  });

  it("uses max_completion_tokens when auto-tagging legislation", async () => {
    const app = express();
    app.use(express.json());
    app.use(router);

    const response = await request(app)
      .post("/organizations/1/legislations/10/auto-tag")
      .send();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      legislationId: 10,
      tags: ["saude_trabalhador", "nr17_ergonomia"],
    });
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
    expect(notifyLegislationBecameRelevantMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        id: 10,
        title: "NR-17 Ergonomia",
        tags: ["saude_trabalhador", "nr17_ergonomia"],
      }),
      undefined,
    );
  });

  // If reasoning ate the whole budget (finish_reason "length", empty content), the
  // guard throws; the route must answer 500 and NOT persist empty tags over the
  // legislation's existing ones.
  it("fails loudly and does not overwrite tags when the model returns nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createCompletionMock.mockResolvedValueOnce({
      choices: [{ finish_reason: "length", message: { content: "" } }],
      usage: { completion_tokens_details: { reasoning_tokens: 4000 } },
    });

    const app = express();
    app.use(express.json());
    app.use(router);

    const response = await request(app)
      .post("/organizations/1/legislations/10/auto-tag")
      .send();

    expect(response.status).toBe(500);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
