"use client";

import { useLocale } from "@/components/LocaleProvider";

type MessageAudioProps = {
  src: string;
  name?: string;
  onRemove?: () => void;
  removeLabel?: string;
  tone?: "user" | "composer";
};

export const MessageAudio = ({
  src,
  name,
  onRemove,
  removeLabel,
  tone = "user",
}: MessageAudioProps) => {
  const { t } = useLocale();
  const resolvedRemove = removeLabel || t("chat.removeAudio");
  const resolvedName = name || t("chat.voiceRecording");

  return (
    <div
      className={`relative flex items-center gap-2 rounded-xl px-2 py-1.5 ${
        tone === "composer"
          ? "border border-[var(--border)] bg-[var(--bg)]"
          : "bg-black/15"
      }`}
    >
      <audio
        controls
        preload="metadata"
        src={src}
        className="max-w-full min-w-[14rem] flex-1"
        aria-label={resolvedName}
      >
        <source src={src} type="audio/wav" />
      </audio>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/70 text-sm text-white hover:bg-black/85"
          aria-label={resolvedRemove}
        >
          ×
        </button>
      ) : null}
    </div>
  );
};
