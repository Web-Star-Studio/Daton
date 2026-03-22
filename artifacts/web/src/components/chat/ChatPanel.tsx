import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  Sparkles,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";
import type { ProductKnowledgeSource } from "@/lib/product-knowledge-api";

type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  sources?: ProductKnowledgeSource[];
  createdAt?: string;
};

type ConversationSummary = {
  id: number;
  title: string;
  createdAt: string;
};

function buildConversationTitle(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return "Nova conversa";
  return normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized;
}

function formatConversationDate(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isConversationSidebarCollapsed, setIsConversationSidebarCollapsed] =
    useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const loadConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const res = await fetch(resolveApiUrl("/api/ai/conversations"), {
        headers: { ...getAuthHeaders() },
      });

      if (!res.ok) {
        throw new Error("Erro ao carregar conversas");
      }

      const data = (await res.json()) as ConversationSummary[];
      setConversations(data);
      setConversationId((currentConversationId) =>
        currentConversationId ?? data[0]?.id ?? null,
      );
    } catch {
      setConversations([]);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadConversations();
  }, [isOpen, loadConversations]);

  useEffect(() => {
    if (!isOpen || !conversationId || isStreaming) return;

    let cancelled = false;

    const loadMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const res = await fetch(
          resolveApiUrl(`/api/ai/conversations/${conversationId}/messages`),
          {
            headers: { ...getAuthHeaders() },
          },
        );

        if (!res.ok) {
          throw new Error("Erro ao carregar mensagens");
        }

        const data = (await res.json()) as Message[];
        if (!cancelled) {
          setChatMessages(data);
        }
      } catch {
        if (!cancelled) {
          setChatMessages([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMessages(false);
        }
      }
    };

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [conversationId, isOpen, isStreaming]);

  const ensureConversation = useCallback(async (initialText: string): Promise<number> => {
    if (conversationId) return conversationId;

    const res = await fetch(resolveApiUrl("/api/ai/conversations"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ title: buildConversationTitle(initialText) }),
    });

    if (!res.ok) {
      throw new Error("Erro ao criar conversa");
    }

    const conv = (await res.json()) as ConversationSummary;
    setConversationId(conv.id);
    setConversations((prev) => [conv, ...prev.filter((item) => item.id !== conv.id)]);
    return conv.id;
  }, [conversationId]);

  const handleDeleteConversation = async (
    event: React.MouseEvent<HTMLButtonElement>,
    targetConversationId: number,
  ) => {
    event.stopPropagation();
    if (isStreaming) return;

    try {
      const res = await fetch(
        resolveApiUrl(`/api/ai/conversations/${targetConversationId}`),
        {
          method: "DELETE",
          headers: { ...getAuthHeaders() },
        },
      );

      if (!res.ok) {
        throw new Error("Erro ao excluir conversa");
      }

      const remaining = conversations.filter(
        (conversation) => conversation.id !== targetConversationId,
      );
      setConversations(remaining);

      if (conversationId === targetConversationId) {
        setConversationId(remaining[0]?.id ?? null);
        setChatMessages([]);
      }
    } catch {
      // Keep current UI state if deletion fails.
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsStreaming(true);
    let assistantPlaceholderAdded = false;

    try {
      const convId = await ensureConversation(text);

      const res = await fetch(
        resolveApiUrl(`/api/ai/conversations/${convId}/messages`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ content: text }),
        },
      );

      if (!res.ok) {
        throw new Error("Erro ao enviar mensagem");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Sem stream");

      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      assistantPlaceholderAdded = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.content) {
              assistantContent += data.content;
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  sources: updated[updated.length - 1]?.sources,
                };
                return updated;
              });
            }

            if (data.sources) {
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  sources: data.sources,
                };
                return updated;
              });
            }

            if (data.error) {
              assistantContent += `\n⚠️ ${data.error}`;
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  sources: updated[updated.length - 1]?.sources,
                };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setChatMessages((prev) => {
        const base = assistantPlaceholderAdded ? prev.slice(0, -1) : prev;
        return [
          ...base,
          {
            role: "assistant",
            content:
              "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
          },
        ];
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSelectConversation = (nextConversationId: number) => {
    if (isStreaming || nextConversationId === conversationId) return;
    setConversationId(nextConversationId);
    setChatMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNewChat = () => {
    setConversationId(null);
    setChatMessages([]);
    setInput("");
    setIsStreaming(false);
  };

  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    }
  }, [isOpen]);

  const handleAnimationEnd = () => {
    if (!isOpen) {
      setShouldRender(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        "flex h-full w-[480px] max-w-[calc(100vw-2rem)] flex-shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card/76 shadow-sm backdrop-blur-md",
        isOpen
          ? "animate-[chatSlideIn_250ms_ease-in-out_forwards]"
          : "animate-[chatSlideOut_250ms_ease-in-out_forwards]",
      )}
      onAnimationEnd={handleAnimationEnd}
    >
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border/60 bg-card/34 backdrop-blur-md transition-[width] duration-200",
          isConversationSidebarCollapsed ? "w-12" : "w-[200px]",
        )}
      >
        <div
          className={cn(
            "h-14 flex items-center border-b border-border/60",
            isConversationSidebarCollapsed
              ? "justify-center px-2"
              : "justify-between px-4",
          )}
        >
          {isConversationSidebarCollapsed ? (
            <button
              onClick={() =>
                setIsConversationSidebarCollapsed(
                  !isConversationSidebarCollapsed,
                )
              }
              className="p-1.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-background transition-colors cursor-pointer"
              title="Expandir conversas"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          ) : (
            <>
              <span className="text-[13px] font-semibold">Conversas</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleNewChat}
                  disabled={isStreaming}
                  className="p-1.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Nova conversa"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    setIsConversationSidebarCollapsed(
                      !isConversationSidebarCollapsed,
                    )
                  }
                  className="p-1.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-background transition-colors cursor-pointer"
                  title="Minimizar conversas"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {!isConversationSidebarCollapsed && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {isLoadingConversations ? (
              <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Carregando conversas...
              </div>
            ) : conversations.length === 0 ? (
              <div className="px-3 py-4 text-[12px] text-muted-foreground">
                Nenhuma conversa anterior.
              </div>
            ) : (
              conversations.map((conversation) => {
                const active = conversation.id === conversationId;

                return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => handleSelectConversation(conversation.id)}
                  disabled={isStreaming}
                    className={cn(
                      "w-full text-left rounded-xl px-3 py-2.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                      active
                        ? "border border-border/60 bg-card/68 shadow-sm backdrop-blur-sm"
                        : "hover:bg-card/42",
                    )}
                  >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground line-clamp-2">
                        {conversation.title || "Nova conversa"}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatConversationDate(conversation.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) =>
                        handleDeleteConversation(event, conversation.id)
                      }
                      disabled={isStreaming}
                      className="mt-0.5 p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      title="Apagar conversa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </button>
              );
            })
            )}
          </div>
        )}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border/60 bg-card/28 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">Daton AI</span>
            {isStreaming && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Gerando resposta
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewChat}
              disabled={isStreaming}
              className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors cursor-pointer"
            >
              Nova conversa
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isLoadingMessages ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground px-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando mensagens...
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <Sparkles className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-[13px] text-muted-foreground mb-1">
                Olá! Sou o assistente Daton AI.
              </p>
              <p className="text-[12px] text-muted-foreground/70">
                Posso explicar como o sistema funciona e consultar dados reais da sua organização quando necessário.
              </p>
            </div>
          ) : (
            chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed backdrop-blur-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card/46 text-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <AssistantMessage
                      content={msg.content}
                      sources={msg.sources}
                      isStreaming={isStreaming && i === chatMessages.length - 1}
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="flex-shrink-0 border-t border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre seus dados..."
              disabled={isStreaming}
              className="flex-1 rounded-xl border-none bg-card/42 px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({
  content,
  sources,
  isStreaming,
}: {
  content: string;
  sources?: ProductKnowledgeSource[];
  isStreaming?: boolean;
}) {
  const hasContent = Boolean(content);
  const messageSources = sources ?? [];
  const hasSources = messageSources.length > 0;

  if (!hasContent && !hasSources && !isStreaming) return null;

  const parts = hasContent ? content.split(/(\*\*[^*]+\*\*)/g) : [];

  return (
    <div className="space-y-3">
      {!hasContent && isStreaming && <TypingIndicator />}

      {hasContent && (
        <div className="space-y-2">
          <span className="whitespace-pre-wrap">
            {parts.map((part, i) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return <strong key={i}>{part.slice(2, -2)}</strong>;
              }
              return <span key={i}>{part}</span>;
            })}
          </span>

          {isStreaming && (
            <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Continuando resposta...
            </div>
          )}
        </div>
      )}

      {hasSources && (
        <div className="rounded-xl border border-border/60 bg-card/38 px-3 py-2 backdrop-blur-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Fontes
          </p>
          <div className="mt-2 space-y-2">
            {messageSources.map((source) => (
              <div key={`${source.slug}:${source.version}`} className="text-[12px] text-muted-foreground">
                <p className="font-medium text-foreground">
                  {source.title} <span className="text-muted-foreground">v{source.version}</span>
                </p>
                <p>
                  {source.category}
                  {source.snippet ? ` • ${source.snippet}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="inline-flex items-center gap-2 text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:240ms]" />
      </div>
      <span className="text-[11px]">Pensando...</span>
    </div>
  );
}
