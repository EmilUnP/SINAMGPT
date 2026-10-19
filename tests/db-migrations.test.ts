import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureDatabaseSchema } from "@/lib/db";

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  vi.unstubAllEnvs();
});

const memoryDatabase = () => {
  const database = new Database(":memory:");
  databases.push(database);
  return database;
};

describe("database migrations", () => {
  it("seeds vLLM and encrypts its key on a fresh install", () => {
    vi.stubEnv("SESSION_SECRET", "test-secret");
    vi.stubEnv("VLLM_API_KEY", "private-vllm-key");
    vi.stubEnv("VLLM_BASE_URL", "http://gpu.local:8000/v1");
    vi.stubEnv("VLLM_TOOL_CALLING", "1");
    const database = memoryDatabase();
    ensureDatabaseSchema(database);
    const provider = database.prepare("SELECT * FROM providers").get();
    expect(provider).toMatchObject({ id: "vllm", kind: "vllm", enabled: 1, max_concurrent: 32, tools_enabled: 1, base_url: "http://gpu.local:8000/v1" });
    expect(JSON.stringify(provider)).not.toContain("private-vllm-key");
  });

  it("retires all Ollama providers once, preserving history and existing vLLM settings", () => {
    const database = memoryDatabase();
    ensureDatabaseSchema(database);
    database.exec(`
      DELETE FROM app_settings WHERE key = 'vllm_runtime_migration_v1';
      INSERT INTO providers (id, kind, base_url) VALUES ('ollama', 'ollama', 'http://old:11434'), ('old-gpu', 'ollama', 'http://other:11434');
      UPDATE providers SET base_url = 'http://existing:8000', max_concurrent = 7, tools_enabled = 1, fallback_id = 'old-gpu' WHERE id = 'vllm';
      INSERT INTO models (name, backend, is_enabled) VALUES ('old:model', 'old-gpu', 1);
      INSERT INTO app_settings (key, value) VALUES ('default_model', 'old:model');
      INSERT INTO users (id, username, password_hash) VALUES ('user', 'user', 'hash');
      INSERT INTO conversations (id, user_id, model) VALUES ('chat', 'user', 'old:model');
      INSERT INTO messages (id, conversation_id, role, content) VALUES ('msg', 'chat', 'assistant', 'Keep this reply');
    `);
    ensureDatabaseSchema(database);
    expect(database.prepare("SELECT enabled FROM providers WHERE kind = 'ollama'").all()).toEqual([{ enabled: 0 }, { enabled: 0 }]);
    expect(database.prepare("SELECT is_enabled FROM models WHERE name = 'old:model'").get()).toEqual({ is_enabled: 0 });
    expect(database.prepare("SELECT * FROM app_settings WHERE key = 'default_model'").get()).toBeUndefined();
    expect(database.prepare("SELECT model FROM conversations WHERE id = 'chat'").get()).toEqual({ model: "old:model" });
    expect(database.prepare("SELECT content FROM messages WHERE id = 'msg'").get()).toEqual({ content: "Keep this reply" });
    expect(database.prepare("SELECT base_url, max_concurrent, tools_enabled, fallback_id FROM providers WHERE id = 'vllm'").get()).toEqual({ base_url: "http://existing:8000", max_concurrent: 7, tools_enabled: 1, fallback_id: null });
    database.exec("UPDATE providers SET enabled = 0 WHERE id = 'vllm'");
    ensureDatabaseSchema(database);
    expect(database.prepare("SELECT enabled FROM providers WHERE id = 'vllm'").get()).toEqual({ enabled: 0 });
  });
  it("creates the Phase 0 schema on a fresh database", () => {
    const database = memoryDatabase();
    ensureDatabaseSchema(database);

    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN ('providers', 'jobs', 'models', 'search_quota')`,
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name).sort()).toEqual([
      "jobs",
      "models",
      "providers",
      "search_quota",
    ]);
    const usageColumns = database
      .prepare(`PRAGMA table_info(usage_events)`)
      .all() as Array<{ name: string }>;
    expect(usageColumns.map((column) => column.name)).toContain("tool_trace");
    const messageColumns = database
      .prepare(`PRAGMA table_info(messages)`)
      .all() as Array<{ name: string }>;
    expect(messageColumns.map((column) => column.name)).toContain("tool_trace");
  });

  it("upgrades the legacy constrained model table without losing rows", () => {
    const database = memoryDatabase();
    database.exec(`
      CREATE TABLE models (
        name TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 0,
        display_name TEXT,
        backend TEXT NOT NULL DEFAULT 'ollama'
          CHECK (backend IN ('ollama', 'vllm')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO models (name, is_enabled, backend)
      VALUES ('gemma3:4b', 1, 'ollama');
    `);

    ensureDatabaseSchema(database);

    const model = database
      .prepare(`SELECT name, backend, kind, tts FROM models`)
      .get() as { name: string; backend: string; kind: string; tts: number };
    expect(model).toEqual({
      name: "gemma3:4b",
      backend: "ollama",
      kind: "chat",
      tts: 0,
    });
    const table = database
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'models'`,
      )
      .get() as { sql: string };
    expect(table.sql).not.toMatch(/backend\s+IN/i);
    expect(() =>
      database
        .prepare(`UPDATE models SET backend = 'gpu-2' WHERE name = 'gemma3:4b'`)
        .run(),
    ).not.toThrow();
  });
});
