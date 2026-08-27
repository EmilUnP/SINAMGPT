import { X } from "lucide-react";
import type { RefObject } from "react";
import type { useLocale } from "@/components/LocaleProvider";
import { ChatEmptyState } from "./ChatEmptyState";
import { ChatMessageList } from "./ChatMessageList";
import type { UiMessage } from "./chat-types";
import type { useChatModels } from "./hooks/useChatModels";
import type { useChatStream } from "./hooks/useChatStream";
import type { useConversations } from "./hooks/useConversations";

type ChatConversationPanelProps = {
  username: string;
  error: string;
  setError: (message: string) => void;
  isReady: boolean;
  isSending: boolean;
  canListen: boolean;
  locale: ReturnType<typeof useLocale>["locale"];
  t: ReturnType<typeof useLocale>["t"];
  bottomRef: RefObject<HTMLDivElement | null>;
  conversations: ReturnType<typeof useConversations>;
  modelState: ReturnType<typeof useChatModels>;
  stream: ReturnType<typeof useChatStream>;
};

export const ChatConversationPanel = ({
  username,
  error,
  setError,
  isReady,
  isSending,
  canListen,
  locale,
  t,
  bottomRef,
  conversations,
  modelState,
  stream,
}: ChatConversationPanelProps) => (
  <>
    {(modelState.modelsError || error) && (
      <div className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-[var(--text)]">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <p>{error || modelState.modelsError}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              modelState.setModelsError("");
              void modelState.loadModels();
            }}
            className="shrink-0 rounded-md p-1 hover:bg-amber-500/15"
            aria-label={t("common.dismiss")}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )}
    <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
      {conversations.messages.length === 0 ? (
        <ChatEmptyState
          username={username}
          suggestions={[
            {
              title: t("chat.suggestionHello"),
              prompt: t("chat.suggestionHelloPrompt"),
            },
            {
              title: t("chat.suggestionAi"),
              prompt: t("chat.suggestionAiPrompt"),
            },
            {
              title: t("chat.suggestionTip"),
              prompt: t("chat.suggestionTipPrompt"),
            },
            {
              title: t("chat.suggestionFact"),
              prompt: t("chat.suggestionFactPrompt"),
            },
          ]}
          isDisabled={isReady && (isSending || !modelState.model)}
          onSelect={(prompt) => void stream.send(prompt)}
          t={t}
        />
      ) : (
        <ChatMessageList
          messages={conversations.messages}
          lastUserId={conversations.lastUserMessage?.id}
          lastAssistantId={conversations.lastAssistantMessage?.id}
          editingId={conversations.editingId}
          editDraft={conversations.editDraft}
          isSending={isSending}
          canListen={canListen}
          locale={locale}
          bottomRef={bottomRef}
          onEditDraftChange={conversations.setEditDraft}
          onStartEdit={(message: UiMessage) => {
            if (isSending) return;
            conversations.setEditingId(message.id);
            conversations.setEditDraft(message.content);
          }}
          onCancelEdit={() => {
            conversations.setEditingId(null);
            conversations.setEditDraft("");
          }}
          onSaveEdit={() => void stream.saveEdit()}
          onRewrite={(style) => void stream.rewrite(style)}
          onRegenerate={() => void stream.regenerate()}
          t={t}
        />
      )}
    </div>
  </>
);
