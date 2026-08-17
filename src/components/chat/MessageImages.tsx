"use client";

type ImageItem = {
  src: string;
  name?: string;
};

type MessageImagesProps = {
  items: ImageItem[];
  onRemove?: (index: number) => void;
  removeLabel?: string;
  tone?: "user" | "composer" | "home";
};

export const MessageImages = ({
  items,
  onRemove,
  removeLabel = "Remove image",
  tone = "user",
}: MessageImagesProps) => {
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <div
          key={`${item.src}-${index}`}
          className="relative overflow-hidden rounded-xl"
        >
          {/* User-uploaded previews / authenticated attachment URLs */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.src}
            alt={item.name || ""}
            className={`block max-h-44 max-w-[min(100%,14rem)] object-cover ${
              tone === "composer" ? "h-16 w-16" : ""
            }`}
          />
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-black/85"
              aria-label={removeLabel}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
};
