/** Stable provider id stored on each model (for example `vllm` or `gpu-2`). */
export type LlmBackend = string;

/** Adapter protocol. Provider ids are free-form; kinds are code-supported. */
export type ProviderKind = "vllm" | "openai";

export const isOpenAiCompatKind = (kind: ProviderKind): boolean =>
  kind === "vllm" || kind === "openai";

export type ModelKind =
  | "chat"
  | "image"
  | "video"
  | "stt"
  | "tts"
  | "embedding"
  | "rerank";

export type LlmProviderConfig = {
  id: LlmBackend;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  apiKey?: string;
  fallbackId?: string | null;
  /** 0 = unlimited. In-process only. */
  maxConcurrent?: number;
  /** vLLM must be started with a tool parser before tools can be sent. */
  toolsEnabled?: boolean;
};

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type LlmToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean | null;
  };
};

export type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  /**
   * Raw base64 (no data-URL prefix). Vision still uses this array; WAV
   * recordings go here too and are serialized as OpenAI input_audio parts.
   */
  images?: string[];
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
  toolName?: string;
  reasoningContent?: string;
};

export type LlmCompletion = {
  content: string;
  toolCalls: LlmToolCall[];
};

export type LlmModel = {
  name: string;
  size: number;
  modified_at: string;
  backend: LlmBackend;
  kind: ModelKind;
  vision?: boolean;
  tools?: boolean;
  audio?: boolean;
  tts?: boolean;
  video?: boolean;
};

export type ChatOptions = {
  temperature?: number;
  numPredict?: number;
  topP?: number;
  /** Passed as enable_thinking to vLLM chat templates that support it. */
  think?: boolean;
  /** Abort the upstream LLM request (client disconnect / Stop). */
  signal?: AbortSignal;
  /** Omitted from provider requests when empty or undefined. */
  tools?: LlmToolDefinition[];
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  parallelToolCalls?: boolean;
  stop?: string | string[];
  seed?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  responseFormat?: Record<string, unknown>;
};

/** Wire-format fragments: arguments must remain strings until the call is complete. */
export type ToolCallDelta = {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
};

export type LlmStreamChunk = {
  message?: { content?: string; reasoning_content?: string; tool_calls?: ToolCallDelta[] };
  done?: boolean;
  finish_reason?: string;
  error?: string;
  eval_count?: number;
  prompt_eval_count?: number;
  eval_duration?: number;
};

export type BackendHealth = {
  backend: LlmBackend;
  ok: boolean;
  latencyMs: number;
  error?: string;
  baseUrl: string;
};
