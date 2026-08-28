import { inferCapabilities } from "./capabilities";
import { inferModelKind } from "./model-kind";
import type {
  BackendHealth,
  ChatMessage,
  ChatOptions,
  LlmCompletion,
  LlmModel,
  LlmProviderConfig,
} from "./types";

const authHeaders = (provider: LlmProviderConfig): HeadersInit =>
  provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {};

const toOpenAiMessages = (messages: ChatMessage[]) =>
  messages.map((message) => {
    if (!message.images?.length) {
      return {
        role: message.role,
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.arguments),
                },
              })),
            }
          : {}),
        ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
        ...(message.toolName ? { name: message.toolName } : {}),
      };
    }
    const parts: Array<Record<string, unknown>> = [];
    if (message.content.trim()) {
      parts.push({ type: "text", text: message.content });
    }
    for (const image of message.images) {
      const url = image.startsWith("data:")
        ? image
        : `data:image/jpeg;base64,${image}`;
      parts.push({ type: "image_url", image_url: { url } });
    }
    return { role: message.role, content: parts };
  });

export const listOpenAiCompatModels = async (
  provider: LlmProviderConfig,
): Promise<LlmModel[]> => {
  const res = await fetch(`${provider.baseUrl}/v1/models`, {
    cache: "no-store",
    redirect: "manual",
    headers: { ...authHeaders(provider) },
  });

  if (!res.ok) {
    throw new Error(
      `OpenAI-compatible server is not reachable at ${provider.baseUrl}. Is it running?`,
    );
  }

  const data = (await res.json()) as {
    data?: Array<{ id: string; created?: number }>;
  };

  return (data.data ?? []).map((m) => {
    const caps = inferCapabilities(m.id);
    return {
      name: m.id,
      size: 0,
      modified_at: m.created
        ? new Date(m.created * 1000).toISOString()
        : new Date().toISOString(),
      backend: provider.id,
      kind: inferModelKind(m.id),
      vision: caps.vision,
      tools: caps.tools,
      audio: caps.audio,
      tts: caps.tts,
      video: caps.video,
    };
  });
};

/**
 * Stream an OpenAI-compatible `/v1/chat/completions` response and adapt
 * chunks to Ollama NDJSON so existing chat routes keep working unchanged.
 */
export const streamOpenAiCompatChat = async (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<Response> => {
  const body: Record<string, unknown> = {
    model,
    messages: toOpenAiMessages(messages),
    stream: true,
  };

  if (options?.temperature != null) body.temperature = options.temperature;
  if (options?.numPredict != null && options.numPredict >= 0) {
    body.max_tokens = options.numPredict;
  }
  if (options?.topP != null) body.top_p = options.topP;
  if (options?.tools?.length) body.tools = options.tools;

  const res = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(provider),
    },
    body: JSON.stringify(body),
    redirect: "manual",
    ...(options?.signal ? { signal: options.signal } : {}),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(
      formatOpenAiCompatError(text, res.status, model, provider.baseUrl),
    );
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
                  : chunk.error.message || "OpenAI-compatible stream error";
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

        pushOllama({
          message: { role: "assistant", content: "" },
          done: true,
          eval_count: completionTokens || undefined,
          prompt_eval_count: promptTokens || undefined,
        });

        controller.close();
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : "OpenAI-compatible stream failed";
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

export const completeOpenAiCompatChat = async (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<string> => {
  const completion = await completeOpenAiCompatToolChat(
    provider,
    model,
    messages,
    options,
  );
  return completion.content;
};

const parseToolArguments = (value: string | undefined): unknown => {
  if (!value) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

export const completeOpenAiCompatToolChat = async (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<LlmCompletion> => {
  const body: Record<string, unknown> = {
    model,
    messages: toOpenAiMessages(messages),
    stream: false,
  };
  if (options?.temperature != null) body.temperature = options.temperature;
  if (options?.numPredict != null && options.numPredict >= 0) {
    body.max_tokens = options.numPredict;
  }
  if (options?.topP != null) body.top_p = options.topP;
  if (options?.tools?.length) body.tools = options.tools;

  const timeoutSignal = AbortSignal.timeout(options?.timeoutMs ?? 8000);
  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  const res = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(provider),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "manual",
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      formatOpenAiCompatError(text, res.status, model, provider.baseUrl),
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
    error?: { message?: string } | string;
  };
  if (data.error) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error.message || "OpenAI-compatible complete failed",
    );
  }
  const message = data.choices?.[0]?.message;
  return {
    content: (message?.content ?? "").trim(),
    toolCalls: (message?.tool_calls ?? []).flatMap((call, index) => {
      const name = call.function?.name?.trim();
      if (!name) return [];
      return [
        {
          id: call.id?.trim() || `openai-call-${index}`,
          name,
          arguments: parseToolArguments(call.function?.arguments),
        },
      ];
    }),
  };
};

export const pingOpenAiCompat = async (
  provider: LlmProviderConfig,
): Promise<BackendHealth> => {
  const baseUrl = provider.baseUrl;
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      cache: "no-store",
      redirect: "manual",
      headers: { ...authHeaders(provider) },
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        backend: provider.id,
        ok: false,
        latencyMs,
        error: `HTTP ${res.status}`,
        baseUrl,
      };
    }
    return { backend: provider.id, ok: true, latencyMs, baseUrl };
  } catch (error) {
    return {
      backend: provider.id,
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unreachable",
      baseUrl,
    };
  }
};

const formatOpenAiCompatError = (
  text: string,
  status: number,
  model: string,
  baseUrl: string,
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
    `OpenAI-compatible chat failed (${status}) for "${model}". Is the server running at ${baseUrl}?`
  );
};
