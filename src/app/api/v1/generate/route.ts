import { z } from "zod";
import {
  authenticateApiKey,
  getApiGatewaySettings,
  withApiCors,
  type AuthenticatedApiKey,
} from "@/lib/api-keys";
import {
  finishApiUsage,
  logRejectedApiUsage,
  markApiUsageToken,
  startApiUsage,
} from "@/lib/api-usage";
import { decodeImageData, MAX_CHAT_IMAGES } from "@/lib/attachments";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import {
  CHAT_MAX_DURATION_SEC,
  SSE_HEADERS,
  startSseKeepalive,
} from "@/lib/sse";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import { FEATURE_DISABLED_ERROR, isFeatureEnabled } from "@/lib/features";
import {
  getChatRuntimeOptions,
  isModelEnabled,
  modelSupportsVision,
  resolveOllamaModelName,
} from "@/lib/settings";

const imageSchema = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  data: z.string().min(32).max(16_000_000),
  name: z.string().trim().max(200).optional(),
});

const schema = z
  .object({
    model: z.string().trim().min(1).max(120),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string().max(32000).optional().default(""),
          images: z.array(imageSchema).max(MAX_CHAT_IMAGES).optional(),
        }),
      )
      .min(1)
      .max(40),
    stream: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    const hasPayload = data.messages.some(
      (m) => m.content.trim() || (m.images?.length ?? 0) > 0,
    );
    if (!hasPayload) {
      ctx.addIssue({
        code: "custom",
        message: "At least one message with text or images is required",
        path: ["messages"],
      });
    }
  });

type LlmChunk = {
  message?: { content?: string };
  done?: boolean;
  error?: string;
  eval_count?: number;
  prompt_eval_count?: number;
  eval_duration?: number;
};

const promptFromMessages = (messages: ChatMessage[]) => {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return messages.map((m) => m.content).join("\n");
  return last.content.trim() || (last.images?.length ? "[image]" : "");
};

const toChatMessages = (
  rows: z.infer<typeof schema>["messages"],
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

const jsonWithCors = (
  request: Request,
  body: unknown,
  status = 200,
) =>
  withApiCors(
    Response.json(body, { status }),
    request,
    getApiGatewaySettings(),
  );

const reject = (
  request: Request,
  auth: AuthenticatedApiKey,
  ip: string,
  error: string,
  status: number,
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
  return jsonWithCors(request, { error }, status);
};

const consumeNdjson = async (
  ollamaRes: Response,
  onPiece?: (piece: string) => void,
): Promise<{
  content: string;
  tokensEval: number | null;
  tokensPrompt: number | null;
  evalDurationNs: number | null;
}> => {
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

export const maxDuration = CHAT_MAX_DURATION_SEC;

export async function OPTIONS(request: Request) {
  return withApiCors(
    new Response(null, { status: 204 }),
    request,
    getApiGatewaySettings(),
  );
}

export async function POST(request: Request) {
  const settings = getApiGatewaySettings();
  const ip = clientIp(request);

  if (!isFeatureEnabled("developerApi")) {
    return jsonWithCors(request, { error: FEATURE_DISABLED_ERROR }, 403);
  }

  const auth = authenticateApiKey(request);
  if (!auth) {
    return jsonWithCors(request, { error: "Invalid or missing API key" }, 401);
  }

  if (!settings.enabled) {
    return reject(request, auth, ip, "API gateway is disabled", 503);
  }

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
    return withApiCors(
      Response.json(
        { error: "Too many requests. Slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(burst.retryAfterSec) },
        },
      ),
      request,
      settings,
    );
  }

  let parsedBody: z.infer<typeof schema>;
  try {
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return reject(
        request,
        auth,
        ip,
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
      );
    }
    parsedBody = parsed.data;
  } catch {
    return reject(request, auth, ip, "Invalid JSON body", 400);
  }

  const model = resolveOllamaModelName(parsedBody.model);
  const converted = toChatMessages(parsedBody.messages);
  if (converted.error) {
    return reject(request, auth, ip, converted.error, 400);
  }
  const messages = converted.messages;
  const prompt = promptFromMessages(messages);
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);

  if (!isModelEnabled(model)) {
    return reject(
      request,
      auth,
      ip,
      "This model is disabled by admin.",
      403,
      { model, prompt },
    );
  }

  if (converted.hasImages && !modelSupportsVision(model)) {
    return reject(
      request,
      auth,
      ip,
      "This model does not support images. Choose a vision model.",
      400,
      { model, prompt },
    );
  }

  if (totalChars > settings.maxChars) {
    return reject(
      request,
      auth,
      ip,
      `Prompt is limited to ${settings.maxChars} characters.`,
      400,
      { model, prompt },
    );
  }

  const usageId = startApiUsage({
    apiKeyId: auth.id,
    userId: auth.userId,
    username: auth.username,
    model,
    prompt,
    ip,
  });

  const runtime = getChatRuntimeOptions();

  if (!parsedBody.stream) {
    let ollamaRes: Response;
    try {
      ollamaRes = await streamChat(model, messages, {
        temperature: runtime.temperature,
        numPredict: runtime.numPredict,
        topP: runtime.topP,
        signal: request.signal,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "LLM request failed";
      finishApiUsage(usageId, {
        responseChars: 0,
        status: "error",
        errorMessage: message,
      });
      return jsonWithCors(request, { error: message }, 502);
    }

    try {
      const result = await consumeNdjson(ollamaRes, (piece) => {
        markApiUsageToken(usageId, piece.length);
      });
      finishApiUsage(usageId, {
        responseChars: result.content.length,
        status: "ok",
        tokensEval: result.tokensEval,
        tokensPrompt: result.tokensPrompt,
        evalDurationNs: result.evalDurationNs,
      });
      return withApiCors(
        Response.json({
          id: usageId,
          model,
          content: result.content,
          usage: {
            promptChars: prompt.length,
            responseChars: result.content.length,
            tokensEval: result.tokensEval,
            tokensPrompt: result.tokensPrompt,
          },
        }),
        request,
        settings,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Generation failed";
      finishApiUsage(usageId, {
        responseChars: 0,
        status: "error",
        errorMessage: message,
      });
      return jsonWithCors(request, { error: message }, 502);
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

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${type}\ndata: ${JSON.stringify({ type, ...((data as object) || {}) })}\n\n`,
          ),
        );
      };

      send("meta", { id: usageId, model });
      const stopKeepalive = startSseKeepalive(controller, encoder);
      const decoder = new TextDecoder();

      try {
        const ollamaRes = await streamChat(model, messages, {
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
              markApiUsageToken(usageId, piece.length);
              send("token", { content: piece });
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
        send("done", {
          id: usageId,
          model,
          usage: {
            responseChars,
            tokensEval,
            tokensPrompt,
          },
        });
        controller.close();
      } catch (error) {
        if (abort.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Stream failed";
        finishApiUsage(usageId, {
          responseChars,
          status: "error",
          errorMessage: message,
          tokensEval,
          tokensPrompt,
          evalDurationNs,
        });
        send("error", { error: message });
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
}
