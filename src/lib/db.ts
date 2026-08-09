import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "owngpt.db");

let db: Database.Database | null = null;

const hasColumn = (database: Database.Database, table: string, column: string) => {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return cols.some((c) => c.name === column);
};

const ensureSchema = (database: Database.Database) => {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_at TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New chat',
      model TEXT NOT NULL,
      project_id TEXT,
      share_token TEXT UNIQUE,
      is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      sources TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_user
      ON conversations(user_id, is_pinned DESC, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      name TEXT PRIMARY KEY,
      is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
      display_name TEXT,
      backend TEXT NOT NULL DEFAULT 'ollama' CHECK (backend IN ('ollama', 'vllm')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK (source IN ('user', 'guest')),
      user_id TEXT,
      username TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_preview TEXT NOT NULL DEFAULT '',
      prompt_chars INTEGER NOT NULL DEFAULT 0,
      response_chars INTEGER NOT NULL DEFAULT 0,
      ttft_ms INTEGER,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      tokens_eval INTEGER,
      tokens_prompt INTEGER,
      tokens_per_sec REAL,
      status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'aborted')),
      error_message TEXT,
      conversation_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_usage_events_created
      ON usage_events(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_usage_events_model
      ON usage_events(model, created_at DESC);

    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL CHECK (
        category IN ('company', 'project', 'product', 'faq', 'other')
      ),
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      project_id TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
      priority INTEGER NOT NULL DEFAULT 50,
      always_include INTEGER NOT NULL DEFAULT 0 CHECK (always_include IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_enabled
      ON knowledge_docs(is_enabled, priority DESC);

    CREATE INDEX IF NOT EXISTS idx_conversations_project
      ON conversations(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS guardrail_events (
      id TEXT PRIMARY KEY,
      audience TEXT NOT NULL,
      decision TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      user_id TEXT,
      prompt_preview TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      findings_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_guardrail_events_created
      ON guardrail_events(created_at DESC);

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_user_id TEXT,
      actor_username TEXT NOT NULL DEFAULT '',
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      meta_json TEXT NOT NULL DEFAULT '{}',
      ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_events_created
      ON audit_events(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_events_category
      ON audit_events(category, created_at DESC);
  `);

  // Seed guest defaults once (admin can change later)
  const guestLimit = database
    .prepare(`SELECT value FROM app_settings WHERE key = 'guest_daily_limit'`)
    .get() as { value: string } | undefined;
  if (!guestLimit) {
    database
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES ('guest_daily_limit', ?)`,
      )
      .run(process.env.GUEST_DAILY_LIMIT || "5");
  }
  const guestChars = database
    .prepare(
      `SELECT value FROM app_settings WHERE key = 'guest_max_message_chars'`,
    )
    .get() as { value: string } | undefined;
  if (!guestChars) {
    database
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES ('guest_max_message_chars', ?)`,
      )
      .run(process.env.GUEST_MAX_MESSAGE_CHARS || "2000");
  }

  // Migrate older DBs created before admin fields existed
  if (!hasColumn(database, "users", "role")) {
    database.exec(
      `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`,
    );
  }
  if (!hasColumn(database, "users", "is_active")) {
    database.exec(
      `ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`,
    );
  }
  if (!hasColumn(database, "users", "last_active_at")) {
    database.exec(`ALTER TABLE users ADD COLUMN last_active_at TEXT`);
  }
  if (!hasColumn(database, "models", "display_name")) {
    database.exec(`ALTER TABLE models ADD COLUMN display_name TEXT`);
  }
  if (!hasColumn(database, "conversations", "is_pinned")) {
    database.exec(
      `ALTER TABLE conversations ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!hasColumn(database, "models", "backend")) {
    database.exec(
      `ALTER TABLE models ADD COLUMN backend TEXT NOT NULL DEFAULT 'ollama'`,
    );
  }
  if (!hasColumn(database, "messages", "sources")) {
    database.exec(`ALTER TABLE messages ADD COLUMN sources TEXT`);
  }
  if (!hasColumn(database, "conversations", "project_id")) {
    database.exec(`ALTER TABLE conversations ADD COLUMN project_id TEXT`);
  }
  if (!hasColumn(database, "knowledge_docs", "project_id")) {
    database.exec(`ALTER TABLE knowledge_docs ADD COLUMN project_id TEXT`);
  }
  if (!hasColumn(database, "conversations", "share_token")) {
    database.exec(`ALTER TABLE conversations ADD COLUMN share_token TEXT`);
  }
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_share_token
     ON conversations(share_token)
     WHERE share_token IS NOT NULL`,
  );
};

const ensureAdminUser = (database: Database.Database) => {
  const username = (process.env.ADMIN_USERNAME || "admin").trim();
  const password = process.env.ADMIN_PASSWORD || "AdminChangeMe123!";

  if (!username || password.length < 6) {
    console.warn(
      "[OwnGPT] ADMIN_USERNAME / ADMIN_PASSWORD invalid — admin not seeded",
    );
    return;
  }

  const existing = database
    .prepare(
      `SELECT id, role FROM users WHERE username = ? COLLATE NOCASE`,
    )
    .get(username) as { id: string; role: string } | undefined;

  if (existing) {
    if (existing.role !== "admin") {
      database
        .prepare(
          `UPDATE users SET role = 'admin', is_active = 1 WHERE id = ?`,
        )
        .run(existing.id);
      console.log(`[OwnGPT] Promoted existing user "${username}" to admin`);
    }
    return;
  }

  const id = randomBytes(16).toString("hex");
  const passwordHash = bcrypt.hashSync(password, 10);

  database
    .prepare(
      `INSERT INTO users (id, username, password_hash, role, is_active, last_active_at)
       VALUES (?, ?, ?, 'admin', 1, datetime('now'))`,
    )
    .run(id, username, passwordHash);

  console.log(
    `[OwnGPT] Admin user created: username="${username}" (from ADMIN_USERNAME / ADMIN_PASSWORD)`,
  );
};

export const getDb = (): Database.Database => {
  if (!db) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    ensureSchema(db);
    ensureAdminUser(db);
    return db;
  }

  // Re-run on cached connections too (idempotent). Next.js HMR can keep an
  // older connection after new columns were added to ensureSchema.
  ensureSchema(db);
  return db;
};

export const touchUserActivity = (userId: string) => {
  getDb()
    .prepare(`UPDATE users SET last_active_at = datetime('now') WHERE id = ?`)
    .run(userId);
};
