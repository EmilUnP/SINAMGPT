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
    /** Admin internet search is on (the composer may offer "Search the web"). */
    webSearch?: boolean;
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

/**
 * One live tool step, shown while the answer is still being produced. Kept off
 * `content` so the reply text is never a status string — the previous version
 * wrote "Searching…" into content and string-compared it away on the first
 * token, which broke if the model happened to open with that word.
 */
export type ToolActivity = {
  callId: string;
  toolName: string;
  /** Sub-step reported mid-handler, e.g. "reading" while pages are fetched. */
  stage?: string;
  /** Search query, or the host being fetched. Model-supplied; already bounded. */
  label?: string;
  status: "running" | "done" | "failed";
  sites?: string[];
};

export type UiMessage = Message & {
  isStreaming?: boolean;
  /** Live reasoning of a thinking model. Not saved; gone after a reload. */
  reasoning?: string;
  reasoningStartedAt?: number;
  /** Set when the answer (or a tool step) begins, i.e. thinking ended. */
  reasoningMs?: number;
  localImages?: ChatImagePayload[];
  localAudio?: PendingAudio;
  toolActivity?: ToolActivity[];
};

export type ShareMenuPosition = {
  top: number;
  right: number;
  fullWidth: boolean;
};

export type MutableElementRef<T> = RefObject<T | null>;
