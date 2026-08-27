import { Pencil, RefreshCw } from "lucide-react";
import type { useLocale } from "@/components/LocaleProvider";
import { CopyButton } from "./CopyButton";
import { SpeakButton } from "./SpeakButton";
import type { UiMessage } from "./chat-types";

type Translate = ReturnType<typeof useLocale>["t"];

type ChatMessageActionsProps = {
  message: UiMessage;
  isUser: boolean;
  isLastUser: boolean;
  isLastAssistant: boolean;
  canListen: boolean;
  onEdit: (message: UiMessage) => void;
  onRewrite: (style: "shorter" | "formal" | "continue") => void;
  onRegenerate: () => void;
  t: Translate;
};

export const ChatMessageActions = ({
  message,
  isUser,
  isLastUser,
  isLastAssistant,
  canListen,
  onEdit,
  onRewrite,
  onRegenerate,
  t,
}: ChatMessageActionsProps) => (
  <div
    className={`mt-1 flex max-w-full items-center gap-1 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible ${
      isUser ? "justify-end" : ""
    }`}
  >
    {!isUser && message.content ? (
      <>
        <CopyButton
          text={message.content}
          className="text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
        />
        <SpeakButton
          text={message.content}
          enabled={canListen && !message.isStreaming}
          className="text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
        />
      </>
    ) : null}
    {isUser && isLastUser ? (
      <button
        type="button"
        onClick={() => onEdit(message)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
      >
        <Pencil size={12} />
        {t("chat.edit")}
      </button>
    ) : null}
    {!isUser && isLastAssistant && message.content ? (
      <>
        {(["shorter", "formal", "continue"] as const).map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => onRewrite(style)}
            className="shrink-0 rounded-md px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] sm:py-1"
          >
            {style === "shorter"
              ? t("chat.shorter")
              : style === "formal"
                ? t("chat.moreFormal")
                : t("chat.continue")}
          </button>
        ))}
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] sm:py-1"
        >
          <RefreshCw size={12} />
          {t("chat.regenerate")}
        </button>
      </>
    ) : null}
  </div>
);
