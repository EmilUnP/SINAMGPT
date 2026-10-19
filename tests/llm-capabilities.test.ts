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
  it("treats a reported capability list as authoritative for tools", () => {
    // Ollama answered, and did not list tools. A name heuristic must not add
    // it back — that would send tool definitions to a model that cannot emit
    // tool_calls. Verified: `/api/show` on gemma3:4b → ["completion","vision"].
    expect(parseOllamaCapabilities(["vision"], "qwen3:32b")).toMatchObject({
      vision: true,
      tools: false,
      audio: false,
    });
    expect(parseOllamaCapabilities(["completion", "vision"], "gemma3:4b").tools).toBe(
      false,
    );
    expect(
      parseOllamaCapabilities(
        ["completion", "vision", "audio", "tools", "thinking"],
        "gemma4:e4b",
      ).tools,
    ).toBe(true);
  });

  it("still infers tools by name when the provider reports nothing", () => {
    // OpenAI-compatible servers list no capabilities, so the heuristic is the
    // only signal there and must keep working.
    expect(parseOllamaCapabilities(undefined, "qwen3:32b").tools).toBe(true);
    expect(inferCapabilities("gemma4:e4b").tools).toBe(true);
    expect(inferCapabilities("gemma3:4b").tools).toBe(false);
  });

  it("falls back to inference when Ollama returns an invalid value", () => {
    expect(parseOllamaCapabilities(null, "gemma4:26b")).toEqual(
      inferCapabilities("gemma4:26b"),
    );
  });
});
