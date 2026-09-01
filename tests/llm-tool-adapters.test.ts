import { afterEach, describe, expect, it, vi } from "vitest";
import { completeOllamaToolChat } from "@/lib/llm/ollama";
import { completeVllmToolChat } from "@/lib/llm/vllm";
import type { LlmProviderConfig, LlmToolDefinition } from "@/lib/llm/types";

const ollama: LlmProviderConfig = {
  id: "ollama",
  kind: "ollama",
  baseUrl: "http://ollama.test",
  enabled: true,
};

const vllm: LlmProviderConfig = {
  id: "gpu",
  kind: "vllm",
  baseUrl: "http://vllm.test",
  apiKey: "test-key",
  enabled: true,
};

const tools: LlmToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "echo",
      description: "Echo",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tool-capable adapters", () => {
  it("omits tool fields from Ollama requests when none are provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ message: { content: "plain" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await completeOllamaToolChat(
      ollama,
      "model",
      [{ role: "user", content: "hello" }],
      { timeoutMs: 1_000 },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty("tools");
    expect(body.messages[0]).not.toHaveProperty("tool_calls");
  });

  it("serializes tools and parses Ollama tool calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          message: {
            content: "",
            tool_calls: [
              { id: "one", function: { name: "echo", arguments: {} } },
            ],
          },
        }),
      ),
    );

    const result = await completeOllamaToolChat(
      ollama,
      "model",
      [{ role: "user", content: "hello" }],
      { tools, timeoutMs: 1_000 },
    );
    expect(result.toolCalls).toEqual([
      { id: "one", name: "echo", arguments: {} },
    ]);
  });

  it("omits tools and parses OpenAI-compatible tool calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "two",
                  function: { name: "echo", arguments: '{"value":"ok"}' },
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeVllmToolChat(
      vllm,
      "model",
      [{ role: "user", content: "hello" }],
      { timeoutMs: 1_000 },
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty("tools");
    expect(result.toolCalls[0]).toEqual({
      id: "two",
      name: "echo",
      arguments: { value: "ok" },
    });
  });
});
