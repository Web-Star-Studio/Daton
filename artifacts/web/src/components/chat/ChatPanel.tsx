import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export function ChatPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
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

  const ensureConversation = useCallback(async (): Promise<number> => {
    if (conversationId) return conversationId;

    const res = await fetch(resolveApiUrl("/api/ai/conversations"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ title: "Chat" }),
    });
    const conv = await res.json();
    setConversationId(conv.id);
    return conv.id;
  }, [conversationId]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsStreaming(true);

    try {
      const convId = await ensureConversation();

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
                };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content:
            "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
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
        "w-[360px] flex-shrink-0 bg-white rounded-2xl border border-border/60 shadow-sm flex flex-col h-full overflow-hidden",
        isOpen
          ? "animate-[chatSlideIn_250ms_ease-in-out_forwards]"
          : "animate-[chatSlideOut_250ms_ease-in-out_forwards]",
      )}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">Daton AI</span>
        </div>
        <div className="flex items-center gap-1">
          {chatMessages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors cursor-pointer"
            >
              Nova conversa
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Sparkles className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-[13px] text-muted-foreground mb-1">
              Olá! Sou o assistente Daton AI.
            </p>
            <p className="text-[12px] text-muted-foreground/70">
              Posso consultar dados da sua organização, legislações, unidades e
              conformidade.
            </p>
          </div>
        ) : (
          chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-white"
                    : "bg-secondary/60 text-foreground"
                }`}
              >
                {msg.role === "assistant" ? (
                  <AssistantMessage content={msg.content} />
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
                {msg.role === "assistant" &&
                  !msg.content &&
                  isStreaming &&
                  i === chatMessages.length - 1 && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-[11px]">Pensando...</span>
                    </span>
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
            className="flex-1 text-[13px] bg-secondary/40 border-none rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
  );
}

function AssistantMessage({ content }: { content: string }) {
  if (!content) return null;

  const parts = content.split(/(\*\*[^*]+\*\*)/g);

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
