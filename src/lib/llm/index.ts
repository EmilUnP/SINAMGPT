import {
  completeOllamaChat,
  completeOllamaToolChat,
  listOllamaModels,
  pingOllama,
  streamOllamaChat,
} from "./ollama";
import {
  completeOpenAiCompatChat,
  completeOpenAiCompatToolChat,
  listOpenAiCompatModels,
  pingOpenAiCompat,
  streamOpenAiCompatChat,
} from "./openai-compat";
import { withProviderConcurrency } from "./concurrency";
import { isUnreachableError } from "./errors";
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
import { isOpenAiCompatKind } from "./types";

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

export { isOpenAiCompatKind } from "./types";

export const getEnabledBackends = (): LlmBackend[] =>
  listEnabledProviderConfigs().map((provider) => provider.id);

const qualifyModelName = (
  provider: LlmProviderConfig,
  modelName: string,
): string => (provider.id === "ollama" ? modelName : `${provider.id}:${modelName}`);

const listProviderModels = async (
  provider: LlmProviderConfig,
): Promise<LlmModel[]> => {
  if (provider.kind === "ollama") return listOllamaModels(provider);
  if (isOpenAiCompatKind(provider.kind)) {
    return listOpenAiCompatModels(provider);
  }
  return [];
};

export const listModels = async (): Promise<LlmModel[]> => {
  const providers = listEnabledProviderConfigs();
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

export const listModelsFromProvider = async (
  id: string,
): Promise<LlmModel[]> => {
  const provider = getProviderConfig(id);
  if (!provider) throw new Error(`Provider "${id}" was not found.`);
  const models = await listProviderModels(provider);
  return models.map((model) => ({
    ...model,
    name: qualifyModelName(provider, model.name),
    backend: provider.id,
  }));
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

const fallbackProvider = (
  provider: LlmProviderConfig,
): LlmProviderConfig | null => {
  if (!provider.fallbackId) return null;
  const fallback = getProviderConfig(provider.fallbackId);
  if (!fallback || !fallback.enabled || fallback.id === provider.id) {
    return null;
  }
  return fallback;
};

const fallbackHasModel = (
  fallback: LlmProviderConfig,
  strippedModel: string,
): boolean => {
  const qualified = qualifyModelName(fallback, strippedModel);
  const row = getDb()
    .prepare(`SELECT 1 AS ok FROM models WHERE name = ?`)
    .get(qualified) as { ok: number } | undefined;
  return Boolean(row);
};

const dispatchStream = (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<Response> => {
  if (provider.kind === "ollama") {
    return streamOllamaChat(provider, model, messages, options);
  }
  if (isOpenAiCompatKind(provider.kind)) {
    return streamOpenAiCompatChat(provider, model, messages, options);
  }
  throw new Error(`Provider kind "${provider.kind}" is not supported.`);
};

const dispatchComplete = (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<string> => {
  if (provider.kind === "ollama") {
    return completeOllamaChat(provider, model, messages, options);
  }
  if (isOpenAiCompatKind(provider.kind)) {
    return completeOpenAiCompatChat(provider, model, messages, options);
  }
  throw new Error(`Provider kind "${provider.kind}" is not supported.`);
};

const dispatchToolComplete = (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<LlmCompletion> => {
  if (provider.kind === "ollama") {
    return completeOllamaToolChat(provider, model, messages, options);
  }
  if (isOpenAiCompatKind(provider.kind)) {
    return completeOpenAiCompatToolChat(provider, model, messages, options);
  }
  throw new Error(`Provider kind "${provider.kind}" is not supported.`);
};

const withFallback = async <T>(
  provider: LlmProviderConfig,
  strippedModel: string,
  run: (target: LlmProviderConfig, model: string) => Promise<T>,
): Promise<T> => {
  const invoke = (target: LlmProviderConfig) =>
    withProviderConcurrency(target.id, target.maxConcurrent ?? 0, () =>
      run(target, strippedModel),
    );

  try {
    return await invoke(provider);
  } catch (error) {
    if (!isUnreachableError(error)) throw error;
    const fallback = fallbackProvider(provider);
    if (!fallback) throw error;
    if (!fallbackHasModel(fallback, strippedModel)) {
      throw new Error(
        `Provider "${provider.id}" is unreachable, and fallback "${fallback.id}" does not have model "${strippedModel}".`,
      );
    }
    return invoke(fallback);
  }
};

/** Unified chat stream routed through the model's provider. */
export const streamChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<Response> => {
  const provider = providerForModel(model);
  const providerModel = stripBackendPrefix(model, provider.id);
  return withFallback(provider, providerModel, (target, name) =>
    dispatchStream(target, name, messages, options),
  );
};

/** Non-streaming completion for small helper prompts (query gloss, etc.). */
export const completeChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<string> => {
  const provider = providerForModel(model);
  const providerModel = stripBackendPrefix(model, provider.id);
  return withFallback(provider, providerModel, (target, name) =>
    dispatchComplete(target, name, messages, options),
  );
};

/** Structured completion used by the gated tool runtime. */
export const completeToolChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<LlmCompletion> => {
  const provider = providerForModel(model);
  const providerModel = stripBackendPrefix(model, provider.id);
  return withFallback(provider, providerModel, (target, name) =>
    dispatchToolComplete(target, name, messages, options),
  );
};

export const pingProvider = async (
  provider: LlmProviderConfig,
): Promise<BackendHealth> => {
  if (provider.kind === "ollama") return pingOllama(provider);
  if (isOpenAiCompatKind(provider.kind)) return pingOpenAiCompat(provider);
  return {
    backend: provider.id,
    ok: false,
    latencyMs: 0,
    error: `Provider kind "${provider.kind}" is not supported.`,
    baseUrl: provider.baseUrl,
  };
};

export const pingProviderById = async (id: string): Promise<BackendHealth> => {
  const provider = getProviderConfig(id);
  if (!provider) throw new Error(`Provider "${id}" was not found.`);
  return pingProvider(provider);
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
