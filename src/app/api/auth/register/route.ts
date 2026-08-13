import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { hashPassword, markActive, newId, setSessionCookie } from "@/lib/auth";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";
import { getRegistrationEnabledSetting } from "@/lib/settings";

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username is too long")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, . _ - only"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const ipLimit = takeRateLimit(`register:ip:${ip}`, 8, 60 * 60 * 1000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many registration attempts. Try again later." },
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
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { username, password } = parsed.data;
    const adminName = (process.env.ADMIN_USERNAME || "admin").trim();

    if (username.toLowerCase() === adminName.toLowerCase()) {
      return NextResponse.json(
        { error: "This username is reserved" },
        { status: 400 },
      );
    }

    const db = getDb();

    const existing = db
      .prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`)
      .get(username);

    if (existing) {
      return NextResponse.json(
        { error: "Username already taken" },
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
      { error: "Could not create account" },
      { status: 500 },
    );
  }
}
