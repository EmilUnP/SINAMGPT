import { z } from "zod";
import { getCurrentUser, markActive, newId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  checkInputGuardrails,
  withSystemPrompt,
} from "@/lib/guardrails";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import { assertAssignableProject } from "@/lib/projects";
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

const schema = z
  .object({
    conversationId: z.string().min(1).optional(),
    message: z.string().trim().min(1).max(32000).optional(),
    model: z.string().trim().min(1).max(120),
    projectId: z.string().trim().min(1).max(64).nullable().optional(),
    mode: z
      .enum(["send", "regenerate", "edit", "rewrite"])
      .default("send"),
    editMessageId: z.string().min(1).optional(),
    rewrite: z.enum(["shorter", "formal", "continue"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "send" && !data.message) {
      ctx.addIssue({
        code: "custom",
        message: "Message is required",
        path: ["message"],
      });
    }
    if (data.mode === "edit" && !data.message) {
      ctx.addIssue({
        code: "custom",
        message: "Edited message is required",
        path: ["message"],
      });
    }
    if (data.mode === "edit" && !data.editMessageId) {
      ctx.addIssue({
        code: "custom",
        message: "editMessageId is required",
        path: ["editMessageId"],
      });
    }
    if (data.mode === "rewrite" && !data.rewrite) {
      ctx.addIssue({
        code: "custom",
        message: "rewrite style is required",
        path: ["rewrite"],
      });
    }
    if (
      (data.mode === "regenerate" ||
        data.mode === "edit" ||
        data.mode === "rewrite") &&
      !data.conversationId
    ) {
      ctx.addIssue({
        code: "custom",
        message: "conversationId is required",
        path: ["conversationId"],
      });
    }
  });

const REWRITE_PROMPTS = {
  shorter:
    "Rewrite your previous answer to be shorter and tighter. Keep the same meaning and key facts. Do not add a preface — return only the rewritten answer.",
  formal:
    "Rewrite your previous answer in a more formal, professional tone suitable for internal company use. Keep the same meaning and key facts. Do not add a preface — return only the rewritten answer.",
  continue:
    "Continue your previous answer with useful additional detail. Return the complete answer: keep what you already said, then add the continuation. Do not add a preface like “Sure” — return only the full answer.",
} as const;

const CONVERSATION_SELECT =
  "id, user_id, title, model, project_id, is_pinned, created_at, updated_at";

const titleFromMessage = (text: string): string => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
};

type DbMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

const streamAssistantReply = (input: {
  userId: string;
  username: string;
  conversationId: string;
  conversation: Conversation;
  model: string;
  promptText: string;
  userMessage: Message;
  history: ChatMessage[];
}) => {
  const {
    userId,
    username,
    conversationId,
    conversation,
    model,
    promptText,
    userMessage,
    history,
  } = input;

  const db = getDb();
  const usageId = startUsage({
    source: "user",
    username,
    userId,
    model,
    prompt: promptText,
  });

  const historyLimit = getUserHistoryLimitSetting();
  const contextHistory =
    historyLimit > 0 ? history.slice(-historyLimit) : history;
  const prepared = withSystemPrompt(
    contextHistory,
    "user",
    conversation.project_id,
  );
  const promptedHistory = prepared.messages;
  const knowledgeSources = prepared.sources;
  const runtime = getChatRuntimeOptions();

  const startStream = async () => {
    try {
      return await streamChat(model, promptedHistory, {
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
        conversationId,
      });
      throw error;
    }
  };

  return startStream().then((ollamaRes) => {
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
          userMessage,
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
          const sourcesJson =
            knowledgeSources.length > 0
              ? JSON.stringify(knowledgeSources)
              : null;
          db.prepare(
            `INSERT INTO messages (id, conversation_id, role, content, sources)
             VALUES (?, ?, 'assistant', ?, ?)`,
          ).run(
            assistantMessageId,
            conversationId,
            assistantText,
            sourcesJson,
          );

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
              sources: knowledgeSources.length ? knowledgeSources : null,
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
  });
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

    const mode = parsed.data.mode;
    const model = resolveOllamaModelName(parsed.data.model);
    const maxChars = getUserMaxCharsSetting();
    const db = getDb();

    if (!isModelEnabled(model)) {
      return Response.json(
        { error: "This model is disabled by admin. Choose another model." },
        { status: 403 },
      );
    }

    // ——— Rewrite last assistant reply (shorter / formal / continue) ———
    if (mode === "rewrite") {
      const conversationId = parsed.data.conversationId!;
      const style = parsed.data.rewrite!;
      const owned = db
        .prepare(
          `SELECT ${CONVERSATION_SELECT}
           FROM conversations WHERE id = ? AND user_id = ?`,
        )
        .get(conversationId, user.id) as Conversation | undefined;

      if (!owned) {
        return Response.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      }

      const rows = db
        .prepare(
          `SELECT id, role, content, created_at FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at ASC`,
        )
        .all(conversationId) as DbMessage[];

      let lastAssistantIdx = -1;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (rows[i].role === "assistant" && rows[i].content.trim()) {
          lastAssistantIdx = i;
          break;
        }
      }
      if (lastAssistantIdx < 0) {
        return Response.json(
          { error: "Nothing to rewrite" },
          { status: 400 },
        );
      }

      let lastUserIdx = -1;
      for (let i = lastAssistantIdx - 1; i >= 0; i -= 1) {
        if (rows[i].role === "user") {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx < 0) {
        return Response.json(
          { error: "Nothing to rewrite" },
          { status: 400 },
        );
      }

      const lastUser = rows[lastUserIdx];
      const lastAssistant = rows[lastAssistantIdx];

      // Drop the assistant reply (and anything after it)
      const toDelete = rows.slice(lastAssistantIdx);
      if (toDelete.length) {
        const del = db.prepare(`DELETE FROM messages WHERE id = ?`);
        const tx = db.transaction(() => {
          for (const row of toDelete) del.run(row.id);
        });
        tx();
      }

      db.prepare(
        `UPDATE conversations
         SET model = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(model, conversationId);

      const conversation = db
        .prepare(
          `SELECT ${CONVERSATION_SELECT} FROM conversations WHERE id = ?`,
        )
        .get(conversationId) as Conversation;

      const history: ChatMessage[] = [
        ...rows.slice(0, lastAssistantIdx).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "assistant", content: lastAssistant.content },
        { role: "user", content: REWRITE_PROMPTS[style] },
      ];

      const userMessage: Message = {
        id: lastUser.id,
        conversation_id: conversationId,
        role: "user",
        content: lastUser.content,
        created_at: lastUser.created_at,
      };

      return streamAssistantReply({
        userId: user.id,
        username: user.username,
        conversationId,
        conversation,
        model,
        promptText: `[rewrite:${style}] ${lastUser.content}`,
        userMessage,
        history,
      });
    }

    // ——— Regenerate last assistant reply ———
    if (mode === "regenerate") {
      const conversationId = parsed.data.conversationId!;
      const owned = db
        .prepare(
          `SELECT ${CONVERSATION_SELECT}
           FROM conversations WHERE id = ? AND user_id = ?`,
        )
        .get(conversationId, user.id) as Conversation | undefined;

      if (!owned) {
        return Response.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      }

      const rows = db
        .prepare(
          `SELECT id, role, content, created_at FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at ASC`,
        )
        .all(conversationId) as DbMessage[];

      let lastUserIdx = -1;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (rows[i].role === "user") {
          lastUserIdx = i;
          break;
        }
      }

      if (lastUserIdx < 0) {
        return Response.json(
          { error: "Nothing to regenerate" },
          { status: 400 },
        );
      }

      const lastUser = rows[lastUserIdx];
      const guard = checkInputGuardrails(lastUser.content, "user", {
        username: user.username,
        userId: user.id,
        projectId: owned.project_id,
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

      // Drop trailing assistant (and anything after last user)
      const toDelete = rows.slice(lastUserIdx + 1);
      if (toDelete.length) {
        const del = db.prepare(`DELETE FROM messages WHERE id = ?`);
        const tx = db.transaction(() => {
          for (const row of toDelete) del.run(row.id);
        });
        tx();
      }

      db.prepare(
        `UPDATE conversations
         SET model = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(model, conversationId);

      const conversation = db
        .prepare(
          `SELECT ${CONVERSATION_SELECT} FROM conversations WHERE id = ?`,
        )
        .get(conversationId) as Conversation;

      const history = rows
        .slice(0, lastUserIdx + 1)
        .map((m) => ({ role: m.role, content: m.content })) as ChatMessage[];

      const userMessage: Message = {
        id: lastUser.id,
        conversation_id: conversationId,
        role: "user",
        content: lastUser.content,
        created_at: lastUser.created_at,
      };

      return streamAssistantReply({
        userId: user.id,
        username: user.username,
        conversationId,
        conversation,
        model,
        promptText: lastUser.content,
        userMessage,
        history,
      });
    }

    // ——— Edit a user message and regenerate from there ———
    if (mode === "edit") {
      const conversationId = parsed.data.conversationId!;
      const editMessageId = parsed.data.editMessageId!;
      const message = parsed.data.message!;

      if (message.length > maxChars) {
        return Response.json(
          { error: `Messages are limited to ${maxChars} characters.` },
          { status: 400 },
        );
      }

      const owned = db
        .prepare(
          `SELECT ${CONVERSATION_SELECT}
           FROM conversations WHERE id = ? AND user_id = ?`,
        )
        .get(conversationId, user.id) as Conversation | undefined;

      const guard = checkInputGuardrails(message, "user", {
        username: user.username,
        userId: user.id,
        projectId: owned?.project_id,
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

      if (!owned) {
        return Response.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      }

      const rows = db
        .prepare(
          `SELECT id, role, content, created_at FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at ASC`,
        )
        .all(conversationId) as DbMessage[];

      const editIdx = rows.findIndex((m) => m.id === editMessageId);
      if (editIdx < 0 || rows[editIdx].role !== "user") {
        return Response.json(
          { error: "User message not found" },
          { status: 404 },
        );
      }

      // Only allow editing the latest user turn (simplest + safest UX)
      let lastUserIdx = -1;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (rows[i].role === "user") {
          lastUserIdx = i;
          break;
        }
      }
      if (editIdx !== lastUserIdx) {
        return Response.json(
          { error: "Only the latest user message can be edited" },
          { status: 400 },
        );
      }

      db.prepare(`UPDATE messages SET content = ? WHERE id = ?`).run(
        message,
        editMessageId,
      );

      const toDelete = rows.slice(editIdx + 1);
      if (toDelete.length) {
        const del = db.prepare(`DELETE FROM messages WHERE id = ?`);
        const tx = db.transaction(() => {
          for (const row of toDelete) del.run(row.id);
        });
        tx();
      }

      const userCount = rows
        .slice(0, editIdx + 1)
        .filter((m) => m.role === "user").length;
      if (userCount === 1) {
        db.prepare(
          `UPDATE conversations
           SET title = ?, model = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).run(titleFromMessage(message), model, conversationId);
      } else {
        db.prepare(
          `UPDATE conversations
           SET model = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).run(model, conversationId);
      }

      const conversation = db
        .prepare(
          `SELECT ${CONVERSATION_SELECT} FROM conversations WHERE id = ?`,
        )
        .get(conversationId) as Conversation;

      const history = [
        ...rows.slice(0, editIdx).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: message },
      ] as ChatMessage[];

      const userMessage: Message = {
        id: editMessageId,
        conversation_id: conversationId,
        role: "user",
        content: message,
        created_at: rows[editIdx].created_at,
      };

      return streamAssistantReply({
        userId: user.id,
        username: user.username,
        conversationId,
        conversation,
        model,
        promptText: message,
        userMessage,
        history,
      });
    }

    // ——— Normal send ———
    const message = parsed.data.message!;

    if (message.length > maxChars) {
      return Response.json(
        { error: `Messages are limited to ${maxChars} characters.` },
        { status: 400 },
      );
    }

    let conversationId = parsed.data.conversationId;
    let projectIdForGuard: string | null = parsed.data.projectId ?? null;

    if (conversationId) {
      const owned = db
        .prepare(
          `SELECT id, project_id FROM conversations WHERE id = ? AND user_id = ?`,
        )
        .get(conversationId, user.id) as
        | { id: string; project_id: string | null }
        | undefined;

      if (!owned) {
        return Response.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      }
      projectIdForGuard = owned.project_id;

      db.prepare(
        `UPDATE conversations
         SET model = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(model, conversationId);
    }

    const guard = checkInputGuardrails(message, "user", {
      username: user.username,
      userId: user.id,
      projectId: projectIdForGuard,
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

    if (!conversationId) {
      conversationId = newId();
      const projectCheck = assertAssignableProject(
        parsed.data.projectId,
        user.id,
        user.role,
      );
      if (!projectCheck.ok) {
        return Response.json({ error: projectCheck.error }, { status: 403 });
      }
      db.prepare(
        `INSERT INTO conversations (id, user_id, title, model, project_id)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        conversationId,
        user.id,
        titleFromMessage(message),
        model,
        projectCheck.projectId,
      );
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

    let conversation = db
      .prepare(
        `SELECT ${CONVERSATION_SELECT} FROM conversations WHERE id = ?`,
      )
      .get(conversationId) as Conversation;

    const isFirstExchange =
      history.filter((m) => m.role === "user").length === 1;

    if (isFirstExchange && conversation.title === "New chat") {
      const title = titleFromMessage(message);
      db.prepare(
        `UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(title, conversationId);
      conversation = {
        ...conversation,
        title,
      };
    }

    const userMessage: Message = {
      id: userMessageId,
      conversation_id: conversationId,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    };

    return streamAssistantReply({
      userId: user.id,
      username: user.username,
      conversationId,
      conversation,
      model,
      promptText: message,
      userMessage,
      history,
    });
  } catch (error) {
    console.error("chat error", error);
    const message =
      error instanceof Error ? error.message : "Chat request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
