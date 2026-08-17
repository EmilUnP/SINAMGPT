import {
  inferCapabilities,
  parseOllamaCapabilities,
  type ModelCapabilities,
} from "./capabilities";
import type { BackendHealth, ChatMessage, ChatOptions, LlmModel } from "./types";

const getBaseUrl = (): string =>
  process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:11434";

const getKeepAlive = (): string =>
  process.env.OLLAMA_KEEP_ALIVE?.trim() || "30m";

export const isOllamaEnabled = (): boolean => true;

export const listOllamaModels = async (): Promise<LlmModel[]> => {
  const res = await fetch(`${getBaseUrl()}/api/tags`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Ollama is not reachable at ${getBaseUrl()}. Is Ollama running?`,
    );
  }

  const data = (await res.json()) as {
    models?: Array<{ name: string; size: number; modified_at: string }>;
  };

  const listed = data.models ?? [];
  const caps = await Promise.all(
    listed.map((m) => inspectOllamaCapabilities(m.name)),
  );

  return listed.map((m, i) => ({
    name: m.name,
    size: m.size,
    modified_at: m.modified_at,
    backend: "ollama" as const,
    vision: caps[i]?.vision ?? false,
    tools: caps[i]?.tools ?? false,
  }));
};

const inspectOllamaCapabilities = async (
  name: string,
): Promise<ModelCapabilities> => {
  const heuristic = inferCapabilities(name);
  try {
    const res = await fetch(`${getBaseUrl()}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name, name }),
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return heuristic;
    const data = (await res.json()) as { capabilities?: unknown };
    return parseOllamaCapabilities(data.capabilities, name);
  } catch {
    return heuristic;
  }
};

export const streamOllamaChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<Response> => {
  const ollamaOptions: Record<string, number> = {};
  if (options?.temperature != null) {
    ollamaOptions.temperature = options.temperature;
  }
  if (options?.numPredict != null && options.numPredict >= 0) {
    ollamaOptions.num_predict = options.numPredict;
  }
  if (options?.topP != null) {
    ollamaOptions.top_p = options.topP;
  }

  const res = await fetch(`${getBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      keep_alive: getKeepAlive(),
      ...(Object.keys(ollamaOptions).length
        ? { options: ollamaOptions }
        : {}),
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(formatOllamaError(text, res.status, model));
  }

  return res;
};

export const completeOllamaChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<string> => {
  const ollamaOptions: Record<string, number> = {};
  if (options?.temperature != null) {
    ollamaOptions.temperature = options.temperature;
  }
  if (options?.numPredict != null && options.numPredict >= 0) {
    ollamaOptions.num_predict = options.numPredict;
  }
  if (options?.topP != null) {
    ollamaOptions.top_p = options.topP;
  }

  const res = await fetch(`${getBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      keep_alive: getKeepAlive(),
      ...(Object.keys(ollamaOptions).length
        ? { options: ollamaOptions }
        : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(options?.timeoutMs ?? 8000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatOllamaError(text, res.status, model));
  }

  const data = (await res.json()) as {
    message?: { content?: string };
    error?: string;
  };
  if (data.error) throw new Error(data.error);
  return (data.message?.content ?? "").trim();
};

export const pingOllama = async (): Promise<BackendHealth> => {
  const baseUrl = getBaseUrl();
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { cache: "no-store" });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        backend: "ollama",
        ok: false,
        latencyMs,
        error: `HTTP ${res.status}`,
        baseUrl,
      };
    }
    return { backend: "ollama", ok: true, latencyMs, baseUrl };
  } catch (error) {
    return {
      backend: "ollama",
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unreachable",
      baseUrl,
    };
  }
};

const formatOllamaError = (
  text: string,
  status: number,
  model: string,
): string => {
  const raw = text.trim();
  let message = raw;

  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed.error) message = parsed.error;
  } catch {
    // keep raw text
  }

  const lower = message.toLowerCase();
  if (
    lower.includes("out of memory") ||
    lower.includes("cudamalloc failed") ||
    lower.includes("failed to allocate cuda")
  ) {
    return `GPU out of memory while loading "${model}". Close other GPU apps, switch to a smaller model, or restart Ollama.`;
  }

  if (
    lower.includes("not found") ||
    (lower.includes("model") && lower.includes("does not exist"))
  ) {
    return `Ollama model "${model}" was not found. Check the real model id in Admin → Models.`;
  }

  return (
    message ||
    `Ollama chat failed (${status}) for "${model}". Is Ollama running?`
  );
};
