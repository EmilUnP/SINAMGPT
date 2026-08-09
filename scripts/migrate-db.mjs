import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "owngpt.db");
if (!fs.existsSync(dbPath)) {
  console.error("No database at", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

const hasColumn = (table, column) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
};

const ensureColumn = (table, column, ddl) => {
  if (hasColumn(table, column)) {
    console.log(`ok  ${table}.${column}`);
    return;
  }
  db.exec(ddl);
  console.log(`add ${table}.${column}`);
};

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

ensureColumn(
  "conversations",
  "project_id",
  `ALTER TABLE conversations ADD COLUMN project_id TEXT`,
);
ensureColumn(
  "conversations",
  "share_token",
  `ALTER TABLE conversations ADD COLUMN share_token TEXT`,
);
ensureColumn(
  "conversations",
  "is_pinned",
  `ALTER TABLE conversations ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`,
);
ensureColumn(
  "messages",
  "sources",
  `ALTER TABLE messages ADD COLUMN sources TEXT`,
);

const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_docs'`)
  .get();
if (tables) {
  ensureColumn(
    "knowledge_docs",
    "project_id",
    `ALTER TABLE knowledge_docs ADD COLUMN project_id TEXT`,
  );
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_conversations_project
    ON conversations(project_id, updated_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_share_token
    ON conversations(share_token)
    WHERE share_token IS NOT NULL;
`);

console.log(
  "conversations columns:",
  db
    .prepare("PRAGMA table_info(conversations)")
    .all()
    .map((c) => c.name)
    .join(", "),
);
db.close();
