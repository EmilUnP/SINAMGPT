import { isCannedVoicePrompt } from "@/lib/media/voice-prompt";
import { MarkdownMessage } from "./MarkdownMessage";
import { MessageAudio } from "./MessageAudio";
import { MessageImages } from "./MessageImages";
import { SearchActivity } from "./SearchActivity";
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

  if (steps?.length) {
    return (
      <div>
        <SearchActivity
          steps={steps}
          awaitingAnswer={!hasContent && steps.every((s) => s.status !== "running")}
        />
        {hasContent ? (
          <div className="mt-3">
            <MarkdownMessage content={message.content} />
          </div>
        ) : null}
      </div>
    );
  }

  if (hasContent) return <MarkdownMessage content={message.content} />;

  return (
    <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
};
