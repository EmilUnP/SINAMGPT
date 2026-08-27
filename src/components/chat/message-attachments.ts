import { imagePreviewUrl } from "@/lib/media/compress-image";
import { attachmentUrl } from "@/lib/media/limits";
import type { UiMessage } from "./chat-types";

export type MessageImageItem = {
  src: string;
  name: string;
};

export const messageImageItems = (message: UiMessage): MessageImageItem[] =>
  message.localImages?.map((image) => ({
    src: imagePreviewUrl(image),
    name: image.name,
  })) ??
  message.attachments
    ?.filter((item) => item.type === "image")
    .map((item) => ({
      src: attachmentUrl(message.id, item.index),
      name: item.name,
    })) ??
  [];

export const messageAudioItems = (
  message: UiMessage,
): Array<{ src: string; name: string; durationMs?: number }> => {
  if (message.localAudio) {
    return [
      {
        src: message.localAudio.previewUrl,
        name: message.localAudio.name,
        durationMs: message.localAudio.durationMs,
      },
    ];
  }

  return (
    message.attachments
      ?.filter((item) => item.type === "audio")
      .map((item) => ({
        src: attachmentUrl(message.id, item.index),
        name: item.name,
      })) ?? []
  );
};
