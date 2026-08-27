import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { getDb } from "@/lib/db";
import type { LlmProviderConfig, ProviderKind } from "@/lib/llm/types";

const API_KEY_VERSION = "v1";
const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type ProviderRow = {
  id: string;
  kind: string;
  base_url: string;
  api_key_enc: string | null;
  enabled: number;
};

export type ProviderSummary = {
  id: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
};

export type SaveProviderInput = {
  id: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled?: boolean;
  /** Undefined preserves the stored key; null clears it. */
  apiKey?: string | null;
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
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("SESSION_SECRET is required to encrypt provider API keys.");
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
      "Provider API key could not be decrypted. Check SESSION_SECRET.",
    );
  }
};

const providerKind = (value: string): ProviderKind | null => {
  if (value === "ollama" || value === "vllm") return value;
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
  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname === "100.100.100.200" ||
    hostname === "::ffff:a9fe:a9fe" ||
    hostname === "fd00:ec2::254" ||
    /^fe[89ab][0-9a-f]:/i.test(hostname)
  ) {
    throw new Error("Cloud metadata endpoints cannot be provider URLs.");
  }
  return url.toString().replace(/\/+$/, "");
};

const toSummary = (row: ProviderRow): ProviderSummary | null => {
  const kind = providerKind(row.kind);
  if (!kind) return null;
  return {
    id: row.id,
    kind,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    hasApiKey: Boolean(row.api_key_enc),
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
    ...(row.api_key_enc
      ? { apiKey: decryptProviderApiKey(row.api_key_enc) }
      : {}),
  };
};

export const listProviders = (): ProviderSummary[] =>
  (
    getDb()
      .prepare(
        `SELECT id, kind, base_url, api_key_enc, enabled
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
      `SELECT id, kind, base_url, api_key_enc, enabled
       FROM providers WHERE id = ?`,
    )
    .get(id) as ProviderRow | undefined;
  return row ? toConfig(row) : null;
};

export const listEnabledProviderConfigs = (): LlmProviderConfig[] =>
  (
    getDb()
      .prepare(
        `SELECT id, kind, base_url, api_key_enc, enabled
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
  const current = getDb()
    .prepare(`SELECT api_key_enc, enabled FROM providers WHERE id = ?`)
    .get(id) as Pick<ProviderRow, "api_key_enc" | "enabled"> | undefined;
  if (
    current?.enabled === 1 &&
    input.enabled === false
  ) {
    const enabledCount = (
      getDb()
        .prepare(`SELECT COUNT(*) AS count FROM providers WHERE enabled = 1`)
        .get() as { count: number }
    ).count;
    assertProviderCanDisable(true, enabledCount);
  }
  const apiKeyEnc =
    input.apiKey === undefined
      ? current?.api_key_enc ?? null
      : input.apiKey === null
        ? null
        : encryptProviderApiKey(input.apiKey);

  getDb()
    .prepare(
      `INSERT INTO providers (id, kind, base_url, api_key_enc, enabled)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         base_url = excluded.base_url,
         api_key_enc = excluded.api_key_enc,
         enabled = excluded.enabled`,
    )
    .run(id, input.kind, baseUrl, apiKeyEnc, input.enabled === false ? 0 : 1);

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

  getDb().prepare(`DELETE FROM providers WHERE id = ?`).run(id);
};
