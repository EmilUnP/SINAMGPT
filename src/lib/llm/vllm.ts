import type { BackendHealth, ChatMessage, ChatOptions, LlmModel } from "./types";

const getBaseUrl = (): string =>
  process.env.VLLM_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

const getApiKey = (): string | undefined => {
  const key = process.env.VLLM_API_KEY?.trim();
  return key || undefined;
};

const authHeaders = (): HeadersInit => {
  const key = getApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
};

export const isVllmEnabled = (): boolean => {
  const backends = (process.env.LLM_BACKENDS || "ollama")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return backends.includes("vllm") || backends.includes("both");
};

export const listVllmModels = async (): Promise<LlmModel[]> => {
  const res = await fetch(`${getBaseUrl()}/v1/models`, {
    cache: "no-store",
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    throw new Error(
      `vLLM is not reachable at ${getBaseUrl()}. Is the OpenAI-compatible server running?`,
    );
  }

  const data = (await res.json()) as {
    data?: Array<{ id: string; created?: number }>;
  };

  return (data.data ?? []).map((m) => ({
    name: m.id,
    size: 0,
    modified_at: m.created
      ? new Date(m.created * 1000).toISOString()
      : new Date().toISOString(),
    backend: "vllm" as const,
  }));
};

/**
 * Stream vLLM (OpenAI-compatible) and adapt chunks to Ollama NDJSON so
 * existing chat routes keep working unchanged.
 */
export const streamVllmChat = async (
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<Response> => {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  };

  if (options?.temperature != null) body.temperature = options.temperature;
  if (options?.numPredict != null && options.numPredict >= 0) {
    body.max_tokens = options.numPredict;
  }
  if (options?.topP != null) body.top_p = options.topP;

  const res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(formatVllmError(text, res.status, model));
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = "";
  let completionTokens = 0;
  let promptTokens = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const pushOllama = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";

          for (const rawLine of parts) {
            const line = rawLine.trim();
            if (!line || line.startsWith(":")) continue;

            const data = line.startsWith("data:")
              ? line.slice(5).trim()
              : line;

            if (!data || data === "[DONE]") continue;

            let chunk: {
              choices?: Array<{
                delta?: { content?: string; role?: string };
                finish_reason?: string | null;
              }>;
              usage?: {
                completion_tokens?: number;
                prompt_tokens?: number;
              };
              error?: { message?: string } | string;
            };

            try {
              chunk = JSON.parse(data);
            } catch {
              continue;
            }

            if (chunk.error) {
              const msg =
                typeof chunk.error === "string"
                  ? chunk.error
                  : chunk.error.message || "vLLM stream error";
              throw new Error(msg);
            }

            if (chunk.usage) {
              if (typeof chunk.usage.completion_tokens === "number") {
                completionTokens = chunk.usage.completion_tokens;
              }
              if (typeof chunk.usage.prompt_tokens === "number") {
                promptTokens = chunk.usage.prompt_tokens;
              }
            }

            const piece = chunk.choices?.[0]?.delta?.content ?? "";
            if (piece) {
              pushOllama({
                message: { role: "assistant", content: piece },
                done: false,
              });
            }

            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish) {
              pushOllama({
                message: { role: "assistant", content: "" },
                done: true,
                eval_count: completionTokens || undefined,
                prompt_eval_count: promptTokens || undefined,
              });
            }
          }
        }

        // Ensure a terminal done chunk if the server omitted finish_reason
        pushOllama({
          message: { role: "assistant", content: "" },
          done: true,
          eval_count: completionTokens || undefined,
          prompt_eval_count: promptTokens || undefined,
        });

        controller.close();
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "vLLM stream failed";
        pushOllama({ error: msg, done: true });
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
};

export const pingVllm = async (): Promise<BackendHealth> => {
  const baseUrl = getBaseUrl();
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      cache: "no-store",
      headers: { ...authHeaders() },
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        backend: "vllm",
        ok: false,
        latencyMs,
        error: `HTTP ${res.status}`,
        baseUrl,
      };
    }
    return { backend: "vllm", ok: true, latencyMs, baseUrl };
  } catch (error) {
    return {
      backend: "vllm",
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unreachable",
      baseUrl,
    };
  }
};

const formatVllmError = (
  text: string,
  status: number,
  model: string,
): string => {
  const raw = text.trim();
  let message = raw;

  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string } | string;
    };
    if (typeof parsed.error === "string") message = parsed.error;
    else if (parsed.error?.message) message = parsed.error.message;
  } catch {
    // keep raw
  }

  return (
    message ||
    `vLLM chat failed (${status}) for "${model}". Is vLLM running at ${getBaseUrl()}?`
  );
};
