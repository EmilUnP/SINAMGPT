import { inferCapabilities } from "./capabilities";
import { inferModelKind } from "./model-kind";
import type { BackendHealth, ChatMessage, ChatOptions, LlmCompletion, LlmModel, LlmProviderConfig } from "./types";

const authHeaders = (provider: LlmProviderConfig): Record<string, string> =>
  provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {};

/** Accept either the server root or an already versioned reverse-proxy URL. */
export const openAiEndpoint = (baseUrl: string, endpoint: string): string => {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base.endsWith("/v1") ? base : `${base}/v1`}/${endpoint}`;
};

const requestTimeout = (): number => {
  const value = Number(process.env.LLM_REQUEST_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 180_000;
};

const mediaPart = (media: string): Record<string, unknown> => {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(media);
  const data = match ? match[2] : media;
  const header = Buffer.from(data.slice(0, 32), "base64");
  const wav = header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WAVE";
  if (wav || match?.[1].startsWith("audio/")) {
    return { type: "input_audio", input_audio: { data, format: wav || match?.[1].includes("wav") ? "wav" : "mp3" } };
  }
  const mime = match?.[1] ?? (
    header.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71])) ? "image/png" :
    header.toString("ascii", 0, 3) === "GIF" ? "image/gif" :
    header.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : "image/jpeg"
  );
  return { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } };
};

const toOpenAiMessages = (messages: ChatMessage[]) => messages.map((message) => ({
  role: message.role,
  content: message.images?.length
    ? [...(message.content.trim() ? [{ type: "text", text: message.content }] : []), ...message.images.map(mediaPart)]
    : message.content,
  ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({
    id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) },
  })) } : {}),
  ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
  ...(message.toolName ? { name: message.toolName } : {}),
}));

const requestBody = (provider: LlmProviderConfig, model: string, messages: ChatMessage[], stream: boolean, options?: ChatOptions): Record<string, unknown> => {
  if (options?.tools?.length && provider.kind === "vllm" && !provider.toolsEnabled) {
    throw new Error('Tool calling is not configured for this vLLM provider. Start it with a matching tool parser and enable tool calling in Admin → Providers.');
  }
  return {
    model, messages: toOpenAiMessages(messages), stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(options?.temperature != null ? { temperature: options.temperature } : {}),
    ...(options?.numPredict != null && options.numPredict > 0 ? { max_tokens: options.numPredict } : {}),
    ...(options?.topP != null ? { top_p: options.topP } : {}),
    ...(options?.tools?.length ? { tools: options.tools, tool_choice: "auto" } : {}),
    ...(provider.kind === "vllm" && options?.think != null ? { chat_template_kwargs: { enable_thinking: options.think } } : {}),
  };
};

export const listOpenAiCompatModels = async (provider: LlmProviderConfig): Promise<LlmModel[]> => {
  const res = await fetch(openAiEndpoint(provider.baseUrl, "models"), {
    cache: "no-store", redirect: "manual", headers: authHeaders(provider), signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(formatOpenAiCompatError(await res.text(), res.status, "model catalog", provider.baseUrl));
  const data = await res.json() as { data?: Array<{ id: string; created?: number }> };
  if (!Array.isArray(data.data)) throw new Error(`Invalid model catalog from provider "${provider.id}".`);
  return data.data.filter((m) => typeof m.id === "string" && m.id.trim()).map((m) => {
    const caps = inferCapabilities(m.id);
    return {
      name: m.id, size: 0, modified_at: m.created ? new Date(m.created * 1000).toISOString() : new Date().toISOString(),
      backend: provider.id, kind: inferModelKind(m.id), ...caps,
      tools: caps.tools && (provider.kind !== "vllm" || provider.toolsEnabled === true),
    };
  });
};

type StreamChunk = {
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: { completion_tokens?: number; prompt_tokens?: number };
  error?: { message?: string } | string;
};

/** Parse SSE events across arbitrary transport boundaries, including CRLF and final unterminated events. */
async function* sseData(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let lines: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    if (done && buffer && !buffer.endsWith("\n")) buffer += "\n";
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, "");
      buffer = buffer.slice(end + 1);
      if (!line) {
        if (lines.length) { yield lines.join("\n"); lines = []; }
      } else if (line.startsWith("data:")) {
        lines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (done) { if (lines.length) yield lines.join("\n"); return; }
  }
}

/** Normalize OpenAI SSE into the app's internal NDJSON stream contract. */
export const streamOpenAiCompatChat = async (provider: LlmProviderConfig, model: string, messages: ChatMessage[], options?: ChatOptions): Promise<Response> => {
  const abort = new AbortController();
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(requestTimeout()), ...(options?.signal ? [options.signal] : [])]);
  const res = await fetch(openAiEndpoint(provider.baseUrl, "chat/completions"), {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(provider) },
    body: JSON.stringify(requestBody(provider, model, messages, true, options)),
    cache: "no-store", redirect: "manual", signal,
  });
  if (!res.ok || !res.body) throw new Error(formatOpenAiCompatError(await res.text().catch(() => ""), res.status, model, provider.baseUrl));
  const reader = res.body.getReader();
  const encoder = new TextEncoder();
  const encode = (payload: Record<string, unknown>) => encoder.encode(`${JSON.stringify(payload)}\n`);
  let cancelled = false;
  async function* normalized(): AsyncGenerator<Uint8Array> {
    let completionTokens: number | undefined;
    let promptTokens: number | undefined;
    let completed = false;
    try {
      for await (const data of sseData(reader)) {
        if (data.trim() === "[DONE]") { completed = true; break; }
        const chunk = JSON.parse(data) as StreamChunk;
        if (chunk.error) throw new Error(typeof chunk.error === "string" ? chunk.error : chunk.error.message || "Model stream failed");
        if (typeof chunk.usage?.completion_tokens === "number") completionTokens = chunk.usage.completion_tokens;
        if (typeof chunk.usage?.prompt_tokens === "number") promptTokens = chunk.usage.prompt_tokens;
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) yield encode({ message: { role: "assistant", content: choice.delta.content }, done: false });
        if (choice?.finish_reason) completed = true;
      }
      signal.throwIfAborted();
      if (!completed) throw new Error("Model stream ended before completion. Please retry.");
      // Usage arrives after finish_reason. Emit one terminal record only after it is received.
      yield encode({ message: { role: "assistant", content: "" }, done: true, eval_count: completionTokens, prompt_eval_count: promptTokens });
    } catch (error) {
      if (!cancelled) yield encode({ error: error instanceof Error ? error.message : "Model stream failed", done: true });
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  const iterator = normalized();
  return new Response(new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (cancelled) return;
      if (done) controller.close(); else controller.enqueue(value);
    },
    async cancel(reason) {
      cancelled = true;
      abort.abort(reason);
      await reader.cancel(reason).catch(() => undefined);
      await iterator.return(undefined);
    },
  }, { highWaterMark: 0 }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
};

export const completeOpenAiCompatChat = async (provider: LlmProviderConfig, model: string, messages: ChatMessage[], options?: ChatOptions & { timeoutMs?: number }): Promise<string> =>
  (await completeOpenAiCompatToolChat(provider, model, messages, options)).content;

const parseToolArguments = (value: string | undefined): unknown => {
  if (!value) return {};
  try { return JSON.parse(value) as unknown; } catch { return value; }
};

export const completeOpenAiCompatToolChat = async (provider: LlmProviderConfig, model: string, messages: ChatMessage[], options?: ChatOptions & { timeoutMs?: number }): Promise<LlmCompletion> => {
  const signal = AbortSignal.any([AbortSignal.timeout(options?.timeoutMs ?? requestTimeout()), ...(options?.signal ? [options.signal] : [])]);
  const res = await fetch(openAiEndpoint(provider.baseUrl, "chat/completions"), {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(provider) },
    body: JSON.stringify(requestBody(provider, model, messages, false, options)),
    cache: "no-store", redirect: "manual", signal,
  });
  if (!res.ok) throw new Error(formatOpenAiCompatError(await res.text().catch(() => ""), res.status, model, provider.baseUrl));
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }>;
    error?: { message?: string } | string;
  };
  if (data.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "Model completion failed");
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("Model server returned no completion.");
  return {
    content: (message.content ?? "").trim(),
    toolCalls: (message.tool_calls ?? []).flatMap((call, index) => {
      const name = call.function?.name?.trim();
      return name ? [{ id: call.id?.trim() || `tool-call-${index}`, name, arguments: parseToolArguments(call.function?.arguments) }] : [];
    }),
  };
};

export const pingOpenAiCompat = async (provider: LlmProviderConfig): Promise<BackendHealth> => {
  const started = Date.now();
  try {
    await listOpenAiCompatModels(provider);
    return { backend: provider.id, ok: true, latencyMs: Date.now() - started, baseUrl: provider.baseUrl };
  } catch (error) {
    return { backend: provider.id, ok: false, latencyMs: Date.now() - started, baseUrl: provider.baseUrl, error: error instanceof Error ? error.message : "Unreachable" };
  }
};

const formatOpenAiCompatError = (text: string, status: number, model: string, baseUrl: string): string => {
  let message = text.trim();
  try {
    const parsed = JSON.parse(message) as { error?: { message?: string } | string };
    message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message || message;
  } catch { /* Keep the server's diagnostic. */ }
  return `Model server HTTP ${status}: ${message || `request for "${model}" failed at ${baseUrl}`}`;
};
