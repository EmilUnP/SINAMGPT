import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ACCOUNT_NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  parseAccountName,
  type AccountNameIssue,
} from "@/lib/account-name";
import { getDb } from "@/lib/db";
import { hashPassword, markActive, newId, setSessionCookie } from "@/lib/auth";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import { getRegistrationEnabledSetting } from "@/lib/settings";

const ISSUE_RESPONSE: Record<
  AccountNameIssue,
  { code: string; error: string }
> = {
  empty: {
    code: "username_required",
    error: "Enter a username or email address",
  },
  min: {
    code: "username_min",
    error: "Username must be at least 3 characters",
  },
  max: {
    code: "username_max",
    error: "Username is too long",
  },
  chars: {
    code: "username_chars",
    error: "Use letters, numbers, . _ - only",
  },
  email: {
    code: "username_email",
    error: "Enter a valid email address",
  },
};

const schema = z.object({
  username: z.string().max(ACCOUNT_NAME_MAX + 8),
  password: z
    .string()
    .min(PASSWORD_MIN, "password_min")
    .max(PASSWORD_MAX, "password_max"),
});

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const ipLimit = takeRateLimit(`register:ip:${ip}`, 8, 60 * 60 * 1000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        {
          error: "Too many registration attempts. Try again later.",
          code: "rate_limited",
        },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSec) },
        },
      );
    }

    if (!getRegistrationEnabledSetting()) {
      return NextResponse.json(
        {
          error:
            "New account registration is currently closed. Ask an admin to open it, or sign in if you already have an account.",
          code: "registration_closed",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const passwordIssue = parsed.error.issues.find((issue) =>
        issue.path.includes("password"),
      );
      if (passwordIssue?.message === "password_min") {
        return NextResponse.json(
          {
            error: "Password must be at least 6 characters",
            code: "password_min",
          },
          { status: 400 },
        );
      }
      if (passwordIssue?.message === "password_max") {
        return NextResponse.json(
          {
            error: "Password is too long",
            code: "password_max",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Invalid input", code: "invalid_input" },
        { status: 400 },
      );
    }

    const account = parseAccountName(parsed.data.username);
    if (!account.ok) {
      return NextResponse.json(ISSUE_RESPONSE[account.issue], { status: 400 });
    }

    const { value: username } = account;
    const { password } = parsed.data;
    const adminName = (process.env.ADMIN_USERNAME || "admin").trim();

    if (username.toLowerCase() === adminName.toLowerCase()) {
      return NextResponse.json(
        { error: "This username is reserved", code: "username_reserved" },
        { status: 400 },
      );
    }

    const db = getDb();

    const existing = db
      .prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`)
      .get(username);

    if (existing) {
      return NextResponse.json(
        { error: "Username already taken", code: "username_taken" },
        { status: 409 },
      );
    }

    const id = newId();
    const passwordHash = await hashPassword(password);

    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, is_active, last_active_at)
       VALUES (?, ?, ?, 'user', 1, datetime('now'))`,
    ).run(id, username, passwordHash);

    markActive(id);
    await setSessionCookie(id, username, "user");

    return NextResponse.json({
      user: { id, username, role: "user" },
    });
  } catch (error) {
    console.error("register error", error);
    return NextResponse.json(
      { error: "Could not create account", code: "create_failed" },
      { status: 500 },
    );
  }
}
