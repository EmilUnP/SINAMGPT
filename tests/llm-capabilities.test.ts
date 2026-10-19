import { describe, expect, it } from "vitest";
import {
  inferCapabilities,
} from "@/lib/llm/capabilities";

describe("inferCapabilities", () => {
  it.each([
    ["gemma3:4b", true, false],
    ["vllm:google/gemma-3-4b-it", true, false],
    ["google/gemma-3-1b-it", false, false],
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
