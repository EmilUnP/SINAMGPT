import type { AnySchema } from "ajv";
import type {
  ChatMessage,
  LlmCompletion,
  LlmToolCall,
  LlmToolDefinition,
} from "@/lib/llm";
import type { ToolTraceEntry } from "@/lib/types";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ToolContext = {
  signal: AbortSignal;
  /** Signed-in user id; used by quota-gated tools such as web_search. */
  userId?: string;
};

export type ToolDefinition<
  TInput extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
> = {
  name: string;
  description: string;
  inputSchema: AnySchema;
  resultSchema: AnySchema;
  handler: (input: TInput, context: ToolContext) => Promise<TResult>;
};

export type ToolPayloadGuard = (
  serializedPayload: string,
  direction: "input" | "output",
  toolName: string,
) => Promise<{ blocked: boolean; reason?: string }>;

export type ToolCompletion = (
  messages: ChatMessage[],
  options: {
    tools?: LlmToolDefinition[];
    signal: AbortSignal;
    timeoutMs: number;
  },
) => Promise<LlmCompletion>;

export type ToolLoopOptions = {
  messages: ChatMessage[];
  registry: import("./registry").ToolRegistry;
  complete: ToolCompletion;
  inspectPayload: ToolPayloadGuard;
  signal?: AbortSignal;
  maxIterations?: number;
  /** Timeout for web_search / web_fetch handlers, not the model. */
  callTimeoutMs?: number;
  /** Timeout for each non-streaming model completion in the loop. */
  completionTimeoutMs?: number;
  userId?: string;
  onEvent?: (event: import("./sse").ToolSseEvent) => void;
  onTrace?: (trace: ToolTraceEntry[]) => void;
  /**
   * Optional recovery of tool calls. Called with empty content before the first
   * model turn (preempt) and again after a completion with no tool_calls.
   */
  recoverToolCalls?: (
    messages: ChatMessage[],
    content: string,
  ) => LlmToolCall[];
  /**
   * After tools run, skip the non-streaming final completion so the caller
   * can streamChat the answer.
   */
  deferFinalStream?: boolean;
};

export type ToolLoopResult = {
  content: string;
  messages: ChatMessage[];
  trace: ToolTraceEntry[];
  reachedCap: boolean;
  needsFinalStream: boolean;
};
