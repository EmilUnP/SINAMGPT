export type LlmBackend = "ollama" | "vllm";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  /** Raw base64 (no data-URL prefix). Ollama vision / vLLM image_url. */
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
};

export type BackendHealth = {
  backend: LlmBackend;
  ok: boolean;
  latencyMs: number;
  error?: string;
  baseUrl: string;
};
