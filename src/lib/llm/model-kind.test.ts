import { describe, expect, it } from "vitest";
import { inferModelKind, isModelKind } from "@/lib/llm/model-kind";

describe("inferModelKind", () => {
  it.each([
    ["gemma3:4b", "chat"],
    ["gpu-2:llama4:scout", "chat"],
    ["whisper:large-v3", "stt"],
    ["piper:en", "tts"],
    ["kokoro-82m", "tts"],
    ["nomic-embed-text", "embedding"],
    ["bge-reranker-v2-m3", "rerank"],
    ["flux:schnell", "image"],
    ["cogvideo:5b", "video"],
  ] as const)("classifies %s as %s", (name, expected) => {
    expect(inferModelKind(name)).toBe(expected);
  });

  it("validates only supported task kinds", () => {
    expect(isModelKind("embedding")).toBe(true);
    expect(isModelKind("completion")).toBe(false);
  });
});
