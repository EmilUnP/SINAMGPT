"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Infinity as InfinityIcon,
  MessageSquarePlus,
  SendHorizonal,
  Square,
} from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { CopyButton } from "@/components/CopyButton";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { ThemeToggle } from "@/components/ThemeToggle";
import { autoResizeTextarea, formatChatTime } from "@/lib/ui";

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Usage = {
  used: number;
  limit: number;
  remaining: number;
};

const parseSseChunk = (raw: string) => {
  const lines = raw.split("\n");
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  return { event, data: JSON.parse(dataLines.join("\n")) };
};

const suggestions = [
  {
    title: "Quick hello",
    prompt: "Say hello in one short friendly sentence, then ask how you can help.",
  },
  {
    title: "Explain AI",
    prompt: "In 3 short sentences, explain what AI is in simple words.",
  },
  {
    title: "Write a tip",
    prompt: "Give me one practical productivity tip I can use today. Keep it under 40 words.",
  },
  {
    title: "Fun fact",
    prompt: "Tell me one interesting fun fact about technology. Keep it to 2 sentences.",
  },
];

export const HomeTryChat = () => {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<
    Array<{ name: string; display_name?: string; backend?: string }>
  >([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [guestEnabled, setGuestEnabled] = useState(true);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [ready, setReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/guest/models");
        const data = (await res.json()) as {
          models?: Array<{ name: string; display_name?: string; backend?: string }>;
          defaultModel?: string;
          usage?: Usage;
          guestEnabled?: boolean;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error || "Ollama is not available");
          return;
        }
        if (data.guestEnabled === false) {
          setGuestEnabled(false);
          setModels([]);
          setModel("");
          setUsage(null);
          return;
        }
        setGuestEnabled(true);
        const list = data.models ?? [];
        setModels(list);
        setModel(data.defaultModel || list[0]?.name || "");
        if (data.usage) setUsage(data.usage);
      } catch {
        setError("Could not reach the local model service");
      }
    };
    void load();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    autoResizeTextarea(textareaRef.current);
  }, [input]);

  const handleStop = () => abortRef.current?.abort();

  const handleNewTry = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setError("");
    textareaRef.current?.focus();
  };

  const handleSend = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || isSending) return;
    if (!guestEnabled) {
      setError("Guest try-chat is disabled. Sign in to use SINAMGPT.");
      return;
    }
    if (!model) {
      setError("No local model found. Start Ollama and pull a model.");
      return;
    }
    if (usage && usage.remaining <= 0) {
      setError(
        `Guest limit reached (${usage.limit}/day). Sign in for unlimited chat.`,
      );
      return;
    }

    setError("");
    setInput("");
    setIsSending(true);

    const nowIso = new Date().toISOString();
    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: nowIso,
    };
    const assistantId = `a-${Date.now()}`;
    const assistantTurn: ChatTurn = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: nowIso,
    };

    setMessages((prev) => [...prev, userTurn, assistantTurn]);

    const history = messages
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/guest/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ message: text, model, history }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          usage?: Usage;
        };
        if (data.usage) setUsage(data.usage);
        throw new Error(data.error || "Chat failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const parsed = parseSseChunk(part);
          if (!parsed) continue;

          if (parsed.event === "meta" || parsed.event === "done") {
            const u = (parsed.data as { usage?: Usage }).usage;
            if (u) setUsage(u);
          }

          if (parsed.event === "token") {
            const token = (parsed.data as { content: string }).content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + token }
                  : m,
              ),
            );
          }

          if (parsed.event === "error") {
            throw new Error(
              (parsed.data as { error?: string }).error || "Stream error",
            );
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || "(stopped)" }
              : m,
          ),
        );
      } else {
        const msg = err instanceof Error ? err.message : "Failed to send";
        setError(msg);
        setMessages((prev) =>
          prev.filter((m) => m.id !== userTurn.id && m.id !== assistantId),
        );
        setInput(text);
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const limitHit = Boolean(usage && usage.remaining <= 0);
  const actionsLocked =
    ready && (isSending || limitHit || !model || !guestEnabled);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden text-[var(--home-fg)]">
      <AnimatedBackground />

      <header className="relative z-10 flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Image
            src={sinamLogo}
            alt="SINAMGPT"
            width={36}
            height={36}
            className="h-9 w-9 rounded-full"
            style={{ width: "auto", height: "auto" }}
            priority
          />
          <div>
            <p className="text-[15px] font-semibold tracking-[0.04em] text-[var(--home-fg)]">
              SINAMGPT
            </p>
            <p className="text-[11px] text-[var(--home-faint)]">
              Local company AI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {models.length > 0 && guestEnabled ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isSending}
              className="max-w-[9.5rem] rounded-full border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] px-3 py-1.5 text-xs text-[var(--home-chip-fg)] outline-none sm:max-w-[12rem]"
            >
              {models.map((item) => (
                <option
                  key={item.name}
                  value={item.name}
                  className="bg-[var(--home-option-bg)]"
                >
                  {item.display_name || item.name}
                  {item.backend === "vllm"
                    ? " · vLLM"
                    : item.backend === "ollama"
                      ? " · Ollama"
                      : ""}
                </option>
              ))}
            </select>
          ) : null}
          <ThemeToggle size="sm" />
          <Link
            href="/login"
            className="rounded-full px-3 py-2 text-sm text-[var(--home-muted)] transition hover:bg-[var(--home-chip-bg)] hover:text-[var(--home-fg)] sm:px-4"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-2 text-sm font-medium text-white shadow-[0_8px_24px_rgba(37,99,235,0.3)] transition hover:from-blue-500 hover:to-sky-400 sm:px-4"
          >
            Sign up
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-7 pt-2 sm:px-8">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-1 pb-4 text-center">
            <div className="hero-brand">
              <Image
                src={sinamLogo}
                alt="SINAMGPT"
                width={112}
                height={112}
                className="logo-breathe mx-auto h-28 w-28 rounded-full"
                style={{ width: "auto", height: "auto" }}
                priority
              />
              <p className="mt-7 text-sm font-semibold tracking-[0.22em] text-[var(--home-fg)]/90">
                SINAMGPT
              </p>
            </div>

            <div className="hero-copy mt-4">
              <h1 className="text-[2.15rem] font-normal tracking-tight text-[var(--home-fg)] sm:text-[2.9rem]">
                {guestEnabled
                  ? "Where should we start?"
                  : "Sign in to continue"}
              </h1>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[var(--home-muted)]">
                {guestEnabled
                  ? "Ask anything work-related — or pick a starter below."
                  : "Guest try-chat is currently disabled by an admin."}
              </p>
              {guestEnabled && usage ? (
                <p className="mt-3 text-xs text-[var(--home-faint)]">
                  {usage.remaining} free guest{" "}
                  {usage.remaining === 1 ? "message" : "messages"} left today
                </p>
              ) : null}
            </div>

            {guestEnabled ? (
              <div className="hero-actions mt-10 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestions.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => void handleSend(item.prompt)}
                    disabled={actionsLocked}
                    className="suggestion-tile soft-rise rounded-2xl border border-[var(--home-card-border)] bg-[var(--home-chip-bg)] px-5 py-4 text-left hover:-translate-y-0.5 hover:border-[var(--accent)]/40 disabled:opacity-40"
                    style={{ animationDelay: `${0.08 + 0.06 * index}s` }}
                  >
                    <span className="block text-sm font-medium text-[var(--home-fg)]">
                      {item.title}
                    </span>
                    <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-[var(--home-muted)]">
                      {item.prompt}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="hero-actions mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)]"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-full border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] px-6 py-2.5 text-sm font-medium text-[var(--home-fg)]"
                >
                  Create account
                </Link>
              </div>
            )}

            {limitHit ? (
              <div
                className="relative mt-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] px-5 py-4 text-left backdrop-blur-md"
                style={{ boxShadow: "var(--home-card-shadow)" }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse 70% 90% at 0% 50%, rgba(37,99,235,0.22), transparent 60%)",
                  }}
                />
                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]">
                      <InfinityIcon size={16} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--home-faint)]">
                        Daily guest limit
                      </p>
                      <p className="mt-0.5 text-sm font-semibold tracking-tight text-[var(--home-fg)]">
                        You’ve used today’s free messages
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-[var(--home-muted)]">
                        Sign in for unlimited chat and saved history.
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)] transition hover:from-blue-500 hover:to-sky-400"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/register"
                      className="inline-flex items-center justify-center rounded-full border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] px-4 py-2 text-xs font-medium text-[var(--home-fg)] transition hover:border-[var(--accent)]/40"
                    >
                      Create account
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="chat-scroll min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={handleNewTry}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] px-3 py-1.5 text-xs text-[var(--home-chip-fg)] transition hover:opacity-90"
              >
                <MessageSquarePlus size={13} />
                New try
              </button>
            </div>

            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`animate-fade-up flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[92%] md:max-w-[85%] ${isUser ? "" : "w-full"}`}>
                    <div
                      className={`mb-1.5 flex items-center gap-2 text-[11px] text-[var(--home-faint)] ${
                        isUser ? "justify-end" : ""
                      }`}
                    >
                      {!isUser ? (
                        <Image
                          src={sinamLogo}
                          alt=""
                          width={16}
                          height={16}
                          className="h-4 w-4 rounded-full"
                          style={{ width: "auto", height: "auto" }}
                        />
                      ) : null}
                      <span>{isUser ? "You" : "SINAMGPT"}</span>
                      {message.createdAt ? (
                        <span className="opacity-70">
                          · {formatChatTime(message.createdAt)}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm ${
                        isUser
                          ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white"
                          : "border border-[var(--home-assistant-border)] bg-[var(--home-assistant-bg)] text-[var(--home-assistant-fg)]"
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      ) : message.content ? (
                        <div className="home-markdown">
                          <MarkdownMessage content={message.content} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[var(--home-faint)]">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      )}
                    </div>
                    {!isUser && message.content ? (
                      <div className="mt-1">
                        <CopyButton
                          text={message.content}
                          className="text-[var(--home-faint)] hover:bg-[var(--home-chip-bg)] hover:text-[var(--home-fg)]"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}

        {limitHit && messages.length > 0 ? (
          <div
            className="relative mb-2 overflow-hidden rounded-2xl border border-[var(--home-card-border)] bg-[var(--home-card-bg)] px-4 py-3 backdrop-blur-md"
            style={{ boxShadow: "var(--home-card-shadow)" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 70% 90% at 0% 50%, rgba(37,99,235,0.22), transparent 60%)",
              }}
            />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--home-faint)]">
                  Daily guest limit
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--home-fg)]">
                  You’ve used today’s free messages
                </p>
                <p className="mt-0.5 text-xs text-[var(--home-muted)]">
                  Sign in for unlimited chat and saved history.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)] transition hover:from-blue-500 hover:to-sky-400"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-full border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] px-4 py-2 text-xs font-medium text-[var(--home-fg)] transition hover:border-[var(--accent)]/40"
                >
                  Create account
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {error && !limitHit ? (
          <p className="mb-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-center text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <div
          className="composer-shell rounded-[28px] border border-[var(--home-card-border)] bg-[var(--home-card-bg)] p-2 backdrop-blur-md focus-within:border-[var(--accent)]/50 focus-within:ring-4 focus-within:ring-[var(--ring)]"
          style={{ boxShadow: "var(--home-card-shadow)" }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                !guestEnabled
                  ? "Guest chat disabled — sign in…"
                  : limitHit
                    ? "Sign in to keep chatting…"
                    : "Ask SINAMGPT anything…"
              }
              disabled={limitHit || !guestEnabled}
              className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-4 py-3 text-[15px] text-[var(--home-input)] outline-none placeholder:text-[var(--home-placeholder)] disabled:opacity-50"
            />
            {isSending ? (
              <button
                type="button"
                onClick={handleStop}
                className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)]"
                aria-label="Stop"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={actionsLocked || (ready && !input.trim())}
                className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.35)] transition hover:from-blue-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send"
              >
                <SendHorizonal size={16} />
              </button>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-[var(--home-faint)]">
          Enter to send · Shift+Enter for new line · Guest history is not saved
        </p>
      </main>
    </div>
  );
};
