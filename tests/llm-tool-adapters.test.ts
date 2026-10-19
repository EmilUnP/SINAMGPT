import { afterEach, describe, expect, it, vi } from "vitest";
import { completeVllmToolChat, listVllmModels, streamVllmChat } from "@/lib/llm/vllm";
import type { LlmProviderConfig, LlmToolDefinition } from "@/lib/llm/types";

const provider: LlmProviderConfig = { id: "vllm", kind: "vllm", baseUrl: "http://gpu.test/v1/", apiKey: "private-key", enabled: true, toolsEnabled: true };
const tools: LlmToolDefinition[] = [{ type: "function", function: { name: "lookup", description: "Look up a value", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }];
const completion = () => Response.json({ choices: [{ message: { content: "ok" } }] });
afterEach(() => { vi.unstubAllGlobals(); });

describe("vLLM requests", () => {
  it("uses one /v1 prefix, authentication, and OpenAI sampling fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion());
    vi.stubGlobal("fetch", fetchMock);
    await completeVllmToolChat(provider, "Qwen/Qwen3-8B", [{ role: "user", content: "hello" }], { temperature: 0.2, topP: 0.9, numPredict: 100, think: false });
    expect(fetchMock.mock.calls[0][0]).toBe("http://gpu.test/v1/chat/completions");
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe("Bearer private-key");
    expect(JSON.parse(init.body)).toMatchObject({ model: "Qwen/Qwen3-8B", stream: false, max_tokens: 100, temperature: 0.2, top_p: 0.9, chat_template_kwargs: { enable_thinking: false } });
    expect(JSON.parse(init.body)).not.toHaveProperty("tools");
  });

  it("preserves tool call ids, JSON arguments and tool results across turns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: null, tool_calls: [{ id: "call-1", function: { name: "lookup", arguments: '{"query":"next"}' } }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await completeVllmToolChat(provider, "Qwen/Qwen3-8B", [
      { role: "assistant", content: "", toolCalls: [{ id: "prior", name: "lookup", arguments: { query: "first" } }] },
      { role: "tool", content: '{"value":"found"}', toolCallId: "prior", toolName: "lookup" },
    ], { tools });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tool_choice).toBe("auto");
    expect(body.tools).toEqual(tools);
    expect(body.messages[0].tool_calls[0]).toEqual({ id: "prior", type: "function", function: { name: "lookup", arguments: '{"query":"first"}' } });
    expect(body.messages[1].tool_call_id).toBe("prior");
    expect(result.toolCalls).toEqual([{ id: "call-1", name: "lookup", arguments: { query: "next" } }]);
  });

  it("does not advertise or invoke tools without a configured parser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [{ id: "Qwen/Qwen3-8B" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const unconfigured = { ...provider, toolsEnabled: false };
    expect((await listVllmModels(unconfigured))[0].tools).toBe(false);
    await expect(completeVllmToolChat(unconfigured, "model", [], { tools })).rejects.toThrow("Tool calling is not configured");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends WAV as input_audio and preserves PNG image MIME", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion());
    vi.stubGlobal("fetch", fetchMock);
    const wav = Buffer.from("RIFF0000WAVEfake").toString("base64");
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64");
    await completeVllmToolChat(provider, "multimodal", [{ role: "user", content: "Describe", images: [wav, png] }]);
    const parts = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(parts[1]).toEqual({ type: "input_audio", input_audio: { data: wav, format: "wav" } });
    expect(parts[2].image_url.url).toBe(`data:image/png;base64,${png}`);
  });
});

const streamResponse = (source: string, width = 7) => {
  const bytes = new TextEncoder().encode(source);
  let position = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (position >= bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.slice(position, position + width)); position += width;
  } }));
};

describe("vLLM streaming", () => {
  it("handles split UTF-8/CRLF events and collects usage after finish_reason exactly once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse(
      ': keepalive\r\n\r\ndata: {"choices":[{"delta":{"content":"Salam, dünya"}}]}\r\n\r\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
      'data: {"choices":[],"usage":{"completion_tokens":4,"prompt_tokens":12}}\n\n' +
      'data: [DONE]'
    ));
    vi.stubGlobal("fetch", fetchMock);
    const response = await streamVllmChat(provider, "model", []);
    const chunks = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(chunks[0].message.content).toBe("Salam, dünya");
    expect(chunks.filter((chunk) => chunk.done)).toEqual([{ message: { role: "assistant", content: "" }, done: true, finish_reason: "stop", eval_count: 4, prompt_eval_count: 12 }]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream_options).toEqual({ include_usage: true });
  });

  it.each([
    ['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', 'before completion'],
    ['data: {"error":{"message":"GPU unavailable"}}\n\n', 'GPU unavailable'],
    ['data: broken-json\n\n', 'JSON'],
  ])("reports incomplete or failed streams instead of success", async (source, error) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse(source)));
    const response = await streamVllmChat(provider, "model", []);
    const chunks = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(chunks.at(-1).error).toContain(error);
    expect(chunks.filter((chunk) => chunk.done)).toHaveLength(1);
  });

  it("cancels the upstream HTTP request when the consumer stops", async () => {
    let upstreamSignal: AbortSignal | undefined;
    const cancelled = vi.fn();
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      upstreamSignal = init.signal;
      return Promise.resolve(new Response(new ReadableStream({ cancel: cancelled })));
    }));
    const response = await streamVllmChat(provider, "model", []);
    await response.body!.cancel();
    expect(upstreamSignal!.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalledOnce();
  });
});
