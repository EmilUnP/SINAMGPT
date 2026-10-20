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
  /**
   * Report a sub-step while the handler is still running. `web_search` reads
   * several pages inside one call, so without this the reading phase — the
   * slowest part — is invisible to the user. Best-effort decoration only.
   */
  onProgress?: (update: {
    stage: string;
    label?: string;
    sites?: string[];
  }) => void;
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
  /**
   * Optional summaries for the live activity strip. The loop stays
   * tool-agnostic: a tool decides what is safe to show, so raw payloads never
   * reach the browser. Both are bounded again by the loop before emitting.
   */
  activity?: {
    /** One short line describing the call, e.g. the search query. */
    label?: (input: TInput) => string;
    /** Hostnames the call touched, shown as chips. */
    sites?: (result: TResult) => string[];
  };
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
  /**
   * Streams the first model turn to the user while it is generated. Without
   * it, an ordinary answer with no tool call was produced off-screen and
   * shown all at once at the end. Same contract as `complete`; the caller
   * forwards text inside it.
   */
  streamFirstTurn?: ToolCompletion;
  /**
   * The streamed first turn turned out not to be the answer (it called a
   * tool, or the search recovery overrode it): the caller should clear the
   * text it already showed.
   */
  onDiscardStreamed?: () => void;
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
  ) => LlmToolCall[] | Promise<LlmToolCall[]>;
  /**
   * Checked after each tool round. True ends the loop so the caller streams
   * the answer now, instead of asking the model (non-streamed) whether it
   * wants more tools and then generating the answer a second time.
   */
  stopAfterTools?: (messages: ChatMessage[]) => boolean;
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
  /** `content` was already streamed to the user by `streamFirstTurn`. */
  streamed?: boolean;
};
