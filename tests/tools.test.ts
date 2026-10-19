import {
  boundActivityLabel,
  boundActivitySites,
  MAX_ACTIVITY_LABEL_CHARS,
  MAX_ACTIVITY_SITES,
} from "@/lib/tools/sse";
import { describe, expect, it, vi } from "vitest";
// Unit tests must not initialize or mutate the operator's application database.
vi.mock("@/lib/search/settings", async () => ({
  ...await vi.importActual<typeof import("@/lib/search/settings")>("@/lib/search/settings"),
  isWebSearchEnabled: () => false,
}));
import type { LlmCompletion } from "@/lib/llm";
import {
  registeredTools,
  runToolLoop,
  serializeTraceValue,
  shouldUseToolRuntime,
  ToolRegistry,
  type JsonValue,
  type ToolDefinition,
} from "@/lib/tools";

const inputSchema = {
  type: "object",
  properties: { value: { type: "string", maxLength: 100 } },
  required: ["value"],
  additionalProperties: false,
} as const;

const resultSchema = {
  type: "object",
  properties: { answer: { type: "string", maxLength: 100 } },
  required: ["answer"],
  additionalProperties: false,
} as const;

const makeTool = (
  handler: ToolDefinition["handler"] = async () => ({ answer: "ok" }),
): ToolDefinition => ({
  name: "echo",
  description: "Echo a safe value",
  inputSchema,
  resultSchema,
  handler,
});

const allow = async () => ({ blocked: false });

const toolCall = (name = "echo"): LlmCompletion => ({
  content: "",
  toolCalls: [{ id: "call-1", name, arguments: { value: "hello" } }],
});

describe("ToolRegistry", () => {
  it("ships empty and leaves the runtime disabled", () => {
    expect(registeredTools).toHaveLength(0);
    expect(shouldUseToolRuntime("any-model")).toBe(false);
  });

  it("rejects duplicate and unsafe names", () => {
    const registry = new ToolRegistry([makeTool()]);
    expect(() => registry.register(makeTool())).toThrow(/Duplicate/);
    expect(() =>
      registry.register({ ...makeTool(), name: "../unsafe" }),
    ).toThrow(/Unsafe/);
  });

  it("rejects permissive and oversized schemas", () => {
    expect(() =>
      new ToolRegistry([
        {
          ...makeTool(),
          inputSchema: { type: "object", properties: {} },
        },
      ]),
    ).toThrow(/additionalProperties/);

    expect(() =>
      new ToolRegistry([
        {
          ...makeTool(),
          inputSchema: {
            ...inputSchema,
            $comment: "x".repeat(20_000),
          },
        },
      ]),
    ).toThrow(/exceeds/);
  });
});

describe("runToolLoop", () => {
  it("blocks unsafe input without executing the handler", async () => {
    const handler = vi.fn(async () => ({ answer: "should not run" }));
    const complete = vi
      .fn()
      .mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce({ content: "safe final", toolCalls: [] });

    const result = await runToolLoop({
      messages: [{ role: "user", content: "test" }],
      registry: new ToolRegistry([makeTool(handler)]),
      complete,
      inspectPayload: async (_payload, direction) => ({
        blocked: direction === "input",
        reason: "blocked test input",
      }),
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.trace[0]?.status).toBe("blocked_input");
  });

  it("replaces blocked output", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce({ content: "safe final", toolCalls: [] });
    const result = await runToolLoop({
      messages: [],
      registry: new ToolRegistry([makeTool()]),
      complete,
      inspectPayload: async (_payload, direction) => ({
        blocked: direction === "output",
        reason: "blocked test output",
      }),
    });

    expect(result.trace[0]?.status).toBe("blocked_output");
    expect(result.messages.at(-1)?.content).toContain("blocked by guardrails");
  });

  it("handles unknown tools without throwing", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(toolCall("missing"))
      .mockResolvedValueOnce({ content: "recovered", toolCalls: [] });
    const result = await runToolLoop({
      messages: [],
      registry: new ToolRegistry(),
      complete,
      inspectPayload: allow,
    });

    expect(result.content).toBe("recovered");
    expect(result.trace[0]?.status).toBe("unknown_tool");
  });

  it("rejects invalid inputs and results", async () => {
    const handler = vi.fn(async () => ({ wrong: true }));
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        ...toolCall(),
        toolCalls: [
          { id: "bad-input", name: "echo", arguments: { extra: true } },
        ],
      })
      .mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce({ content: "done", toolCalls: [] });
    const result = await runToolLoop({
      messages: [],
      registry: new ToolRegistry([makeTool(handler)]),
      complete,
      inspectPayload: allow,
    });

    expect(result.trace.map((entry) => entry.status)).toEqual([
      "invalid_input",
      "invalid_output",
    ]);
  });

  it("propagates abort signals", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runToolLoop({
        messages: [],
        registry: new ToolRegistry([makeTool()]),
        inspectPayload: allow,
        signal: controller.signal,
        complete: async (_messages, { signal }) => {
          expect(signal.aborted).toBe(true);
          throw new DOMException("Aborted", "AbortError");
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not swallow an abort during a handler", async () => {
    const controller = new AbortController();
    const handler = vi.fn(
      async (_input: JsonValue, { signal }: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
          controller.abort();
        }),
    );

    await expect(
      runToolLoop({
        messages: [],
        registry: new ToolRegistry([makeTool(handler)]),
        inspectPayload: allow,
        signal: controller.signal,
        complete: async () => toolCall(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("enforces per-call handler timeouts", async () => {
    const handler = vi.fn(
      async () => new Promise<never>(() => undefined),
    );
    const complete = vi
      .fn()
      .mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce({ content: "after timeout", toolCalls: [] });
    const result = await runToolLoop({
      messages: [],
      registry: new ToolRegistry([makeTool(handler)]),
      complete,
      inspectPayload: allow,
      callTimeoutMs: 100,
    });

    expect(result.content).toBe("after timeout");
    expect(result.trace[0]?.status).toBe("handler_error");
  });

  it("keeps a long model timeout separate from the handler timeout", async () => {
    const complete = vi.fn().mockImplementation(
      async (_messages, { signal }: { signal: AbortSignal }) => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(signal.aborted).toBe(false);
        return { content: "slow complete", toolCalls: [] };
      },
    );
    const result = await runToolLoop({
      messages: [{ role: "user", content: "hi" }],
      registry: new ToolRegistry([makeTool()]),
      complete,
      inspectPayload: allow,
      callTimeoutMs: 20,
      completionTimeoutMs: 5_000,
    });
    expect(result.content).toBe("slow complete");
  });

  it("uses a final no-tools pass at the iteration cap", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce({ content: "final pass", toolCalls: [] });
    const result = await runToolLoop({
      messages: [],
      registry: new ToolRegistry([makeTool()]),
      complete,
      inspectPayload: allow,
      maxIterations: 2,
    });

    expect(result.reachedCap).toBe(true);
    expect(result.needsFinalStream).toBe(false);
    expect(result.content).toBe("final pass");
    expect(complete.mock.calls[2]?.[1].tools).toBeUndefined();
  });

  it("defers the final completion so the caller can stream", async () => {
    const events: string[] = [];
    const complete = vi
      .fn()
      .mockResolvedValueOnce(toolCall())
      // Second turn: the model has seen the tool result and is ready to answer.
      .mockResolvedValueOnce({ content: "draft answer", toolCalls: [] });
    const result = await runToolLoop({
      messages: [{ role: "user", content: "news" }],
      registry: new ToolRegistry([makeTool()]),
      complete,
      inspectPayload: allow,
      deferFinalStream: true,
      userId: "user-1",
      onEvent: (event) => events.push(event.event),
    });

    expect(result.needsFinalStream).toBe(true);
    // The draft is discarded so the caller can re-ask and stream the answer.
    expect(result.content).toBe("");
    expect(complete).toHaveBeenCalledTimes(2);
    expect(events).toEqual(["tool_start", "tool_end"]);
    expect(result.messages.some((message) => message.role === "tool")).toBe(true);
  });

  it("recovers tool calls when the model answers without calling tools", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ content: "I cannot search", toolCalls: [] })
      .mockResolvedValueOnce({ content: "now I can answer", toolCalls: [] });
    const handler = vi.fn(async () => ({ answer: "from tool" }));
    const result = await runToolLoop({
      messages: [{ role: "user", content: "weather" }],
      registry: new ToolRegistry([makeTool(handler)]),
      complete,
      inspectPayload: allow,
      deferFinalStream: true,
      recoverToolCalls: (_messages, content) =>
        content.includes("cannot")
          ? [{ id: "forced", name: "echo", arguments: { value: "hello" } }]
          : [],
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalled();
    expect(result.needsFinalStream).toBe(true);
    expect(result.trace[0]?.status).toBe("completed");
  });

  it("asks the model first; recover only runs after a no-tool reply", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ content: "plain answer", toolCalls: [] })
      .mockResolvedValueOnce({ content: "", toolCalls: [] });
    const handler = vi.fn(async () => ({ answer: "from tool" }));
    const result = await runToolLoop({
      messages: [{ role: "user", content: "weather" }],
      registry: new ToolRegistry([makeTool(handler)]),
      complete,
      inspectPayload: allow,
      deferFinalStream: true,
      recoverToolCalls: (_messages, content) =>
        content
          ? [{ id: "forced", name: "echo", arguments: { value: "hello" } }]
          : [],
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalled();
    expect(result.needsFinalStream).toBe(true);
  });

  it("can preempt tools before the first model call", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ content: "answering now", toolCalls: [] });
    const handler = vi.fn(async () => ({ answer: "from tool" }));
    const result = await runToolLoop({
      messages: [{ role: "user", content: "weather" }],
      registry: new ToolRegistry([makeTool(handler)]),
      complete,
      inspectPayload: allow,
      deferFinalStream: true,
      recoverToolCalls: (_messages, content) =>
        content
          ? []
          : [{ id: "forced", name: "echo", arguments: { value: "hello" } }],
    });
    // Preempt skips the FIRST model call; the model is still consulted after
    // the tool runs, which is what lets it search again or answer.
    expect(complete).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalled();
    expect(result.needsFinalStream).toBe(true);
  });

  it("reports the trace after each tool finishes", async () => {
    const traces: number[] = [];
    const complete = vi
      .fn()
      .mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce({ content: "done", toolCalls: [] });
    await runToolLoop({
      messages: [],
      registry: new ToolRegistry([makeTool()]),
      complete,
      inspectPayload: allow,
      onTrace: (trace) => traces.push(trace.length),
    });
    expect(traces).toEqual([1]);
  });
});

describe("tool trace redaction", () => {
  it("redacts sensitive keys and secret-looking values", () => {
    const trace = serializeTraceValue({
      password: "dont-log-me",
      nested: { token: "also-secret" },
      text: "sk-abcdefghijklmnopqrstuvwxyz",
    });
    expect(trace).not.toContain("dont-log-me");
    expect(trace).not.toContain("also-secret");
    expect(trace).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(trace).toContain("[REDACTED]");
  });
});

describe("activity strip payloads", () => {
  it("bounds a model-supplied label", () => {
    expect(boundActivityLabel("  weather   baku  ")).toBe("weather baku");
    expect(boundActivityLabel("   ")).toBeUndefined();
    expect(boundActivityLabel("")).toBeUndefined();
    const long = boundActivityLabel("x".repeat(500));
    expect(long).toHaveLength(MAX_ACTIVITY_LABEL_CHARS);
    expect(long?.endsWith("…")).toBe(true);
    // Newlines would break the SSE framing if they ever reached the wire.
    expect(boundActivityLabel("a\nb\r\nc")).toBe("a b c");
  });

  it("dedupes and caps the site chips", () => {
    expect(boundActivitySites(["a.com", "a.com", "b.com"])).toEqual([
      "a.com",
      "b.com",
    ]);
    expect(boundActivitySites([])).toBeUndefined();
    expect(boundActivitySites(["", "  "])).toBeUndefined();
    expect(
      boundActivitySites(Array.from({ length: 40 }, (_, i) => `host${i}.com`)),
    ).toHaveLength(MAX_ACTIVITY_SITES);
  });
});

describe("live activity events", () => {
  const runWith = async (tool: ToolDefinition) => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    await runToolLoop({
      messages: [{ role: "user", content: "test" }],
      registry: new ToolRegistry([tool]),
      complete: vi
        .fn()
        .mockResolvedValueOnce(toolCall())
        .mockResolvedValueOnce({ content: "done", toolCalls: [] }),
      inspectPayload: allow,
      onEvent: (event) =>
        events.push({ event: event.event, data: event.data as never }),
    });
    return events;
  };

  it("carries the label on start and the sites on end", async () => {
    const events = await runWith({
      ...makeTool(),
      activity: {
        label: (input) => (input as { value: string }).value,
        sites: () => ["a.example", "b.example"],
      },
    });
    const start = events.find((e) => e.event === "tool_start");
    const end = events.find((e) => e.event === "tool_end");
    expect(start?.data.label).toBe("hello");
    expect(end?.data.sites).toEqual(["a.example", "b.example"]);
  });

  it("emits a sub-step when the handler reports progress mid-call", async () => {
    // web_search reads pages inside one call; without this the slow half of a
    // search is invisible.
    const events = await runWith({
      ...makeTool(async (_input, context) => {
        context.onProgress?.({ stage: "reading", sites: ["x.example"] });
        return { answer: "ok" };
      }),
    });
    const progress = events.find((e) => e.event === "tool_progress");
    expect(progress?.data).toMatchObject({
      callId: "call-1:reading",
      toolName: "echo",
      stage: "reading",
      sites: ["x.example"],
    });
    // Order matters: the sub-step must arrive before the call settles.
    expect(events.map((e) => e.event)).toEqual([
      "tool_start",
      "tool_progress",
      "tool_end",
    ]);
  });

  it("never fails a call because its activity hook threw", async () => {
    const events = await runWith({
      ...makeTool(),
      activity: {
        label: () => {
          throw new Error("boom");
        },
        sites: () => {
          throw new Error("boom");
        },
      },
    });
    const end = events.find((e) => e.event === "tool_end");
    expect(end?.data.status).toBe("completed");
    expect(end?.data.sites).toBeUndefined();
  });
});

describe("multi-round agent behaviour", () => {
  it("lets the model search again after seeing weak results", async () => {
    // This is the loop the app was missing: the first search returns nothing
    // useful, the model reads that, reformulates, searches again, and only
    // then answers. Previously deferFinalStream returned after round one, so
    // a bad first query was final.
    const queries: string[] = [];
    const handler = vi.fn(async (input: unknown) => {
      const value = (input as { value: string }).value;
      queries.push(value);
      return { answer: value === "second" ? "found it" : "nothing useful" };
    });

    const call = (value: string): LlmCompletion => ({
      content: "",
      toolCalls: [{ id: `c-${value}`, name: "echo", arguments: { value } }],
    });

    const complete = vi
      .fn()
      .mockResolvedValueOnce(call("first"))
      .mockResolvedValueOnce(call("second"))
      .mockResolvedValueOnce({ content: "draft", toolCalls: [] });

    const result = await runToolLoop({
      messages: [{ role: "user", content: "who is X" }],
      registry: new ToolRegistry([makeTool(handler)]),
      complete,
      inspectPayload: allow,
      deferFinalStream: true,
    });

    expect(queries).toEqual(["first", "second"]);
    expect(complete).toHaveBeenCalledTimes(3);
    expect(result.trace).toHaveLength(2);
    expect(result.needsFinalStream).toBe(true);
    // Every tool result stays in the transcript the final answer is built from.
    expect(
      result.messages.filter((message) => message.role === "tool"),
    ).toHaveLength(2);
  });

  it("still stops at maxIterations so a looping model cannot run forever", async () => {
    const complete = vi.fn(async () => ({
      content: "",
      toolCalls: [{ id: "c", name: "echo", arguments: { value: "again" } }],
    }));
    const result = await runToolLoop({
      messages: [{ role: "user", content: "loop" }],
      registry: new ToolRegistry([makeTool()]),
      complete,
      inspectPayload: allow,
      deferFinalStream: true,
      maxIterations: 3,
    });
    expect(complete).toHaveBeenCalledTimes(3);
    expect(result.reachedCap).toBe(true);
    expect(result.needsFinalStream).toBe(true);
  });
});
