export type LlmBackend = "ollama" | "vllm";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  /**
   * Raw base64 (no data-URL prefix). Vision still uses this array; WAV
   * recordings go here too (Ollama detects RIFF/WAVE in `images`).
   */
  images?: string[];
};

export type LlmModel = {
  name: string;
  size: number;
  modified_at: string;
  backend: LlmBackend;
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
};

export type BackendHealth = {
  backend: LlmBackend;
  ok: boolean;
  latencyMs: number;
  error?: string;
  baseUrl: string;
};
