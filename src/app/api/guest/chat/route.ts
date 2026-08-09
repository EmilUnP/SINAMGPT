import { z } from "zod";
import {
  consumeGuestMessage,
  getGuestMaxChars,
  getGuestUsage,
} from "@/lib/guest";
import {
  checkInputGuardrails,
  withSystemPrompt,
} from "@/lib/guardrails";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import {
  getChatRuntimeOptions,
  getGuestEnabledSetting,
  getGuestHistoryLimitSetting,
  isModelEnabled,
  resolveOllamaModelName,
} from "@/lib/settings";
import {
  finishUsage,
  markUsageToken,
  startUsage,
} from "@/lib/usage";

const schema = z.object({
  message: z.string().trim().min(1),
  model: z.string().trim().min(1).max(120),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(8000),
      }),
    )
    .max(40)
    .optional()
    .default([]),
});

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
    const { message, model: requestedModel, history } = parsed.data;
    const model = resolveOllamaModelName(requestedModel);

    if (!isModelEnabled(model)) {
      return Response.json(
        { error: "This model is disabled by admin. Choose another model." },
        { status: 403 },
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

    const guard = checkInputGuardrails(message, "guest");
    if (guard.blocked) {
      return Response.json(
        {
          error: guard.refusal,
          blocked: true,
          reason: guard.reason,
        },
        { status: 422 },
      );
    }

    const usageBefore = await getGuestUsage();
    if (usageBefore.remaining <= 0) {
      return Response.json(
        {
          error: `Guest limit reached (${usageBefore.limit}/day). Sign in to continue with saved history.`,
          usage: usageBefore,
        },
        { status: 429 },
      );
    }

    const consumed = await consumeGuestMessage();
    if (!consumed.ok) {
      return Response.json(
        {
          error: `Guest limit reached (${consumed.limit}/day). Sign in to continue.`,
          usage: consumed,
        },
        { status: 429 },
      );
    }

    const prior =
      historyLimit > 0 ? history.slice(-historyLimit) : [];
    const prepared = withSystemPrompt(
      [...prior, { role: "user" as const, content: message }],
      "guest",
    );
    const messages: ChatMessage[] = prepared.messages;
    const knowledgeSources = prepared.sources;

    const usageId = startUsage({
      source: "guest",
      username: "guest",
      userId: null,
      model,
      prompt: message,
    });

    const runtime = getChatRuntimeOptions();
    let ollamaRes: Response;
    try {
      ollamaRes = await streamChat(model, messages, {
        temperature: runtime.temperature,
        numPredict: runtime.numPredict,
        topP: runtime.topP,
      });
    } catch (error) {
      finishUsage(usageId, {
        responseChars: 0,
        status: "error",
        errorMessage:
          error instanceof Error ? error.message : "LLM request failed",
      });
      throw error;
    }
    const reader = ollamaRes.body!.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    let responseChars = 0;
    let tokensEval: number | null = null;
    let tokensPrompt: number | null = null;
    let evalDurationNs: number | null = null;

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

        try {
          while (true) {
            const { done, value } = await reader.read();
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
                markUsageToken(usageId, piece.length);
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
        }
      },
      cancel() {
        finishUsage(usageId, {
          responseChars,
          status: "aborted",
          tokensEval,
          tokensPrompt,
          evalDurationNs,
        });
        reader.cancel().catch(() => undefined);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("guest chat error", error);
    const message =
      error instanceof Error ? error.message : "Guest chat failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
