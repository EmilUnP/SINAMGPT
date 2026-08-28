import Image from "next/image";
import sinamLogo from "@/assets/sinam_logo.png";
import type { useLocale } from "@/components/LocaleProvider";
import { KnowledgeCitations } from "./KnowledgeCitations";
import { ChatMessageActions } from "./ChatMessageActions";
import { ChatMessageContent } from "./ChatMessageContent";
import { ChatMessageEdit } from "./ChatMessageEdit";
import type { UiMessage } from "./chat-types";
import { formatChatTime } from "@/lib/ui";
import type { AppLocale } from "@/lib/locale";

type Translate = ReturnType<typeof useLocale>["t"];

type ChatMessageListProps = {
  messages: UiMessage[];
  lastUserId?: string;
  lastAssistantId?: string;
  editingId: string | null;
  editDraft: string;
  isSending: boolean;
  canListen: boolean;
  locale: AppLocale;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onEditDraftChange: (value: string) => void;
  onStartEdit: (message: UiMessage) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRewrite: (style: "shorter" | "formal" | "continue") => void;
  onRegenerate: () => void;
  t: Translate;
};

export const ChatMessageList = ({
  messages,
  lastUserId,
  lastAssistantId,
  editingId,
  editDraft,
  isSending,
  canListen,
  locale,
  bottomRef,
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRewrite,
  onRegenerate,
  t,
}: ChatMessageListProps) => (
  <div className="mx-auto w-full max-w-3xl space-y-5 px-3 py-4 sm:px-4 sm:py-6 md:px-6">
    {messages.map((message) => {
      const isUser = message.role === "user";
      const isEditing = editingId === message.id;
      return (
        <div
          key={message.id}
          className={`animate-fade-up flex ${isUser ? "justify-end" : "justify-start"}`}
        >
          <div className={`max-w-[92%] md:max-w-[85%] ${isUser ? "" : "w-full"}`}>
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
              <span>{isUser ? t("chat.you") : t("common.brand")}</span>
              {message.created_at ? (
                <span className="opacity-70">
                  · {formatChatTime(message.created_at, locale)}
                </span>
              ) : null}
            </div>
            <div
              className={`rounded-2xl px-3 py-2.5 text-sm sm:px-4 sm:py-3 ${
                isUser
                  ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-sm"
                  : "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
              }`}
            >
              {isEditing ? (
                <ChatMessageEdit
                  draft={editDraft}
                  isSending={isSending}
                  onDraftChange={onEditDraftChange}
                  onSave={onSaveEdit}
                  onCancel={onCancelEdit}
                  t={t}
                />
              ) : (
                <ChatMessageContent message={message} isUser={isUser} />
              )}
            </div>
            {!isUser && !message.isStreaming ? (
              <KnowledgeCitations sources={message.sources} />
            ) : null}
            {!isSending && !isEditing ? (
              <ChatMessageActions
                message={message}
                isUser={isUser}
                isLastUser={lastUserId === message.id}
                isLastAssistant={lastAssistantId === message.id}
                canListen={canListen}
                onEdit={onStartEdit}
                onRewrite={onRewrite}
                onRegenerate={onRegenerate}
                t={t}
              />
            ) : null}
          </div>
        </div>
      );
    })}
    <div ref={bottomRef} />
  </div>
);
