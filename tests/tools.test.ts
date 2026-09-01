import { describe, expect, it, vi } from "vitest";
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
    expect(result.content).toBe("final pass");
    expect(complete.mock.calls[2]?.[1].tools).toBeUndefined();
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
