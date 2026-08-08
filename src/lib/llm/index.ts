import { getDb } from "@/lib/db";
import {
  isOllamaEnabled,
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
import {
  isVllmEnabled,
  listVllmModels,
  pingVllm,
  streamVllmChat,
} from "./vllm";

export type {
  BackendHealth,
  ChatMessage,
  ChatOptions,
  LlmBackend,
  LlmModel,
  OllamaModel,
} from "./types";

export const getEnabledBackends = (): LlmBackend[] => {
  const backends: LlmBackend[] = [];
  if (isOllamaEnabled()) backends.push("ollama");
  if (isVllmEnabled()) backends.push("vllm");
  // Default to ollama if misconfigured empty
  return backends.length ? backends : ["ollama"];
};

/** Parallel model discovery from every enabled backend. */
export const listModels = async (): Promise<LlmModel[]> => {
  const enabled = getEnabledBackends();
  const tasks: Array<Promise<LlmModel[]>> = [];

  if (enabled.includes("ollama")) tasks.push(listOllamaModels());
  if (enabled.includes("vllm")) tasks.push(listVllmModels());

  const settled = await Promise.allSettled(tasks);
  const models: LlmModel[] = [];
  const errors: string[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      models.push(...result.value);
    } else {
      errors.push(
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      );
    }
  }

  if (!models.length) {
    throw new Error(
      errors[0] ||
        "No LLM backends available. Start Ollama and/or vLLM, or set LLM_BACKENDS.",
    );
  }

  // Dedupe by name — prefer ollama on exact name collision unless only vllm
  const byName = new Map<string, LlmModel>();
  for (const model of models) {
    const existing = byName.get(model.name);
    if (!existing) {
      byName.set(model.name, model);
      continue;
    }
    if (existing.backend === "vllm" && model.backend === "ollama") {
      byName.set(model.name, model);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const resolveModelBackend = (modelName: string): LlmBackend => {
  const raw = modelName.trim();
  if (raw.startsWith("vllm:")) return "vllm";
  if (raw.startsWith("ollama:")) return "ollama";

  const row = getDb()
    .prepare(`SELECT backend FROM models WHERE name = ?`)
    .get(raw) as { backend: string } | undefined;

  if (row?.backend === "vllm" || row?.backend === "ollama") {
    return row.backend;
  }

  // Heuristic: HF-style ids usually come from vLLM
  if (raw.includes("/") && isVllmEnabled()) return "vllm";
  if (isOllamaEnabled()) return "ollama";
  if (isVllmEnabled()) return "vllm";
  return "ollama";
};

export const stripBackendPrefix = (modelName: string): string => {
  if (modelName.startsWith("vllm:")) return modelName.slice(5);
  if (modelName.startsWith("ollama:")) return modelName.slice(7);
  return modelName;
};

/** Unified chat stream — routes to Ollama or vLLM (parallel-capable fleet). */
export const streamChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<Response> => {
  const backend = resolveModelBackend(model);
  const realName = stripBackendPrefix(model);

  if (backend === "vllm") {
    return streamVllmChat(realName, messages, options);
  }
  return streamOllamaChat(realName, messages, options);
};

export const pingBackends = async (): Promise<BackendHealth[]> => {
  const enabled = getEnabledBackends();
  const tasks: Array<Promise<BackendHealth>> = [];
  if (enabled.includes("ollama")) tasks.push(pingOllama());
  if (enabled.includes("vllm")) tasks.push(pingVllm());
  return Promise.all(tasks);
};

/** Backward-compatible single health check (primary / best available). */
export const pingLlm = async (): Promise<
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
      error: "No backends configured",
      baseUrl: "",
    } satisfies BackendHealth);

  return { ...primary, backends };
};

export const getDefaultModel = (available: string[]): string => {
  const preferred = process.env.DEFAULT_MODEL?.trim();
  if (preferred && available.includes(preferred)) return preferred;
  return available[0] ?? preferred ?? "gemma3:4b";
};
