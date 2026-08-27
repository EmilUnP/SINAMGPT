import {
  inferCapabilities,
  parseOllamaCapabilities,
  type ModelCapabilities,
} from "./capabilities";
import { inferModelKind } from "./model-kind";
import type {
  BackendHealth,
  ChatMessage,
  ChatOptions,
  LlmCompletion,
  LlmModel,
  LlmProviderConfig,
} from "./types";

const getKeepAlive = (): string =>
  process.env.OLLAMA_KEEP_ALIVE?.trim() || "30m";

export const isOllamaEnabled = (): boolean => true;

export const listOllamaModels = async (
  provider: LlmProviderConfig,
): Promise<LlmModel[]> => {
  const res = await fetch(`${provider.baseUrl}/api/tags`, {
    cache: "no-store",
    redirect: "manual",
  });

  if (!res.ok) {
    throw new Error(
      `Ollama is not reachable at ${provider.baseUrl}. Is Ollama running?`,
    );
  }

  const data = (await res.json()) as {
    models?: Array<{ name: string; size: number; modified_at: string }>;
  };

  const listed = data.models ?? [];
  const caps = await Promise.all(
    listed.map((m) => inspectOllamaCapabilities(provider, m.name)),
  );

  return listed.map((m, i) => ({
    name: m.name,
    size: m.size,
    modified_at: m.modified_at,
    backend: provider.id,
    kind: inferModelKind(m.name),
    vision: caps[i]?.vision ?? false,
    tools: caps[i]?.tools ?? false,
    audio: caps[i]?.audio ?? false,
    tts: caps[i]?.tts ?? false,
    video: caps[i]?.video ?? false,
  }));
};

const inspectOllamaCapabilities = async (
  provider: LlmProviderConfig,
  name: string,
): Promise<ModelCapabilities> => {
  const heuristic = inferCapabilities(name);
  try {
    const res = await fetch(`${provider.baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name, name }),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return heuristic;
    const data = (await res.json()) as { capabilities?: unknown };
    return parseOllamaCapabilities(data.capabilities, name);
  } catch {
    return heuristic;
  }
};

const isWavBase64 = (b64: string): boolean => {
  try {
    const buf = Buffer.from(b64.slice(0, 24), "base64");
    return (
      buf.length >= 12 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WAVE"
    );
  } catch {
    return false;
  }
};

const messagesHaveAudio = (messages: ChatMessage[]): boolean =>
  messages.some((message) => message.images?.some(isWavBase64));

/**
 * Gemma 4 E2B treats WAV-in-images as “no file” unless we say it can hear
 * the clip. Keep audio on the same native /api/chat user message as the text
 * — Ollama’s /v1 input_audio path splits them onto two user turns and E2B
 * then asks for the recording.
 */
const AUDIO_SYSTEM = `AUDIO INPUT: The user attached a WAV recording you can hear. It is audio, not an image and not a missing file. Listen to it. Never say the recording is missing or ask them to provide it. Transcribe what was spoken if needed, then answer.`;

const withAudioSystem = (messages: ChatMessage[]): ChatMessage[] => {
  if (!messagesHaveAudio(messages)) return messages;
  const index = messages.findIndex((message) => message.role === "system");
  if (index < 0) {
    return [{ role: "system", content: AUDIO_SYSTEM }, ...messages];
  }
  const next = [...messages];
  const current = next[index].content?.trim() ?? "";
  if (current.includes("AUDIO INPUT:")) return messages;
  next[index] = {
    ...next[index],
    content: current ? `${current}\n\n${AUDIO_SYSTEM}` : AUDIO_SYSTEM,
  };
  return next;
};

const numericOptions = (options?: ChatOptions): Record<string, number> => {
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
  return ollamaOptions;
};

const thinkDisabled = (
  messages: ChatMessage[],
  options?: ChatOptions,
): boolean => options?.think === false || messagesHaveAudio(messages);

const toNativeMessages = (messages: ChatMessage[]) =>
  withAudioSystem(messages).map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.images?.length ? { images: message.images } : {}),
    ...(message.toolCalls?.length
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        }
      : {}),
    ...(message.toolName ? { tool_name: message.toolName } : {}),
  }));

const nativeChatBody = (
  model: string,
  messages: ChatMessage[],
  options: ChatOptions | undefined,
  stream: boolean,
) => {
  const nums = numericOptions(options);
  const disableThink = thinkDisabled(messages, options);
  const hasAudio = messagesHaveAudio(messages);
  const ollamaOptions: Record<string, number | boolean> = { ...nums };
  if (disableThink) {
    ollamaOptions.think = false;
    ollamaOptions.thinking = false;
  }
  if (hasAudio) {
    ollamaOptions.num_ctx = 8192;
  }
  return {
    model,
    messages: toNativeMessages(messages),
    stream,
    keep_alive: getKeepAlive(),
    ...(disableThink ? { think: false } : {}),
    ...(Object.keys(ollamaOptions).length ? { options: ollamaOptions } : {}),
    ...(options?.tools?.length ? { tools: options.tools } : {}),
  };
};

const joinSignals = (
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined => {
  const list = signals.filter((s): s is AbortSignal => Boolean(s));
  if (!list.length) return undefined;
  if (list.length === 1) return list[0];
  return AbortSignal.any(list);
};

const postNativeChat = async (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions | undefined,
  stream: boolean,
  timeoutMs?: number,
): Promise<Response> => {
  const signal = joinSignals(
    options?.signal,
    timeoutMs != null ? AbortSignal.timeout(timeoutMs) : undefined,
  );
  const res = await fetch(`${provider.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nativeChatBody(model, messages, options, stream)),
    cache: "no-store",
    redirect: "manual",
    ...(signal ? { signal } : {}),
  });
  if (!res.ok || (stream && !res.body)) {
    const text = await res.text().catch(() => "");
    throw new Error(formatOllamaError(text, res.status, model));
  }
  return res;
};

export const streamOllamaChat = async (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<Response> => postNativeChat(provider, model, messages, options, true);

export const completeOllamaChat = async (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<string> => {
  const completion = await completeOllamaToolChat(
    provider,
    model,
    messages,
    options,
  );
  return completion.content;
};

export const completeOllamaToolChat = async (
  provider: LlmProviderConfig,
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions & { timeoutMs?: number },
): Promise<LlmCompletion> => {
  const hasAudio = messagesHaveAudio(messages);
  const timeoutMs = options?.timeoutMs ?? (hasAudio ? 60_000 : 8000);
  const res = await postNativeChat(
    provider,
    model,
    messages,
    options,
    false,
    timeoutMs,
  );
  const data = (await res.json()) as {
    message?: {
      content?: string;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: unknown };
      }>;
    };
    error?: string;
  };
  if (data.error) throw new Error(data.error);
  return {
    content: (data.message?.content ?? "").trim(),
    toolCalls: (data.message?.tool_calls ?? []).flatMap((call, index) => {
      const name = call.function?.name?.trim();
      if (!name) return [];
      return [{
        id: call.id?.trim() || `ollama-call-${index}`,
        name,
        arguments: call.function?.arguments ?? {},
      }];
    }),
  };
};

export const pingOllama = async (
  provider: LlmProviderConfig,
): Promise<BackendHealth> => {
  const baseUrl = provider.baseUrl;
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      cache: "no-store",
      redirect: "manual",
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
