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

  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(router);
  });

  // ─── Single auto-tag (/legislations/:legId/auto-tag) ───────────────────────

  describe("POST /organizations/:orgId/legislations/:legId/auto-tag", () => {
    it("uses max_completion_tokens and returns tagged legislation", async () => {
      const response = await request(app)
        .post("/organizations/1/legislations/10/auto-tag")
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        legislationId: 10,
        tags: ["saude_trabalhador", "nr17_ergonomia"],
      });
      expect(createCompletionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-5-mini-2025-08-07",
          max_completion_tokens: 2000,
        }),
      );
      expect(createCompletionMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ temperature: expect.anything() }),
      );
      expect(createCompletionMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: expect.anything() }),
      );
    });

    it("returns 403 when orgId does not match the authenticated organization", async () => {
      const response = await request(app)
        .post("/organizations/999/legislations/10/auto-tag")
        .send();

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "Acesso negado" });
      expect(createCompletionMock).not.toHaveBeenCalled();
    });

    it("returns 404 when the legislation is not found", async () => {
      whereSelectMock.mockResolvedValue([]);

      const response = await request(app)
        .post("/organizations/1/legislations/10/auto-tag")
        .send();

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Legislação não encontrada" });
    });

    it("returns 500 when the OpenAI call throws", async () => {
      createCompletionMock.mockRejectedValue(new Error("OpenAI unavailable"));

      const response = await request(app)
        .post("/organizations/1/legislations/10/auto-tag")
        .send();

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Erro ao classificar legislação" });
    });

    it("filters out tags that are not in the vocabulary", async () => {
      createCompletionMock.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ tags: ["saude_trabalhador", "tag_invalida_xyz"] }) } }],
      });

      const response = await request(app)
        .post("/organizations/1/legislations/10/auto-tag")
        .send();

      expect(response.status).toBe(200);
      expect(response.body.tags).toEqual(["saude_trabalhador"]);
    });

    it("returns empty tags when OpenAI returns invalid JSON", async () => {
      createCompletionMock.mockResolvedValue({
        choices: [{ message: { content: "not-json{{" } }],
      });

      const response = await request(app)
        .post("/organizations/1/legislations/10/auto-tag")
        .send();

      expect(response.status).toBe(200);
      expect(response.body.tags).toEqual([]);
    });

    it("returns empty tags when OpenAI response has no tags array", async () => {
      createCompletionMock.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ result: "none" }) } }],
      });

      const response = await request(app)
        .post("/organizations/1/legislations/10/auto-tag")
        .send();

      expect(response.status).toBe(200);
      expect(response.body.tags).toEqual([]);
    });

    it("omits null optional fields from the prompt content", async () => {
      whereSelectMock.mockResolvedValue([
        { id: 10, organizationId: 1, title: "NR-17", description: null, macrotema: null, subtema: null, tipoNorma: null, emissor: null },
      ]);

      const response = await request(app)
        .post("/organizations/1/legislations/10/auto-tag")
        .send();

      expect(response.status).toBe(200);
      const userMessage = createCompletionMock.mock.calls[0][0].messages[1].content as string;
      expect(userMessage).not.toContain("Descrição");
      expect(userMessage).not.toContain("Macrotema");
      expect(userMessage).toContain("NR-17");
    });
  });

  // ─── Batch auto-tag (/legislations/auto-tag/batch) ─────────────────────────

  describe("POST /organizations/:orgId/legislations/auto-tag/batch", () => {
    it("returns 403 when orgId does not match the authenticated organization", async () => {
      const response = await request(app)
        .post("/organizations/999/legislations/auto-tag/batch")
        .send({});

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "Acesso negado" });
    });

    it("returns 200 JSON when no legislations match (empty result)", async () => {
      whereSelectMock.mockResolvedValue([]);

      const response = await request(app)
        .post("/organizations/1/legislations/auto-tag/batch")
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        total: 0,
        tagged: 0,
        errors: 0,
        message: "Nenhuma legislação para classificar",
      });
    });

    it("streams SSE events for each legislation and emits complete event", async () => {
      whereSelectMock.mockResolvedValue([
        { id: 1, organizationId: 1, title: "Lei A", description: null, macrotema: null, subtema: null, tipoNorma: null, emissor: null },
        { id: 2, organizationId: 1, title: "Lei B", description: null, macrotema: null, subtema: null, tipoNorma: null, emissor: null },
      ]);

      const response = await request(app)
        .post("/organizations/1/legislations/auto-tag/batch")
        .send({});

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");

      const events = response.text.split("\n\n").filter(Boolean).map((chunk) => {
        const line = chunk.replace(/^data: /, "");
        return JSON.parse(line) as Record<string, unknown>;
      });

      expect(events[0]).toMatchObject({ type: "started", total: 2 });
      expect(events.filter((e) => e.type === "progress")).toHaveLength(2);
      expect(events.at(-1)).toMatchObject({ type: "complete", total: 2, tagged: 2, errors: 0 });
    });

    it("records errors in the SSE stream when autoTagLegislation throws", async () => {
      whereSelectMock.mockResolvedValue([
        { id: 5, organizationId: 1, title: "Lei Falha", description: null, macrotema: null, subtema: null, tipoNorma: null, emissor: null },
      ]);
      createCompletionMock.mockRejectedValue(new Error("timeout"));

      const response = await request(app)
        .post("/organizations/1/legislations/auto-tag/batch")
        .send({});

      const events = response.text.split("\n\n").filter(Boolean).map((chunk) => {
        return JSON.parse(chunk.replace(/^data: /, "")) as Record<string, unknown>;
      });

      const complete = events.find((e) => e.type === "complete");
      expect(complete).toMatchObject({ errors: 1, tagged: 0 });
      const progress = events.find((e) => e.type === "progress");
      expect(progress).toMatchObject({ error: true });
    });

    it("passes ids filter to the query when ids array is provided", async () => {
      whereSelectMock.mockResolvedValue([]);

      await request(app)
        .post("/organizations/1/legislations/auto-tag/batch")
        .send({ ids: [3, 7] });

      // inArray should have been called for the ids filter
      const { inArray } = await import("drizzle-orm");
      expect(inArray).toHaveBeenCalled();
    });
  });
});
