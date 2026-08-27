import type { RefObject } from "react";
import type { ChatImagePayload } from "@/lib/media/compress-image";
import { AUDIO_MIME } from "@/lib/media/limits";
import type { Message } from "@/lib/types";

export type ChatAppProps = {
  user: import("@/lib/types").User;
  features?: {
    developerApi: boolean;
    devLab: boolean;
    fileUpload: boolean;
    fileImport: boolean;
    microphone: boolean;
  };
};

export type PendingImage = ChatImagePayload & { id: string };

export type PendingAudio = {
  mime: typeof AUDIO_MIME;
  data: string;
  name: string;
  durationMs: number;
  previewUrl: string;
};

export type UiMessage = Message & {
  isStreaming?: boolean;
  localImages?: ChatImagePayload[];
  localAudio?: PendingAudio;
};

export type ShareMenuPosition = {
  top: number;
  right: number;
  fullWidth: boolean;
};

export type MutableElementRef<T> = RefObject<T | null>;
