import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MailMessage } from "@/lib/mail";
import {
  consumeResetToken,
  createResetToken,
  hashResetToken,
  requestPasswordReset,
} from "@/lib/password-reset";

let database: Database.Database;

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  database
    .prepare(
      `INSERT INTO users (id, username, password_hash, is_active)
       VALUES ('u-mail', 'you@company.com', 'hash', 1),
              ('u-name', 'emil', 'hash', 1),
              ('u-off', 'off@company.com', 'hash', 0)`,
    )
    .run();
});

afterEach(() => database.close());

describe("password reset tokens", () => {
  it("stores a hash and consumes a valid token once", () => {
    const token = createResetToken("u-mail", database);
    expect(token.length).toBeGreaterThan(20);

    const stored = database
      .prepare(`SELECT token_hash, used_at FROM password_reset_tokens WHERE user_id = 'u-mail'`)
      .get() as { token_hash: string; used_at: string | null };
    expect(stored.token_hash).toBe(hashResetToken(token));
    expect(stored.used_at).toBeNull();

    expect(consumeResetToken(token, database)).toBe("u-mail");
    expect(consumeResetToken(token, database)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createResetToken("u-mail", database);
    database
      .prepare(
        `UPDATE password_reset_tokens SET expires_at = datetime('now', '-1 minute')`,
      )
      .run();
    expect(consumeResetToken(token, database)).toBeNull();
  });
});

describe("requestPasswordReset", () => {
  it("reports missing, username-only, and email accounts separately", async () => {
    const send = vi.fn<(message: MailMessage) => Promise<void>>(
      async () => undefined,
    );

    expect(
      await requestPasswordReset("emil", "http://localhost:3055", {
        db: database,
        send,
      }),
    ).toEqual({ status: "no_email" });
    expect(
      await requestPasswordReset("missing@company.com", "http://localhost:3055", {
        db: database,
        send,
      }),
    ).toEqual({ status: "not_found" });
    expect(
      await requestPasswordReset("off@company.com", "http://localhost:3055", {
        db: database,
        send,
      }),
    ).toEqual({ status: "not_found" });
    expect(send).not.toHaveBeenCalled();

    expect(
      await requestPasswordReset("you@company.com", "http://localhost:3055", {
        db: database,
        send,
      }),
    ).toEqual({ status: "sent" });
    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0][0];
    expect(payload.to).toBe("you@company.com");
    expect(payload.text).toContain("http://localhost:3055/reset-password?token=");
  });
});
