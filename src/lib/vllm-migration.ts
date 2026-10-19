import type Database from "better-sqlite3";
import { encryptProviderApiKey } from "./provider-secrets";

const MIGRATION = "vllm_runtime_migration_v1";

/** Retire legacy inference without rewriting model identities or chat history. */
export const migrateToVllm = (database: Database.Database): void => {
  if (database.prepare("SELECT 1 FROM app_settings WHERE key = ?").get(MIGRATION)) return;

  const baseUrl = process.env.VLLM_BASE_URL?.trim().replace(/\/+$/, "") || "http://127.0.0.1:8000";
  const key = process.env.VLLM_API_KEY?.trim();
  const requestedLimit = Number(process.env.VLLM_MAX_CONCURRENT ?? 32);
  const maxConcurrent = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.min(10_000, Math.floor(requestedLimit))) : 32;
  const toolsEnabled = process.env.VLLM_TOOL_CALLING === "1" ? 1 : 0;

  database.transaction(() => {
    const existing = database.prepare("SELECT kind FROM providers WHERE id = 'vllm'").get() as { kind: string } | undefined;
    if (existing && existing.kind !== "vllm") {
      throw new Error('Provider id "vllm" is reserved for vLLM. Rename the conflicting provider before migrating.');
    }
    const encryptedKey = !existing && key ? encryptProviderApiKey(key) : null;
    database.prepare(`
      INSERT INTO providers (id, kind, base_url, api_key_enc, enabled, max_concurrent, tools_enabled)
      VALUES ('vllm', 'vllm', ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET enabled = 1
    `).run(baseUrl, encryptedKey, maxConcurrent, toolsEnabled);

    database.exec(`
      UPDATE models SET is_enabled = 0
      WHERE backend = 'ollama' OR backend IN (SELECT id FROM providers WHERE kind = 'ollama');
      DELETE FROM app_settings WHERE key = 'default_model' AND value IN (
        SELECT name FROM models WHERE backend = 'ollama'
          OR backend IN (SELECT id FROM providers WHERE kind = 'ollama')
      );
      UPDATE providers SET fallback_id = NULL
      WHERE fallback_id IN (SELECT id FROM providers WHERE kind = 'ollama');
      UPDATE providers SET enabled = 0 WHERE kind = 'ollama';
    `);
    database.prepare("INSERT INTO app_settings (key, value) VALUES (?, '1')").run(MIGRATION);
  })();
};
