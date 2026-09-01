import { createHash, randomBytes } from "crypto";
import type Database from "better-sqlite3";
import {
  parseAccountName,
  type AccountNameIssue,
} from "@/lib/account-name";
import { getDb } from "@/lib/db";

type ResetUser = {
  id: string;
  username: string;
  is_active: number;
};

export const hashResetToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const createResetToken = (
  userId: string,
  db: Database.Database = getDb(),
): string => {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    `UPDATE password_reset_tokens
     SET used_at = datetime('now')
     WHERE user_id = ? AND used_at IS NULL`,
  ).run(userId);
  db.prepare(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, datetime('now', '+1 hour'))`,
  ).run(randomBytes(16).toString("hex"), userId, hashResetToken(token));
  return token;
};

export const consumeResetToken = (
  token: string,
  db: Database.Database = getDb(),
): string | null => {
  if (!token || token.length < 16 || token.length > 128) return null;

  const row = db
    .prepare(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = ?
         AND used_at IS NULL
         AND expires_at > datetime('now')`,
    )
    .get(hashResetToken(token)) as { id: string; user_id: string } | undefined;

  if (!row) return null;

  db.prepare(
    `UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`,
  ).run(row.id);
  return row.user_id;
};

export type PasswordResetRequestResult =
  | { status: "ready"; resetUrl: string }
  | { status: "not_found" }
  | { status: "no_email" }
  | { status: "invalid"; issue: AccountNameIssue };

export const requestPasswordReset = (
  identifier: string,
  origin: string,
  options?: { db?: Database.Database },
): PasswordResetRequestResult => {
  const account = parseAccountName(identifier);
  if (!account.ok) return { status: "invalid", issue: account.issue };

  const db = options?.db ?? getDb();
  const user = db
    .prepare(
      `SELECT id, username, is_active
       FROM users WHERE username = ? COLLATE NOCASE`,
    )
    .get(account.value) as ResetUser | undefined;

  if (!user || user.is_active !== 1) {
    return { status: "not_found" };
  }

  if (!user.username.includes("@")) {
    return { status: "no_email" };
  }

  const token = createResetToken(user.id, db);
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  return { status: "ready", resetUrl };
};
