import { z } from "zod";
import {
  decodeImageData,
  MAX_GUEST_IMAGES,
} from "@/lib/attachments";
import {
  consumeGuestMessage,
  getGuestMaxChars,
  getGuestUsage,
  refundGuestMessage,
} from "@/lib/guest";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import {
  checkInputGuardrails,
  withSystemPrompt,
} from "@/lib/guardrails";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import {
  SSE_HEADERS,
  startSseKeepalive,
} from "@/lib/sse";
import {
  FEATURE_DISABLED_ERROR,
  isChatImagesEnabled,
} from "@/lib/features";
import {
  getChatRuntimeOptions,
  getGuestEnabledSetting,
  getGuestHistoryLimitSetting,
  isModelEnabled,
  modelSupportsVision,
  resolveOllamaModelName,
} from "@/lib/settings";
import {
  attachUsageRequest,
  finishUsage,
  markUsageToken,
  startUsage,
} from "@/lib/usage";

const imageSchema = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  data: z.string().min(32).max(16_000_000),
  name: z.string().trim().max(200).optional(),
});

const schema = z
  .object({
    message: z.string().max(20000).optional(),
    images: z.array(imageSchema).max(MAX_GUEST_IMAGES).optional(),
    model: z.string().trim().min(1).max(120),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(8000).optional().default(""),
          images: z.array(imageSchema).max(MAX_GUEST_IMAGES).optional(),
        }),
      )
      .max(40)
      .optional()
      .default([]),
    locale: z.enum(["en", "az", "ru"]).optional(),
  })
  .superRefine((data, ctx) => {
    const text = data.message?.trim() ?? "";
    if (!text && !(data.images?.length ?? 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Message is required",
        path: ["message"],
      });
    }
  });

const imagesToBase64 = (
  images: z.infer<typeof imageSchema>[] | undefined,
): { images: string[]; error?: string } => {
  if (!images?.length) return { images: [] };
  const out: string[] = [];
  for (const image of images) {
    const decoded = decodeImageData(image);
    if ("error" in decoded) return { images: [], error: decoded.error };
    out.push(decoded.buffer.toString("base64"));
  }
  return { images: out };
};

// Numeric literal required; Next.js cannot analyze imported constants.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    if (!getGuestEnabledSetting()) {
      return Response.json(
        {
          error:
            "Guest try-chat is currently disabled. Sign in to use SINAMGPT.",
        },
        { status: 403 },
      );
    }

    const ip = clientIp(request);
    const burst = takeRateLimit(`guest:chat:${ip}`, 20, 60 * 1000);
    if (!burst.ok) {
      return Response.json(
        { error: "Too many guest requests. Slow down or sign in." },
        {
          status: 429,
          headers: { "Retry-After": String(burst.retryAfterSec) },
        },
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const maxChars = getGuestMaxChars();
    const historyLimit = getGuestHistoryLimitSetting();
    const { model: requestedModel, history } = parsed.data;
    const message = (parsed.data.message ?? "").trim();
    const model = resolveOllamaModelName(requestedModel);
    const incomingImages = parsed.data.images ?? [];

    if (!isModelEnabled(model)) {
      return Response.json(
        { error: "This model is disabled by admin. Choose another model." },
        { status: 403 },
      );
    }

    if (incomingImages.length && !isChatImagesEnabled()) {
      return Response.json({ error: FEATURE_DISABLED_ERROR }, { status: 403 });
    }

    if (incomingImages.length && !modelSupportsVision(model)) {
      return Response.json(
        {
          error:
            "This model does not support images. Choose a vision model.",
        },
        { status: 400 },
      );
    }

    if (message.length > maxChars) {
      return Response.json(
        {
          error: `Guest messages are limited to ${maxChars} characters. Sign in for longer chats.`,
        },
        { status: 400 },
      );
    }

    const currentImages = imagesToBase64(incomingImages);
    if (currentImages.error) {
      return Response.json({ error: currentImages.error }, { status: 400 });
    }

    const priorTurns: ChatMessage[] = [];
    for (const turn of historyLimit > 0 ? history.slice(-historyLimit) : history) {
      const content = turn.content.trim();
      if (turn.role === "assistant") {
        if (!content) continue;
        priorTurns.push({ role: "assistant", content });
        continue;
      }
      const decoded = imagesToBase64(turn.images);
      if (decoded.error) {
        return Response.json({ error: decoded.error }, { status: 400 });
      }
      if (!content && !decoded.images.length) continue;
      priorTurns.push({
        role: "user",
        content,
        ...(decoded.images.length ? { images: decoded.images } : {}),
      });
    }

    const guard = await checkInputGuardrails(message, "guest", {
      username: "guest",
      model,
    });
    if (guard.blocked) {
      return Response.json(
        {
          error: guard.refusal,
          blocked: true,
          reason: guard.reason,
          inspection: guard.inspection,
        },
        { status: 422 },
      );
    }

    const usageBefore = await getGuestUsage(ip);
    if (usageBefore.remaining <= 0) {
      return Response.json(
        {
          error: `Guest limit reached (${usageBefore.limit}/day). Sign in to continue with saved history.`,
          usage: usageBefore,
        },
        { status: 429 },
      );
    }

    const consumed = await consumeGuestMessage(ip);
    if (!consumed.ok) {
      return Response.json(
        {
          error: `Guest limit reached (${consumed.limit}/day). Sign in to continue.`,
          usage: consumed,
        },
        { status: 429 },
      );
    }

    const prior = priorTurns;
    const prepared = await withSystemPrompt(
      [
        ...prior,
        {
          role: "user" as const,
          content: message,
          ...(currentImages.images.length
            ? { images: currentImages.images }
            : {}),
        },
      ],
      "guest",
      null,
      { model, uiLocale: parsed.data.locale },
    );
    const messages: ChatMessage[] = prepared.messages;
    const knowledgeSources = prepared.sources;

    const usageId = startUsage({
      source: "guest",
      username: "guest",
      userId: null,
      model,
      prompt: message || "[image]",
    });
    attachUsageRequest(usageId, messages);

    const runtime = getChatRuntimeOptions();
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
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        send("meta", {
          usage: consumed,
          guest: true,
          sources: knowledgeSources,
        });

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

              let chunk: {
                message?: { content?: string };
                done?: boolean;
                error?: string;
                eval_count?: number;
                prompt_eval_count?: number;
                eval_duration?: number;
              };

              try {
                chunk = JSON.parse(trimmed);
              } catch {
                continue;
              }

              if (chunk.error) throw new Error(chunk.error);

              const piece = chunk.message?.content ?? "";
              if (piece) {
                responseChars += piece.length;
                markUsageToken(usageId, piece);
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

          finishUsage(usageId, {
            responseChars,
            status: "ok",
            tokensEval,
            tokensPrompt,
            evalDurationNs,
          });

          send("done", {
            usage: consumed,
            sources: knowledgeSources.length ? knowledgeSources : null,
          });
          controller.close();
        } catch (error) {
          if (abort.signal.aborted) return;
          await refundGuestMessage(ip);
          const errMsg =
            error instanceof Error ? error.message : "Stream failed";
          finishUsage(usageId, {
            responseChars,
            status: "error",
            errorMessage: errMsg,
            tokensEval,
            tokensPrompt,
            evalDurationNs,
          });
          send("error", { error: errMsg });
          controller.close();
        } finally {
          stopKeepalive();
          request.signal.removeEventListener("abort", onClientAbort);
        }
      },
      cancel() {
        abort.abort();
        ollamaReader?.cancel().catch(() => undefined);
        finishUsage(usageId, {
          responseChars,
          status: "aborted",
          tokensEval,
          tokensPrompt,
          evalDurationNs,
        });
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    console.error("guest chat error", error);
    const message =
      error instanceof Error ? error.message : "Guest chat failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
