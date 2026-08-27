import { afterEach, describe, expect, it, vi } from "vitest";
import {
  persistMicChoice,
  persistModelChoice,
  readStoredMic,
  readStoredModel,
} from "./chat-storage";
import { messageAudioItems, messageImageItems } from "./message-attachments";
import { parseSseChunk } from "@/lib/parse-sse-chunk";
import type { UiMessage } from "./chat-types";

describe("parseSseChunk", () => {
  it("parses named and multiline data events", () => {
    expect(
      parseSseChunk('event: token\ndata: {"content":\ndata: "hello"}'),
    ).toEqual({
      event: "token",
      data: { content: "hello" },
    });
  });

  it("defaults the event name and ignores empty chunks", () => {
    expect(parseSseChunk('data: {"done":true}')).toEqual({
      event: "message",
      data: { done: true },
    });
    expect(parseSseChunk("event: ping")).toBeNull();
  });
});

describe("chat storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };

  afterEach(() => {
    values.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists and reads model and microphone choices", () => {
    vi.stubGlobal("localStorage", storage);
    persistModelChoice("model-a");
    persistMicChoice("mic-a");
    expect(readStoredModel()).toBe("model-a");
    expect(readStoredMic()).toBe("mic-a");
    persistMicChoice("");
    expect(readStoredMic()).toBe("");
  });

  it("uses safe fallbacks when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readStoredModel()).toBe("");
    expect(readStoredMic()).toBe("");
  });
});

describe("message attachment helpers", () => {
  const message: UiMessage = {
    id: "message-1",
    conversation_id: "conversation-1",
    role: "user",
    content: "",
    created_at: "2026-01-01T00:00:00.000Z",
    attachments: [
      { type: "image", mime: "image/png", name: "photo.png", index: 0 },
      { type: "audio", mime: "audio/wav", name: "voice.wav", index: 1 },
    ],
  };

  it("maps persisted image and audio attachment URLs", () => {
    expect(messageImageItems(message)).toEqual([
      {
        src: "/api/attachments/message-1/0",
        name: "photo.png",
      },
    ]);
    expect(messageAudioItems(message)).toEqual([
      {
        src: "/api/attachments/message-1/1",
        name: "voice.wav",
      },
    ]);
  });

  it("prefers optimistic local attachments", () => {
    const optimistic: UiMessage = {
      ...message,
      localImages: [{ mime: "image/png", data: "abc", name: "local.png" }],
      localAudio: {
        mime: "audio/wav",
        data: "def",
        name: "local.wav",
        durationMs: 500,
        previewUrl: "data:audio/wav;base64,def",
      },
    };
    expect(messageImageItems(optimistic)[0]?.name).toBe("local.png");
    expect(messageAudioItems(optimistic)).toEqual([
      {
        src: "data:audio/wav;base64,def",
        name: "local.wav",
        durationMs: 500,
      },
    ]);
  });
});
