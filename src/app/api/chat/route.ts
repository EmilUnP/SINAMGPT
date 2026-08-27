import { z } from "zod";
import { getCurrentUser, markActive, newId } from "@/lib/auth";
import {
  MAX_CHAT_IMAGES,
  parseAttachments,
  saveMessageImages,
  toLlmHistory,
} from "@/lib/attachments";
import { AUDIO_MIME } from "@/lib/audio-limits";
import { getDb } from "@/lib/db";
import {
  checkInputGuardrails,
  withSystemPrompt,
} from "@/lib/guardrails";
import {
  completeToolChat,
  streamChat,
  type ChatMessage,
} from "@/lib/llm";
import {
  SSE_HEADERS,
  startSseKeepalive,
} from "@/lib/sse";
import { assertAssignableProject } from "@/lib/projects";
import {
  FEATURE_DISABLED_ERROR,
  isChatAudioEnabled,
  isChatImagesEnabled,
} from "@/lib/features";
import {
  getChatRuntimeOptions,
  getUserHistoryLimitSetting,
  getUserMaxCharsSetting,
  isChatModel,
  isModelEnabled,
  modelSupportsAudio,
  modelSupportsVision,
  resolveOllamaModelName,
} from "@/lib/settings";
import {
  attachUsageRequest,
  finishUsage,
  markUsageToken,
  startUsage,
} from "@/lib/usage";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import type { Conversation, Message } from "@/lib/types";
import {
  inspectToolPayload,
  runToolLoop,
  shouldUseToolRuntime,
  toolRegistry,
} from "@/lib/tools";

const imageSchema = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  data: z.string().min(32).max(16_000_000),
  name: z.string().trim().max(200).optional(),
});

const audioSchema = z.object({
  mime: z.literal(AUDIO_MIME),
  data: z.string().min(32).max(3_000_000),
  name: z.string().trim().max(200).optional(),
});

const schema = z
  .object({
    conversationId: z.string().min(1).optional(),
    message: z.string().max(32000).optional(),
    images: z.array(imageSchema).max(MAX_CHAT_IMAGES).optional(),
    audio: audioSchema.optional(),
    model: z.string().trim().min(1).max(120),
    projectId: z.string().trim().min(1).max(64).nullable().optional(),
    mode: z
      .enum(["send", "regenerate", "edit", "rewrite"])
      .default("send"),
    editMessageId: z.string().min(1).optional(),
    rewrite: z.enum(["shorter", "formal", "continue"]).optional(),
    locale: z.enum(["en", "az", "ru"]).optional(),
  })
  .superRefine((data, ctx) => {
    const text = data.message?.trim() ?? "";
    const imageCount = data.images?.length ?? 0;
    const hasAudio = Boolean(data.audio);
    if (data.mode === "send" && !text && imageCount === 0 && !hasAudio) {
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
    "Rewrite your previous answer to be shorter and tighter. Keep the SAME LANGUAGE as that answer (Azerbaijani stays Azerbaijani, Russian stays Russian, English stays English). Do not switch to English. Keep the same meaning and key facts. Do not add a preface — return only the rewritten answer.",
  formal:
    "Rewrite your previous answer in a more formal, professional tone suitable for internal company use. Keep the SAME LANGUAGE as that answer. Do not switch to English. Keep the same meaning and key facts. Do not add a preface — return only the rewritten answer.",
  continue:
    "Continue your previous answer with useful additional detail, in the SAME LANGUAGE as that answer. Do not switch to English. Return the complete answer: keep what you already said, then add the continuation. Do not add a preface like “Sure” — return only the full answer.",
} as const;

const CONVERSATION_SELECT =
  "id, user_id, title, model, project_id, is_pinned, created_at, updated_at";

const MESSAGE_SELECT = "id, role, content, created_at, attachments";

const titleFromPrompt = (
  text: string,
  hasImages: boolean,
  hasAudio = false,
): string => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned) {
    return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
  }
  if (hasAudio) return "Voice";
  return hasImages ? "Image" : "New chat";
};

type DbMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  attachments?: string | null;
};

// Numeric literal required; Next.js cannot analyze imported constants.
export const maxDuration = 300;

const LLM_HISTORY_HARD_CAP = 500;

const windowForLlm = (rows: DbMessage[]): DbMessage[] => {
  const limit = getUserHistoryLimitSetting();
  const cap = limit > 0 ? limit : LLM_HISTORY_HARD_CAP;
  return rows.length > cap ? rows.slice(-cap) : rows;
};

const loadRecentMessages = (
  conversationId: string,
  cap = LLM_HISTORY_HARD_CAP,
): DbMessage[] => {
  const limit = cap > 0 ? cap : LLM_HISTORY_HARD_CAP;
  return getDb()
    .prepare(
      `SELECT * FROM (
         SELECT ${MESSAGE_SELECT} FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT ?
       )
       ORDER BY created_at ASC`,
    )
    .all(conversationId, limit) as DbMessage[];
};

const streamAssistantReply = async (input: {
  userId: string;
  username: string;
  conversationId: string;
  conversation: Conversation;
  model: string;
  promptText: string;
  userMessage: Message;
  history: ChatMessage[];
  uiLocale?: "en" | "az" | "ru";
  signal?: AbortSignal;
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
    uiLocale,
    signal: clientSignal,
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
  const prepared = await withSystemPrompt(
    contextHistory,
    "user",
    conversation.project_id,
    { model, uiLocale },
  );
  const promptedHistory = prepared.messages;
  const knowledgeSources = prepared.sources;
  attachUsageRequest(usageId, promptedHistory);
  const runtime = getChatRuntimeOptions();

  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  if (clientSignal) {
    if (clientSignal.aborted) abort.abort();
    else clientSignal.addEventListener("abort", onClientAbort, { once: true });
  }

  const encoder = new TextEncoder();
  let assistantText = "";
  let tokensEval: number | null = null;
  let tokensPrompt: number | null = null;
  let evalDurationNs: number | null = null;
  let toolTrace: Message["tool_trace"] = null;
  let ollamaReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

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

      const stopKeepalive = startSseKeepalive(controller, encoder);
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        if (shouldUseToolRuntime(model)) {
          const result = await runToolLoop({
            messages: promptedHistory,
            registry: toolRegistry,
            inspectPayload: inspectToolPayload,
            signal: abort.signal,
            complete: (messages, options) =>
              completeToolChat(model, messages, {
                temperature: runtime.temperature,
                numPredict: runtime.numPredict,
                topP: runtime.topP,
                signal: options.signal,
                tools: options.tools,
              }),
          });
          assistantText = result.content;
          toolTrace = result.trace.length ? result.trace : null;
          if (assistantText) {
            markUsageToken(usageId, assistantText);
            send("token", { content: assistantText });
          }
        } else {
          const ollamaRes = await streamChat(model, promptedHistory, {
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

              if (chunk.error) {
                throw new Error(chunk.error);
              }

              const piece = chunk.message?.content ?? "";
              if (piece) {
                assistantText += piece;
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
        }

        const assistantMessageId = newId();
        const sourcesJson =
          knowledgeSources.length > 0
            ? JSON.stringify(knowledgeSources)
            : null;
        db.prepare(
          `INSERT INTO messages
           (id, conversation_id, role, content, sources, tool_trace)
           VALUES (?, ?, 'assistant', ?, ?, ?)`,
        ).run(
          assistantMessageId,
          conversationId,
          assistantText,
          sourcesJson,
          toolTrace ? JSON.stringify(toolTrace) : null,
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
            tool_trace: toolTrace,
          } satisfies Message,
          usage: {
            tokensEval,
            tokensPrompt,
            tokensPerSec:
              tokensEval != null && evalDurationNs && evalDurationNs > 0
                ? Math.round((tokensEval / (evalDurationNs / 1e9)) * 10) / 10
                : null,
          },
        });

        controller.close();
      } catch (error) {
        if (abort.signal.aborted) return;
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
      } finally {
        stopKeepalive();
        clientSignal?.removeEventListener("abort", onClientAbort);
      }
    },
    cancel() {
      abort.abort();
      ollamaReader?.cancel().catch(() => undefined);
      finishUsage(usageId, {
        responseChars: assistantText.length,
        status: "aborted",
        conversationId,
        tokensEval,
        tokensPrompt,
        evalDurationNs,
      });
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const burst = takeRateLimit(`chat:user:${user.id}`, 40, 60 * 1000);
  if (!burst.ok) {
    return Response.json(
      { error: "Too many requests. Slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(burst.retryAfterSec) },
      },
    );
  }
  const ipBurst = takeRateLimit(`chat:ip:${clientIp(request)}`, 80, 60 * 1000);
  if (!ipBurst.ok) {
    return Response.json(
      { error: "Too many requests. Slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(ipBurst.retryAfterSec) },
      },
    );
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
    const uiLocale = parsed.data.locale;
    const model = resolveOllamaModelName(parsed.data.model);
    const maxChars = getUserMaxCharsSetting();
    const db = getDb();

    if (!isModelEnabled(model)) {
      return Response.json(
        { error: "This model is disabled by admin. Choose another model." },
        { status: 403 },
      );
    }
    if (!isChatModel(model)) {
      return Response.json(
        { error: "This endpoint only accepts chat models." },
        { status: 400 },
      );
    }

    const incomingImages = parsed.data.images ?? [];
    const incomingAudio = parsed.data.audio ?? null;
    if (incomingImages.length && !isChatImagesEnabled()) {
      return Response.json({ error: FEATURE_DISABLED_ERROR }, { status: 403 });
    }
    if (incomingAudio && !isChatAudioEnabled()) {
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
    if (incomingAudio && !modelSupportsAudio(model)) {
      return Response.json(
        {
          error:
            "This model does not support audio. Choose an audio model.",
        },
        { status: 400 },
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
          `SELECT ${MESSAGE_SELECT} FROM messages
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
        ...toLlmHistory(
          conversationId,
          windowForLlm(rows.slice(0, lastAssistantIdx)),
        ),
        { role: "assistant", content: lastAssistant.content },
        { role: "user", content: REWRITE_PROMPTS[style] },
      ];

      const lastUserAttachments = parseAttachments(lastUser.attachments);
      const userMessage: Message = {
        id: lastUser.id,
        conversation_id: conversationId,
        role: "user",
        content: lastUser.content,
        created_at: lastUser.created_at,
        attachments: lastUserAttachments.length ? lastUserAttachments : null,
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
        uiLocale,
        signal: request.signal,
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
          `SELECT ${MESSAGE_SELECT} FROM messages
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
      const guard = await checkInputGuardrails(lastUser.content, "user", {
        username: user.username,
        userId: user.id,
        projectId: owned.project_id,
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

      const history = toLlmHistory(
        conversationId,
        windowForLlm(rows.slice(0, lastUserIdx + 1)),
      );

      const lastUserAttachments = parseAttachments(lastUser.attachments);
      const userMessage: Message = {
        id: lastUser.id,
        conversation_id: conversationId,
        role: "user",
        content: lastUser.content,
        created_at: lastUser.created_at,
        attachments: lastUserAttachments.length ? lastUserAttachments : null,
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
        uiLocale,
        signal: request.signal,
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

      const guard = await checkInputGuardrails(message, "user", {
        username: user.username,
        userId: user.id,
        projectId: owned?.project_id,
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

      if (!owned) {
        return Response.json(
          { error: "Conversation not found" },
          { status: 404 },
        );
      }

      const rows = db
        .prepare(
          `SELECT ${MESSAGE_SELECT} FROM messages
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
        ).run(titleFromPrompt(message, false), model, conversationId);
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

      const history = toLlmHistory(
        conversationId,
        windowForLlm(
          rows.slice(0, editIdx + 1).map((row, i) =>
            i === editIdx ? { ...row, content: message } : row,
          ),
        ),
      );

      const editAttachments = parseAttachments(rows[editIdx].attachments);
      const userMessage: Message = {
        id: editMessageId,
        conversation_id: conversationId,
        role: "user",
        content: message,
        created_at: rows[editIdx].created_at,
        attachments: editAttachments.length ? editAttachments : null,
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
        uiLocale,
        signal: request.signal,
      });
    }

    // ——— Normal send ———
    const message =
      (parsed.data.message ?? "").trim() ||
      (incomingAudio
        ? "Transcribe this recording, then respond to what was said."
        : "");

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

    const guard = await checkInputGuardrails(message, "user", {
      username: user.username,
      userId: user.id,
      projectId: projectIdForGuard,
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
        titleFromPrompt(
          message,
          incomingImages.length > 0,
          Boolean(incomingAudio),
        ),
        model,
        projectCheck.projectId,
      );
    }

    const userMessageId = newId();
    const saved = saveMessageImages(
      conversationId,
      userMessageId,
      incomingImages,
      incomingAudio,
    );
    if (saved.error) {
      return Response.json({ error: saved.error }, { status: 400 });
    }

    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, attachments)
       VALUES (?, ?, 'user', ?, ?)`,
    ).run(
      userMessageId,
      conversationId,
      message,
      saved.attachments.length ? JSON.stringify(saved.attachments) : null,
    );

    const historyLimit = getUserHistoryLimitSetting();
    const fetchCap = historyLimit > 0 ? historyLimit : LLM_HISTORY_HARD_CAP;
    const historyRows = loadRecentMessages(conversationId, fetchCap);
    const history = toLlmHistory(conversationId, historyRows);

    let conversation = db
      .prepare(
        `SELECT ${CONVERSATION_SELECT} FROM conversations WHERE id = ?`,
      )
      .get(conversationId) as Conversation;

    const userCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages
           WHERE conversation_id = ? AND role = 'user'`,
        )
        .get(conversationId) as { n: number }
    ).n;
    const isFirstExchange = userCount === 1;

    if (isFirstExchange && conversation.title === "New chat") {
      const title = titleFromPrompt(
        message,
        incomingImages.length > 0,
        Boolean(incomingAudio),
      );
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
      attachments: saved.attachments.length ? saved.attachments : null,
    };

    return streamAssistantReply({
      userId: user.id,
      username: user.username,
      conversationId,
      conversation,
      model,
      promptText: message || (incomingAudio ? "[audio]" : "[image]"),
      userMessage,
      history,
      uiLocale,
      signal: request.signal,
    });
  } catch (error) {
    console.error("chat error", error);
    const message =
      error instanceof Error ? error.message : "Chat request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
