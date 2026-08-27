import { useCallback, useEffect, useRef, useState } from "react";
import type { useLocale } from "@/components/LocaleProvider";
import type { Conversation, Message } from "@/lib/types";
import type { UiMessage } from "../chat-types";

type Translate = ReturnType<typeof useLocale>["t"];

type UseConversationsOptions = {
  t: Translate;
  confirm: ReturnType<typeof import("@/components/ConfirmDialog").useConfirm>;
  activeProjectId: string | null;
  setError: (message: string) => void;
  setModel: (model: string) => void;
};

export const useConversations = ({
  t,
  confirm,
  activeProjectId,
  setError,
  setModel,
}: UseConversationsOptions) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [search, setSearch] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [shareToken, setShareToken] = useState<string | null>(null);
  const searchTimerRef = useRef<number | null>(null);

  const loadConversations = useCallback(
    async (query?: string, projectId?: string | null) => {
      const params = new URLSearchParams();
      const normalizedQuery = (query ?? "").trim();
      const selectedProject =
        projectId === undefined ? activeProjectId : projectId;
      if (normalizedQuery) params.set("q", normalizedQuery);
      if (selectedProject) params.set("projectId", selectedProject);
      const suffix = params.toString();
      const res = await fetch(
        suffix ? `/api/conversations?${suffix}` : "/api/conversations",
      );
      if (!res.ok) throw new Error(t("chat.failedLoadChats"));
      const data = (await res.json()) as { conversations: Conversation[] };
      setConversations(data.conversations);
      return data.conversations;
    },
    [activeProjectId, t],
  );

  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      void loadConversations(search, activeProjectId).catch(() => undefined);
    }, 250);
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    };
  }, [search, activeProjectId, loadConversations]);

  const openConversation = async (id: string) => {
    setError("");
    setEditingId(null);
    setActiveId(id);
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) {
      setError(t("chat.couldNotOpen"));
      return;
    }
    const data = (await res.json()) as {
      conversation: Conversation;
      messages: Message[];
    };
    setMessages(data.messages);
    setModel(data.conversation.model);
    setShareToken(data.conversation.share_token ?? null);
  };

  const deleteConversation = async (id: string) => {
    const ok = await confirm({
      title: t("chat.deleteChat"),
      description: t("chat.deleteChatConfirm"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(t("chat.couldNotDeleteChat"));
      return;
    }
    setConversations((current) => current.filter((chat) => chat.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      setEditingId(null);
    }
  };

  const togglePin = async (chat: Conversation) => {
    const res = await fetch(`/api/conversations/${chat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_pinned: chat.is_pinned !== 1 }),
    });
    if (!res.ok) {
      setError(t("chat.couldNotUpdatePin"));
      return;
    }
    const data = (await res.json()) as { conversation?: Conversation };
    if (!data.conversation) {
      void loadConversations(search);
      return;
    }
    setConversations((current) =>
      current
        .map((item) => (item.id === chat.id ? data.conversation! : item))
        .sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
          return b.updated_at.localeCompare(a.updated_at);
        }),
    );
  };

  const activeConversation =
    conversations.find((chat) => chat.id === activeId) ?? null;
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  return {
    conversations,
    setConversations,
    activeId,
    setActiveId,
    messages,
    setMessages,
    search,
    setSearch,
    isLoadingList,
    setIsLoadingList,
    editingId,
    setEditingId,
    editDraft,
    setEditDraft,
    shareToken,
    setShareToken,
    loadConversations,
    openConversation,
    deleteConversation,
    togglePin,
    activeConversation,
    lastUserMessage,
    lastAssistantMessage,
  };
};
