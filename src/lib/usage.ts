import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";

export type UsageSource = "user" | "guest";

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
  status: "ok" | "error" | "aborted";
  error_message: string | null;
  conversation_id: string | null;
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
  });
  return id;
};

export const markUsageToken = (id: string, pieceLen: number) => {
  const row = active.get(id);
  if (!row) return;
  if (row.firstTokenAt == null) row.firstTokenAt = Date.now();
  row.responseChars += pieceLen;
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
        tokens_per_sec, status, error_message, conversation_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
    );

  active.delete(id);
};

export const listActiveUsage = (): Array<
  ActiveUsage & { elapsedMs: number; ttftMs: number | null }
> => {
  const now = Date.now();
  return [...active.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((row) => ({
      ...row,
      elapsedMs: now - row.startedAt,
      ttftMs:
        row.firstTokenAt != null
          ? Math.max(0, row.firstTokenAt - row.startedAt)
          : null,
    }));
};

export const getRecentUsage = (limit = 60): UsageEvent[] => {
  return getDb()
    .prepare(
      `SELECT * FROM usage_events ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as UsageEvent[];
};

export const getPagedUsage = (
  page = 1,
  limit = 25,
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
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM usage_events`)
    .get() as { c: number };
  const total = totalRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safeLimit;

  const rows = db
    .prepare(
      `SELECT * FROM usage_events
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

  const summary = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_requests,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_requests,
        SUM(CASE WHEN source = 'guest' THEN 1 ELSE 0 END) AS guest_requests,
        SUM(CASE WHEN source = 'user' THEN 1 ELSE 0 END) AS user_requests,
        ROUND(AVG(CASE WHEN status = 'ok' THEN duration_ms END), 0) AS avg_duration_ms,
        ROUND(AVG(CASE WHEN status = 'ok' AND ttft_ms IS NOT NULL THEN ttft_ms END), 0) AS avg_ttft_ms,
        ROUND(AVG(CASE WHEN status = 'ok' AND tokens_per_sec IS NOT NULL THEN tokens_per_sec END), 1) AS avg_tokens_per_sec,
        SUM(CASE WHEN status = 'ok' THEN prompt_chars ELSE 0 END) AS total_prompt_chars,
        SUM(CASE WHEN status = 'ok' THEN response_chars ELSE 0 END) AS total_response_chars,
        SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS requests_24h,
        SUM(CASE WHEN created_at >= datetime('now', '-7 day') THEN 1 ELSE 0 END) AS requests_7d,
        SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS requests_today
      FROM usage_events
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
      FROM usage_events
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
      FROM usage_events
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
      FROM usage_events
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

export const pingOllama = async (
  baseUrl = process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:11434",
): Promise<{ ok: boolean; latencyMs: number; error?: string }> => {
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { cache: "no-store" });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    }
    return { ok: true, latencyMs };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unreachable",
    };
  }
};
