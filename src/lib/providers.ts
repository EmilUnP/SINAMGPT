import { getDb } from "@/lib/db";
import type { LlmProviderConfig, ProviderKind } from "@/lib/llm/types";
import {
  isCloudMetadataHostname,
  providerUrlIsRemote,
  REMOTE_PROVIDER_ACK_MESSAGE,
} from "@/lib/provider-url";

import { encryptProviderApiKey, decryptProviderApiKey } from "./provider-secrets";
export { encryptProviderApiKey, decryptProviderApiKey } from "./provider-secrets";
const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type ProviderRow = {
  id: string;
  kind: string;
  base_url: string;
  api_key_enc: string | null;
  enabled: number;
  fallback_id: string | null;
  max_concurrent: number;
  tools_enabled: number;
};

export type ProviderSummary = {
  id: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  fallbackId: string | null;
  maxConcurrent: number;
  toolsEnabled: boolean;
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
  toolsEnabled?: boolean;
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
  if (input.id === "vllm") {
    throw new Error("The default vLLM provider cannot be deleted.");
  }
  if (input.modelCount > 0) {
    throw new Error("Remove or reassign this provider's models before deleting it.");
  }
  assertProviderCanDisable(input.isEnabled, input.enabledProviderCount);
};

export const parseProviderKind = (value: string): ProviderKind | null => {
  if (value === "vllm" || value === "openai") return value;
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
    toolsEnabled: row.tools_enabled === 1,
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
    toolsEnabled: summary.toolsEnabled,
    ...(row.api_key_enc
      ? { apiKey: decryptProviderApiKey(row.api_key_enc) }
      : {}),
  };
};

const PROVIDER_COLUMNS = `id, kind, base_url, api_key_enc, enabled, fallback_id, max_concurrent, tools_enabled`;

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
         FROM providers WHERE enabled = 1 AND kind IN ('vllm', 'openai') ORDER BY id`,
      )
      .all() as ProviderRow[]
  ).flatMap((row) => {
    const provider = toConfig(row);
    return provider ? [provider] : [];
  });

export const saveProvider = (input: SaveProviderInput): ProviderSummary => {
  const id = normalizeProviderId(input.id);
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl);
  if (!parseProviderKind(input.kind) || id === "ollama") {
    throw new Error("Ollama has been retired. Use a vLLM or OpenAI-compatible provider.");
  }
  if (id === "vllm" && input.kind !== "vllm") {
    throw new Error("The default provider must stay vLLM.");
  }
  const current = getDb()
    .prepare(
      `SELECT api_key_enc, enabled, base_url, fallback_id, max_concurrent, tools_enabled
       FROM providers WHERE id = ?`,
    )
    .get(id) as
    | Pick<
        ProviderRow,
        "api_key_enc" | "enabled" | "base_url" | "fallback_id" | "max_concurrent" | "tools_enabled"
      >
    | undefined;
  if (current?.enabled === 1 && input.enabled === false) {
    const enabledCount = (
      getDb()
        .prepare(`SELECT COUNT(*) AS count FROM providers WHERE enabled = 1 AND kind IN ('vllm', 'openai')`)
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
      .prepare(`SELECT id FROM providers WHERE id = ? AND kind IN ('vllm', 'openai')`)
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
      `INSERT INTO providers (id, kind, base_url, api_key_enc, enabled, fallback_id, max_concurrent, tools_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         base_url = excluded.base_url,
         api_key_enc = excluded.api_key_enc,
         enabled = excluded.enabled,
         fallback_id = excluded.fallback_id,
         max_concurrent = excluded.max_concurrent,
         tools_enabled = excluded.tools_enabled`,
    )
    .run(
      id,
      input.kind,
      baseUrl,
      apiKeyEnc,
      input.enabled === undefined ? (current?.enabled ?? 1) : input.enabled ? 1 : 0,
      fallbackId,
      maxConcurrent,
      input.toolsEnabled === undefined ? (current?.tools_enabled ?? 0) : input.toolsEnabled ? 1 : 0,
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
      .prepare(`SELECT COUNT(*) AS count FROM providers WHERE enabled = 1 AND kind IN ('vllm', 'openai')`)
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
