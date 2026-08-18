import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";

export type ApiUsageStatus = "ok" | "error" | "aborted" | "rejected";

export type ActiveApiUsage = {
  id: string;
  apiKeyId: string | null;
  userId: string | null;
  username: string;
  model: string;
  promptPreview: string;
  promptChars: number;
  startedAt: number;
  firstTokenAt: number | null;
  responseChars: number;
  ip: string;
  status: "streaming";
};

export type ApiUsageEvent = {
  id: string;
  api_key_id: string | null;
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
  status: ApiUsageStatus;
  error_message: string | null;
  ip: string;
  created_at: string;
  key_prefix?: string | null;
  key_name?: string | null;
};

type FinishMeta = {
  responseChars: number;
  status: ApiUsageStatus;
  errorMessage?: string | null;
  tokensEval?: number | null;
  tokensPrompt?: number | null;
  evalDurationNs?: number | null;
};

const active = new Map<string, ActiveApiUsage>();

const newUsageId = () => randomBytes(12).toString("hex");

const preview = (text: string, max = 90) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
};

export const startApiUsage = (input: {
  apiKeyId: string | null;
  userId: string | null;
  username: string;
  model: string;
  prompt: string;
  ip?: string;
}): string => {
  const id = newUsageId();
  active.set(id, {
    id,
    apiKeyId: input.apiKeyId,
    userId: input.userId,
    username: input.username,
    model: input.model,
    promptPreview: preview(input.prompt),
    promptChars: input.prompt.length,
    startedAt: Date.now(),
    firstTokenAt: null,
    responseChars: 0,
    ip: (input.ip ?? "").slice(0, 64),
    status: "streaming",
  });
  return id;
};

export const markApiUsageToken = (id: string, pieceLen: number) => {
  const row = active.get(id);
  if (!row) return;
  if (row.firstTokenAt == null) row.firstTokenAt = Date.now();
  row.responseChars += pieceLen;
};

const persistUsage = (
  row: ActiveApiUsage,
  meta: FinishMeta,
  durationMs: number,
  ttftMs: number | null,
  tokensPerSec: number | null,
) => {
  getDb()
    .prepare(
      `INSERT INTO api_usage_events (
        id, api_key_id, user_id, username, model, prompt_preview, prompt_chars,
        response_chars, ttft_ms, duration_ms, tokens_eval, tokens_prompt,
        tokens_per_sec, status, error_message, ip, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      row.id,
      row.apiKeyId,
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
      row.ip,
    );
};

export const finishApiUsage = (id: string, meta: FinishMeta) => {
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
    tokensPerSec =
      Math.round((meta.responseChars / 4 / (durationMs / 1000)) * 10) / 10;
  }

  persistUsage(row, meta, durationMs, ttftMs, tokensPerSec);
  active.delete(id);
};

/** Immediate log for rejected calls (auth ok, then blocked). */
export const logRejectedApiUsage = (input: {
  apiKeyId: string | null;
  userId: string | null;
  username: string;
  model?: string;
  prompt?: string;
  ip?: string;
  errorMessage: string;
}) => {
  const id = newUsageId();
  persistUsage(
    {
      id,
      apiKeyId: input.apiKeyId,
      userId: input.userId,
      username: input.username,
      model: input.model ?? "",
      promptPreview: preview(input.prompt ?? ""),
      promptChars: (input.prompt ?? "").length,
      startedAt: Date.now(),
      firstTokenAt: null,
      responseChars: 0,
      ip: (input.ip ?? "").slice(0, 64),
      status: "streaming",
    },
    {
      responseChars: 0,
      status: "rejected",
      errorMessage: input.errorMessage,
    },
    0,
    null,
    null,
  );
};

export const listActiveApiUsage = (): Array<
  ActiveApiUsage & { elapsedMs: number; ttftMs: number | null }
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

const SELECT_EVENTS = `
  SELECT e.*, k.key_prefix, k.name AS key_name
  FROM api_usage_events e
  LEFT JOIN api_keys k ON k.id = e.api_key_id
`;

export const getPagedApiUsage = (opts: {
  page?: number;
  limit?: number;
  userId?: string | null;
  apiKeyId?: string | null;
  status?: ApiUsageStatus | null;
  model?: string | null;
  username?: string | null;
}): {
  rows: ApiUsageEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
} => {
  const db = getDb();
  const safeLimit = Math.max(5, Math.min(100, Math.floor(opts.limit ?? 25) || 25));
  const safePage = Math.max(1, Math.floor(opts.page ?? 1) || 1);

  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.userId) {
    where.push("e.user_id = ?");
    params.push(opts.userId);
  }
  if (opts.apiKeyId) {
    where.push("e.api_key_id = ?");
    params.push(opts.apiKeyId);
  }
  if (opts.status) {
    where.push("e.status = ?");
    params.push(opts.status);
  }
  if (opts.model) {
    where.push("e.model = ?");
    params.push(opts.model);
  }
  if (opts.username) {
    where.push("e.username LIKE ?");
    params.push(`%${opts.username}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM api_usage_events e ${clause}`)
    .get(...params) as { c: number };
  const total = totalRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safeLimit;

  const rows = db
    .prepare(
      `${SELECT_EVENTS} ${clause}
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, safeLimit, offset) as ApiUsageEvent[];

  return {
    rows,
    total,
    page: currentPage,
    limit: safeLimit,
    totalPages,
  };
};

export const getApiUsageAnalytics = () => {
  const db = getDb();

  const summary = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_requests,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_requests,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_requests,
        SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) AS aborted_requests,
        ROUND(AVG(CASE WHEN status = 'ok' THEN duration_ms END), 0) AS avg_duration_ms,
        ROUND(AVG(CASE WHEN status = 'ok' AND ttft_ms IS NOT NULL THEN ttft_ms END), 0) AS avg_ttft_ms,
        SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS requests_today,
        SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS requests_24h,
        SUM(CASE WHEN date(created_at) = date('now') AND status = 'ok' THEN 1 ELSE 0 END) AS ok_today,
        SUM(CASE WHEN date(created_at) = date('now') AND status != 'ok' THEN 1 ELSE 0 END) AS fail_today
      FROM api_usage_events
    `,
    )
    .get() as Record<string, number | null>;

  const byModel = db
    .prepare(
      `
      SELECT
        model,
        COUNT(*) AS requests,
        ROUND(AVG(CASE WHEN status = 'ok' THEN duration_ms END), 0) AS avg_duration_ms
      FROM api_usage_events
      WHERE model != ''
      GROUP BY model
      ORDER BY requests DESC
      LIMIT 8
    `,
    )
    .all() as Array<{
    model: string;
    requests: number;
    avg_duration_ms: number | null;
  }>;

  const activeKeys = db
    .prepare(
      `SELECT COUNT(*) AS c FROM api_keys
       WHERE revoked_at IS NULL AND is_enabled = 1`,
    )
    .get() as { c: number };

  const totalKeys = db
    .prepare(`SELECT COUNT(*) AS c FROM api_keys`)
    .get() as { c: number };

  return {
    summary,
    byModel,
    activeKeys: activeKeys?.c ?? 0,
    totalKeys: totalKeys?.c ?? 0,
  };
};
