import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { markActive, setSessionCookie, verifyPassword } from "@/lib/auth";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

const GENERIC_AUTH_ERROR = "Invalid username or password";

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const ipLimit = takeRateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        {
          error: "Too many login attempts. Try again later.",
          code: "rate_limited",
        },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSec) },
        },
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Username and password are required",
          code: "username_password_required",
        },
        { status: 400 },
      );
    }

    const { username, password } = parsed.data;
    const userLimit = takeRateLimit(
      `login:user:${username.toLowerCase()}`,
      10,
      15 * 60 * 1000,
    );
    if (!userLimit.ok) {
      return NextResponse.json(
        {
          error: "Too many login attempts. Try again later.",
          code: "rate_limited",
        },
        {
          status: 429,
          headers: { "Retry-After": String(userLimit.retryAfterSec) },
        },
      );
    }

    const user = getDb()
      .prepare(
        `SELECT id, username, password_hash, role, is_active
         FROM users WHERE username = ? COLLATE NOCASE`,
      )
      .get(username) as
      | {
          id: string;
          username: string;
          password_hash: string;
          role: "admin" | "user";
          is_active: number;
        }
      | undefined;

    // Same response for missing / disabled / wrong password (no account probing)
    if (!user || user.is_active !== 1) {
      return NextResponse.json(
        { error: GENERIC_AUTH_ERROR, code: "invalid_credentials" },
        { status: 401 },
      );
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: GENERIC_AUTH_ERROR, code: "invalid_credentials" },
        { status: 401 },
      );
    }

    markActive(user.id);
    await setSessionCookie(user.id, user.username, user.role);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("login error", error);
    return NextResponse.json(
      { error: "Could not log in", code: "login_failed" },
      { status: 500 },
    );
  }
}
