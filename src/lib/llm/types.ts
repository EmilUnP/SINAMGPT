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
    description: string;
    parameters: Record<string, unknown>;
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
};

export type BackendHealth = {
  backend: LlmBackend;
  ok: boolean;
  latencyMs: number;
  error?: string;
  baseUrl: string;
};
