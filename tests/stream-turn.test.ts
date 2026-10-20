import { describe, expect, it, vi } from "vitest";
import { readModelStream } from "@/lib/llm/stream-turn";

/** A streamChat-style NDJSON body, split at awkward places like the network does. */
const ndjson = (records: unknown[], chunkSize = 7): ReadableStream<Uint8Array> => {
  const text = records.map((record) => `${JSON.stringify(record)}\n`).join("");
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
};

describe("readModelStream", () => {
  it("forwards thinking and answer text as they arrive", async () => {
    const onContent = vi.fn();
    const onReasoning = vi.fn();
    const result = await readModelStream(
      ndjson([
        { message: { content: "", reasoning_content: "The user asks about " } },
        { message: { content: "", reasoning_content: "Baku." } },
        { message: { content: "Bakı " } },
        { message: { content: "21°C." } },
        { message: { content: "" }, done: true, eval_count: 12, prompt_eval_count: 340 },
      ]),
      { onContent, onReasoning },
    );
    expect(onReasoning.mock.calls.map(([piece]) => piece)).toEqual(["The user asks about ", "Baku."]);
    expect(onContent.mock.calls.map(([piece]) => piece)).toEqual(["Bakı ", "21°C."]);
    expect(result).toMatchObject({
      content: "Bakı 21°C.",
      reasoning: "The user asks about Baku.",
      toolCalls: [],
      evalCount: 12,
      promptEvalCount: 340,
    });
  });

  it("assembles streamed tool calls", async () => {
    const result = await readModelStream(
      ndjson([
        { message: { content: "", tool_calls: [{ index: 0, id: "call-1", function: { name: "web_search", arguments: '{"que' } }] } },
        { message: { content: "", tool_calls: [{ index: 0, function: { arguments: 'ry":"Baku weather"}' } }] } },
        { message: { content: "" }, done: true },
      ]),
    );
    expect(result.toolCalls).toEqual([
      { id: "call-1", name: "web_search", arguments: { query: "Baku weather" } },
    ]);
    expect(result.content).toBe("");
  });

  it("throws the error a stream ends with", async () => {
    await expect(
      readModelStream(ndjson([{ message: { content: "Hi" } }, { error: "context too long", done: true }])),
    ).rejects.toThrow("context too long");
  });

  it("stops reading when the request is aborted", async () => {
    const abort = new AbortController();
    let pulls = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ message: { content: "x" } })}\n`));
        if (pulls === 3) abort.abort();
      },
    });
    const result = await readModelStream(endless, { signal: abort.signal });
    expect(result.content.length).toBeLessThan(10);
  });
});
