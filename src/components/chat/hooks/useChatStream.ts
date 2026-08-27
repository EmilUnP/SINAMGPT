import { useRef } from "react";
import type { useLocale } from "@/components/LocaleProvider";
import type { AppLocale } from "@/lib/locale";
import type { Conversation, KnowledgeCitation, Message } from "@/lib/types";
import type { PendingAudio, PendingImage, UiMessage } from "../chat-types";
import { parseSseChunk } from "@/lib/parse-sse-chunk";

type Translate = ReturnType<typeof useLocale>["t"];

type UseChatStreamOptions = {
  activeId: string | null;
  activeProjectId: string | null;
  model: string;
  locale: AppLocale;
  input: string;
  pendingImages: PendingImage[];
  pendingAudio: PendingAudio | null;
  isRecording: boolean;
  lastUserMessage?: UiMessage;
  lastAssistantMessage?: UiMessage;
  editingId: string | null;
  editDraft: string;
  search: string;
  isSending: boolean;
  setIsSending: (isSending: boolean) => void;
  setActiveId: (id: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<UiMessage[]>>;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  setEditingId: (id: string | null) => void;
  setInput: (value: string) => void;
  setPendingImages: React.Dispatch<React.SetStateAction<PendingImage[]>>;
  setPendingAudio: (audio: PendingAudio | null) => void;
  setError: (message: string) => void;
  stopMicSession: () => Promise<PendingAudio | null>;
  loadConversations: (query?: string) => Promise<Conversation[]>;
  openConversation: (id: string) => Promise<void>;
  t: Translate;
};

export const useChatStream = ({
  activeId,
  activeProjectId,
  model,
  locale,
  input,
  pendingImages,
  pendingAudio,
  isRecording,
  lastUserMessage,
  lastAssistantMessage,
  editingId,
  editDraft,
  search,
  isSending,
  setIsSending,
  setActiveId,
  setMessages,
  setConversations,
  setEditingId,
  setInput,
  setPendingImages,
  setPendingAudio,
  setError,
  stopMicSession,
  loadConversations,
  openConversation,
  t,
}: UseChatStreamOptions) => {
  const abortRef = useRef<AbortController | null>(null);
  const sendLockRef = useRef(false);

  const runChatRequest = async (options: {
    body: Record<string, unknown>;
    prepareMessages: () => {
      tempUserId?: string;
      tempAssistantId: string;
    };
    restoreOnError?: string;
    restoreImagesOnError?: PendingImage[];
    restoreAudioOnError?: PendingAudio | null;
    reloadConversationOnError?: boolean;
  }) => {
    if (isSending) return;
    if (!model) {
      setError(t("chat.noModelSelected"));
      return;
    }
    setError("");
    setIsSending(true);
    setEditingId(null);
    const { tempUserId, tempAssistantId } = options.prepareMessages();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ ...options.body, locale }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("chat.chatFailed"));
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
              sources?: KnowledgeCitation[] | null;
            };
            conversationId = meta.conversationId;
            setActiveId(meta.conversationId);
            setConversations((current) =>
              [meta.conversation, ...current.filter((chat) => chat.id !== meta.conversationId)]
                .sort((a, b) => {
                  if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
                  return b.updated_at.localeCompare(a.updated_at);
                }),
            );
            setMessages((current) =>
              current.map((message) => {
                if (tempUserId && message.id === tempUserId) {
                  return { ...meta.userMessage };
                }
                if (message.id === tempAssistantId) {
                  return {
                    ...message,
                    conversation_id: meta.conversationId,
                    sources: meta.sources?.length ? meta.sources : null,
                  };
                }
                if (message.id === meta.userMessage.id) {
                  return { ...meta.userMessage };
                }
                return message;
              }),
            );
          }
          if (parsed.event === "token") {
            const token = (parsed.data as { content: string }).content;
            setMessages((current) =>
              current.map((message) =>
                message.id === tempAssistantId
                  ? { ...message, content: message.content + token }
                  : message,
              ),
            );
          }
          if (parsed.event === "done") {
            const data = parsed.data as { assistantMessage: Message };
            setMessages((current) =>
              current.map((message) =>
                message.id === tempAssistantId
                  ? { ...data.assistantMessage }
                  : message,
              ),
            );
            if (conversationId) void loadConversations(search);
          }
          if (parsed.event === "error") {
            throw new Error(
              (parsed.data as { error?: string }).error || t("chat.streamError"),
            );
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setMessages((current) =>
          current.map((message) =>
            message.id === tempAssistantId
              ? {
                  ...message,
                  isStreaming: false,
                  content: message.content || t("common.stopped"),
                }
              : message,
          ),
        );
      } else {
        setError(
          error instanceof Error ? error.message : t("chat.failedToSend"),
        );
        if (options.reloadConversationOnError && activeId) {
          await openConversation(activeId);
        } else {
          setMessages((current) =>
            current.filter(
              (message) =>
                message.id !== tempUserId && message.id !== tempAssistantId,
            ),
          );
        }
        if (options.restoreOnError != null) setInput(options.restoreOnError);
        if (options.restoreImagesOnError?.length) {
          setPendingImages(options.restoreImagesOnError);
        }
        if (options.restoreAudioOnError) {
          setPendingAudio(options.restoreAudioOnError);
        }
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
      setMessages((current) =>
        current.map((message) => ({ ...message, isStreaming: false })),
      );
    }
  };

  const send = async (preset?: string) => {
    if (sendLockRef.current || isSending) return;
    sendLockRef.current = true;
    try {
      let audioToSend = preset ? null : pendingAudio;
      if (!preset && isRecording) audioToSend = await stopMicSession();
      const text = (preset ?? input).trim();
      const imagesToSend = preset ? [] : pendingImages;
      const messageText =
        text || (audioToSend ? t("chat.audioDefaultPrompt") : "");
      if ((!messageText && imagesToSend.length === 0) || !model) return;
      setInput("");
      if (imagesToSend.length) setPendingImages([]);
      if (audioToSend) setPendingAudio(null);
      await runChatRequest({
        body: {
          conversationId: activeId ?? undefined,
          message: messageText,
          images: imagesToSend.map(({ mime, data, name }) => ({ mime, data, name })),
          audio: audioToSend
            ? { mime: audioToSend.mime, data: audioToSend.data, name: audioToSend.name }
            : undefined,
          model,
          projectId: activeId ? undefined : activeProjectId,
          mode: "send",
        },
        restoreOnError: text,
        restoreImagesOnError: imagesToSend,
        restoreAudioOnError: audioToSend,
        prepareMessages: () => {
          const now = Date.now();
          const tempUserId = `temp-user-${now}`;
          const tempAssistantId = `temp-assistant-${now}`;
          setMessages((current) => [
            ...current,
            {
              id: tempUserId,
              conversation_id: activeId ?? "pending",
              role: "user",
              content: messageText,
              created_at: new Date().toISOString(),
              localImages: imagesToSend.length ? imagesToSend : undefined,
              localAudio: audioToSend ?? undefined,
            },
            {
              id: tempAssistantId,
              conversation_id: activeId ?? "pending",
              role: "assistant",
              content: "",
              created_at: new Date().toISOString(),
              isStreaming: true,
            },
          ]);
          return { tempUserId, tempAssistantId };
        },
      });
    } finally {
      sendLockRef.current = false;
    }
  };

  const replaceLastAssistant = async (
    body: Record<string, unknown>,
  ) => {
    if (!activeId || isSending) return;
    await runChatRequest({
      body,
      reloadConversationOnError: true,
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
        setMessages((current) => [
          ...(current.at(-1)?.role === "assistant" ? current.slice(0, -1) : current),
          tempAssistant,
        ]);
        return { tempAssistantId };
      },
    });
  };

  const regenerate = async () => {
    if (!lastUserMessage) return;
    await replaceLastAssistant({
      conversationId: activeId,
      model,
      mode: "regenerate",
    });
  };

  const rewrite = async (style: "shorter" | "formal" | "continue") => {
    if (!lastAssistantMessage) return;
    await replaceLastAssistant({
      conversationId: activeId,
      model,
      mode: "rewrite",
      rewrite: style,
    });
  };

  const saveEdit = async () => {
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
      reloadConversationOnError: true,
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
        setMessages((current) => {
          const index = current.findIndex((message) => message.id === editMessageId);
          if (index < 0) return current;
          const kept = current.slice(0, index + 1).map((message) =>
            message.id === editMessageId ? { ...message, content: text } : message,
          );
          return [...kept, tempAssistant];
        });
        return { tempAssistantId };
      },
    });
  };

  return {
    isSending,
    send,
    regenerate,
    rewrite,
    saveEdit,
    stop: () => abortRef.current?.abort(),
  };
};
