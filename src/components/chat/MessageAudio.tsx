"use client";

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
  removeLabel = "Remove recording",
  tone = "user",
}: MessageAudioProps) => {
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
        aria-label={name || "Voice recording"}
      >
        <source src={src} type="audio/wav" />
      </audio>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/70 text-sm text-white hover:bg-black/85"
          aria-label={removeLabel}
        >
          ×
        </button>
      ) : null}
    </div>
  );
};
