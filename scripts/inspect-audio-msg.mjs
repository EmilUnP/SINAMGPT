import Database from "better-sqlite3";

const db = new Database("data/owngpt.db", { readonly: true });
const rows = db
  .prepare(
    `SELECT id, role, substr(content, 1, 100) AS c, attachments, created_at
     FROM messages
     WHERE attachments IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 8`,
  )
  .all();
console.log(JSON.stringify(rows, null, 2));
