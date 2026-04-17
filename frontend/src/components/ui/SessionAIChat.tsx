"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { sessionChatStream } from "@/lib/api";
import { X, Send, Loader2, Bot, User, Sparkles, ChevronDown } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const SUGGESTED_QUESTIONS = [
  "Why did this session fail?",
  "What caused the loop?",
  "How can I reduce cost?",
  "What did the agent do wrong?",
  "Which tool call caused the error?",
  "How do I fix this issue?",
];

// Tiny markdown renderer — bold, inline code, bullet lists
function MdText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const isBullet = line.match(/^[\-\*] /);
        const content = isBullet ? line.slice(2) : line;

        const rendered = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**"))
            return <strong key={j} className="font-semibold text-ink-primary">{part.slice(2, -2)}</strong>;
          if (part.startsWith("`") && part.endsWith("`"))
            return (
              <code key={j} className="font-mono text-[10px] bg-dark-bg border border-dark-border rounded px-1 py-0.5 text-brand-300">
                {part.slice(1, -1)}
              </code>
            );
          return <span key={j}>{part}</span>;
        });

        if (isBullet) {
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className="text-ink-dim mt-1 shrink-0">•</span>
              <span>{rendered}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{rendered}</p>;
      })}
    </div>
  );
}

interface Props {
  sessionId: string;
  agentName: string;
  onClose: () => void;
}

export default function SessionAIChat({ sessionId, agentName, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setError(null);

    const userMsg: Message = { role: "user", content: text.trim() };
    const assistantMsg: Message = { role: "assistant", content: "", streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    // History = all previous complete messages (not the new ones we just added)
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    abortRef.current = new AbortController();

    try {
      const res = await sessionChatStream(sessionId, text.trim(), history);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(err.detail || "Request failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") {
            setMessages(prev =>
              prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, streaming: false } : m
              )
            );
            setIsStreaming(false);
            return;
          }
          try {
            const event = JSON.parse(raw);
            if (event.error) {
              throw new Error(event.error);
            }
            if (event.text) {
              setMessages(prev =>
                prev.map((m, i) =>
                  i === prev.length - 1
                    ? { ...m, content: m.content + event.text }
                    : m
                )
              );
            }
          } catch {
            // ignore parse errors for incomplete chunks
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setMessages(prev => prev.filter((_, i) => i < prev.length - 1)); // remove empty assistant bubble
    } finally {
      setIsStreaming(false);
      setMessages(prev =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, streaming: false } : m
        )
      );
    }
  }, [isStreaming, messages, sessionId]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f] border-l border-dark-border">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-ink-primary">AI Diagnosis</p>
            <p className="text-[10px] text-ink-dim">{agentName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-ink-dim hover:text-ink-secondary transition-colors p-1.5 rounded-lg hover:bg-dark-raised"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">

        {/* Empty state with suggested questions */}
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <Bot className="w-8 h-8 text-brand-400/50 mx-auto mb-2" />
              <p className="text-xs text-ink-muted leading-relaxed">
                Ask me anything about this session — I have full access to all spans, errors, LLM calls, and detected issues.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] text-ink-dim uppercase tracking-wider font-semibold px-1">Suggested</p>
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-dark-raised border border-dark-border hover:border-brand-500/30 hover:bg-brand-500/5 text-xs text-ink-secondary transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            {/* Avatar */}
            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
              msg.role === "user"
                ? "bg-brand-600/20 border border-brand-500/30"
                : "bg-dark-raised border border-dark-border"
            }`}>
              {msg.role === "user"
                ? <User className="w-3 h-3 text-brand-400" />
                : <Bot className="w-3 h-3 text-ink-muted" />
              }
            </div>

            {/* Bubble */}
            <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${
              msg.role === "user"
                ? "bg-brand-600/15 border border-brand-500/20 text-ink-primary ml-auto"
                : "bg-dark-raised border border-dark-border text-ink-secondary"
            }`}>
              {msg.role === "assistant" ? (
                <>
                  {msg.content
                    ? <MdText text={msg.content} />
                    : msg.streaming && (
                      <span className="flex items-center gap-1.5 text-ink-dim">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Analyzing session...</span>
                      </span>
                    )
                  }
                  {msg.streaming && msg.content && (
                    <span className="inline-block w-0.5 h-3.5 bg-brand-400 ml-0.5 animate-pulse align-middle" />
                  )}
                </>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom hint (shown when messages overflow) */}
      {messages.length > 3 && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute bottom-20 right-6 bg-dark-raised border border-dark-border rounded-full p-1.5 text-ink-dim hover:text-ink-secondary transition-colors shadow-lg"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-dark-border shrink-0">
        <div className="flex items-end gap-2 bg-dark-raised border border-dark-border rounded-xl px-3 py-2 focus-within:border-brand-500/50 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about this session…"
            disabled={isStreaming}
            className="flex-1 bg-transparent text-[12px] text-ink-primary placeholder:text-ink-dim resize-none focus:outline-none min-h-[20px] max-h-32 disabled:opacity-50"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 w-7 h-7 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            {isStreaming
              ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              : <Send className="w-3.5 h-3.5 text-white" />
            }
          </button>
        </div>
        <p className="text-[10px] text-ink-dim mt-1.5 px-1">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
