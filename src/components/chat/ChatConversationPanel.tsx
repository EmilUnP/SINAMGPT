"use client";

import { ArrowDown, X } from "lucide-react";
import type { useLocale } from "@/components/LocaleProvider";
import { ChatEmptyState } from "./ChatEmptyState";
import { ChatMessageList } from "./ChatMessageList";
import type { UiMessage } from "./chat-types";
import type { useChatModels } from "./hooks/useChatModels";
import { useStickToBottomScroll } from "./hooks/useStickToBottomScroll";
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
  conversations,
  modelState,
  stream,
}: ChatConversationPanelProps) => {
  const lastAssistant = conversations.lastAssistantMessage;
  /*
   * During a web search the reply text stays empty for tens of seconds while
   * the activity strip grows — steps appear, site chips land, the skeleton
   * shows. Keying only on `content` meant the scroller was never told anything
   * changed, so the view sat still while the bubble grew off screen.
   */
  const activityKey =
    lastAssistant?.toolActivity
      ?.map((step) => `${step.callId}:${step.status}:${step.sites?.length ?? 0}`)
      .join("|") ?? "";

  const { scrollerRef, scrollerProps, isAtBottom, scrollToBottom } =
    useStickToBottomScroll(
      conversations.messages.length,
      `${lastAssistant?.content ?? ""}|${activityKey}`,
      conversations.activeId,
    );

  return (
    <>
      {(modelState.modelsError || error) && (
        <div className="border-b border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-[var(--text)] sm:px-4">
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
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        className="chat-scroll min-h-0 flex-1 overflow-y-auto"
        {...scrollerProps}
      >
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

        {!isAtBottom && conversations.messages.length > 0 ? (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] text-[var(--text)] shadow-lg transition hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <ArrowDown size={13} aria-hidden="true" />
            {t("chat.jumpToLatest")}
          </button>
        ) : null}
      </div>
    </>
  );
};
