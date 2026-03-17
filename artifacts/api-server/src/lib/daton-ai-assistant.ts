import {
  openai,
  type OpenAI,
} from "@workspace/integrations-openai-ai-server";
import { buildDatonAiSystemPrompt, DATON_AI_DB_QUERY_TOOL } from "./daton-ai";
import {
  buildProductKnowledgeFileSearchTool,
  extractProductKnowledgeSources,
  getDatonAssistantModel,
  isProductKnowledgeSearchEnabled,
  type ProductKnowledgeSource,
} from "./product-knowledge";

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type StreamEvent =
  | { type: "content"; content: string }
  | { type: "sources"; sources: ProductKnowledgeSource[] };

type ExecuteReadOnlyQuery = (
  sql: string,
  orgId: number,
) => Promise<{ rows: Record<string, unknown>[]; error?: string }>;

type PendingFunctionCall = {
  callId: string;
  name: string;
  arguments: string;
};

function buildHistoryInput(history: HistoryMessage[]): OpenAI.Responses.ResponseInput {
  return history.map(
    (message) =>
      ({
        type: "message",
        role: message.role,
        content: message.content,
      }) satisfies OpenAI.Responses.ResponseInputItem,
  );
}

function buildFunctionCallOutputInput(
  callId: string,
  output: string,
): OpenAI.Responses.ResponseInput {
  return [
    {
      type: "function_call_output",
      call_id: callId,
      output,
    },
  ];
}

function getCompletedFunctionCall(
  event: OpenAI.Responses.ResponseOutputItemDoneEvent,
): PendingFunctionCall | null {
  if (event.item.type !== "function_call") return null;

  return {
    callId: event.item.call_id,
    name: event.item.name,
    arguments: event.item.arguments,
  };
}

export async function streamDatonAiAssistant(params: {
  organizationId: number;
  history: HistoryMessage[];
  executeReadOnlyQuery: ExecuteReadOnlyQuery;
  onEvent: (event: StreamEvent) => void;
}) {
  const { organizationId, history, executeReadOnlyQuery, onEvent } = params;

  const instructions = buildDatonAiSystemPrompt(organizationId);
  const tools: OpenAI.Responses.Tool[] = [DATON_AI_DB_QUERY_TOOL];
  if (isProductKnowledgeSearchEnabled()) {
    tools.push(buildProductKnowledgeFileSearchTool());
  }

  let previousResponseId: string | undefined;
  let nextInput: OpenAI.Responses.ResponseInput = buildHistoryInput(history);
  let finalContent = "";
  const sourceMap = new Map<string, ProductKnowledgeSource>();

  for (let iteration = 0; iteration < 6; iteration++) {
    const stream = await openai.responses.create({
      model: getDatonAssistantModel(),
      instructions,
      input: nextInput,
      previous_response_id: previousResponseId,
      tools,
      include: isProductKnowledgeSearchEnabled() ? ["file_search_call.results"] : undefined,
      parallel_tool_calls: false,
      max_output_tokens: 8192,
      stream: true,
    });

    let functionCall: PendingFunctionCall | null = null;
    let completedResponse: OpenAI.Responses.Response | null = null;

    for await (const event of stream as AsyncIterable<OpenAI.Responses.ResponseStreamEvent>) {
      if (event.type === "response.output_text.delta") {
        finalContent += event.delta;
        onEvent({ type: "content", content: event.delta });
        continue;
      }

      if (event.type === "response.output_item.done") {
        const completedFunctionCall = getCompletedFunctionCall(event);
        if (completedFunctionCall) {
          functionCall = completedFunctionCall;
        }
        continue;
      }

      if (event.type === "response.completed") {
        completedResponse = event.response;
        continue;
      }

      if (event.type === "response.failed") {
        throw new Error("A resposta do assistant falhou");
      }

      if (event.type === "error") {
        throw new Error("Erro ao processar resposta do assistant");
      }
    }

    if (completedResponse) {
      previousResponseId = completedResponse.id;
      const sources = extractProductKnowledgeSources(completedResponse);
      for (const source of sources) {
        sourceMap.set(`${source.slug}:${source.version}`, source);
      }
    }

    if (!functionCall) {
      break;
    }

    if (functionCall.name !== "query_database") {
      break;
    }

    let toolResult: { rows: Record<string, unknown>[]; error?: string };
    try {
      const parsed = JSON.parse(functionCall.arguments) as { sql?: unknown };
      toolResult = await executeReadOnlyQuery(String(parsed.sql || ""), organizationId);
    } catch {
      toolResult = { rows: [], error: "Erro ao interpretar argumentos da ferramenta" };
    }

    nextInput = buildFunctionCallOutputInput(
      functionCall.callId,
      toolResult.error ? `Erro: ${toolResult.error}` : JSON.stringify(toolResult.rows, null, 2),
    );
  }

  const sources = Array.from(sourceMap.values());
  if (sources.length > 0) {
    onEvent({ type: "sources", sources });
  }

  return {
    content: finalContent.trim(),
    sources,
  };
}
