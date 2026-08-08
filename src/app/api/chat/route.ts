import { z } from "zod";
import { getCurrentUser, markActive, newId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  checkInputGuardrails,
  withSystemPrompt,
} from "@/lib/guardrails";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import {
  getChatRuntimeOptions,
  getUserHistoryLimitSetting,
  getUserMaxCharsSetting,
  isModelEnabled,
  resolveOllamaModelName,
} from "@/lib/settings";
import {
  finishUsage,
  markUsageToken,
  startUsage,
} from "@/lib/usage";
import type { Conversation, Message } from "@/lib/types";

const schema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(32000),
  model: z.string().trim().min(1).max(120),
});

const titleFromMessage = (text: string): string => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  markActive(user.id);

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { message, model: requestedModel } = parsed.data;
    const model = resolveOllamaModelName(requestedModel);
    const maxChars = getUserMaxCharsSetting();

    if (message.length > maxChars) {
      return Response.json(
        { error: `Messages are limited to ${maxChars} characters.` },
        { status: 400 },
      );
    }

    if (!isModelEnabled(model)) {
      return Response.json(
        { error: "This model is disabled by admin. Choose another model." },
        { status: 403 },
      );
    }

    const guard = checkInputGuardrails(message, "user");
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

    const db = getDb();
    let conversationId = parsed.data.conversationId;

    if (conversationId) {
      const owned = db
        .prepare(
          `SELECT id FROM conversations WHERE id = ? AND user_id = ?`,
        )
        .get(conversationId, user.id);

      if (!owned) {
        return Response.json({ error: "Conversation not found" }, { status: 404 });
      }

      db.prepare(
        `UPDATE conversations
         SET model = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(model, conversationId);
    } else {
      conversationId = newId();
      db.prepare(
        `INSERT INTO conversations (id, user_id, title, model)
         VALUES (?, ?, ?, ?)`,
      ).run(conversationId, user.id, titleFromMessage(message), model);
    }

    const userMessageId = newId();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content)
       VALUES (?, ?, 'user', ?)`,
    ).run(userMessageId, conversationId, message);

    const history = db
      .prepare(
        `SELECT role, content FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC`,
      )
      .all(conversationId) as ChatMessage[];

    const conversation = db
      .prepare(
        `SELECT id, user_id, title, model, created_at, updated_at
         FROM conversations WHERE id = ?`,
      )
      .get(conversationId) as Conversation;

    const isFirstExchange =
      history.filter((m) => m.role === "user").length === 1;

    if (isFirstExchange && conversation.title === "New chat") {
      const title = titleFromMessage(message);
      db.prepare(
        `UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(title, conversationId);
      conversation.title = title;
    }

    const usageId = startUsage({
      source: "user",
      username: user.username,
      userId: user.id,
      model,
      prompt: message,
    });

    const historyLimit = getUserHistoryLimitSetting();
    const contextHistory =
      historyLimit > 0 ? history.slice(-historyLimit) : history;
    const promptedHistory = withSystemPrompt(contextHistory, "user");
    const runtime = getChatRuntimeOptions();

    let ollamaRes: Response;
    try {
      ollamaRes = await streamChat(model, promptedHistory, {
        temperature: runtime.temperature,
        numPredict: runtime.numPredict,
      });
    } catch (error) {
      finishUsage(usageId, {
        responseChars: 0,
        status: "error",
        errorMessage:
          error instanceof Error ? error.message : "Ollama request failed",
        conversationId,
      });
      throw error;
    }
    const reader = ollamaRes.body!.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let assistantText = "";
    let buffer = "";
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
          conversationId,
          conversation,
          userMessage: {
            id: userMessageId,
            conversation_id: conversationId,
            role: "user",
            content: message,
            created_at: new Date().toISOString(),
          } satisfies Message,
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

              if (chunk.error) {
                throw new Error(chunk.error);
              }

              const piece = chunk.message?.content ?? "";
              if (piece) {
                assistantText += piece;
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

          const assistantMessageId = newId();
          db.prepare(
            `INSERT INTO messages (id, conversation_id, role, content)
             VALUES (?, ?, 'assistant', ?)`,
          ).run(assistantMessageId, conversationId, assistantText);

          db.prepare(
            `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
          ).run(conversationId);

          finishUsage(usageId, {
            responseChars: assistantText.length,
            status: "ok",
            conversationId,
            tokensEval,
            tokensPrompt,
            evalDurationNs,
          });

          send("done", {
            assistantMessage: {
              id: assistantMessageId,
              conversation_id: conversationId,
              role: "assistant",
              content: assistantText,
              created_at: new Date().toISOString(),
            } satisfies Message,
          });

          controller.close();
        } catch (error) {
          const errMsg =
            error instanceof Error ? error.message : "Stream failed";
          finishUsage(usageId, {
            responseChars: assistantText.length,
            status: "error",
            errorMessage: errMsg,
            conversationId,
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
          responseChars: assistantText.length,
          status: "aborted",
          conversationId,
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
    console.error("chat error", error);
    const message =
      error instanceof Error ? error.message : "Chat request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
