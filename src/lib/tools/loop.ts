import type { ChatMessage, LlmToolCall } from "@/lib/llm";
import type { ToolTraceEntry } from "@/lib/types";
import type { ToolLoopOptions, ToolLoopResult } from "./types";
import { boundToolTrace, serializeTraceValue } from "./trace";
import { MAX_TOOL_PAYLOAD_BYTES } from "./validation";

export const DEFAULT_MAX_TOOL_ITERATIONS = 8;
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 15_000;
const BLOCKED_OUTPUT = { error: "Tool output blocked by guardrails" };

const combinedSignal = (
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

const withAbort = async <T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  if (signal.aborted) {
    void operation.catch(() => undefined);
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () =>
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", handleAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Tool execution failed";

const serializeForInspection = (value: unknown): string => {
  try {
    return JSON.stringify(value).slice(0, MAX_TOOL_PAYLOAD_BYTES);
  } catch {
    return '"[UNSERIALIZABLE]"';
  }
};

const toolResultMessage = (
  call: LlmToolCall,
  result: unknown,
): ChatMessage => ({
  role: "tool",
  content: JSON.stringify(result),
  toolCallId: call.id,
  toolName: call.name,
});

export const runToolLoop = async (
  options: ToolLoopOptions,
): Promise<ToolLoopResult> => {
  const maxIterations = Math.max(
    1,
    Math.min(32, Math.floor(options.maxIterations ?? DEFAULT_MAX_TOOL_ITERATIONS)),
  );
  const timeoutMs = Math.max(
    100,
    Math.min(120_000, Math.floor(options.callTimeoutMs ?? DEFAULT_TOOL_CALL_TIMEOUT_MS)),
  );
  const tools = options.registry.toLlmTools();
  const messages = [...options.messages];
  const trace: ToolTraceEntry[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const completionSignal = combinedSignal(options.signal, timeoutMs);
    const completion = await withAbort(options.complete(messages, {
      tools,
      signal: completionSignal,
    }), completionSignal);
    if (!completion.toolCalls.length) {
      return {
        content: completion.content,
        messages,
        trace: boundToolTrace(trace),
        reachedCap: false,
      };
    }

    messages.push({
      role: "assistant",
      content: completion.content,
      toolCalls: completion.toolCalls,
    });

    for (const call of completion.toolCalls) {
      const started = Date.now();
      const serializedInput = serializeTraceValue(call.arguments);
      const inputGuard = await options.inspectPayload(
        serializeForInspection(call.arguments),
        "input",
        call.name,
      );
      if (inputGuard.blocked) {
        const result = { error: "Tool input blocked by guardrails" };
        trace.push({
          callId: call.id,
          toolName: call.name,
          status: "blocked_input",
          input: serializedInput,
          error: inputGuard.reason,
          durationMs: Date.now() - started,
        });
        messages.push(toolResultMessage(call, result));
        continue;
      }

      const registered = options.registry.get(call.name);
      if (!registered) {
        const result = { error: `Unknown tool "${call.name}"` };
        trace.push({
          callId: call.id,
          toolName: call.name,
          status: "unknown_tool",
          input: serializedInput,
          error: result.error,
          durationMs: Date.now() - started,
        });
        messages.push(toolResultMessage(call, result));
        continue;
      }

      let input;
      try {
        input = registered.input.validate(call.arguments);
      } catch (error) {
        const message = errorMessage(error);
        trace.push({
          callId: call.id,
          toolName: call.name,
          status: "invalid_input",
          input: serializedInput,
          error: message,
          durationMs: Date.now() - started,
        });
        messages.push(toolResultMessage(call, { error: message }));
        continue;
      }

      let output;
      try {
        const handlerSignal = combinedSignal(options.signal, timeoutMs);
        output = await withAbort(
          registered.definition.handler(input, { signal: handlerSignal }),
          handlerSignal,
        );
      } catch (error) {
        if (options.signal?.aborted) throw error;
        const message = errorMessage(error);
        trace.push({
          callId: call.id,
          toolName: call.name,
          status: "handler_error",
          input: serializedInput,
          error: message,
          durationMs: Date.now() - started,
        });
        messages.push(toolResultMessage(call, { error: message }));
        continue;
      }

      const serializedOutput = serializeTraceValue(output);
      const outputGuard = await options.inspectPayload(
        serializeForInspection(output),
        "output",
        call.name,
      );
      if (outputGuard.blocked) {
        trace.push({
          callId: call.id,
          toolName: call.name,
          status: "blocked_output",
          input: serializedInput,
          output: "[REDACTED]",
          error: outputGuard.reason,
          durationMs: Date.now() - started,
        });
        messages.push(toolResultMessage(call, BLOCKED_OUTPUT));
        continue;
      }

      try {
        registered.result.validate(output);
      } catch (error) {
        const message = errorMessage(error);
        trace.push({
          callId: call.id,
          toolName: call.name,
          status: "invalid_output",
          input: serializedInput,
          output: serializedOutput,
          error: message,
          durationMs: Date.now() - started,
        });
        messages.push(toolResultMessage(call, { error: message }));
        continue;
      }

      trace.push({
        callId: call.id,
        toolName: call.name,
        status: "completed",
        input: serializedInput,
        output: serializedOutput,
        durationMs: Date.now() - started,
      });
      messages.push(toolResultMessage(call, output));
    }
  }

  const finalSignal = combinedSignal(options.signal, timeoutMs);
  const final = await withAbort(
    options.complete(messages, { signal: finalSignal }),
    finalSignal,
  );
  return {
    content: final.content,
    messages,
    trace: boundToolTrace(trace),
    reachedCap: true,
  };
};
