export type LlmBackend = "ollama" | "vllm";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type LlmModel = {
  name: string;
  size: number;
  modified_at: string;
  backend: LlmBackend;
};

/** @deprecated Use LlmModel — kept for older imports */
export type OllamaModel = LlmModel;

export type ChatOptions = {
  temperature?: number;
  numPredict?: number;
  topP?: number;
};

export type BackendHealth = {
  backend: LlmBackend;
  ok: boolean;
  latencyMs: number;
  error?: string;
  baseUrl: string;
};
