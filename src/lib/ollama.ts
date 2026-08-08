const getBaseUrl = (): string =>
  process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:11434";

export type OllamaModel = {
  name: string;
  size: number;
  modified_at: string;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export const listModels = async (): Promise<OllamaModel[]> => {
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

  return (data.models ?? []).map((m) => ({
    name: m.name,
    size: m.size,
    modified_at: m.modified_at,
  }));
};

export type ChatOptions = {
  temperature?: number;
  numPredict?: number;
};

export const streamChat = async (
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

  const res = await fetch(`${getBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
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
    lower.includes("cudaMalloc failed".toLowerCase()) ||
    lower.includes("failed to allocate cuda")
  ) {
    return `GPU out of memory while loading "${model}". Close other GPU apps, switch to a smaller model, or restart Ollama.`;
  }

  if (lower.includes("not found") || lower.includes("model") && lower.includes("does not exist")) {
    return `Ollama model "${model}" was not found. Check the real model id in Admin → Models.`;
  }

  return (
    message ||
    `Ollama chat failed (${status}) for "${model}". Is Ollama running?`
  );
};

export const getDefaultModel = (available: string[]): string => {
  const preferred = process.env.DEFAULT_MODEL;
  if (preferred && available.includes(preferred)) return preferred;
  return available[0] ?? preferred ?? "gemma3:4b";
};
