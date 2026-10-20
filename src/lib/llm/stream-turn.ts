import { ToolCallAccumulator } from "./tool-stream";
import type { LlmCompletion, LlmToolCall, ToolCallDelta } from "./types";

/** One record of the app's normalised NDJSON model stream (see streamChat). */
type StreamRecord = {
  message?: {
    content?: string;
    reasoning_content?: string;
    tool_calls?: ToolCallDelta[];
  };
  done?: boolean;
  error?: string;
  eval_count?: number;
  prompt_eval_count?: number;
  eval_duration?: number;
};

export type ModelStreamHandlers = {
  /** Answer text as it arrives. */
  onContent?: (piece: string) => void;
  /** Hidden reasoning ("thinking") as it arrives, for models that think first. */
  onReasoning?: (piece: string) => void;
  /** Stop reading (and release the upstream request) when this aborts. */
  signal?: AbortSignal;
};

export type ModelStreamResult = LlmCompletion & {
  reasoning: string;
  evalCount?: number;
  promptEvalCount?: number;
  evalDurationNs?: number;
};

const parseArguments = (value: string): unknown => {
  if (!value) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

/**
 * Read a streamChat body to the end, forwarding text and reasoning as they
 * arrive and assembling any tool calls. Streaming the turn that may call a
 * tool is what lets an ordinary answer show its first words at once instead
 * of after the whole reply has been generated off-screen.
 */
export const readModelStream = async (
  body: ReadableStream<Uint8Array>,
  handlers: ModelStreamHandlers = {},
): Promise<ModelStreamResult> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new ToolCallAccumulator();
  let sawToolCall = false;
  let buffer = "";
  let content = "";
  let reasoning = "";
  let evalCount: number | undefined;
  let promptEvalCount: number | undefined;
  let evalDurationNs: number | undefined;
  let finished = false;
  const stop = () => void reader.cancel().catch(() => undefined);
  handlers.signal?.addEventListener("abort", stop, { once: true });

  const handle = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let record: StreamRecord;
    try {
      record = JSON.parse(trimmed) as StreamRecord;
    } catch {
      return;
    }
    if (record.error) throw new Error(record.error);
    const reasoningPiece = record.message?.reasoning_content ?? "";
    if (reasoningPiece) {
      reasoning += reasoningPiece;
      handlers.onReasoning?.(reasoningPiece);
    }
    const piece = record.message?.content ?? "";
    if (piece) {
      content += piece;
      handlers.onContent?.(piece);
    }
    if (record.message?.tool_calls?.length) {
      sawToolCall = true;
      calls.add(record.message.tool_calls);
    }
    if (record.done) {
      if (typeof record.eval_count === "number") evalCount = record.eval_count;
      if (typeof record.prompt_eval_count === "number") promptEvalCount = record.prompt_eval_count;
      if (typeof record.eval_duration === "number") evalDurationNs = record.eval_duration;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handle(line);
    }
    buffer += decoder.decode();
    handle(buffer);
    finished = true;
  } finally {
    handlers.signal?.removeEventListener("abort", stop);
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  const toolCalls: LlmToolCall[] = sawToolCall
    ? calls.result().map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: parseArguments(call.function.arguments),
      }))
    : [];
  return {
    content: content.trim() ? content : "",
    toolCalls,
    reasoning,
    evalCount,
    promptEvalCount,
    evalDurationNs,
  };
};
