import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getDb } from "@/lib/db";

const SETTINGS_KEY = "api_gateway";
const KEY_PREFIX = "sinam_";

export type ApiGatewaySettings = {
  enabled: boolean;
  maxKeysPerUser: number;
  maxRequestsPerMinute: number;
  maxChars: number;
  corsOrigins: string[];
};

export type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  is_enabled: number;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ApiKeyPublic = {
  id: string;
  name: string;
  keyPrefix: string;
  isEnabled: boolean;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  username?: string;
};

export type AuthenticatedApiKey = {
  id: string;
  userId: string;
  username: string;
  name: string;
  keyPrefix: string;
};

export const DEFAULT_API_GATEWAY: ApiGatewaySettings = {
  enabled: true,
  maxKeysPerUser: 5,
  maxRequestsPerMinute: 30,
  maxChars: 16000,
  corsOrigins: [],
};

const pepper = (): string => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 chars) in .env.local");
  }
  return secret;
};

const hashKey = (plain: string): string =>
  createHmac("sha256", pepper()).update(plain).digest("hex");

const newId = () => randomBytes(12).toString("hex");

const toPublic = (
  row: ApiKeyRow & { username?: string },
): ApiKeyPublic => ({
  id: row.id,
  name: row.name,
  keyPrefix: row.key_prefix,
  isEnabled: row.is_enabled === 1 && !row.revoked_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
  createdAt: row.created_at,
  username: row.username,
});

export const getApiGatewaySettings = (): ApiGatewaySettings => {
  const raw = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SETTINGS_KEY) as { value: string } | undefined;
  if (!raw?.value) return { ...DEFAULT_API_GATEWAY };
  try {
    const parsed = JSON.parse(raw.value) as Partial<ApiGatewaySettings>;
    const origins = Array.isArray(parsed.corsOrigins)
      ? parsed.corsOrigins
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 40)
      : [];
    return {
      enabled: parsed.enabled !== false,
      maxKeysPerUser: Math.max(
        1,
        Math.min(20, Number(parsed.maxKeysPerUser) || 5),
      ),
      maxRequestsPerMinute: Math.max(
        1,
        Math.min(300, Number(parsed.maxRequestsPerMinute) || 30),
      ),
      maxChars: Math.max(
        500,
        Math.min(32000, Number(parsed.maxChars) || 16000),
      ),
      corsOrigins: origins,
    };
  } catch {
    return { ...DEFAULT_API_GATEWAY };
  }
};

export const setApiGatewaySettings = (
  next: Partial<ApiGatewaySettings>,
): ApiGatewaySettings => {
  const current = getApiGatewaySettings();
  const merged: ApiGatewaySettings = {
    enabled: next.enabled ?? current.enabled,
    maxKeysPerUser: Math.max(
      1,
      Math.min(20, Math.floor(next.maxKeysPerUser ?? current.maxKeysPerUser)),
    ),
    maxRequestsPerMinute: Math.max(
      1,
      Math.min(
        300,
        Math.floor(next.maxRequestsPerMinute ?? current.maxRequestsPerMinute),
      ),
    ),
    maxChars: Math.max(
      500,
      Math.min(32000, Math.floor(next.maxChars ?? current.maxChars)),
    ),
    corsOrigins: Array.isArray(next.corsOrigins)
      ? next.corsOrigins
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 40)
      : current.corsOrigins,
  };
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
};

export const extractApiKey = (request: Request): string | null => {
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const alt = request.headers.get("x-api-key")?.trim() ?? "";
  return alt || null;
};

export const authenticateApiKey = (
  request: Request,
): AuthenticatedApiKey | null => {
  const plain = extractApiKey(request);
  if (!plain || !plain.startsWith(KEY_PREFIX) || plain.length < 20) {
    return null;
  }

  const digest = hashKey(plain);
  const row = getDb()
    .prepare(
      `SELECT k.id, k.user_id, k.name, k.key_prefix, k.key_hash,
              k.is_enabled, k.revoked_at, u.username, u.is_active
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = ?`,
    )
    .get(digest) as
    | (ApiKeyRow & { username: string; is_active: number })
    | undefined;

  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.is_enabled !== 1) return null;
  if (row.is_active !== 1) return null;

  const a = Buffer.from(row.key_hash);
  const b = Buffer.from(digest);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  getDb()
    .prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`)
    .run(row.id);

  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    name: row.name,
    keyPrefix: row.key_prefix,
  };
};

export const listApiKeysForUser = (userId: string): ApiKeyPublic[] => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(userId) as ApiKeyRow[];
  return rows.map(toPublic);
};

export const listAllApiKeys = (): ApiKeyPublic[] => {
  const rows = getDb()
    .prepare(
      `SELECT k.*, u.username
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       ORDER BY k.created_at DESC`,
    )
    .all() as Array<ApiKeyRow & { username: string }>;
  return rows.map(toPublic);
};

export const countActiveKeysForUser = (userId: string): number => {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM api_keys
       WHERE user_id = ? AND revoked_at IS NULL`,
    )
    .get(userId) as { c: number };
  return row?.c ?? 0;
};

export const createApiKey = (
  userId: string,
  name: string,
): { key: ApiKeyPublic; secret: string } => {
  const settings = getApiGatewaySettings();
  const live = countActiveKeysForUser(userId);
  if (live >= settings.maxKeysPerUser) {
    throw new Error(
      `Key limit reached (${settings.maxKeysPerUser} active keys per user).`,
    );
  }

  const trimmed = name.trim().slice(0, 80) || "API key";
  const secret = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  const id = newId();
  const prefix = secret.slice(0, 12);

  getDb()
    .prepare(
      `INSERT INTO api_keys
        (id, user_id, name, key_prefix, key_hash, is_enabled, created_at)
       VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`,
    )
    .run(id, userId, trimmed, prefix, hashKey(secret));

  const row = getDb()
    .prepare(`SELECT * FROM api_keys WHERE id = ?`)
    .get(id) as ApiKeyRow;

  return { key: toPublic(row), secret };
};

export const setApiKeyEnabled = (
  id: string,
  enabled: boolean,
  userId?: string,
): ApiKeyPublic | null => {
  const row = getDb()
    .prepare(
      userId
        ? `SELECT * FROM api_keys WHERE id = ? AND user_id = ?`
        : `SELECT * FROM api_keys WHERE id = ?`,
    )
    .get(...(userId ? [id, userId] : [id])) as ApiKeyRow | undefined;
  if (!row || row.revoked_at) return null;

  getDb()
    .prepare(`UPDATE api_keys SET is_enabled = ? WHERE id = ?`)
    .run(enabled ? 1 : 0, id);

  const next = getDb()
    .prepare(`SELECT * FROM api_keys WHERE id = ?`)
    .get(id) as ApiKeyRow;
  return toPublic(next);
};

export const revokeApiKey = (
  id: string,
  userId?: string,
): ApiKeyPublic | null => {
  const row = getDb()
    .prepare(
      userId
        ? `SELECT * FROM api_keys WHERE id = ? AND user_id = ?`
        : `SELECT * FROM api_keys WHERE id = ?`,
    )
    .get(...(userId ? [id, userId] : [id])) as ApiKeyRow | undefined;
  if (!row) return null;
  if (row.revoked_at) return toPublic(row);

  getDb()
    .prepare(
      `UPDATE api_keys
       SET revoked_at = datetime('now'), is_enabled = 0
       WHERE id = ?`,
    )
    .run(id);

  const next = getDb()
    .prepare(`SELECT * FROM api_keys WHERE id = ?`)
    .get(id) as ApiKeyRow;
  return toPublic(next);
};

export const apiCorsHeaders = (
  request: Request,
  settings = getApiGatewaySettings(),
): Record<string, string> => {
  const allowed = settings.corsOrigins;
  if (!allowed.length) return {};
  const origin = request.headers.get("origin")?.trim() ?? "";
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Api-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
};

export const withApiCors = (
  response: Response,
  request: Request,
  settings?: ApiGatewaySettings,
): Response => {
  const extra = apiCorsHeaders(request, settings);
  if (!Object.keys(extra).length) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
