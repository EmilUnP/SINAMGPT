"use client";

import { Image, Mic, Puzzle, Type, Video, Volume2 } from "lucide-react";
import { useTranslations } from "@/components/LocaleProvider";

export type ModelCapabilityFlags = {
  vision?: boolean;
  tools?: boolean;
  audio?: boolean;
  tts?: boolean;
  video?: boolean;
};

type Props = ModelCapabilityFlags & {
  /** Admin table and Models guide show Text; the chat picker skips it to save space. */
  showText?: boolean;
  size?: "sm" | "md";
  /** Labeled chips by default; icons in the chat model picker. */
  presentation?: "chips" | "icons";
};

const pillClass = (size: "sm" | "md", tone: string) =>
  size === "sm"
    ? `cap-chip shrink-0 cursor-help rounded-md px-1.5 py-0.5 text-[10px] ${tone}`
    : `cap-chip inline-flex cursor-help rounded-md px-2 py-0.5 text-[11px] ${tone}`;

const iconWrapClass = (tone: string) =>
  `cap-chip inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-md ${tone}`;

export const ModelCapabilityBadges = ({
  vision,
  tools,
  audio,
  tts,
  video,
  showText = false,
  size = "md",
  presentation = "chips",
}: Props) => {
  const t = useTranslations();
  if (!showText && !vision && !tools && !audio && !tts && !video) return null;

  const items = [
    showText
      ? {
          key: "text",
          tone: "cap-chip-text",
          title: t("chat.inputTextHint"),
          label: t("chat.inputText"),
          Icon: Type,
        }
      : null,
    vision
      ? {
          key: "image",
          tone: "cap-chip-image",
          title: t("chat.inputImageHint"),
          label: t("chat.inputImage"),
          Icon: Image,
        }
      : null,
    audio
      ? {
          key: "audio",
          tone: "cap-chip-audio",
          title: t("chat.inputAudioHint"),
          label: t("chat.inputAudio"),
          Icon: Mic,
        }
      : null,
    tts
      ? {
          key: "tts",
          tone: "cap-chip-tts",
          title: t("chat.inputTtsHint"),
          label: t("chat.inputTts"),
          Icon: Volume2,
        }
      : null,
    video
      ? {
          key: "video",
          tone: "cap-chip-video",
          title: t("chat.inputVideoHint"),
          label: t("chat.inputVideo"),
          Icon: Video,
        }
      : null,
    tools
      ? {
          key: "tools",
          tone: "cap-chip-fn",
          title: t("chat.toolsHint"),
          label: t("chat.tools"),
          Icon: Puzzle,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (presentation === "icons") {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5">
        {items.map(({ key, tone, title, label, Icon }) => (
          <span
            key={key}
            title={title}
            aria-label={label}
            className={iconWrapClass(tone)}
          >
            <Icon size={11} strokeWidth={2.25} aria-hidden />
          </span>
        ))}
      </span>
    );
  }

  return (
    <>
      {items.map(({ key, tone, title, label }) => (
        <span key={key} title={title} className={pillClass(size, tone)}>
          {label}
        </span>
      ))}
    </>
  );
};
