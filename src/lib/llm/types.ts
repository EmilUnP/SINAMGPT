/** Stable provider id stored on each model (for example `ollama` or `gpu-2`). */
export type LlmBackend = string;

/** Adapter protocol. Provider ids are free-form; kinds are code-supported. */
export type ProviderKind = "ollama" | "vllm" | "openai";

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
   * recordings go here too (Ollama detects RIFF/WAVE in `images`).
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

/** @deprecated Use LlmModel — kept for older imports */
export type OllamaModel = LlmModel;

export type ChatOptions = {
  temperature?: number;
  numPredict?: number;
  topP?: number;
  /** Ollama thinking. Audio turns must send false or Gemma 4 may swallow the reply. */
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
