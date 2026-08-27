import { describe, expect, it } from "vitest";
import {
  inferCapabilities,
  parseOllamaCapabilities,
} from "@/lib/llm/capabilities";

describe("inferCapabilities", () => {
  it.each([
    ["gemma3:4b", true, false],
    ["gemma3:1b", false, false],
    ["gemma4:e4b", true, true],
    ["gemma4:31b", true, true],
    ["llama4:scout", true, false],
    ["qwen3:32b", false, false],
  ])(
    "detects the input capabilities for %s",
    (name, vision, audio) => {
      expect(inferCapabilities(name)).toMatchObject({ vision, audio });
    },
  );
});

describe("parseOllamaCapabilities", () => {
  it("merges reported capabilities with safe name-based fallbacks", () => {
    expect(parseOllamaCapabilities(["vision"], "qwen3:32b")).toMatchObject({
      vision: true,
      tools: true,
      audio: false,
    });
  });

  it("falls back to inference when Ollama returns an invalid value", () => {
    expect(parseOllamaCapabilities(null, "gemma4:26b")).toEqual(
      inferCapabilities("gemma4:26b"),
    );
  });
});
