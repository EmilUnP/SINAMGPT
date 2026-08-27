import {
  authenticateApiKey,
  getApiGatewaySettings,
  withApiCors,
  type ApiGatewaySettings,
  type AuthenticatedApiKey,
} from "@/lib/api-keys";
import {
  CLIENT_DISCONNECT,
  finishApiUsage,
  logRejectedApiUsage,
  markApiUsageToken,
  startApiUsage,
} from "@/lib/usage/api";
import {
  decodeImageData,
  MAX_CHAT_IMAGES,
  type IncomingImage,
} from "@/lib/attachments";
import { FEATURE_DISABLED_ERROR, isFeatureEnabled } from "@/lib/features";
import { isAllowedImageMime, type AllowedImageMime } from "@/lib/media/limits";
import { streamChat, type ChatMessage } from "@/lib/llm";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import {
  getChatRuntimeOptions,
  getEnabledModels,
  isChatModel,
  isModelEnabled,
  modelSupportsVision,
  resolveOllamaModelName,
  type PublicModel,
} from "@/lib/settings";
import {
  SSE_HEADERS,
  startSseKeepalive,
} from "@/lib/sse";

export type ApiResponseFormat = "sinam" | "openai";

export type GatewayReady = {
  ok: true;
  auth: AuthenticatedApiKey;
  settings: ApiGatewaySettings;
  ip: string;
};

type LlmChunk = {
  message?: { content?: string };
  done?: boolean;
  error?: string;
  eval_count?: number;
  prompt_eval_count?: number;
  eval_duration?: number;
};

type ConsumeResult = {
  content: string;
  tokensEval: number | null;
  tokensPrompt: number | null;
  evalDurationNs: number | null;
};

export type GatewayIncomingMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  images?: IncomingImage[];
};

export type GatewayGenerateInput = {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  hasImages: boolean;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  includeUsage?: boolean;
};

export type ApiModelCard = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  name: string;
  displayName: string;
  backend: PublicModel["backend"];
  kind: PublicModel["kind"];
  vision: boolean;
  tools: boolean;
  audio: boolean;
  tts: boolean;
  video: boolean;
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
  };
};

const errorBody = (format: ApiResponseFormat, message: string) =>
  format === "openai"
    ? { error: { message, type: "invalid_request_error" } }
    : { error: message };

export const jsonWithCors = (
  request: Request,
  body: unknown,
  status = 200,
) =>
  withApiCors(
    Response.json(body, { status }),
    request,
    getApiGatewaySettings(),
  );

export const apiV1Options = (request: Request) =>
  withApiCors(
    new Response(null, { status: 204 }),
    request,
    getApiGatewaySettings(),
  );

export const rejectGateway = (
  request: Request,
  auth: AuthenticatedApiKey,
  ip: string,
  error: string,
  status: number,
  format: ApiResponseFormat,
  extra?: { model?: string; prompt?: string },
) => {
  logRejectedApiUsage({
    apiKeyId: auth.id,
    userId: auth.userId,
    username: auth.username,
    model: extra?.model,
    prompt: extra?.prompt,
    ip,
    errorMessage: error,
  });
  return jsonWithCors(request, errorBody(format, error), status);
};

/** Auth + feature flag + gateway switch + optional per-key RPM. */
export const authenticateGateway = (
  request: Request,
  format: ApiResponseFormat,
  opts?: { rateLimit?: boolean },
): GatewayReady | { ok: false; response: Response } => {
  const settings = getApiGatewaySettings();
  const ip = clientIp(request);

  if (!isFeatureEnabled("developerApi")) {
    return {
      ok: false,
      response: jsonWithCors(
        request,
        errorBody(format, FEATURE_DISABLED_ERROR),
        403,
      ),
    };
  }

  const auth = authenticateApiKey(request);
  if (!auth) {
    return {
      ok: false,
      response: jsonWithCors(
        request,
        errorBody(format, "Invalid or missing API key"),
        401,
      ),
    };
  }

  if (!settings.enabled) {
    return {
      ok: false,
      response: rejectGateway(
        request,
        auth,
        ip,
        "API gateway is disabled",
        503,
        format,
      ),
    };
  }

  if (opts?.rateLimit !== false) {
    const burst = takeRateLimit(
      `api:${auth.id}`,
      settings.maxRequestsPerMinute,
      60 * 1000,
    );
    if (!burst.ok) {
      logRejectedApiUsage({
        apiKeyId: auth.id,
        userId: auth.userId,
        username: auth.username,
        ip,
        errorMessage: "Too many requests. Slow down.",
      });
      return {
        ok: false,
        response: withApiCors(
          Response.json(errorBody(format, "Too many requests. Slow down."), {
            status: 429,
            headers: { "Retry-After": String(burst.retryAfterSec) },
          }),
          request,
          settings,
        ),
      };
    }
  }

  return { ok: true, auth, settings, ip };
};

export const promptFromMessages = (messages: ChatMessage[]) => {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return messages.map((m) => m.content).join("\n");
  return last.content.trim() || (last.images?.length ? "[image]" : "");
};

export const toChatMessages = (
  rows: GatewayIncomingMessage[],
): { messages: ChatMessage[]; error?: string; hasImages: boolean } => {
  const messages: ChatMessage[] = [];
  let hasImages = false;
  for (const row of rows) {
    const images: string[] = [];
    for (const image of row.images ?? []) {
      const decoded = decodeImageData(image);
      if ("error" in decoded) {
        return { messages: [], error: decoded.error, hasImages: false };
      }
      images.push(decoded.buffer.toString("base64"));
    }
    if (images.length) hasImages = true;
    messages.push({
      role: row.role,
      content: row.content,
      ...(images.length ? { images } : {}),
    });
  }
  return { messages, hasImages };
};

export const parseDataImageUrl = (
  url: string,
): IncomingImage | { error: string } => {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      error:
        "Remote image URLs are not allowed. Send a data URL (data:image/jpeg;base64,...).",
    };
  }
  const match = trimmed.match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i,
  );
  if (!match) {
    return {
      error: "Image must be a data URL with JPEG, PNG, WebP, or GIF.",
    };
  }
  const mime = match[1].toLowerCase();
  if (!isAllowedImageMime(mime)) {
    return { error: "Unsupported image type. Use JPEG, PNG, WebP, or GIF." };
  }
  return { mime: mime as AllowedImageMime, data: match[2] };
};

export const resolveGatewayModel = async (
  requested?: string | null,
): Promise<string> => {
  const value = requested?.trim();
  if (value) return resolveOllamaModelName(value);
  const { defaultModel } = await getEnabledModels();
  return defaultModel;
};

export const toApiModelCard = (model: PublicModel): ApiModelCard => {
  const created = Date.parse(model.modified_at);
  const input = ["text"];
  if (model.vision) input.push("image");
  if (model.audio) input.push("audio");
  if (model.video) input.push("video");
  const output = ["text"];
  if (model.tts) output.push("audio");
  return {
    id: model.name,
    object: "model",
    created: Number.isFinite(created) ? Math.floor(created / 1000) : 0,
    owned_by: model.backend,
    name: model.display_name || model.name,
    displayName: model.display_name || model.name,
    backend: model.backend,
    kind: model.kind,
    vision: Boolean(model.vision),
    tools: Boolean(model.tools),
    audio: Boolean(model.audio),
    tts: Boolean(model.tts),
    video: Boolean(model.video),
    architecture: {
      input_modalities: input,
      output_modalities: output,
    },
  };
};

export const listGatewayModels = async () => {
  const { models, defaultModel } = await getEnabledModels();
  const data = models.map(toApiModelCard);
  return {
    object: "list" as const,
    data,
    default: defaultModel,
    defaultModel,
    models: data.map((m) => ({
      name: m.id,
      displayName: m.displayName,
      backend: m.backend,
      vision: m.vision,
      tools: m.tools,
      audio: m.audio,
      tts: m.tts,
      video: m.video,
    })),
  };
};

const isAbortError = (error: unknown) =>
  (error instanceof Error &&
    (error.name === "AbortError" || /aborted/i.test(error.message))) ||
  (typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError");

const requestPayloadFromMessages = (messages: ChatMessage[]) =>
  messages
    .map((msg) => {
      const extra = msg.images?.length
        ? `\n[${msg.images.length} attachment${msg.images.length === 1 ? "" : "s"} omitted]`
        : "";
      return `=== ${msg.role} ===${extra}\n${msg.content ?? ""}`;
    })
    .join("\n\n");

const openaiUsage = (result: {
  tokensPrompt: number | null;
  tokensEval: number | null;
}) => {
  const prompt = result.tokensPrompt ?? 0;
  const completion = result.tokensEval ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  };
};

const consumeNdjson = async (
  ollamaRes: Response,
  onPiece?: (piece: string) => void,
): Promise<ConsumeResult> => {
  const reader = ollamaRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let tokensEval: number | null = null;
  let tokensPrompt: number | null = null;
  let evalDurationNs: number | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let chunk: LlmChunk;
      try {
        chunk = JSON.parse(trimmed) as LlmChunk;
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(chunk.error);
      const piece = chunk.message?.content ?? "";
      if (piece) {
        content += piece;
        onPiece?.(piece);
      }
      if (chunk.done) {
        if (typeof chunk.eval_count === "number") tokensEval = chunk.eval_count;
        if (typeof chunk.prompt_eval_count === "number") {
          tokensPrompt = chunk.prompt_eval_count;
        }
        if (typeof chunk.eval_duration === "number") {
          evalDurationNs = chunk.eval_duration;
        }
      }
    }
  }

  return { content, tokensEval, tokensPrompt, evalDurationNs };
};

const clampRuntime = (input: GatewayGenerateInput) => {
  const runtime = getChatRuntimeOptions();
  const temperature =
    typeof input.temperature === "number" && Number.isFinite(input.temperature)
      ? Math.min(2, Math.max(0, input.temperature))
      : runtime.temperature;
  const numPredict =
    typeof input.maxTokens === "number" && Number.isFinite(input.maxTokens)
      ? Math.min(8192, Math.max(1, Math.floor(input.maxTokens)))
      : runtime.numPredict;
  const topP =
    typeof input.topP === "number" && Number.isFinite(input.topP)
      ? Math.min(1, Math.max(0.05, input.topP))
      : runtime.topP;
  return { temperature, numPredict, topP };
};

export const prepareGatewayGenerate = (
  request: Request,
  gate: GatewayReady,
  input: GatewayGenerateInput,
  format: ApiResponseFormat,
): Response | { usageId: string; runtime: ReturnType<typeof clampRuntime> } => {
  const { auth, settings, ip } = gate;
  const totalChars = input.messages.reduce(
    (sum, m) => sum + m.content.length,
    0,
  );

  if (!isModelEnabled(input.model)) {
    return rejectGateway(
      request,
      auth,
      ip,
      "This model is disabled by admin. Call GET /api/v1/models for the list your key can use.",
      403,
      format,
      { model: input.model, prompt: input.prompt },
    );
  }

  if (!isChatModel(input.model)) {
    return rejectGateway(
      request,
      auth,
      ip,
      "This endpoint only accepts chat models.",
      400,
      format,
      { model: input.model, prompt: input.prompt },
    );
  }

  if (input.hasImages && !modelSupportsVision(input.model)) {
    return rejectGateway(
      request,
      auth,
      ip,
      "This model does not support images. Choose a vision model from GET /api/v1/models.",
      400,
      format,
      { model: input.model, prompt: input.prompt },
    );
  }

  if (totalChars > settings.maxChars) {
    return rejectGateway(
      request,
      auth,
      ip,
      `Prompt is limited to ${settings.maxChars} characters.`,
      400,
      format,
      { model: input.model, prompt: input.prompt },
    );
  }

  const imageCount = input.messages.reduce(
    (sum, m) => sum + (m.images?.length ?? 0),
    0,
  );
  if (imageCount > MAX_CHAT_IMAGES) {
    return rejectGateway(
      request,
      auth,
      ip,
      `At most ${MAX_CHAT_IMAGES} images per request.`,
      400,
      format,
      { model: input.model, prompt: input.prompt },
    );
  }

  return {
    usageId: startApiUsage({
      apiKeyId: auth.id,
      userId: auth.userId,
      username: auth.username,
      model: input.model,
      prompt: input.prompt,
      ip,
      requestPayload: requestPayloadFromMessages(input.messages),
    }),
    runtime: clampRuntime(input),
  };
};

export const runGatewayGenerate = async (
  request: Request,
  gate: GatewayReady,
  input: GatewayGenerateInput,
  format: ApiResponseFormat,
): Promise<Response> => {
  const prepared = prepareGatewayGenerate(request, gate, input, format);
  if (prepared instanceof Response) return prepared;

  const { usageId, runtime } = prepared;
  const { settings } = gate;
  const created = Math.floor(Date.now() / 1000);
  const completionId = `chatcmpl-${usageId}`;

  if (!input.stream) {
    let ollamaRes: Response;
    try {
      ollamaRes = await streamChat(input.model, input.messages, {
        temperature: runtime.temperature,
        numPredict: runtime.numPredict,
        topP: runtime.topP,
        signal: request.signal,
      });
    } catch (error) {
      const aborted = request.signal.aborted || isAbortError(error);
      const message = aborted
        ? CLIENT_DISCONNECT
        : error instanceof Error
          ? error.message
          : "LLM request failed";
      finishApiUsage(usageId, {
        responseChars: 0,
        status: aborted ? "aborted" : "error",
        errorMessage: message,
      });
      return jsonWithCors(request, errorBody(format, message), aborted ? 499 : 502);
    }

    try {
      const result = await consumeNdjson(ollamaRes, (piece) => {
        markApiUsageToken(usageId, piece.length, piece);
      });
      finishApiUsage(usageId, {
        responseChars: result.content.length,
        status: "ok",
        tokensEval: result.tokensEval,
        tokensPrompt: result.tokensPrompt,
        evalDurationNs: result.evalDurationNs,
      });
      if (format === "openai") {
        return withApiCors(
          Response.json({
            id: completionId,
            object: "chat.completion",
            created,
            model: input.model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: result.content },
                finish_reason: "stop",
              },
            ],
            usage: openaiUsage(result),
          }),
          request,
          settings,
        );
      }
      return withApiCors(
        Response.json({
          id: usageId,
          model: input.model,
          content: result.content,
          usage: {
            promptChars: input.prompt.length,
            responseChars: result.content.length,
            tokensEval: result.tokensEval,
            tokensPrompt: result.tokensPrompt,
          },
        }),
        request,
        settings,
      );
    } catch (error) {
      const aborted = request.signal.aborted || isAbortError(error);
      const message = aborted
        ? CLIENT_DISCONNECT
        : error instanceof Error
          ? error.message
          : "Generation failed";
      finishApiUsage(usageId, {
        responseChars: 0,
        status: aborted ? "aborted" : "error",
        errorMessage: message,
      });
      return jsonWithCors(request, errorBody(format, message), aborted ? 499 : 502);
    }
  }

  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  if (request.signal.aborted) abort.abort();
  else request.signal.addEventListener("abort", onClientAbort, { once: true });

  const encoder = new TextEncoder();
  let buffer = "";
  let responseChars = 0;
  let tokensEval: number | null = null;
  let tokensPrompt: number | null = null;
  let evalDurationNs: number | null = null;
  let ollamaReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let sentRole = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendSinam = (type: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${type}\ndata: ${JSON.stringify({ type, ...((data as object) || {}) })}\n\n`,
          ),
        );
      };
      const sendOpenAi = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      if (format === "openai") {
        sendOpenAi({
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: input.model,
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "" },
              finish_reason: null,
            },
          ],
        });
        sentRole = true;
      } else {
        sendSinam("meta", { id: usageId, model: input.model });
      }

      const stopKeepalive = startSseKeepalive(controller, encoder);
      const decoder = new TextDecoder();

      try {
        const ollamaRes = await streamChat(input.model, input.messages, {
          temperature: runtime.temperature,
          numPredict: runtime.numPredict,
          topP: runtime.topP,
          signal: abort.signal,
        });
        ollamaReader = ollamaRes.body!.getReader();

        while (true) {
          const { done, value } = await ollamaReader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let chunk: LlmChunk;
            try {
              chunk = JSON.parse(trimmed) as LlmChunk;
            } catch {
              continue;
            }
            if (chunk.error) throw new Error(chunk.error);
            const piece = chunk.message?.content ?? "";
            if (piece) {
              responseChars += piece.length;
              markApiUsageToken(usageId, piece.length, piece);
              if (format === "openai") {
                sendOpenAi({
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model: input.model,
                  choices: [
                    {
                      index: 0,
                      delta: sentRole ? { content: piece } : { role: "assistant", content: piece },
                      finish_reason: null,
                    },
                  ],
                });
                sentRole = true;
              } else {
                sendSinam("token", { content: piece });
              }
            }
            if (chunk.done) {
              if (typeof chunk.eval_count === "number") {
                tokensEval = chunk.eval_count;
              }
              if (typeof chunk.prompt_eval_count === "number") {
                tokensPrompt = chunk.prompt_eval_count;
              }
              if (typeof chunk.eval_duration === "number") {
                evalDurationNs = chunk.eval_duration;
              }
            }
          }
        }

        finishApiUsage(usageId, {
          responseChars,
          status: "ok",
          tokensEval,
          tokensPrompt,
          evalDurationNs,
        });
        if (format === "openai") {
          sendOpenAi({
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: input.model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            ...(input.includeUsage
              ? {
                  usage: openaiUsage({ tokensPrompt, tokensEval }),
                }
              : {}),
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } else {
          sendSinam("done", {
            id: usageId,
            model: input.model,
            usage: {
              responseChars,
              tokensEval,
              tokensPrompt,
            },
          });
        }
        controller.close();
      } catch (error) {
        const aborted = abort.signal.aborted || isAbortError(error);
        const message = aborted
          ? CLIENT_DISCONNECT
          : error instanceof Error
            ? error.message
            : "Stream failed";
        finishApiUsage(usageId, {
          responseChars,
          status: aborted ? "aborted" : "error",
          errorMessage: message,
          tokensEval,
          tokensPrompt,
          evalDurationNs,
        });
        if (aborted) return;
        if (format === "openai") {
          sendOpenAi({
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: input.model,
            choices: [],
            error: { message, type: "api_error" },
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } else {
          sendSinam("error", { error: message });
        }
        controller.close();
      } finally {
        stopKeepalive();
        request.signal.removeEventListener("abort", onClientAbort);
      }
    },
    cancel() {
      abort.abort();
      ollamaReader?.cancel().catch(() => undefined);
      finishApiUsage(usageId, {
        responseChars,
        status: "aborted",
        errorMessage: CLIENT_DISCONNECT,
        tokensEval,
        tokensPrompt,
        evalDurationNs,
      });
    },
  });

  return withApiCors(
    new Response(stream, { headers: SSE_HEADERS }),
    request,
    settings,
  );
};
