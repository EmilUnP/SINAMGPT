"use client";

import {
  Infinity as InfinityIcon,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  SendHorizonal,
  Square,
  Trash2,
  LogOut,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import sinamLogo from "@/assets/sinam_logo.png";
import { CopyButton } from "./CopyButton";
import { MarkdownMessage } from "./MarkdownMessage";
import { autoResizeTextarea, formatChatTime, relativeTime } from "@/lib/ui";
import type { Conversation, Message, User } from "@/lib/types";

type ChatAppProps = {
  user: User;
};

type UiMessage = Message & { isStreaming?: boolean };

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

export const ChatApp = ({ user }: ChatAppProps) => {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [models, setModels] = useState<
    Array<{ name: string; display_name?: string; backend?: string }>
  >([]);
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [modelsError, setModelsError] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  // Keep disabled attrs identical on SSR + first client paint (hydration-safe).
  const [ready, setReady] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const searchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") return messages[i];
    }
    return null;
  }, [messages]);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const modelLabel = (name: string) =>
    models.find((m) => m.name === name)?.display_name || name;

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    autoResizeTextarea(textareaRef.current);
  }, [input]);

  const loadConversations = useCallback(async (query?: string) => {
    const q = (query ?? "").trim();
    const url = q
      ? `/api/conversations?q=${encodeURIComponent(q)}`
      : "/api/conversations";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load chats");
    const data = (await res.json()) as { conversations: Conversation[] };
    setConversations(data.conversations);
    return data.conversations;
  }, []);

  const loadModels = useCallback(async () => {
    const res = await fetch("/api/models");
    const data = (await res.json()) as {
      models?: Array<{ name: string; display_name?: string; backend?: string }>;
      defaultModel?: string;
      error?: string;
    };

    if (!res.ok) {
      setModelsError(data.error || "Ollama not available");
      setModels([]);
      return;
    }

    const list = data.models ?? [];
    setModels(list);
    setModelsError("");
    setModel(
      (current) => current || data.defaultModel || list[0]?.name || "",
    );
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        setIsLoadingList(true);
        await Promise.all([loadConversations(), loadModels()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoadingList(false);
      }
    };
    void boot();
  }, [loadConversations, loadModels]);

  useEffect(() => {
    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = window.setTimeout(() => {
      void loadConversations(search).catch(() => undefined);
    }, 250);
    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, [search, loadConversations]);

  const openConversation = async (id: string) => {
    setError("");
    setEditingId(null);
    setActiveId(id);
    setMobileSidebar(false);

    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) {
      setError("Could not open chat");
      return;
    }

    const data = (await res.json()) as {
      conversation: Conversation;
      messages: Message[];
    };

    setMessages(data.messages);
    setModel(data.conversation.model);
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError("");
    setEditingId(null);
    setMobileSidebar(false);
    textareaRef.current?.focus();
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete chat");
      return;
    }

    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      setEditingId(null);
    }
  };

  const handleTogglePin = async (chat: Conversation) => {
    const nextPinned = chat.is_pinned !== 1;
    const res = await fetch(`/api/conversations/${chat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_pinned: nextPinned }),
    });
    if (!res.ok) {
      setError("Could not update pin");
      return;
    }
    const data = (await res.json()) as { conversation?: Conversation };
    if (data.conversation) {
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === chat.id ? data.conversation! : c,
        );
        return next.sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
          return b.updated_at.localeCompare(a.updated_at);
        });
      });
    } else {
      void loadConversations(search);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const runChatRequest = async (opts: {
    body: Record<string, unknown>;
    prepareMessages: () => {
      tempUserId?: string;
      tempAssistantId: string;
    };
    restoreOnError?: string;
  }) => {
    if (isSending) return;
    if (!model) {
      setError("No local model selected. Start Ollama and pull a model.");
      return;
    }

    setError("");
    setIsSending(true);
    setEditingId(null);

    const { tempUserId, tempAssistantId } = opts.prepareMessages();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(opts.body),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Chat failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let conversationId = activeId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const parsed = parseSseChunk(part);
          if (!parsed) continue;

          if (parsed.event === "meta") {
            const meta = parsed.data as {
              conversationId: string;
              conversation: Conversation;
              userMessage: Message;
            };
            conversationId = meta.conversationId;
            setActiveId(meta.conversationId);
            setConversations((prev) => {
              const others = prev.filter((c) => c.id !== meta.conversationId);
              const next = [meta.conversation, ...others];
              return next.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
                return b.updated_at.localeCompare(a.updated_at);
              });
            });
            setMessages((prev) =>
              prev.map((m) => {
                if (tempUserId && m.id === tempUserId) {
                  return { ...meta.userMessage };
                }
                if (m.id === tempAssistantId) {
                  return { ...m, conversation_id: meta.conversationId };
                }
                if (m.id === meta.userMessage.id) {
                  return { ...meta.userMessage };
                }
                return m;
              }),
            );
          }

          if (parsed.event === "token") {
            const token = (parsed.data as { content: string }).content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId
                  ? { ...m, content: m.content + token }
                  : m,
              ),
            );
          }

          if (parsed.event === "done") {
            const doneData = parsed.data as { assistantMessage: Message };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId
                  ? { ...doneData.assistantMessage }
                  : m,
              ),
            );
            if (conversationId) {
              void loadConversations(search);
            }
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
            m.id === tempAssistantId
              ? {
                  ...m,
                  isStreaming: false,
                  content: m.content || "(stopped)",
                }
              : m,
          ),
        );
      } else {
        const message =
          err instanceof Error ? err.message : "Failed to send message";
        setError(message);
        setMessages((prev) =>
          prev.filter(
            (m) => m.id !== tempUserId && m.id !== tempAssistantId,
          ),
        );
        if (opts.restoreOnError != null) {
          setInput(opts.restoreOnError);
        }
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
      setMessages((prev) =>
        prev.map((m) => ({ ...m, isStreaming: false })),
      );
    }
  };

  const handleSend = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || isSending) return;

    setInput("");

    await runChatRequest({
      body: {
        conversationId: activeId ?? undefined,
        message: text,
        model,
        mode: "send",
      },
      restoreOnError: text,
      prepareMessages: () => {
        const tempUserId = `temp-user-${Date.now()}`;
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        const tempUser: UiMessage = {
          id: tempUserId,
          conversation_id: activeId ?? "pending",
          role: "user",
          content: text,
          created_at: new Date().toISOString(),
        };
        const tempAssistant: UiMessage = {
          id: tempAssistantId,
          conversation_id: activeId ?? "pending",
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          isStreaming: true,
        };
        setMessages((prev) => [...prev, tempUser, tempAssistant]);
        return { tempUserId, tempAssistantId };
      },
    });
  };

  const handleRegenerate = async () => {
    if (!activeId || !lastUserMessage || isSending) return;

    await runChatRequest({
      body: {
        conversationId: activeId,
        model,
        mode: "regenerate",
      },
      prepareMessages: () => {
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        const tempAssistant: UiMessage = {
          id: tempAssistantId,
          conversation_id: activeId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          isStreaming: true,
        };
        setMessages((prev) => {
          const withoutTrailingAssistant =
            prev.length && prev[prev.length - 1].role === "assistant"
              ? prev.slice(0, -1)
              : prev;
          return [...withoutTrailingAssistant, tempAssistant];
        });
        return { tempAssistantId };
      },
    });
  };

  const handleStartEdit = (message: UiMessage) => {
    if (isSending) return;
    setEditingId(message.id);
    setEditDraft(message.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const handleSaveEdit = async () => {
    const text = editDraft.trim();
    if (!text || !editingId || !activeId) return;

    const editMessageId = editingId;

    await runChatRequest({
      body: {
        conversationId: activeId,
        message: text,
        model,
        mode: "edit",
        editMessageId,
      },
      prepareMessages: () => {
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        const tempAssistant: UiMessage = {
          id: tempAssistantId,
          conversation_id: activeId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          isStreaming: true,
        };
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === editMessageId);
          if (idx < 0) return prev;
          const kept = prev.slice(0, idx + 1).map((m) =>
            m.id === editMessageId ? { ...m, content: text } : m,
          );
          return [...kept, tempAssistant];
        });
        return { tempAssistantId };
      },
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const Sidebar = (
    <aside className="flex h-full w-80 shrink-0 flex-col bg-[var(--sidebar)] text-white">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--sidebar-border)] px-4 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image
            src={sinamLogo}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full"
            style={{ width: "auto", height: "auto" }}
          />
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight">SINAMGPT</p>
            <p className="text-xs text-sky-200/45">Saved · unlimited</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSidebarOpen(false);
            setMobileSidebar(false);
          }}
          className="rounded-lg p-2 text-white/70 hover:bg-[var(--sidebar-hover)] hover:text-white"
          aria-label="Close sidebar"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)] transition hover:from-blue-500 hover:to-sky-400"
        >
          <MessageSquarePlus size={16} />
          New chat
        </button>

        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <Search size={14} className="text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or messages"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </label>
      </div>

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isLoadingList ? (
          <p className="px-2 py-3 text-sm text-white/45">Loading chats…</p>
        ) : conversations.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-sm text-white/45">
              {search ? "No chats match your search." : "No chats yet."}
            </p>
            {!search ? (
              <button
                type="button"
                onClick={handleNewChat}
                className="mt-3 text-xs text-sky-300 hover:underline"
              >
                Start your first chat
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-1">
            {conversations.map((chat) => {
              const isActive = chat.id === activeId;
              const pinned = chat.is_pinned === 1;
              return (
                <li key={chat.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => void openConversation(chat.id)}
                    className={`w-full rounded-xl px-3 py-2.5 pr-16 text-left text-sm transition ${
                      isActive
                        ? "bg-[var(--sidebar-hover)] text-white ring-1 ring-sky-400/25"
                        : "text-white/75 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {pinned ? (
                        <Pin
                          size={12}
                          className="shrink-0 text-sky-300"
                          fill="currentColor"
                        />
                      ) : null}
                      <span className="line-clamp-1 font-medium">
                        {chat.title}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-white/40">
                      <span className="truncate">{modelLabel(chat.model)}</span>
                      <span className="shrink-0">
                        {relativeTime(chat.updated_at)}
                      </span>
                    </span>
                  </button>
                  <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => void handleTogglePin(chat)}
                      className="rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-sky-200"
                      aria-label={pinned ? "Unpin chat" : "Pin chat"}
                      title={pinned ? "Unpin" : "Pin"}
                    >
                      {pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(chat.id)}
                      className="rounded-md p-1.5 text-white/35 hover:bg-white/10 hover:text-red-300"
                      aria-label="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-[var(--sidebar-border)] p-3">
        <div className="mb-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="truncate text-sm text-white">
            {user.username}
            {user.role === "admin" ? (
              <span className="ml-1 text-[11px] text-sky-300">· admin</span>
            ) : null}
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-300/90">
            <InfinityIcon size={11} />
            Unlimited messages
          </p>
        </div>
        {user.role === "admin" ? (
          <Link
            href="/admin"
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-500/20"
          >
            <Shield size={15} />
            Admin panel
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)]">
      <div className="hidden md:block">{sidebarOpen ? Sidebar : null}</div>

      {mobileSidebar ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label="Close menu"
            onClick={() => setMobileSidebar(false)}
          />
          <div className="relative z-10 h-full shadow-2xl">{Sidebar}</div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 py-3 backdrop-blur md:px-5">
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-black/5 md:hidden"
            onClick={() => setMobileSidebar(true)}
            aria-label="Open sidebar"
          >
            <Menu size={18} />
          </button>

          {!sidebarOpen ? (
            <button
              type="button"
              className="hidden rounded-lg p-2 text-[var(--text-muted)] hover:bg-black/5 md:inline-flex"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-[var(--text)] md:text-base">
              {activeConversation?.title ?? "New chat"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="chip border border-emerald-200 bg-emerald-50 text-emerald-700">
                <InfinityIcon size={11} /> Unlimited
              </span>
              <span className="chip border border-sky-200 bg-sky-50 text-sky-700">
                <Sparkles size={11} /> History saved
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="hidden sm:inline">Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={ready && (isSending || models.length === 0)}
              className="max-w-[10rem] rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)] sm:max-w-[14rem]"
            >
              {models.length === 0 ? (
                <option value="">No models</option>
              ) : (
                models.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.display_name || item.name}
                    {item.backend === "vllm"
                      ? " · vLLM"
                      : item.backend === "ollama"
                        ? " · Ollama"
                        : ""}
                  </option>
                ))
              )}
            </select>
          </label>
        </header>

        {(modelsError || error) && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
              <p>{error || modelsError}</p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setModelsError("");
                  void loadModels();
                }}
                className="shrink-0 rounded-md p-1 hover:bg-amber-100"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
              <Image
                src={sinamLogo}
                alt="SINAMGPT"
                width={84}
                height={84}
                className="soft-rise h-[84px] w-[84px] rounded-full shadow-[0_12px_40px_rgba(37,99,235,0.18)]"
                style={{ width: "auto", height: "auto" }}
                priority
              />
              <p className="mt-5 text-4xl font-semibold tracking-tight text-[var(--text)]">
                Hello, {user.username}
              </p>
              <p className="mt-3 max-w-md text-[var(--text-muted)]">
                You&apos;re signed in — unlimited local chat with saved history.
              </p>
              <div className="mt-8 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {suggestions.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => void handleSend(item.prompt)}
                    disabled={ready && (isSending || !model)}
                    className="soft-rise rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5 text-left transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md disabled:opacity-50"
                    style={{ animationDelay: `${0.05 * index}s` }}
                  >
                    <span className="block text-sm font-medium text-[var(--text)]">
                      {item.title}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs text-[var(--text-muted)]">
                      {item.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 md:px-6">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const isLastUser = lastUserMessage?.id === message.id;
                const isLastAssistant =
                  lastAssistantMessage?.id === message.id;
                const isEditing = editingId === message.id;

                return (
                  <div
                    key={message.id}
                    className={`animate-fade-up flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[92%] md:max-w-[85%] ${isUser ? "" : "w-full"}`}
                    >
                      <div
                        className={`mb-1.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)] ${
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
                        {message.created_at ? (
                          <span className="opacity-70">
                            · {formatChatTime(message.created_at)}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm ${
                          isUser
                            ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-sm"
                            : "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
                        }`}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              rows={4}
                              className="w-full resize-y rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50"
                              autoFocus
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={isSending || !editDraft.trim()}
                                onClick={() => void handleSaveEdit()}
                                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-40"
                              >
                                Save & regenerate
                              </button>
                              <button
                                type="button"
                                disabled={isSending}
                                onClick={handleCancelEdit}
                                className="rounded-lg border border-white/30 px-3 py-1.5 text-xs text-white/90"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : isUser ? (
                          <p className="whitespace-pre-wrap">
                            {message.content}
                          </p>
                        ) : message.content ? (
                          <MarkdownMessage content={message.content} />
                        ) : (
                          <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        )}
                      </div>
                      {!isSending && !isEditing ? (
                        <div
                          className={`mt-1 flex items-center gap-1 ${
                            isUser ? "justify-end" : ""
                          }`}
                        >
                          {!isUser && message.content ? (
                            <CopyButton
                              text={message.content}
                              className="text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text)]"
                            />
                          ) : null}
                          {isUser && isLastUser ? (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(message)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text)]"
                            >
                              <Pencil size={12} />
                              Edit
                            </button>
                          ) : null}
                          {!isUser && isLastAssistant && message.content ? (
                            <button
                              type="button"
                              onClick={() => void handleRegenerate()}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-black/5 hover:text-[var(--text)]"
                            >
                              <RefreshCw size={12} />
                              Regenerate
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 px-3 py-3 backdrop-blur md:px-5">
          <div className="composer-shell mx-auto flex max-w-3xl items-end gap-2 rounded-[24px] border border-[var(--border)] bg-white p-2 shadow-[0_10px_30px_rgba(16,24,40,0.06)] focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-500/15">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Message SINAMGPT…"
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
            />
            {isSending ? (
              <button
                type="button"
                onClick={handleStop}
                className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--sidebar)] text-white transition hover:opacity-90"
                aria-label="Stop generating"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={ready && (!input.trim() || !model)}
                className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_8px_18px_rgba(37,99,235,0.28)] transition hover:from-blue-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <SendHorizonal size={16} />
              </button>
            )}
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-[var(--text-muted)]">
            Enter to send · Shift+Enter for new line · Unlimited · Saved on this
            PC
          </p>
        </div>
      </main>
    </div>
  );
};
