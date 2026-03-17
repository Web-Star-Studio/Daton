import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { pool } from "@workspace/db";
import { streamDatonAiAssistant } from "../lib/daton-ai-assistant";

const router = Router();

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseConversationId(value: string | string[] | undefined): number | null {
  const convId = parseInt(firstParam(value), 10);
  if (!Number.isFinite(convId) || convId <= 0) {
    return null;
  }

  return convId;
}

async function executeReadOnlyQuery(sql: string, orgId: number): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const sanitized = sql.replace(/\$ORG_ID/g, String(orgId));

  const upper = sanitized.toUpperCase().trim();
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    return { rows: [], error: "Apenas consultas SELECT são permitidas." };
  }

  const forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"];
  for (const word of forbidden) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(sanitized)) {
      return { rows: [], error: `Operação '${word}' não é permitida.` };
    }
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = '5000'");
      const result = await client.query(sanitized);
      const rows = result.rows.slice(0, 100);
      return { rows };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return { rows: [], error: message };
  }
}

router.get("/ai/conversations", requireAuth, async (req: Request, res: Response) => {
  const { userId, organizationId } = req.auth!;

  const convs = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.organizationId, organizationId)))
    .orderBy(desc(conversations.createdAt))
    .limit(20);

  res.json(convs);
});

router.post("/ai/conversations", requireAuth, async (req: Request, res: Response) => {
  const { userId, organizationId } = req.auth!;
  const title = req.body?.title || "Nova conversa";

  const [conv] = await db
    .insert(conversations)
    .values({ userId, organizationId, title })
    .returning();

  res.status(201).json(conv);
});

router.get("/ai/conversations/:convId/messages", requireAuth, async (req: Request, res: Response) => {
  const { userId, organizationId } = req.auth!;
  const convId = parseConversationId(req.params.convId);

  if (convId === null) {
    res.status(400).json({ error: "ID de conversa inválido" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(
      eq(conversations.id, convId),
      eq(conversations.userId, userId),
      eq(conversations.organizationId, organizationId),
    ));

  if (!conv) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(messages.createdAt);

  res.json(msgs);
});

router.post("/ai/conversations/:convId/messages", requireAuth, async (req: Request, res: Response) => {
  const { userId, organizationId } = req.auth!;
  const convId = parseConversationId(req.params.convId);
  const userMessage = req.body?.content;

  if (convId === null) {
    res.status(400).json({ error: "ID de conversa inválido" });
    return;
  }

  if (!userMessage || typeof userMessage !== "string") {
    res.status(400).json({ error: "Conteúdo da mensagem é obrigatório" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(
      eq(conversations.id, convId),
      eq(conversations.userId, userId),
      eq(conversations.organizationId, organizationId),
    ));

  if (!conv) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return;
  }

  await db.insert(messages).values({
    conversationId: convId,
    role: "user",
    content: userMessage,
  });

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(messages.createdAt);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const result = await streamDatonAiAssistant({
      organizationId,
      history: history.map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      })),
      executeReadOnlyQuery,
      onEvent: (event) => {
        if (event.type === "content") {
          res.write(`data: ${JSON.stringify({ content: event.content })}\n\n`);
          return;
        }

        if (event.type === "sources") {
          res.write(`data: ${JSON.stringify({ sources: event.sources })}\n\n`);
        }
      },
    });

    if (result.content) {
      await db.insert(messages).values({
        conversationId: convId,
        role: "assistant",
        content: result.content,
      });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("AI chat error:", err);
    res.write(`data: ${JSON.stringify({ error: "Erro ao processar mensagem" })}\n\n`);
    res.end();
  }
});

export default router;
