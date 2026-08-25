import { randomBytes } from "crypto";
import {
  getActiveApiUsageById,
  getApiUsageEvent,
  listActiveApiUsage,
} from "@/lib/api-usage";
import { getDb } from "@/lib/db";

export type UsageSource = "user" | "guest" | "api";

export type UsageSourceFilter = "all" | "app" | "api";

export const parseUsageSourceFilter = (
  raw: string | null | undefined,
): UsageSourceFilter =>
  raw === "app" || raw === "api" ? raw : "all";

/** Keep SQLite rows bounded — admins still see the start of huge payloads. */
const MAX_REQUEST_PAYLOAD = 160_000;
const MAX_RESPONSE_FULL = 80_000;

export type UsagePayloadMessage = {
  role: string;
  content: string;
  images?: unknown[];
};

export type ActiveUsage = {
  id: string;
  source: UsageSource;
  username: string;
  userId: string | null;
  model: string;
  promptPreview: string;
  promptChars: number;
  startedAt: number;
  firstTokenAt: number | null;
  responseChars: number;
  status: "streaming";
  requestPayload: string;
  responseText: string;
};

export type UsageListItem = {
  id: string;
  source: UsageSource;
  username: string;
  model: string;
  promptPreview: string;
  promptChars: number;
  responseChars: number;
  elapsedMs: number;
  ttftMs: number | null;
  status: "streaming";
};

export type UsageDetail = {
  id: string;
  live: boolean;
  source: UsageSource;
  username: string;
  userId: string | null;
  model: string;
  promptPreview: string;
  promptChars: number;
  responseChars: number;
  elapsedMs: number | null;
  ttftMs: number | null;
  durationMs: number | null;
  tokensEval: number | null;
  tokensPrompt: number | null;
  tokensPerSec: number | null;
  status: string;
  errorMessage: string | null;
  conversationId: string | null;
  createdAt: string | null;
  requestPayload: string;
  responseFull: string;
};

export type UsageEvent = {
  id: string;
  source: UsageSource;
  user_id: string | null;
  username: string;
  model: string;
  prompt_preview: string;
  prompt_chars: number;
  response_chars: number;
  ttft_ms: number | null;
  duration_ms: number;
  tokens_eval: number | null;
  tokens_prompt: number | null;
  tokens_per_sec: number | null;
  status: "ok" | "error" | "aborted" | "rejected";
  error_message: string | null;
  conversation_id: string | null;
  request_payload?: string;
  response_full?: string;
  created_at: string;
};

type FinishMeta = {
  responseChars: number;
  status: "ok" | "error" | "aborted";
  errorMessage?: string | null;
  conversationId?: string | null;
  tokensEval?: number | null;
  tokensPrompt?: number | null;
  evalDurationNs?: number | null;
};

const active = new Map<string, ActiveUsage>();

const newUsageId = () => randomBytes(12).toString("hex");

const preview = (text: string, max = 90) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
};

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max)}\n\n… [truncated]`;

const attachmentNote = (images?: unknown[]) => {
  if (!Array.isArray(images) || images.length === 0) return "";
  const n = images.length;
  return n === 1
    ? "\n[1 attachment omitted]"
    : `\n[${n} attachments omitted]`;
};

export const formatRequestPayload = (
  messages: UsagePayloadMessage[],
): string => {
  const parts = messages.map((msg) => {
    const role = (msg.role || "unknown").trim() || "unknown";
    return `=== ${role} ===${attachmentNote(msg.images)}\n${msg.content ?? ""}`;
  });
  return clip(parts.join("\n\n"), MAX_REQUEST_PAYLOAD);
};

export const startUsage = (input: {
  source: UsageSource;
  username: string;
  userId?: string | null;
  model: string;
  prompt: string;
}): string => {
  const id = newUsageId();
  active.set(id, {
    id,
    source: input.source,
    username: input.username,
    userId: input.userId ?? null,
    model: input.model,
    promptPreview: preview(input.prompt),
    promptChars: input.prompt.length,
    startedAt: Date.now(),
    firstTokenAt: null,
    responseChars: 0,
    status: "streaming",
    requestPayload: clip(`=== user ===\n${input.prompt}`, MAX_REQUEST_PAYLOAD),
    responseText: "",
  });
  return id;
};

/** Replace the live row with the exact messages sent to the model. */
export const attachUsageRequest = (
  id: string,
  messages: UsagePayloadMessage[],
) => {
  const row = active.get(id);
  if (!row) return;
  row.requestPayload = formatRequestPayload(messages);
};

export const markUsageToken = (id: string, piece: string) => {
  const row = active.get(id);
  if (!row) return;
  if (row.firstTokenAt == null) row.firstTokenAt = Date.now();
  row.responseChars += piece.length;
  if (row.responseText.length >= MAX_RESPONSE_FULL) return;
  const room = MAX_RESPONSE_FULL - row.responseText.length;
  if (piece.length <= room) {
    row.responseText += piece;
    return;
  }
  row.responseText = `${row.responseText}${piece.slice(0, room)}\n\n… [truncated]`;
};

export const finishUsage = (id: string, meta: FinishMeta) => {
  const row = active.get(id);
  if (!row) return;

  const endedAt = Date.now();
  const durationMs = Math.max(0, endedAt - row.startedAt);
  const ttftMs =
    row.firstTokenAt != null ? Math.max(0, row.firstTokenAt - row.startedAt) : null;

  let tokensPerSec: number | null = null;
  if (
    meta.tokensEval != null &&
    meta.evalDurationNs != null &&
    meta.evalDurationNs > 0
  ) {
    tokensPerSec =
      Math.round((meta.tokensEval / (meta.evalDurationNs / 1e9)) * 10) / 10;
  } else if (meta.responseChars > 0 && durationMs > 0) {
    // rough chars/sec converted to ~tokens/sec
    tokensPerSec =
      Math.round(((meta.responseChars / 4) / (durationMs / 1000)) * 10) / 10;
  }

  getDb()
    .prepare(
      `INSERT INTO usage_events (
        id, source, user_id, username, model, prompt_preview, prompt_chars,
        response_chars, ttft_ms, duration_ms, tokens_eval, tokens_prompt,
        tokens_per_sec, status, error_message, conversation_id,
        request_payload, response_full, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      id,
      row.source,
      row.userId,
      row.username,
      row.model,
      row.promptPreview,
      row.promptChars,
      meta.responseChars,
      ttftMs,
      durationMs,
      meta.tokensEval ?? null,
      meta.tokensPrompt ?? null,
      tokensPerSec,
      meta.status,
      meta.errorMessage ?? null,
      meta.conversationId ?? null,
      row.requestPayload,
      clip(row.responseText, MAX_RESPONSE_FULL),
    );

  active.delete(id);
};

export const listActiveUsage = (
  filter: UsageSourceFilter = "all",
): UsageListItem[] => {
  const now = Date.now();
  const chat = [...active.values()].map((row) => ({
    id: row.id,
    source: row.source,
    username: row.username,
    model: row.model,
    promptPreview: row.promptPreview,
    promptChars: row.promptChars,
    responseChars: row.responseChars,
    elapsedMs: now - row.startedAt,
    ttftMs:
      row.firstTokenAt != null
        ? Math.max(0, row.firstTokenAt - row.startedAt)
        : null,
    status: row.status,
  }));
  const api = listActiveApiUsage().map((row) => ({
    id: row.id,
    source: "api" as const,
    username: row.username,
    model: row.model,
    promptPreview: row.promptPreview,
    promptChars: row.promptChars,
    responseChars: row.responseChars,
    elapsedMs: row.elapsedMs,
    ttftMs: row.ttftMs,
    status: "streaming" as const,
  }));
  const rows = [...chat, ...api].sort((a, b) => a.elapsedMs - b.elapsedMs);
  if (filter === "api") return rows.filter((row) => row.source === "api");
  if (filter === "app") return rows.filter((row) => row.source !== "api");
  return rows;
};

const isUsageId = (id: string) => /^[a-f0-9]{24}$/i.test(id);

export const getUsageDetail = (id: string): UsageDetail | null => {
  if (!isUsageId(id)) return null;

  const live = active.get(id);
  if (live) {
    const now = Date.now();
    return {
      id: live.id,
      live: true,
      source: live.source,
      username: live.username,
      userId: live.userId,
      model: live.model,
      promptPreview: live.promptPreview,
      promptChars: live.promptChars,
      responseChars: live.responseChars,
      elapsedMs: now - live.startedAt,
      ttftMs:
        live.firstTokenAt != null
          ? Math.max(0, live.firstTokenAt - live.startedAt)
          : null,
      durationMs: null,
      tokensEval: null,
      tokensPrompt: null,
      tokensPerSec: null,
      status: live.status,
      errorMessage: null,
      conversationId: null,
      createdAt: new Date(live.startedAt).toISOString(),
      requestPayload: live.requestPayload,
      responseFull: live.responseText,
    };
  }

  const apiLive = getActiveApiUsageById(id);
  if (apiLive) {
    const now = Date.now();
    return {
      id: apiLive.id,
      live: true,
      source: "api",
      username: apiLive.username,
      userId: apiLive.userId,
      model: apiLive.model,
      promptPreview: apiLive.promptPreview,
      promptChars: apiLive.promptChars,
      responseChars: apiLive.responseChars,
      elapsedMs: now - apiLive.startedAt,
      ttftMs:
        apiLive.firstTokenAt != null
          ? Math.max(0, apiLive.firstTokenAt - apiLive.startedAt)
          : null,
      durationMs: null,
      tokensEval: null,
      tokensPrompt: null,
      tokensPerSec: null,
      status: apiLive.status,
      errorMessage: null,
      conversationId: null,
      createdAt: new Date(apiLive.startedAt).toISOString(),
      requestPayload: apiLive.requestPayload,
      responseFull: apiLive.responseText,
    };
  }

  const row = getDb()
    .prepare(`SELECT * FROM usage_events WHERE id = ?`)
    .get(id) as UsageEvent | undefined;
  if (row) {
    return {
      id: row.id,
      live: false,
      source: row.source,
      username: row.username,
      userId: row.user_id,
      model: row.model,
      promptPreview: row.prompt_preview,
      promptChars: row.prompt_chars,
      responseChars: row.response_chars,
      elapsedMs: null,
      ttftMs: row.ttft_ms,
      durationMs: row.duration_ms,
      tokensEval: row.tokens_eval,
      tokensPrompt: row.tokens_prompt,
      tokensPerSec: row.tokens_per_sec,
      status: row.status,
      errorMessage: row.error_message,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      requestPayload: row.request_payload ?? "",
      responseFull: row.response_full ?? "",
    };
  }

  const apiRow = getApiUsageEvent(id);
  if (!apiRow) return null;

  return {
    id: apiRow.id,
    live: false,
    source: "api",
    username: apiRow.username,
    userId: apiRow.user_id,
    model: apiRow.model,
    promptPreview: apiRow.prompt_preview,
    promptChars: apiRow.prompt_chars,
    responseChars: apiRow.response_chars,
    elapsedMs: null,
    ttftMs: apiRow.ttft_ms,
    durationMs: apiRow.duration_ms,
    tokensEval: apiRow.tokens_eval,
    tokensPrompt: apiRow.tokens_prompt,
    tokensPerSec: apiRow.tokens_per_sec,
    status: apiRow.status,
    errorMessage: apiRow.error_message,
    conversationId: null,
    createdAt: apiRow.created_at,
    requestPayload: apiRow.request_payload || apiRow.prompt_preview,
    responseFull: apiRow.response_full ?? "",
  };
};

const ALL_USAGE_EVENTS = `
  SELECT id, source, user_id, username, model, prompt_preview, prompt_chars,
    response_chars, ttft_ms, duration_ms, tokens_eval, tokens_prompt,
    tokens_per_sec, status, error_message, conversation_id, created_at
  FROM usage_events
  UNION ALL
  SELECT id, 'api' AS source, user_id, username, model, prompt_preview, prompt_chars,
    response_chars, ttft_ms, duration_ms, tokens_eval, tokens_prompt,
    tokens_per_sec, status, error_message, NULL AS conversation_id, created_at
  FROM api_usage_events
`;

export const getRecentUsage = (limit = 60): UsageEvent[] => {
  return getDb()
    .prepare(
      `SELECT * FROM (${ALL_USAGE_EVENTS}) AS all_events ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as UsageEvent[];
};

export const getPagedUsage = (
  page = 1,
  limit = 25,
  filter: UsageSourceFilter = "all",
): {
  rows: UsageEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
} => {
  const db = getDb();
  const safeLimit = Math.max(5, Math.min(100, Math.floor(limit) || 25));
  const safePage = Math.max(1, Math.floor(page) || 1);
  const where =
    filter === "api"
      ? "WHERE source = 'api'"
      : filter === "app"
        ? "WHERE source != 'api'"
        : "";
  const totalSql =
    filter === "api"
      ? `SELECT COUNT(*) AS c FROM api_usage_events`
      : filter === "app"
        ? `SELECT COUNT(*) AS c FROM usage_events`
        : `SELECT
            (SELECT COUNT(*) FROM usage_events) +
            (SELECT COUNT(*) FROM api_usage_events) AS c`;
  const totalRow = db.prepare(totalSql).get() as { c: number };
  const total = totalRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safeLimit;

  const rows = db
    .prepare(
      `SELECT * FROM (${ALL_USAGE_EVENTS}) AS all_events
       ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(safeLimit, offset) as UsageEvent[];

  return {
    rows,
    total,
    page: currentPage,
    limit: safeLimit,
    totalPages,
  };
};

export const getUsageAnalytics = () => {
  const db = getDb();
  const fromAll = `FROM (${ALL_USAGE_EVENTS}) AS all_events`;

  const summary = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_requests,
        SUM(CASE WHEN status IN ('error', 'rejected') THEN 1 ELSE 0 END) AS error_requests,
        SUM(CASE WHEN source = 'guest' THEN 1 ELSE 0 END) AS guest_requests,
        SUM(CASE WHEN source = 'user' THEN 1 ELSE 0 END) AS user_requests,
        SUM(CASE WHEN source = 'api' THEN 1 ELSE 0 END) AS api_requests,
        ROUND(AVG(CASE WHEN status = 'ok' THEN duration_ms END), 0) AS avg_duration_ms,
        ROUND(AVG(CASE WHEN status = 'ok' AND ttft_ms IS NOT NULL THEN ttft_ms END), 0) AS avg_ttft_ms,
        ROUND(AVG(CASE WHEN status = 'ok' AND tokens_per_sec IS NOT NULL THEN tokens_per_sec END), 1) AS avg_tokens_per_sec,
        SUM(CASE WHEN status = 'ok' THEN prompt_chars ELSE 0 END) AS total_prompt_chars,
        SUM(CASE WHEN status = 'ok' THEN response_chars ELSE 0 END) AS total_response_chars,
        SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS requests_24h,
        SUM(CASE WHEN created_at >= datetime('now', '-7 day') THEN 1 ELSE 0 END) AS requests_7d,
        SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS requests_today
      ${fromAll}
    `,
    )
    .get() as Record<string, number | null>;

  const byModel = db
    .prepare(
      `
      SELECT
        model,
        COUNT(*) AS requests,
        ROUND(AVG(CASE WHEN status = 'ok' THEN duration_ms END), 0) AS avg_duration_ms,
        ROUND(AVG(CASE WHEN status = 'ok' AND tokens_per_sec IS NOT NULL THEN tokens_per_sec END), 1) AS avg_tokens_per_sec,
        SUM(CASE WHEN status = 'ok' THEN response_chars ELSE 0 END) AS response_chars
      ${fromAll}
      WHERE model != ''
      GROUP BY model
      ORDER BY requests DESC
      LIMIT 12
    `,
    )
    .all() as Array<{
    model: string;
    requests: number;
    avg_duration_ms: number | null;
    avg_tokens_per_sec: number | null;
    response_chars: number;
  }>;

  const byHour = db
    .prepare(
      `
      SELECT
        strftime('%Y-%m-%d %H:00', created_at) AS hour,
        COUNT(*) AS requests,
        ROUND(AVG(CASE WHEN status = 'ok' THEN duration_ms END), 0) AS avg_duration_ms
      ${fromAll}
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY hour
      ORDER BY hour ASC
    `,
    )
    .all() as Array<{
    hour: string;
    requests: number;
    avg_duration_ms: number | null;
  }>;

  const topUsers = db
    .prepare(
      `
      SELECT
        username,
        source,
        COUNT(*) AS requests,
        ROUND(AVG(CASE WHEN status = 'ok' THEN duration_ms END), 0) AS avg_duration_ms
      ${fromAll}
      GROUP BY username, source
      ORDER BY requests DESC
      LIMIT 10
    `,
    )
    .all() as Array<{
    username: string;
    source: UsageSource;
    requests: number;
    avg_duration_ms: number | null;
  }>;

  return { summary, byModel, byHour, topUsers };
};

/** Wipe finished chat usage rows. Live streams stay in memory and still insert when they finish. */
export const clearUsageLogs = (): number => {
  const info = getDb().prepare(`DELETE FROM usage_events`).run();
  return info.changes;
};

export { pingBackends, pingLlm } from "@/lib/llm";

/** @deprecated Prefer pingLlm / pingBackends — kept for older callers */
export { pingLlm as pingOllama } from "@/lib/llm";
