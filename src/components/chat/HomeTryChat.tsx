"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  Infinity as InfinityIcon,
  Languages,
  MessageSquarePlus,
  Paperclip,
  SendHorizonal,
  Square,
  TextQuote,
  UserRound,
} from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLocale } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CopyButton } from "./CopyButton";
import { ComposerToolsMenu } from "./ComposerToolsMenu";
import { KnowledgeCitations } from "./KnowledgeCitations";
import { MarkdownMessage } from "./MarkdownMessage";
import { MessageImages } from "./MessageImages";
import { ModelPicker, type ModelOption } from "./ModelPicker";
import { SpeakButton } from "./SpeakButton";
import {
  fileToChatImage,
  imagePreviewUrl,
  type ChatImagePayload,
} from "@/lib/media/compress-image";
import { dropHasFiles, isDroppedImageFile } from "@/lib/media/chat-drop";
import { fleetHintKey } from "@/lib/model-fleet";
import { MAX_GUEST_IMAGES } from "@/lib/media/limits";
import { parseSseChunk } from "@/lib/parse-sse-chunk";
import { autoResizeTextarea, formatChatTime, withComposerStarter } from "@/lib/ui";
import { useIsMounted } from "@/hooks/use-mounted";
import type { KnowledgeCitation } from "@/lib/types";

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources?: KnowledgeCitation[] | null;
  images?: ChatImagePayload[];
};

type HomeTryChatProps = {
  features?: {
    fileUpload?: boolean;
    fileImport?: boolean;
    microphone?: boolean;
  };
};

type PendingImage = ChatImagePayload & { id: string };

type Usage = {
  used: number;
  limit: number;
  remaining: number;
};

/** Module scope keeps the clock read out of component render analysis. */
const makeTurnId = (prefix: "u" | "a") => `${prefix}-${Date.now()}`;

export const HomeTryChat = ({
  features = {},
}: HomeTryChatProps) => {
  const { locale, t } = useLocale();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [guestEnabled, setGuestEnabled] = useState(true);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const ready = useIsMounted();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const suggestions = useMemo(
    () => [
      {
        title: t("home.suggestionHello"),
        prompt: t("home.suggestionHelloPrompt"),
      },
      {
        title: t("home.suggestionAi"),
        prompt: t("home.suggestionAiPrompt"),
      },
      {
        title: t("home.suggestionTip"),
        prompt: t("home.suggestionTipPrompt"),
      },
      {
        title: t("home.suggestionFact"),
        prompt: t("home.suggestionFactPrompt"),
      },
    ],
    [t],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/guest/models");
        const data = (await res.json()) as {
          models?: ModelOption[];
          defaultModel?: string;
          usage?: Usage;
          guestEnabled?: boolean;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error || t("home.ollamaUnavailable"));
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
        setError(t("home.couldNotReach"));
      }
    };
    void load();
  }, [t]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    autoResizeTextarea(textareaRef.current);
  }, [input, pendingImages.length]);

  const supportsVision = Boolean(
    models.find((m) => m.name === model)?.vision,
  );
  const selectedCaps = models.find((m) => m.name === model);
  const canListen = Boolean(selectedCaps?.audio || selectedCaps?.tts);
  const canAttachImages = supportsVision && features.fileUpload === true;
  const canImportImages = supportsVision && features.fileImport === true;

  if (!canAttachImages && !canImportImages && pendingImages.length > 0) {
    setPendingImages([]);
  }

  const handleStop = () => abortRef.current?.abort();

  const handleNewTry = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setPendingImages([]);
    setError("");
    textareaRef.current?.focus();
  };

  const imageErrorMessage = (code: "type" | "size" | "failed") => {
    if (code === "type") return t("chat.imageType");
    if (code === "size") return t("chat.imageTooLarge");
    return t("chat.imageFailed");
  };

  const addImageFiles = async (files: File[]) => {
    if ((!canAttachImages && !canImportImages) || !files.length) return;
    const remaining = MAX_GUEST_IMAGES - pendingImages.length;
    if (remaining <= 0) {
      setError(t("chat.imageLimit", { n: MAX_GUEST_IMAGES }));
      return;
    }
    const slice = files.slice(0, remaining);
    const next: PendingImage[] = [];
    for (const file of slice) {
      const result = await fileToChatImage(file);
      if (!result.ok) {
        setError(imageErrorMessage(result.code));
        continue;
      }
      next.push({ ...result.image, id: `img-${Date.now()}-${Math.random()}` });
    }
    if (next.length) {
      setPendingImages((prev) => [...prev, ...next].slice(0, MAX_GUEST_IMAGES));
      setError("");
    }
  };

  const canDropImages = Boolean(
    canImportImages && guestEnabled && !(usage && usage.remaining <= 0),
  );

  const addDroppedFiles = async (files: File[]) => {
    if (!files.length || isSending || !canDropImages) return;
    const images = files.filter(isDroppedImageFile);
    if (!images.length) {
      setError(t("chat.dropUnsupported"));
      return;
    }
    if (!supportsVision) {
      setError(t("chat.visionRequired"));
      return;
    }
    if (!guestEnabled) {
      setError(t("home.guestDisabledError"));
      return;
    }
    if (usage && usage.remaining <= 0) {
      setError(t("home.guestLimitReached", { limit: usage.limit }));
      return;
    }
    await addImageFiles(images);
  };

  const handleComposerDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!dropHasFiles(event.dataTransfer.types)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    if (canDropImages) setIsDraggingOver(true);
  };

  const handleComposerDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!dropHasFiles(event.dataTransfer.types)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canDropImages ? "copy" : "none";
  };

  const handleComposerDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!dropHasFiles(event.dataTransfer.types)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingOver(false);
  };

  const handleComposerDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingOver(false);
    void addDroppedFiles(Array.from(event.dataTransfer.files));
  };

  const handleSend = async (preset?: string) => {
    const text = (preset ?? input).trim();
    const imagesToSend = preset ? [] : pendingImages;
    if ((!text && imagesToSend.length === 0) || isSending) return;
    if (!guestEnabled) {
      setError(t("home.guestDisabledError"));
      return;
    }
    if (!model) {
      setError(t("home.noModel"));
      return;
    }
    if (usage && usage.remaining <= 0) {
      setError(t("home.guestLimitReached", { limit: usage.limit }));
      return;
    }

    setError("");
    setInput("");
    if (imagesToSend.length) setPendingImages([]);
    setIsSending(true);

    const nowIso = new Date().toISOString();
    const userTurn: ChatTurn = {
      id: makeTurnId("u"),
      role: "user",
      content: text,
      createdAt: nowIso,
      images: imagesToSend.length ? imagesToSend : undefined,
    };
    const assistantId = makeTurnId("a");
    const assistantTurn: ChatTurn = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: nowIso,
    };

    setMessages((prev) => [...prev, userTurn, assistantTurn]);

    const history = messages
      .filter((m) => m.content.trim().length > 0 || (m.images?.length ?? 0) > 0)
      .map((m) => ({
        role: m.role,
        content: m.content,
        images: m.images?.map(({ mime, data, name }) => ({ mime, data, name })),
      }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/guest/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          model,
          history,
          locale,
          images: imagesToSend.map(({ mime, data, name }) => ({
            mime,
            data,
            name,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          usage?: Usage;
        };
        if (data.usage) setUsage(data.usage);
        throw new Error(data.error || t("home.chatFailed"));
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
            const payload = parsed.data as {
              usage?: Usage;
              sources?: KnowledgeCitation[] | null;
            };
            if (payload.usage) setUsage(payload.usage);
            if (payload.sources?.length) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, sources: payload.sources }
                    : m,
                ),
              );
            }
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
              (parsed.data as { error?: string }).error || t("home.streamError"),
            );
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || t("common.stopped") }
              : m,
          ),
        );
      } else {
        const msg = err instanceof Error ? err.message : t("home.failedToSend");
        setError(msg);
        setMessages((prev) =>
          prev.filter((m) => m.id !== userTurn.id && m.id !== assistantId),
        );
        setInput(text);
        if (imagesToSend.length) setPendingImages(imagesToSend);
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

  const applyComposerTool = useCallback((starter: string) => {
    setInput((prev) => withComposerStarter(prev, starter));
    requestAnimationFrame(() => {
      autoResizeTextarea(textareaRef.current);
      textareaRef.current?.focus();
    });
  }, []);

  const composerToolSections = useMemo(() => {
    const imageHint = canAttachImages
      ? t("chat.uploadImageHint")
      : supportsVision
        ? t("chat.uploadImageNeedAdmin")
        : t("chat.uploadImageNeedVision");
    return [
      {
        id: "uploads",
        items: [
          {
            id: "image",
            label: t("chat.attachImage"),
            hint: imageHint,
            icon: Paperclip,
            disabled: actionsLocked || !canAttachImages,
            onSelect: () => fileInputRef.current?.click(),
          },
        ],
      },
      {
        id: "write",
        items: [
          {
            id: "summarize",
            label: t("chat.toolSummarize"),
            hint: t("chat.toolSummarizeHint"),
            icon: TextQuote,
            disabled: actionsLocked,
            onSelect: () => applyComposerTool(t("chat.toolSummarizePrompt")),
          },
          {
            id: "translate",
            label: t("chat.toolTranslate"),
            hint: t("chat.toolTranslateHint"),
            icon: Languages,
            disabled: actionsLocked,
            onSelect: () => applyComposerTool(t("chat.toolTranslatePrompt")),
          },
        ],
      },
    ];
  }, [
    actionsLocked,
    applyComposerTool,
    canAttachImages,
    supportsVision,
    t,
  ]);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden text-[var(--home-fg)]">
      <AnimatedBackground />

      <header className="page-chrome safe-x relative z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-8 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src={sinamLogo}
            alt={t("common.brand")}
            width={36}
            height={36}
            className="h-9 w-9 rounded-full"
            style={{ width: "auto", height: "auto" }}
            priority
          />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-[0.04em] text-[var(--home-fg)]">
              {t("common.brand")}
            </p>
            <p className="hidden text-[11px] text-[var(--home-faint)] sm:block">
              {t("home.tagline")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <LanguageToggle size="sm" />
          <ThemeToggle size="sm" />
          <Link
            href="/models"
            className="rounded-full px-2.5 py-1.5 text-xs text-[var(--home-muted)] transition hover:bg-[var(--home-chip-bg)] hover:text-[var(--home-fg)] sm:px-4 sm:py-2 sm:text-sm"
          >
            {t("chat.modelsGuide")}
          </Link>
          <Link
            href="/login"
            className="rounded-full px-2.5 py-1.5 text-xs text-[var(--home-muted)] transition hover:bg-[var(--home-chip-bg)] hover:text-[var(--home-fg)] sm:px-4 sm:py-2 sm:text-sm"
          >
            {t("home.signIn")}
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-[0_8px_24px_rgba(37,99,235,0.3)] transition hover:from-blue-500 hover:to-sky-400 sm:px-4 sm:py-2 sm:text-sm"
          >
            {t("home.signUp")}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-8">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-1 pb-4 text-center">
            <div className="hero-copy">
              <h1 className="text-[1.85rem] font-normal tracking-tight text-[var(--home-fg)] sm:text-[2.9rem]">
                {guestEnabled
                  ? t("home.heroAsk")
                  : t("home.heroSignIn")}
              </h1>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[var(--home-muted)]">
                {guestEnabled
                  ? t("home.heroAskSub")
                  : t("home.heroDisabledSub")}
              </p>
              {guestEnabled && usage ? (
                <p className="mt-3 text-xs text-[var(--home-faint)]">
                  {usage.remaining === 1
                    ? t("home.messagesLeftOne", { n: usage.remaining })
                    : t("home.messagesLeftMany", { n: usage.remaining })}
                </p>
              ) : null}
            </div>

            {guestEnabled ? (
              <div className="hero-actions mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:mt-10">
                {suggestions.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => void handleSend(item.prompt)}
                    disabled={actionsLocked}
                    className="suggestion-tile soft-rise rounded-2xl border border-[var(--home-card-border)] bg-[var(--home-chip-bg)] px-4 py-3.5 text-left hover:-translate-y-0.5 hover:border-[var(--accent)]/40 disabled:opacity-40 sm:px-5 sm:py-4"
                    style={{ animationDelay: `${0.08 + 0.06 * index}s` }}
                  >
                    <span className="block text-sm font-medium text-[var(--home-fg)]">
                      {item.title}
                    </span>
                    <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--home-muted)]">
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
                  {t("home.signIn")}
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-full border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] px-6 py-2.5 text-sm font-medium text-[var(--home-fg)]"
                >
                  {t("home.createAccount")}
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
                        {t("home.dailyLimitLabel")}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold tracking-tight text-[var(--home-fg)]">
                        {t("home.dailyLimitTitle")}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-[var(--home-muted)]">
                        {t("home.dailyLimitSub")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)] transition hover:from-blue-500 hover:to-sky-400"
                    >
                      {t("home.signIn")}
                    </Link>
                    <Link
                      href="/register"
                      className="inline-flex items-center justify-center rounded-full border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] px-4 py-2 text-xs font-medium text-[var(--home-fg)] transition hover:border-[var(--accent)]/40"
                    >
                      {t("home.createAccount")}
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
                {t("home.newTry")}
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
                      <span>{isUser ? t("common.you") : t("common.brand")}</span>
                      {message.createdAt ? (
                        <span className="opacity-70">
                          · {formatChatTime(message.createdAt, locale)}
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
                        <div className="space-y-2">
                          <MessageImages
                            items={
                              message.images?.map((img) => ({
                                src: imagePreviewUrl(img),
                                name: img.name,
                              })) ?? []
                            }
                          />
                          {message.content ? (
                            <p className="whitespace-pre-wrap">
                              {message.content}
                            </p>
                          ) : null}
                        </div>
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
                      <>
                        <KnowledgeCitations
                          sources={message.sources}
                          tone="home"
                        />
                        <div className="mt-1 flex items-center gap-1">
                          <CopyButton
                            text={message.content}
                            className="text-[var(--home-faint)] hover:bg-[var(--home-chip-bg)] hover:text-[var(--home-fg)]"
                          />
                          <SpeakButton
                            text={message.content}
                            enabled={canListen}
                            className="text-[var(--home-faint)] hover:bg-[var(--home-chip-bg)] hover:text-[var(--home-fg)]"
                          />
                        </div>
                      </>
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
                  {t("home.dailyLimitLabel")}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--home-fg)]">
                  {t("home.dailyLimitTitle")}
                </p>
                <p className="mt-0.5 text-xs text-[var(--home-muted)]">
                  {t("home.dailyLimitSub")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)] transition hover:from-blue-500 hover:to-sky-400"
                >
                  {t("home.signIn")}
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center rounded-full border border-[var(--home-chip-border)] bg-[var(--home-chip-bg)] px-4 py-2 text-xs font-medium text-[var(--home-fg)] transition hover:border-[var(--accent)]/40"
                >
                  {t("home.createAccount")}
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
          className={`composer-shell relative sticky bottom-0 z-20 rounded-[28px] border bg-[var(--home-card-bg)] p-2 backdrop-blur-md focus-within:border-[var(--accent)]/50 focus-within:ring-4 focus-within:ring-[var(--ring)] ${
            isDraggingOver
              ? "border-[var(--accent)] ring-4 ring-[var(--ring)]"
              : "border-[var(--home-card-border)]"
          }`}
          style={{ boxShadow: "var(--home-card-shadow)" }}
          onDragEnter={handleComposerDragEnter}
          onDragOverCapture={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDropCapture={handleComposerDrop}
        >
          {isDraggingOver ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[28px] bg-sky-500/15 text-sm font-medium text-sky-800 dark:text-sky-100">
              {t("chat.dropImages")}
            </div>
          ) : null}
          {pendingImages.length ? (
            <div className="px-3 pt-2">
              <MessageImages
                tone="composer"
                items={pendingImages.map((img) => ({
                  src: imagePreviewUrl(img),
                  name: img.name,
                }))}
                onRemove={(index) =>
                  setPendingImages((prev) => prev.filter((_, i) => i !== index))
                }
                removeLabel={t("chat.removeImage")}
              />
            </div>
          ) : null}
          <div className="flex items-end gap-1.5 sm:gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addImageFiles(files);
              }}
            />
            <ComposerToolsMenu
              sections={composerToolSections}
              disabled={actionsLocked}
              ariaLabel={t("chat.toolsMenu")}
              closeLabel={t("chat.closeTools")}
              footer={
                <Link
                  href="/login"
                  className="menu-item flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left"
                >
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--hover)] text-[var(--text)]">
                    <UserRound size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-[var(--text)]">
                      {t("chat.toolsSignIn")}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
                      {t("chat.toolsSignInHint")}
                    </span>
                  </span>
                </Link>
              }
            />
            {/* text-base (16px) on phones — anything smaller makes iOS Safari
                zoom the page when the field takes focus. */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
                const files = Array.from(event.clipboardData.files);
                if (!files.length || !canDropImages) return;
                event.preventDefault();
                void addDroppedFiles(files);
              }}
              rows={1}
              placeholder={
                !guestEnabled
                  ? t("home.placeholderDisabled")
                  : limitHit
                    ? t("home.placeholderLimit")
                    : pendingImages.length
                      ? t("chat.imagePlaceholder")
                      : t("home.placeholderAsk")
              }
              disabled={limitHit || !guestEnabled}
              className="max-h-40 min-h-[48px] min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-base text-[var(--home-input)] outline-none placeholder:text-[var(--home-placeholder)] disabled:opacity-50 sm:px-3 sm:text-[15px]"
            />
            {guestEnabled ? (
              <ModelPicker
                models={models}
                value={model}
                onChange={setModel}
                disabled={isSending || limitHit}
                size="sm"
                variant="composer"
                emptyLabel={t("chat.noModels")}
                ariaLabel={t("chat.model")}
                hintFor={(option) => {
                  const key = fleetHintKey(option.name);
                  return key ? t(key) : undefined;
                }}
                className="shrink-0"
              />
            ) : null}
            {isSending ? (
              <button
                type="button"
                onClick={handleStop}
                className="mb-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--home-chip-bg)] text-[var(--home-chip-fg)] sm:h-10 sm:w-10"
                aria-label={t("home.stop")}
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={
                  actionsLocked ||
                  (ready && !input.trim() && pendingImages.length === 0)
                }
                className="mb-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.35)] transition hover:from-blue-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-10"
                aria-label={t("home.send")}
              >
                <SendHorizonal size={16} />
              </button>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] leading-snug text-[var(--home-faint)] sm:text-[11px]">
          {canAttachImages || canImportImages
            ? t("chat.visionFooterHint")
            : t("home.footerHint")}
        </p>
      </main>
    </div>
  );
};
