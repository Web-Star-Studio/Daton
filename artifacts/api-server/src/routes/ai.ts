import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { pool } from "@workspace/db";

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

const SYSTEM_PROMPT = `Você é o Daton AI, assistente inteligente da plataforma Daton — um sistema SaaS de gestão de qualidade, meio ambiente e compliance (SGQ) baseado na ISO 14001.

Seu papel é ajudar os usuários a entender seus dados de conformidade, legislações aplicáveis, unidades e status geral da organização. Você responde sempre em português brasileiro (pt-BR), de forma clara e objetiva.

Você tem acesso a uma ferramenta chamada "query_database" que permite consultar o banco de dados da organização do usuário. Use-a sempre que precisar de dados concretos para responder.

Esquema do banco de dados disponível:
- organizations (id, name, nome_fantasia, cnpj, created_at, updated_at)
- users (id, name, email, organization_id, created_at, updated_at)
- units (id, organization_id, name, code, cnpj, type, status, cep, address, street_number, neighborhood, city, state, country, created_at, updated_at)
- legislations (id, organization_id, title, number, description, tipo_norma, emissor, level, status, uf, municipality, macrotema, subtema, applicability, publication_date, source_url, applicable_articles, review_frequency_days, observations, general_observations, created_at, updated_at)
  - IMPORTANTE: tipo_norma contém o tipo completo como "RESOLUÇÃO CNEN", "LEI", "PORTARIA DNIT", "PORTARIA CONJUNTA COTEC-COANA", "NBR", "INSTRUÇÃO NORMATIVA IBAMA", "CONSTITUIÇÃO FEDERAL". NÃO separe em tipo + emissor. Use ILIKE para buscas flexíveis, ex: WHERE tipo_norma ILIKE '%RESOLUÇÃO CNEN%'
- unit_legislations (id, unit_id, legislation_id, compliance_status, notes, evidence_url, evaluated_at, created_at, updated_at)
  - compliance_status pode ser: 'nao_avaliado', 'conforme', 'nao_conforme', 'parcialmente_conforme'
- evidence_attachments (id, unit_legislation_id, file_name, file_size, content_type, object_path, uploaded_at)

Regras importantes:
- SEMPRE filtre por organization_id = $ORG_ID nas queries (será substituído automaticamente).
- Use SOMENTE consultas SELECT (leitura). Nunca INSERT, UPDATE, DELETE.
- SEMPRE use ILIKE ao buscar por texto (nomes, tipos, títulos). Nunca use = para strings que o usuário informou.
- Responda de forma amigável e profissional.
- Ao apresentar dados tabelares, use formato legível.
- Se não tiver certeza, diga que não tem a informação ao invés de inventar.
- Quando não precisar consultar o banco para responder, responda diretamente sem usar a ferramenta.`;

const DB_QUERY_TOOL = {
  type: "function" as const,
  function: {
    name: "query_database",
    description: "Executa uma consulta SQL SELECT somente leitura no banco de dados da organização do usuário. Use para obter dados sobre legislações, unidades, conformidade, etc. SEMPRE inclua WHERE organization_id = $ORG_ID para filtrar pela organização correta. Em tabelas que não têm organization_id diretamente (como unit_legislations), faça JOIN com a tabela que tem.",
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "Consulta SQL SELECT a executar. Use $ORG_ID como placeholder para o ID da organização.",
        },
      },
      required: ["sql"],
    },
  },
};

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

  const systemPrompt = SYSTEM_PROMPT.replace(/\$ORG_ID/g, String(organizationId));

  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    let fullResponse = "";
    let currentMessages = chatMessages;
    let maxToolCalls = 5;

    while (maxToolCalls > 0) {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini-2025-08-07",
        max_completion_tokens: 8192,
        messages: currentMessages,
        tools: [DB_QUERY_TOOL],
        stream: true,
      });

      let toolCallId = "";
      let toolCallName = "";
      let toolCallArgs = "";
      let hasToolCall = false;

      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          fullResponse += delta.content;
          res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
        }

        if (delta?.tool_calls && delta.tool_calls.length > 0) {
          hasToolCall = true;
          const tc = delta.tool_calls[0];
          if (tc.id) toolCallId = tc.id;
          if (tc.function?.name) toolCallName = tc.function.name;
          if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
        }
      }

      if (!hasToolCall) break;

      if (toolCallName === "query_database") {
        let queryResult: { rows: Record<string, unknown>[]; error?: string };
        try {
          const parsed = JSON.parse(toolCallArgs);
          queryResult = await executeReadOnlyQuery(parsed.sql, organizationId);
        } catch {
          queryResult = { rows: [], error: "Erro ao parsear argumentos da ferramenta" };
        }

        const toolResultContent = queryResult.error
          ? `Erro: ${queryResult.error}`
          : JSON.stringify(queryResult.rows, null, 2);

        currentMessages = [
          ...currentMessages,
          {
            role: "assistant" as const,
            content: fullResponse || "",
            tool_calls: [{
              id: toolCallId,
              type: "function" as const,
              function: { name: toolCallName, arguments: toolCallArgs },
            }],
          } as any,
          {
            role: "tool" as const,
            tool_call_id: toolCallId,
            content: toolResultContent,
          } as any,
        ];

        fullResponse = "";
        maxToolCalls--;
      } else {
        break;
      }
    }

    if (fullResponse) {
      await db.insert(messages).values({
        conversationId: convId,
        role: "assistant",
        content: fullResponse,
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
