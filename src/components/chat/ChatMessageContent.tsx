import { isCannedVoicePrompt } from "@/lib/media/voice-prompt";
import { MarkdownMessage } from "./MarkdownMessage";
import { MessageAudio } from "./MessageAudio";
import { MessageImages } from "./MessageImages";
import { SearchActivity } from "./SearchActivity";
import { ThinkingBlock } from "./ThinkingBlock";
import { messageAudioItems, messageImageItems } from "./message-attachments";
import type { UiMessage } from "./chat-types";

type ChatMessageContentProps = {
  message: UiMessage;
  isUser: boolean;
};

export const ChatMessageContent = ({
  message,
  isUser,
}: ChatMessageContentProps) => {
  if (isUser) {
    return (
      <div className="space-y-2">
        <MessageImages items={messageImageItems(message)} />
        {messageAudioItems(message).map((audio) => (
          <MessageAudio
            key={audio.src}
            src={audio.src}
            name={audio.name}
            durationMs={audio.durationMs}
          />
        ))}
        {message.content && !isCannedVoicePrompt(message.content) ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : null}
      </div>
    );
  }

  const steps = message.toolActivity;
  const hasContent = Boolean(message.content);
  const thinking = message.reasoning?.trim() ? (
    <div className="mb-2">
      <ThinkingBlock
        reasoning={message.reasoning}
        active={Boolean(message.isStreaming) && message.reasoningMs == null}
        startedAt={message.reasoningStartedAt}
        durationMs={message.reasoningMs}
      />
    </div>
  ) : null;

  if (steps?.length) {
    return (
      <div>
        {thinking}
        <SearchActivity
          steps={steps}
          awaitingAnswer={!hasContent && steps.every((s) => s.status !== "running")}
        />
        {hasContent ? (
          <div className="mt-3">
            <MarkdownMessage content={message.content} sources={message.sources} />
          </div>
        ) : null}
      </div>
    );
  }

  if (hasContent) {
    return thinking ? (
      <div>
        {thinking}
        <MarkdownMessage content={message.content} sources={message.sources} />
      </div>
    ) : (
      <MarkdownMessage content={message.content} sources={message.sources} />
    );
  }

  // Thinking replaces the typing dots: the user can see the model working.
  if (thinking) return thinking;

  return (
    <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
};
