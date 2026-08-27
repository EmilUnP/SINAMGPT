import {
  completeOllamaChat,
  completeOllamaToolChat,
  listOllamaModels,
  pingOllama,
  streamOllamaChat,
} from "./ollama";
import {
  completeVllmChat,
  completeVllmToolChat,
  isVllmEnabled,
  listVllmModels,
  pingVllm,
  streamVllmChat,
} from "./vllm";
import { getDb } from "@/lib/db";
import {
  getProviderConfig,
  listEnabledProviderConfigs,
} from "@/lib/providers";
import type {
  BackendHealth,
  ChatMessage,
  ChatOptions,
  LlmCompletion,
  LlmBackend,
  LlmModel,
  LlmProviderConfig,
} from "./types";

export type {
  BackendHealth,
  ChatMessage,
  ChatOptions,
  LlmCompletion,
  LlmToolCall,
  LlmToolDefinition,
  LlmBackend,
  LlmModel,
  LlmProviderConfig,
  ModelKind,
  OllamaModel,
  ProviderKind,
} from "./types";

export const getEnabledBackends = (): LlmBackend[] =>
  listEnabledProviderConfigs().map((provider) => provider.id);

const isAdapterAvailable = (provider: LlmProviderConfig): boolean =>
  provider.kind === "ollama" ||
  (provider.kind === "vllm" && isVllmEnabled());

const qualifyModelName = (
  provider: LlmProviderConfig,
  modelName: string,
): string => (provider.id === "ollama" ? modelName : `${provider.id}:${modelName}`);

const listProviderModels = async (
  provider: LlmProviderConfig,
): Promise<LlmModel[]> => {
  if (provider.kind === "ollama") return listOllamaModels(provider);
  if (provider.kind === "vllm" && isVllmEnabled()) {
    return listVllmModels(provider);
  }
  return [];
};

export const listModels = async (): Promise<LlmModel[]> => {
  const providers = listEnabledProviderConfigs().filter(isAdapterAvailable);
  const results = await Promise.allSettled(providers.map(listProviderModels));
  const models = results.flatMap((result, index) =>
    result.status === "fulfilled"
      ? result.value.map((model) => ({
          ...model,
          name: qualifyModelName(providers[index], model.name),
          backend: providers[index].id,
        }))
      : [],
  );

  if (!models.length) {
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
    throw new Error("No models are available from enabled providers.");
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
};

export const resolveModelBackend = (modelName: string): LlmBackend => {
  const stored = getDb()
    .prepare(`SELECT backend FROM models WHERE name = ?`)
    .get(modelName) as { backend: string } | undefined;
  if (stored?.backend) return stored.backend;

  const separator = modelName.indexOf(":");
  if (separator > 0) {
    const candidate = modelName.slice(0, separator);
    if (getProviderConfig(candidate)) return candidate;
  }
  return "ollama";
};

export const stripBackendPrefix = (
  modelName: string,
  backend = resolveModelBackend(modelName),
): string => {
  const prefix = `${backend}:`;
  if (modelName.startsWith(prefix)) return modelName.slice(prefix.length);
  return modelName;
};

const providerForModel = (model: string): LlmProviderConfig => {
  const providerId = resolveModelBackend(model);
  const provider = getProviderConfig(providerId);
  if (!provider || !provider.enabled) {
    throw new Error(`Model provider "${providerId}" is not enabled.`);
  }
  return provider;
};

/** Unified chat stream routed through the model's provider. */
export const streamChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<Response> => {
  const provider = providerForModel(model);
  const providerModel = stripBackendPrefix(model, provider.id);
  if (provider.kind === "ollama") {
    return streamOllamaChat(provider, providerModel, messages, options);
  }
  if (provider.kind === "vllm" && isVllmEnabled()) {
    return streamVllmChat(provider, providerModel, messages, options);
  }
  throw new Error(`Provider kind "${provider.kind}" is not enabled yet.`);
};

/** Non-streaming completion for small helper prompts (query gloss, etc.). */
export const completeChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<string> => {
  const provider = providerForModel(model);
  const providerModel = stripBackendPrefix(model, provider.id);
  if (provider.kind === "ollama") {
    return completeOllamaChat(provider, providerModel, messages, options);
  }
  if (provider.kind === "vllm" && isVllmEnabled()) {
    return completeVllmChat(provider, providerModel, messages, options);
  }
  throw new Error(`Provider kind "${provider.kind}" is not enabled yet.`);
};

/** Structured completion used by the gated tool runtime. */
export const completeToolChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<LlmCompletion> => {
  const provider = providerForModel(model);
  const providerModel = stripBackendPrefix(model, provider.id);
  if (provider.kind === "ollama") {
    return completeOllamaToolChat(provider, providerModel, messages, options);
  }
  if (provider.kind === "vllm" && isVllmEnabled()) {
    return completeVllmToolChat(provider, providerModel, messages, options);
  }
  throw new Error(`Provider kind "${provider.kind}" is not enabled yet.`);
};

const pingProvider = async (
  provider: LlmProviderConfig,
): Promise<BackendHealth> => {
  if (provider.kind === "ollama") return pingOllama(provider);
  if (provider.kind === "vllm" && isVllmEnabled()) return pingVllm(provider);
  return {
    backend: provider.id,
    ok: false,
    latencyMs: 0,
    error: `Provider kind "${provider.kind}" is parked until Phase 1.`,
    baseUrl: provider.baseUrl,
  };
};

export const pingBackends = async (): Promise<BackendHealth[]> =>
  Promise.all(listEnabledProviderConfigs().map(pingProvider));

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
      backend: "ollama",
      ok: false,
      latencyMs: 0,
      error: "No model provider is configured",
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
