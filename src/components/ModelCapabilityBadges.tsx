"use client";

import { useTranslations } from "@/components/LocaleProvider";

export type ModelCapabilityFlags = {
  vision?: boolean;
  tools?: boolean;
  audio?: boolean;
  video?: boolean;
};

type Props = ModelCapabilityFlags & {
  /** Admin table shows Text; the chat picker skips it to save space. */
  showText?: boolean;
  size?: "sm" | "md";
};

const pillClass = (size: "sm" | "md", tone: string) =>
  size === "sm"
    ? `cap-chip shrink-0 cursor-help rounded-md px-1.5 py-0.5 text-[10px] ${tone}`
    : `cap-chip inline-flex cursor-help rounded-md px-2 py-0.5 text-[11px] ${tone}`;

export const ModelCapabilityBadges = ({
  vision,
  tools,
  audio,
  video,
  showText = false,
  size = "md",
}: Props) => {
  const t = useTranslations();
  const hasInputs = Boolean(vision || audio || video);
  if (!showText && !hasInputs && !tools) return null;

  return (
    <>
      {showText ? (
        <span
          title={t("chat.inputTextHint")}
          className={pillClass(size, "cap-chip-text")}
        >
          {t("chat.inputText")}
        </span>
      ) : null}
      {vision ? (
        <span
          title={t("chat.inputImageHint")}
          className={pillClass(size, "cap-chip-image")}
        >
          {t("chat.inputImage")}
        </span>
      ) : null}
      {audio ? (
        <span
          title={t("chat.inputAudioHint")}
          className={pillClass(size, "cap-chip-audio")}
        >
          {t("chat.inputAudio")}
        </span>
      ) : null}
      {video ? (
        <span
          title={t("chat.inputVideoHint")}
          className={pillClass(size, "cap-chip-video")}
        >
          {t("chat.inputVideo")}
        </span>
      ) : null}
      {tools ? (
        <span
          title={t("chat.toolsHint")}
          className={pillClass(size, "cap-chip-fn")}
        >
          {t("chat.tools")}
        </span>
      ) : null}
    </>
  );
};
