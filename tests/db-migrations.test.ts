import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDatabaseSchema } from "@/lib/db";

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const memoryDatabase = () => {
  const database = new Database(":memory:");
  databases.push(database);
  return database;
};

describe("database migrations", () => {
  it("creates the Phase 0 schema on a fresh database", () => {
    const database = memoryDatabase();
    ensureDatabaseSchema(database);

    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN ('providers', 'jobs', 'models')`,
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name).sort()).toEqual([
      "jobs",
      "models",
      "providers",
    ]);
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
