import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { getDb } from "@/lib/db";
import type { LlmProviderConfig, ProviderKind } from "@/lib/llm/types";
import {
  isCloudMetadataHostname,
  providerUrlIsRemote,
  REMOTE_PROVIDER_ACK_MESSAGE,
} from "@/lib/provider-url";

const API_KEY_VERSION = "v1";
const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type ProviderRow = {
  id: string;
  kind: string;
  base_url: string;
  api_key_enc: string | null;
  enabled: number;
  fallback_id: string | null;
  max_concurrent: number;
};

export type ProviderSummary = {
  id: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  fallbackId: string | null;
  maxConcurrent: number;
};

export type SaveProviderInput = {
  id: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled?: boolean;
  /** Undefined preserves the stored key; null clears it. */
  apiKey?: string | null;
  /** Undefined preserves; null clears. */
  fallbackId?: string | null;
  maxConcurrent?: number;
  acknowledgeRemote?: boolean;
};

export const assertProviderCanDisable = (
  isCurrentlyEnabled: boolean,
  enabledProviderCount: number,
): void => {
  if (isCurrentlyEnabled && enabledProviderCount <= 1) {
    throw new Error("At least one provider must remain enabled.");
  }
};

export const assertProviderCanDelete = (input: {
  id: string;
  modelCount: number;
  isEnabled: boolean;
  enabledProviderCount: number;
}): void => {
  if (input.id === "ollama") {
    throw new Error("The default Ollama provider cannot be deleted.");
  }
  if (input.modelCount > 0) {
    throw new Error("Remove or reassign this provider's models before deleting it.");
  }
  assertProviderCanDisable(input.isEnabled, input.enabledProviderCount);
};

const encryptionKey = (): Buffer => {
  const dedicated = process.env.PROVIDER_KEY_SECRET?.trim();
  const session = process.env.SESSION_SECRET?.trim();
  const secret = dedicated || session;
  if (!secret) {
    throw new Error(
      "PROVIDER_KEY_SECRET or SESSION_SECRET is required to encrypt provider API keys.",
    );
  }
  return createHash("sha256")
    .update("sinamgpt:provider-api-key:v1\0")
    .update(secret)
    .digest();
};

export const encryptProviderApiKey = (apiKey: string): string => {
  const value = apiKey.trim();
  if (!value) throw new Error("Provider API key cannot be empty.");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    API_KEY_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
};

export const decryptProviderApiKey = (encrypted: string): string => {
  const [version, ivRaw, tagRaw, ciphertextRaw, extra] = encrypted.split(".");
  if (
    version !== API_KEY_VERSION ||
    !ivRaw ||
    !tagRaw ||
    !ciphertextRaw ||
    extra
  ) {
    throw new Error("Provider API key has an unsupported encrypted format.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Provider API key could not be decrypted. Check PROVIDER_KEY_SECRET or SESSION_SECRET.",
    );
  }
};

export const parseProviderKind = (value: string): ProviderKind | null => {
  if (value === "ollama" || value === "vllm" || value === "openai") return value;
  return null;
};

export const normalizeProviderId = (value: string): string => {
  const id = value.trim().toLowerCase();
  if (!PROVIDER_ID_RE.test(id)) {
    throw new Error(
      "Provider id must be 1–64 lowercase letters, numbers, underscores, or hyphens.",
    );
  }
  return id;
};

export const normalizeProviderBaseUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Provider base URL is invalid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Provider base URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Provider credentials must not be embedded in the URL.");
  }
  if (url.search || url.hash) {
    throw new Error("Provider base URL must not include a query or fragment.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isCloudMetadataHostname(hostname)) {
    throw new Error("Cloud metadata endpoints cannot be provider URLs.");
  }
  return url.toString().replace(/\/+$/, "");
};

export const assertRemoteProviderAcknowledged = (
  baseUrl: string,
  acknowledgeRemote?: boolean,
): void => {
  if (!providerUrlIsRemote(baseUrl)) return;
  if (!acknowledgeRemote) {
    throw new Error(REMOTE_PROVIDER_ACK_MESSAGE);
  }
};

const toSummary = (row: ProviderRow): ProviderSummary | null => {
  const kind = parseProviderKind(row.kind);
  if (!kind) return null;
  return {
    id: row.id,
    kind,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    hasApiKey: Boolean(row.api_key_enc),
    fallbackId: row.fallback_id,
    maxConcurrent: Number.isFinite(row.max_concurrent) ? row.max_concurrent : 0,
  };
};

const toConfig = (row: ProviderRow): LlmProviderConfig | null => {
  const summary = toSummary(row);
  if (!summary) return null;
  return {
    id: summary.id,
    kind: summary.kind,
    baseUrl: summary.baseUrl,
    enabled: summary.enabled,
    fallbackId: summary.fallbackId,
    maxConcurrent: summary.maxConcurrent,
    ...(row.api_key_enc
      ? { apiKey: decryptProviderApiKey(row.api_key_enc) }
      : {}),
  };
};

const PROVIDER_COLUMNS = `id, kind, base_url, api_key_enc, enabled, fallback_id, max_concurrent`;

export const listProviders = (): ProviderSummary[] =>
  (
    getDb()
      .prepare(
        `SELECT ${PROVIDER_COLUMNS}
         FROM providers ORDER BY id`,
      )
      .all() as ProviderRow[]
  ).flatMap((row) => {
    const provider = toSummary(row);
    return provider ? [provider] : [];
  });

export const getProviderConfig = (id: string): LlmProviderConfig | null => {
  const row = getDb()
    .prepare(
      `SELECT ${PROVIDER_COLUMNS}
       FROM providers WHERE id = ?`,
    )
    .get(id) as ProviderRow | undefined;
  return row ? toConfig(row) : null;
};

export const listEnabledProviderConfigs = (): LlmProviderConfig[] =>
  (
    getDb()
      .prepare(
        `SELECT ${PROVIDER_COLUMNS}
         FROM providers WHERE enabled = 1 ORDER BY id`,
      )
      .all() as ProviderRow[]
  ).flatMap((row) => {
    const provider = toConfig(row);
    return provider ? [provider] : [];
  });

export const saveProvider = (input: SaveProviderInput): ProviderSummary => {
  const id = normalizeProviderId(input.id);
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl);
  if (id === "ollama" && input.kind !== "ollama") {
    throw new Error("The default provider must stay Ollama.");
  }
  const current = getDb()
    .prepare(
      `SELECT api_key_enc, enabled, base_url, fallback_id, max_concurrent
       FROM providers WHERE id = ?`,
    )
    .get(id) as
    | Pick<
        ProviderRow,
        "api_key_enc" | "enabled" | "base_url" | "fallback_id" | "max_concurrent"
      >
    | undefined;
  if (current?.enabled === 1 && input.enabled === false) {
    const enabledCount = (
      getDb()
        .prepare(`SELECT COUNT(*) AS count FROM providers WHERE enabled = 1`)
        .get() as { count: number }
    ).count;
    assertProviderCanDisable(true, enabledCount);
  }

  const urlChanged = !current || current.base_url !== baseUrl;
  if (urlChanged) {
    assertRemoteProviderAcknowledged(baseUrl, input.acknowledgeRemote);
  }

  const apiKeyEnc =
    input.apiKey === undefined
      ? current?.api_key_enc ?? null
      : input.apiKey === null
        ? null
        : encryptProviderApiKey(input.apiKey);

  const fallbackId =
    input.fallbackId === undefined
      ? current?.fallback_id ?? null
      : input.fallbackId
        ? normalizeProviderId(input.fallbackId)
        : null;
  if (fallbackId === id) {
    throw new Error("A provider cannot fall back to itself.");
  }
  if (fallbackId) {
    const target = getDb()
      .prepare(`SELECT id FROM providers WHERE id = ?`)
      .get(fallbackId) as { id: string } | undefined;
    if (!target) {
      throw new Error(`Fallback provider "${fallbackId}" was not found.`);
    }
  }

  const maxConcurrent =
    input.maxConcurrent === undefined
      ? current?.max_concurrent ?? 0
      : Math.max(0, Math.min(10_000, Math.floor(input.maxConcurrent)));

  getDb()
    .prepare(
      `INSERT INTO providers (id, kind, base_url, api_key_enc, enabled, fallback_id, max_concurrent)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         base_url = excluded.base_url,
         api_key_enc = excluded.api_key_enc,
         enabled = excluded.enabled,
         fallback_id = excluded.fallback_id,
         max_concurrent = excluded.max_concurrent`,
    )
    .run(
      id,
      input.kind,
      baseUrl,
      apiKeyEnc,
      input.enabled === false ? 0 : 1,
      fallbackId,
      maxConcurrent,
    );

  const saved = listProviders().find((provider) => provider.id === id);
  if (!saved) throw new Error("Provider could not be saved.");
  return saved;
};

export const deleteProvider = (idInput: string): void => {
  const id = normalizeProviderId(idInput);

  const provider = getDb()
    .prepare(`SELECT enabled FROM providers WHERE id = ?`)
    .get(id) as Pick<ProviderRow, "enabled"> | undefined;
  if (!provider) throw new Error("Provider not found.");

  const referenced = getDb()
    .prepare(`SELECT COUNT(*) AS count FROM models WHERE backend = ?`)
    .get(id) as { count: number };
  const enabledCount = (
    getDb()
      .prepare(`SELECT COUNT(*) AS count FROM providers WHERE enabled = 1`)
      .get() as { count: number }
  ).count;
  assertProviderCanDelete({
    id,
    modelCount: referenced.count,
    isEnabled: provider.enabled === 1,
    enabledProviderCount: enabledCount,
  });

  getDb()
    .prepare(`UPDATE providers SET fallback_id = NULL WHERE fallback_id = ?`)
    .run(id);
  getDb().prepare(`DELETE FROM providers WHERE id = ?`).run(id);
};
