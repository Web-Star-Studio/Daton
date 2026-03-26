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

    createCompletionMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tags: ["saude_trabalhador", "nr17_ergonomia"],
            }),
          },
        },
      ],
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
        max_completion_tokens: 2000,
      }),
    );
    expect(createCompletionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: expect.anything(),
      }),
    );
  });
});
