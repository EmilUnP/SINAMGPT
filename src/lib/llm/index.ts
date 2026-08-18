import {
  completeOllamaChat,
  listOllamaModels,
  pingOllama,
  streamOllamaChat,
} from "./ollama";
import type {
  BackendHealth,
  ChatMessage,
  ChatOptions,
  LlmBackend,
  LlmModel,
} from "./types";

export type {
  BackendHealth,
  ChatMessage,
  ChatOptions,
  LlmBackend,
  LlmModel,
  OllamaModel,
} from "./types";

export const getEnabledBackends = (): LlmBackend[] => ["ollama"];

export const listModels = async (): Promise<LlmModel[]> => {
  const models = await listOllamaModels();
  if (!models.length) {
    throw new Error(
      "No models available. Start Ollama (`ollama list`) and confirm OLLAMA_BASE_URL.",
    );
  }
  return [...models].sort((a, b) => a.name.localeCompare(b.name));
};

export const resolveModelBackend = (_modelName: string): LlmBackend => "ollama";

export const stripBackendPrefix = (modelName: string): string => {
  if (modelName.startsWith("vllm:")) return modelName.slice(5);
  if (modelName.startsWith("ollama:")) return modelName.slice(7);
  return modelName;
};

/** Unified chat stream — Ollama only for now (vLLM adapter stays unused). */
export const streamChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<Response> => {
  return streamOllamaChat(stripBackendPrefix(model), messages, options);
};

/** Non-streaming completion for small helper prompts (query gloss, etc.). */
export const completeChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<string> => {
  return completeOllamaChat(stripBackendPrefix(model), messages, options);
};

export const pingBackends = async (): Promise<BackendHealth[]> => [
  await pingOllama(),
];

const PING_TTL_MS = 20_000;

let pingCache: {
  at: number;
  value: BackendHealth & { backends: BackendHealth[] };
} | null = null;

const pingLlmFresh = async (): Promise<
  BackendHealth & { backends: BackendHealth[] }
> => {
  const backends = await pingBackends();
  const primary =
    backends.find((b) => b.ok) ??
    backends[0] ??
    ({
      backend: "ollama" as const,
      ok: false,
      latencyMs: 0,
      error: "Ollama is not configured",
      baseUrl: "",
    } satisfies BackendHealth);

  return { ...primary, backends };
};

/** Backward-compatible single health check (primary / best available). */
export const pingLlm = async (): Promise<
  BackendHealth & { backends: BackendHealth[] }
> => {
  const now = Date.now();
  if (pingCache && now - pingCache.at < PING_TTL_MS) {
    return pingCache.value;
  }
  const value = await pingLlmFresh();
  pingCache = { at: now, value };
  return value;
};

export const getDefaultModel = (available: string[]): string => {
  const preferred = process.env.DEFAULT_MODEL?.trim();
  if (preferred && available.includes(preferred)) return preferred;
  return available[0] ?? preferred ?? "gemma3:4b";
};
